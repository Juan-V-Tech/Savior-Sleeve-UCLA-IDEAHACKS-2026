import { useCallback, useEffect, useRef, useState } from 'react'

const BAUD_RATE = 115200
const HISTORY_LEN = 240
const ADC_MAX = 4095
const MAX_BPM = 220

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

function parseTaggedLine(line) {
  const segments = line.split(',')
  const values = {}

  for (const segment of segments) {
    const [rawKey, rawValue] = segment.split(':')
    if (!rawKey || rawValue === undefined) {
      continue
    }

    values[rawKey.trim().toLowerCase()] = rawValue.trim()
  }

  if (!('bpm' in values) || !('rubber' in values) || !('force' in values)) {
    return null
  }

  const pulse = values.pulse !== undefined ? Number(values.pulse) : null
  const bpm = Number(values.bpm)
  const rubber = Number(values.rubber)
  const force = Number(values.force)
  const beat = values.beat !== undefined ? Number(values.beat) : null

  if ([bpm, rubber, force].some((value) => Number.isNaN(value))) {
    return null
  }

  if ((pulse !== null && Number.isNaN(pulse)) || (beat !== null && Number.isNaN(beat))) {
    return null
  }

  return {
    pulse: pulse === null ? null : clamp(Math.round(pulse), 0, ADC_MAX),
    bpm: clamp(Math.round(bpm), 0, MAX_BPM),
    rubber: clamp(Math.round(rubber), 0, ADC_MAX),
    force: clamp(Math.round(force), 0, ADC_MAX),
    beat: beat === null ? null : beat > 0,
  }
}

function CombinedSensorsSerialPanel() {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const dprRef = useRef(1)

  const pulseHistoryRef = useRef(new Array(HISTORY_LEN).fill(0))
  const rubberHistoryRef = useRef(new Array(HISTORY_LEN).fill(0))
  const forceHistoryRef = useRef(new Array(HISTORY_LEN).fill(0))

  const portRef = useRef(null)
  const readerRef = useRef(null)
  const runningRef = useRef(false)

  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('Disconnected')
  const [pulse, setPulse] = useState(null)
  const [bpm, setBpm] = useState(null)
  const [rubber, setRubber] = useState(null)
  const [force, setForce] = useState(null)
  const [beat, setBeat] = useState(false)
  const [rawLine, setRawLine] = useState('waiting...')
  const [errorMsg, setErrorMsg] = useState('')

  const drawSeries = useCallback((ctx, width, height, history, color) => {
    const xStep = width / (HISTORY_LEN - 1)
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 2

    for (let i = 0; i < HISTORY_LEN; i += 1) {
      const x = i * xStep
      const normalized = history[i] / ADC_MAX
      const y = height - normalized * height

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.stroke()
  }, [])

  const drawWave = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    const dpr = dprRef.current

    if (!canvas || !ctx) {
      return
    }

    const width = canvas.width / dpr
    const height = canvas.height / dpr

    ctx.fillStyle = '#eff6f9'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = '#d3e2e8'
    ctx.lineWidth = 1
    for (let row = 1; row < 4; row += 1) {
      const y = (height / 4) * row
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    drawSeries(ctx, width, height, pulseHistoryRef.current, '#f26342')
    drawSeries(ctx, width, height, rubberHistoryRef.current, '#8f5b15')
    drawSeries(ctx, width, height, forceHistoryRef.current, '#007f8a')
  }, [drawSeries])

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctxRef.current = ctx

    drawWave()
  }, [drawWave])

  const disconnectFromSerial = useCallback(async () => {
    runningRef.current = false

    if (readerRef.current) {
      try {
        await readerRef.current.cancel()
      } catch {
        // Reader can already be closed when device disconnects.
      }

      try {
        readerRef.current.releaseLock()
      } catch {
        // Ignore if lock was already released.
      }

      readerRef.current = null
    }

    if (portRef.current) {
      try {
        await portRef.current.close()
      } catch {
        // Ignore close errors when browser already closed the port.
      }

      portRef.current = null
    }

    setConnected(false)
    setStatus('Disconnected')
  }, [])

  const parseLine = useCallback(
    (line) => {
      setRawLine(line)

      const beatLineMatch = line.match(/Heartbeat\s+Detected!\s*BPM\s*:\s*(-?\d+)/i)
      if (beatLineMatch) {
        const heartbeatBpm = Number(beatLineMatch[1])
        if (!Number.isNaN(heartbeatBpm)) {
          setBpm(clamp(Math.round(heartbeatBpm), 0, MAX_BPM))
          setBeat(true)
        }
        return
      }

      const parsed = parseTaggedLine(line)
      if (!parsed) {
        return
      }

      setPulse(parsed.pulse)
      setBpm(parsed.bpm > 0 ? parsed.bpm : null)
      setRubber(parsed.rubber)
      setForce(parsed.force)
      setBeat(parsed.beat ?? false)

      pulseHistoryRef.current.shift()
      pulseHistoryRef.current.push(parsed.pulse ?? 0)

      rubberHistoryRef.current.shift()
      rubberHistoryRef.current.push(parsed.rubber)

      forceHistoryRef.current.shift()
      forceHistoryRef.current.push(parsed.force)

      drawWave()
    },
    [drawWave],
  )

  const connectToSerial = useCallback(async () => {
    setErrorMsg('')

    if (!('serial' in navigator)) {
      setStatus('Web Serial unsupported')
      setErrorMsg('This browser/device does not support Web Serial. Use Chrome or Edge on desktop over HTTPS or localhost.')
      return
    }

    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: BAUD_RATE })

      portRef.current = port
      setConnected(true)
      setStatus('Connected')
      setBeat(false)

      pulseHistoryRef.current = new Array(HISTORY_LEN).fill(0)
      rubberHistoryRef.current = new Array(HISTORY_LEN).fill(0)
      forceHistoryRef.current = new Array(HISTORY_LEN).fill(0)
      drawWave()

      runningRef.current = true

      const decoder = new TextDecoderStream()
      port.readable.pipeTo(decoder.writable).catch(() => {
        // Ignore stream errors after disconnect/cancel.
      })

      const reader = decoder.readable.getReader()
      readerRef.current = reader

      let buffer = ''
      while (runningRef.current) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }

        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          parseLine(line.trim())
        }
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to connect to serial device')
    } finally {
      await disconnectFromSerial()
    }
  }, [disconnectFromSerial, drawWave, parseLine])

  const handleConnectToggle = useCallback(async () => {
    if (connected) {
      await disconnectFromSerial()
      return
    }

    await connectToSerial()
  }, [connected, connectToSerial, disconnectFromSerial])

  useEffect(() => {
    initCanvas()

    const onResize = () => {
      initCanvas()
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [initCanvas])

  useEffect(() => {
    return () => {
      disconnectFromSerial()
    }
  }, [disconnectFromSerial])

  return (
    <section className="section serial-panel multi-panel" id="multi-device-integration">
      <div className="section-header-row serial-head">
        <div>
          <h2>Live Combined Sensor Integration</h2>
          <p>Single ESP32 stream for BPM, Rubber, and Force in one view.</p>
        </div>
        <button type="button" className="serial-button multi-button" onClick={handleConnectToggle}>
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      <div className="serial-status-row multi-status-row">
        <span className={`serial-dot ${connected ? 'on' : ''}`} aria-hidden="true"></span>
        <strong>{status}</strong>
        <span className={`multi-beat-chip ${beat ? 'active' : ''}`}>{beat ? 'Beat Detected' : 'No Beat'}</span>
      </div>

      <canvas ref={canvasRef} className="serial-canvas multi-canvas" aria-label="Live combined waveform"></canvas>

      <ul className="multi-legend" aria-label="Combined chart legend">
        <li><span className="dot pulse"></span>Pulse</li>
        <li><span className="dot rubber"></span>Rubber</li>
        <li><span className="dot force"></span>Force</li>
      </ul>

      <div className="serial-vars multi-vars">
        <article className="serial-var multi-pulse">
          <h3>Pulse (if sent)</h3>
          <p>{pulse ?? '-'}</p>
        </article>

        <article className="serial-var multi-bpm">
          <h3>BPM</h3>
          <p>{bpm ?? '-'}</p>
        </article>

        <article className="serial-var multi-rubber">
          <h3>Rubber</h3>
          <p>{rubber ?? '-'}</p>
        </article>

        <article className="serial-var multi-force">
          <h3>Force</h3>
          <p>{force ?? '-'}</p>
        </article>

        <article className="serial-var multi-beat">
          <h3>Beat Flag</h3>
          <p>{beat ? '1000' : '0'}</p>
        </article>
      </div>

      <div className="serial-raw-box">
        <small>Raw Serial</small>
        <p>{rawLine}</p>
      </div>

      {errorMsg ? <p className="serial-error">{errorMsg}</p> : null}
    </section>
  )
}

export default CombinedSensorsSerialPanel

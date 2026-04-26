import { useCallback, useEffect, useRef, useState } from 'react'

const BAUD_RATE = 115200
const HISTORY_LEN = 240
const MIN_FORCE = 0
const MAX_FORCE = 4095
const FORCE_STRONG_THRESHOLD = 400

function historyBounds(history, minSpan = 16, paddingRatio = 0.18) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const value of history) {
    if (!Number.isFinite(value)) {
      continue
    }

    if (value < min) {
      min = value
    }
    if (value > max) {
      max = value
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: MIN_FORCE, max: MIN_FORCE + minSpan }
  }

  const span = Math.max(max - min, minSpan)
  const center = (min + max) / 2
  const paddedSpan = span * (1 + paddingRatio * 2)

  let nextMin = center - paddedSpan / 2
  let nextMax = center + paddedSpan / 2

  nextMin = Math.max(MIN_FORCE, nextMin)
  nextMax = Math.min(MAX_FORCE, nextMax)

  if (nextMax - nextMin < 1) {
    nextMax = Math.min(MAX_FORCE, nextMin + 1)
  }

  return { min: nextMin, max: nextMax }
}

function describeForce(value) {
  if (value < 50) {
    return 'Weak'
  }
  if (value < 200) {
    return 'Improving'
  }
  if (value < 400) {
    return 'Average'
  }
  return 'Strong'
}

function parseForceLine(line) {
  const taggedMatch = line.match(/(?:^|,)\s*Force\s*:\s*(-?\d+)/i)
  if (taggedMatch) {
    const value = Number(taggedMatch[1])
    if (Number.isNaN(value)) {
      return null
    }

    const boundedValue = Math.max(MIN_FORCE, Math.min(value, MAX_FORCE))
    return { value: boundedValue, level: describeForce(boundedValue) }
  }

  const match = line.match(/The force sensor value\s*=\s*(\d+)(?:\s*->\s*(.+))?/i)
  if (!match) {
    return null
  }

  const value = Number(match[1])
  if (Number.isNaN(value)) {
    return null
  }

  const boundedValue = Math.max(MIN_FORCE, Math.min(value, MAX_FORCE))
  const level = match[2]?.trim() || describeForce(boundedValue)
  return { value: boundedValue, level }
}

function ForceSensorSerialPanel() {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const dprRef = useRef(1)
  const historyRef = useRef(new Array(HISTORY_LEN).fill(0))
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const runningRef = useRef(false)

  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('Disconnected')
  const [rawForce, setRawForce] = useState(null)
  const [pressurePercent, setPressurePercent] = useState(null)
  const [pressureLevel, setPressureLevel] = useState('Waiting for data')
  const [peakForce, setPeakForce] = useState(0)
  const [rawLine, setRawLine] = useState('waiting...')
  const [errorMsg, setErrorMsg] = useState('')

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

    const history = historyRef.current
    const xScale = width / (HISTORY_LEN - 1)
    const bounds = historyBounds(history, 18)
    const range = Math.max(bounds.max - bounds.min, 1)

    ctx.strokeStyle = '#007f8a'
    ctx.lineWidth = 2
    ctx.beginPath()

    for (let i = 0; i < HISTORY_LEN; i += 1) {
      const x = i * xScale
      const normalized = (history[i] - bounds.min) / range
      const clamped = Math.max(0, Math.min(normalized, 1))
      const y = height - clamped * height

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.stroke()
  }, [])

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

      const parsed = parseForceLine(line)
      if (!parsed) {
        return
      }

      const { value, level } = parsed
      const nextPercent = Math.round(Math.min(value / FORCE_STRONG_THRESHOLD, 1) * 100)

      setRawForce(value)
      setPressurePercent(nextPercent)
      setPressureLevel(level)
      setPeakForce((prev) => Math.max(prev, value))

      const history = historyRef.current
      history.shift()
      history.push(value)

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
      setPeakForce(0)
      setPressureLevel('Connected, waiting for sensor line...')
      historyRef.current = new Array(HISTORY_LEN).fill(0)
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
    <section className="section serial-panel force-panel" id="force-device-integration">
      <div className="section-header-row serial-head">
        <div>
          <h2>Live Therapy Force Feed</h2>
          <p>Connect ESP32 over Web Serial to stream pressure value, level, and rehab trend.</p>
        </div>
        <button type="button" className="serial-button force-button" onClick={handleConnectToggle}>
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      <div className="serial-status-row force-status-row">
        <span className={`serial-dot ${connected ? 'on' : ''}`} aria-hidden="true"></span>
        <strong>{status}</strong>
        <span className="force-level-chip">{pressureLevel}</span>
      </div>

      <canvas ref={canvasRef} className="serial-canvas force-canvas" aria-label="Live force waveform"></canvas>

      <div className="serial-vars force-vars">
        <article className="serial-var force-raw">
          <h3>Raw Force (0-4095)</h3>
          <p>{rawForce ?? '-'}</p>
        </article>

        <article className="serial-var force-percent">
          <h3>Pressure (%)</h3>
          <p>{pressurePercent ?? '-'}</p>
        </article>

        <article className="serial-var force-peak">
          <h3>Peak Force</h3>
          <p>{peakForce}</p>
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

export default ForceSensorSerialPanel

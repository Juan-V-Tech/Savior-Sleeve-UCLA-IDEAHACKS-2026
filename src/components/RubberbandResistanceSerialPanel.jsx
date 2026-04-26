import { useCallback, useEffect, useRef, useState } from 'react'

const BAUD_RATE = 115200
const ADC_MAX = 4095
const RESISTANCE_HIGH_TARGET = 1000
const HISTORY_LEN = 180
const CHANGE_NOISE_THRESHOLD = 2
const STALE_LIMIT = 6

function parseRubberbandLine(line) {
  const taggedMatch = line.match(/(?:^|,)\s*Rubber\s*:\s*(-?\d+)/i)
  if (taggedMatch) {
    const taggedValue = Number(taggedMatch[1])
    if (!Number.isNaN(taggedValue)) {
      return Math.max(0, Math.min(Math.round(taggedValue), ADC_MAX))
    }
  }

  const match = line.match(/(?:Analog reading|Value)\s*[:=]?\s*(-?\d+)/i)
  if (!match) {
    const rawNumber = Number(line)
    if (Number.isNaN(rawNumber)) {
      return null
    }

    return Math.max(0, Math.min(Math.round(rawNumber), ADC_MAX))
  }

  const analogValue = Number(match[1])
  if (Number.isNaN(analogValue)) {
    return null
  }

  return Math.max(0, Math.min(analogValue, ADC_MAX))
}

function describeResistance(value) {
  if (value < 500) {
    return 'Idle'
  }
  if (value < 800) {
    return 'Building'
  }
  if (value <= 1000) {
    return 'High'
  }
  return 'Very high'
}

function RubberbandResistanceSerialPanel() {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const dprRef = useRef(1)
  const historyRef = useRef(new Array(HISTORY_LEN).fill(0))
  const previousAnalogRef = useRef(null)
  const stagnantCountRef = useRef(0)
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const runningRef = useRef(false)

  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('Disconnected')
  const [analogReading, setAnalogReading] = useState(null)
  const [resistanceOhms, setResistanceOhms] = useState(null)
  const [resistanceRom, setResistanceRom] = useState(null)
  const [analogDelta, setAnalogDelta] = useState(null)
  const [peakResistance, setPeakResistance] = useState(0)
  const [resistanceLevel, setResistanceLevel] = useState('Waiting for data')
  const [streamHealth, setStreamHealth] = useState('Waiting for first reading')
  const [streamHealthTone, setStreamHealthTone] = useState('idle')
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

    ctx.strokeStyle = '#8f5b15'
    ctx.lineWidth = 2
    ctx.beginPath()

    for (let i = 0; i < HISTORY_LEN; i += 1) {
      const x = i * xScale
      const normalized = Math.max(0, Math.min(history[i], ADC_MAX)) / ADC_MAX
      const y = height - normalized * height

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

      const parsedReading = parseRubberbandLine(line)
      if (parsedReading === null) {
        return
      }

      const resistancePercent = Math.round((Math.min(parsedReading, RESISTANCE_HIGH_TARGET) / RESISTANCE_HIGH_TARGET) * 100)
      const previous = previousAnalogRef.current
      const delta = previous === null ? 0 : parsedReading - previous

      if (Math.abs(delta) <= CHANGE_NOISE_THRESHOLD) {
        stagnantCountRef.current += 1
      } else {
        stagnantCountRef.current = 0
      }

      if (previous === null) {
        setStreamHealth('First reading received')
        setStreamHealthTone('idle')
      } else if (stagnantCountRef.current >= STALE_LIMIT) {
        setStreamHealth('No change detected (check pin/wiring/stretch)')
        setStreamHealthTone('warn')
      } else if (Math.abs(delta) <= CHANGE_NOISE_THRESHOLD) {
        setStreamHealth('Low movement')
        setStreamHealthTone('idle')
      } else {
        setStreamHealth('Signal changing')
        setStreamHealthTone('good')
      }

      previousAnalogRef.current = parsedReading

      setAnalogReading(parsedReading)
      setAnalogDelta(delta)
      setResistanceOhms(parsedReading)
      setResistanceRom(resistancePercent)
      setPeakResistance((prev) => Math.max(prev, parsedReading))
      setResistanceLevel(describeResistance(parsedReading))

      const history = historyRef.current
      history.shift()
      history.push(parsedReading)

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
      setPeakResistance(0)
      setAnalogDelta(null)
      setResistanceLevel('Connected, waiting for analog line...')
      setStreamHealth('Connected, waiting for analog line...')
      setStreamHealthTone('idle')
      previousAnalogRef.current = null
      stagnantCountRef.current = 0
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
    <section className="section serial-panel rubber-panel" id="rubberband-device-integration">
      <div className="section-header-row serial-head">
        <div>
          <h2>Live Rubberband Resistance Integration</h2>
          <p>Connect over Web Serial and confirm Analog Reading changes as you stretch the band.</p>
        </div>
        <button type="button" className="serial-button rubber-button" onClick={handleConnectToggle}>
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      <div className="serial-status-row rubber-status-row">
        <span className={`serial-dot ${connected ? 'on' : ''}`} aria-hidden="true"></span>
        <strong>{status}</strong>
        <span className="rubber-level-chip">{resistanceLevel}</span>
      </div>

      <canvas ref={canvasRef} className="serial-canvas rubber-canvas" aria-label="Live resistance waveform"></canvas>

      <div className="serial-vars rubber-vars">
        <article className="serial-var rubber-analog">
          <h3>Analog Reading</h3>
          <p>{analogReading ?? '-'}</p>
        </article>

        <article className="serial-var rubber-delta">
          <h3>Analog Delta</h3>
          <p>{analogDelta ?? '-'}</p>
        </article>

        <article className="serial-var rubber-ohms">
          <h3>Resistance Reading</h3>
          <p>{resistanceOhms ?? '-'}</p>
        </article>

        <article className="serial-var rubber-rom">
          <h3>Range to High (%)</h3>
          <p>{resistanceRom ?? '-'}</p>
        </article>

        <article className="serial-var rubber-peak">
          <h3>Peak Resistance</h3>
          <p>{peakResistance}</p>
        </article>

        <article className="serial-var rubber-health">
          <h3>Signal Health</h3>
          <p className={`rubber-health-text ${streamHealthTone}`}>{streamHealth}</p>
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

export default RubberbandResistanceSerialPanel

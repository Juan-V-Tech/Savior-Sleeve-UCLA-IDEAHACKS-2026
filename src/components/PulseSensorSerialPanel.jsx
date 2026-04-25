import { useCallback, useEffect, useRef, useState } from 'react'

const BAUD_RATE = 115200
const HISTORY_LEN = 600
const BASELINE = 2048
const MAX_BPM = 210
const MAX_BPM_STEP = 8
const BPM_SMOOTHING_ALPHA = 0.35

function PulseSensorSerialPanel() {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const dprRef = useRef(1)
  const historyRef = useRef(new Array(HISTORY_LEN).fill(BASELINE))
  const smoothedBpmRef = useRef(null)
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const runningRef = useRef(false)

  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('Disconnected')
  const [signal, setSignal] = useState(null)
  const [bpm, setBpm] = useState(null)
  const [ibi, setIbi] = useState(null)
  const [rawLine, setRawLine] = useState('waiting...')
  const [errorMsg, setErrorMsg] = useState('')

  const drawWave = useCallback((min, max) => {
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

    const range = Math.max(max - min, 1)
    const scale = height / 2 / range

    ctx.strokeStyle = '#f26342'
    ctx.lineWidth = 2
    ctx.beginPath()

    const history = historyRef.current
    for (let i = 0; i < HISTORY_LEN; i += 1) {
      const x = (i / HISTORY_LEN) * width
      const y = height / 2 - ((history[i] - min) * scale - (range / 2) * scale)
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

    drawWave(BASELINE, BASELINE)
  }, [drawWave])

  const disconnectFromSerial = useCallback(async () => {
    runningRef.current = false
    smoothedBpmRef.current = null

    if (readerRef.current) {
      try {
        await readerRef.current.cancel()
      } catch {
        // Reader can already be closed when device disconnects.
      }

      try {
        readerRef.current.releaseLock()
      } catch {
        // Ignore if the lock was already released.
      }

      readerRef.current = null
    }

    if (portRef.current) {
      try {
        await portRef.current.close()
      } catch {
        // Ignore close errors when the browser already closed the port.
      }

      portRef.current = null
    }

    setConnected(false)
    setStatus('Disconnected')
  }, [])

  const parseLine = useCallback(
    (line) => {
      setRawLine(line)

      const parts = line.split(',')
      if (parts.length < 3) {
        return
      }

      const nextSignal = Number(parts[0])
      const nextBpm = Number(parts[1])
      const nextIbi = Number(parts[2])

      if (Number.isNaN(nextSignal) || Number.isNaN(nextBpm) || Number.isNaN(nextIbi)) {
        return
      }

      setSignal(nextSignal)

      if (nextBpm > 0) {
        const cappedBpm = Math.min(nextBpm, MAX_BPM)
        const previousSmoothed = smoothedBpmRef.current

        if (previousSmoothed === null) {
          smoothedBpmRef.current = cappedBpm
        } else {
          const boundedTarget = Math.max(
            previousSmoothed - MAX_BPM_STEP,
            Math.min(cappedBpm, previousSmoothed + MAX_BPM_STEP),
          )

          smoothedBpmRef.current = previousSmoothed + (boundedTarget - previousSmoothed) * BPM_SMOOTHING_ALPHA
        }

        setBpm(Math.round(smoothedBpmRef.current))
      } else {
        smoothedBpmRef.current = null
        setBpm(null)
      }

      setIbi(nextBpm > 0 && nextIbi > 0 ? nextIbi : null)

      const history = historyRef.current
      history.shift()
      history.push(nextSignal)

      let min = history[0]
      let max = history[0]
      for (let i = 1; i < history.length; i += 1) {
        if (history[i] < min) {
          min = history[i]
        }
        if (history[i] > max) {
          max = history[i]
        }
      }

      drawWave(min, max)
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
  }, [disconnectFromSerial, parseLine])

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
    <section className="section serial-panel" id="device-integration">
      <div className="section-header-row serial-head">
        <div>
          <h2>Live Device Integration</h2>
          <p>Connect PulseSensor over Web Serial to stream real-time signal, smoothed BPM, and IBI.</p>
        </div>
        <button type="button" className="serial-button" onClick={handleConnectToggle}>
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      <div className="serial-status-row">
        <span className={`serial-dot ${connected ? 'on' : ''}`} aria-hidden="true"></span>
        <strong>{status}</strong>
      </div>

      <canvas ref={canvasRef} className="serial-canvas" aria-label="Live pulse waveform"></canvas>

      <div className="serial-vars">
        <article className="serial-var signal">
          <h3>Signal</h3>
          <p>{signal ?? '-'}</p>
        </article>

        <article className="serial-var bpm">
          <h3>BPM</h3>
          <p>{bpm ?? '-'}</p>
        </article>

        <article className="serial-var ibi">
          <h3>IBI (ms)</h3>
          <p>{ibi ?? '-'}</p>
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

export default PulseSensorSerialPanel

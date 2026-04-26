import './App.css'
import CombinedSensorsSerialPanel from './components/CombinedSensorsSerialPanel'
import PulseSensorSerialPanel from './components/PulseSensorSerialPanel'
import ForceSensorSerialPanel from './components/ForceSensorSerialPanel'
import RubberbandResistanceSerialPanel from './components/RubberbandResistanceSerialPanel'

const heartRateData = [72, 80, 96, 121, 142, 156, 148, 131, 109, 92]
const tensionData = [20, 24, 31, 48, 62, 70, 73, 61, 42, 30]
const recoveryData = [
  { week: 'W1', strength: 52, rom: 44, tensionDrop: 18, consistency: 2 },
  { week: 'W2', strength: 56, rom: 50, tensionDrop: 23, consistency: 3 },
  { week: 'W3', strength: 61, rom: 57, tensionDrop: 30, consistency: 4 },
  { week: 'W4', strength: 68, rom: 63, tensionDrop: 38, consistency: 4 },
  { week: 'W5', strength: 72, rom: 69, tensionDrop: 42, consistency: 5 },
]

function pointsFromValues(values, width, height, min, max, padding = 18) {
  const range = Math.max(max - min, 1)
  const xStep = (width - padding * 2) / (values.length - 1)

  return values.map((value, index) => {
    const x = padding + index * xStep
    const y = height - padding - ((value - min) / range) * (height - padding * 2)
    return { x, y }
  })
}

function dynamicBounds(values, options = {}) {
  const { minSpan = 8, paddingRatio = 0.14 } = options
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const value of values) {
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
    return { min: 0, max: minSpan }
  }

  const baseSpan = Math.max(max - min, minSpan)
  const center = (min + max) / 2
  const paddedSpan = baseSpan * (1 + paddingRatio * 2)

  return {
    min: center - paddedSpan / 2,
    max: center + paddedSpan / 2,
  }
}

function pointsToSvgString(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function spikePointsFromPeaks(points, peakLift = 18, shoulderInset = 0.24, minY = 8) {
  if (points.length <= 2) {
    return points
  }

  const spiked = [points[0]]
  const flatTolerance = 0.15

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const current = points[i]
    const next = points[i + 1]

    const isLocalPeak = current.y <= prev.y && current.y <= next.y
    if (!isLocalPeak) {
      spiked.push(current)
      continue
    }

    const isPlateau =
      Math.abs(current.y - prev.y) <= flatTolerance
      || Math.abs(current.y - next.y) <= flatTolerance

    const leftX = current.x - (current.x - prev.x) * shoulderInset
    const rightX = current.x + (next.x - current.x) * shoulderInset
    const shoulderY = current.y + 0.9
    const plateauBoost = isPlateau ? 6 : 0
    const apexY = Math.max(minY, current.y - peakLift - plateauBoost)

    spiked.push({ x: leftX, y: shoulderY })
    spiked.push({ x: current.x, y: apexY })
    spiked.push({ x: rightX, y: shoulderY })
  }

  spiked.push(points[points.length - 1])
  return spiked
}

function App() {
  const lineWidth = 340
  const lineHeight = 170
  const chartPadding = 18
  const heartRange = dynamicBounds(heartRateData, { minSpan: 12 })
  const tensionRange = dynamicBounds(tensionData, { minSpan: 10 })
  const heartPointObjects = pointsFromValues(
    heartRateData,
    lineWidth,
    lineHeight,
    heartRange.min,
    heartRange.max,
    chartPadding,
  )
  const heartSpikedPoints = spikePointsFromPeaks(heartPointObjects)
  const heartPoints = pointsToSvgString(heartSpikedPoints)
  const tensionPointObjects = pointsFromValues(
    tensionData,
    lineWidth,
    lineHeight,
    tensionRange.min,
    tensionRange.max,
    chartPadding,
  )
  const tensionPoints = pointsToSvgString(tensionPointObjects)
  const bottomY = lineHeight - chartPadding
  const rightX = lineWidth - chartPadding
  const leftX = chartPadding
  const tensionArea = `${tensionPoints} ${rightX},${bottomY} ${leftX},${bottomY}`
  const activation = 72
  const ringCircumference = 2 * Math.PI * 52
  const ringOffset = ringCircumference - (activation / 100) * ringCircumference

  return (
    <main className="page">
      <section className="hero section" id="hero">
        <div className="hero-copy">
          <p className="eyebrow">Hackathon Track: Fashion the Future</p>
          <h1>Savior Sleeve Therapy Line</h1>
          <p className="lede">
            A futuristic, fashion-forward therapy sleeve concept for physical and
            clinical recovery. Track heart rate, muscle tension, and activation in
            one sleek dashboard designed for medical clarity and modern identity.
          </p>
          <div className="track-card" role="note" aria-label="Hackathon track statement">
            <strong>Fashion the Future</strong>
            <p>
              Create cutting-edge wearable technology, smart textiles, and
              sustainable fashion innovations.
            </p>
          </div>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#dashboard-preview">
              View Therapy Dashboard
            </a>
            <a className="btn btn-ghost" href="#fashion-track">
              Style Direction
            </a>
          </div>
        </div>

        <div className="hero-visual" aria-label="Savior Sleeve therapy fashion visuals">
          <figure className="tbd-image-card">
            <figcaption>TBD: Therapy couture wordmark</figcaption>
          </figure>
          <figure className="tbd-image-card tall">
            <figcaption>TBD: Layered clinical-fashion sleeve render</figcaption>
          </figure>
        </div>
      </section>

      <section className="section" id="problem">
        <h2>Clinical Therapy Gap</h2>
        <p className="section-intro">
          Patients in physical therapy often need clear, consistent feedback while
          wearing products that still feel personal and confidence boosting.
        </p>
        <div className="problem-grid">
          <article className="info-card">
            <h3>Invisible overexertion</h3>
            <p>
              Strain can build between clinic visits, making home sessions harder to
              pace safely.
            </p>
          </article>
          <article className="info-card">
            <h3>No clear progress narrative</h3>
            <p>
              Patients and clinicians need a shared view of movement quality,
              intensity, and adherence over time.
            </p>
          </article>
          <article className="info-card">
            <h3>Therapy wear lacks identity</h3>
            <p>
              Most support wearables feel purely medical and are rarely designed as a
              style statement.
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="features">
        <h2>MVP Focus</h2>
        <div className="feature-grid">
          <article className="feature-card">
            <h3>Therapy Vitals Tracking</h3>
            <p>Monitor heart and muscle response during supervised or at-home therapy.</p>
          </article>
          <article className="feature-card">
            <h3>Clinical Session Score</h3>
            <p>Capture current, average, and peak activation for therapist-friendly review.</p>
          </article>
          <article className="feature-card">
            <h3>Recovery Trajectory</h3>
            <p>Visualize range of motion, strength trends, and consistency week to week.</p>
          </article>
          <article className="feature-card">
            <h3>Care-Ready Alerts</h3>
            <p>Flag strain, low compliance, and fatigue signals before setbacks compound.</p>
          </article>
        </div>
      </section>

      <section className="section" id="who-it-helps">
        <h2>Who This MVP Serves</h2>
        <div className="chip-row" role="list" aria-label="Target users">
          <span role="listitem" className="chip">Physical therapy patients</span>
          <span role="listitem" className="chip">Outpatient rehab clinics</span>
          <span role="listitem" className="chip">Clinical therapy teams</span>
          <span role="listitem" className="chip">Orthopedic recovery users</span>
          <span role="listitem" className="chip">Post-op mobility programs</span>
        </div>
      </section>

      <section className="section" id="dashboard-preview">
        <div className="section-header-row">
          <h2>Therapy Dashboard Preview</h2>
          <p>Sample clinical-therapy data for MVP demo only</p>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <header>
              <h3>Cardio Response Graph</h3>
              <p>Y-axis: BPM | X-axis: Time</p>
            </header>
            <svg viewBox={`0 0 ${lineWidth} ${lineHeight}`} className="chart">
              <line x1="18" y1="152" x2="322" y2="152" className="axis" />
              <line x1="18" y1="18" x2="18" y2="152" className="axis" />
              <polyline points={heartPoints} className="line heart" />
            </svg>
            <ul className="legend-inline">
              <li>Baseline</li>
              <li>Mobility set</li>
              <li>Clinical threshold</li>
              <li>Cool-down</li>
            </ul>
          </article>

          <article className="dashboard-card">
            <header>
              <h3>Muscle Tension Graph</h3>
              <p>Y-axis: Tension level | X-axis: Time</p>
            </header>
            <svg viewBox={`0 0 ${lineWidth} ${lineHeight}`} className="chart">
              <rect x="18" y="18" width="304" height="44" className="zone-low" />
              <rect x="18" y="62" width="304" height="46" className="zone-mid" />
              <rect x="18" y="108" width="304" height="44" className="zone-high" />
              <line x1="18" y1="152" x2="322" y2="152" className="axis" />
              <line x1="18" y1="18" x2="18" y2="152" className="axis" />
              <polygon points={tensionArea} className="area tension" />
              <polyline points={tensionPoints} className="line tension" />
            </svg>
            <ul className="legend-inline">
              <li>Low load</li>
              <li>Target rehab load</li>
              <li>High strain warning</li>
            </ul>
          </article>

          <article className="dashboard-card">
            <header>
              <h3>Activation Compliance Score</h3>
              <p>Current engagement and treatment-session context</p>
            </header>
            <div className="activation-layout">
              <div className="ring-wrap" aria-label="Current activation 72 percent">
                <svg viewBox="0 0 140 140" className="ring">
                  <circle cx="70" cy="70" r="52" className="ring-track" />
                  <circle
                    cx="70"
                    cy="70"
                    r="52"
                    className="ring-value"
                    style={{
                      strokeDasharray: ringCircumference,
                      strokeDashoffset: ringOffset,
                    }}
                  />
                </svg>
                <p>72%</p>
              </div>

              <div className="mini-bars" role="list" aria-label="Activation metrics">
                <div role="listitem" className="mini-bar-row">
                  <span>Plan avg</span>
                  <div><i style={{ width: '64%' }}></i></div>
                  <strong>64%</strong>
                </div>
                <div role="listitem" className="mini-bar-row">
                  <span>Current set</span>
                  <div><i style={{ width: '72%' }}></i></div>
                  <strong>72%</strong>
                </div>
                <div role="listitem" className="mini-bar-row">
                  <span>Best set</span>
                  <div><i style={{ width: '89%' }}></i></div>
                  <strong>89%</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="dashboard-card">
            <header>
              <h3>Clinical Progress Chart</h3>
              <p>Weekly trend view for treatment planning</p>
            </header>
            <div className="weekly-grid" role="table" aria-label="Recovery progress">
              <div role="row" className="weekly-head">
                <span>Week</span>
                <span>Strength</span>
                <span>ROM</span>
                <span>Tension drop</span>
                <span>Adherence</span>
              </div>
              {recoveryData.map((item) => (
                <div role="row" className="weekly-row" key={item.week}>
                  <span>{item.week}</span>
                  <span>{item.strength}%</span>
                  <span>{item.rom}%</span>
                  <span>{item.tensionDrop}%</span>
                  <span>{item.consistency}/5</span>
                </div>
              ))}
            </div>
          </article>

          <article className="dashboard-card alerts-card">
            <header>
              <h3>Clinical Alert Panel</h3>
              <p>Real-time recovery and therapy pacing insights</p>
            </header>
            <ul className="alerts-list">
              <li className="alert warn">Above-target tension detected</li>
              <li className="alert note">Recommend lighter mobility block</li>
              <li className="alert good">Adherence target met this session</li>
              <li className="alert good">Activation improved by 12% this week</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <h2>How Therapy Teams Use It</h2>
        <ol className="steps">
          <li>
            <h3>Step 1: Wear the Sleeve</h3>
            <p>Patients wear the therapy sleeve during guided clinic or home exercises.</p>
          </li>
          <li>
            <h3>Step 2: Track Therapy Signals</h3>
            <p>
              The sleeve captures heart response, muscle tension, and resistance-based
              movement effort.
            </p>
          </li>
          <li>
            <h3>Step 3: Review Clinical Insights</h3>
            <p>
              The app converts sensor data into charts, alert states, and progress
              metrics clinicians can act on.
            </p>
          </li>
          <li>
            <h3>Step 4: Adjust Treatment with Confidence</h3>
            <p>Care teams and patients tune workload week by week using objective trends.</p>
          </li>
        </ol>
      </section>

      <CombinedSensorsSerialPanel />

      <section className="section serial-section-intro" id="individual-sensor-views">
        <h2>Individual Sensor Views</h2>
        <p className="section-intro">
          Individual therapy signal panels are kept below for calibration, validation,
          and clinical testing.
        </p>
      </section>

      <PulseSensorSerialPanel />
      <ForceSensorSerialPanel />
      <RubberbandResistanceSerialPanel />

      <section className="section" id="fashion-track">
        <h2>Clinical function. Fashion statement.</h2>
        <p className="section-intro">
          This MVP treats therapy wear like fashion, not only equipment. The same
          clinical core can ship in curated colorways and finish options so recovery
          support feels expressive, modern, and proudly visible.
        </p>
        <div className="style-grid">
          <article className="style-card">Monochrome clinic-luxe</article>
          <article className="style-card">Soft neutral recovery line</article>
          <article className="style-card">High-contrast editorial black</article>
          <article className="style-card">Satin sport-therapy finish</article>
          <article className="style-card">Reflective metropolitan silver</article>
          <article className="style-card">Comfort couture daywear</article>
        </div>
      </section>

      <section className="section" id="roadmap">
        <h2>Future Roadmap</h2>
        <div className="roadmap-grid">
          <article className="roadmap-card">
            <h3>Phase 1</h3>
            <p>Therapy-focused landing MVP plus dashboard simulation for clinic validation.</p>
          </article>
          <article className="roadmap-card">
            <h3>Phase 2</h3>
            <p>Prototype hardware integration with therapist notes and secure patient logs.</p>
          </article>
          <article className="roadmap-card">
            <h3>Phase 3</h3>
            <p>Clinical workflows, therapist sharing tools, and adaptive treatment recommendations.</p>
          </article>
        </div>
      </section>

      <footer className="section site-footer" id="disclaimer">
        <h2>Disclaimer</h2>
        <p>
          Savior Sleeve is a prototype concept for physical and clinical therapy
          support. It is not currently a medical device and should not replace
          professional medical advice, diagnosis, or treatment.
        </p>
      </footer>
    </main>
  )
}

export default App

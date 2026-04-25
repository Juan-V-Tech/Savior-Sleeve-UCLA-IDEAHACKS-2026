import './App.css'
import PulseSensorSerialPanel from './components/PulseSensorSerialPanel'

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
  const range = max - min
  const xStep = (width - padding * 2) / (values.length - 1)

  return values.map((value, index) => {
    const x = padding + index * xStep
    const y = height - padding - ((value - min) / range) * (height - padding * 2)
    return { x, y }
  })
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
  const heartPointObjects = pointsFromValues(heartRateData, lineWidth, lineHeight, 60, 170)
  const heartSpikedPoints = spikePointsFromPeaks(heartPointObjects)
  const heartPoints = pointsToSvgString(heartSpikedPoints)
  const tensionPointObjects = pointsFromValues(tensionData, lineWidth, lineHeight, 0, 100)
  const tensionPoints = pointsToSvgString(tensionPointObjects)
  const tensionArea = `${tensionPoints} 322,152 18,152`
  const activation = 72
  const ringCircumference = 2 * Math.PI * 52
  const ringOffset = ringCircumference - (activation / 100) * ringCircumference

  return (
    <main className="page">
      <section className="hero section" id="hero">
        <div className="hero-copy">
          <p className="eyebrow">Wearable wellness and rehab intelligence</p>
          <h1>Savior Sleeve</h1>
          <p className="lede">
            Smarter recovery for athletes and rehab users. Track heart rate, muscle
            tension, and activation in one dashboard that turns movement into
            actionable feedback.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#dashboard-preview">
              View App Dashboard
            </a>
            <a className="btn btn-ghost" href="#how-it-works">
              How It Works
            </a>
          </div>
        </div>

        <div className="hero-visual" aria-label="Savior Sleeve concept visuals">
          <figure className="tbd-image-card">
            <figcaption>TBD: Savior Sleeve wordmark image</figcaption>
          </figure>
          <figure className="tbd-image-card tall">
            <figcaption>TBD: Exploded sleeve concept visual</figcaption>
          </figure>
        </div>
      </section>

      <section className="section" id="problem">
        <h2>Problem</h2>
        <p className="section-intro">
          Most people train or recover without clear feedback on how their muscles
          are responding in real time.
        </p>
        <div className="problem-grid">
          <article className="info-card">
            <h3>Invisible overexertion</h3>
            <p>
              Fatigue and strain often build up before pain appears, increasing risk
              during workouts and rehab.
            </p>
          </article>
          <article className="info-card">
            <h3>No simple progress story</h3>
            <p>
              Users struggle to compare sessions, understand recovery trends, or stay
              consistent over weeks.
            </p>
          </article>
          <article className="info-card">
            <h3>Clinical tools feel clinical</h3>
            <p>
              Many wearables prioritize raw data over user experience and personal
              style.
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="features">
        <h2>Product Features</h2>
        <div className="feature-grid">
          <article className="feature-card">
            <h3>Heart + Tension Tracking</h3>
            <p>Monitor cardiovascular and muscle strain patterns as movement happens.</p>
          </article>
          <article className="feature-card">
            <h3>Activation Scoring</h3>
            <p>Understand current, average, and peak activation during each session.</p>
          </article>
          <article className="feature-card">
            <h3>Recovery Progress</h3>
            <p>Visualize range of motion, strength trends, and consistency week-to-week.</p>
          </article>
          <article className="feature-card">
            <h3>Fatigue Alerts</h3>
            <p>Receive simple status insights when intensity patterns suggest overuse.</p>
          </article>
        </div>
      </section>

      <section className="section" id="who-it-helps">
        <h2>Who It Helps</h2>
        <div className="chip-row" role="list" aria-label="Target users">
          <span role="listitem" className="chip">Athletes in training</span>
          <span role="listitem" className="chip">Rehab patients</span>
          <span role="listitem" className="chip">Physical therapists</span>
          <span role="listitem" className="chip">Daily mobility users</span>
          <span role="listitem" className="chip">Performance coaches</span>
        </div>
      </section>

      <section className="section" id="dashboard-preview">
        <div className="section-header-row">
          <h2>App Dashboard Preview</h2>
          <p>Sample data for MVP demo only</p>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <header>
              <h3>Heart Rate Graph</h3>
              <p>Y-axis: BPM | X-axis: Time</p>
            </header>
            <svg viewBox={`0 0 ${lineWidth} ${lineHeight}`} className="chart">
              <line x1="18" y1="152" x2="322" y2="152" className="axis" />
              <line x1="18" y1="18" x2="18" y2="152" className="axis" />
              <polyline points={heartPoints} className="line heart" />
            </svg>
            <ul className="legend-inline">
              <li>Resting</li>
              <li>Active</li>
              <li>Peak effort</li>
              <li>Recovery</li>
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
              <li>Low tension</li>
              <li>Healthy activation</li>
              <li>High strain warning</li>
            </ul>
          </article>

          <article className="dashboard-card">
            <header>
              <h3>Strength / Activation Score</h3>
              <p>Current engagement and session context</p>
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
                  <span>Session avg</span>
                  <div><i style={{ width: '64%' }}></i></div>
                  <strong>64%</strong>
                </div>
                <div role="listitem" className="mini-bar-row">
                  <span>Current</span>
                  <div><i style={{ width: '72%' }}></i></div>
                  <strong>72%</strong>
                </div>
                <div role="listitem" className="mini-bar-row">
                  <span>Peak</span>
                  <div><i style={{ width: '89%' }}></i></div>
                  <strong>89%</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="dashboard-card">
            <header>
              <h3>Recovery Progress Chart</h3>
              <p>Weekly trend view over multiple sessions</p>
            </header>
            <div className="weekly-grid" role="table" aria-label="Recovery progress">
              <div role="row" className="weekly-head">
                <span>Week</span>
                <span>Strength</span>
                <span>ROM</span>
                <span>Tension reduction</span>
                <span>Consistency</span>
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
              <h3>Fatigue / Strain Alert Panel</h3>
              <p>Real-time recovery and effort insights</p>
            </header>
            <ul className="alerts-list">
              <li className="alert warn">High tension detected</li>
              <li className="alert note">Recovery recommended</li>
              <li className="alert good">Great consistency this session</li>
              <li className="alert good">Muscle activation improved by 12% this week</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <h2>How It Works</h2>
        <ol className="steps">
          <li>
            <h3>Step 1: Wear the Sleeve</h3>
            <p>Put on the smart compression sleeve before training, rehab, or daily activity.</p>
          </li>
          <li>
            <h3>Step 2: Track Body Signals</h3>
            <p>
              The sleeve concept is designed to collect heart rate, muscle tension,
              and strength activity data.
            </p>
          </li>
          <li>
            <h3>Step 3: View Insights in the App</h3>
            <p>
              The app turns raw sensor data into simple graphs, recovery scores, and
              performance feedback.
            </p>
          </li>
          <li>
            <h3>Step 4: Improve Over Time</h3>
            <p>Compare sessions and understand how your body responds to movement.</p>
          </li>
        </ol>
      </section>

      <PulseSensorSerialPanel />

      <section className="section" id="fashion-track">
        <h2>Not just wearable tech. Wearable identity.</h2>
        <p className="section-intro">
          Savior Sleeve is designed for people who want health technology without
          sacrificing style. Customize colors, patterns, and limited-edition drops to
          turn recovery support into a statement piece.
        </p>
        <div className="style-grid">
          <article className="style-card">Minimal black athletic sleeve</article>
          <article className="style-card">UCLA blue/gold edition</article>
          <article className="style-card">Futuristic cyber sleeve</article>
          <article className="style-card">Streetwear edition</article>
          <article className="style-card">Reflective night-run edition</article>
          <article className="style-card">Rehab comfort edition</article>
        </div>
      </section>

      <section className="section" id="roadmap">
        <h2>Future Roadmap</h2>
        <div className="roadmap-grid">
          <article className="roadmap-card">
            <h3>Phase 1</h3>
            <p>Landing page MVP + dashboard simulation for concept validation.</p>
          </article>
          <article className="roadmap-card">
            <h3>Phase 2</h3>
            <p>Prototype sleeve hardware integration and secure session history.</p>
          </article>
          <article className="roadmap-card">
            <h3>Phase 3</h3>
            <p>Coach/therapist sharing tools and personalized recovery recommendations.</p>
          </article>
        </div>
      </section>

      <footer className="section site-footer" id="disclaimer">
        <h2>Disclaimer</h2>
        <p>
          Savior Sleeve is a prototype concept for wellness, rehabilitation support,
          and athletic performance visualization. It is not currently a medical
          device and should not replace professional medical advice, diagnosis, or
          treatment.
        </p>
      </footer>
    </main>
  )
}

export default App

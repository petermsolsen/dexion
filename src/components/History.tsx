import historyData from '../data/history.json'
import type { HistoryEntry } from '../types'

const history = historyData as unknown as HistoryEntry[]

export default function History() {
  return (
    <section className="sec-alt" id="history">
      <div className="container">

        <span className="section-label">Our History</span>
        <h2 className="section-title">A journey through time and technology</h2>

        <div className="timeline">
          {history.map(h => (
            <div className="timeline-item" key={h.year + h.title}>
              <div className="timeline-year">
                <span className="timeline-year-num">{h.year}</span>
                <span className={`badge ${h.platform === 'C64' ? 'c64-badge' : 'amiga-badge'}`}>
                  {h.platform}
                </span>
              </div>
              <div className="timeline-card">
                <h3>{h.title}</h3>
                <p>{h.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="history-closer" style={{ marginTop: '1.5rem' }}>
          Our journey spanned over a decade of creativity, friendship, and pushing
          technical boundaries. Though we've moved on to other endeavors, the legacy
          of our demos lives on in the hearts of scene enthusiasts worldwide.
        </p>

      </div>
    </section>
  )
}
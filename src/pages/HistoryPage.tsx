import { Link } from 'react-router-dom'
import historyData from '../data/history.json'
import type { HistoryEntry } from '../types'
import Header from '../components/Header'
import Footer from '../components/Footer'

const history = historyData as unknown as HistoryEntry[]

export default function HistoryPage() {
  return (
    <>
      <Header />
      <main>
        <section className="sec-alt works-page">
          <div className="container">

            <div className="members-page-header">
              <div className="hero-badge">
                <span className="badge c64-badge">C64</span>
                &amp;
                <span className="badge amiga-badge">Amiga</span>
                Timeline
              </div>
              <span className="section-label">Our History</span>
              <p className="section-title">A journey through time and technology</p>
            </div>

            <div className="timeline">
              {history.map(h => (
                <div className="timeline-item" key={h.year + h.title}>
                  <div className="timeline-year">
                    <span className="timeline-year-num">{h.year}</span>
                    {(Array.isArray(h.platform) ? h.platform : [h.platform]).map(p => (
                      <span key={p} className={`badge ${p === 'C64' ? 'c64-badge' : 'amiga-badge'}`}>
                        {p}
                      </span>
                    ))}
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

            <div className="members-footer-row" style={{ marginTop: '2rem' }}>
              <Link to="/" className="back-link">← Back to Archive</Link>
            </div>

          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import worksData from '../data/works.json'
import type { Work, Filter } from '../types'
import Header from '../components/Header'
import Footer from '../components/Footer'

const works = worksData as unknown as Work[]
const FILTERS: Filter[] = ['All', 'C64', 'Amiga']

export default function WorksPage() {
  const [filter, setFilter] = useState<Filter>('All')
  const filtered = filter === 'All' ? works : works.filter(w => w.platform === filter)

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
                Productions
              </div>
              <span className="section-label">Our Works</span>
              <p className="section-title">A complete showcase of our demos, intros, and releases</p>
            </div>

            <div className="filter-row">
              {FILTERS.map(p => (
                <button
                  key={p}
                  className={[
                    'filter-btn',
                    filter === p  ? 'active'       : '',
                    p === 'C64'   ? 'filter-c64'   : '',
                    p === 'Amiga' ? 'filter-amiga' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setFilter(p)}
                >
                  {p === 'All' ? 'All Platforms' : p}
                </button>
              ))}
            </div>

            <div className="works-grid">
              {filtered.map(w => (
                <div
                  key={w.title}
                  className={`work-card ${w.platform === 'C64' ? 'work-c64' : 'work-amiga'}`}
                >
                  <div className="work-header">
                    <div>
                      <span className={`badge ${w.platform === 'C64' ? 'c64-badge' : 'amiga-badge'}`}>
                        {w.platform}
                      </span>
                      <span className="tag">{w.type}</span>
                    </div>
                    <span className="work-year">{w.year}</span>
                  </div>
                  <h3 className="work-title">{w.title}</h3>
                  <p className="work-desc">{w.desc}</p>
                  <div className="work-crew">
                    {w.crew.map(c => <span key={c} className="crew-member">{c}</span>)}
                  </div>
                </div>
              ))}
            </div>

            <p className="works-note">
              All demos are preserved in digital archives — available through{' '}
              <strong style={{ color: 'var(--text)' }}>Pouet.net</strong> and{' '}
              <strong style={{ color: 'var(--text)' }}>CSDb</strong>.
              The spirit of the demoscene lives on!
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

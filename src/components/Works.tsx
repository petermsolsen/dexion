import { useState } from 'react'
import worksData from '../data/works.json'
import type { Work, Filter } from '../types'

const works = worksData as unknown as Work[]

const FILTERS: Filter[] = ['All', 'C64', 'Amiga']

export default function Works() {
  const [filter, setFilter] = useState<Filter>('All')

  const filtered = filter === 'All' ? works : works.filter(w => w.platform === filter)

  return (
    <section className="sec" id="works">
      <div className="container">

        <span className="section-label">Our Works</span>
        <h2 className="section-title">A showcase of our productions and releases</h2>

        <div className="filter-row">
          {FILTERS.map(p => (
            <button
              key={p}
              className={[
                'filter-btn',
                filter === p     ? 'active'       : '',
                p === 'C64'      ? 'filter-c64'   : '',
                p === 'Amiga'    ? 'filter-amiga' : '',
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

      </div>
    </section>
  )
}
import statsData from '../data/stats.json'
import type { Stat } from '../types'

const stats = statsData as unknown as Stat[]

export default function Hero() {
  return (
    <section className="hero" id="hero">
      <div className="container hero-inner">

        <div className="hero-badge">
          <span className="badge c64-badge">C64</span>
          &amp;
          <span className="badge amiga-badge">Amiga</span>
          Demoscene Legacy
        </div>

        <h1 className="hero-title">Pioneering<br />Demo Group</h1>
        <p className="hero-years">1982 — 1995</p>

        <p className="hero-sub">
          Welcome to the digital archive of Dexion, a pioneering demo group from the
          golden era of home computing. We pushed the boundaries of Commodore 64 and
          Amiga hardware, creating mesmerizing graphics, music, and effects that
          defined a generation.
        </p>

        <div className="stats-row">
          {stats.map(s => (
            <div className="stat-item" key={s.label}>
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
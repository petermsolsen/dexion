import { Link } from 'react-router-dom'
import awardsData       from '../data/awards.json'
import notableData      from '../data/notable.json'
import achieveStatsData from '../data/achieveStats.json'
import type { Award, Stat } from '../types'
import Header from '../components/Header'
import Footer from '../components/Footer'

const awards       = awardsData       as unknown as Award[]
const notable      = notableData      as string[]
const achieveStats = achieveStatsData as unknown as Stat[]

const PLACE: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' }

export default function AchievementsPage() {
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
                Competitions
              </div>
              <span className="section-label">Achievements</span>
              <p className="section-title">Recognition and milestones throughout our journey</p>
            </div>

            <div className="achieve-stats">
              {achieveStats.map(s => (
                <div className="achieve-stat" key={s.label}>
                  <span className="stat-value">{s.value}</span>
                  <span className="stat-label">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="achievements-cols">

              <div>
                <p className="sub-heading">Competition Awards</p>
                <table className="awards-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Place</th>
                      <th>Demo</th>
                      <th>Event</th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awards.map((a, i) => (
                      <tr key={i}>
                        <td className="td-year">{a.year}</td>
                        <td className={`td-place place-${a.place}`}>{PLACE[a.place]}</td>
                        <td className="td-demo">{a.demo}</td>
                        <td className="td-event">{a.event}</td>
                        <td><span className="tag" style={{ marginLeft: 0 }}>{a.type}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <p className="sub-heading">Notable Achievements</p>
                <ul className="notable-list">
                  {notable.map(n => (
                    <li key={n} className="notable-item">
                      <span className="notable-bullet">▸</span>
                      {n}
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            <div className="members-footer-row" style={{ marginTop: '3rem' }}>
              <Link to="/" className="back-link">← Back to Archive</Link>
            </div>

          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

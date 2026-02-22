import awardsData      from '../data/awards.json'
import notableData     from '../data/notable.json'
import achieveStatsData from '../data/achieveStats.json'
import type { Award, Stat } from '../types'

const awards       = awardsData       as unknown as Award[]
const notable      = notableData      as string[]
const achieveStats = achieveStatsData as unknown as Stat[]

const PLACE: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' }

export default function Achievements() {
  return (
    <section className="sec-alt" id="achievements">
      <div className="container">

        <span className="section-label">Achievements</span>
        <h2 className="section-title">Recognition and milestones throughout our journey</h2>

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
      </div>
    </section>
  )
}
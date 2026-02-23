import { useParams, Link, Navigate } from 'react-router-dom'
import membersData from '../data/members.json'
import type { Member } from '../types'
import Header from '../components/Header'
import Footer from '../components/Footer'

const data = membersData as Record<string, Member[]>

export default function MembersPage() {
  const { platform } = useParams<{ platform: string }>()

  if (platform !== 'c64' && platform !== 'amiga') {
    return <Navigate to="/" replace />
  }

  const key = platform === 'c64' ? 'C64' : 'Amiga'
  const members = data[key]
  const isAmiga = platform === 'amiga'

  return (
    <>
      <Header />
      <main>
        <section className="sec-alt members-page">
          <div className="container">

            <div className="members-page-header">
              <div className="hero-badge">
                <span className={`badge ${isAmiga ? 'amiga-badge' : 'c64-badge'}`}>{key}</span>
                Section Members
              </div>
              <span className="section-label">The Crew</span>
              <p className="section-title">
                {isAmiga
                  ? "The talented crew behind Dexion's Amiga productions from 1987 to 1995"
                  : "The pioneers who defined Dexion's Commodore 64 identity from 1982 to 1988"}
              </p>
            </div>

            <div className="members-grid">
              {members.map(m => (
                <div
                  key={m.handle}
                  className={`member-card ${isAmiga ? 'member-amiga' : 'member-c64'}`}
                >
                  <div className={`member-avatar ${isAmiga ? 'avatar-amiga' : 'avatar-c64'}`}>
                    <span className="member-initial">{m.handle[0].toUpperCase()}</span>
                  </div>
                  <div className="member-body">
                    <div className="member-top">
                      <h3 className="member-handle">{m.handle}</h3>
                      <span className="member-real-name">{m.realName}</span>
                    </div>
                    <div className="member-meta">
                      <span className={`badge ${isAmiga ? 'amiga-badge' : 'c64-badge'}`}>
                        {m.role}
                      </span>
                      <span className="member-years">{m.years}</span>
                      <span className="member-country">· {m.country}</span>
                    </div>
                    <p className="member-bio">{m.bio}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="members-footer-row">
              <Link to="/" className="back-link">← Back to Archive</Link>
              <Link
                to={`/members/${isAmiga ? 'c64' : 'amiga'}`}
                className={`switch-link ${isAmiga ? 'switch-c64' : 'switch-amiga'}`}
              >
                View {isAmiga ? 'C64' : 'Amiga'} Members →
              </Link>
            </div>

          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

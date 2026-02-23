import { useState } from 'react'
import { Link } from 'react-router-dom'
import membersData from '../data/members.json'
import type { Member, Filter, WorkPlatform } from '../types'
import Header from '../components/Header'
import Footer from '../components/Footer'

type MemberWithPlatform = Member & { platform: WorkPlatform }

const data = membersData as Record<string, Member[]>

const allMembers: MemberWithPlatform[] = [
  ...data.C64.map(m => ({ ...m, platform: 'C64' as WorkPlatform })),
  ...data.Amiga.map(m => ({ ...m, platform: 'Amiga' as WorkPlatform })),
]

const FILTERS: Filter[] = ['All', 'C64', 'Amiga']

export default function MembersPage() {
  const [filter, setFilter] = useState<Filter>('All')
  const filtered = filter === 'All' ? allMembers : allMembers.filter(m => m.platform === filter)

  return (
    <>
      <Header />
      <main>
        <section className="sec-alt members-page">
          <div className="container">

            <div className="members-page-header">
              <div className="hero-badge">
                <span className="badge c64-badge">C64</span>
                &amp;
                <span className="badge amiga-badge">Amiga</span>
                Section Members
              </div>
              <span className="section-label">The Crew</span>
              <p className="section-title">The people behind Dexion's productions from 1982 to 1995</p>
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
                  {p === 'All' ? 'All Sections' : p}
                </button>
              ))}
            </div>

            <div className="members-grid">
              {filtered.map(m => (
                <div
                  key={m.platform + m.handle}
                  className={`member-card ${m.platform === 'C64' ? 'member-c64' : 'member-amiga'}`}
                >
                  <div className={`member-avatar ${m.platform === 'C64' ? 'avatar-c64' : 'avatar-amiga'}`}>
                    <span className="member-initial">{m.handle[0].toUpperCase()}</span>
                  </div>
                  <div className="member-body">
                    <div className="member-top">
                      <h3 className="member-handle">{m.handle}</h3>
                      <span className="member-real-name">{m.realName}</span>
                    </div>
                    <div className="member-meta">
                      <span className={`badge ${m.platform === 'C64' ? 'c64-badge' : 'amiga-badge'}`}>
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

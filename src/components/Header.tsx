import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import logo from '../assets/logo.png'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const close = () => { setMenuOpen(false); setMembersOpen(false) }
  const { pathname } = useLocation()
  const base = pathname === '/' ? '' : '/'

  return (
    <header className="header">
      <Link to="/" onClick={close}>
        <img src={logo} alt="Dexion" className="logo" />
      </Link>

      <nav className={`nav${menuOpen ? ' open' : ''}`}>
        <Link to="/history"      onClick={close}>History</Link>
        <Link to="/works"        onClick={close}>Works</Link>
        <Link to="/achievements" onClick={close}>Achievements</Link>

        <div className={`nav-dropdown${membersOpen ? ' open' : ''}`}>
          <button
            className="nav-dropdown-toggle"
            onClick={() => setMembersOpen(o => !o)}
          >
            Members <span className="dropdown-arrow">▾</span>
          </button>
          <div className="nav-dropdown-menu">
            <Link to="/members/c64"   onClick={close} className="nav-c64">
              <span className="dropdown-dot c64-dot" />C64
            </Link>
            <Link to="/members/amiga" onClick={close} className="nav-amiga">
              <span className="dropdown-dot amiga-dot" />Amiga
            </Link>
          </div>
        </div>

        <a href={`${base}#greetings`} onClick={close}>Greetings</a>
      </nav>

      <button
        className={`hamburger${menuOpen ? ' open' : ''}`}
        onClick={() => setMenuOpen(o => !o)}
        aria-label="Toggle menu"
      >
        <span /><span /><span />
      </button>
    </header>
  )
}

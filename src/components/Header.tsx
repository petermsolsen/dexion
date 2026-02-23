import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import logo from '../assets/logo.png'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const close = () => setMenuOpen(false)
  const { pathname } = useLocation()
  const base = pathname === '/' ? '' : '/'

  return (
    <header className="header">
      <Link to="/" onClick={close}>
        <img src={logo} alt="Dexion" className="logo" />
      </Link>

      <nav className={`nav${menuOpen ? ' open' : ''}`}>
        <a href={`${base}#history`}      onClick={close}>History</a>
        <Link to="/works"                onClick={close}>Works</Link>
        <a href={`${base}#achievements`} onClick={close}>Achievements</a>
        <Link to="/members/c64"   onClick={close} className="nav-c64">C64 Members</Link>
        <Link to="/members/amiga" onClick={close} className="nav-amiga">Amiga Members</Link>
        <a href={`${base}#greetings`}    onClick={close}>Greetings</a>
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

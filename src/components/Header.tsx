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
        <Link to="/history"      onClick={close}>History</Link>
        <Link to="/works"        onClick={close}>Works</Link>
        <Link to="/achievements" onClick={close}>Achievements</Link>
        <Link to="/members"      onClick={close}>Members</Link>
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

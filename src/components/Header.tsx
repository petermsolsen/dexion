import { useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const close = () => { setMenuOpen(false) }

  return (
    <header className="header">
      <Link to="/" onClick={close}>
        <img src={logo} alt="Dexion" className="logo" />
      </Link>

      <nav className={`nav${menuOpen ? ' open' : ''}`}>
        <Link to="/" onClick={close}>Home</Link>
        <Link to="/works" onClick={close}>Works</Link>
        <Link to="/works/adf-analyzer" onClick={close}>ADF</Link>
        <Link to="/achievements" onClick={close}>Achievements</Link>
        <Link to="/members"      onClick={close}>Members</Link>
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

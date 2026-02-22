import { useState } from 'react'
import logo from '../assets/logo.png'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const close = () => setMenuOpen(false)

  return (
    <header className="header">
      <a href="#hero" onClick={close}>
        <img src={logo} alt="Dexion" className="logo" />
      </a>

      <nav className={`nav${menuOpen ? ' open' : ''}`}>
        <a href="#history"      onClick={close}>History</a>
        <a href="#works"        onClick={close}>Works</a>
        <a href="#achievements" onClick={close}>Achievements</a>
        <a href="#greetings"    onClick={close}>Greetings</a>
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

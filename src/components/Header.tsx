import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/logo.png'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const close = () => { setMenuOpen(false) }

  const scrollTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    close()
    if (location.pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate('/')
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }

  return (
    <header className="header">
      <Link to="/" onClick={close}>
        <img src={logo} alt="Dexion" className="logo" />
      </Link>

      <nav className={`nav${menuOpen ? ' open' : ''}`}>
        <a href="#hero"         onClick={e => scrollTo(e, 'hero')}>Home</a>
        <a href="#history"      onClick={e => scrollTo(e, 'history')}>History</a>
        <a href="#achievements" onClick={e => scrollTo(e, 'achievements')}>Achievements</a>
        <a href="#works"        onClick={e => scrollTo(e, 'works')}>Works</a>
        <Link to="/works/adf-analyzer" onClick={close}>ADFTool</Link>
        <Link to="/members"            onClick={close}>Members</Link>
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

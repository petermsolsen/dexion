import logo from '../assets/logo.png'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="footer" id="greetings">
      <div className="footer-inner">

        <div className="footer-brand">
          <img src={logo} alt="Dexion" className="logo" />
          <p className="footer-tagline">
            A pioneering demo group from the golden era of home computing.
            Pushing boundaries on C64 and Amiga from 1982 to 1995.
          </p>
          <div className="footer-platforms">
            <span className="badge c64-badge">Commodore 64 · 1982–1887</span>
            <span className="badge amiga-badge">Commodore Amiga · 1987–1995</span>
          </div>
        </div>

        <div className="footer-greetings">
          <h4>Greetings</h4>
          <p>
            To all crews who kept the scene alive · All coders, musicians &amp; graphicians ·
            Party organizers · And everyone who appreciated our work
          </p>
        </div>

      </div>

      <div className="footer-bottom">
        <p>
          &copy; {YEAR} Dexion Demo Group · All rights reserved ·
          Greetings to all sceners worldwide
        </p>
      </div>
    </footer>
  )
}

import './App.css'
import Header       from './components/Header'
import Hero         from './components/Hero'
import History      from './components/History'
import Works        from './components/Works'
import Achievements from './components/Achievements'
import Footer       from './components/Footer'

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <History />
        <Works />
        <Achievements />
      </main>
      <Footer />
    </>
  )
}
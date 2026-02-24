import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header       from './components/Header'
import Hero         from './components/Hero'
import History      from './components/History'
import Works        from './components/Works'
import Achievements from './components/Achievements'
import Footer       from './components/Footer'
import MembersPage      from './pages/MembersPage'
import WorksPage        from './pages/WorksPage'
import AchievementsPage from './pages/AchievementsPage'
import ADFAnalyzerPage  from './pages/ADFAnalyzerPage'

function HomePage() {
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"            element={<HomePage />} />
        <Route path="/works"              element={<WorksPage />} />
        <Route path="/works/adf-analyzer" element={<ADFAnalyzerPage />} />
        <Route path="/achievements"       element={<AchievementsPage />} />
        <Route path="/members"            element={<MembersPage />} />
      </Routes>
    </BrowserRouter>
  )
}

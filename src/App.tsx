import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header           from './components/Header'
import Hero             from './components/Hero'
import History          from './components/History'
import Achievements     from './components/Achievements'
import Works            from './components/Works'
import Footer           from './components/Footer'
import MembersPage      from './pages/MembersPage'
import ADFAnalyzerPage  from './pages/ADFAnalyzerPage'

function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <History />
        <Achievements />
        <Works />
      </main>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                   element={<HomePage />} />
<Route path="/works/adf-analyzer" element={<ADFAnalyzerPage />} />
        <Route path="/members"            element={<MembersPage />} />
      </Routes>
    </BrowserRouter>
  )
}

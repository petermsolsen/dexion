import Header from '../components/Header'

export default function ADFAnalyzerPage() {
  return (
    <>
      <Header />
      <main>
        <iframe
          src="/tools/adf-analyzer.html"
          className="adf-frame"
          title="ADF Analyzer"
        />
      </main>
    </>
  )
}

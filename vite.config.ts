import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'fs'

function copyAdfTools() {
  return {
    name: 'copy-adf-tools',
    closeBundle() {
      const outDir = 'dist/tools'
      mkdirSync(outDir, { recursive: true })
      for (const file of ['adf-analyzer.html', 'adf-analyzer.css', 'adf-analyzer.js']) {
        copyFileSync(`src/assets/${file}`, `${outDir}/${file}`)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyAdfTools()],
})

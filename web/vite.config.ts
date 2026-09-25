import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { repoContent } from './build/repo-content.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => ({
  // The app lives under /app/; the classic static pages keep every other URL.
  base: '/app/',
  define: {
    // Dev-only pages (/dev/card) ship in Vercel preview builds for review, never in production.
    __DEV_ROUTES__: JSON.stringify(mode === 'development' || process.env.VERCEL_ENV === 'preview'),
  },
  plugins: [
    react(),
    tailwindcss(),
    repoContent(repoRoot, ['/content/', '/9618/', '/9702/', '/9990/']),
  ],
  build: {
    // scripts/assemble-site.mjs links the rest of the site around this.
    outDir: 'site/app',
    emptyOutDir: true,
  },
}))

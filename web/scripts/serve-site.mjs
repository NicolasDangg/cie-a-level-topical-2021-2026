// Serve web/site/ the way Vercel does with vercel.json: real files first,
// directory index.html, then /app/* falls back to the app shell.
//   node scripts/serve-site.mjs [port]
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const site = fileURLToPath(new URL('../site', import.meta.url))
const port = Number(process.argv[2] ?? 4174)
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf',
}

function file(p) {
  const full = path.join(site, p)
  if (!full.startsWith(site)) return null
  try {
    const st = statSync(full)
    if (st.isFile()) return full
    if (st.isDirectory()) return file(path.join(p, 'index.html'))
  } catch {}
  return null
}

createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let found = file(url)
  if (!found && (url === '/app' || url.startsWith('/app/'))) found = file('/app/index.html')
  if (!found) {
    res.writeHead(404).end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(found)] ?? 'application/octet-stream' })
  createReadStream(found).pipe(res)
}).listen(port, () => console.log(`serving web/site on http://localhost:${port}`))

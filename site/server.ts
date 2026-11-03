// The manager site on the box: the JSON API (server/) and the browser app (app/). In production
// the app is the vite build in dist/; in development Vite serves it from source, with HMR.
import * as http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'

import { host, port } from './server/config.ts'
import { createAppRouter } from './server/router.ts'

const development = process.env.NODE_ENV === 'development'

// In development only /api/ reaches this router; Vite answers everything else.
let router = createAppRouter({ buildDir: './dist' })
let api = createRequestListener(router.fetch)

const server = http.createServer(api)

if (development) {
  let { createServer } = await import('vite')
  // HMR's WebSocket shares this server's port rather than opening one of its own.
  let vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  server.removeListener('request', api)
  server.on('request', (req, res) => (req.url?.startsWith('/api/') ? api(req, res) : vite.middlewares(req, res)))
}

server.listen(port, host, () => {
  console.log(`manager site listening on http://${host}:${port}${development ? ' (development)' : ''}`)
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close(() => process.exit(0))
  server.closeAllConnections()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

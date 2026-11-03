import * as http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'

import { host, port } from './app/config.ts'
import { router } from './app/router.ts'

const server = http.createServer(createRequestListener(router.fetch))

server.listen(port, host, () => {
  console.log(`manager site listening on http://${host}:${port}`)
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

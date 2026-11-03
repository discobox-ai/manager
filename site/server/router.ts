import * as path from 'node:path'
import { openLazyFile } from 'remix/fs'
import { staticFiles } from 'remix/middleware/static'
import { createFileResponse } from 'remix/response/file'
import { createRouter } from 'remix/router'

import { api } from './api.ts'
import controller from './controller.ts'

export interface AppOptions {
  /** The built app (vite build's dist/), served for every GET that isn't the API or a file. */
  buildDir: string
}

export function createAppRouter({ buildDir }: AppOptions) {
  let router = createRouter({
    middleware: [staticFiles(buildDir, { index: false })],
    // Every page route belongs to the browser app's router, so the server answers them all with
    // the same index.html.
    async defaultHandler({ request, url }) {
      if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
        return new Response('Not Found', { status: 404 })
      }
      let index = openLazyFile(path.join(buildDir, 'index.html'))
      return createFileResponse(index, request, { cacheControl: 'no-cache' })
    },
  })
  router.map(api, controller)
  return router
}

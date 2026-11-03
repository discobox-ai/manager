import { createRouter, type RouterContext } from 'remix/router'
import { render } from 'remix/spa'

import controller from './actions/controller.tsx'
import { routes } from './routes.ts'
import { NotFound } from './ui/shell.tsx'

export const router = createRouter({
  middleware: [render()],
  defaultHandler({ render, url }) {
    return render(<NotFound path={url.pathname} />, { status: 404 })
  },
})

export type AppContext = RouterContext<typeof router>

declare module 'remix' {
  interface RouterTypes {
    context: AppContext
  }
}

router.map(routes, controller)

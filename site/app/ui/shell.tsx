import type { Handle, RemixNode } from 'remix/component'

import { routes } from '../routes.ts'
import { href } from '../routing.ts'

/** The page column every route renders into. */
export function Page(handle: Handle<{ title: string; children?: RemixNode }>) {
  return () => {
    document.title = handle.props.title
    return <div class="wrap">{handle.props.children}</div>
  }
}

export function Loading() {
  return () => (
    <div class="wrap">
      <header class="strip">
        <h1>Manager status</h1>
        <span class="when">Loading…</span>
      </header>
    </div>
  )
}

export function NotFound(handle: Handle<{ path: string }>) {
  return () => (
    <Page title="Not found · Manager status">
      <header class="strip">
        <h1>Nothing at {handle.props.path}</h1>
      </header>
      <p>
        <a href={href(routes.home.href())}>Back to the status board</a>
      </p>
    </Page>
  )
}

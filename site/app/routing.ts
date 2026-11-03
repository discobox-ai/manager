import type { AppRuntime } from 'remix/component'

import { host } from './store/index.ts'

/**
 * On the box the app routes real paths, through Remix's Navigation API runtime. In the artifact
 * the document's URL belongs to claude.ai's viewer, so routes live in the fragment instead:
 * "#/adr/vm" is requested as https://manager.invalid/adr/vm through the same router.
 */
export const fragmentRouting = host === 'artifact'

const fragmentBase = 'https://manager.invalid'

/** A link to one of the app's routes, in this host's form. */
export function href(path: string): string {
  return fragmentRouting ? `#${path}` : path
}

function fragmentSrc(): string {
  let route = location.hash.startsWith('#/') ? location.hash.slice(1) : '/'
  return fragmentBase + route
}

/**
 * Call before run(). In the artifact, hides the Navigation API from Remix's runtime: its frame
 * navigation needs a document whose URL it may rewrite (a sandboxed frame without its own origin
 * can't), and fragment changes are routed here instead.
 */
export function prepareRouting(): void {
  if (!fragmentRouting) return
  try {
    Object.defineProperty(window, 'navigation', { value: undefined, configurable: true })
  } catch {
    // Left as is: Remix then routes path links itself, and fragment routing below still works.
  }
}

/** Call after run(): points the top frame at the fragment's route and follows fragment changes. */
export function startRouting(app: Pick<AppRuntime, 'frames'>): void {
  if (!fragmentRouting) return
  app.frames.top.src = fragmentSrc()
  addEventListener('hashchange', () => {
    let src = fragmentSrc()
    if (src !== app.frames.top.src) void app.frames.top.reload({ src })
  })
}

import { run } from 'remix/spa'

import { router } from './router.tsx'
import { prepareRouting, startRouting } from './routing.ts'
import { host } from './store/index.ts'
import { Loading } from './ui/shell.tsx'

// The artifact viewer publishes our file inside its own <body>, stylesheet included, and run()
// renders the top frame into document.body, replacing what's there. So lift the page's head tags
// (title, meta, font links, the stylesheet) into <head> first; on the box they're already there.
if (host === 'artifact') {
  document.head.append(...document.body.querySelectorAll(':scope > :is(title, meta, link, style)'))
}

prepareRouting()
// run() from remix/spa resolves the current URL, and every later frame navigation, through the
// app's router, rendering the fallback until the first route answers.
const app = run(router, { fallback: <Loading /> })
startRouting(app)
app.addEventListener('error', (event) => {
  console.error('Manager app failed:', event.error)
})
await app.ready()

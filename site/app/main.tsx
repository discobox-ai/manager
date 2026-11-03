import { run } from 'remix/spa'

import { router } from './router.tsx'
import { prepareRouting, startRouting } from './routing.ts'
import { Loading } from './ui/shell.tsx'

prepareRouting()
// run() from remix/spa resolves the current URL, and every later frame navigation, through the
// app's router, rendering the fallback until the first route answers.
const app = run(router, { fallback: <Loading /> })
startRouting(app)
app.addEventListener('error', (event) => {
  console.error('Manager app failed:', event.error)
})
await app.ready()

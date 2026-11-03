import { get, route } from 'remix/routes'

export const routes = route({
  home: get('/'),
  adrIndex: get('/adr/:repo'),
  adr: get('/adr/:repo/:name.md'),
  diff: get('/diff/:repo/:number'),
})

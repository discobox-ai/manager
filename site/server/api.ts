import { get, post, route } from 'remix/routes'

// The box's JSON API: the same documents the artifact reads from its database.
export const api = route({
  state: get('/api/state'),
  details: get('/api/details/:id'),
  events: get('/api/events'),
  record: post('/api/actions'),
  adrIndex: get('/api/adr/:repo'),
  adr: get('/api/adr/:repo/:name.md'),
})

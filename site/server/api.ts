import { get, post, route } from 'remix/routes'

// The box's JSON API: the same documents the artifact reads from its database.
export const api = route({
  state: get('/api/state'),
  details: get('/api/details/:id'),
  diff: get('/api/diff/:id'),
  diffPart: get('/api/diff/:id/:index'),
  events: get('/api/events'),
  record: post('/api/actions'),
  chat: post('/api/chat'),
  adrIndex: get('/api/adr/:repo'),
  adr: get('/api/adr/:repo/:name.md'),
})

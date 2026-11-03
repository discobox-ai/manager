import { get, post, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: get('/'),
  board: get('/board'),
  events: get('/events'),
  details: get('/details/:repo/:kind/:number'),
  record: post('/actions'),
})

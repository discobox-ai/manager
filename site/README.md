# Manager site

The owner's view of the manager's status table, in two places from one app:

- **The site** on the manager's box, port 4400 (service `manager-site`).
- **The "Manager status" artifact** on claude.ai, for anywhere the owner is signed in.

It's a client-rendered Remix 3 app (`remix/spa`), laid out like upstream's `demos/spa` and built
with Vite. The UI never knows which host it's on. It reads one set of documents
(`app/shared/docs.ts`) through a store (`app/store/`):

| | Site (`vite build`) | Artifact (`vite build --mode artifact`) |
|---|---|---|
| Output | `dist/`, served by `server.ts` | `dist-artifact/artifact.html`, one file |
| Data | `server.ts`'s JSON API, live over an event stream | the artifact's `db`, filled by `sync.ts` and its sync agent |
| Buttons | `POST /api/actions`, appended to `actions.jsonl` | an `actions` document, carried to `actions.jsonl` by the sync |
| Routes | real paths (`/adr/vm`) | the fragment (`#/adr/vm`); the viewer owns the URL |
| ADR viewer | yes | links to GitHub instead (it can't reach GitHub) |

## Layout

- `index.html`: the page shell and the stylesheet (design tokens, both themes).
- `app/`: the browser app. `routes.ts`, `router.tsx` and `actions/controller.tsx` hold the
  routes; `ui/` the components; `store/` the two data sources; `shared/` the types and helpers
  the server uses too; `routing.ts` the path or fragment routing.
- `server/`: Node only. Reads the table, `actions.jsonl` and GitHub (read-only, with `GH_TOKEN`),
  and builds the documents (`docs.ts`). `api.ts` and `controller.ts` are the JSON API.
- `server.ts`: the site's server. `sync.ts`: the artifact's sync (service `manager-sync`).
- `test/`: end-to-end tests of both builds (`remix test`, Playwright). The artifact runs against a
  stand-in for claude.ai's `window.claude` (`test/fake-claude.ts`).

## Commands

```sh
npm run dev        # the site with Vite's dev server and HMR, on :4400 (PORT overrides)
npm run build      # both builds
npm test           # build, then the end-to-end tests
npm run typecheck  # the app and the server, each with its own tsconfig
```

The tests need Playwright's Chromium once: `npx playwright install chromium-headless-shell`.

## Shipping a change

1. Change `app/` (or `server/`), then run `npm test` and `npm run typecheck`.
2. Commit and push to `main` (this repository's rule).
3. Restart the `manager-site` service. `start.sh` rebuilds on start.
4. Republish the artifact: the Artifact tool on `site/dist-artifact/artifact.html` with `url` set
   to the "Manager status" URL (the `table` skill), and no `capabilities`, so the stored `db` and
   `user` grants carry forward.

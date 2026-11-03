# Manager site

The owner's view of the manager's status table, in two places from one app:

- **The site** on the manager's box, port 4400 (service `manager-site`), in development mode: a
  saved change is live at once, with no build or restart.
- **The "Manager status" artifact** on claude.ai, for anywhere the owner is signed in.

It's a client-rendered Remix 3 app (`remix/spa`), laid out like upstream's `demos/spa` and built
with Vite. The UI never knows which host it's on. It reads one set of documents
(`app/shared/docs.ts`) through a store (`app/store/`):

| | Site (`vite build`) | Artifact (`vite build --mode artifact`) |
|---|---|---|
| Output | served from source by Vite in `server.ts` (dev mode); `dist/` for `npm start` | `dist-artifact/artifact.html`, one file |
| Data | `server.ts`'s JSON API, live over an event stream | the artifact's `db`, filled by `sync.ts` and its sync agent |
| Buttons | `POST /api/actions`, appended to `actions.jsonl` | an `actions` document, carried to `actions.jsonl` by the sync |
| Routes | real paths (`/adr/vm`) | the fragment (`#/adr/vm`); the viewer owns the URL |
| ADR viewer | yes | links to GitHub instead (it can't reach GitHub) |
| Diff viewer | `/api/diff/:id`, built on request | `diffs` and `diffParts` documents, for open PRs |
| Chat | `POST /api/chat` to `chat.jsonl`; replies from `chat-replies.jsonl` | an `actions` document of kind `chat`, carried to `chat.jsonl` by the sync; the thread comes back as `chat` documents |

## The board and the chat

The board is an inbox (`app/ui/board.tsx`): the chat with the manager and the table's rows down
the left, with what needs the owner first and a mark for where each row's work stands, and the
chosen one in full on the right. The look is "Signal", dark only: Bricolage Grotesque and Martian
Mono, no boxes, the owner's move in amber.

The chat is one thread. The owner's messages go to `chat.jsonl`, which the manager's `site-chat`
monitor watches; the manager answers with `scripts/chat reply`, into `chat-replies.jsonl`, so its
replies wake nothing (the `table` skill, "Chat").

## The diff viewer

Each PR has a diff page (`/diff/:repo/:number`, the row's "diff" link) with four tabs:

- **Contract**: declarations added, removed, or with a changed signature. A type's whole
  definition is its signature, so a new struct field or interface method shows here.
- **Docs**: the PR's markdown files rendered, with changed words marked and unchanged blocks
  (and table rows) folded.
- **Implementation**: the contract, plus every declaration whose body changed, each with its
  body's diff.
- **Lines**: GitHub's patch, with old and new line numbers.

`server/diff/` builds it on the server from the merge base and the head, reading both versions
of each file from GitHub. `declarations.ts` parses Go, TypeScript/TSX/JavaScript and Python with
tree-sitter (`web-tree-sitter` and the grammars' own `.wasm` files, so nothing native builds):
what comes before a declaration's body is its signature, and signatures are compared with
comments and spacing ignored. Other languages, and generated files, appear under Lines only. A
Both versions of every file are read in a few batched GraphQL queries (contents requests only
for what GraphQL won't return in full), and file texts and built diffs are cached on disk in
`~/.local/state/discobox-manager/diff-cache/`, shared by the site and the sync, so a PR is read
from GitHub once. Contract and Implementation show only the code: each changed declaration as
written, without its comments, by file, green where added and red where removed. A
PR's diff is one small document (the file list and declaration changes) plus one part per file
(its patch, rendered docs and body diffs), so each fits the artifact's database.

## Layout

- `index.html`: the page shell and the stylesheet (design tokens, both themes).
- `app/`: the browser app. `routes.ts`, `router.tsx` and `actions/controller.tsx` hold the
  routes; `ui/` the components; `store/` the two data sources; `shared/` the types and helpers
  the server uses too; `routing.ts` the path or fragment routing.
- `server/`: Node only. Reads the table, `actions.jsonl` and GitHub (read-only, with `GH_TOKEN`),
  and builds the documents (`docs.ts`; `diff/` for the diff viewer). `api.ts` and
  `controller.ts` are the JSON API.
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

1. Change `app/` (or `server/`). The site shows it as soon as it's saved: Vite hot-reloads
   `app/`, and the server and the sync restart themselves when `server/`, `server.ts`,
   `sync.ts` or `app/shared` change (`start.sh`, `sync.sh`).
2. Run `npm test` and `npm run typecheck`, then commit and push to `main` (this repository's rule).
3. Republish the artifact: `npm run build`, then the Artifact tool on
   `site/dist-artifact/artifact.html` with `url` set to the "Manager status" URL (the `table`
   skill), and no `capabilities`, so the stored `db` and `user` grants carry forward. A new
   collection needs its rule added: then pass the whole `capabilities` set (the `table` skill
   lists it).

The services start at the box's boot. A box booted before they were declared doesn't run them
until it reboots; start them by hand meanwhile, detached, from the repository root:
`setsid nohup .discobox/services/manager-site > ~/.local/state/discobox-manager/site.log 2>&1 &`
(and `manager-sync` into `sync.log`).

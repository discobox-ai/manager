import type { Handle, RemixNode } from 'remix/component'
import { unsafeHTML } from 'remix/component'
import { ImportMap } from 'remix/component/server'

import { scriptEntry } from '../assets.ts'

export interface DocumentProps {
  children?: RemixNode
  title?: string
}

// App-owned tokens and base rules, in a layer before the generated `rmx` layer so css(...) wins.
const GLOBAL_CSS = `
@layer base, rmx;
@layer base {
  :root {
    color-scheme: light dark;
    --bg: #f6f7f9; --card: #ffffff; --fg: #1d2127; --muted: #646b75; --border: #dde1e6;
    --accent: #2160c4; --accent-bg: #e7effb; --move: #8a4b00; --move-bg: #fff4e0; --move-border: #f0c47a;
    --danger: #c42b2b; --danger-bg: #fdeaea; --ok: #1b7f3b; --ok-bg: #e6f5ea; --warn: #9a6700; --warn-bg: #fff8db;
    --code-bg: #f0f2f5;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111418; --card: #1a1e24; --fg: #e3e6ea; --muted: #9aa2ad; --border: #2c323a;
      --accent: #74a7ff; --accent-bg: #1c2a40; --move: #ffc46b; --move-bg: #2e2312; --move-border: #6b4d1c;
      --danger: #ff7b7b; --danger-bg: #3a1a1a; --ok: #6fd28a; --ok-bg: #16301f; --warn: #e8c35a; --warn-bg: #2f2812;
      --code-bg: #232931;
    }
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  a { color: var(--accent); }
  code, pre, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
  button, input, select, textarea { font: inherit; color: inherit; }
  button {
    cursor: pointer; border: 1px solid var(--border); background: var(--card);
    border-radius: 6px; padding: 3px 10px;
  }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  button.danger { background: var(--danger); color: #fff; border-color: var(--danger); font-weight: 600; }
  a.btn {
    display: inline-block; text-decoration: none; color: inherit; border: 1px solid var(--border);
    background: var(--card); border-radius: 6px; padding: 3px 10px;
  }
  a.btn:hover { border-color: var(--accent); }
  a.btn.merge-prominent {
    background: #1f883d; border-color: #1f883d; color: #fff; font-weight: 600; padding: 4px 14px;
  }
  a.btn.merge-prominent:hover { background: #1a7f37; }
  dialog::backdrop { background: rgba(0, 0, 0, 0.45); }
  textarea, input[type=text] {
    width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px;
  }
  .md { overflow-wrap: anywhere; }
  .md img { max-width: 100%; }
  .md pre { background: var(--code-bg); padding: 8px 10px; border-radius: 6px; overflow-x: auto; }
  .md code { background: var(--code-bg); padding: 1px 4px; border-radius: 4px; }
  .md pre code { background: none; padding: 0; }
  .md table { border-collapse: collapse; display: block; overflow-x: auto; }
  .md th, .md td { border: 1px solid var(--border); padding: 4px 10px; vertical-align: top; }
  .md th { background: var(--code-bg); text-align: left; }
  .md table { overflow-wrap: normal; }
  .md td:first-child { white-space: nowrap; }
  .md tbody tr:nth-child(2n) td { background: color-mix(in srgb, var(--code-bg) 45%, transparent); }
  .md h1 { font-size: 1.5em; padding-bottom: 0.25em; border-bottom: 1px solid var(--border); }
  .md h2 { font-size: 1.25em; padding-bottom: 0.2em; border-bottom: 1px solid var(--border); }
  .md h3 { font-size: 1.1em; }
  .md a.gh-link { font-size: 0.85em; color: var(--muted); }
  .md hr { border: 0; border-top: 1px solid var(--border); }
  .md blockquote { margin: 0; padding-left: 12px; border-left: 3px solid var(--border); color: var(--muted); }
  .md > :first-child { margin-top: 0; }
  .md > :last-child { margin-bottom: 0; }
}
`

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, title = 'Manager' } = handle.props
    let { href, importMap, preloads } = scriptEntry

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <title>{title}</title>
          <style innerHTML={unsafeHTML(GLOBAL_CSS)} />
          <ImportMap value={importMap} />
          {preloads.map((preloadHref) => (
            <link key={preloadHref} rel="modulepreload" href={preloadHref} />
          ))}
          <script type="module" src={href}></script>
        </head>
        <body>{children}</body>
      </html>
    )
  }
}

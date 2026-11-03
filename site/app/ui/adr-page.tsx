import type { Handle, RemixNode } from 'remix/component'

import type { AdrIndexView } from '../shared/docs.ts'
import { githubOrg } from '../shared/refs.ts'
import { routes } from '../routes.ts'
import { href } from '../routing.ts'
import { Markdown } from './html.tsx'
import { Page } from './shell.tsx'

function githubHref(repo: string, file: string | undefined, ref: string | undefined): string {
  let at = ref ?? 'HEAD'
  return `https://github.com/${githubOrg}/${repo}/${file ? `blob/${at}/docs/adr/${file}` : `tree/${at}/docs/adr`}`
}

function withRef(path: string, ref: string | undefined): string {
  return ref ? `${path}?ref=${encodeURIComponent(ref)}` : path
}

/** Breadcrumbs, the ref the file was read at, and the same file on GitHub. */
function AdrFrame(handle: Handle<{ repo: string; file?: string; gitRef?: string; title: string; children?: RemixNode }>) {
  return () => {
    let { repo, file, gitRef, title, children } = handle.props
    return (
      <Page title={`${title} · ${repo} ADRs`}>
        <nav class="crumbs" aria-label="Breadcrumbs">
          <a href={href(routes.home.href())}>Manager status</a>
          <span>/</span>
          <a href={href(withRef(routes.adrIndex.href({ repo }), gitRef))}>
            {githubOrg}/{repo} ADRs
          </a>
          {file ? (
            <>
              <span>/</span>
              <span class="mono">{file}</span>
            </>
          ) : null}
          <span class="at">
            {gitRef ? (
              <>
                at <span class="mono">{gitRef.length === 40 ? gitRef.slice(0, 10) : gitRef}</span> ·{' '}
              </>
            ) : (
              'default branch · '
            )}
            <a href={githubHref(repo, file, gitRef)} target="_blank" rel="noopener noreferrer">
              on GitHub
            </a>
          </span>
        </nav>
        {children}
      </Page>
    )
  }
}

export function AdrPage(
  handle: Handle<{ repo: string; file: string; gitRef?: string; title: string; html: string | null; error?: string }>,
) {
  return () => {
    let { repo, file, gitRef, title, html, error } = handle.props
    return (
      <AdrFrame repo={repo} file={file} gitRef={gitRef} title={title}>
        {error ? (
          <p class="error">
            Couldn't load {file}: {error}
          </p>
        ) : null}
        {html ? (
          <article class="sheet">
            <Markdown html={html} />
          </article>
        ) : null}
      </AdrFrame>
    )
  }
}

export function AdrIndexPage(handle: Handle<AdrIndexView & { repo: string; gitRef?: string }>) {
  return () => {
    let { repo, gitRef, html, entries, error } = handle.props
    return (
      <AdrFrame repo={repo} gitRef={gitRef} title="ADR index">
        {error ? <p class="error">Couldn't load the ADR index: {error}</p> : null}
        {html ? (
          <article class="sheet">
            <Markdown html={html} />
          </article>
        ) : null}
        {entries.length ? (
          <section class="sheet" aria-labelledby="h-files">
            <h2 id="h-files">All ADR files ({entries.length})</h2>
            <ul class="adr-files">
              {entries.map((name) => (
                <li key={name}>
                  <a class="mono" href={href(withRef(routes.adr.href({ repo, name: name.replace(/\.md$/, '') }), gitRef))}>
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </AdrFrame>
    )
  }
}

/** The artifact has no ADR viewer (it can't reach GitHub); the file opens on GitHub instead. */
export function AdrUnavailable(handle: Handle<{ repo: string; file?: string; ref?: string }>) {
  return () => {
    let { repo, file, ref } = handle.props
    return (
      <AdrFrame repo={repo} file={file} gitRef={ref} title={file ?? 'ADR index'}>
        <p class="notice">
          <strong>ADRs open on GitHub from here.</strong> This view can't read repositories.{' '}
          <a href={githubHref(repo, file, ref)} target="_blank" rel="noopener noreferrer">
            Open {file ?? `the ${repo} ADRs`} on GitHub
          </a>
        </p>
      </AdrFrame>
    )
  }
}

import { createController } from 'remix/router'

import { routes } from '../routes.ts'
import { store } from '../store/index.ts'
import { AdrIndexPage, AdrPage, AdrUnavailable } from '../ui/adr-page.tsx'
import { BoardPage } from '../ui/board.tsx'
import { DiffPage, tabFrom } from '../ui/diff-page.tsx'
import { NotFound } from '../ui/shell.tsx'

const REPO = /^[A-Za-z0-9_.-]+$/

export default createController(routes, {
  actions: {
    home({ render }) {
      return render(<BoardPage store={store} />)
    },

    diff({ render, params, url }) {
      let { repo, number } = params
      if (!REPO.test(repo) || !/^\d+$/.test(number)) return render(<NotFound path={url.pathname} />, { status: 404 })
      let tab = url.searchParams.get('tab')
      return render(<DiffPage id={`${repo}~pull~${number}`} tab={tabFrom(tab)} store={store} />)
    },

    async adr({ render, params, url }) {
      let { repo } = params
      let file = `${params.name}.md`
      let ref = url.searchParams.get('ref') || undefined
      if (!REPO.test(repo) || !/^[\w.-]+\.md$/.test(file)) return render(<AdrUnavailable repo={repo} file={file} />, { status: 404 })
      if (!store.adr) return render(<AdrUnavailable repo={repo} file={file} ref={ref} />)
      try {
        let view = await store.adr.file(repo, file, ref)
        return render(<AdrPage repo={repo} file={file} gitRef={ref} title={view.title} html={view.html} />)
      } catch (error: any) {
        return render(<AdrPage repo={repo} file={file} gitRef={ref} title={file} html={null} error={error?.message ?? String(error)} />)
      }
    },

    async adrIndex({ render, params, url }) {
      let { repo } = params
      let ref = url.searchParams.get('ref') || undefined
      if (!REPO.test(repo)) return render(<AdrUnavailable repo={repo} />, { status: 404 })
      if (!store.adr) return render(<AdrUnavailable repo={repo} ref={ref} />)
      try {
        let view = await store.adr.index(repo, ref)
        return render(<AdrIndexPage repo={repo} gitRef={ref} {...view} />)
      } catch (error: any) {
        return render(<AdrIndexPage repo={repo} gitRef={ref} html={null} entries={[]} error={error?.message ?? String(error)} />)
      }
    },
  },
})

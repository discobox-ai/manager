import { defineConfig, type Plugin } from 'vite'

// `vite build` makes the box's app (dist/, served by server.ts). `vite build --mode artifact`
// makes the claude.ai artifact: one file, dist-artifact/artifact.html, for the Artifact tool.
export default defineConfig(({ mode }) =>
  mode === 'artifact'
    ? {
        publicDir: false,
        plugins: [artifactFile()],
        build: {
          outDir: 'dist-artifact',
          modulePreload: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      }
    : {},
)

/**
 * Folds the build into the one file the Artifact tool publishes: the script inlined, and the
 * <html>, <head> and <body> wrappers and the tags they hold dropped, since publish adds its own
 * skeleton (charset, viewport) and the artifact has no favicon of ours.
 */
function artifactFile(): Plugin {
  return {
    name: 'artifact-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      let html = bundle['index.html']
      if (html?.type !== 'asset') return
      let source = String(html.source)
      for (let [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue
        let tag = new RegExp(`<script type="module" crossorigin src="[^"]*${name.replace(/[.]/g, '\\.')}"></script>`)
        if (!tag.test(source)) this.error(`artifact-file: no script tag for ${name} in index.html`)
        let code = chunk.code.replaceAll('</script', '<\\/script')
        source = source.replace(tag, () => `<script type="module">${code}</script>`)
        delete bundle[name]
      }
      let head = source.match(/<head>([\s\S]*)<\/head>/)?.[1] ?? ''
      let body = source.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? ''
      head = head.replace(/\s*<meta (charset|name="viewport")[^>]*>|\s*<link rel="icon"[^>]*>/g, '')
      delete bundle['index.html']
      this.emitFile({ type: 'asset', fileName: 'artifact.html', source: `${head.trim()}\n${body.trim()}\n` })
    },
  }
}

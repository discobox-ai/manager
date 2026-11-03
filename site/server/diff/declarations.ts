// A source file's declarations, read with tree-sitter: each one's signature (the part callers
// depend on) and body (the part only it depends on), so two versions can be compared by name.
import { createRequire } from 'node:module'

import { Language, Parser, type Node } from 'web-tree-sitter'

export type LanguageName = 'go' | 'typescript' | 'tsx' | 'python'

export type DeclKind = 'func' | 'method' | 'type' | 'interface' | 'class' | 'enum' | 'const' | 'var' | 'field'

export interface Decl {
  /** Unique in its file: kind, container and name, with "#2" on a repeat (Go's init, overloads). */
  key: string
  kind: DeclKind
  name: string
  /** The type a method or field belongs to. */
  container?: string
  /** As written, comments and all. */
  signature: string
  /** Comments dropped and spacing removed but between words: what's compared. */
  signatureKey: string
  body: string | null
  bodyKey: string | null
  /** 1-based line of the declaration and of its body's first line. */
  line: number
  bodyLine: number | null
  exported: boolean
}

const EXTENSIONS: Record<string, LanguageName> = {
  '.go': 'go',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  // The TSX grammar reads plain JavaScript (and JSX) too.
  '.js': 'tsx',
  '.jsx': 'tsx',
  '.mjs': 'tsx',
  '.cjs': 'tsx',
  '.py': 'python',
}

export function languageFor(filename: string): LanguageName | null {
  let dot = filename.lastIndexOf('.')
  if (dot < 0 || /\.min\.js$/.test(filename)) return null
  return EXTENSIONS[filename.slice(dot)] ?? null
}

const require = createRequire(import.meta.url)
const WASM: Record<LanguageName, string> = {
  go: 'tree-sitter-go/tree-sitter-go.wasm',
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
}

let ready: Promise<void> | null = null
let languages = new Map<LanguageName, Promise<Language>>()

async function parserFor(name: LanguageName): Promise<Parser> {
  ready ??= Parser.init()
  await ready
  let lang = languages.get(name)
  if (!lang) {
    lang = Language.load(require.resolve(WASM[name]))
    languages.set(name, lang)
  }
  let parser = new Parser()
  parser.setLanguage(await lang)
  return parser
}

/** The file's declarations, or null when tree-sitter couldn't make sense of it. */
export async function declarations(source: string, lang: LanguageName): Promise<Decl[] | null> {
  let parser = await parserFor(lang)
  try {
    let tree = parser.parse(source)
    if (!tree) return null
    try {
      let out = new Collector(source)
      if (lang === 'go') goDecls(tree.rootNode, out)
      else if (lang === 'python') pyDecls(tree.rootNode, out, undefined)
      else tsDecls(tree.rootNode, out)
      return out.decls
    } finally {
      tree.delete()
    }
  } finally {
    parser.delete()
  }
}

class Collector {
  decls: Decl[] = []
  #seen = new Map<string, number>()
  constructor(public source: string) {}

  /**
   * One declaration spanning [start, end) of the source, with an optional body node; everything
   * before the body is the signature.
   */
  add(d: {
    kind: DeclKind
    name: string
    container?: string
    start: Node
    end?: Node
    body?: Node | null
    /** Where the signature stops when there's no body to compare (a class's members). */
    sigEnd?: Node | null
    prefix?: string
    exported: boolean
  }) {
    let from = d.start.startIndex
    let to = (d.end ?? d.start).endIndex
    let body = d.body ?? null
    let sigEnd = body ? body.startIndex : d.sigEnd ? d.sigEnd.startIndex : to
    // A value's "=" belongs with the value: "var D map[string]int", not "... int =".
    let trimEq = (t: string) => t.trimEnd().replace(/\s*=$/, '')
    let signature = trimEq((d.prefix ?? '') + this.source.slice(from, sigEnd))
    let base = `${d.kind}:${d.container ? d.container + '.' : ''}${d.name}`
    let n = (this.#seen.get(base) ?? 0) + 1
    this.#seen.set(base, n)
    this.decls.push({
      key: n === 1 ? base : `${base}#${n}`,
      kind: d.kind,
      name: d.name,
      ...(d.container ? { container: d.container } : {}),
      signature,
      signatureKey: trimEq((d.prefix ?? '') + this.normalized(d.start, from, sigEnd)),
      body: body ? this.source.slice(body.startIndex, body.endIndex) : null,
      bodyKey: body ? this.normalized(body, body.startIndex, body.endIndex) : null,
      line: d.start.startPosition.row + 1,
      bodyLine: body ? body.startPosition.row + 1 : null,
      exported: d.exported,
    })
  }

  /** [from, to) with its comments removed and runs of whitespace made one space. */
  normalized(node: Node, from: number, to: number): string {
    let text = ''
    let at = from
    for (let c of comments(node)) {
      if (c.startIndex < at || c.endIndex > to) continue
      text += this.source.slice(at, c.startIndex) + ' '
      at = c.endIndex
    }
    text += this.source.slice(at, to)
    // Spacing only matters between two words: "C( x  string )" is "C(x string)".
    return text
      .replace(/\s+/g, ' ')
      .replace(/ ?([^\p{L}\p{N}_ ]) ?/gu, '$1')
      .trim()
  }
}

function comments(node: Node): Node[] {
  return node.descendantsOfType(['comment', 'line_comment', 'block_comment']).filter((c): c is Node => c !== null)
}

function field(node: Node, name: string): Node | null {
  return node.childForFieldName(name)
}

// --- Go -------------------------------------------------------------------------------------

function goExported(name: string): boolean {
  return /^\p{Lu}/u.test(name)
}

function goDecls(root: Node, out: Collector) {
  for (let node of root.namedChildren) {
    if (!node) continue
    switch (node.type) {
      case 'function_declaration': {
        let name = field(node, 'name')?.text ?? '?'
        out.add({ kind: 'func', name, start: node, body: field(node, 'body'), exported: goExported(name) })
        break
      }
      case 'method_declaration': {
        let name = field(node, 'name')?.text ?? '?'
        let receiver = field(node, 'receiver')
        let type = receiver?.descendantsOfType('type_identifier')[0]?.text ?? '?'
        out.add({ kind: 'method', name, container: type, start: node, body: field(node, 'body'), exported: goExported(name) && goExported(type) })
        break
      }
      case 'type_declaration':
        for (let spec of node.namedChildren) {
          if (!spec || (spec.type !== 'type_spec' && spec.type !== 'type_alias')) continue
          let name = field(spec, 'name')?.text ?? '?'
          let type = field(spec, 'type')
          let kind: DeclKind = type?.type === 'interface_type' ? 'interface' : 'type'
          out.add({ kind, name, start: spec, prefix: 'type ', exported: goExported(name) })
        }
        break
      case 'const_declaration':
      case 'var_declaration': {
        let kind: DeclKind = node.type === 'const_declaration' ? 'const' : 'var'
        let specs = node.descendantsOfType(kind === 'const' ? 'const_spec' : 'var_spec').filter((s): s is Node => s !== null)
        for (let spec of specs) {
          let names = spec.childrenForFieldName('name').filter((n): n is Node => n?.type === 'identifier').map((n) => n.text)
          let name = names.join(', ') || '?'
          // A var's type is its contract, its value the implementation; a const's value is both.
          let value = kind === 'var' ? field(spec, 'value') : null
          out.add({ kind, name, start: spec, body: value, prefix: kind + ' ', exported: names.some(goExported) })
        }
        break
      }
    }
  }
}

// --- TypeScript and JavaScript --------------------------------------------------------------

function tsDecls(root: Node, out: Collector) {
  for (let node of root.namedChildren) {
    if (!node) continue
    if (node.type === 'export_statement') {
      let inner = field(node, 'declaration') ?? node.namedChildren.find((c) => c && isTsDecl(c.type)) ?? null
      if (inner) tsDecl(inner, out, node, true)
      continue
    }
    if (node.type === 'ambient_declaration') {
      let inner = node.namedChildren.find((c) => c && isTsDecl(c.type)) ?? null
      if (inner) tsDecl(inner, out, node, false)
      continue
    }
    if (isTsDecl(node.type)) tsDecl(node, out, node, false)
  }
}

const TS_DECLS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_signature',
  'function_expression',
  'class_declaration',
  'abstract_class_declaration',
  'class',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration',
  'variable_declaration',
])

function isTsDecl(type: string): boolean {
  return TS_DECLS.has(type)
}

/** `start` is where the signature begins: the export or declare keyword when there is one. */
function tsDecl(node: Node, out: Collector, start: Node, exported: boolean) {
  let name = field(node, 'name')?.text ?? 'default'
  switch (node.type) {
    case 'function_declaration':
    case 'generator_function_declaration':
    case 'function_expression':
    case 'function_signature':
      out.add({ kind: 'func', name, start, end: node, body: field(node, 'body'), exported })
      return
    case 'class_declaration':
    case 'abstract_class_declaration':
    case 'class': {
      // The header (name, type parameters, heritage) is the class's signature; its members are
      // compared one by one, so the class itself has no body to compare.
      let body = field(node, 'body')
      out.add({ kind: 'class', name, start, end: body ?? node, exported, sigEnd: body })
      for (let member of body?.namedChildren ?? []) if (member) tsMember(member, name, out, exported)
      return
    }
    case 'interface_declaration':
      out.add({ kind: 'interface', name, start, end: node, exported })
      return
    case 'type_alias_declaration':
      out.add({ kind: 'type', name, start, end: node, exported })
      return
    case 'enum_declaration':
      out.add({ kind: 'enum', name, start, end: node, exported })
      return
    case 'lexical_declaration':
    case 'variable_declaration': {
      let keyword = node.child(0)?.text ?? 'const'
      for (let d of node.namedChildren) {
        if (!d || d.type !== 'variable_declarator') continue
        let n = field(d, 'name')?.text ?? '?'
        let value = field(d, 'value')
        let prefix = (exported ? 'export ' : '') + keyword + ' '
        if (value && (value.type === 'arrow_function' || value.type === 'function_expression' || value.type === 'function')) {
          out.add({ kind: 'func', name: n, start: d, body: field(value, 'body'), prefix, exported })
        } else {
          out.add({ kind: keyword === 'const' ? 'const' : 'var', name: n, start: d, body: value, prefix, exported })
        }
      }
      return
    }
  }
}

function tsMember(member: Node, container: string, out: Collector, classExported: boolean) {
  let name = field(member, 'name')?.text
  if (!name) return
  let modifiers = member.namedChildren.filter((c) => c?.type === 'accessibility_modifier').map((c) => c!.text)
  let exported = classExported && !modifiers.includes('private') && !modifiers.includes('protected') && !name.startsWith('#')
  switch (member.type) {
    case 'method_definition':
    case 'method_signature':
    case 'abstract_method_signature':
      out.add({ kind: 'method', name, container, start: member, body: field(member, 'body'), exported })
      return
    case 'public_field_definition':
    case 'property_signature':
      out.add({ kind: 'field', name, container, start: member, body: field(member, 'value'), exported })
      return
  }
}

// --- Python ---------------------------------------------------------------------------------

function pyDecls(block: Node, out: Collector, container: string | undefined) {
  for (let node of block.namedChildren) {
    if (!node) continue
    let def = node.type === 'decorated_definition' ? field(node, 'definition') : node
    if (!def) continue
    let name = field(def, 'name')?.text ?? '?'
    let exported = !name.startsWith('_') || (name.startsWith('__') && name.endsWith('__'))
    if (def.type === 'function_definition') {
      out.add({ kind: container ? 'method' : 'func', name, container, start: node, end: def, body: field(def, 'body'), exported })
    } else if (def.type === 'class_definition') {
      let body = field(def, 'body')
      out.add({ kind: 'class', name, container, start: node, end: def, exported, sigEnd: body })
      if (body && !container) pyDecls(body, out, name)
    }
  }
}

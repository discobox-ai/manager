// A small syntax highlighter for the diff viewer: keywords, types, function names, strings,
// numbers and comments, found by pattern, the way discobox-ai/review colors only those categories
// and leaves plain names and punctuation alone (a line where everything is colored emphasizes
// nothing). The page then shades each category green on added text, red on removed, grey on the
// rest, so the change still reads first.

export type Token = 'kw' | 'type' | 'fn' | 'str' | 'num' | 'com'

/** One class per character of the text, or null for plain. */
export type Classes = (Token | null)[]

interface Lang {
  keywords: Set<string>
  types: Set<string>
  /** A capitalized name is a type (TypeScript classes and interfaces; not Go, where it means exported). */
  capitalTypes: boolean
  lineComment: string[]
  blockComment: boolean
  /** String openers; backtick and triple quotes may run over lines. */
  quotes: string[]
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean))

const GO: Lang = {
  keywords: words(
    'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota',
  ),
  types: words(
    'any bool byte comparable complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr',
  ),
  capitalTypes: false,
  lineComment: ['//'],
  blockComment: true,
  quotes: ['"', '`', "'"],
}

const TS: Lang = {
  keywords: words(
    'abstract as async await break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface is keyof let new null of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void while yield',
  ),
  types: words('any bigint boolean never number object string symbol unknown void Promise Record Array Map Set'),
  capitalTypes: true,
  lineComment: ['//'],
  blockComment: true,
  quotes: ['"', "'", '`'],
}

const PY: Lang = {
  keywords: words(
    'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield',
  ),
  types: words('bool bytes dict float int list object set str tuple type'),
  capitalTypes: true,
  lineComment: ['#'],
  blockComment: false,
  quotes: ['"""', "'''", '"', "'"],
}

export function langOf(language: string | undefined): Lang | null {
  if (language === 'go') return GO
  if (language === 'typescript' || language === 'tsx') return TS
  if (language === 'python') return PY
  return null
}

const IDENT = /[A-Za-z_$][\w$]*/y
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)n?/y

/** Classes for every character of `text`, lexed as one piece so strings and comments can span lines. */
export function highlight(text: string, lang: Lang | null): Classes {
  let out: Classes = new Array(text.length).fill(null)
  if (!lang) return out
  let mark = (from: number, to: number, cls: Token) => {
    for (let i = from; i < to; i++) out[i] = cls
  }
  let i = 0
  while (i < text.length) {
    let c = text[i]
    // Comments
    let line = lang.lineComment.find((p) => text.startsWith(p, i))
    if (line) {
      let end = text.indexOf('\n', i)
      end = end < 0 ? text.length : end
      mark(i, end, 'com')
      i = end
      continue
    }
    if (lang.blockComment && text.startsWith('/*', i)) {
      let end = text.indexOf('*/', i + 2)
      end = end < 0 ? text.length : end + 2
      mark(i, end, 'com')
      i = end
      continue
    }
    // Strings
    let quote = lang.quotes.find((q) => text.startsWith(q, i))
    if (quote) {
      let multi = quote === '`' || quote.length === 3
      let j = i + quote.length
      while (j < text.length && !text.startsWith(quote, j)) {
        if (text[j] === '\\' && quote !== '`') j++
        else if (text[j] === '\n' && !multi) break
        j++
      }
      let end = Math.min(text.length, text.startsWith(quote, j) ? j + quote.length : j)
      mark(i, end, 'str')
      i = end
      continue
    }
    // Numbers (not the tail of a name)
    if (/\d/.test(c) && !/[\w$]/.test(text[i - 1] ?? '')) {
      NUMBER.lastIndex = i
      let m = NUMBER.exec(text)
      if (m) {
        mark(i, i + m[0].length, 'num')
        i += m[0].length
        continue
      }
    }
    // Names: keywords, types, and a name called right after it is written
    IDENT.lastIndex = i
    let m = /[A-Za-z_$]/.test(c) ? IDENT.exec(text) : null
    if (m) {
      let word = m[0]
      let end = i + word.length
      let after = text.slice(end).match(/^\s*(.)/)?.[1]
      let cls: Token | null = lang.keywords.has(word)
        ? 'kw'
        : lang.types.has(word) || (lang.capitalTypes && /^[A-Z]/.test(word) && after !== '(')
          ? 'type'
          : after === '('
            ? 'fn'
            : null
      if (cls) mark(i, end, cls)
      i = end
      continue
    }
    i++
  }
  return out
}

/** Cuts [from, to) of a text into runs of one class each. */
export function runs(text: string, classes: Classes, from = 0, to = text.length): { text: string; cls: Token | null }[] {
  let out: { text: string; cls: Token | null }[] = []
  let start = from
  for (let i = from + 1; i <= to; i++) {
    if (i === to || classes[i] !== classes[start]) {
      out.push({ text: text.slice(start, i), cls: classes[start] ?? null })
      start = i
    }
  }
  return out
}

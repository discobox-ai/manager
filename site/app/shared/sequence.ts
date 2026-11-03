// Myers' O(ND) difference over any two sequences, the algorithm behind `diff` and git. Shared:
// the server diffs files and bodies with it, the page diffs signatures word by word.

export type Op = 'equal' | 'insert' | 'delete'

/** A run of one kind: [aStart, aEnd) of a and [bStart, bEnd) of b (one side empty unless equal). */
export interface Run {
  op: Op
  aStart: number
  aEnd: number
  bStart: number
  bEnd: number
}

/**
 * The shortest edit from a to b, as runs. Past `maxEdits` (very different inputs) it gives up on a
 * minimal answer and reports the whole middle as replaced, so a huge rewrite stays cheap.
 */
export function diffSequence<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = Object.is, maxEdits = 4000): Run[] {
  // Trim the common head and tail first: most edits are small, and it keeps the search small.
  let start = 0
  while (start < a.length && start < b.length && eq(a[start], b[start])) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) {
    endA--
    endB--
  }
  let middle = myers(a, b, start, endA, start, endB, eq, maxEdits)
  let runs: Run[] = []
  let push = (op: Op, aStart: number, aEnd: number, bStart: number, bEnd: number) => {
    if (aStart === aEnd && bStart === bEnd) return
    let last = runs.at(-1)
    if (last && last.op === op && last.aEnd === aStart && last.bEnd === bStart) {
      last.aEnd = aEnd
      last.bEnd = bEnd
    } else runs.push({ op, aStart, aEnd, bStart, bEnd })
  }
  push('equal', 0, start, 0, start)
  for (let r of middle) push(r.op, r.aStart, r.aEnd, r.bStart, r.bEnd)
  push('equal', endA, a.length, endB, b.length)
  return runs
}

function myers<T>(a: readonly T[], b: readonly T[], a0: number, a1: number, b0: number, b1: number, eq: (x: T, y: T) => boolean, maxEdits: number): Run[] {
  let n = a1 - a0
  let m = b1 - b0
  if (n === 0 && m === 0) return []
  if (n === 0) return [{ op: 'insert', aStart: a0, aEnd: a0, bStart: b0, bEnd: b1 }]
  if (m === 0) return [{ op: 'delete', aStart: a0, aEnd: a1, bStart: b0, bEnd: b0 }]
  let max = Math.min(n + m, maxEdits)
  let offset = max
  let v = new Int32Array(2 * max + 2)
  let trace: Int32Array[] = []
  let found = false
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && eq(a[a0 + x], b[b0 + y])) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = true
        break
      }
    }
    if (found) break
  }
  if (!found) {
    return [
      { op: 'delete', aStart: a0, aEnd: a1, bStart: b0, bEnd: b0 },
      { op: 'insert', aStart: a1, aEnd: a1, bStart: b0, bEnd: b1 },
    ]
  }
  // Walk the trace back from (n, m), one edit per step.
  let ops: Run[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d > 0; d--) {
    let vPrev = trace[d]
    let k = x - y
    let prevK = k === -d || (k !== d && vPrev[offset + k - 1] < vPrev[offset + k + 1]) ? k + 1 : k - 1
    let prevX = vPrev[offset + prevK]
    let prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x--
      y--
      ops.push({ op: 'equal', aStart: a0 + x, aEnd: a0 + x + 1, bStart: b0 + y, bEnd: b0 + y + 1 })
    }
    if (x === prevX) {
      y--
      ops.push({ op: 'insert', aStart: a0 + x, aEnd: a0 + x, bStart: b0 + y, bEnd: b0 + y + 1 })
    } else {
      x--
      ops.push({ op: 'delete', aStart: a0 + x, aEnd: a0 + x + 1, bStart: b0 + y, bEnd: b0 + y })
    }
  }
  while (x > 0 && y > 0) {
    x--
    y--
    ops.push({ op: 'equal', aStart: a0 + x, aEnd: a0 + x + 1, bStart: b0 + y, bEnd: b0 + y + 1 })
  }
  return ops.reverse()
}

/** A unified diff of two texts' lines ("@@ -1,3 +1,4 @@" hunks), or null when they're equal. */
export function unifiedDiff(before: string, after: string, { context = 3, startA = 1, startB = 1, maxLines = 400 } = {}): string | null {
  let a = before.split('\n')
  let b = after.split('\n')
  let runs = diffSequence(a, b)
  if (runs.every((r) => r.op === 'equal')) return null
  // Lines tagged with their run, then grouped into hunks with `context` equal lines around changes.
  type Line = { tag: ' ' | '+' | '-'; text: string; ai: number; bi: number }
  let lines: Line[] = []
  for (let r of runs) {
    if (r.op === 'equal') for (let i = 0; i < r.aEnd - r.aStart; i++) lines.push({ tag: ' ', text: a[r.aStart + i], ai: r.aStart + i, bi: r.bStart + i })
    else if (r.op === 'delete') for (let i = r.aStart; i < r.aEnd; i++) lines.push({ tag: '-', text: a[i], ai: i, bi: r.bStart })
    else for (let i = r.bStart; i < r.bEnd; i++) lines.push({ tag: '+', text: b[i], ai: r.aStart, bi: i })
  }
  let out: string[] = []
  let i = 0
  while (i < lines.length) {
    while (i < lines.length && lines[i].tag === ' ') i++
    if (i >= lines.length) break
    let from = Math.max(0, i - context)
    let to = i
    // Extend while the next change is within 2*context equal lines.
    while (to < lines.length) {
      if (lines[to].tag !== ' ') {
        to++
        continue
      }
      let j = to
      while (j < lines.length && lines[j].tag === ' ') j++
      if (j < lines.length && j - to <= 2 * context) to = j
      else {
        to = Math.min(lines.length, to + context)
        break
      }
    }
    let hunk = lines.slice(from, to)
    let aCount = hunk.filter((l) => l.tag !== '+').length
    let bCount = hunk.filter((l) => l.tag !== '-').length
    let aFirst = hunk.find((l) => l.tag !== '+')?.ai ?? hunk[0].ai
    let bFirst = hunk.find((l) => l.tag !== '-')?.bi ?? hunk[0].bi
    out.push(`@@ -${aFirst + startA},${aCount} +${bFirst + startB},${bCount} @@`)
    for (let l of hunk) out.push(l.tag + l.text)
    i = to
  }
  if (out.length > maxLines) return out.slice(0, maxLines).join('\n') + `\n… ${out.length - maxLines} more lines`
  return out.join('\n')
}

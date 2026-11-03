// Eight prototype layouts for the board, picked with the switcher (or ?layout=…). Each gets the
// same data and the same row pieces (common.tsx); they differ in what shows before you ask.
import { on, ref, type Handle } from 'remix/component'

import type { RowDoc } from '../../shared/docs.ts'
import { hasMove } from '../../shared/refs.ts'
import {
  groups,
  LineRow,
  MOVE_LABEL,
  moveKind,
  Notice,
  parts,
  present,
  RecentLine,
  RowBody,
  stage,
  STAGE_GLYPH,
  STAGE_LABEL,
  Topline,
  type LayoutProps,
  type MoveKind,
  type Stage,
} from './common.tsx'

// --- 1. Inbox: titles on the left, the chosen row on the right ---------------------------------

export function InboxLayout(handle: Handle<LayoutProps>) {
  let selected: string | null = null
  return () => {
    let { state, store } = handle.props
    let { mine, others, finished } = groups(state)
    let all = [...mine, ...others, ...finished]
    let row = all.find((r) => r.key === selected) ?? all[0]
    let item = (r: RowDoc) => (
      <li key={r.key}>
        <button
          type="button"
          class={`inbox-item${r === row ? ' selected' : ''}`}
          aria-current={r === row}
          mix={on('click', () => {
            selected = r.key
            handle.update()
          })}
        >
          <span class={`glyph ${stage(r)}`}>{STAGE_GLYPH[stage(r)]}</span>
          <span class="title">{r.item}</span>
        </button>
      </li>
    )
    return (
      <>
        <Topline {...handle.props} />
        <Notice state={state} />
        <div class="inbox">
          <nav class="inbox-list" aria-label="Rows">
            <h2>Your move · {mine.length}</h2>
            <ul>{mine.map(item)}</ul>
            <h2>In progress · {others.length}</h2>
            <ul>{[...others, ...finished].map(item)}</ul>
          </nav>
          <article class="inbox-pane">
            {row ? (
              <>
                {parts(row).mine ? <div class="move">→ {row.yourMove}</div> : null}
                <h2 class="pane-title">{row.item}</h2>
                <RowBody key={row.key} row={row} state={state} store={store} detailsOpen={Boolean(parts(row).pr || parts(row).issue)} />
              </>
            ) : (
              <p class="empty">No rows yet.</p>
            )}
          </article>
        </div>
        <RecentLine state={state} />
      </>
    )
  }
}

// --- 2. One line per row, opening in place ------------------------------------------------------

export function LinesLayout(handle: Handle<LayoutProps>) {
  return () => {
    let { state, store } = handle.props
    let { mine, others, finished } = groups(state)
    let line = (r: RowDoc) => (
      <LineRow
        key={r.key}
        row={r}
        state={state}
        store={store}
        lead={<span class="col-move">{parts(r).mine ? r.yourMove : ''}</span>}
        tail={
          <>
            <span class="col-ref">{present(r.pr) ? `PR ${r.pr}` : present(r.issue) ? `#${r.issue}` : ''}</span>
            <span class="col-doing">{present(r.doing)}</span>
          </>
        }
      />
    )
    return (
      <>
        <Topline {...handle.props} />
        <Notice state={state} />
        <section>
          <h2>Your move · {mine.length}</h2>
          <ul class="lines">{mine.map(line)}</ul>
        </section>
        <section>
          <h2>In progress · {others.length + finished.length}</h2>
          <ul class="lines">{[...others, ...finished].map(line)}</ul>
        </section>
        <RecentLine state={state} />
      </>
    )
  }
}

// --- 3. Next up: one thing to do now, the rest of the queue as titles ---------------------------

export function NextLayout(handle: Handle<LayoutProps>) {
  let focus: string | null = null
  let showRest = false
  return () => {
    let { state, store } = handle.props
    let { mine, others, finished } = groups(state)
    let next = mine.find((r) => r.key === focus) ?? mine[0]
    return (
      <>
        <Topline {...handle.props} />
        <Notice state={state} />
        {next ? (
          <section class="next-up" aria-label="Next up">
            <div class="next-label">Next up · 1 of {mine.length}</div>
            <div class="move big">→ {next.yourMove}</div>
            <h2 class="next-title">{next.item}</h2>
            <RowBody key={next.key} row={next} state={state} store={store} />
          </section>
        ) : (
          <p class="empty big">Nothing needs you. The workers have it.</p>
        )}
        {mine.length > 1 ? (
          <section>
            <h2>Then</h2>
            <ol class="queue">
              {mine
                .filter((r) => r !== next)
                .map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      class="queue-item"
                      mix={on('click', () => {
                        focus = r.key
                        handle.update()
                        scrollTo({ top: 0, behavior: 'smooth' })
                      })}
                    >
                      <span class="title">{r.item}</span>
                      <span class="sub">{r.yourMove}</span>
                    </button>
                  </li>
                ))}
            </ol>
          </section>
        ) : null}
        <section>
          <button
            type="button"
            class="quiet-toggle"
            aria-expanded={showRest}
            mix={on('click', () => {
              showRest = !showRest
              handle.update()
            })}
          >
            {showRest ? '▾' : '▸'} {others.length} in progress{finished.length ? ` · ${finished.length} finished` : ''}
          </button>
          {showRest ? (
            <ul class="lines">
              {[...others, ...finished].map((r) => (
                <LineRow key={r.key} row={r} state={state} store={store} tail={<span class="col-doing">{present(r.doing)}</span>} />
              ))}
            </ul>
          ) : null}
        </section>
        <RecentLine state={state} />
      </>
    )
  }
}

// --- 4. Grouped by the kind of move -------------------------------------------------------------

const MOVE_ORDER: MoveKind[] = ['merge', 'answer', 'decide', 'grant', 'link', 'other']

export function GroupedLayout(handle: Handle<LayoutProps>) {
  return () => {
    let { state, store } = handle.props
    let { mine, others, finished } = groups(state)
    let byKind = new Map<MoveKind, RowDoc[]>()
    for (let r of mine) byKind.set(moveKind(r), [...(byKind.get(moveKind(r)) ?? []), r])
    return (
      <>
        <Topline {...handle.props} />
        <Notice state={state} />
        <div class="grouped">
          {MOVE_ORDER.filter((k) => byKind.has(k)).map((k) => (
            <section key={k}>
              <h2>
                {MOVE_LABEL[k]} · {byKind.get(k)!.length}
              </h2>
              <ul class="lines">
                {byKind.get(k)!.map((r) => (
                  <LineRow
                    key={r.key}
                    row={r}
                    state={state}
                    store={store}
                    showMove
                    // The group names a merge or a link; the others need their own words.
                    tail={<span class="col-doing">{k === 'merge' || k === 'link' ? present(r.doing) : r.yourMove}</span>}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section>
          <h2>In progress · {others.length + finished.length}</h2>
          <ul class="lines">
            {[...others, ...finished].map((r) => (
              <LineRow key={r.key} row={r} state={state} store={store} tail={<span class="col-doing">{present(r.doing)}</span>} />
            ))}
          </ul>
        </section>
        <RecentLine state={state} />
      </>
    )
  }
}

// --- 5. Board by stage --------------------------------------------------------------------------

const STAGES: Stage[] = ['yours', 'working', 'review', 'blocked', 'queued']

export function KanbanLayout(handle: Handle<LayoutProps>) {
  let opened: string | null = null
  return () => {
    let { state, store } = handle.props
    let rows = state.rows.filter((r) => r.key !== 'finished')
    let open = rows.find((r) => r.key === opened)
    return (
      <>
        <Topline {...handle.props} />
        <Notice state={state} />
        <div class="kanban">
          {STAGES.map((s) => {
            let col = rows.filter((r) => stage(r) === s)
            return (
              <section key={s} class={`kcol ${s}`}>
                <h2>
                  <span class={`glyph ${s}`}>{STAGE_GLYPH[s]}</span> {STAGE_LABEL[s]} · {col.length}
                </h2>
                <ul>
                  {col.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        class={`kcard${r === open ? ' selected' : ''}`}
                        mix={on('click', () => {
                          opened = opened === r.key ? null : r.key
                          handle.update()
                        })}
                      >
                        <span class="title">{r.item}</span>
                        <span class="sub">{s === 'yours' ? r.yourMove : present(r.pr) ? `PR ${r.pr}` : present(r.issue) ? `#${r.issue}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
        {open ? (
          <section class="kdetail" aria-label={open.item}>
            <button
              type="button"
              class="close-drawer"
              mix={on('click', () => {
                opened = null
                handle.update()
              })}
            >
              close ✕
            </button>
            <h2 class="pane-title">{open.item}</h2>
            <RowBody key={open.key} row={open} state={state} store={store} showMove />
          </section>
        ) : null}
        <RecentLine state={state} />
      </>
    )
  }
}

// --- 6. Keyboard first ---------------------------------------------------------------------------

export function KeysLayout(handle: Handle<LayoutProps>) {
  let cursor = 0
  let openKey: string | null = null
  let filter = ''
  let filterEl: HTMLInputElement | null = null

  function visible(): RowDoc[] {
    let { mine, others, finished } = groups(handle.props.state)
    let all = [...mine, ...others, ...finished]
    let f = filter.toLowerCase()
    return f ? all.filter((r) => `${r.item} ${r.doing} ${r.yourMove} ${r.pr} ${r.issue}`.toLowerCase().includes(f)) : all
  }

  function press(label: RegExp) {
    let row = visible()[cursor]
    if (!row) return
    if (openKey !== row.key) {
      openKey = row.key
      handle.update()
    }
    // The row's own buttons do the work; the keys only press them.
    queueMicrotask(() => {
      let el = document.querySelector(`.keys [data-key="${CSS.escape(row.key)}"]`)
      let target = [...(el?.querySelectorAll<HTMLElement>('.controls button, .controls a') ?? [])].find((b) => label.test(b.textContent ?? ''))
      target?.click()
    })
  }

  function onKey(event: KeyboardEvent) {
    let t = event.target as HTMLElement
    if (t !== filterEl && t.closest('input, textarea, select, dialog, [contenteditable]')) return
    if (t === filterEl) {
      if (event.key === 'Escape' || event.key === 'Enter') filterEl?.blur()
      return
    }
    let rows = visible()
    let handled = true
    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        cursor = Math.min(rows.length - 1, cursor + 1)
        break
      case 'k':
      case 'ArrowUp':
        cursor = Math.max(0, cursor - 1)
        break
      case 'Enter':
      case 'o':
        openKey = openKey === rows[cursor]?.key ? null : (rows[cursor]?.key ?? null)
        break
      case 'Escape':
        openKey = null
        break
      case '/':
        filterEl?.focus()
        break
      case 'm':
        press(/^Merge/)
        break
      case 'c':
        press(/^Close/)
        break
      case 'p':
        press(/^Prioritize/)
        break
      case 'i':
        press(/^Instruction/)
        break
      case 'd': {
        let diff = rows[cursor] && parts(rows[cursor]).diff
        if (diff) location.assign(diff)
        break
      }
      default:
        handled = false
    }
    if (!handled) return
    event.preventDefault()
    handle.update()
    queueMicrotask(() => document.querySelector('.keys .line-row.cursor')?.scrollIntoView({ block: 'nearest' }))
  }

  addEventListener('keydown', onKey)
  handle.signal.addEventListener('abort', () => removeEventListener('keydown', onKey))

  return () => {
    let { state, store } = handle.props
    let rows = visible()
    cursor = Math.min(cursor, Math.max(0, rows.length - 1))
    return (
      <>
        <Topline {...handle.props}>
          <input
            type="search"
            id="row-filter"
            class="filter"
            placeholder="/ to filter"
            aria-label="Filter rows"
            value={filter}
            mix={[
              ref((el: HTMLInputElement) => (filterEl = el)),
              on('input', (event) => {
                filter = (event.currentTarget as HTMLInputElement).value
                cursor = 0
                handle.update()
              }),
            ]}
          />
        </Topline>
        <Notice state={state} />
        <ul class="lines keys">
          {rows.map((r, i) => (
            <li key={r.key} class={`line-row${i === cursor ? ' cursor' : ''}${openKey === r.key ? ' open' : ''}${parts(r).mine ? ' mine' : ''}`} data-key={r.key}>
              <button
                type="button"
                class="line"
                mix={on('click', () => {
                  cursor = i
                  openKey = openKey === r.key ? null : r.key
                  handle.update()
                })}
              >
                <span class={`glyph ${stage(r)}`}>{STAGE_GLYPH[stage(r)]}</span>
                <span class="title">{r.item}</span>
                <span class="col-move">{parts(r).mine ? r.yourMove : ''}</span>
              </button>
              {openKey === r.key ? <RowBody row={r} state={state} store={store} /> : null}
            </li>
          ))}
        </ul>
        <footer class="keybar" aria-label="Keys">
          <span><kbd>j</kbd><kbd>k</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>m</kbd> merge</span>
          <span><kbd>c</kbd> close</span>
          <span><kbd>p</kbd> prioritize</span>
          <span><kbd>i</kbd> instruct</span>
          <span><kbd>d</kbd> diff</span>
          <span><kbd>/</kbd> filter</span>
        </footer>
        <RecentLine state={state} />
      </>
    )
  }
}

// --- 7. Status rail: a column of state marks, everything else on hover or open ------------------

export function RailLayout(handle: Handle<LayoutProps>) {
  return () => {
    let { state, store } = handle.props
    let { mine, others, finished } = groups(state)
    let rows = [...mine, ...others, ...finished]
    return (
      <>
        <Topline {...handle.props}>
          <span class="legend">
            {(['yours', 'working', 'review', 'blocked', 'queued'] as Stage[]).map((s) => (
              <span key={s}>
                <span class={`glyph ${s}`}>{STAGE_GLYPH[s]}</span> {STAGE_LABEL[s].toLowerCase()}
              </span>
            ))}
          </span>
        </Topline>
        <Notice state={state} />
        <ul class="rail">
          {rows.map((r) => (
            <LineRow
              key={r.key}
              row={r}
              state={state}
              store={store}
              showMove
              lead={<span class={`glyph ${stage(r)}`} title={STAGE_LABEL[stage(r)]}>{STAGE_GLYPH[stage(r)]}</span>}
              tail={<span class="rail-sub">{parts(r).mine ? r.yourMove : present(r.doing)}</span>}
            />
          ))}
        </ul>
        <RecentLine state={state} />
      </>
    )
  }
}

// --- 8. Summary first: one sentence that filters the list ---------------------------------------

type SummaryFilter = { kind: 'move'; move: MoveKind } | { kind: 'stage'; stage: Stage } | null

export function SummaryLayout(handle: Handle<LayoutProps>) {
  let active: SummaryFilter = null
  return () => {
    let { state, store } = handle.props
    let rows = state.rows.filter((r) => r.key !== 'finished')
    let mine = rows.filter(hasMove)
    let count = (f: NonNullable<SummaryFilter>) =>
      rows.filter((r) => (f.kind === 'move' ? hasMove(r) && moveKind(r) === f.move : stage(r) === f.stage)).length
    let same = (a: SummaryFilter, b: SummaryFilter) => JSON.stringify(a) === JSON.stringify(b)
    let chip = (f: NonNullable<SummaryFilter>, text: string) => {
      let n = count(f)
      if (!n) return null
      return (
        <button
          type="button"
          class="chip"
          aria-pressed={same(active, f)}
          mix={on('click', () => {
            active = same(active, f) ? null : f
            handle.update()
          })}
        >
          {n} {text}
        </button>
      )
    }
    let shown = active
      ? rows.filter((r) => (active!.kind === 'move' ? hasMove(r) && moveKind(r) === active!.move : stage(r) === active!.stage))
      : rows
    let slots = state.meta?.slots
    let parts1 = [
      chip({ kind: 'move', move: 'merge' }, 'to merge'),
      chip({ kind: 'move', move: 'answer' }, 'boxes asking'),
      chip({ kind: 'move', move: 'decide' }, 'to decide'),
      chip({ kind: 'move', move: 'grant' }, 'access to grant'),
      chip({ kind: 'move', move: 'link' }, 'to link'),
      chip({ kind: 'move', move: 'other' }, 'other'),
    ].filter(Boolean)
    let parts2 = [
      chip({ kind: 'stage', stage: 'working' }, 'working'),
      chip({ kind: 'stage', stage: 'review' }, 'in checks or review'),
      chip({ kind: 'stage', stage: 'blocked' }, 'blocked'),
      chip({ kind: 'stage', stage: 'queued' }, 'queued'),
    ].filter(Boolean)
    return (
      <>
        <Topline {...handle.props} />
        <Notice state={state} />
        <p class="summary">
          <strong>{mine.length} need you:</strong> {parts1.map((c, i) => [i ? ', ' : '', c])}.{' '}
          <span class="soft">
            Of the rest, {parts2.map((c, i) => [i ? ', ' : '', c])}
            {slots ? `; ${slots.boxes.length} of ${slots.max} workers busy` : ''}.
          </span>
          {active ? (
            <>
              {' '}
              <button
                type="button"
                class="chip clear"
                mix={on('click', () => {
                  active = null
                  handle.update()
                })}
              >
                show all
              </button>
            </>
          ) : null}
        </p>
        <ul class="lines">
          {shown.map((r) => (
            <LineRow
              key={r.key}
              row={r}
              state={state}
              store={store}
              showMove
              lead={<span class={`glyph ${stage(r)}`}>{STAGE_GLYPH[stage(r)]}</span>}
              tail={<span class="col-ref">{present(r.pr) ? `PR ${r.pr}` : present(r.issue) ? `#${r.issue}` : ''}</span>}
            />
          ))}
        </ul>
        <RecentLine state={state} />
      </>
    )
  }
}

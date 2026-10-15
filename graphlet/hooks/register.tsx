import type { EngineInterface, Register } from 'claude-code'

import type { Graphlet } from '../types'
import { charactersOf, styleOf } from './draw'
import type { Drawing, Pan, Room } from './draw'
import { readGraph } from './layers'
import type { Graph } from './layers'
import { pageOf } from './page'
import { GUIDE, fencedOf, partsOf, pictureOf } from './reply'
import { MOVES, focusOf, viewOf } from './view'

/** What a pane holds, as it was last drawn: the graph it was given, the graph as drawn, the room, the selected node, and where its window stood. */
type Held = { whole: Graph; graph: Graph; room: Room; selected: string | null; pan: Pan; drawing: Drawing }

const ORIGIN: Pan = { x: 0, y: 0 }

const held = new Map<string, Held>()
/** The node the person last picked in each pane. */
const picked = new Map<string, string>()
/** Where the person scrolled each pane's window to. A pane is missing while its window follows the selection. */
const scrolled = new Map<string, Pan>()
/** The panes whose graph is drawn in focus on the selected node. */
const focused = new Set<string>()
/** What the person is typing to find, in each pane where they are finding a node. */
const finding = new Map<string, string>()
/** How far the person has dragged each pane's graph since the button went down, as far as it has scrolled the graph for, and in which drag. */
const dragged = new Map<string, { grab: unknown; at: Pan }>()

/** The nodes whose labels hold what is being found, in the graph's order: none while nothing is typed. */
const foundIn = (graph: Graph, query: string): string[] =>
  query.trim() === '' ? [] : graph.nodes.filter(node => node.label.toLowerCase().includes(query.trim().toLowerCase())).map(node => node.id)
/**
 * How graphs are drawn: as the plugin's options say, in a pane, and in a
 * reply folded into the room it has, with its links kept separate, since
 * nothing in a reply can be selected to tell merged links apart.
 */
let view = viewOf({ scroll: 'pinned', labels: 'wrap', links: 'separate', motion: 'still' })
let still = viewOf({ scroll: 'pinned', labels: 'wrap', links: 'separate', motion: 'still' }, true)

/** The programs that open a file as the person's system would, each tried in turn: Linux's, macOS's, and Windows's. */
const OPENERS: ReadonlyArray<(path: string) => string[]> = [
  path => ['xdg-open', path],
  path => ['open', path],
  path => ['cmd', '/c', 'start', '', path],
]
/** How long an opener may run, in milliseconds. */
const OPEN_TIMEOUT_MS = 10_000

/**
 * Writes a pane's graph out as a web page in the system's temporary folder,
 * and opens it in the browser. Where nothing opens it, says where it is.
 */
const openPage = async ($: EngineInterface, pane: string, graph: Graph): Promise<void> => {
  const folder = (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? '/tmp'
  const path = `${folder.replace(/[\\/]+$/, '')}/graphlet-${pane.replace(/[^A-Za-z0-9_-]/g, '-')}.html`
  try {
    await $.fs.write(path, pageOf(graph, pane))
  } catch (error) {
    $.ui.toast(`graphlet: could not write the graph's page (${error instanceof Error ? error.message : String(error)}).`)
    return
  }
  for (const opener of OPENERS) {
    const ran = await $.process.run(opener(path), { timeoutMs: OPEN_TIMEOUT_MS }).catch(() => undefined)
    if (ran?.exitCode === 0) {
      $.ui.toast('graphlet: opened the graph in your browser.')
      return
    }
  }
  $.ui.toast(`graphlet: the graph's page is at ${path}`)
}

/** The most columns, and the most rows, a room is taken to have. */
const MOST_CELLS = 1000

/** A count of cells another mod handed over, as a whole number a room can have. */
const cellsOf = (asked: unknown): number =>
  typeof asked === 'number' && Number.isFinite(asked) ? Math.min(Math.max(Math.floor(asked), 1), MOST_CELLS) : 1

/** The columns the bullet opening a reply takes, which the reply's text is indented by. */
const BULLET_COLUMNS = 2
/** How wide a reply is taken to be on a surface that has not said. */
const REPLY_COLUMNS = 80

const isPan = (value: unknown): value is Pan =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as Pan).x) &&
  Number.isFinite((value as Pan).y)

export const register: Register = (on, options) => {
  const look = {
    scroll: options.scroll === 'sheet' ? ('sheet' as const) : ('pinned' as const),
    labels: options.labels === 'clip' ? ('clip' as const) : ('wrap' as const),
    links: options.links === 'merged' ? ('merged' as const) : ('separate' as const),
    motion: options.motion === 'flowing' ? ('flowing' as const) : ('still' as const),
  }
  view = viewOf(look)
  still = viewOf({ ...look, links: 'separate' }, true)

  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    const graphlet: Graphlet = {
      measure: async input => view.measure(readGraph(input.graph), cellsOf(input.columns)),
      show: async input => {
        const graph = readGraph(input.graph)
        const room = { columns: cellsOf(input.columns), rows: cellsOf(input.rows) }
        const wanted = input.selected ?? picked.get(input.pane)
        const selected = graph.nodes.find(node => node.id === wanted)?.id ?? graph.nodes[0]?.id ?? null
        const before = held.get(input.pane)
        if (before?.selected !== selected) scrolled.delete(input.pane)
        const drawn = focused.has(input.pane) ? focusOf(graph, selected) : graph
        const query = finding.get(input.pane)
        const pan = scrolled.get(input.pane) ?? view.show(drawn, selected, room, before?.pan ?? ORIGIN)
        const drawing = view.draw(drawn, selected, room, pan, query === undefined ? undefined : { query, found: foundIn(graph, query) })
        held.set(input.pane, { whole: graph, graph: drawn, room, selected, pan, drawing })
        return { rows: drawing.rows.length, selected }
      },
      step: async input => {
        const at = held.get(input.pane)
        return at === undefined ? null : view.step(at.graph, at.selected, input.move, at.room, at.pan)
      },
      scroll: async input => {
        const at = held.get(input.pane)
        if (at === undefined || (typeof input.by === 'number' ? !Number.isFinite(input.by) : !isPan(input.by))) return
        scrolled.set(input.pane, view.scroll(at.graph, at.room, scrolled.get(input.pane) ?? at.pan, input.by))
        built.ui.invalidate('ui.render')
      },
      select: async input => {
        picked.set(input.pane, input.node)
        built.ui.invalidate('ui.render')
      },
      key: async () => undefined,
    }
    return { ...built, graphlet }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const at = held.get(e.requestId)
    if (at === undefined || e.surface !== 'terminal') return next(e)
    const { Client } = $.ui.resolve(e)
    return <Client key="graph" module="./surface.tsx" props={at.drawing} />
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.surfaces.length === 0 && (await $.env.get('EVAL_GRAPHLET_GUIDE')) !== '1') return composed
    return { sections: [...composed.sections, { id: 'graphlet:graphs', text: GUIDE, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const parts = e.props.isSummary ? [] : partsOf(e.props.text)
    if (!parts.some(part => 'graph' in part)) return next(e)
    const room = { columns: cellsOf((e.viewport?.columns ?? REPLY_COLUMNS) - BULLET_COLUMNS), rows: MOST_CELLS }
    const shown = parts.map(part => ('graph' in part ? pictureOf(still, readGraph(part.graph), room) : part))
    if (e.surface !== 'terminal') {
      const text = shown.map(part => ('text' in part ? part.text : fencedOf(part))).join('\n\n')
      return next({ ...e, props: { ...e.props, text } })
    }
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const [first, ...rest] = shown
    const lead = first !== undefined && 'text' in first ? [await next({ ...e, props: { ...e.props, text: first.text } })] : []
    const following = lead.length > 0 ? rest : shown
    return (
      <Box flexDirection="column">
        {[
          ...lead,
          ...following.map(part => (
            <Box flexDirection="column" marginLeft={BULLET_COLUMNS} marginTop={1}>
              {'text' in part ? (
                <Markdown text={part.text} />
              ) : (
                part.rows.map(row => (
                  <Text wrap="truncate-end">
                    {row.length === 0 ? ' ' : row.map(span => <Text {...styleOf(span)}>{span.text}</Text>)}
                  </Text>
                ))
              )}
            </Box>
          )),
        ]}
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    const at = held.get(e.requestId)
    if (at === undefined || typeof e.data !== 'object' || e.data === null) return next(e)
    const pane = e.requestId
    const { node, by, drag, grab, isDropped, key, page, isChord } = e.data as {
      node?: unknown
      by?: unknown
      drag?: unknown
      grab?: unknown
      isDropped?: unknown
      key?: unknown
      page?: unknown
      isChord?: unknown
    }
    const query = finding.get(pane)
    const typed = key === 'space' ? ' ' : typeof key === 'string' && isChord !== true && charactersOf(key).length === 1 ? key : undefined
    /** Selects a node, where it is one and not the selected one already, and draws the pane again either way. */
    const pick = async (to: string | undefined): Promise<void> => {
      if (to !== undefined && to !== at.selected) await $.graphlet.select({ pane, node: to })
      else $.ui.invalidate('ui.render')
    }
    if (typeof node === 'string') {
      finding.delete(pane)
      await $.graphlet.select({ pane, node })
    } else if (isPan(by)) {
      await $.graphlet.scroll({ pane, by })
    } else if (isPan(drag)) {
      const last = dragged.get(pane)
      const before = last !== undefined && last.grab === grab ? last.at : ORIGIN
      if (isDropped === true) dragged.delete(pane)
      else dragged.set(pane, { grab, at: drag })
      await $.graphlet.scroll({ pane, by: { x: before.x - drag.x, y: before.y - drag.y } })
    } else if (page === true) {
      await openPage($, pane, at.whole)
    } else if (query !== undefined && key === 'backspace' && query === '') {
      finding.delete(pane)
      $.ui.invalidate('ui.render')
    } else if (query !== undefined && (typed !== undefined || key === 'backspace')) {
      const asked = typed === undefined ? charactersOf(query).slice(0, -1).join('') : `${query}${typed}`
      finding.set(pane, asked)
      await pick(foundIn(at.whole, asked)[0])
    } else if (query !== undefined && key === 'return') {
      const found = foundIn(at.whole, query)
      await pick(found[(found.indexOf(at.selected ?? '') + 1) % Math.max(found.length, 1)])
    } else if (key === '/') {
      finding.set(pane, '')
      $.ui.invalidate('ui.render')
    } else if (key === 'f') {
      if (focused.has(pane)) focused.delete(pane)
      else focused.add(pane)
      scrolled.delete(pane)
      $.ui.invalidate('ui.render')
    } else if (typeof key === 'string') {
      const move = MOVES[key]
      const to = move === undefined ? null : view.step(at.graph, at.selected, move, at.room, at.pan)
      if (move === undefined) await $.graphlet.key({ pane, key })
      else if (to !== null && to !== at.selected) await $.graphlet.select({ pane, node: to })
    }
    return {}
  })
}

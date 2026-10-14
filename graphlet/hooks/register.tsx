import type { EngineInterface, Register } from 'claude-code'

import type { Graphlet } from '../types'
import type { Drawing, Pan, Room } from './draw'
import { readGraph } from './layers'
import type { Graph } from './layers'
import { pageOf } from './page'
import { MOVES, viewOf } from './view'

/** What a pane holds, as it was last drawn: the graph, the room it was given, the selected node, and where its window stood. */
type Held = { graph: Graph; room: Room; selected: string | null; pan: Pan; drawing: Drawing }

const ORIGIN: Pan = { x: 0, y: 0 }

const held = new Map<string, Held>()
/** The node the person last picked in each pane. */
const picked = new Map<string, string>()
/** Where the person scrolled each pane's window to. A pane is missing while its window follows the selection. */
const scrolled = new Map<string, Pan>()
/** How graphs are drawn: as the plugin's options say. */
let view = viewOf({ scroll: 'pinned', labels: 'wrap', links: 'separate' })

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

const isPan = (value: unknown): value is Pan =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as Pan).x) &&
  Number.isFinite((value as Pan).y)

export const register: Register = (on, options) => {
  view = viewOf({
    scroll: options.scroll === 'sheet' ? 'sheet' : 'pinned',
    labels: options.labels === 'clip' ? 'clip' : 'wrap',
    links: options.links === 'merged' ? 'merged' : 'separate',
  })

  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    const graphlet: Graphlet = {
      measure: async input => view.measure(readGraph(input.graph), Math.floor(input.columns)),
      show: async input => {
        const graph = readGraph(input.graph)
        const room = { columns: Math.floor(input.columns), rows: Math.floor(input.rows) }
        const wanted = input.selected ?? picked.get(input.pane)
        const selected = graph.nodes.find(node => node.id === wanted)?.id ?? graph.nodes[0]?.id ?? null
        const before = held.get(input.pane)
        if (before?.selected !== selected) scrolled.delete(input.pane)
        const pan = scrolled.get(input.pane) ?? view.show(graph, selected, room, before?.pan ?? ORIGIN)
        const drawing = view.draw(graph, selected, room, pan)
        held.set(input.pane, { graph, room, selected, pan, drawing })
        return { rows: drawing.rows.length, selected }
      },
      step: async input => {
        const at = held.get(input.pane)
        return at === undefined ? null : view.step(at.graph, at.selected, input.move, at.room, at.pan)
      },
      scroll: async input => {
        const at = held.get(input.pane)
        if (at === undefined) return
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

  on('ui.message', async ($, e, next) => {
    const at = held.get(e.requestId)
    if (at === undefined || typeof e.data !== 'object' || e.data === null) return next(e)
    const pane = e.requestId
    const { node, by, key, page } = e.data as { node?: unknown; by?: unknown; key?: unknown; page?: unknown }
    if (typeof node === 'string') {
      await $.graphlet.select({ pane, node })
    } else if (isPan(by)) {
      await $.graphlet.scroll({ pane, by })
    } else if (page === true) {
      await openPage($, pane, at.graph)
    } else if (typeof key === 'string') {
      const move = MOVES[key]
      const to = move === undefined ? null : view.step(at.graph, at.selected, move, at.room, at.pan)
      if (move === undefined) await $.graphlet.key({ pane, key })
      else if (to !== null && to !== at.selected) await $.graphlet.select({ pane, node: to })
    }
    return {}
  })
}

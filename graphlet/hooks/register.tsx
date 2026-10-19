import type { Elements, EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Graphlet } from '../types'
import { MOST_CELLS, MOST_TREE_CHARS, bounded, charactersOf, rowText, sizeOf, styleOf } from './draw'
import type { Drawing, Pan, Room } from './draw'
import { readGraph } from './layers'
import type { Graph } from './layers'
import type { Direction } from './layout'
import { pageOf } from './page'
import { GUIDE, fencedOf, partsOf, pictureOf, stillOf } from './reply'
import { MOVES, collapsedOf, focusOf, leadOf, viewOf } from './view'

/**
 * What a site holds, as it was last drawn: the graph it was given, that
 * graph with its groups collapsed as they are there, the graph as drawn, in
 * focus or not, the room, the selected node, and where its window stood.
 */
type Held = { given: Graph; whole: Graph; graph: Graph; room: Room; selected: string | null; pan: Pan; drawing: Drawing }

const ORIGIN: Pan = { x: 0, y: 0 }

const held = new Map<string, Held>()
/** The node the person last picked in each site. */
const picked = new Map<string, string>()
/** Where the person scrolled each site's window to. A site is missing while its window follows the selection. */
const scrolled = new Map<string, Pan>()
/** The graphs of each reply block drawn lately, in order, by the block's request, and the room they were drawn in: what a click on the corner of one of their pictures copies or opens. */
const replied = new Map<string, { graphs: Graph[]; room: Room }>()
/** How many reply blocks' graphs are kept for their corners, those drawn last: a block is drawn again as it comes back into view. */
const KEPT_REPLIES = 64
/** The sites `show` was called for since each was last drawn: a site is drawn only on a render where its owner said what it holds. */
const asked = new Set<string>()
/** Whether each group of each site's graph is collapsed, as `collapse` was last called for it there. */
const shutIn = new Map<string, Map<string, boolean>>()
/** The sites whose graph is drawn in focus on the selected node. */
const focused = new Set<string>()
/** What the person is typing to find, in each site where they are finding a node. */
const finding = new Map<string, string>()
/** How far the person has dragged each site's graph since the button went down, as far as it has scrolled the graph for, and in which drag. */
const dragged = new Map<string, { grab: unknown; at: Pan }>()

/** The nodes whose labels hold what is being found, in the graph's order: none while nothing is typed. */
const foundIn = (graph: Graph, query: string): string[] =>
  query.trim() === '' ? [] : graph.nodes.filter(node => node.label.toLowerCase().includes(query.trim().toLowerCase())).map(node => node.id)
/**
 * How graphs are drawn: as the plugin's options say, in a pane, and still,
 * in a reply and as `c` copies them, folded into the room they have, with
 * their links kept separate, since nothing still can be selected to tell
 * merged links apart.
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
 * Writes a graph out as a web page in the system's temporary folder, in a
 * file named `name` and headed `title`, running as it runs where it is
 * drawn, and opens it in the browser. Where nothing opens it, says where it
 * is.
 */
const openPage = async ($: EngineInterface, name: string, title: string, graph: Graph, direction: Direction): Promise<void> => {
  const folder = (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? '/tmp'
  const path = `${folder.replace(/[\\/]+$/, '')}/graphlet-${name.replace(/[^A-Za-z0-9_-]/g, '-')}.html`
  try {
    await $.fs.write(path, pageOf(graph, title, direction))
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

/** A count of cells another mod handed over, as a whole number a room can have. */
const cellsOf = (asked: unknown): number =>
  typeof asked === 'number' && Number.isFinite(asked) ? Math.min(Math.max(Math.floor(asked), 1), MOST_CELLS) : 1

/**
 * Puts a graph on the clipboard as plain text, drawn still as a reply draws
 * it, in `room`, and says whether it went.
 */
const copyGraph = async ($: EngineInterface, graph: Graph, room: Room, surface?: RenderSurface): Promise<void> => {
  const text = pictureOf(still, graph, room).rows.map(row => rowText(row).trimEnd()).join('\n')
  const copied = await $.ui.copy({ text, ...(surface === undefined ? {} : { surface }) })
  $.ui.toast(copied.isCopied ? 'graphlet: copied the graph as text.' : `graphlet: could not copy the graph (${copied.reason}).`)
}

/** The columns the bullet opening a reply takes, which the reply's text is indented by. */
const BULLET_COLUMNS = 2
/** How wide a reply is taken to be on a surface that has not said. */
const REPLY_COLUMNS = 80
/** What the corner of a still picture says: a click on the first word copies the graph as text, and on the second opens it as a web page. */
const REPLY_CORNER = { copy: 'copy', between: ' · ', page: 'html ↗' } as const

/**
 * A graph's still picture in `room`, drawn plainer past `share` of what the
 * engine draws, and under it its foot: the counts of what is out of view,
 * and at the picture's right edge, the corner, its two Buttons keyed by
 * `index`, the graph's place among those its site holds.
 */
const stillTreeOf = (elements: Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>, graph: Graph, room: Room, share: number, index: number) => {
  const { Box, Text, Button } = elements
  const picture = stillOf(still, graph, room)
  const rows = bounded({ rows: picture.rows, hits: [] }, share).rows
  const corner = sizeOf(`${REPLY_CORNER.copy}${REPLY_CORNER.between}${REPLY_CORNER.page}`)
  const width = Math.min(room.columns, Math.max(sizeOf(picture.foot) + (picture.foot === '' ? 0 : 2) + corner, ...rows.map(row => sizeOf(rowText(row)))))
  return [
    ...rows.map(row => <Text wrap="truncate-end">{row.length === 0 ? ' ' : row.map(span => <Text {...styleOf(span)}>{span.text}</Text>)}</Text>),
    <Box flexDirection="row" justifyContent="space-between" width={width}>
      <Text dimColor>{picture.foot}</Text>
      <Box flexDirection="row">
        <Button key={`copy:${index}`} label={REPLY_CORNER.copy} plain dimColor onPress={() => undefined} />
        <Text dimColor>{REPLY_CORNER.between}</Text>
        <Button key={`page:${index}`} label={REPLY_CORNER.page} plain dimColor onPress={() => undefined} />
      </Box>
    </Box>,
  ]
}

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
  const isDrawingReplies = options.replies !== 'off'

  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    const graphlet: Graphlet = {
      measure: async input => view.measure(readGraph(input.graph), cellsOf(input.columns)),
      show: async input => {
        const given = readGraph(input.graph)
        const room = { columns: cellsOf(input.columns), rows: cellsOf(input.rows) }
        const shut = new Set(given.groups.filter(group => shutIn.get(input.site)?.get(group.id) ?? group.isCollapsed === true).map(group => group.id))
        const graph = collapsedOf(given, shut)
        const wanted = input.selected ?? picked.get(input.site)
        const group = given.nodes.find(node => node.id === wanted)?.group
        const standing = group !== undefined && shut.has(group) ? group : wanted
        const selected = graph.nodes.find(node => node.id === standing)?.id ?? leadOf(graph)
        const before = held.get(input.site)
        if (before?.selected !== selected) scrolled.delete(input.site)
        const drawn = focused.has(input.site) ? focusOf(graph, selected) : graph
        const query = finding.get(input.site)
        const found = query === undefined ? undefined : { query, found: foundIn(given, query).map(id => graph.nodes.find(node => node.id === id)?.id ?? given.nodes.find(node => node.id === id)?.group ?? id) }
        const pan = scrolled.get(input.site) ?? view.show(drawn, selected, room, before?.pan ?? ORIGIN)
        const drawing = view.draw(drawn, selected, room, pan, found)
        held.set(input.site, { given, whole: graph, graph: drawn, room, selected, pan, drawing })
        asked.add(input.site)
        return { rows: drawing.rows.length, selected }
      },
      step: async input => {
        const at = held.get(input.site)
        return at === undefined ? null : view.step(at.graph, at.selected, input.move, at.room, at.pan)
      },
      scroll: async input => {
        const at = held.get(input.site)
        if (at === undefined || (typeof input.by === 'number' ? !Number.isFinite(input.by) : !isPan(input.by))) return
        scrolled.set(input.site, view.scroll(at.graph, at.room, scrolled.get(input.site) ?? at.pan, input.by))
        built.ui.invalidate('ui.render')
      },
      select: async input => {
        picked.set(input.site, input.node)
        built.ui.invalidate('ui.render')
      },
      open: async () => undefined,
      collapse: async input => {
        shutIn.set(input.site, new Map(shutIn.get(input.site)).set(input.group, input.isCollapsed === true))
        const first = held.get(input.site)?.given.nodes.find(node => node.group === input.group)
        if (input.isCollapsed !== true && picked.get(input.site) === input.group && first !== undefined) picked.set(input.site, first.id)
        scrolled.delete(input.site)
        built.ui.invalidate('ui.render')
      },
      key: async () => undefined,
    }
    return { ...built, graphlet }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const at = held.get(e.requestId)
    if (!asked.delete(e.requestId) || at === undefined || e.surface !== 'terminal') return next(e)
    const { Client } = $.ui.resolve(e)
    return <Client key="graph" module="./surface.tsx" props={at.drawing} />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const at = held.get(e.requestId)
    if (!asked.delete(e.requestId) || at === undefined || e.surface !== 'terminal') return next(e)
    const { Box, Client } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Client key="graph" module="./surface.tsx" props={at.drawing} />
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const at = held.get(e.requestId)
    if (!asked.delete(e.requestId) || at === undefined || e.surface !== 'terminal') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return <Box flexDirection="column">{stillTreeOf({ Box, Text, Button }, at.whole, at.room, MOST_TREE_CHARS, 0)}</Box>
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const at = held.get(e.requestId)
    if (!asked.delete(e.requestId) || at === undefined || e.surface !== 'terminal') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return <Box flexDirection="column">{stillTreeOf({ Box, Text, Button }, at.whole, at.room, MOST_TREE_CHARS, 0)}</Box>
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!isDrawingReplies || (e.surfaces.length === 0 && (await $.env.get('EVAL_GRAPHLET_GUIDE')) !== '1')) return composed
    return { sections: [...composed.sections, { id: 'graphlet:graphs', text: GUIDE, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const parts = e.props.isSummary || !isDrawingReplies ? [] : partsOf(e.props.text)
    if (!parts.some(part => 'graph' in part)) return next(e)
    const room = { columns: cellsOf((e.viewport?.columns ?? REPLY_COLUMNS) - BULLET_COLUMNS), rows: MOST_CELLS }
    const words = parts.reduce((sum, part) => sum + ('text' in part ? part.text.length : 0), 0)
    const share = Math.max(0, MOST_TREE_CHARS - words) / parts.filter(part => 'graph' in part).length
    const graphs = parts.flatMap(part => ('graph' in part ? [readGraph(part.graph)] : []))
    const shown = parts.map((part, at) => ('text' in part ? part : { graph: graphs[parts.slice(0, at).filter(one => 'graph' in one).length] as Graph }))
    if (e.surface !== 'terminal') {
      const text = shown.map(part => ('text' in part ? part.text : fencedOf(bounded(pictureOf(still, part.graph, room), share)))).join('\n\n')
      return next({ ...e, props: { ...e.props, text } })
    }
    replied.delete(e.requestId)
    replied.set(e.requestId, { graphs, room })
    for (const old of [...replied.keys()].slice(0, Math.max(0, replied.size - KEPT_REPLIES))) replied.delete(old)
    const { Box, Text, Markdown, Button } = $.ui.resolve(e)
    const [first, ...rest] = shown
    const lead = first !== undefined && 'text' in first ? [await next({ ...e, props: { ...e.props, text: first.text } })] : []
    const following = lead.length > 0 ? rest : shown
    return (
      <Box flexDirection="column">
        {[
          ...lead,
          ...following.map(part => (
            <Box flexDirection="column" marginLeft={BULLET_COLUMNS} marginTop={1}>
              {'text' in part ? <Markdown text={part.text} /> : stillTreeOf({ Box, Text, Button }, part.graph, room, share, graphs.indexOf(part.graph))}
            </Box>
          )),
        ]}
      </Box>
    )
  })

  on('ui.press', { plugin: 'graphlet' }, async ($, e, next) => {
    const [action, at] = e.element.split(':')
    const site = held.get(e.requestId)
    const isReply = e.component === 'AssistantMessage'
    const pictured = isReply ? replied.get(e.requestId) : site === undefined ? undefined : { graphs: [site.whole], room: site.room }
    const graph = pictured?.graphs[Number(at)]
    if (pictured === undefined || graph === undefined) return next(e)
    const name = isReply ? `reply-${e.requestId.replace(/[^A-Za-z0-9]/g, '').slice(-8)}-${at}` : e.requestId
    if (action === 'copy') await copyGraph($, graph, pictured.room, e.surface)
    else if (action === 'page') await openPage($, name, isReply ? 'reply' : e.requestId, graph, still.direction(graph, pictured.room))
    else return next(e)
    return { element: e.element }
  })

  on('ui.message', async ($, e, next) => {
    const at = held.get(e.requestId)
    if (at === undefined || typeof e.data !== 'object' || e.data === null) return next(e)
    const site = e.requestId
    const { node, isOpened, group, by, drag, grab, isDropped, key, page, isChord } = e.data as {
      node?: unknown
      isOpened?: unknown
      group?: unknown
      by?: unknown
      drag?: unknown
      grab?: unknown
      isDropped?: unknown
      key?: unknown
      page?: unknown
      isChord?: unknown
    }
    const query = finding.get(site)
    const typed = key === 'space' ? ' ' : typeof key === 'string' && isChord !== true && charactersOf(key).length === 1 ? key : undefined
    /** Whether a node of the graph as drawn is the box of a collapsed group. */
    const isShut = (id: string): boolean => at.whole.nodes.some(one => one.id === id && one.holds !== undefined)
    /** Opens a collapsed group, and where its box was selected, selects the first node it holds. */
    const expand = async (group: string): Promise<void> => {
      await $.graphlet.collapse({ site, group, isCollapsed: false })
      const first = at.given.nodes.find(one => one.group === group)
      if (at.selected === group && first !== undefined) await $.graphlet.select({ site, node: first.id })
    }
    /** Opens a node: a collapsed group's box by opening the group, and any other by `open`. */
    const open = async (id: string): Promise<void> => (isShut(id) ? expand(id) : $.graphlet.open({ site, node: id }))
    /** Selects a node, opening the collapsed group it is in, where it is one and not the selected one already, and draws the site again either way. */
    const pick = async (to: string | undefined): Promise<void> => {
      const shut = at.given.nodes.find(one => one.id === to)?.group
      if (shut !== undefined && isShut(shut)) await $.graphlet.collapse({ site, group: shut, isCollapsed: false })
      if (to !== undefined && to !== at.selected) await $.graphlet.select({ site, node: to })
      else $.ui.invalidate('ui.render')
    }
    if (isChord === true) {
      return {}
    } else if (typeof node === 'string') {
      finding.delete(site)
      if (node !== at.selected) await $.graphlet.select({ site, node })
      else $.ui.invalidate('ui.render')
      if (isOpened === true) await open(node)
    } else if (typeof group === 'string') {
      await $.graphlet.collapse({ site, group, isCollapsed: true })
    } else if (isPan(by)) {
      await $.graphlet.scroll({ site, by })
    } else if (isPan(drag)) {
      const last = dragged.get(site)
      const before = last !== undefined && last.grab === grab ? last.at : ORIGIN
      if (isDropped === true) dragged.delete(site)
      else dragged.set(site, { grab, at: drag })
      if (before.x !== drag.x || before.y !== drag.y) await $.graphlet.scroll({ site, by: { x: before.x - drag.x, y: before.y - drag.y } })
    } else if (page === true) {
      await openPage($, site, site, at.whole, view.direction(at.whole, at.room))
    } else if (query !== undefined && key === 'backspace' && query === '') {
      finding.delete(site)
      $.ui.invalidate('ui.render')
    } else if (query !== undefined && (typed !== undefined || key === 'backspace')) {
      const asked = typed === undefined ? charactersOf(query).slice(0, -1).join('') : `${query}${typed}`
      finding.set(site, asked)
      await pick(foundIn(at.given, asked)[0])
    } else if (query !== undefined && key === 'return') {
      const found = foundIn(at.given, query)
      await pick(found[(found.indexOf(at.selected ?? '') + 1) % Math.max(found.length, 1)])
    } else if (key === 'return' && at.selected !== null) {
      await open(at.selected)
    } else if (key === 'space' && at.selected !== null && isShut(at.selected)) {
      await expand(at.selected)
    } else if (key === 'space' && at.selected !== null && at.given.nodes.some(one => one.id === at.selected && one.group !== undefined)) {
      await $.graphlet.collapse({ site, group: at.given.nodes.find(one => one.id === at.selected)?.group ?? '', isCollapsed: true })
    } else if (key === '/') {
      finding.set(site, '')
      $.ui.invalidate('ui.render')
    } else if (key === 'c') {
      await copyGraph($, { ...at.whole, direction: view.direction(at.whole, at.room) }, { columns: MOST_CELLS, rows: MOST_CELLS }, e.surface)
    } else if (key === 'f') {
      if (focused.has(site)) focused.delete(site)
      else focused.add(site)
      scrolled.delete(site)
      $.ui.invalidate('ui.render')
    } else if (typeof key === 'string') {
      const move = MOVES[key]
      const to = move === undefined ? null : view.step(at.graph, at.selected, move, at.room, at.pan)
      if (move === undefined) await $.graphlet.key({ site, key, selected: at.selected })
      else if (to !== null && to !== at.selected) await $.graphlet.select({ site, node: to })
    }
    return {}
  })
}

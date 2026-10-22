import type { Elements, EngineInterface, Register, RenderElement, RenderInput, RenderSurface, RenderViewport } from 'claude-code'

import type { Graphlet } from '../types'
import { MOST_CELLS, MOST_TREE_CHARS, bounded, charactersOf, cornerless, leftOut, rowText, sizeOf, styleOf } from './draw'
import type { Drawing, Pan, Room } from './draw'
import { readGraph } from './layers'
import type { Graph } from './layers'
import type { Direction } from './layout'
import { pageOf } from './page'
import { GUIDE, fencedOf, inReply, partsOf, pictureOf } from './reply'
import { TIP_ODDS, tipOf } from './tips'
import { FOCUS_NODES, MOVES, collapsedOf, focusOf, leadOf, viewOf } from './view'
import type { Vector, View } from './view'
import { stepThrough } from './window'

/**
 * What a place holds, as it was last drawn: the view it is drawn by, the
 * graph it was given, that graph with its groups collapsed as they are
 * there, the graph as drawn, in focus or not, the room, the most characters
 * its drawing may take as a tree, the selected node, where its window stood,
 * and the drawing.
 */
type Held = { view: View; given: Graph; whole: Graph; graph: Graph; room: Room; most: number; selected: string | null; pan: Pan; drawing: Drawing }


/**
 * What graphlet keeps for a place a graph is drawn, a mod's site or a graph
 * in a reply: the node the person last picked there; where they scrolled its
 * window to, missing while it follows the selection; whether each group is
 * collapsed, as last asked there; whether it is drawn in focus on the
 * selected node; what the person is typing to find, missing while they are
 * not finding a node; how far they have dragged the graph since the button
 * went down, as far as it has scrolled the graph for, and in which drag; how
 * many times `show` named it since the band last drew it; what was last
 * drawn there; and in a reply, the graph its picture last showed on a
 * surface that draws vectors, running the way it ran.
 */
type Place = {
  picked?: string
  scrolled?: Pan
  shut: Map<string, boolean>
  isFocused: boolean
  finding?: string
  dragged?: { grab: unknown; at: Pan }
  asks: number
  held?: Held
  pictured?: Graph & { direction: Direction }
}

const ORIGIN: Pan = { x: 0, y: 0 }
/** The room a graph is copied in where its own does not hold all of it, a site's, which a window shows a part of, or a reply's too narrow for it to fold into: so that a graph no wider than this is copied whole. */
const SHEET: Room = { columns: MOST_CELLS, rows: MOST_CELLS }

/** The sites graphlet was told of, those `show` named last at the end. */
const sites = new Map<string, Place>()
/** How many sites graphlet keeps what it holds for, those `show` named last: a site named again is drawn again. */
const KEPT_SITES = 128
/** The places of the graphs of each reply block drawn lately, by the block's request, and in it by the key of the Client each is drawn by. */
const replies = new Map<string, Map<string, Place>>()
/** How many reply blocks graphlet keeps the places of their graphs for, those drawn last: a block is drawn again as it comes back into view. */
const KEPT_REPLIES = 64

/** The Clients that failed, by their request and their key: what they drew is drawn since with nothing to click. */
const faulted = new Set<string>()
/** What `faulted` knows a Client by. */
const faultOf = (requestId: string, element: string): string => `${requestId}\n${element}`

/** Whether graphlet has drawn a graph this session, in a reply or in a mod's site: what most tips are true only after. */
let hasDrawn = false
/** The roll of the dice that picks the tip shown after the last reply, from its end to the start of the next turn: missing where no tip follows it. */
let tipRoll: number | undefined
/** What leads a tip at the end of the hint line. */
const TIP_LEAD = ' · Tip: '

/** A place as nothing has been done in it yet. */
const placeOf = (): Place => ({ shut: new Map(), isFocused: false, asks: 0 })
/** A site's place, made where it has none. */
const siteOf = (site: string): Place => {
  const place = sites.get(site) ?? placeOf()
  sites.set(site, place)
  return place
}

/** What a map holds under `key`, made where it holds nothing, kept as the last asked for; and what it holds past the `most` asked for last let go. */
function keptIn<V>(map: Map<string, V>, key: string, made: () => V, most: number): V {
  const kept = map.get(key) ?? made()
  map.delete(key)
  map.set(key, kept)
  for (const old of [...map.keys()].slice(0, Math.max(0, map.size - most))) map.delete(old)
  return kept
}

/** The nodes whose labels hold what is being found, in the graph's order: none while nothing is typed. */
const foundIn = (graph: Graph, query: string): string[] =>
  query.trim() === '' ? [] : graph.nodes.filter(node => node.label.toLowerCase().includes(query.trim().toLowerCase())).map(node => node.id)

/**
 * Draws a graph in a place as the person left it there, and keeps what was
 * drawn: its groups collapsed as last asked there, or as the graph says; the
 * node `asked` selected, or else the one last picked there, or the box of the
 * collapsed group either is in, or else the node `fallback` names; in focus
 * where the place is; with what is being found marked; through a window where
 * the person scrolled it, or else where it shows the selected node.
 */
const drawIn = (place: Place, given: Graph, room: Room, most: number, view: View, asked: string | undefined, fallback: (graph: Graph) => string | null): Held => {
  const shut = new Set(given.groups.filter(group => place.shut.get(group.id) ?? group.isCollapsed === true).map(group => group.id))
  const whole = collapsedOf(given, shut)
  const wanted = asked ?? place.picked
  const group = given.nodes.find(node => node.id === wanted)?.group
  const standing = group !== undefined && shut.has(group) ? group : wanted
  const selected = whole.nodes.find(node => node.id === standing)?.id ?? fallback(whole)
  if (place.held?.selected !== selected) place.scrolled = undefined
  const graph = place.isFocused ? focusOf(whole, selected) : whole
  const query = place.finding
  const found = query === undefined ? undefined : { query, found: foundIn(given, query).map(id => whole.nodes.find(node => node.id === id)?.id ?? given.nodes.find(node => node.id === id)?.group ?? id) }
  const pan = place.scrolled ?? view.show(graph, selected, room, place.held?.pan ?? ORIGIN)
  place.held = { view, given, whole, graph, room, most, selected, pan, drawing: bounded(view.draw(graph, selected, room, pan, found), most) }
  return place.held
}

/** Picks a node, or the box of a collapsed group, in a place. */
const pickIn = (place: Place, node: string): void => {
  place.picked = node
}

/** Collapses a group in a place or opens it, and where its box was picked, picks the first node it holds; the window follows the selection again. */
const collapseIn = (place: Place, group: string, isCollapsed: boolean): void => {
  place.shut = new Map(place.shut).set(group, isCollapsed)
  const first = place.held?.given.nodes.find(node => node.group === group)
  if (!isCollapsed && place.picked === group && first !== undefined) place.picked = first.id
  place.scrolled = undefined
}

/** Scrolls a place's window from where the person left it, or else from where it stood. */
const scrollIn = (place: Place, by: Pan | number): void => {
  const at = place.held
  if (at !== undefined) place.scrolled = at.view.scroll(at.graph, at.room, place.scrolled ?? at.pan, by)
}

/** Draws a place in focus on its selected node, or all of it again; the window follows the selection again. */
const focusIn = (place: Place): void => {
  place.isFocused = !place.isFocused
  place.scrolled = undefined
}

/** Whether a node of a graph as it was last drawn is the box of a collapsed group. */
const isShutIn = (at: Held, id: string): boolean => at.whole.nodes.some(node => node.id === id && node.holds !== undefined)

/** The group of the node selected in a graph as it was last drawn, or the collapsed group whose box is selected, which of the two, and what it says: none where the selected node is in no group. */
const groupOf = (at: Held): { id: string; label: string; isShut: boolean } | undefined => {
  const isShut = at.selected !== null && isShutIn(at, at.selected)
  const id = isShut ? at.selected : at.given.nodes.find(node => node.id === at.selected)?.group
  return id === undefined || id === null ? undefined : { id, label: at.given.groups.find(group => group.id === id)?.label ?? id, isShut }
}

/** A graph as it was last drawn, its groups as they are there, running the way it runs there. */
const runningOf = (at: Held): Graph & { direction: Direction } => ({ ...at.whole, direction: at.view.direction(at.whole, at.room) })

/** A room as wide as `room`, and as tall as a graph needs. */
const tallOf = (room: Room): Room => ({ columns: room.columns, rows: MOST_CELLS })

/**
 * How graphs are drawn: as the plugin's options say, in a mod's site; folded
 * into the reply's width and at its left edge, in a reply on the terminal;
 * and still, in plain text and as a copy takes them, folded into the room
 * they have, with their links kept separate, since nothing still can be
 * selected to tell merged links apart, and no corner, which plain text has no
 * click for.
 */
let view = viewOf({ scroll: 'pinned', labels: 'wrap', links: 'separate', motion: 'still' })
let folded = inReply(viewOf({ scroll: 'pinned', labels: 'wrap', links: 'separate', motion: 'still' }, true))
let still = viewOf({ scroll: 'pinned', labels: 'wrap', links: 'separate', motion: 'still' }, true, false)

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

/** A graph as plain text: its still picture, in `room`, a line a row with no blanks at its end. */
const textOf = (graph: Graph, room: Room): string => pictureOf(still, graph, room).rows.map(row => rowText(row).trimEnd()).join('\n')

/** A site's graph as plain text, as it runs and with its groups as they are there, folded into the site's columns. */
const plainOf = (at: Held): string => textOf(runningOf(at), tallOf(at.room))

/** A drawing's rows as Text, painted as they are: for where nothing in them can be clicked. */
const rowsOf = (Text: Elements['terminal']['Text'], drawing: Drawing) =>
  drawing.rows.map(row => <Text wrap="truncate-end">{row.length === 0 ? ' ' : row.map(span => <Text {...styleOf(span)}>{span.text}</Text>)}</Text>)

/** Whether the terminal reports the mouse: in the fullscreen layout, and not on the main screen. */
const isClickable = (viewport: RenderViewport | undefined): boolean => viewport?.isFullscreen !== false

/** The key of the Client that draws a site's graph, and of a site's graph among the controls under its picture; the key of each of a reply's graphs starts with it. */
const GRAPH = 'graph'

/**
 * A site's graph on the terminal: to click and move through; on the main
 * screen, with no corner, since nothing there can be clicked; and where its
 * Client failed, its rows as they are, with no corner.
 */
const siteTreeOf = (elements: Pick<Elements['terminal'], 'Box' | 'Text' | 'Client'>, site: string, viewport: RenderViewport | undefined, at: Held) => {
  const { Box, Text, Client } = elements
  if (faulted.has(faultOf(site, GRAPH))) return <Box flexDirection="column">{rowsOf(Text, cornerless(at.drawing))}</Box>
  return <Client key={GRAPH} module="./surface.tsx" props={isClickable(viewport) ? at.drawing : cornerless(at.drawing)} />
}

/** The surfaces that draw a picture in SVG, an `Svg`: the desktop app, VS Code, and the mobile app. */
type Vectored = 'desktop' | 'vscode' | 'mobile'
/** The surfaces graphlet draws its graphs on as pictures in SVG: all that draw one, where the person's `pictures` setting is on, and else none. */
let vectored: ReadonlySet<string> = new Set()

/** The components a mod's site is drawn in. */
type SiteComponent = 'Pane' | 'AbovePrompt' | 'ToolResult' | 'CommandOutput'
/** A site drawn on a surface that draws vectors. */
type VectorSite = Extract<RenderInput<SiteComponent>, { surface: Vectored }>

/** What a control graphlet draws under a picture runs: the person's act is a hook's to answer, by the control's key. */
const NOTHING = (): void => undefined

/** What the key of every control graphlet draws under a picture starts with, so that it is no other plugin's. */
const CONTROL = 'graphlet:'
/** The key of a control under a picture: the key of the graph it is under, and what it does. */
const controlKeyOf = (key: string, does: string): string => `${CONTROL}${key}:${does}`
/** The most characters a value of a `Select`'s option may take: a node whose id is longer is not listed. */
const MOST_VALUE_CHARS = 10_000

/** A graph's picture on a surface that draws vectors, at its own width, or narrower where the room is, and under it what was left out of the graph, where anything was, and its controls, in a row. */
const pictureTreeOf = (elements: Pick<Elements[Vectored], 'Box' | 'Text' | 'Svg'>, vector: Vector, graph: Graph, controls: RenderElement[]) => {
  const { Box, Text, Svg } = elements
  const note = leftOut(graph.unread)[0]
  return (
    <Box flexDirection="column" gap="sm">
      {[
        <Svg source={vector.source} alt={vector.alt} width={vector.width} isInteractive />,
        ...(note === undefined ? [] : [<Text dimColor>{note}</Text>]),
        ...(controls.length === 0 ? [] : [<Box flexDirection="row" flexWrap="wrap" gap="sm">{controls}</Box>]),
      ]}
    </Box>
  )
}

/** The nodes of a site's graph in the order its picture is read, with its groups as they are there and all of it, in focus or not. */
const orderIn = (at: Held): string[] => still.order(runningOf(at), tallOf(at.room))

/**
 * The controls that pick a node under a site's picture: a list of all its
 * nodes, in the order the picture is read, the selected one picked, where
 * the surface draws one and every node's id fits an option; and else a step
 * back and a step on through them.
 */
const pickersOf = ($: EngineInterface, e: VectorSite, at: Held) => {
  const order = orderIn(at)
  if (e.surface === 'mobile' || order.some(id => id.length > MOST_VALUE_CHARS)) {
    const { Button } = $.ui.resolve(e)
    return [<Button key={controlKeyOf(GRAPH, 'previous')} label="‹" onPress={NOTHING} />, <Button key={controlKeyOf(GRAPH, 'next')} label="›" onPress={NOTHING} />]
  }
  const { Select } = $.ui.resolve(e)
  const nameOf = (id: string): string => {
    const node = at.whole.nodes.find(one => one.id === id)
    return node === undefined ? id : [node.mark, node.label].filter(word => word !== undefined).join(' ')
  }
  const options = order.map(id => ({ value: id, label: nameOf(id) }))
  return [<Select key={controlKeyOf(GRAPH, 'node')} label="Node" options={options} {...(at.selected === null ? {} : { value: at.selected })} onSelect={NOTHING} />]
}

/**
 * A site's graph on a surface that draws vectors: its picture, running the
 * way it runs on the terminal, with its groups as they are there, folded
 * into the site's columns and whole, with the selected node selected; and
 * under it controls that do what the terminal's keys do. They pick a node;
 * open the selected node, where it is not the box of a collapsed group;
 * collapse the selected node's group, or open the collapsed group whose box
 * is selected; in a graph larger than a graph in focus, draw it in focus,
 * and all of it again; and, except on the mobile app, open it as a web page.
 * Where the picture is too large for the surface, the graph is plain text.
 */
const vectorSiteOf = ($: EngineInterface, e: VectorSite, place: Place, at: Held) => {
  const { Button, Code } = $.ui.resolve(e)
  const whole = runningOf(at)
  const vector = still.vector({ ...at.graph, direction: whole.direction }, at.selected, tallOf(at.room))
  if (vector === undefined) return <Code source={plainOf(at)} wrap="truncate-end" />
  const group = groupOf(at)
  const controls = [
    ...pickersOf($, e, at),
    ...(at.selected === null || group?.isShut === true ? [] : [<Button key={controlKeyOf(GRAPH, 'open')} label="Open" onPress={NOTHING} />]),
    ...(group === undefined ? [] : [<Button key={controlKeyOf(GRAPH, 'group')} label={`${group.isShut ? 'Expand' : 'Collapse'} ${group.label}`} onPress={NOTHING} />]),
    ...(at.whole.nodes.length <= FOCUS_NODES ? [] : [<Button key={controlKeyOf(GRAPH, 'focus')} label={place.isFocused ? 'Show all' : 'Focus'} onPress={NOTHING} />]),
    ...(e.surface === 'mobile' ? [] : [<Button key={controlKeyOf(GRAPH, 'page')} label="Open in browser" onPress={NOTHING} />]),
  ]
  return pictureTreeOf($.ui.resolve(e), vector, at.graph, controls)
}

/**
 * A site's graph as its surface draws it: on the terminal, to click and move
 * through; on a surface graphlet draws pictures on, as a picture with
 * controls under it; and on any other, as plain text, drawn still, running the way it runs
 * on the terminal, with its groups as they are there, folded into the site's
 * columns and as tall as it needs.
 */
const siteDrawingOf = ($: EngineInterface, e: RenderInput<SiteComponent>, place: Place, at: Held) => {
  if (e.surface === 'terminal') return siteTreeOf($.ui.resolve(e), e.requestId, e.viewport, at)
  if (vectored.has(e.surface)) return vectorSiteOf($, e, place, at)
  const { Code } = $.ui.resolve(e)
  return <Code source={plainOf(at)} wrap="truncate-end" />
}

/** Puts a graph on the clipboard as plain text, as `textOf` draws it, and says whether it went. */
const copyGraph = async ($: EngineInterface, graph: Graph, room: Room, surface?: RenderSurface): Promise<void> => {
  const text = textOf(graph, room)
  const copied = await $.ui.copy({ text, ...(surface === undefined ? {} : { surface }) })
  $.ui.toast(copied.isCopied ? 'graphlet: copied the graph as text.' : `graphlet: could not copy the graph (${copied.reason}).`)
}

/** The columns the bullet opening a reply takes, which the reply's text is indented by. */
const BULLET_COLUMNS = 2
/** How wide a reply is taken to be on a surface that has not said. */
const REPLY_COLUMNS = 80
/** The key of the graph at `index` among a reply block's graphs: of the Client that draws it, and of the place it keeps. */
const keyOf = (index: number): string => `${GRAPH}:${index}`
/** What the web page of a reply block's graph is named: for the block's request, and the graph's place among its graphs. */
const pageNameOf = (requestId: string, key: string): string => `reply-${requestId.replace(/[^A-Za-z0-9]/g, '').slice(-8)}-${key.slice(`${GRAPH}:`.length)}`

/**
 * A reply block's graph on a surface that draws vectors: its picture, with
 * nothing selected, and, except on the mobile app, a control under it that
 * opens it as a web page, kept in its place among the block's; or where the
 * picture is too large for the surface, its still picture as plain text,
 * fenced as code, as large as its share of what the block may draw.
 */
const vectorReplyOf = (elements: Pick<Elements[Vectored], 'Box' | 'Text' | 'Svg' | 'Button' | 'Markdown'>, surface: Vectored, kept: Map<string, Place>, graph: Graph, index: number, room: Room, share: number) => {
  const { Button, Markdown } = elements
  const vector = still.vector(graph, null, room)
  if (vector === undefined) return <Markdown text={fencedOf(bounded(pictureOf(still, graph, room), share))} />
  const key = keyOf(index)
  const place = kept.get(key) ?? placeOf()
  kept.set(key, place)
  place.pictured = { ...graph, direction: still.direction(graph, room) }
  const controls = surface === 'mobile' ? [] : [<Button key={controlKeyOf(key, 'page')} label="Open in browser" plain dimColor onPress={NOTHING} />]
  return pictureTreeOf(elements, vector, graph, controls)
}

const isPan = (value: unknown): value is Pan =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as Pan).x) &&
  Number.isFinite((value as Pan).y)

/**
 * What the person's acts on a graph do where it is drawn. In a site, they
 * are the noun's methods, so that the site's owner hears them; in a reply,
 * which no mod owns, they are done in place, and a node opened or a key
 * graphlet has no use for goes nowhere.
 */
type Acts = {
  select: (node: string) => Promise<void>
  collapse: (group: string, isCollapsed: boolean) => Promise<void>
  scroll: (by: Pan) => Promise<void>
  open: (node: string) => Promise<void>
  key: (key: string, selected: string | null) => Promise<void>
}

/** A site's acts: the noun's methods, raised for the site's owner to hear. */
const siteActsOf = ($: EngineInterface, site: string): Acts => ({
  select: node => $.graphlet.select({ site, node }),
  collapse: (group, isCollapsed) => $.graphlet.collapse({ site, group, isCollapsed }),
  scroll: by => $.graphlet.scroll({ site, by }),
  open: node => $.graphlet.open({ site, node }),
  key: (key, selected) => $.graphlet.key({ site, key, selected }),
})

/** A reply's graph's acts, done in its place. */
const replyActsOf = (place: Place): Acts => ({
  select: async node => pickIn(place, node),
  collapse: async (group, isCollapsed) => collapseIn(place, group, isCollapsed),
  scroll: async by => scrollIn(place, by),
  open: async () => undefined,
  key: async () => undefined,
})

/**
 * What the acts on a graph as it was last drawn come to: opening a collapsed
 * group, which, where its box was selected, selects the first node it holds;
 * opening a node, a collapsed group's box by opening the group and any other
 * by `open`; and selecting a node, opening the collapsed group it is in,
 * where it is one and not the selected one already, and drawing the place
 * again either way.
 */
const movesOf = (at: Held, acts: Acts, redraw: () => void) => {
  const expand = async (group: string): Promise<void> => {
    await acts.collapse(group, false)
    const first = at.given.nodes.find(one => one.group === group)
    if (at.selected === group && first !== undefined) await acts.select(first.id)
  }
  return {
    expand,
    open: async (id: string): Promise<void> => (isShutIn(at, id) ? expand(id) : acts.open(id)),
    pick: async (to: string | undefined): Promise<void> => {
      const shut = at.given.nodes.find(one => one.id === to)?.group
      if (shut !== undefined && isShutIn(at, shut)) await acts.collapse(shut, false)
      if (to !== undefined && to !== at.selected) await acts.select(to)
      else redraw()
    },
  }
}

/** What a control under a picture is, by its key: the key of the graph it is under, and what it does; none for a key graphlet gave no control. */
const controlOf = (element: string): { key: string; does: string } | undefined => {
  if (!element.startsWith(CONTROL)) return undefined
  const [key, does] = [element.slice(CONTROL.length, element.lastIndexOf(':')), element.slice(element.lastIndexOf(':') + 1)]
  return { key, does }
}

export const register: Register = (on, options) => {
  const look = {
    scroll: options.scroll === 'sheet' ? ('sheet' as const) : ('pinned' as const),
    labels: options.labels === 'clip' ? ('clip' as const) : ('wrap' as const),
    links: options.links === 'merged' ? ('merged' as const) : ('separate' as const),
    motion: options.motion === 'flowing' ? ('flowing' as const) : ('still' as const),
  }
  view = viewOf(look)
  folded = inReply(viewOf(look, true))
  still = viewOf({ ...look, links: 'separate' }, true, false)
  const isDrawingReplies = options.replies !== 'off'
  vectored = new Set<Vectored>(options.pictures === 'on' ? ['desktop', 'vscode', 'mobile'] : [])

  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    const graphlet: Graphlet = {
      measure: async input => view.measure(readGraph(input.graph), cellsOf(input.columns)),
      text: async input => textOf(readGraph(input.graph), { columns: cellsOf(input.columns), rows: MOST_CELLS }),
      show: async input => {
        hasDrawn = true
        const place = keptIn(sites, input.site, placeOf, KEPT_SITES)
        const room = { columns: cellsOf(input.columns), rows: cellsOf(input.rows) }
        const { drawing, selected } = drawIn(place, readGraph(input.graph), room, MOST_TREE_CHARS, view, input.selected, leadOf)
        place.asks += 1
        return { rows: drawing.rows.length, selected }
      },
      step: async input => {
        const at = sites.get(input.site)?.held
        return at === undefined ? null : at.view.step(at.graph, at.selected, input.move, at.room, at.pan)
      },
      scroll: async input => {
        const place = sites.get(input.site)
        if (place === undefined || (typeof input.by === 'number' ? !Number.isFinite(input.by) : !isPan(input.by))) return
        scrollIn(place, input.by)
        built.ui.invalidate('ui.render')
      },
      select: async input => {
        pickIn(siteOf(input.site), input.node)
        built.ui.invalidate('ui.render')
      },
      open: async () => undefined,
      collapse: async input => {
        collapseIn(siteOf(input.site), input.group, input.isCollapsed === true)
        built.ui.invalidate('ui.render')
      },
      key: async () => undefined,
    }
    return { ...built, graphlet }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const place = sites.get(e.requestId)
    return place?.held === undefined ? next(e) : siteDrawingOf($, e, place, place.held)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const place = sites.get(e.requestId)
    const isAsked = place !== undefined && place.asks > 0
    if (place !== undefined) place.asks = Math.max(0, place.asks - 1)
    if (!isAsked || place?.held === undefined || e.props.hasSurvey) return next(e)
    return siteDrawingOf($, e, place, place.held)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const place = sites.get(e.requestId)
    return place?.held === undefined ? next(e) : siteDrawingOf($, e, place, place.held)
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const place = sites.get(e.requestId)
    return place?.held === undefined ? next(e) : siteDrawingOf($, e, place, place.held)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!isDrawingReplies || (e.surfaces.length === 0 && (await $.env.get('EVAL_GRAPHLET_GUIDE')) !== '1')) return composed
    return { sections: [...composed.sections, { id: 'graphlet:graphs', text: GUIDE, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const parts = e.props.isSummary || !isDrawingReplies ? [] : partsOf(e.props.text)
    if (!parts.some(part => 'graph' in part)) return next(e)
    hasDrawn = true
    const room = { columns: cellsOf((e.viewport?.columns ?? REPLY_COLUMNS) - BULLET_COLUMNS), rows: MOST_CELLS }
    const words = parts.reduce((sum, part) => sum + ('text' in part ? part.text.length : 0), 0)
    const share = Math.max(0, MOST_TREE_CHARS - words) / parts.filter(part => 'graph' in part).length
    const graphs = parts.flatMap(part => ('graph' in part ? [readGraph(part.graph)] : []))
    const shown = parts.map((part, at) => ('text' in part ? part : { graph: graphs[parts.slice(0, at).filter(one => 'graph' in one).length] as Graph }))
    const isPictured = e.surface === 'terminal' || vectored.has(e.surface)
    if (!isPictured) {
      const text = shown.map(part => ('text' in part ? part.text : fencedOf(bounded(pictureOf(still, part.graph, room), share)))).join('\n\n')
      return next({ ...e, props: { ...e.props, text } })
    }
    const kept = keptIn(replies, e.requestId, () => new Map<string, Place>(), KEPT_REPLIES)
    const [first, ...rest] = shown
    const lead = first !== undefined && 'text' in first ? [await next({ ...e, props: { ...e.props, text: first.text } })] : []
    const following = lead.length > 0 ? rest : shown
    if (e.surface !== 'terminal') {
      const elements = $.ui.resolve(e)
      const { Box, Markdown } = elements
      return (
        <Box flexDirection="column" gap="md">
          {[...lead, ...following.map(part => ('text' in part ? <Markdown text={part.text} /> : vectorReplyOf(elements, e.surface, kept, part.graph, graphs.indexOf(part.graph), room, share)))]}
        </Box>
      )
    }
    const { Box, Text, Markdown, Client } = $.ui.resolve(e)
    /**
     * The graph at `index` among the block's graphs: in the fullscreen layout,
     * which alone reports the mouse, to click and move through, as the person
     * left it in its place; and else, or where that failed, still.
     */
    const treeOf = (graph: Graph, index: number) => {
      const key = keyOf(index)
      if (!isClickable(e.viewport) || faulted.has(faultOf(e.requestId, key))) return rowsOf(Text, bounded(pictureOf(still, graph, room), share))
      const place = kept.get(key) ?? placeOf()
      kept.set(key, place)
      return <Client key={key} module="./surface.tsx" props={drawIn(place, graph, room, share, folded, undefined, () => null).drawing} />
    }
    return (
      <Box flexDirection="column">
        {[
          ...lead,
          ...following.map(part => (
            <Box flexDirection="column" marginLeft={BULLET_COLUMNS} marginTop={1}>
              {'text' in part ? <Markdown text={part.text} /> : treeOf(part.graph, graphs.indexOf(part.graph))}
            </Box>
          )),
        ]}
      </Box>
    )
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) tipRoll = undefined
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || Math.random() * TIP_ODDS >= 1) return done
    const tips = (await $.config.list().catch(() => [])).find(row => row.key === 'tips')
    if (tips?.value === false) return done
    tipRoll = Math.random()
    $.ui.invalidate('ui.render')
    return done
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (tipRoll === undefined || e.surface !== 'terminal' || e.props.isDraft || e.props.isWorking) return next(e)
    const columns = (e.viewport?.columns ?? REPLY_COLUMNS) - sizeOf(e.props.hint) - sizeOf(TIP_LEAD)
    const tip = tipOf({ isDrawingReplies, hasGraph: hasDrawn, isClickable: isClickable(e.viewport), columns }, tipRoll)
    return next(tip === undefined ? e : { ...e, props: { ...e.props, tail: `${TIP_LEAD}${tip}` } })
  })

  on('ui.fault', async ($, e, next) => {
    faulted.add(faultOf(e.requestId, e.element))
    $.ui.log(`graphlet: a graph could not be drawn to click (${e.reason}), so it is drawn still.`, { to: 'debug' })
    return next(e)
  })

  /**
   * A press on a control under a picture on a surface that draws vectors: in
   * a reply, a web page of the graph as it was pictured, or where graphlet
   * keeps it no longer, a toast that says so; and in a site, a web page of the
   * graph as it was drawn, a step back or on through its nodes in the order
   * the picture is read, opening the selected node, collapsing its group or
   * opening the collapsed group whose box it is, and drawing the graph in
   * focus or all of it again.
   */
  on('ui.press', { plugin: 'graphlet' }, async ($, e, next) => {
    const control = controlOf(e.element)
    if (control === undefined) return next(e)
    const { key, does } = control
    if (e.component === 'AssistantMessage') {
      const pictured = replies.get(e.requestId)?.get(key)?.pictured
      if (pictured === undefined) $.ui.toast('graphlet: that graph is no longer kept; scroll it out of view and back to draw it again.')
      else if (does === 'page') await openPage($, pageNameOf(e.requestId, key), 'reply', pictured, pictured.direction)
      return next(e)
    }
    const place = sites.get(e.requestId)
    const at = place?.held
    if (place === undefined || at === undefined || key !== GRAPH) return next(e)
    const acts = siteActsOf($, e.requestId)
    const moves = movesOf(at, acts, () => $.ui.invalidate('ui.render'))
    const group = groupOf(at)
    if (does === 'page') {
      const graph = runningOf(at)
      await openPage($, e.requestId, e.requestId, graph, graph.direction)
    } else if (does === 'previous' || does === 'next') await moves.pick(stepThrough(orderIn(at), at.selected, does === 'next' ? 1 : -1))
    else if (does === 'open' && at.selected !== null) await moves.open(at.selected)
    else if (does === 'group' && group?.isShut === true) await moves.expand(group.id)
    else if (does === 'group' && group !== undefined) await acts.collapse(group.id, true)
    else if (does === 'focus') {
      focusIn(place)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  /** A pick of a node from the list under a site's picture on a surface that draws vectors: it is selected, as a click on its box selects it. */
  on('ui.select', { plugin: 'graphlet' }, async ($, e, next) => {
    const control = controlOf(e.element)
    const at = sites.get(e.requestId)?.held
    if (control?.key === GRAPH && control.does === 'node' && at !== undefined && at.whole.nodes.some(node => node.id === e.value)) {
      await movesOf(at, siteActsOf($, e.requestId), () => $.ui.invalidate('ui.render')).pick(e.value)
    }
    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    const isReply = e.component === 'AssistantMessage'
    const place = isReply ? replies.get(e.requestId)?.get(e.element) : sites.get(e.requestId)
    const at = place?.held
    if (place === undefined || at === undefined || typeof e.data !== 'object' || e.data === null) return next(e)
    const site = e.requestId
    /** Draws the place again: a site, by asking its owner to draw it; a graph in a reply, by handing it its drawing when the message is answered. */
    const redraw = (): void => {
      if (!isReply) $.ui.invalidate('ui.render')
    }
    const acts = isReply ? replyActsOf(place) : siteActsOf($, site)
    const { expand, open, pick } = movesOf(at, acts, redraw)
    const selectedGroup = groupOf(at)
    const { node, isOpened, group, by, drag, grab, isDropped, key, copy, page, isChord } = e.data as {
      node?: unknown
      isOpened?: unknown
      group?: unknown
      by?: unknown
      drag?: unknown
      grab?: unknown
      isDropped?: unknown
      key?: unknown
      copy?: unknown
      page?: unknown
      isChord?: unknown
    }
    const query = place.finding
    const typed = key === 'space' ? ' ' : typeof key === 'string' && isChord !== true && charactersOf(key).length === 1 ? key : undefined
    if (isChord === true) {
      return {}
    } else if (typeof node === 'string') {
      place.finding = undefined
      if (node !== at.selected) await acts.select(node)
      else redraw()
      if (isOpened === true) await open(node)
    } else if (typeof group === 'string') {
      await acts.collapse(group, true)
    } else if (isPan(by)) {
      await acts.scroll(by)
    } else if (isPan(drag)) {
      const before = place.dragged !== undefined && place.dragged.grab === grab ? place.dragged.at : ORIGIN
      place.dragged = isDropped === true ? undefined : { grab, at: drag }
      if (before.x !== drag.x || before.y !== drag.y) await acts.scroll({ x: before.x - drag.x, y: before.y - drag.y })
    } else if (copy === true || (query === undefined && key === 'c')) {
      const graph = runningOf(at)
      const isFitting = isReply && still.measure(graph, at.room.columns).columns <= at.room.columns
      await copyGraph($, graph, isFitting ? at.room : SHEET, e.surface)
    } else if (page === true) {
      const graph = runningOf(at)
      await openPage($, isReply ? pageNameOf(site, e.element) : site, isReply ? 'reply' : site, graph, graph.direction)
    } else if (query !== undefined && key === 'backspace' && query === '') {
      place.finding = undefined
      redraw()
    } else if (query !== undefined && (typed !== undefined || key === 'backspace')) {
      const asked = typed === undefined ? charactersOf(query).slice(0, -1).join('') : `${query}${typed}`
      place.finding = asked
      await pick(foundIn(at.given, asked)[0])
    } else if (query !== undefined && key === 'return') {
      const found = foundIn(at.given, query)
      await pick(found[(found.indexOf(at.selected ?? '') + 1) % Math.max(found.length, 1)])
    } else if (key === 'return' && at.selected !== null) {
      await open(at.selected)
    } else if (key === 'space' && selectedGroup?.isShut === true) {
      await expand(selectedGroup.id)
    } else if (key === 'space' && selectedGroup !== undefined) {
      await acts.collapse(selectedGroup.id, true)
    } else if (key === '/') {
      place.finding = ''
      redraw()
    } else if (key === 'f') {
      focusIn(place)
      redraw()
    } else if (typeof key === 'string') {
      const move = MOVES[key]
      const to = move === undefined ? null : at.selected === null ? leadOf(at.graph) : at.view.step(at.graph, at.selected, move, at.room, at.pan)
      if (move === undefined) await acts.key(key, at.selected)
      else if (to !== null && to !== at.selected) await acts.select(to)
    }
    return isReply ? { props: drawIn(place, at.given, at.room, at.most, at.view, undefined, () => null).drawing } : {}
  })
}

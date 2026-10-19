import type { Elements, EngineInterface, Register, RenderSurface, RenderViewport } from 'claude-code'

import type { Graphlet } from '../types'
import { MOST_CELLS, MOST_TREE_CHARS, bounded, charactersOf, cornerless, rowText, sizeOf, styleOf } from './draw'
import type { Drawing, Pan, Room } from './draw'
import { readGraph } from './layers'
import type { Graph } from './layers'
import type { Direction } from './layout'
import { pageOf } from './page'
import { GUIDE, fencedOf, inReply, partsOf, pictureOf } from './reply'
import { TIP_ODDS, tipOf } from './tips'
import { MOVES, collapsedOf, focusOf, leadOf, viewOf } from './view'
import type { View } from './view'

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
 * many times `show` named it since the band last drew it; and what was last
 * drawn there.
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
const plainOf = (at: Held): string => textOf({ ...at.whole, direction: at.view.direction(at.whole, at.room) }, { columns: at.room.columns, rows: MOST_CELLS })

/** A drawing's rows as Text, painted as they are: for where nothing in them can be clicked. */
const rowsOf = (Text: Elements['terminal']['Text'], drawing: Drawing) =>
  drawing.rows.map(row => <Text wrap="truncate-end">{row.length === 0 ? ' ' : row.map(span => <Text {...styleOf(span)}>{span.text}</Text>)}</Text>)

/** Whether the terminal reports the mouse: in the fullscreen layout, and not on the main screen. */
const isClickable = (viewport: RenderViewport | undefined): boolean => viewport?.isFullscreen !== false

/**
 * A site's graph on the terminal: to click and move through; on the main
 * screen, with no corner, since nothing there can be clicked; and where its
 * Client failed, its rows as they are, with no corner.
 */
const siteTreeOf = (elements: Pick<Elements['terminal'], 'Box' | 'Text' | 'Client'>, site: string, viewport: RenderViewport | undefined, at: Held) => {
  const { Box, Text, Client } = elements
  if (faulted.has(faultOf(site, 'graph'))) return <Box flexDirection="column">{rowsOf(Text, cornerless(at.drawing))}</Box>
  return <Client key="graph" module="./surface.tsx" props={isClickable(viewport) ? at.drawing : cornerless(at.drawing)} />
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
/** The key of the Client that draws the graph at `index` among a reply block's graphs. */
const keyOf = (index: number): string => `graph:${index}`

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

  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    const graphlet: Graphlet = {
      measure: async input => view.measure(readGraph(input.graph), cellsOf(input.columns)),
      text: async input => textOf(readGraph(input.graph), { columns: cellsOf(input.columns), rows: MOST_CELLS }),
      show: async input => {
        hasDrawn = true
        const place = siteOf(input.site)
        sites.delete(input.site)
        sites.set(input.site, place)
        for (const old of [...sites.keys()].slice(0, Math.max(0, sites.size - KEPT_SITES))) sites.delete(old)
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
    const at = sites.get(e.requestId)?.held
    if (at === undefined) return next(e)
    if (e.surface === 'terminal') return siteTreeOf($.ui.resolve(e), e.requestId, e.viewport, at)
    const { Code } = $.ui.resolve(e)
    return <Code source={plainOf(at)} wrap="truncate-end" />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const place = sites.get(e.requestId)
    const isAsked = place !== undefined && place.asks > 0
    if (place !== undefined) place.asks = Math.max(0, place.asks - 1)
    const at = place?.held
    if (!isAsked || at === undefined || e.props.hasSurvey) return next(e)
    if (e.surface === 'terminal') return siteTreeOf($.ui.resolve(e), e.requestId, e.viewport, at)
    const { Code } = $.ui.resolve(e)
    return <Code source={plainOf(at)} wrap="truncate-end" />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const at = sites.get(e.requestId)?.held
    if (at === undefined) return next(e)
    if (e.surface === 'terminal') return siteTreeOf($.ui.resolve(e), e.requestId, e.viewport, at)
    const { Code } = $.ui.resolve(e)
    return <Code source={plainOf(at)} wrap="truncate-end" />
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const at = sites.get(e.requestId)?.held
    if (at === undefined) return next(e)
    if (e.surface === 'terminal') return siteTreeOf($.ui.resolve(e), e.requestId, e.viewport, at)
    const { Code } = $.ui.resolve(e)
    return <Code source={plainOf(at)} wrap="truncate-end" />
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
    if (e.surface !== 'terminal') {
      const text = shown.map(part => ('text' in part ? part.text : fencedOf(bounded(pictureOf(still, part.graph, room), share)))).join('\n\n')
      return next({ ...e, props: { ...e.props, text } })
    }
    const kept = replies.get(e.requestId) ?? new Map<string, Place>()
    replies.delete(e.requestId)
    replies.set(e.requestId, kept)
    for (const old of [...replies.keys()].slice(0, Math.max(0, replies.size - KEPT_REPLIES))) replies.delete(old)
    const { Box, Text, Markdown, Client } = $.ui.resolve(e)
    const [first, ...rest] = shown
    const lead = first !== undefined && 'text' in first ? [await next({ ...e, props: { ...e.props, text: first.text } })] : []
    const following = lead.length > 0 ? rest : shown
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
    const acts: Acts = isReply
      ? {
          select: async node => pickIn(place, node),
          collapse: async (group, isCollapsed) => collapseIn(place, group, isCollapsed),
          scroll: async by => scrollIn(place, by),
          open: async () => undefined,
          key: async () => undefined,
        }
      : {
          select: node => $.graphlet.select({ site, node }),
          collapse: (group, isCollapsed) => $.graphlet.collapse({ site, group, isCollapsed }),
          scroll: by => $.graphlet.scroll({ site, by }),
          open: node => $.graphlet.open({ site, node }),
          key: (key, selected) => $.graphlet.key({ site, key, selected }),
        }
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
    /** Whether a node of the graph as drawn is the box of a collapsed group. */
    const isShut = (id: string): boolean => at.whole.nodes.some(one => one.id === id && one.holds !== undefined)
    /** Opens a collapsed group, and where its box was selected, selects the first node it holds. */
    const expand = async (group: string): Promise<void> => {
      await acts.collapse(group, false)
      const first = at.given.nodes.find(one => one.group === group)
      if (at.selected === group && first !== undefined) await acts.select(first.id)
    }
    /** Opens a node: a collapsed group's box by opening the group, and any other by `open`. */
    const open = async (id: string): Promise<void> => (isShut(id) ? expand(id) : acts.open(id))
    /** Selects a node, opening the collapsed group it is in, where it is one and not the selected one already, and draws the place again either way. */
    const pick = async (to: string | undefined): Promise<void> => {
      const shut = at.given.nodes.find(one => one.id === to)?.group
      if (shut !== undefined && isShut(shut)) await acts.collapse(shut, false)
      if (to !== undefined && to !== at.selected) await acts.select(to)
      else redraw()
    }
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
      const graph = { ...at.whole, direction: at.view.direction(at.whole, at.room) }
      const isFitting = isReply && still.measure(graph, at.room.columns).columns <= at.room.columns
      await copyGraph($, graph, isFitting ? at.room : SHEET, e.surface)
    } else if (page === true) {
      const name = isReply ? `reply-${site.replace(/[^A-Za-z0-9]/g, '').slice(-8)}-${e.element.slice('graph:'.length)}` : site
      await openPage($, name, isReply ? 'reply' : site, at.whole, at.view.direction(at.whole, at.room))
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
    } else if (key === 'space' && at.selected !== null && isShut(at.selected)) {
      await expand(at.selected)
    } else if (key === 'space' && at.selected !== null && at.given.nodes.some(one => one.id === at.selected && one.group !== undefined)) {
      await acts.collapse(at.given.nodes.find(one => one.id === at.selected)?.group ?? '', true)
    } else if (key === '/') {
      place.finding = ''
      redraw()
    } else if (key === 'f') {
      place.isFocused = !place.isFocused
      place.scrolled = undefined
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

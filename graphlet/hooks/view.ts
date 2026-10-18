import type { GraphletMove, GraphletSize } from '../types'
import { MOST_CELLS } from './draw'
import type { Drawing, Pan, Room } from './draw'
import { priorityOf, ranksOf } from './layers'
import type { Graph, Link, Node } from './layers'
import { LEAST_COLUMNS, layoutOf } from './layout'
import type { Direction, Layout, Look } from './layout'
import { paint } from './paint'
import type { Finding } from './paint'
import { scrollIn, showIn, sightOf, stepIn } from './window'

// A graph as a person looks at it: laid out for a room, seen through a
// window, with one node selected.

/** How many layouts a view keeps, the last it laid out, so that a graph drawn again in the same room is not laid out again. */
const KEPT_LAYOUTS = 8
/** The fewest columns a layer of a graph that runs right takes, a box of the narrowest, and the channel between two layers: a graph with more layers than these fill the room's columns with never runs right. */
const LEAST_LAYER_COLUMNS = 7
const LEAST_CHANNEL_COLUMNS = 2
/** How many times fewer rows running right takes than running down where a graph that fits the room's columns runs right. */
const FEWER_ROWS = 2
/** How many nodes a graph in focus shows: the selected one and those nearest it, about as many as a pane shows whole. */
export const FOCUS_NODES = 24

/**
 * A graph in focus on its selected node: that node and those nearest it, by
 * the fewest links between, whichever way they run, up to `FOCUS_NODES`, of
 * nodes as near those of highest priority, and of those the ones the graph
 * names first; and the links among them. A
 * node shown that is joined to nodes not shown says how many after its badge,
 * `+3`, and what is not shown is counted as left out. With nothing selected,
 * or a graph no larger than that, it is the graph.
 */
export function focusOf(graph: Graph, selected: string | null): Graph {
  if (selected === null || graph.nodes.length <= FOCUS_NODES || !graph.nodes.some(node => node.id === selected)) return graph
  const joined = new Map<string, string[]>()
  for (const link of graph.links) {
    joined.set(link.from, [...(joined.get(link.from) ?? []), link.to])
    joined.set(link.to, [...(joined.get(link.to) ?? []), link.from])
  }
  const reached = new Map([[selected, 0]])
  for (const id of reached.keys()) for (const other of joined.get(id) ?? []) if (!reached.has(other)) reached.set(other, (reached.get(id) ?? 0) + 1)
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]))
  const priority = new Map(graph.nodes.map(node => [node.id, priorityOf(node)]))
  const shown = new Set(
    [...reached.keys()]
      .sort((a, b) => (reached.get(a) ?? 0) - (reached.get(b) ?? 0) || (priority.get(b) ?? 0) - (priority.get(a) ?? 0) || (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .slice(0, FOCUS_NODES),
  )
  const links: Link[] = graph.links.filter(link => shown.has(link.from) && shown.has(link.to))
  const nodes: Node[] = graph.nodes
    .filter(node => shown.has(node.id))
    .map(node => {
      const hidden = (joined.get(node.id) ?? []).filter(other => !shown.has(other)).length
      return hidden === 0 ? node : { ...node, badge: [node.badge, `+${hidden}`].filter(word => word !== undefined).join(' ') }
    })
  const unread = { nodes: graph.unread.nodes + graph.nodes.length - nodes.length, links: graph.unread.links + graph.links.length - links.length }
  return { ...graph, nodes, links, unread }
}

/** The sign before the label of a box that stands for a collapsed group. */
const COLLAPSED = '▸'

/**
 * A graph with each of its groups that is `shut` collapsed into one box that
 * stands for all the group holds: where its first node stood among the
 * graph's nodes, in its layer where it names one, saying the group's label
 * after `COLLAPSED`, in its tone,
 * and how many nodes it holds as its badge; put foremost where any of them
 * is, and of the highest priority any of them has. A link to or from any of
 * them is to or from the box, given once however many of them it joins it
 * to; a link between two of them is not drawn. A graph with nothing shut is
 * as it is.
 */
export function collapsedOf(graph: Graph, shut: Set<string>): Graph {
  const groups = graph.groups.filter(group => shut.has(group.id))
  if (groups.length === 0) return graph
  const into = new Map(graph.nodes.flatMap(node => (node.group !== undefined && shut.has(node.group) ? [[node.id, node.group] as const] : [])))
  const nodes = graph.nodes.flatMap((node): Node[] => {
    const id = into.get(node.id)
    const group = groups.find(one => one.id === id)
    if (group === undefined) return [node]
    const held = graph.nodes.filter(one => into.get(one.id) === id)
    if (held[0] !== node) return []
    const priority = Math.max(...held.map(priorityOf))
    return [{ id: group.id, label: group.label, mark: COLLAPSED, badge: String(held.length), holds: held.length, isForemost: held.some(one => one.isForemost), ...(group.tone === undefined ? {} : { tone: group.tone }), ...(priority === 0 ? {} : { priority }), ...(node.layer === undefined ? {} : { layer: node.layer }) }]
  })
  const kept = new Set<string>()
  const links = graph.links.flatMap((link): Link[] => {
    const [from, to] = [into.get(link.from) ?? link.from, into.get(link.to) ?? link.to]
    if (from === to && (into.has(link.from) || into.has(link.to))) return []
    const key = JSON.stringify([...(link.isDirected ? [from, to] : [from, to].sort().concat('--')), link.label ?? ''])
    if (kept.has(key)) return []
    kept.add(key)
    return [{ ...link, from, to }]
  })
  return { ...graph, nodes, links, groups: graph.groups.filter(group => !shut.has(group.id)) }
}

/** The node a graph is drawn with selected when nothing else is: the first it names of those of the highest priority; null in a graph with no nodes. */
export function leadOf(graph: Graph): string | null {
  return graph.nodes.reduce<Node | undefined>((lead, node) => (lead === undefined || priorityOf(node) > priorityOf(lead) ? node : lead), undefined)?.id ?? null
}

/** The keys that move the selection: the arrows, and the letters under them. */
export const MOVES: Readonly<Record<string, GraphletMove>> = {
  left: 'left',
  right: 'right',
  up: 'up',
  down: 'down',
  h: 'left',
  l: 'right',
  k: 'up',
  j: 'down',
}

/**
 * Whether a graph that says not which way it runs is better run right than
 * down in a room, laid out each way: where running right shows it whole and
 * running down does not, or where running right fits the room's columns, no
 * layer of it longer than the room, in `FEWER_ROWS` times fewer rows than
 * running down.
 */
function isRighter(down: Layout, right: Layout, room: Room): boolean {
  if (sightOf(right, room).isWhole && !sightOf(down, room).isWhole) return true
  const isFitting = right.rows <= room.columns && right.shelves.every(shelf => shelf.width <= right.columns)
  return isFitting && FEWER_ROWS * right.columns <= down.rows
}

/** What a view does with a graph, drawing it as it was made to. */
export type View = {
  /** Which way a graph runs in a room: as it says, or as `isRighter` finds better. */
  direction: (graph: Graph, room: Room) => Direction
  /** The size of the drawing in a room `columns` wide and as tall as it needs. */
  measure: (graph: Graph, columns: number) => GraphletSize
  /** Draws the graph through a window at `pan`, with what is being found marked. */
  draw: (graph: Graph, selected: string | null, room: Room, pan: Pan, finding?: Finding) => Drawing
  /** Where the window stands to show the selected node: as near `from` as it can. */
  show: (graph: Graph, selected: string | null, room: Room, from: Pan) => Pan
  /** Where the window stands after it is scrolled from `from`: by cells, or by turns of the wheel. */
  scroll: (graph: Graph, room: Room, from: Pan, by: Pan | number) => Pan
  /** The node a move from the selected one lands on. */
  step: (graph: Graph, selected: string | null, move: GraphletMove, room: Room, pan: Pan) => string | null
}

/**
 * A view that draws graphs as `look` says. One that is to `fold` folds a
 * graph's layers into its room, and measures a graph by the columns its
 * longest layer then takes; one that is not lays a layer longer than the room
 * across more than it, for a window to scroll over. A graph that says not
 * which way it runs is laid out both ways, unless it has more layers than
 * the room's columns could hold running right, and runs the way `isRighter`
 * finds better. A view keeps the layouts it last made, each by what its
 * graph holds, which way it runs, and the columns of its room, and its rows
 * too for one that runs right, and hands the same one back for the same
 * graph in such a room.
 */
export function viewOf(look: Look, fold = false): View {
  const kept = new Map<string, Layout>()
  const laidAs = (graph: Graph, room: Room, direction: Direction): Layout => {
    const key = `${direction} ${room.columns} ${direction === 'right' ? room.rows : ''} ${JSON.stringify(graph)}`
    const layout = kept.get(key) ?? layoutOf(graph, room, look, fold, direction)
    kept.delete(key)
    kept.set(key, layout)
    for (const old of [...kept.keys()].slice(0, Math.max(0, kept.size - KEPT_LAYOUTS))) kept.delete(old)
    return layout
  }
  const laid = (graph: Graph, room: Room): Layout => {
    if (graph.direction !== undefined) return laidAs(graph, room, graph.direction)
    const down = laidAs(graph, room, 'down')
    const layers = Math.max(0, ...ranksOf(graph).values()) + 1
    if (layers * LEAST_LAYER_COLUMNS + (layers - 1) * LEAST_CHANNEL_COLUMNS > room.columns) return down
    const right = laidAs(graph, room, 'right')
    return isRighter(down, right, room) ? right : down
  }
  return {
    direction: (graph, room) => laid(graph, room).direction,
    measure: (graph, columns) => {
      const layout = laid(graph, { columns, rows: MOST_CELLS })
      if (layout.direction === 'right') return { columns: layout.rows, rows: layout.shelves.length === 0 ? 0 : layout.columns + 1 }
      const across = fold
        ? Math.max(LEAST_COLUMNS, ...layout.shelves.map(shelf => shelf.width))
        : Math.max(layout.columns, ...layout.shelves.map(shelf => shelf.across))
      return { columns: across, rows: layout.shelves.length === 0 ? 0 : layout.rows + 1 }
    },
    draw: (graph, selected, room, pan, finding) => paint(laid(graph, room), graph, selected, room, pan, finding, look.motion === 'flowing'),
    show: (graph, selected, room, from) => showIn(laid(graph, room), selected, room, from),
    scroll: (graph, room, from, by) => scrollIn(laid(graph, room), room, from, by),
    step: (graph, selected, move, room, pan) => stepIn(laid(graph, room), graph, selected, move, room, pan),
  }
}

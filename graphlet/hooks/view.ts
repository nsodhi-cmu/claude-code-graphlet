import type { GraphletLink, GraphletMove, GraphletNode, GraphletSize } from '../types'
import type { Drawing, Pan, Room } from './draw'
import type { Graph } from './layers'
import { LEAST_COLUMNS, layoutOf } from './layout'
import type { Layout, Look } from './layout'
import { paint } from './paint'
import type { Finding } from './paint'
import { scrollIn, showIn, stepIn } from './window'

// A graph as a person looks at it: laid out for a room, seen through a
// window, with one node selected.

/** How many layouts a view keeps, the last it laid out, so that a graph drawn again in the same room is not laid out again. */
const KEPT_LAYOUTS = 8
/** How many nodes a graph in focus shows: the selected one and those nearest it, about as many as a pane shows whole. */
export const FOCUS_NODES = 24

/**
 * A graph in focus on its selected node: that node and those nearest it, by
 * the fewest links between, whichever way they run, up to `FOCUS_NODES`, of
 * nodes as near the ones the graph names first; and the links among them. A
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
  const shown = new Set([...reached.keys()].sort((a, b) => (reached.get(a) ?? 0) - (reached.get(b) ?? 0) || (order.get(a) ?? 0) - (order.get(b) ?? 0)).slice(0, FOCUS_NODES))
  const links: GraphletLink[] = graph.links.filter(link => shown.has(link.from) && shown.has(link.to))
  const nodes: GraphletNode[] = graph.nodes
    .filter(node => shown.has(node.id))
    .map(node => {
      const hidden = (joined.get(node.id) ?? []).filter(other => !shown.has(other)).length
      return hidden === 0 ? node : { ...node, badge: [node.badge, `+${hidden}`].filter(word => word !== undefined).join(' ') }
    })
  const unread = { nodes: graph.unread.nodes + graph.nodes.length - nodes.length, links: graph.unread.links + graph.links.length - links.length }
  return { ...graph, nodes, links, unread }
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

/** What a view does with a graph, drawing it as it was made to. */
export type View = {
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
 * across more than it, for a window to scroll over. A view keeps the layouts
 * it last made, each by what its graph holds and the columns of its room, and
 * hands the same one back for the same graph in a room as wide.
 */
export function viewOf(look: Look, fold = false): View {
  const kept = new Map<string, Layout>()
  const laid = (graph: Graph, room: Room): Layout => {
    const key = `${room.columns} ${JSON.stringify(graph)}`
    const layout = kept.get(key) ?? layoutOf(graph, room, look, fold)
    kept.delete(key)
    kept.set(key, layout)
    for (const old of [...kept.keys()].slice(0, Math.max(0, kept.size - KEPT_LAYOUTS))) kept.delete(old)
    return layout
  }
  return {
    measure: (graph, columns) => {
      const layout = laid(graph, { columns, rows: 0 })
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

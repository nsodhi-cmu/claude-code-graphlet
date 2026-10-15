import type { GraphletMove, GraphletSize } from '../types'
import type { Drawing, Pan, Room } from './draw'
import type { Graph } from './layers'
import { LEAST_COLUMNS, layoutOf } from './layout'
import type { Layout, Look } from './layout'
import { paint } from './paint'
import { scrollIn, showIn, stepIn } from './window'

// A graph as a person looks at it: laid out for a room, seen through a
// window, with one node selected.

/** How many layouts a view keeps, the last it laid out, so that a graph drawn again in the same room is not laid out again. */
const KEPT_LAYOUTS = 8

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
  /** Draws the graph through a window at `pan`. */
  draw: (graph: Graph, selected: string | null, room: Room, pan: Pan) => Drawing
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
    draw: (graph, selected, room, pan) => paint(laid(graph, room), graph, selected, room, pan),
    show: (graph, selected, room, from) => showIn(laid(graph, room), selected, room, from),
    scroll: (graph, room, from, by) => scrollIn(laid(graph, room), room, from, by),
    step: (graph, selected, move, room, pan) => stepIn(laid(graph, room), graph, selected, move, room, pan),
  }
}

import type { GraphletMove, GraphletSize } from '../types'
import type { Drawing, Pan, Room } from './draw'
import type { Graph } from './layers'
import { layoutOf } from './layout'
import type { Look } from './layout'
import { paint } from './paint'
import { scrollIn, showIn, sightOf, stepIn } from './window'

// A graph as a person looks at it: laid out for a room, seen through a
// window, with one node selected.

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

/** A room tall enough to draw any graph whole, which is how the rows a graph needs are counted. */
const WHOLE_ROWS = 100_000

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

export function viewOf(look: Look): View {
  return {
    measure: (graph, columns) => {
      const room = { columns, rows: WHOLE_ROWS }
      const layout = layoutOf(graph, room, look)
      const rows = paint(layout, graph, null, room, { x: 0, y: 0 }).rows.length
      return { columns: layout.columns + sightOf(layout, room).most.x, rows }
    },
    draw: (graph, selected, room, pan) => paint(layoutOf(graph, room, look), graph, selected, room, pan),
    show: (graph, selected, room, from) => showIn(layoutOf(graph, room, look), selected, room, from),
    scroll: (graph, room, from, by) => scrollIn(layoutOf(graph, room, look), room, from, by),
    step: (graph, selected, move, room, pan) => stepIn(layoutOf(graph, room, look), graph, selected, move, room, pan),
  }
}

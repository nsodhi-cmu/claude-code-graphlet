import type { GraphletMove } from '../types'
import { reveal } from './draw'
import type { Pan, Room } from './draw'
import { isJoined } from './layers'
import type { Graph } from './layers'
import { GAP, middleOf } from './layout'
import type { Layout, Place, Shelf } from './layout'

// The window a layout is seen through: how much of it a room shows, where
// the window stands to show the selected node, and where a scroll or a step
// of the selection takes it.

/** How much past the selected box a window that moves to it shows: sideways the gap and the start of the box beyond it, and up and down the wires nearest it. */
const MARGIN = { x: GAP + 4, y: 2 }
/** How far one turn of the wheel scrolls. */
const WHEEL = { x: 8, y: 2 }

/**
 * How a layout is seen in a room: whether whole, through how many rows, and
 * the farthest the window goes. The room's last row is kept for the foot.
 */
export type Sight = { isWhole: boolean; rows: number; most: Pan }

export function sightOf(layout: Layout, room: Room): Sight {
  const x = Math.max(0, ...layout.shelves.map(shelf => shelf.across - layout.columns))
  const rows = Math.max(1, Math.min(layout.rows, room.rows - 1))
  return { isWhole: x === 0 && rows >= layout.rows, rows, most: { x, y: Math.max(0, layout.rows - rows) } }
}

export const within = (pan: Pan, most: Pan): Pan => ({
  x: Math.min(Math.max(Math.round(pan.x), 0), most.x),
  y: Math.min(Math.max(Math.round(pan.y), 0), most.y),
})

/** How far a shelf has slid under a window at `x`: with it, as far as the end of what the shelf is laid out across. */
export const slideOf = (layout: Layout, shelf: Shelf | undefined, x: number): number =>
  shelf === undefined ? 0 : Math.min(x, shelf.across - layout.columns)

/** Where a node's box is: its shelf, and its place on it. */
function placeOf(layout: Layout, id: string | null): { shelf: Shelf; place: Place } | undefined {
  for (const shelf of layout.shelves) {
    const place = shelf.places.find(one => 'node' in one.slot && one.slot.node.id === id)
    if (place !== undefined) return { shelf, place }
  }
  return undefined
}

/**
 * Where the window stands to show the selected node. One that already shows
 * its whole box stays where it is; one that does not moves just far enough
 * to show the box, the wires above and below it, and the start of the boxes
 * beside it.
 */
export function showIn(layout: Layout, selected: string | null, room: Room, from: Pan): Pan {
  const sight = sightOf(layout, room)
  const at = within(from, sight.most)
  const found = placeOf(layout, selected)
  if (found === undefined) return at
  const { shelf, place } = found
  const slide = slideOf(layout, shelf, at.x)
  const shown = reveal(slide, place.x, place.x + place.width, layout.columns, shelf.across, MARGIN.x)
  return within(
    {
      x: shown === slide ? at.x : shown,
      y: reveal(at.y, shelf.top, shelf.top + shelf.rows, sight.rows, layout.rows, MARGIN.y),
    },
    sight.most,
  )
}

/**
 * Where the window stands after it is scrolled from `from`: by cells, or by
 * turns of the wheel, which go the way the graph has more rooms' worth out
 * of view, along it or down it.
 */
export function scrollIn(layout: Layout, room: Room, from: Pan, by: Pan | number): Pan {
  const { most, rows } = sightOf(layout, room)
  const at = within(from, most)
  const isDown = most.y * layout.columns > most.x * rows
  const step = typeof by !== 'number' ? by : isDown ? { x: 0, y: by * WHEEL.y } : { x: by * WHEEL.x, y: 0 }
  return within({ x: at.x + step.x, y: at.y + step.y }, most)
}

/**
 * The node a move from the selected one lands on. Left and right go along
 * its shelf, past any lanes. Up and down go to the next shelf: to the node
 * there that a link joins it to, the nearest of them in the window, or with
 * none joined, to the nearest. So every node can be reached by the keys.
 */
export function stepIn(
  layout: Layout,
  graph: Graph,
  selected: string | null,
  move: GraphletMove,
  room: Room,
  pan: Pan,
): string | null {
  const found = placeOf(layout, selected)
  if (found === undefined || selected === null) return selected
  const { shelf, place } = found
  const idOf = (one: Place): string | undefined => ('node' in one.slot ? one.slot.node.id : undefined)
  if (move === 'left' || move === 'right') {
    const nodes = shelf.places.filter(one => 'node' in one.slot)
    const to = nodes[nodes.indexOf(place) + (move === 'left' ? -1 : 1)]
    return (to === undefined ? undefined : idOf(to)) ?? selected
  }
  const at = within(pan, sightOf(layout, room).most)
  const seenAt = (one: Place): number => middleOf(one, one.x - slideOf(layout, layout.shelves[one.shelf], at.x))
  const next = (layout.shelves[place.shelf + (move === 'up' ? -1 : 1)]?.places ?? []).filter(one => 'node' in one.slot)
  const joined = next.filter(one => isJoined(graph, idOf(one) ?? '', selected))
  const to = [...(joined.length > 0 ? joined : next)].sort(
    (a, b) => Math.abs(seenAt(a) - seenAt(place)) - Math.abs(seenAt(b) - seenAt(place)),
  )[0]
  return (to === undefined ? undefined : idOf(to)) ?? selected
}

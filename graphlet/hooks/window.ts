import type { GraphletMove } from '../types'
import { reveal } from './draw'
import type { Pan, Room } from './draw'
import { isJoined } from './layers'
import type { Graph } from './layers'
import { GAP, middleOf } from './layout'
import type { Direction, Layout, Place, Shelf } from './layout'

// The window a layout is seen through: how much of it a room shows, where
// the window stands to show the selected node, and where a scroll or a step
// of the selection takes it; and the order a layout is read in, for a step
// through it where there is no window. A window stands as its layout is laid out, its
// `x` across the shelves and its `y` along the layers, which for a graph
// that runs right are down the room and across it; what the room hands it,
// a scroll by cells and an arrow key, is turned to match.

/** How much past the selected box a window that moves to it shows: across its shelf, the gap and the start of the box beyond it, and along the layers, the wires nearest it. */
const MARGINS: Readonly<Record<Direction, Pan>> = { down: { x: GAP + 4, y: 2 }, right: { x: 2, y: 4 } }
/** How far one turn of the wheel scrolls, across the room and down it. */
const WHEEL = { x: 8, y: 2 }
/** Where each arrow key moves the selection of a graph that runs right, as it would move it in one that runs down. */
const TURNED: Readonly<Record<GraphletMove, GraphletMove>> = { up: 'left', down: 'right', left: 'up', right: 'down' }

/**
 * How a layout is seen in a room: whether whole, through how many cells
 * along its layers, and the farthest the window goes. The room's last row is
 * kept for the foot, so a graph that runs down is seen through all its rows
 * but that one, and one that runs right through all its columns.
 */
export type Sight = { isWhole: boolean; rows: number; most: Pan }

export function sightOf(layout: Layout, room: Room): Sight {
  const x = Math.max(0, ...layout.shelves.map(shelf => shelf.across - layout.columns))
  const rows = Math.max(1, Math.min(layout.rows, layout.direction === 'down' ? room.rows - 1 : room.columns))
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
  const margin = MARGINS[layout.direction]
  const slide = slideOf(layout, shelf, at.x)
  const shown = reveal(slide, place.x, place.x + place.width, layout.columns, shelf.across, margin.x)
  return within(
    {
      x: shown === slide ? at.x : shown,
      y: reveal(at.y, shelf.top, shelf.top + shelf.rows, sight.rows, layout.rows, margin.y),
    },
    sight.most,
  )
}

/** Where a node's box, or a group's frame, has its top left corner as laid out, and the shelf it slides with: none where the layout has neither. */
function cornerOf(layout: Layout, id: string): { x: number; y: number; shelf: number } | undefined {
  const found = placeOf(layout, id)
  if (found !== undefined) return { x: found.place.x, y: found.shelf.top, shelf: found.place.shelf }
  const frame = layout.frames.find(one => one.group.id === id)
  return frame === undefined ? undefined : { x: frame.x, y: frame.top, shelf: frame.first }
}

/** Where a node's box, or a group's frame, has its top left corner in a window at `pan`, across and along it: none where the layout has neither. */
export function spotIn(layout: Layout, id: string, room: Room, pan: Pan): Pan | undefined {
  const at = within(pan, sightOf(layout, room).most)
  const corner = cornerOf(layout, id)
  return corner === undefined ? undefined : { x: corner.x - slideOf(layout, layout.shelves[corner.shelf], at.x), y: corner.y - at.y }
}

/** Where the window stands for a node's box, or a group's frame, to have its top left corner at `spot` in it, or as near there as the layout goes: where it stands at `from` where the layout has neither. */
export function keepIn(layout: Layout, id: string, room: Room, spot: Pan, from: Pan): Pan {
  const most = sightOf(layout, room).most
  const corner = cornerOf(layout, id)
  return within(corner === undefined ? from : { x: corner.x - spot.x, y: corner.y - spot.y }, most)
}

/**
 * Where the window stands after it is scrolled from `from`: by cells across
 * the room and down it, or by turns of the wheel, which go the way the graph
 * has more rooms' worth out of view, along its layers or across them.
 */
export function scrollIn(layout: Layout, room: Room, from: Pan, by: Pan | number): Pan {
  const { most, rows } = sightOf(layout, room)
  const at = within(from, most)
  const isRight = layout.direction === 'right'
  const wheel = isRight ? { x: WHEEL.y, y: WHEEL.x } : WHEEL
  const isAlong = most.y * layout.columns > most.x * rows
  const step = typeof by !== 'number' ? (isRight ? { x: by.y, y: by.x } : by) : isAlong ? { x: 0, y: by * wheel.y } : { x: by * wheel.x, y: 0 }
  return within({ x: at.x + step.x, y: at.y + step.y }, most)
}

/**
 * The node a move from the selected one lands on. Left and right go along
 * its shelf, past any lanes. Up and down go to the next shelf: to the node
 * there that an edge joins it to, the nearest of them in the window, or with
 * none joined, to the nearest. So every node can be reached by the keys. In
 * a graph that runs right, the keys are turned with it: up and down go along
 * a shelf, and left and right to the next.
 */
export function stepIn(
  layout: Layout,
  graph: Graph,
  selected: string | null,
  key: GraphletMove,
  room: Room,
  pan: Pan,
): string | null {
  const move = layout.direction === 'right' ? TURNED[key] : key
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

/** The nodes in the order a layout is read: its shelves from the first, and each across. */
export const orderOf = (layout: Layout): string[] =>
  layout.shelves.flatMap(shelf => shelf.places.toSorted((a, b) => a.x - b.x).flatMap(place => ('node' in place.slot ? [place.slot.node.id] : [])))

/** The node a step along `order` lands on from the selected one, `way` a step on or back, round from the last to the first; from none selected, the first or the last. */
export function stepThrough(order: readonly string[], selected: string | null, way: 1 | -1): string | undefined {
  const at = order.indexOf(selected ?? '')
  const from = at === -1 ? (way === 1 ? -1 : 0) : at
  return order[(from + way + order.length) % order.length]
}

import { canvasOf, footRow, spansOf } from './draw'
import type { Canvas, Drawing, Hit, Paint, Pan, Room } from './draw'
import { isJoined } from './layers'
import type { Graph } from './layers'
import { routeOf, sizeOf } from './layout'
import type { Channel, End, Layout, Place, Shelf } from './layout'
import { sightOf, slideOf, within } from './window'

// The picture: a layout painted through a window, the boxes in box
// characters and the wires in the channels between them, with the selected
// node and everything linked to it lit.

/** How much of a window stays in view when a click scrolls it: about a box sideways, and a few rows down. */
const PAGE_OVERLAP = { x: 16, y: 3 }

type Frame = { corners: string; across: string; down: string; exits: { above: string; below: string } }

const FRAMES = {
  plain: { corners: '┌┐└┘', across: '─', down: '│', exits: { above: '┴', below: '┬' } },
  selected: { corners: '╔╗╚╝', across: '═', down: '║', exits: { above: '╧', below: '╤' } },
} as const satisfies Record<string, Frame>

/** Where a window puts things: each place's first column, and each row of the layout. */
type Seen = { xOf: (place: Place) => number; yOf: (row: number) => number; columns: number; rows: number }

const idOf = (place: Place): string | null => ('node' in place.slot ? place.slot.node.id : null)

function borderOf(graph: Graph, place: Place, selected: string | null): Paint {
  const id = idOf(place)
  if (id !== null && selected !== null && (id === selected || isJoined(graph, id, selected))) return 'accent'
  const tone = ('node' in place.slot ? place.slot.node.tone : undefined) ?? 'plain'
  return tone === 'plain' ? 'dim' : tone
}

/**
 * Paints a shelf: each node's box from the shelf's top, and each lane down
 * all of it. Answers where a click selects which node, over as much of its
 * box as the window shows. A box the window's edge cuts ends there in an
 * ellipsis.
 */
function paintShelf(canvas: Canvas, graph: Graph, shelf: Shelf, selected: string | null, seen: Seen): Hit[] {
  const hits: Hit[] = []
  const top = seen.yOf(shelf.top)
  for (const place of shelf.places) {
    const left = seen.xOf(place)
    if ('lane' in place.slot) {
      const { lane, isUp } = place.slot
      const paint = lane.from === selected || lane.to === selected ? 'accent' : 'dim'
      for (let row = 0; row < shelf.rows; row += 1) canvas.put(left, top + row, isUp ? '┊' : '│', { paint })
      continue
    }
    const { node } = place.slot
    const words = place.words ?? { mark: '', lines: [], badge: '' }
    const isSelected = node.id === selected
    const frame = isSelected ? FRAMES.selected : FRAMES.plain
    const border = { paint: borderOf(graph, place, selected) }
    const [topLeft = '', topRight = '', bottomLeft = '', bottomRight = ''] = frame.corners
    const bar = frame.across.repeat(place.width - 2)
    canvas.put(left, top, `${topLeft}${bar}${topRight}`, border)
    canvas.put(left, top + place.rows - 1, `${bottomLeft}${bar}${bottomRight}`, border)
    const text = { paint: node.tone ?? 'plain', ...(isSelected ? { isBold: true as const, isInverse: true as const } : {}) }
    const widest = Math.max(
      ...words.lines.map((line, index) => sizeOf(line) + (index === words.lines.length - 1 ? sizeOf(words.badge) : 0)),
    )
    const inset = Math.floor((place.width - 4 - sizeOf(words.mark) - widest) / 2)
    for (let row = 1; row < place.rows - 1; row += 1) {
      canvas.put(left, top + row, frame.down, border)
      canvas.put(left + place.width - 1, top + row, frame.down, border)
      const line = words.lines[row - 1]
      if (line === undefined) continue
      const said = row === 1 ? `${words.mark}${line}` : line
      const start = left + 2 + (row === 1 ? 0 : sizeOf(words.mark)) + inset
      canvas.put(start, top + row, said, text)
      if (row === words.lines.length) canvas.put(start + sizeOf(said), top + row, words.badge, { paint: 'dim' })
    }
    if (left < 0 && left + place.width > 0) canvas.put(0, top + 1, '…', { paint: 'dim' })
    if (left < seen.columns && left + place.width > seen.columns) canvas.put(seen.columns - 1, top + 1, '…', { paint: 'dim' })
    const [x, y] = [Math.max(left, 0), Math.max(top, 0)]
    const width = Math.min(left + place.width, seen.columns) - x
    const height = Math.min(top + place.rows, seen.rows) - y
    if (width > 0 && height > 0) hits.push({ node: node.id, x, y, width, height })
  }
  return hits
}

/** Which ways a wire leaves a cell; a cell several wires share shows all of theirs. */
const UP = 1
const DOWN = 2
const LEFT = 4
const RIGHT = 8

const JUNCTIONS: Record<number, string> = {
  [UP]: '│',
  [DOWN]: '│',
  [UP | DOWN]: '│',
  [LEFT]: '─',
  [RIGHT]: '─',
  [LEFT | RIGHT]: '─',
  [DOWN | RIGHT]: '┌',
  [DOWN | LEFT]: '┐',
  [UP | RIGHT]: '└',
  [UP | LEFT]: '┘',
  [UP | DOWN | RIGHT]: '├',
  [UP | DOWN | LEFT]: '┤',
  [DOWN | LEFT | RIGHT]: '┬',
  [UP | LEFT | RIGHT]: '┴',
  [UP | DOWN | LEFT | RIGHT]: '┼',
}

/** How a straight run of wire is drawn where every wire in the cell runs against the flow. */
const DASHED: Record<string, string> = { '│': '┊', '─': '┈' }

/** What the wires make of one cell: the ways they leave it, an arrowhead, whether any is lit, and whether any runs with the flow. */
type Mark = { ways: number; head?: string; isLit: boolean; isSolid: boolean }

/**
 * Paints the wires of one channel. A wire goes from the border it leaves to
 * its track, along it, and on to the border it reaches, or straight across
 * where it leaves and arrives in one column. A wire against the flow
 * is dashed, what touches the selected node is lit over what does not, and a
 * wire to a place out of the window runs off the window's edge.
 */
function paintChannel(canvas: Canvas, graph: Graph, layout: Layout, channel: Channel, selected: string | null, seen: Seen): void {
  const first = seen.yOf(channel.top)
  const below = first + channel.rows
  const marks = new Map<string, Mark>()
  const exits = new Map<string, { char: string; isLit: boolean; paint: Paint }>()
  const markAt = (x: number, y: number): Mark | undefined => {
    if (x < 0 || x >= seen.columns) return undefined
    const key = `${x},${y}`
    const mark = marks.get(key) ?? { ways: 0, isLit: false, isSolid: false }
    marks.set(key, mark)
    return mark
  }
  /** The row of the border an end meets: the bottom of its own box, which may be shorter than its shelf, or the top of the shelf below. */
  const borderOfEnd = (end: End): number =>
    end.isAbove ? seen.yOf(layout.shelves[end.place.shelf]?.top ?? 0) + end.place.rows - 1 : below

  for (const wire of channel.wires) {
    const turn = first + (channel.hasUpHeads ? 1 : 0) + wire.track
    const { out, into } = routeOf(wire, seen.xOf)
    const isLit = selected !== null && (wire.link.from === selected || wire.link.to === selected)
    const [start, end] = [borderOfEnd(wire.from), borderOfEnd(wire.to)]
    const draw = (x: number, y: number, ways: number): void => {
      const mark = markAt(x, y)
      if (mark === undefined) return
      mark.ways |= ways
      mark.isLit ||= isLit
      mark.isSolid ||= !wire.isUp
    }
    /** Marks a column of the wire between a border and its turn, the border's own row left to the box. */
    const down = (x: number, border: number): void => {
      const [high, low] = [Math.min(border, turn), Math.max(border, turn)]
      for (let y = Math.max(high, 0); y <= Math.min(low, seen.rows - 1); y += 1) {
        if (y !== border) draw(x, y, (y > high ? UP : 0) | (y < low ? DOWN : 0))
      }
    }
    down(out, start)
    down(into, end)
    const [left, right] = [Math.min(out, into), Math.max(out, into)]
    for (let x = Math.max(left, 0); x <= Math.min(right, seen.columns - 1); x += 1) {
      draw(x, turn, (x > left ? LEFT : 0) | (x < right ? RIGHT : 0))
    }
    const head = wire.hasHead ? markAt(into, wire.to.isAbove ? end + 1 : end - 1) : undefined
    if (head !== undefined) head.head = wire.to.isAbove ? '▲' : '▼'

    const { place } = wire.from
    if ('lane' in place.slot) continue
    const frame = place.slot.node.id === selected ? FRAMES.selected : FRAMES.plain
    const key = `${out},${start}`
    exits.set(key, {
      char: wire.from.isAbove ? frame.exits.below : frame.exits.above,
      isLit: isLit || (exits.get(key)?.isLit ?? false),
      paint: borderOf(graph, place, selected),
    })
  }

  for (const [key, exit] of exits) {
    const [x = 0, y = 0] = key.split(',').map(Number)
    canvas.put(x, y, exit.char, { paint: exit.isLit ? 'accent' : exit.paint })
  }
  for (const [key, mark] of marks) {
    const [x = 0, y = 0] = key.split(',').map(Number)
    const line = JUNCTIONS[mark.ways] ?? ' '
    canvas.put(x, y, mark.head ?? (mark.isSolid ? line : (DASHED[line] ?? line)), { paint: mark.isLit ? 'accent' : 'dim' })
  }
}

/**
 * Paints a layout through a window at `pan`. Every shelf slides under the
 * window together, each as far as its own end. The last row is the foot: it
 * counts the nodes out of view of a graph larger than the room, and holds
 * the corner a click opens the graph as a web page by.
 */
export function paint(layout: Layout, graph: Graph, selected: string | null, room: Room, pan: Pan): Drawing {
  if (layout.shelves.length === 0) return { rows: [], hits: [] }
  const sight = sightOf(layout, room)
  const at = within(pan, sight.most)
  const canvas = canvasOf(layout.columns, sight.rows)
  const seen: Seen = {
    xOf: place => place.x - slideOf(layout, layout.shelves[place.shelf], at.x),
    yOf: row => row - at.y,
    columns: layout.columns,
    rows: sight.rows,
  }

  const hits = layout.shelves.flatMap(shelf => paintShelf(canvas, graph, shelf, selected, seen))
  for (const channel of layout.channels) paintChannel(canvas, graph, layout, channel, selected, seen)

  const rows = canvas.cells.map(spansOf)
  const boxes = layout.shelves.flatMap(shelf =>
    shelf.places.filter(place => 'node' in place.slot).map(place => ({ place, x: seen.xOf(place), y: seen.yOf(shelf.top), rows: place.rows })),
  )
  const beyond = {
    left: boxes.filter(box => box.x < 0).length,
    right: boxes.filter(box => box.x + box.place.width > layout.columns).length,
    above: boxes.filter(box => box.y < 0).length,
    below: boxes.filter(box => box.y + box.rows > sight.rows).length,
  }
  const page = { x: Math.max(1, layout.columns - PAGE_OVERLAP.x), y: Math.max(1, sight.rows - PAGE_OVERLAP.y) }
  const foot = footRow(sight.isWhole ? undefined : beyond, layout.columns, page, rows.length)
  return { rows: [...rows, foot.row], hits: [...hits, ...foot.hits] }
}

import { BEATS, canvasOf, clipMiddle, footRow, leftOut, sizeOf, spansOf } from './draw'
import type { Canvas, Drawing, Hit, Paint, Pan, Room } from './draw'
import { isJoined } from './layers'
import type { Graph } from './layers'
import { labelOf, layTracks, routeOf } from './layout'
import type { Channel, End, Layout, Place, Shelf } from './layout'
import { sightOf, slideOf, within } from './window'

// The picture: a layout painted through a window, the boxes in box
// characters and the wires in the channels between them, with the selected
// node and everything linked to it lit.

/** How much of a window stays in view when a click scrolls it: about a box sideways, and a few rows down. */
const PAGE_OVERLAP = { x: 16, y: 3 }
/** How many cells a node's name takes where it is written at the window's edge, cut in the middle past that. */
const SIGN_CELLS = 20

type Frame = { corners: string; across: string; down: string; exits: { above: string; below: string } }

const FRAMES = {
  plain: { corners: '┌┐└┘', across: '─', down: '│', exits: { above: '┴', below: '┬' } },
  selected: { corners: '╔╗╚╝', across: '═', down: '║', exits: { above: '╧', below: '╤' } },
} as const satisfies Record<string, Frame>

/** Where a window puts things: each place's first column, and each row of the layout. */
type Seen = { xOf: (place: Place) => number; yOf: (row: number) => number; columns: number; rows: number }

/** A node's box as the window has it: its place, its first column, its top row, and how many rows it takes. */
type Box = { place: Place; x: number; y: number; rows: number }

const idOf = (place: Place): string | null => ('node' in place.slot ? place.slot.node.id : null)

/** The beat of a cell of a flowing line, by how far along the way the line runs the cell stands: its row or column, counted the way the line goes. */
const beatOf = (along: number): number => ((along % BEATS) + BEATS) % BEATS

/** What is being looked for in a graph, and the nodes whose labels hold it, in the graph's order. */
export type Finding = { query: string; found: string[] }

/** The paint of a box's border: lit where it is the selected node's or one linked to it, else `note` where its node was found, else its tone. */
function borderOf(graph: Graph, place: Place, selected: string | null, found: Set<string>): Paint {
  const id = idOf(place)
  if (id !== null && selected !== null && (id === selected || isJoined(graph, id, selected))) return 'accent'
  if (id !== null && found.has(id)) return 'note'
  const tone = ('node' in place.slot ? place.slot.node.tone : undefined) ?? 'plain'
  return tone === 'plain' ? 'dim' : tone
}

/**
 * Paints a shelf: each node's box from the shelf's top, and each lane down
 * all of it. Answers where a click selects which node, over as much of its
 * box as the window shows. A box the window's edge cuts ends there in an
 * ellipsis.
 */
function paintShelf(canvas: Canvas, graph: Graph, shelf: Shelf, selected: string | null, seen: Seen, found: Set<string>, isFlowing: boolean): Hit[] {
  const hits: Hit[] = []
  const top = seen.yOf(shelf.top)
  for (const place of shelf.places) {
    const left = seen.xOf(place)
    if ('lane' in place.slot) {
      const { lane, isUp } = place.slot
      const isLit = lane.some(link => link.from === selected || link.to === selected)
      const flows = isLit && isFlowing && graph.isDirected
      for (let row = 0; row < shelf.rows; row += 1) {
        const y = top + row
        canvas.put(left, y, isUp ? '┊' : '│', { paint: isLit ? 'accent' : 'dim', ...(flows ? { beat: beatOf(isUp ? -y : y) } : {}) })
      }
      continue
    }
    const { node } = place.slot
    const words = place.words ?? { mark: '', lines: [], badge: '' }
    const isSelected = node.id === selected
    const frame = isSelected ? FRAMES.selected : FRAMES.plain
    const border = { paint: borderOf(graph, place, selected, found) }
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

/** What the wires of one bundle make of one cell: the ways they leave it, whether any is lit, whether any runs with the flow, and the beat of the first lit one that flows. */
type Mark = { ways: number; isLit: boolean; isSolid: boolean; beat?: number }

/**
 * Paints the wires of one channel. A wire goes from the border it leaves to
 * its track, along it, and on to the border it reaches, or straight across
 * where it leaves and arrives in one column. A border shows a tick where a
 * wire leaves it, and where one with no arrowhead reaches it. A wire against
 * the flow is dashed, what touches the selected node is lit over what does
 * not, and a wire to a place out of the window runs off the window's edge.
 * Wires of one bundle that meet are joined, in a tee or a cross; a wire that
 * only crosses another bundle's passes over it unbroken, and breaks the line
 * it crosses. A wire's label is written just past its box, beside the port it
 * leaves by.
 */
function paintChannel(canvas: Canvas, graph: Graph, layout: Layout, channel: Channel, selected: string | null, seen: Seen, isFlowing: boolean): void {
  const first = seen.yOf(channel.top)
  const below = first + channel.rows
  const cells = new Map<string, Map<number, Mark>>()
  const heads = new Map<string, { char: string; isLit: boolean }>()
  const exits = new Map<string, { char: string; isLit: boolean; paint: Paint }>()
  /** The row of the border an end meets: the bottom of its own box, which may be shorter than its shelf, or the top of the shelf below. */
  const borderOfEnd = (end: End): number =>
    end.isAbove ? seen.yOf(layout.shelves[end.place.shelf]?.top ?? 0) + end.place.rows - 1 : below

  const tracks = first + (channel.hasTopRow ? 1 : 0)
  for (const wire of channel.wires) {
    const turn = tracks + wire.track
    const jog = wire.jog === null ? null : { x: seen.xOf(wire.from.place) + wire.jog.at, turn: tracks + wire.jog.track }
    const { out, into } = routeOf(wire, seen.xOf)
    const isLit = selected !== null && (wire.link.from === selected || wire.link.to === selected)
    const flows = isLit && isFlowing && graph.isDirected
    const [start, end] = [borderOfEnd(wire.from), borderOfEnd(wire.to)]
    const draw = (x: number, y: number, ways: number, along: number): void => {
      if (x < 0 || x >= seen.columns) return
      const marks = cells.get(`${x},${y}`) ?? new Map<number, Mark>()
      const mark = marks.get(wire.bundle) ?? { ways: 0, isLit: false, isSolid: false }
      const beat = mark.beat ?? (flows ? beatOf(along) : undefined)
      cells.set(`${x},${y}`, marks.set(wire.bundle, { ways: mark.ways | ways, isLit: mark.isLit || isLit, isSolid: mark.isSolid || !wire.isUp, ...(beat === undefined ? {} : { beat }) }))
    }
    /** Marks a column of the wire, as it runs from row `from` to row `to`, leaving out row `skip`: a border's own row is the box's. */
    const upright = (x: number, from: number, to: number, skip?: number): void => {
      const [high, low] = [Math.min(from, to), Math.max(from, to)]
      for (let y = Math.max(high, 0); y <= Math.min(low, seen.rows - 1); y += 1) {
        if (y !== skip) draw(x, y, (y > high ? UP : 0) | (y < low ? DOWN : 0), Math.sign(to - from) * y)
      }
    }
    /** Marks a row of the wire, as it runs from column `from` to column `to`. */
    const across = (from: number, to: number, y: number): void => {
      const [left, right] = [Math.min(from, to), Math.max(from, to)]
      for (let x = Math.max(left, 0); x <= Math.min(right, seen.columns - 1); x += 1) {
        draw(x, y, (x > left ? LEFT : 0) | (x < right ? RIGHT : 0), Math.sign(to - from) * x)
      }
    }
    upright(out, start, turn, start)
    upright(into, jog?.turn ?? turn, end, end)
    if (jog === null) {
      across(out, into, turn)
    } else {
      across(out, jog.x, turn)
      upright(jog.x, turn, jog.turn)
      across(jog.x, into, jog.turn)
    }
    /** Marks where the wire meets a box's border, at `x` on the border's row `y`. */
    const tick = ({ place, isAbove }: End, x: number, y: number): void => {
      if ('lane' in place.slot) return
      const frame = place.slot.node.id === selected ? FRAMES.selected : FRAMES.plain
      const key = `${x},${y}`
      exits.set(key, {
        char: isAbove ? frame.exits.below : frame.exits.above,
        isLit: isLit || (exits.get(key)?.isLit ?? false),
        paint: borderOf(graph, place, selected, new Set()),
      })
    }
    tick(wire.from, out, start)
    if (wire.hasHead) {
      const key = `${into},${wire.to.isAbove ? end + 1 : end - 1}`
      heads.set(key, { char: wire.to.isAbove ? '▲' : '▼', isLit: isLit || (heads.get(key)?.isLit ?? false) })
    } else {
      tick(wire.to, into, end)
    }
  }

  for (const [key, exit] of exits) {
    const [x = 0, y = 0] = key.split(',').map(Number)
    canvas.put(x, y, exit.char, { paint: exit.isLit ? 'accent' : exit.paint })
  }
  for (const [key, marks] of cells) {
    const [x = 0, y = 0] = key.split(',').map(Number)
    const upright = [...marks.values()].filter(mark => (mark.ways & (UP | DOWN)) !== 0)
    const shown = upright.length > 0 ? upright : [...marks.values()]
    const line = JUNCTIONS[shown.reduce((ways, mark) => ways | mark.ways, 0)] ?? ' '
    const isSolid = shown.some(mark => mark.isSolid)
    const beat = shown.find(mark => mark.beat !== undefined)?.beat
    canvas.put(x, y, isSolid ? line : (DASHED[line] ?? line), { paint: shown.some(mark => mark.isLit) ? 'accent' : 'dim', ...(beat === undefined ? {} : { beat }) })
  }
  for (const [key, head] of heads) {
    const [x = 0, y = 0] = key.split(',').map(Number)
    canvas.put(x, y, head.char, { paint: head.isLit ? 'accent' : 'dim' })
  }
  const labels = new Map<string, { text: string; isLit: boolean }>()
  for (const wire of channel.wires) {
    const text = labelOf(wire.link)
    if (text === '' || 'lane' in wire.from.place.slot) continue
    const border = borderOfEnd(wire.from)
    const key = `${seen.xOf(wire.from.place) + wire.from.at + 1},${wire.from.isAbove ? border + 1 : border - 1}`
    const isLit = selected !== null && (wire.link.from === selected || wire.link.to === selected)
    labels.set(key, { text, isLit: isLit || (labels.get(key)?.isLit ?? false) })
  }
  for (const [key, label] of labels) {
    const [x = 0, y = 0] = key.split(',').map(Number)
    canvas.put(x, y, label.text, { paint: label.isLit ? 'accent' : 'plain' })
  }
}

/** What a name at the window's edge may be written over: a blank, a line, or an arrowhead. */
const COVERABLE = /^[ \u2500-\u257f▲▼]$/u
/** The four edges of a window, and the arrow a name written at each points out with. */
const EDGES = { top: '▴', bottom: '▾', left: '◂', right: '▸' } as const

/**
 * Writes at the window's edge the names of the nodes joined to the selected
 * one whose labels the window does not show, while it shows the selected
 * node's own, each with an arrow pointing out toward its box: a box beside
 * the window is named at that side, on the row of its label; one above or
 * below it, along the top or bottom row, under or over the middle of the
 * box as near as the row allows. A name is written only over lines and
 * blanks that are not lit and in no box, with a blank on either side. Names
 * at the sides are written first, then those along the top and bottom; a
 * name that would cover a box, a lit line, or a name written already moves
 * along its edge to the nearest place it may be written, and one with no
 * such place is not written. Answers each name as a hit that selects its
 * node.
 */
function paintSigns(canvas: Canvas, graph: Graph, boxes: Box[], selected: string | null, seen: Seen): Hit[] {
  const isShown = (box: Box): boolean => box.y + 1 >= 0 && box.y + 1 < seen.rows && box.x + 2 < seen.columns && box.x + box.place.width - 2 > 0
  const from = boxes.find(box => idOf(box.place) === selected)
  if (selected === null || from === undefined || !isShown(from)) return []
  const signs = boxes.flatMap(box => {
    const id = idOf(box.place)
    if (id === null || id === selected || isShown(box) || !isJoined(graph, id, selected)) return []
    const row = box.y + 1
    const edge: keyof typeof EDGES = row < 0 ? 'top' : row >= seen.rows ? 'bottom' : box.x < 0 ? 'left' : 'right'
    const name = 'node' in box.place.slot ? clipMiddle(box.place.slot.node.label, SIGN_CELLS) : ''
    const text = edge === 'right' ? `${name} ${EDGES[edge]}` : `${EDGES[edge]} ${name}`
    const width = sizeOf(text)
    const isAcross = edge === 'top' || edge === 'bottom'
    const along = isAcross ? Math.round(box.x + (box.place.width - width) / 2) : row
    return [{ id, edge, text, width, isAcross, along }]
  })
  const hits: Hit[] = []
  const boxed = new Set<string>()
  for (const box of boxes) {
    for (let y = Math.max(box.y, 0); y < Math.min(box.y + box.rows, seen.rows); y += 1) {
      for (let x = Math.max(box.x, 0); x < Math.min(box.x + box.place.width, seen.columns); x += 1) boxed.add(`${x},${y}`)
    }
  }
  /** Whether a name may be written over a cell: a line or a blank, not lit, and in no box. */
  const isCoverable = (x: number, y: number): boolean => {
    const cell = canvas.cells[y]?.[x]
    return cell === undefined || (COVERABLE.test(cell.char) && cell.paint !== 'accent' && !boxed.has(`${x},${y}`))
  }
  const isFree = (x: number, y: number, width: number): boolean =>
    x >= 0 &&
    x + width <= seen.columns &&
    y >= 0 &&
    y < seen.rows &&
    !hits.some(hit => hit.y === y && x < hit.x + hit.width + 1 && hit.x < x + width + 1) &&
    Array.from({ length: width + 2 }, (_, index) => x - 1 + index).every(column => isCoverable(column, y))
  for (const sign of [...signs.filter(one => !one.isAcross), ...signs.filter(one => one.isAcross)]) {
    const placeAt = (at: number): [number, number] =>
      sign.isAcross ? [at, sign.edge === 'top' ? 0 : seen.rows - 1] : [sign.edge === 'left' ? 0 : seen.columns - sign.width, at]
    const wanted = sign.isAcross ? Math.min(Math.max(sign.along, 0), seen.columns - sign.width) : sign.along
    const reach = sign.isAcross ? seen.columns : seen.rows
    const near = Array.from({ length: 2 * reach }, (_, step) => wanted + (step % 2 === 0 ? step / 2 : -(step + 1) / 2))
    const at = near.find(one => isFree(...placeAt(one), sign.width))
    if (at === undefined) continue
    const [x, y] = placeAt(at)
    canvas.put(x - 1, y, ' ', { paint: 'plain' })
    canvas.put(x + sign.width, y, ' ', { paint: 'plain' })
    canvas.put(x, y, sign.text, { paint: 'accent' })
    hits.push({ node: sign.id, x, y, width: sign.width, height: 1 })
  }
  return hits
}

/**
 * Paints a layout through a window at `pan`. Every shelf slides under the
 * window together, each as far as its own end, and the wires between two
 * shelves that have slid apart are given their tracks again as they now
 * stand. A channel the window shows nothing of, nor of either shelf beside
 * it, is passed over. Where something is being found, the boxes of the nodes
 * found have their borders in `note`. The nodes joined to the selected one
 * that the window does not show are named at its edge. Where the lines are to
 * flow, in a directed graph, each cell of a lit line has its beat. The last row is the
 * foot: it counts the nodes out of view of a graph larger than the room, says
 * what is being found and which of the found the selected node is, or else
 * what was left out of the graph, and holds the corner a click opens the
 * graph as a web page by.
 */
export function paint(layout: Layout, graph: Graph, selected: string | null, room: Room, pan: Pan, finding?: Finding, isFlowing = false): Drawing {
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

  const found = new Set(finding?.found)
  const hits = layout.shelves.flatMap(shelf => paintShelf(canvas, graph, shelf, selected, seen, found, isFlowing))
  const isInView = (top: number, rows: number): boolean => seen.yOf(top) < seen.rows && seen.yOf(top + rows) > 0
  layout.channels.forEach((channel, index) => {
    const [above, below] = [layout.shelves[index], layout.shelves[index + 1]]
    const isNear = [above, below].some(shelf => shelf !== undefined && isInView(shelf.top, shelf.rows))
    if (!isInView(channel.top, channel.rows) && !isNear) return
    if (channel.isLoose) layTracks(channel, seen.xOf, channel.rows - Number(channel.hasTopRow) - Number(channel.hasBottomRow))
    paintChannel(canvas, graph, layout, channel, selected, seen, isFlowing)
  })

  const boxes: Box[] = layout.shelves.flatMap(shelf =>
    shelf.places.filter(place => 'node' in place.slot).map(place => ({ place, x: seen.xOf(place), y: seen.yOf(shelf.top), rows: place.rows })),
  )
  const signs = paintSigns(canvas, graph, boxes, selected, seen)
  const rows = canvas.cells.map(spansOf)
  const beyond = {
    left: boxes.filter(box => box.x < 0).length,
    right: boxes.filter(box => box.x + box.place.width > layout.columns).length,
    above: boxes.filter(box => box.y < 0).length,
    below: boxes.filter(box => box.y + box.rows > sight.rows).length,
  }
  const page = { x: Math.max(1, layout.columns - PAGE_OVERLAP.x), y: Math.max(1, sight.rows - PAGE_OVERLAP.y) }
  const which = finding === undefined ? -1 : finding.found.indexOf(selected ?? '')
  const notes =
    finding === undefined
      ? leftOut(graph.unread)
      : [`/${finding.query} · ${finding.found.length === 0 ? 'no match' : `${Math.max(which, 0) + 1} of ${finding.found.length}`}`, `/${finding.query}`]
  const foot = footRow(sight.isWhole ? undefined : beyond, layout.columns, page, rows.length, notes)
  return { rows: [...rows, foot.row], hits: [...signs, ...hits, ...foot.hits] }
}

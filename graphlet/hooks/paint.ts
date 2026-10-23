import { bounded, canvasOf, clipMiddle, footRow, leftOut, sizeOf, spansOf } from './draw'
import type { Canvas, Cell, Drawing, Hit, Paint, Pan, Room } from './draw'
import { isJoined, priorityOf } from './layers'
import type { Graph, Link, Node } from './layers'
import { labelOf, layTracks, routeOf } from './layout'
import type { Channel, End, Frame as GroupFrame, Layout, Place, Shelf } from './layout'
import { sightOf, slideOf, within } from './window'

// The picture: a layout painted through a window, the boxes in box
// characters and the wires in the channels between them, with the selected
// node and everything linked to it lit. A layout is worked out across its
// shelves and along its layers; running right, the picture turns it, so its
// lines run the other way while every box and every word reads as ever.

/** How much of a window stays in view when a click scrolls it: about a box sideways, and a few rows down. */
const PAGE_OVERLAP = { x: 16, y: 3 }
/** How many cells a node's name takes where it is written at the window's edge, cut in the middle past that. */
const SIGN_CELLS = 20
/** The fewest cells of a frame's top border its label is written in: a blank, a character of the label and an ellipsis, a blank, and a cell of border after. A frame with no stretch so long has no label. */
const LEAST_TITLE_CELLS = 5

/** A box's frame: its corners, its sides, and the tick on each side where a link meets it. */
type Frame = { corners: string; across: string; down: string; exits: { top: string; bottom: string; left: string; right: string } }

const FRAMES = {
  plain: { corners: '┌┐└┘', across: '─', down: '│', exits: { top: '┴', bottom: '┬', left: '┤', right: '├' } },
  foremost: { corners: '┏┓┗┛', across: '━', down: '┃', exits: { top: '┷', bottom: '┯', left: '┨', right: '┠' } },
  selected: { corners: '╔╗╚╝', across: '═', down: '║', exits: { top: '╧', bottom: '╤', left: '╢', right: '╟' } },
  collapsed: { corners: '╭╮╰╯', across: '─', down: '│', exits: { top: '┴', bottom: '┬', left: '┤', right: '├' } },
} as const satisfies Record<string, Frame>

/** A node's frame: doubled where it is selected, round where it stands for a collapsed group, heavy where the graph puts it foremost, else plain. */
const frameOf = (node: Node, selected: string | null): Frame =>
  node.id === selected ? FRAMES.selected : node.holds !== undefined ? FRAMES.collapsed : node.isForemost ? FRAMES.foremost : FRAMES.plain

/**
 * Where a window puts things: how far across it each place starts and how
 * far along it each cell of the layout is, how many cells it shows across
 * and along, and where on the picture, `width` columns by `height` rows, a
 * cell across and along stands.
 */
type Seen = {
  xOf: (place: Place) => number
  yOf: (row: number) => number
  columns: number
  rows: number
  width: number
  height: number
  isRight: boolean
  realOf: (across: number, along: number) => { x: number; y: number }
}

/** A node's box on the picture: its place, its first column, its top row, and how many columns and rows it takes. */
type Box = { place: Place; x: number; y: number; width: number; height: number }

const idOf = (place: Place): string | null => ('node' in place.slot ? place.slot.node.id : null)

/** A place's box on the picture, for a shelf whose top is `top` along the window. */
const boxOf = (seen: Seen, place: Place, top: number): Box => {
  const { x, y } = seen.realOf(seen.xOf(place), top)
  return seen.isRight ? { place, x, y, width: place.rows, height: place.width } : { place, x, y, width: place.width, height: place.rows }
}

/** How far a box's label stands in from its border and the space after it, so that its widest line, with the badge after the last, is in the box's middle. */
function insetOf(box: Box): number {
  const words = box.place.words ?? { mark: '', lines: [], badge: '' }
  const widest = Math.max(...words.lines.map((line, index) => sizeOf(line) + (index === words.lines.length - 1 ? sizeOf(words.badge) : 0)))
  return Math.floor((box.width - 4 - sizeOf(words.mark) - widest) / 2)
}

/** The row of a box's first line of label: under its top border, and in a box taller than its label, in its middle. */
const firstRowOf = (box: Box): number => box.y + 1 + Math.floor((box.height - 2 - (box.place.words?.lines.length ?? 0)) / 2)


/** The paint of a link's line where it is not lit: its tone, or dim. */
const lineOf = (link: Link | undefined): Paint => link?.tone ?? 'dim'

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
 * all of it. The selected node's label is bold and inverse, and a node the
 * graph puts foremost has its label bold. Answers where a click selects
 * which node, over as much of its box as the window shows. A box the
 * window's side cuts ends there in an ellipsis.
 */
function paintShelf(canvas: Canvas, graph: Graph, shelf: Shelf, selected: string | null, seen: Seen, found: Set<string>): Hit[] {
  const hits: Hit[] = []
  const top = seen.yOf(shelf.top)
  for (const place of shelf.places) {
    if ('lane' in place.slot) {
      const { lane, isUp } = place.slot
      const isLit = lane.some(link => link.from === selected || link.to === selected)
      const char = seen.isRight ? (isUp ? '┈' : '─') : isUp ? '┊' : '│'
      for (let row = 0; row < shelf.rows; row += 1) {
        const { x, y } = seen.realOf(seen.xOf(place), top + row)
        canvas.put(x, y, char, { paint: isLit ? 'accent' : lineOf(lane[0]) })
      }
      continue
    }
    const { node } = place.slot
    const box = boxOf(seen, place, top)
    const words = place.words ?? { mark: '', lines: [], badge: '' }
    const isSelected = node.id === selected
    const frame = frameOf(node, selected)
    const border = { paint: borderOf(graph, place, selected, found) }
    const [topLeft = '', topRight = '', bottomLeft = '', bottomRight = ''] = frame.corners
    const bar = frame.across.repeat(box.width - 2)
    canvas.put(box.x, box.y, `${topLeft}${bar}${topRight}`, border)
    canvas.put(box.x, box.y + box.height - 1, `${bottomLeft}${bar}${bottomRight}`, border)
    for (let row = 1; row < box.height - 1; row += 1) {
      canvas.put(box.x, box.y + row, frame.down, border)
      canvas.put(box.x + box.width - 1, box.y + row, frame.down, border)
    }
    const text = { paint: node.tone ?? 'plain', ...(isSelected || node.isForemost ? { isBold: true as const } : {}), ...(isSelected ? { isInverse: true as const } : {}) }
    const [inset, first] = [insetOf(box), firstRowOf(box)]
    words.lines.forEach((line, index) => {
      const said = index === 0 ? `${words.mark}${line}` : line
      const start = box.x + 2 + (index === 0 ? 0 : sizeOf(words.mark)) + inset
      canvas.put(start, first + index, said, text)
      if (index === words.lines.length - 1) canvas.put(start + sizeOf(said), first + index, words.badge, { paint: 'dim' })
    })
    if (box.x < 0 && box.x + box.width > 0) canvas.put(0, first, '…', { paint: 'dim' })
    if (box.x < seen.width && box.x + box.width > seen.width) canvas.put(seen.width - 1, first, '…', { paint: 'dim' })
    const [x, y] = [Math.max(box.x, 0), Math.max(box.y, 0)]
    const width = Math.min(box.x + box.width, seen.width) - x
    const height = Math.min(box.y + box.height, seen.height) - y
    if (width > 0 && height > 0) hits.push({ node: node.id, x, y, width, height })
  }
  return hits
}

/** A group's frame on the picture: its corners. */
type FrameBox = { frame: GroupFrame; left: number; right: number; top: number; bottom: number }

/** Where a group's frame stands on the picture, at `x` across the window. */
const frameBoxOf = (frame: GroupFrame, x: number, seen: Seen): FrameBox => {
  const [start, end] = [seen.realOf(x, seen.yOf(frame.top)), seen.realOf(x + frame.width - 1, seen.yOf(frame.bottom))]
  return { frame, left: Math.min(start.x, end.x), right: Math.max(start.x, end.x), top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y) }
}

/**
 * Paints a group's frame: a box with round corners around all the group
 * holds, in the group's tone, or dim. The lines that cross it are painted
 * over it after, and its label after them.
 */
function paintFrame(canvas: Canvas, box: FrameBox): void {
  const { left, right, top, bottom } = box
  const border = { paint: box.frame.group.tone ?? ('dim' as const) }
  const bar = '─'.repeat(Math.max(0, right - left - 1))
  canvas.put(left, top, `╭${bar}╮`, border)
  canvas.put(left, bottom, `╰${bar}╯`, border)
  for (let y = top + 1; y < bottom; y += 1) {
    canvas.put(left, y, '│', border)
    canvas.put(right, y, '│', border)
  }
}

/**
 * Writes a group's label in its frame's top border, a blank on either side,
 * as near its left corner as it can stand where no line crosses the border
 * there or in the cell after it, or else in any such stretch it fits, and
 * cut in its middle where the border has none long enough: then in the
 * longest it has, where that is `LEAST_TITLE_CELLS` or more. It is in the
 * group's tone, or plain. Answers where a click
 * collapses the group: on the label, where the window shows it.
 */
function writeTitle(canvas: Canvas, box: FrameBox): Hit[] {
  const row = canvas.cells[box.top] ?? []
  const runs: Array<{ start: number; length: number }> = []
  for (let x = box.left + 2; x < box.right - 1; x += 1) {
    const isFree = row[x]?.char === '─'
    const last = runs.at(-1)
    if (!isFree) continue
    if (last !== undefined && last.start + last.length === x) last.length += 1
    else runs.push({ start: x, length: 1 })
  }
  const label = box.frame.group.label
  const run = runs.find(one => one.length >= sizeOf(label) + 3) ?? runs.find(one => one.length >= sizeOf(label) + 2) ?? runs.toSorted((a, b) => b.length - a.length)[0]
  if (run === undefined || run.length < LEAST_TITLE_CELLS) return []
  const title = ` ${clipMiddle(label, Math.min(sizeOf(label), run.length - 2))} `
  canvas.put(run.start, box.top, title, { paint: box.frame.group.tone ?? 'plain' })
  const [start, end] = [Math.max(run.start, 0), Math.min(run.start + sizeOf(title), canvas.cells[0]?.length ?? 0)]
  return box.top >= 0 && box.top < canvas.cells.length && end > start ? [{ group: box.frame.group.id, x: start, y: box.top, width: end - start, height: 1 }] : []
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

/** The ways a wire leaves a cell on the picture, from the ways it leaves it along the layers and across them: running right, along is across the room and across is down it. */
const turnedOf = (ways: number, isRight: boolean): number =>
  !isRight ? ways : (ways & UP ? LEFT : 0) | (ways & DOWN ? RIGHT : 0) | (ways & LEFT ? UP : 0) | (ways & RIGHT ? DOWN : 0)

/** What the wires of one bundle make of one cell: the ways they leave it, whether any is lit, whether any runs with the flow, and the paint of their line where it is not lit. */
type Mark = { ways: number; isLit: boolean; isSolid: boolean; line: Paint }

/**
 * Paints the wires of one channel. A wire goes from the border it leaves to
 * its track, along it, and on to the border it reaches, or straight across
 * where it leaves and arrives in one column. All of it is worked out across
 * and along the window, and turned where it is written. A border shows a tick where a
 * wire leaves it, and where one with no arrowhead reaches it. A wire against
 * the flow is dashed, what touches the selected node is lit over what does
 * not, what does not is in its link's tone or dim, and a wire to a place out
 * of the window runs off the window's edge.
 * Wires of one bundle that meet are joined, in a tee or a cross; a wire that
 * only crosses another bundle's passes over it unbroken, and breaks the line
 * it crosses. A wire's label is written just past its box: running down,
 * beside the port it leaves by; running right, on its line.
 */
function paintChannel(canvas: Canvas, graph: Graph, layout: Layout, channel: Channel, selected: string | null, seen: Seen): void {
  const first = seen.yOf(channel.top)
  const below = first + channel.rows
  const cells = new Map<string, Map<number, Mark>>()
  const heads = new Map<string, { char: string; isLit: boolean; line: Paint }>()
  const exits = new Map<string, { char: string; isLit: boolean; paint: Paint }>()
  /** The row of the border an end meets: the bottom of its own box, which may be shorter than its shelf, or the top of the shelf below. */
  const borderOfEnd = (end: End): number =>
    end.isAbove ? seen.yOf(layout.shelves[end.place.shelf]?.top ?? 0) + end.place.rows - 1 : below

  const tracks = first + channel.topRows + channel.frameBottom
  for (const wire of channel.wires) {
    const turn = tracks + wire.track
    const jog = wire.jog === null ? null : { x: seen.xOf(wire.from.place) + wire.jog.at, turn: tracks + wire.jog.track }
    const { out, into } = routeOf(wire, seen.xOf)
    const isLit = selected !== null && (wire.link.from === selected || wire.link.to === selected)
    const [start, end] = [borderOfEnd(wire.from), borderOfEnd(wire.to)]
    const draw = (x: number, y: number, ways: number): void => {
      if (x < 0 || x >= seen.columns) return
      const marks = cells.get(`${x},${y}`) ?? new Map<number, Mark>()
      const mark = marks.get(wire.bundle) ?? { ways: 0, isLit: false, isSolid: false, line: lineOf(wire.link) }
      cells.set(`${x},${y}`, marks.set(wire.bundle, { ways: mark.ways | ways, isLit: mark.isLit || isLit, isSolid: mark.isSolid || !wire.isUp, line: mark.line }))
    }
    /** Marks a column of the wire, as it runs from row `from` to row `to`, leaving out row `skip`: a border's own row is the box's. */
    const upright = (x: number, from: number, to: number, skip?: number): void => {
      const [high, low] = [Math.min(from, to), Math.max(from, to)]
      for (let y = Math.max(high, 0); y <= Math.min(low, seen.rows - 1); y += 1) {
        if (y !== skip) draw(x, y, (y > high ? UP : 0) | (y < low ? DOWN : 0))
      }
    }
    /** Marks a row of the wire, as it runs from column `from` to column `to`. */
    const across = (from: number, to: number, y: number): void => {
      const [left, right] = [Math.min(from, to), Math.max(from, to)]
      for (let x = Math.max(left, 0); x <= Math.min(right, seen.columns - 1); x += 1) {
        draw(x, y, (x > left ? LEFT : 0) | (x < right ? RIGHT : 0))
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
      const { exits: sides } = frameOf(place.slot.node, selected)
      const key = `${x},${y}`
      exits.set(key, {
        char: seen.isRight ? (isAbove ? sides.right : sides.left) : isAbove ? sides.bottom : sides.top,
        isLit: isLit || (exits.get(key)?.isLit ?? false),
        paint: borderOf(graph, place, selected, new Set()),
      })
    }
    tick(wire.from, out, start)
    if (wire.hasHead) {
      const key = `${into},${wire.to.isAbove ? end + 1 : end - 1}`
      const char = seen.isRight ? (wire.to.isAbove ? '◀' : '▶') : wire.to.isAbove ? '▲' : '▼'
      heads.set(key, { char, isLit: isLit || (heads.get(key)?.isLit ?? false), line: lineOf(wire.link) })
    } else {
      tick(wire.to, into, end)
    }
  }

  /** Writes at a cell across and along the window, where the picture has it. */
  const put = (key: string, text: string, style: Omit<Cell, 'char'>): void => {
    const [across = 0, along = 0] = key.split(',').map(Number)
    const { x, y } = seen.realOf(across, along)
    canvas.put(x, y, text, style)
  }
  for (const [key, exit] of exits) put(key, exit.char, { paint: exit.isLit ? 'accent' : exit.paint })
  for (const [key, marks] of cells) {
    const upright = [...marks.values()].filter(mark => (mark.ways & (UP | DOWN)) !== 0)
    const shown = upright.length > 0 ? upright : [...marks.values()]
    const line = JUNCTIONS[turnedOf(shown.reduce((ways, mark) => ways | mark.ways, 0), seen.isRight)] ?? ' '
    const isSolid = shown.some(mark => mark.isSolid)
    put(key, isSolid ? line : (DASHED[line] ?? line), { paint: shown.some(mark => mark.isLit) ? 'accent' : (shown.find(mark => mark.line !== 'dim')?.line ?? 'dim') })
  }
  for (const [key, head] of heads) put(key, head.char, { paint: head.isLit ? 'accent' : head.line })
  const labels = new Map<string, { text: string; isLit: boolean; tone: Paint }>()
  for (const wire of channel.wires) {
    const text = labelOf(wire.link)
    if (text === '' || 'lane' in wire.from.place.slot) continue
    const border = borderOfEnd(wire.from)
    const port = seen.xOf(wire.from.place) + wire.from.at
    const key = seen.isRight
      ? `${port},${wire.from.isAbove ? border + 1 : border - sizeOf(text)}`
      : `${port + 1},${wire.from.isAbove ? border + 1 : border - 1}`
    const isLit = selected !== null && (wire.link.from === selected || wire.link.to === selected)
    labels.set(key, { text, isLit: isLit || (labels.get(key)?.isLit ?? false), tone: wire.link.tone ?? 'plain' })
  }
  for (const [key, label] of labels) put(key, label.text, { paint: label.isLit ? 'accent' : label.tone })
}

/** What a name at the window's edge may be written over: a blank, a line, or an arrowhead. */
const COVERABLE = /^[ \u2500-\u257f▲▼◀▶]$/u
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
 * at the sides are written first, then those along the top and bottom, and
 * of each, those of the nodes of highest priority first; a name that would
 * cover a box, a lit line, or a name written already moves along its edge to
 * the nearest place it may be written, and one with no such place is not
 * written. Answers each name as a hit that selects its node.
 */
function paintSigns(canvas: Canvas, graph: Graph, boxes: Box[], selected: string | null, seen: Seen): Hit[] {
  /** Whether the window shows some of a box's label, apart from the first and last columns, where a box the edge cuts ends in an ellipsis. */
  const isShown = (box: Box): boolean => {
    const words = box.place.words ?? { mark: '', lines: [], badge: '' }
    const start = box.x + 2 + insetOf(box)
    const end = start + sizeOf(words.mark) + sizeOf(words.lines[0] ?? '')
    const row = firstRowOf(box)
    return row >= 0 && row < seen.height && start < seen.width - 1 && end > 1
  }
  const from = boxes.find(box => idOf(box.place) === selected)
  if (selected === null || from === undefined || !isShown(from)) return []
  const signs = boxes.flatMap(box => {
    const id = idOf(box.place)
    if (id === null || id === selected || isShown(box) || !isJoined(graph, id, selected)) return []
    const row = firstRowOf(box)
    const edge: keyof typeof EDGES = row < 0 ? 'top' : row >= seen.height ? 'bottom' : box.x < 0 ? 'left' : 'right'
    const name = 'node' in box.place.slot ? clipMiddle(box.place.slot.node.label, SIGN_CELLS) : ''
    const text = edge === 'right' ? `${name} ${EDGES[edge]}` : `${EDGES[edge]} ${name}`
    const width = sizeOf(text)
    const isAcross = edge === 'top' || edge === 'bottom'
    const along = isAcross ? Math.round(box.x + (box.width - width) / 2) : row
    return [{ id, edge, text, width, isAcross, along, priority: 'node' in box.place.slot ? priorityOf(box.place.slot.node) : 0 }]
  })
  const hits: Hit[] = []
  const boxed = new Set<string>()
  for (const box of boxes) {
    for (let y = Math.max(box.y, 0); y < Math.min(box.y + box.height, seen.height); y += 1) {
      for (let x = Math.max(box.x, 0); x < Math.min(box.x + box.width, seen.width); x += 1) boxed.add(`${x},${y}`)
    }
  }
  /** Whether a name may be written over a cell: a line or a blank, not lit, and in no box. */
  const isCoverable = (x: number, y: number): boolean => {
    const cell = canvas.cells[y]?.[x]
    return cell === undefined || (COVERABLE.test(cell.char) && cell.paint !== 'accent' && !boxed.has(`${x},${y}`))
  }
  const isFree = (x: number, y: number, width: number): boolean =>
    x >= 0 &&
    x + width <= seen.width &&
    y >= 0 &&
    y < seen.height &&
    !hits.some(hit => hit.y === y && x < hit.x + hit.width + 1 && hit.x < x + width + 1) &&
    Array.from({ length: width + 2 }, (_, index) => x - 1 + index).every(column => isCoverable(column, y))
  for (const sign of [...signs].sort((a, b) => Number(a.isAcross) - Number(b.isAcross) || b.priority - a.priority)) {
    const placeAt = (at: number): [number, number] =>
      sign.isAcross ? [at, sign.edge === 'top' ? 0 : seen.height - 1] : [sign.edge === 'left' ? 0 : seen.width - sign.width, at]
    const wanted = sign.isAcross ? Math.min(Math.max(sign.along, 0), seen.width - sign.width) : sign.along
    const reach = sign.isAcross ? seen.width : seen.height
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
 * that the window does not show are named at its edge. The last
 * row is the foot: it counts the nodes out of view of a graph larger than the
 * room, says what is being found and which of the found the selected node is,
 * or else what was left out of the graph, and where the drawing `hasCorner`,
 * holds the corner a click copies the graph or opens it as a web page by. A
 * drawing too large for the engine to draw is drawn plainer.
 */
export function paint(layout: Layout, graph: Graph, selected: string | null, room: Room, pan: Pan, finding?: Finding, hasCorner = true): Drawing {
  if (layout.shelves.length === 0) return { rows: [], hits: [] }
  const sight = sightOf(layout, room)
  const at = within(pan, sight.most)
  const isRight = layout.direction === 'right'
  const [width, height] = isRight ? [Math.max(room.columns, sight.rows), layout.columns] : [layout.columns, sight.rows]
  const canvas = canvasOf(width, height)
  const seen: Seen = {
    xOf: place => place.x - slideOf(layout, layout.shelves[place.shelf], at.x),
    yOf: row => row - at.y,
    columns: layout.columns,
    rows: sight.rows,
    width,
    height,
    isRight,
    realOf: (across, along) => (isRight ? { x: along, y: across } : { x: across, y: along }),
  }

  const found = new Set(finding?.found)
  const frames = layout.frames.map(frame => frameBoxOf(frame, frame.x - slideOf(layout, layout.shelves[frame.first], at.x), seen))
  for (const frame of frames) paintFrame(canvas, frame)
  const hits = layout.shelves.flatMap(shelf => paintShelf(canvas, graph, shelf, selected, seen, found))
  const isInView = (top: number, rows: number): boolean => seen.yOf(top) < seen.rows && seen.yOf(top + rows) > 0
  layout.channels.forEach((channel, index) => {
    const [above, below] = [layout.shelves[index], layout.shelves[index + 1]]
    const isNear = [above, below].some(shelf => shelf !== undefined && isInView(shelf.top, shelf.rows))
    if (!isInView(channel.top, channel.rows) && !isNear) return
    if (channel.isLoose) layTracks(channel, seen.xOf, channel.rows - channel.topRows - channel.bottomRows - channel.frameBottom - channel.frameTop)
    paintChannel(canvas, graph, layout, channel, selected, seen)
  })
  const titles = frames.flatMap(frame => writeTitle(canvas, frame))

  const boxes: Box[] = layout.shelves.flatMap(shelf => shelf.places.filter(place => 'node' in place.slot).map(place => boxOf(seen, place, seen.yOf(shelf.top))))
  const signs = paintSigns(canvas, graph, boxes, selected, seen)
  const rows = canvas.cells.map(spansOf)
  const beyond = {
    left: boxes.filter(box => box.x < 0).length,
    right: boxes.filter(box => box.x + box.width > width).length,
    above: boxes.filter(box => box.y < 0).length,
    below: boxes.filter(box => box.y + box.height > height).length,
  }
  const page = { x: Math.max(1, width - PAGE_OVERLAP.x), y: Math.max(1, height - PAGE_OVERLAP.y) }
  const which = finding === undefined ? -1 : finding.found.indexOf(selected ?? '')
  const notes =
    finding === undefined
      ? leftOut(graph.unread)
      : [`/${finding.query} · ${finding.found.length === 0 ? 'no match' : `${Math.max(which, 0) + 1} of ${finding.found.length}`}`, `/${finding.query}`]
  const foot = footRow(sight.isWhole ? undefined : beyond, width, page, rows.length, notes, hasCorner)
  return bounded({ rows: [...rows, foot.row], hits: [...signs, ...titles, ...hits, ...foot.hits] })
}

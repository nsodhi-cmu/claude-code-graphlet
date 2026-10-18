import type { GraphletNode, GraphletTone } from '../types'
import { MOST_CELLS, sizeOf } from './draw'
import type { Graph, Link, Node, Slot } from './layers'
import { labelOf, layoutOf, linesOf } from './layout'
import type { Direction, Frame, Look, Layout } from './layout'

// The page: a graph as one HTML document that draws it in SVG, in the layers
// and the order the terminal's picture has. The document fetches nothing,
// names a node only by its place in the graph, and escapes all that a graph
// says.

/** The size of a label's text, and of a badge's. */
const FONT_SIZE = 13
const BADGE_SIZE = 11
/** The width a character is taken to have, the browser's font being unknown here. */
const CHAR_WIDTH = 7.5
/** The height of a line of a label. */
const LINE_HEIGHT = 18
/** How far under the middle of its line a line's baseline is. */
const BASELINE = 4.5
/** The room between a box's border and what it says: at its sides, and above and below. */
const BOX_PADDING = { x: 16, y: 11 }
/** The narrowest box: one whose two ports stand clear of its corners. */
const BOX_WIDTH = 56
/** How round a box's corners are. */
const BOX_RADIUS = 8
/** The room between a mark and its label, and between a label and its badge. */
const WORD_GAP = 6
/** The width of the strip a link takes in a layer it passes through. */
const LANE_WIDTH = 8
/** The room between two neighbors of a layer, and between two layers. */
const GAP = { x: 36, y: 72 }
/** The room around the drawing, which a loop at its side and an arc under it reach into. */
const MARGIN = 40
/** How far from a box's middle the port of the links that run back up is. */
const PORT_STEP = 12
/** How far beside the first of them each further link between the same two boxes, running the same way down or up the page, runs. */
const TWIN_STEP = 10
/** How far apart two links' labels stand, one under the other, where they would stand over each other. */
const LABEL_STEP = BADGE_SIZE + 4
/** The length of an arrowhead, and its width. */
const HEAD = { length: 9, width: 8 }
/** The dashes of a link that runs back up: the length of a dash, and of the gap after it. */
const DASHES = '5 4'
/** How far under its layer the arc of a link between two of the layer's nodes is pulled. */
const ARC_DEPTH = 40
/** How far out of its box's side a node's link to itself is pulled, and how far apart its two ends are. */
const LOOP = { reach: 30, span: 16 }

/** How fast the wheel zooms: the drawing grows by e to the power of this times the pixels a turn of the wheel scrolls. */
const ZOOM_RATE = 0.0015
/** The most the wheel zooms the drawing in: this many times its own size. */
const MOST_ZOOM = 4

/** The tones a node may be drawn in, each a class of the page's style. One the page does not know is drawn plain. */
const TONES: readonly GraphletTone[] = ['plain', 'dim', 'note', 'good', 'warn', 'bad']

/** How the page looks: the colors, once for a light scheme and once for a dark one, and each shape by its class. */
const STYLE = `
:root {
  color-scheme: light dark;
  --page: #fafaf9;
  --box: #ffffff;
  --ink: #1f2328;
  --soft: #6b7280;
  --line: #9ca3af;
  --plain: #8f98a5;
  --dim: #b9c0c9;
  --note: #2f6fde;
  --good: #1f9d63;
  --warn: #c88a12;
  --bad: #d64545;
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #141619;
    --box: #1c1f24;
    --ink: #e6e8eb;
    --soft: #8d95a1;
    --line: #5b6370;
    --plain: #6a7380;
    --dim: #4b535e;
    --note: #6aa3ff;
    --good: #4cc38a;
    --warn: #e5b04a;
    --bad: #f0736c;
  }
}
html { height: 100%; }
body { box-sizing: border-box; height: 100%; display: flex; flex-direction: column; margin: 0; padding: 32px; background: var(--page); color: var(--ink); font: ${FONT_SIZE}px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
h1 { margin: 0 0 24px; font-size: ${FONT_SIZE}px; font-weight: 600; color: var(--soft); }
p { margin: 0; color: var(--soft); }
main { flex: 1; min-height: 0; }
svg { display: block; width: 100%; height: 100%; touch-action: pinch-zoom; user-select: none; cursor: grab; }
svg.held { cursor: grabbing; }
text { text-anchor: middle; fill: var(--ink); }
.node, .link { transition: opacity 0.15s; }
.node { outline: none; cursor: default; }
.plain { --tone: var(--plain); }
.dim { --tone: var(--dim); }
.note { --tone: var(--note); }
.good { --tone: var(--good); }
.warn { --tone: var(--warn); }
.bad { --tone: var(--bad); }
.box { fill: var(--box); stroke: var(--tone); stroke-width: 1.25; }
.node:hover .box, .node:focus .box { stroke-width: 2; }
.foremost .box { stroke-width: 2.5; }
.foremost:hover .box, .foremost:focus .box { stroke-width: 3.25; }
.foremost text { font-weight: bold; }
.mark { fill: var(--tone); }
.dim text, .badge { fill: var(--soft); }
.badge { font-size: ${BADGE_SIZE}px; }
.link { color: var(--line); }
.link.toned { color: var(--tone); }
.link path { fill: none; stroke: currentColor; stroke-width: 1.25; }
.link polygon { fill: currentColor; }
.link text { font-size: ${BADGE_SIZE}px; fill: currentColor; paint-order: stroke; stroke: var(--page); stroke-width: 4px; }
.link.lit { color: var(--ink); }
.quieted .node:not(.lit), .quieted .link:not(.lit) { opacity: 0.25; }
.hull { fill: none; stroke: var(--tone); stroke-width: 1.25; }
.title { text-anchor: start; font-size: ${BADGE_SIZE}px; font-weight: 600; fill: var(--soft); paint-order: stroke; stroke: var(--page); stroke-width: 6px; }
.frame.dim .title { fill: var(--soft); }
.frame:not(.dim) .title { fill: var(--tone); }
`

/**
 * What the page does. A node under the pointer, or else the one with the
 * focus, is lit with its links and the nodes at their other ends, and the
 * rest is quieted; a node is known by its place among the page's nodes,
 * which is its place in the graph. The drawing fills the window, whole, in its
 * middle, and at most at its own size; the wheel zooms it in and out around
 * the pointer, from whole to `MOST_ZOOM` times its size, a drag of one finger
 * or the main button moves it, as far as leaves half the window on it, a
 * pinch on a touch screen zooms the page as the browser does, and a double
 * click, or a new size of the window, shows it whole again.
 */
const SCRIPT = `
const svg = document.querySelector('svg')
const whole = { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height }
let view = { x: 0, y: 0, width: whole.width, height: whole.height }
let fitted = view
const show = () => svg.setAttribute('viewBox', [view.x, view.y, view.width, view.height].join(' '))
const kept = next => ({
  ...next,
  x: Math.min(Math.max(next.x, -next.width / 2), whole.width - next.width / 2),
  y: Math.min(Math.max(next.y, -next.height / 2), whole.height - next.height / 2),
})
let held = null
const fit = () => {
  const room = svg.getBoundingClientRect()
  if (room.width === 0 || room.height === 0) return
  const scale = Math.min(1, room.width / whole.width, room.height / whole.height)
  const [width, height] = [room.width / scale, room.height / scale]
  fitted = view = { x: (whole.width - width) / 2, y: (whole.height - height) / 2, width, height }
  show()
}
svg.addEventListener('wheel', event => {
  event.preventDefault()
  const room = svg.getBoundingClientRect()
  const at = { x: view.x + ((event.clientX - room.left) / room.width) * view.width, y: view.y + ((event.clientY - room.top) / room.height) * view.height }
  const width = Math.min(Math.max(view.width * Math.exp(event.deltaY * ${ZOOM_RATE}), room.width / ${MOST_ZOOM}), fitted.width)
  const by = width / view.width
  view = width === fitted.width ? fitted : kept({ x: at.x - (at.x - view.x) * by, y: at.y - (at.y - view.y) * by, width, height: view.height * by })
  if (held !== null) held = { x: event.clientX, y: event.clientY, from: view }
  show()
}, { passive: false })
svg.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return
  held = { x: event.clientX, y: event.clientY, from: view }
  svg.setPointerCapture(event.pointerId)
  svg.classList.add('held')
})
svg.addEventListener('pointermove', event => {
  if (held === null || !event.isPrimary) return
  const per = view.width / svg.getBoundingClientRect().width
  view = kept({ ...held.from, x: held.from.x - (event.clientX - held.x) * per, y: held.from.y - (event.clientY - held.y) * per })
  show()
})
const drop = event => {
  if (!event.isPrimary) return
  held = null
  svg.classList.remove('held')
}
svg.addEventListener('pointerup', drop)
svg.addEventListener('pointercancel', drop)
svg.addEventListener('dblclick', fit)
window.addEventListener('resize', fit)
fit()
const nodes = [...svg.querySelectorAll('.node')]
const links = [...svg.querySelectorAll('.link')]
const light = node => {
  const at = nodes.indexOf(node)
  const lit = new Set(at < 0 ? [] : [at])
  for (const link of links) {
    const ends = [Number(link.dataset.from), Number(link.dataset.to)]
    link.classList.toggle('lit', ends.includes(at))
    if (ends.includes(at)) ends.forEach(end => lit.add(end))
  }
  nodes.forEach((one, index) => one.classList.toggle('lit', lit.has(index)))
  svg.classList.toggle('quieted', at >= 0)
}
const rest = () => light(svg.querySelector('.node:focus'))
for (const node of nodes) {
  node.addEventListener('pointerenter', () => light(node))
  node.addEventListener('pointerleave', rest)
  node.addEventListener('focus', () => light(node))
  node.addEventListener('blur', rest)
}
`

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text made safe to write into the page, between tags or inside an attribute. */
const escaped = (text: string): string => text.replace(/[&<>"']/g, char => ESCAPES[char] ?? '')

/** A point of the drawing. */
type Point = { x: number; y: number }

/** A point as a layout has it: how far across its layers, and how far along them, which running right are down the page and across it. */
type At = { across: number; along: number }

/**
 * A slot where it stands in the drawing: its layer, the rectangle it takes
 * there, across and along, and for a node the lines of its label. A node's
 * rectangle is its box, and a lane's is the strip its link runs along.
 */
type Spot = { slot: Slot; layer: number; across: number; along: number; wide: number; long: number; lines: string[] }

/**
 * A link as it is drawn: the path of its shaft, the point where it reaches
 * its box and the way it is going there, a step of one across, down, or up,
 * the middle of its first stretch, where its label is written, and whether it
 * runs back up.
 */
type Arrow = { path: string; tip: Point; way: Point; middle: Point; isUp: boolean }

const widthOf = (text: string): number => sizeOf(text) * CHAR_WIDTH

/** The middle of a spot, across its layer. */
const middleOf = (spot: Spot): number => spot.across + spot.wide / 2

/** The width of a node's box: its widest line, the mark counted with the first and the badge with the last, and the room around it. */
function boxWidth(node: GraphletNode, lines: string[]): number {
  const mark = node.mark === undefined ? 0 : widthOf(node.mark) + WORD_GAP
  const badge = node.badge === undefined ? 0 : widthOf(node.badge) + WORD_GAP
  const widest = Math.max(
    0,
    ...lines.map((line, index) => widthOf(line) + (index === 0 ? mark : 0) + (index === lines.length - 1 ? badge : 0)),
  )
  return Math.max(BOX_WIDTH, Math.ceil(widest) + 2 * BOX_PADDING.x)
}

/** How many pixels of the page a cell of the terminal's layout is across a layer, running down and running right: enough that no box of the page is wider than its box there. */
const CELL: Readonly<Record<Direction, number>> = { down: 1.5 * CHAR_WIDTH, right: 16 }
/** How the page has a graph laid out: as the terminal lays it out on one sheet, in a room wide enough for all of it. */
const SHEET: Look = { scroll: 'sheet', labels: 'wrap', links: 'separate', motion: 'still' }
const WIDE = { columns: MOST_CELLS, rows: MOST_CELLS }
/** How far a group's frame stands out from its first and last layers, and how far from what it holds across them. */
const FRAME_PAD = { along: 26, across: 12 }

/** A group's frame on the page, around what it holds: across and along, how wide and how long. */
type Hull = { frame: Frame; across: number; along: number; wide: number; long: number }

/**
 * Every slot where it stands, and every group's frame: each slot across its
 * layer where the terminal's layout has it, its middle on the column its
 * links there leave and reach it by, a cell of that a `CELL` of the page and
 * the first of them at the page's margin; and the layers one after another
 * along, each as long as its longest box, a gap apart. Running down, a
 * layer's boxes are as tall as its tallest label; running right, as wide as
 * its widest box, a lane across it as wide as they are. A frame takes its
 * place across from the layout, and stands out along from its first and last
 * layers.
 */
function spotsOf(layout: Layout): { spots: Spot[]; hulls: Hull[] } {
  const isRight = layout.direction === 'right'
  const cell = CELL[layout.direction]
  const least = Math.min(...layout.shelves.flatMap(shelf => shelf.places.map(place => place.x)), ...layout.frames.map(frame => frame.x))
  const layers: Array<{ along: number; long: number }> = []
  let along = MARGIN + (layout.frames.some(frame => frame.first === 0) ? FRAME_PAD.along : 0)
  const spots = layout.shelves.flatMap((shelf, layer) => {
    const sized = shelf.places.map(place => {
      const lines = 'node' in place.slot ? linesOf(place.slot.node.label) : []
      return { place, lines, width: 'node' in place.slot ? boxWidth(place.slot.node, lines) : LANE_WIDTH, height: Math.max(1, lines.length) * LINE_HEIGHT + 2 * BOX_PADDING.y }
    })
    const wideOf = (one: (typeof sized)[number]): number => (!isRight ? one.width : 'node' in one.place.slot ? one.height : LANE_WIDTH)
    const long = isRight ? Math.max(LANE_WIDTH, ...sized.filter(one => 'node' in one.place.slot).map(one => one.width)) : Math.max(...sized.map(one => one.height), 2 * BOX_PADDING.y + LINE_HEIGHT)
    layers.push({ along, long })
    const placed = sized.map(one => {
      const wide = wideOf(one)
      const middle = MARGIN + (one.place.x - least + Math.floor(one.place.width / 2) + 0.5) * cell
      return { slot: one.place.slot, lines: one.lines, layer, across: middle - wide / 2, along, wide, long }
    })
    along += long + GAP.y
    return placed
  })
  const hulls = layout.frames.map(frame => {
    const [first, last] = [layers[frame.first] ?? { along: 0, long: 0 }, layers[frame.last] ?? { along: 0, long: 0 }]
    const across = MARGIN + (frame.x - least) * cell + FRAME_PAD.across
    return { frame, across, along: first.along - FRAME_PAD.along, wide: frame.width * cell - 2 * FRAME_PAD.across, long: last.along + last.long - first.along + 2 * FRAME_PAD.along }
  })
  return { spots, hulls }
}

/**
 * The drawing's own geometry for a direction: where a point across and
 * along stands on the page, and a curve between two points that leaves the
 * first and reaches the second straight along the layers.
 */
type Turning = { pointOf: (at: At) => Point; curveOf: (from: At, to: At) => string }

const turningOf = (direction: Direction): Turning => {
  const pointOf = (at: At): Point => (direction === 'right' ? { x: at.along, y: at.across } : { x: at.across, y: at.along })
  return {
    pointOf,
    curveOf: (from, to) => {
      const turn = (from.along + to.along) / 2
      const [a, b, c] = [pointOf({ across: from.across, along: turn }), pointOf({ across: to.across, along: turn }), pointOf(to)]
      return `C${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`
    },
  }
}

/** The corners of an arrowhead with its tip at `tip`, pointing along `way`: a step of one across, down, or up. */
function headOf(tip: Point, way: Point): string {
  const back = { x: tip.x - way.x * HEAD.length, y: tip.y - way.y * HEAD.length }
  const half = { x: (way.y * HEAD.width) / 2, y: (way.x * HEAD.width) / 2 }
  return `${tip.x},${tip.y} ${back.x - half.x},${back.y + half.y} ${back.x + half.x},${back.y - half.y}`
}

/**
 * A link between two layers: a curve across each gap between two layers, and
 * straight along each lane it has in the layers it passes, stopping `short`
 * of its box. Along the page it leaves the far side of a box and reaches the
 * near side of one, by their middles; back it does the reverse, by the ports
 * beside them; and `aside` farther out, the way it runs to one side and back
 * to the other.
 */
function runOf(turning: Turning, from: Spot, lanes: Spot[], to: Spot, isUp: boolean, short: number, aside: number): Arrow {
  const way = isUp ? -1 : 1
  const port = isUp ? PORT_STEP + aside : -aside
  const nearOf = (spot: Spot): number => (isUp ? spot.along + spot.long : spot.along)
  const farOf = (spot: Spot): number => (isUp ? spot.along : spot.along + spot.long)
  const tip: At = { across: middleOf(to) + port, along: nearOf(to) }
  let at: At = { across: middleOf(from) + port, along: farOf(from) }
  const [next = tip] = lanes.map(lane => ({ across: middleOf(lane), along: nearOf(lane) }))
  const middle = turning.pointOf({ across: (at.across + next.across) / 2, along: (at.along + next.along) / 2 })
  const start = turning.pointOf(at)
  let path = `M${start.x},${start.y}`
  for (const lane of lanes) {
    const end = turning.pointOf({ across: middleOf(lane), along: farOf(lane) })
    path += `${turning.curveOf(at, { across: middleOf(lane), along: nearOf(lane) })}L${end.x},${end.y}`
    at = { across: middleOf(lane), along: farOf(lane) }
  }
  path += turning.curveOf(at, { across: tip.across, along: tip.along - way * short })
  return { path, tip: turning.pointOf(tip), way: turning.pointOf({ across: 0, along: way }), middle, isUp }
}

/** A link between two nodes of one layer: an arc past the layer, `aside` deeper, out of the middle of the first box's far side and back into the port beside the second's, stopping `short` of it. */
function arcOf(turning: Turning, from: Spot, to: Spot, short: number, aside: number): Arrow {
  const [along, depth] = [from.along + from.long, ARC_DEPTH + aside]
  const [out, into] = [middleOf(from), middleOf(to) + PORT_STEP]
  const points = [{ across: out, along }, { across: out, along: along + depth }, { across: into, along: along + depth }, { across: into, along: along + short }].map(turning.pointOf)
  const [first, ...rest] = points as [Point, Point, Point, Point]
  const path = `M${first.x},${first.y}C${rest.map(point => `${point.x},${point.y}`).join(' ')}`
  const middle = turning.pointOf({ across: (out + into) / 2, along: along + depth * 0.75 })
  return { path, tip: turning.pointOf({ across: into, along }), way: turning.pointOf({ across: 0, along: -1 }), middle, isUp: false }
}

/** A link from a node to itself: a loop out of the far side of its box across its layer, reaching `aside` farther, and back into it, stopping `short` of it. */
function loopOf(turning: Turning, spot: Spot, short: number, aside: number): Arrow {
  const [across, reach] = [spot.across + spot.wide, LOOP.reach + aside]
  const [out, into] = [spot.along + (spot.long - LOOP.span) / 2, spot.along + (spot.long + LOOP.span) / 2]
  const points = [{ across, along: out }, { across: across + reach, along: out }, { across: across + reach, along: into }, { across: across + short, along: into }].map(turning.pointOf)
  const [first, ...rest] = points as [Point, Point, Point, Point]
  const path = `M${first.x},${first.y}C${rest.map(point => `${point.x},${point.y}`).join(' ')}`
  const middle = turning.pointOf({ across: across + reach * 0.75, along: (out + into) / 2 })
  return { path, tip: turning.pointOf({ across, along: into }), way: turning.pointOf({ across: -1, along: 0 }), middle, isUp: false }
}

/**
 * A link as it is drawn between the boxes of its two ends: a loop, an arc, or
 * a run through its lanes in the order it passes them, `aside` from where it
 * would run. A link that runs one way stops short of its box by the length
 * of an arrowhead; one that runs no way reaches the box, and runs along the
 * page whichever way round it names its ends.
 */
function arrowOf(turning: Turning, link: Link, from: Spot, to: Spot, spots: Spot[], aside: number): Arrow {
  const { isDirected } = link
  const short = isDirected ? HEAD.length : 0
  if (from === to) return loopOf(turning, from, short, aside)
  if (from.layer === to.layer) return arcOf(turning, from, to, short, aside)
  const isUp = from.layer > to.layer
  const lanes = spots.filter(spot => 'lane' in spot.slot && spot.slot.lane.includes(link))
  if (isUp && !isDirected) return runOf(turning, to, lanes, from, false, short, aside)
  return runOf(turning, from, isUp ? lanes.toReversed() : lanes, to, isUp, short, aside)
}

/** Where a spot's rectangle, or a frame's, is on the page. */
const rectOf = (turning: Turning, spot: { across: number; along: number; wide: number; long: number }): { x: number; y: number; width: number; height: number } => {
  const [start, end] = [turning.pointOf(spot), turning.pointOf({ across: spot.across + spot.wide, along: spot.along + spot.long })]
  return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }
}

/** A node as it is drawn: its box in its tone, heavy and its words bold where the graph puts it foremost, and in it its mark, the lines of its label, and its badge. */
function boxOf(turning: Turning, node: Node, spot: Spot): string {
  const tone = TONES.find(one => one === node.tone) ?? 'plain'
  const rect = rectOf(turning, spot)
  const first = rect.y + (rect.height - (spot.lines.length - 1) * LINE_HEIGHT) / 2 + BASELINE
  const lines = spot.lines.map((line, index) => {
    const mark = index > 0 || node.mark === undefined ? '' : `<tspan class="mark">${escaped(node.mark)}</tspan>`
    const label = mark === '' ? escaped(line) : `<tspan dx="${WORD_GAP}">${escaped(line)}</tspan>`
    const isLast = index === spot.lines.length - 1
    const badge = !isLast || node.badge === undefined ? '' : `<tspan class="badge" dx="${WORD_GAP}">${escaped(node.badge)}</tspan>`
    return `<tspan x="${rect.x + rect.width / 2}" y="${first + index * LINE_HEIGHT}">${mark}${label}${badge}</tspan>`
  })
  const box = `<rect class="box" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${BOX_RADIUS}"/>`
  return `<g class="node ${tone}${node.isForemost ? ' foremost' : ''}" tabindex="0">${box}<text>${lines.join('')}</text></g>`
}

/**
 * The drawing: every link, each naming its two ends by their places in the
 * graph, in its tone where it has one, with an arrowhead where it runs one
 * way and its label, cut as the
 * terminal cuts it, written on its first stretch, and moved down past any
 * label written there before it; and over them every node, in the graph's
 * order. A link between the same two boxes as one before it, running the
 * same way, along the page or back, runs `TWIN_STEP` farther aside for each.
 * A link from a node to itself has no label written, as in the terminal.
 */
function drawingOf(graph: Graph, direction: Direction): string {
  const turning = turningOf(direction)
  const { spots, hulls } = spotsOf(layoutOf(graph, WIDE, SHEET, false, direction))
  const places = new Map<string, { index: number; spot: Spot }>()
  graph.nodes.forEach((node, index) => {
    const spot = spots.find(one => 'node' in one.slot && one.slot.node.id === node.id)
    if (spot !== undefined) places.set(node.id, { index, spot })
  })
  const twins = new Map<string, number>()
  const drawn = graph.links.flatMap(link => {
    const [from, to] = [places.get(link.from), places.get(link.to)]
    const isUp = link.isDirected && (from?.spot.layer ?? 0) > (to?.spot.layer ?? 0)
    const pair = JSON.stringify([isUp, ...[link.from, link.to].sort()])
    const twin = twins.get(pair) ?? 0
    twins.set(pair, twin + 1)
    return from === undefined || to === undefined ? [] : [{ link, from, to, arrow: arrowOf(turning, link, from.spot, to.spot, spots, twin * TWIN_STEP) }]
  })
  const written: Array<{ x: number; y: number; width: number }> = []
  const writtenAt = new Map<Link, Point>()
  for (const { link, arrow } of drawn.filter(one => one.link.from !== one.link.to && labelOf(one.link) !== '').sort((a, b) => a.arrow.middle.y - b.arrow.middle.y || a.arrow.middle.x - b.arrow.middle.x)) {
    const width = widthOf(labelOf(link)) * (BADGE_SIZE / FONT_SIZE)
    let { x, y } = arrow.middle
    while (written.some(one => Math.abs(one.x - x) < (one.width + width) / 2 && Math.abs(one.y - y) < LABEL_STEP)) y += LABEL_STEP
    written.push({ x, y, width })
    writtenAt.set(link, { x, y })
  }
  const links = drawn.map(({ link, from, to, arrow }) => {
    const dashes = arrow.isUp ? ` stroke-dasharray="${DASHES}"` : ''
    const ends = `data-from="${from.index}" data-to="${to.index}"`
    const head = link.isDirected ? `<polygon points="${headOf(arrow.tip, arrow.way)}"/>` : ''
    const at = writtenAt.get(link)
    const label = at === undefined ? '' : `<text x="${at.x}" y="${at.y + BASELINE}">${escaped(labelOf(link))}</text>`
    const tone = TONES.find(one => one === link.tone)
    return `<g class="link${tone === undefined ? '' : ` toned ${tone}`}" ${ends}><path${dashes} d="${arrow.path}"/>${head}${label}</g>`
  })
  const nodes = graph.nodes.flatMap(node => {
    const place = places.get(node.id)
    return place === undefined ? [] : [boxOf(turning, node, place.spot)]
  })
  const frames = hulls.map(hull => {
    const rect = rectOf(turning, hull)
    const tone = TONES.find(one => one === hull.frame.group.tone) ?? 'dim'
    const title = `<text class="title" x="${rect.x + BOX_RADIUS}" y="${rect.y + BASELINE}">${escaped(hull.frame.group.label)}</text>`
    return `<g class="frame ${tone}"><rect class="hull" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${BOX_RADIUS}"/>${title}</g>`
  })
  const rects = [...spots, ...hulls].map(spot => rectOf(turning, spot))
  const width = Math.max(...rects.map(rect => rect.x + rect.width)) + MARGIN
  const height = Math.max(...rects.map(rect => rect.y + rect.height)) + MARGIN
  return `<svg viewBox="0 0 ${width} ${height}">\n${[...frames, ...links, ...nodes].join('\n')}\n</svg>`
}

/** The graph as a web page: one self-contained HTML document, the graph running the way its picture in the terminal runs. */
export function pageOf(graph: Graph, title: string, direction: Direction = 'down'): string {
  const body =
    graph.nodes.length === 0
      ? '<p>Nothing to draw: the graph has no nodes.</p>'
      : `<main>\n${drawingOf(graph, direction)}\n</main>\n<script>${SCRIPT}</script>`
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaped(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escaped(title)}</h1>
${body}
</body>
</html>
`
}

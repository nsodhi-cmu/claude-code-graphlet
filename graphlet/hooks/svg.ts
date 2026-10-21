import type { GraphletNode, GraphletTone } from '../types'
import { countOf, sizeOf } from './draw'
import type { Graph, Link, Node, Slot } from './layers'
import { labelOf, linesOf } from './layout'
import type { Direction, Frame, Layout } from './layout'

// A graph drawn in SVG, in the layers and the order the terminal's picture
// has: boxes with round corners, curves between them, and frames around
// groups. The web page draws it, and so does a surface that draws vectors.
// The drawing names a node only by its place in the graph, and escapes all
// that a graph says.

/** The size of a label's text, and of a badge's. */
export const FONT_SIZE = 13
const BADGE_SIZE = 11
/** The width a character is taken to have, the surface's font being unknown here. */
export const CHAR_WIDTH = 7.5
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
/** How far inside a selected box its second border is. */
const RING_INSET = 3
/** The room between a mark and its label, and between a label and its badge. */
const WORD_GAP = 6
/** The width of the strip a link takes in a layer it passes through. */
const LANE_WIDTH = 8
/** The room between two layers. */
const LAYER_GAP = 72
/** Where the first layer starts, and the first column: room for a loop at the drawing's side and an arc under it. */
const MARGIN = 40
/** The room around everything drawn, inside the edge of its sheet. */
const PAD = 12
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
/** How far a group's frame stands out from its first and last layers, and how far from what it holds across them. */
const FRAME_PAD = { along: 26, across: 12 }
/** The most characters of what a picture says for a reader who cannot see it; the links past them are counted. */
const MOST_ALT_CHARS = 1000
/** The most characters of an SVG document a surface takes. */
export const MOST_SVG_CHARS = 131_072

/** The tones a node, a link, or a frame may be drawn in, each a class of the drawing's style. One the drawing does not know is drawn plain. */
const TONES: readonly GraphletTone[] = ['plain', 'dim', 'note', 'good', 'warn', 'bad']

/** The drawing's colors, once for a light scheme and once for a dark one, picked by the person's own setting. */
export const PALETTE = `
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
  --accent: #c96442;
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
    --accent: #e08463;
  }
}`

/**
 * How each shape is drawn, by its class: a node's box in its tone, heavier
 * where it is put foremost or selected, a selected box with a second border
 * inside it, in the accent, and the boxes at the other ends of its links in
 * the accent too; a link's line and arrowhead in the color of lines, and its
 * label in the soft color of words, or all of them in its tone's, or lit in
 * the accent; a group's frame and its title; and a
 * lit link that `flows`, where the drawing is `flowing`, runs beads toward
 * the node it reaches, while one that `pulses` brightens and fades, unless
 * the person asks for less motion.
 */
const SHAPES = `
svg { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: ${FONT_SIZE}px; }
text { text-anchor: middle; fill: var(--ink); }
.sheet { fill: var(--page); stroke: var(--dim); stroke-width: 1; }
.node, .link { transition: opacity 0.15s; }
.node { outline: none; }
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
.foremost text, .selected text { font-weight: bold; }
.selected .box, .near .box { stroke: var(--accent); }
.selected .box { stroke-width: 2; }
.ring { fill: none; stroke: var(--accent); stroke-width: 1; }
.mark { fill: var(--tone); }
.dim text, .badge { fill: var(--soft); }
.badge { font-size: ${BADGE_SIZE}px; }
.link { color: var(--line); }
.link.toned { color: var(--tone); }
.link path { fill: none; stroke: currentColor; stroke-width: 1.25; }
.link polygon { fill: currentColor; }
.link text { font-size: ${BADGE_SIZE}px; fill: var(--label, var(--soft)); paint-order: stroke; stroke: var(--page); stroke-width: 4px; }
.link.toned, .link.lit { --label: currentColor; }
.link.lit { color: var(--accent); }
.link.lit path { stroke-width: 1.75; }
.hull { fill: none; stroke: var(--tone); stroke-width: 1.25; }
.title { text-anchor: start; font-size: ${BADGE_SIZE}px; font-weight: 600; fill: var(--soft); paint-order: stroke; stroke: var(--page); stroke-width: 6px; }
.frame.dim .title { fill: var(--soft); }
.frame:not(.dim) .title { fill: var(--tone); }
.flowing .lit.flows path { stroke-dasharray: 3 5; animation: flow 0.8s linear infinite; }
.flowing .lit.pulses { animation: pulse 1.2s ease-in-out infinite alternate; }
@keyframes flow { to { stroke-dashoffset: -8; } }
@keyframes pulse { from { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .flowing .lit.flows path, .flowing .lit.pulses { animation: none; } }`

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** What no XML document may hold: a control but a tab or a line's end, half of a pair of surrogates standing alone, and the two noncharacters at the end of the first plane. */
const UNWRITABLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

/** Text made safe to write into a document, between tags or inside an attribute: what no document may hold left out, and what would be read as markup escaped. */
export const escaped = (text: string): string => text.replace(UNWRITABLE, '').replace(/[&<>"']/g, char => ESCAPES[char] ?? '')

/** A point of the drawing. */
type Point = { x: number; y: number }

/** A rectangle of the drawing. */
type Rect = { x: number; y: number; width: number; height: number }

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

/** A group's frame in the drawing, around what it holds: across and along, how wide and how long. */
type Hull = { frame: Frame; across: number; along: number; wide: number; long: number }

/**
 * Every slot where it stands, and every group's frame: each slot across its
 * layer where the layout has it, its middle on the column its links there
 * leave and reach it by, a cell of the layout `cell` pixels of the drawing
 * and the first of them at the margin; and the layers one after another
 * along, each as long as its longest box, a gap apart. Running down, a
 * layer's boxes are as tall as its tallest label; running right, as wide as
 * its widest box, a lane across it as wide as they are. A node's label is on
 * the lines the layout's box has it on. A frame takes its place across from
 * the layout, and stands out along from its first and last layers.
 */
function spotsOf(layout: Layout, cell: number): { spots: Spot[]; hulls: Hull[] } {
  const isRight = layout.direction === 'right'
  const least = Math.min(...layout.shelves.flatMap(shelf => shelf.places.map(place => place.x)), ...layout.frames.map(frame => frame.x))
  const layers: Array<{ along: number; long: number }> = []
  let along = MARGIN + (layout.frames.some(frame => frame.first === 0) ? FRAME_PAD.along : 0)
  const spots = layout.shelves.flatMap((shelf, layer) => {
    const sized = shelf.places.map(place => {
      const lines = 'node' in place.slot ? (place.words?.lines ?? linesOf(place.slot.node.label)) : []
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
    along += long + LAYER_GAP
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
 * along stands in the drawing, and a curve between two points that leaves
 * the first and reaches the second straight along the layers.
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

/** Where a spot's rectangle, or a frame's, is in the drawing. */
const rectOf = (turning: Turning, spot: { across: number; along: number; wide: number; long: number }): Rect => {
  const [start, end] = [turning.pointOf(spot), turning.pointOf({ across: spot.across + spot.wide, along: spot.along + spot.long })]
  return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }
}

/** The sheet under a drawing: the smallest rectangle that holds every one of `rects`, and `PAD` more on every side. */
function sheetOf(rects: Rect[]): Rect {
  const [left, top] = [Math.min(...rects.map(rect => rect.x)) - PAD, Math.min(...rects.map(rect => rect.y)) - PAD]
  const [right, bottom] = [Math.max(...rects.map(rect => rect.x + rect.width)) + PAD, Math.max(...rects.map(rect => rect.y + rect.height)) + PAD]
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** The points a path passes through and is pulled toward, as rectangles of no size: a curve lies within them. */
const pointsOf = (path: string): Rect[] => [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y), width: 0, height: 0 }))

/**
 * A node as it is drawn: its box in its tone, heavy and its words bold where
 * the graph puts it foremost, and in it its mark, the lines of its label, and
 * its badge; where it is selected, a second border inside its box, and where
 * its label is cut short, the whole of it as its title. It is marked by its
 * place in the graph, `n` and the place, and as `selected`, or as `near`
 * where a link joins it to the node that is.
 */
function boxOf(turning: Turning, node: Node, spot: Spot, index: number, state?: 'selected' | 'near'): string {
  const tone = TONES.find(one => one === node.tone) ?? 'plain'
  const rect = rectOf(turning, spot)
  const first = rect.y + (rect.height - (spot.lines.length - 1) * LINE_HEIGHT) / 2 + BASELINE
  const lines = spot.lines.map((line, at) => {
    const mark = at > 0 || node.mark === undefined ? '' : `<tspan class="mark">${escaped(node.mark)}</tspan>`
    const label = mark === '' ? escaped(line) : `<tspan dx="${WORD_GAP}">${escaped(line)}</tspan>`
    const isLast = at === spot.lines.length - 1
    const badge = !isLast || node.badge === undefined ? '' : `<tspan class="badge" dx="${WORD_GAP}">${escaped(node.badge)}</tspan>`
    return `<tspan x="${rect.x + rect.width / 2}" y="${first + at * LINE_HEIGHT}">${mark}${label}${badge}</tspan>`
  })
  const isCut = spot.lines.join('').replace(/\s/g, '') !== node.label.replace(/\s/g, '')
  const title = isCut ? `<title>${escaped(node.label)}</title>` : ''
  const box = `<rect class="box" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${BOX_RADIUS}"/>`
  const ring = state === 'selected' ? `<rect class="ring" x="${rect.x + RING_INSET}" y="${rect.y + RING_INSET}" width="${rect.width - 2 * RING_INSET}" height="${rect.height - 2 * RING_INSET}" rx="${BOX_RADIUS - RING_INSET}"/>` : ''
  const classes = ['node', tone, ...(node.isForemost ? ['foremost'] : []), ...(state === undefined ? [] : [state]), `n${index}`].join(' ')
  return `<g class="${classes}" tabindex="0">${title}${box}${ring}<text>${lines.join('')}</text></g>`
}

/**
 * The rules that light the node the pointer is over, or else the one with
 * the keyboard's focus, a rule for each node: its links lit in the accent,
 * and every node not at the end of one of them, and every other link,
 * quieted, and still where it pulses.
 */
function lightsOf(graph: Graph): string {
  const near = new Map<number, Set<number>>(graph.nodes.map((_, index) => [index, new Set([index])]))
  const placeOf = new Map(graph.nodes.map((node, index) => [node.id, index]))
  for (const link of graph.links) {
    const [from, to] = [placeOf.get(link.from), placeOf.get(link.to)]
    if (from === undefined || to === undefined) continue
    near.get(from)?.add(to)
    near.get(to)?.add(from)
  }
  return [...near].map(([index, nodes]) => {
    const lit = `svg:has(.n${index}:hover), svg:not(:has(.node:hover)):has(.n${index}:focus)`
    const others = [...nodes].map(one => `.n${one}`).join(',')
    return `:is(${lit}) :is(.node:not(${others}), .link:not(.e${index})) { opacity: 0.25; animation: none; }\n:is(${lit}) .link.e${index} { color: var(--accent); --label: currentColor; }`
  }).join('\n')
}

/**
 * Where each link's label is written, and how wide it is: at the middle of
 * the link's first stretch, or where that would stand over a label written
 * before it, moved down a line at a time until it does not, the labels
 * written from the top of the drawing down. A link from a node to itself has
 * none.
 */
function labelsAt(drawn: ReadonlyArray<{ link: Link; arrow: Arrow }>): Map<Link, Point & { width: number }> {
  const written = new Map<Link, Point & { width: number }>()
  for (const { link, arrow } of drawn.filter(one => one.link.from !== one.link.to && labelOf(one.link) !== '').sort((a, b) => a.arrow.middle.y - b.arrow.middle.y || a.arrow.middle.x - b.arrow.middle.x)) {
    const width = widthOf(labelOf(link)) * (BADGE_SIZE / FONT_SIZE)
    let { x, y } = arrow.middle
    while ([...written.values()].some(one => Math.abs(one.x - x) < (one.width + width) / 2 && Math.abs(one.y - y) < LABEL_STEP)) y += LABEL_STEP
    written.set(link, { x, y, width })
  }
  return written
}

/** What a drawing shows besides its graph: the node selected, whose links are lit, and whether they move; and whether a node is lit as the pointer passes over it. */
export type Seen = { selected: string | null; isFlowing: boolean; isLighting: boolean }

/**
 * A graph drawn in SVG, as one document: its colors and how its shapes are
 * drawn, a sheet under all of it, every group's frame, every link, each
 * marked `e` and the place in the graph of each of its two ends, in its tone
 * where it has one, with an arrowhead where it runs one way, its label, cut
 * as the terminal cuts it, written on its first stretch, and moved down past
 * any label written there before it; and over them every node, in the
 * graph's order. Each node is laid out where `layout` has it, a cell of the
 * layout `cell` pixels across its layer. A link between the same two boxes
 * as one before it, running the same way, along the page or back, runs
 * `TWIN_STEP` farther aside for each. A link from a node to itself has no
 * label written, as in the terminal. The links that touch the selected node
 * are lit: one that runs one way, with no link back, flows, and any other
 * pulses. The document is as large as what it draws and the room around it.
 */
export function svgOf(graph: Graph, layout: Layout, cell: number, seen: Seen): string {
  const turning = turningOf(layout.direction)
  const { spots, hulls } = spotsOf(layout, cell)
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
  const writtenAt = labelsAt(drawn)
  const isLit = (link: Link): boolean => seen.selected !== null && (link.from === seen.selected || link.to === seen.selected)
  const isOneWay = (link: Link): boolean => link.isDirected && !graph.links.some(back => back.isDirected && back.from === link.to && back.to === link.from && back.from !== back.to)
  const links = drawn.map(({ link, from, to, arrow }) => {
    const dashes = arrow.isUp ? ` stroke-dasharray="${DASHES}"` : ''
    const head = link.isDirected ? `<polygon points="${headOf(arrow.tip, arrow.way)}"/>` : ''
    const at = writtenAt.get(link)
    const label = at === undefined ? '' : `<text x="${at.x}" y="${at.y + BASELINE}">${escaped(labelOf(link))}</text>`
    const tone = TONES.find(one => one === link.tone)
    const motion = !isLit(link) ? [] : ['lit', isOneWay(link) ? 'flows' : 'pulses']
    const classes = ['link', ...(tone === undefined ? [] : ['toned', tone]), ...motion, `e${from.index}`, `e${to.index}`].join(' ')
    return `<g class="${classes}"><path${dashes} d="${arrow.path}"/>${head}${label}</g>`
  })
  const nearby = new Set(graph.links.filter(isLit).flatMap(link => [link.from, link.to]))
  const nodes = graph.nodes.flatMap(node => {
    const place = places.get(node.id)
    const state = node.id === seen.selected ? 'selected' : nearby.has(node.id) ? 'near' : undefined
    return place === undefined ? [] : [boxOf(turning, node, place.spot, place.index, state)]
  })
  const frames = hulls.map(hull => {
    const rect = rectOf(turning, hull)
    const tone = TONES.find(one => one === hull.frame.group.tone) ?? 'dim'
    const title = `<text class="title" x="${rect.x + BOX_RADIUS}" y="${rect.y + BASELINE}">${escaped(hull.frame.group.label)}</text>`
    return `<g class="frame ${tone}"><rect class="hull" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${BOX_RADIUS}"/>${title}</g>`
  })
  const labels = [...writtenAt.values()].map(at => ({ x: at.x - at.width / 2, y: at.y - BADGE_SIZE, width: at.width, height: BADGE_SIZE + BASELINE }))
  const titles = hulls.map(hull => ({ ...rectOf(turning, hull), width: widthOf(hull.frame.group.label) + 2 * BOX_RADIUS }))
  const sheet = sheetOf([...spots.map(spot => rectOf(turning, spot)), ...hulls.map(hull => rectOf(turning, hull)), ...titles, ...labels, ...drawn.flatMap(one => pointsOf(one.arrow.path))])
  const style = `<style>${PALETTE}${SHAPES}${seen.isLighting ? `\n${lightsOf(graph)}` : ''}\n</style>`
  const back = `<rect class="sheet" x="${sheet.x}" y="${sheet.y}" width="${sheet.width}" height="${sheet.height}" rx="${BOX_RADIUS}"/>`
  const size = `width="${Math.ceil(sheet.width)}" height="${Math.ceil(sheet.height)}" viewBox="${sheet.x} ${sheet.y} ${sheet.width} ${sheet.height}"`
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} class="${seen.isFlowing ? 'flowing' : 'still'}">\n${style}\n${[back, ...frames, ...links, ...nodes].join('\n')}\n</svg>`
}

/**
 * What a picture of a graph says for a reader who cannot see it: how many
 * nodes and links it has, then each link, by the labels of its two ends,
 * with an arrow where it runs one way and a dash where it runs no way, and
 * its label after it; and each node no link joins. What would run past
 * `MOST_ALT_CHARS` is counted instead.
 */
export function altOf(graph: Graph): string {
  const labelOfNode = new Map(graph.nodes.map(node => [node.id, node.label]))
  const said = [
    ...graph.links.map(link => {
      const [from, to] = [labelOfNode.get(link.from) ?? link.from, labelOfNode.get(link.to) ?? link.to]
      return `${from} ${link.isDirected ? '→' : '—'} ${to}${link.label === undefined ? '' : ` (${link.label})`}`
    }),
    ...graph.nodes.filter(node => !graph.links.some(link => link.from === node.id || link.to === node.id)).map(node => node.label),
  ]
  const head = `A graph of ${countOf(graph.nodes.length, 'node')} and ${countOf(graph.links.length, 'link')}`
  const kept: string[] = []
  for (const one of said) {
    if ([head, ...kept, one].join('; ').length > MOST_ALT_CHARS) break
    kept.push(one)
  }
  const listed = kept.length === 0 ? head : `${head}: ${kept.join('; ')}`
  const rest = said.length - kept.length
  return rest === 0 ? `${listed}.` : `${listed}; and ${rest} more.`
}

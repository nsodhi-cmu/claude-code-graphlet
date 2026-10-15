import type { GraphletLink, GraphletNode, GraphletTone } from '../types'
import { sizeOf } from './draw'
import { layersOf } from './layers'
import type { Graph, Slot } from './layers'
import { labelOf, linesOf } from './layout'

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
/** The least a drawing wider than the window is shrunk to, before it scrolls instead. */
const LEAST_SCALE = 0.7

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
body { margin: 0; padding: 32px; background: var(--page); color: var(--ink); font: ${FONT_SIZE}px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
h1 { margin: 0 0 24px; font-size: ${FONT_SIZE}px; font-weight: 600; color: var(--soft); }
p { margin: 0; color: var(--soft); }
main { overflow-x: auto; }
svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
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
.mark { fill: var(--tone); }
.dim text, .badge { fill: var(--soft); }
.badge { font-size: ${BADGE_SIZE}px; }
.link { color: var(--line); }
.link path { fill: none; stroke: currentColor; stroke-width: 1.25; }
.link polygon { fill: currentColor; }
.link text { font-size: ${BADGE_SIZE}px; fill: currentColor; paint-order: stroke; stroke: var(--page); stroke-width: 4px; }
.link.lit { color: var(--ink); }
.quieted .node:not(.lit), .quieted .link:not(.lit) { opacity: 0.25; }
`

/**
 * What the page does: a node under the pointer, or else the one with the
 * focus, is lit with its links and the nodes at their other ends, and the
 * rest is quieted. A node is known by its place among the page's nodes,
 * which is its place in the graph.
 */
const SCRIPT = `
const svg = document.querySelector('svg')
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

/**
 * A slot where it stands in the drawing: its layer, the rectangle it takes
 * there, and for a node the lines of its label. A node's rectangle is its
 * box, and a lane's is the strip its link runs along.
 */
type Spot = { slot: Slot; layer: number; x: number; y: number; width: number; height: number; lines: string[] }

/**
 * A link as it is drawn: the path of its shaft, the point where it reaches
 * its box and the way it is going there, a step of one across, down, or up,
 * the middle of its first stretch, where its label is written, and whether it
 * runs back up.
 */
type Arrow = { path: string; tip: Point; way: Point; middle: Point; isUp: boolean }

const widthOf = (text: string): number => sizeOf(text) * CHAR_WIDTH

const middleOf = (spot: Spot): number => spot.x + spot.width / 2

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

/**
 * Every slot where it stands: the slots of a layer side by side in their
 * order, the layer in the middle of the widest one and as tall as its
 * tallest label, and the layers one under another.
 */
function spotsOf(slots: Slot[][]): Spot[] {
  const sized = slots.map(row =>
    row.map(slot => {
      const lines = 'node' in slot ? linesOf(slot.node.label) : []
      return { slot, lines, width: 'node' in slot ? boxWidth(slot.node, lines) : LANE_WIDTH }
    }),
  )
  const lengthOf = (row: Array<{ width: number }>): number => row.reduce((sum, one) => sum + one.width + GAP.x, -GAP.x)
  const widest = Math.max(0, ...sized.map(lengthOf))
  let y = MARGIN
  return sized.flatMap((row, layer) => {
    const height = Math.max(1, ...row.map(one => one.lines.length)) * LINE_HEIGHT + 2 * BOX_PADDING.y
    let x = MARGIN + Math.round((widest - lengthOf(row)) / 2)
    const spots = row.map(one => {
      const spot: Spot = { ...one, layer, x, y, height }
      x += one.width + GAP.x
      return spot
    })
    y += height + GAP.y
    return spots
  })
}

/** A curve from one point to another that leaves the first and reaches the second straight up or down. */
function curveOf(from: Point, to: Point): string {
  const turn = (from.y + to.y) / 2
  return `C${from.x},${turn} ${to.x},${turn} ${to.x},${to.y}`
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
 * of its box. Down the page it leaves the bottom of a box and reaches the top
 * of one, by their middles; back up it does the reverse, by the ports beside
 * them.
 */
function runOf(from: Spot, lanes: Spot[], to: Spot, isUp: boolean, short: number): Arrow {
  const way = isUp ? -1 : 1
  const port = isUp ? PORT_STEP : 0
  const nearOf = (spot: Spot): number => (isUp ? spot.y + spot.height : spot.y)
  const farOf = (spot: Spot): number => (isUp ? spot.y : spot.y + spot.height)
  const tip = { x: middleOf(to) + port, y: nearOf(to) }
  let at = { x: middleOf(from) + port, y: farOf(from) }
  const [next = tip] = lanes.map(lane => ({ x: middleOf(lane), y: nearOf(lane) }))
  const middle = { x: (at.x + next.x) / 2, y: (at.y + next.y) / 2 }
  let path = `M${at.x},${at.y}`
  for (const lane of lanes) {
    path += `${curveOf(at, { x: middleOf(lane), y: nearOf(lane) })}L${middleOf(lane)},${farOf(lane)}`
    at = { x: middleOf(lane), y: farOf(lane) }
  }
  path += curveOf(at, { x: tip.x, y: tip.y - way * short })
  return { path, tip, way: { x: 0, y: way }, middle, isUp }
}

/** A link between two nodes of one layer: an arc under the layer, out of the middle of the first box's bottom and up into the port beside the second's, stopping `short` of it. */
function arcOf(from: Spot, to: Spot, short: number): Arrow {
  const y = from.y + from.height
  const [out, into] = [middleOf(from), middleOf(to) + PORT_STEP]
  const path = `M${out},${y}C${out},${y + ARC_DEPTH} ${into},${y + ARC_DEPTH} ${into},${y + short}`
  return { path, tip: { x: into, y }, way: { x: 0, y: -1 }, middle: { x: (out + into) / 2, y: y + ARC_DEPTH * 0.75 }, isUp: false }
}

/** A link from a node to itself: a loop out of the right side of its box and back into it, stopping `short` of it. */
function loopOf(spot: Spot, short: number): Arrow {
  const x = spot.x + spot.width
  const [out, into] = [spot.y + (spot.height - LOOP.span) / 2, spot.y + (spot.height + LOOP.span) / 2]
  const path = `M${x},${out}C${x + LOOP.reach},${out} ${x + LOOP.reach},${into} ${x + short},${into}`
  return { path, tip: { x, y: into }, way: { x: -1, y: 0 }, middle: { x: x + LOOP.reach * 0.75, y: (out + into) / 2 }, isUp: false }
}

/**
 * A link as it is drawn between the boxes of its two ends: a loop, an arc, or
 * a run through its lanes in the order it passes them. In a directed graph
 * its shaft stops short of its box by the length of an arrowhead; in an
 * undirected one it reaches the box, and runs down the page whichever way
 * round it names its ends.
 */
function arrowOf(link: GraphletLink, from: Spot, to: Spot, spots: Spot[], isDirected: boolean): Arrow {
  const short = isDirected ? HEAD.length : 0
  if (from === to) return loopOf(from, short)
  if (from.layer === to.layer) return arcOf(from, to, short)
  const isUp = from.layer > to.layer
  const lanes = spots.filter(spot => 'lane' in spot.slot && spot.slot.lane.includes(link))
  if (isUp && !isDirected) return runOf(to, lanes, from, false, short)
  return runOf(from, isUp ? lanes.toReversed() : lanes, to, isUp, short)
}

/** A node as it is drawn: its box in its tone, and in it its mark, the lines of its label, and its badge. */
function boxOf(node: GraphletNode, spot: Spot): string {
  const tone = TONES.find(one => one === node.tone) ?? 'plain'
  const first = spot.y + (spot.height - (spot.lines.length - 1) * LINE_HEIGHT) / 2 + BASELINE
  const lines = spot.lines.map((line, index) => {
    const mark = index > 0 || node.mark === undefined ? '' : `<tspan class="mark">${escaped(node.mark)}</tspan>`
    const label = mark === '' ? escaped(line) : `<tspan dx="${WORD_GAP}">${escaped(line)}</tspan>`
    const isLast = index === spot.lines.length - 1
    const badge = !isLast || node.badge === undefined ? '' : `<tspan class="badge" dx="${WORD_GAP}">${escaped(node.badge)}</tspan>`
    return `<tspan x="${middleOf(spot)}" y="${first + index * LINE_HEIGHT}">${mark}${label}${badge}</tspan>`
  })
  const box = `<rect class="box" x="${spot.x}" y="${spot.y}" width="${spot.width}" height="${spot.height}" rx="${BOX_RADIUS}"/>`
  return `<g class="node ${tone}" tabindex="0">${box}<text>${lines.join('')}</text></g>`
}

/**
 * The drawing: every link, each naming its two ends by their places in the
 * graph, with an arrowhead where the graph is directed and its label, cut as
 * the terminal cuts it, written on its first stretch, and moved down past any
 * label written there before it; and over them every node, in the graph's
 * order. A link from a node to itself has no label written, as in the
 * terminal.
 */
function drawingOf(graph: Graph): string {
  const spots = spotsOf(layersOf(graph).slots)
  const places = new Map<string, { index: number; spot: Spot }>()
  graph.nodes.forEach((node, index) => {
    const spot = spots.find(one => 'node' in one.slot && one.slot.node.id === node.id)
    if (spot !== undefined) places.set(node.id, { index, spot })
  })
  const drawn = graph.links.flatMap(link => {
    const [from, to] = [places.get(link.from), places.get(link.to)]
    return from === undefined || to === undefined ? [] : [{ link, from, to, arrow: arrowOf(link, from.spot, to.spot, spots, graph.isDirected) }]
  })
  const written: Array<{ x: number; y: number; width: number }> = []
  const writtenAt = new Map<GraphletLink, Point>()
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
    const head = graph.isDirected ? `<polygon points="${headOf(arrow.tip, arrow.way)}"/>` : ''
    const at = writtenAt.get(link)
    const label = at === undefined ? '' : `<text x="${at.x}" y="${at.y + BASELINE}">${escaped(labelOf(link))}</text>`
    return `<g class="link" ${ends}><path${dashes} d="${arrow.path}"/>${head}${label}</g>`
  })
  const nodes = graph.nodes.flatMap(node => {
    const place = places.get(node.id)
    return place === undefined ? [] : [boxOf(node, place.spot)]
  })
  const width = Math.max(...spots.map(spot => spot.x + spot.width)) + MARGIN
  const height = Math.max(...spots.map(spot => spot.y + spot.height)) + MARGIN
  const sizes = `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="min-width:${Math.round(width * LEAST_SCALE)}px"`
  return `<svg ${sizes}>\n${[...links, ...nodes].join('\n')}\n</svg>`
}

/** The graph as a web page: one self-contained HTML document. */
export function pageOf(graph: Graph, title: string): string {
  const body =
    graph.nodes.length === 0
      ? '<p>Nothing to draw: the graph has no nodes.</p>'
      : `<main>\n${drawingOf(graph)}\n</main>\n<script>${SCRIPT}</script>`
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

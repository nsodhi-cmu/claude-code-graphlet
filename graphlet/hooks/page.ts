import { MOST_CELLS } from './draw'
import type { Graph } from './layers'
import { layoutOf } from './layout'
import type { Direction, Look } from './layout'
import { CHAR_WIDTH, FONT_SIZE, PALETTE, escaped, svgOf } from './svg'

// The page: a graph as one HTML document that draws it in SVG, whole, to zoom
// and pan. The document fetches nothing.

/** How fast the wheel zooms: the drawing grows by e to the power of this times the pixels a turn of the wheel scrolls. */
const ZOOM_RATE = 0.0015
/** The most the wheel zooms the drawing in: this many times its own size. */
const MOST_ZOOM = 4

/** How many pixels of the page a cell of the terminal's layout is across a layer, running down and running right: enough that no box of the page is wider than its box there, and the room between boxes is wider. */
const CELL: Readonly<Record<Direction, number>> = { down: 1.5 * CHAR_WIDTH, right: 16 }
/** How the page has a graph laid out: as the terminal lays it out on one sheet, in a room wide enough for all of it. */
const SHEET: Look = { scroll: 'sheet', labels: 'wrap', links: 'separate', motion: 'still' }
const WIDE = { columns: MOST_CELLS, rows: MOST_CELLS }

/** How the page around the drawing looks, in the drawing's colors: the drawing fills the window under the title, and its sheet is the page itself. */
const STYLE = `${PALETTE}
html { height: 100%; }
body { box-sizing: border-box; height: 100%; display: flex; flex-direction: column; margin: 0; padding: 32px; background: var(--page); color: var(--ink); font: ${FONT_SIZE}px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
h1 { margin: 0 0 24px; font-size: ${FONT_SIZE}px; font-weight: 600; color: var(--soft); }
p { margin: 0; color: var(--soft); }
main { flex: 1; min-height: 0; }
main svg { display: block; width: 100%; height: 100%; touch-action: pinch-zoom; user-select: none; cursor: grab; }
main svg.held { cursor: grabbing; }
main .sheet { stroke: none; }
`

/**
 * What the page does. The drawing fills the window, whole, in its middle,
 * and at most at its own size; the wheel zooms it in and out around the
 * pointer, from whole to `MOST_ZOOM` times its size, a drag of one finger or
 * the main button moves it, as far as leaves half the window on it, a pinch
 * on a touch screen zooms the page as the browser does, and a double click,
 * or a new size of the window, shows it whole again.
 */
const SCRIPT = `
const svg = document.querySelector('main svg')
const whole = { x: svg.viewBox.baseVal.x, y: svg.viewBox.baseVal.y, width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height }
let view = whole
let fitted = view
const show = () => svg.setAttribute('viewBox', [view.x, view.y, view.width, view.height].join(' '))
const kept = next => ({
  ...next,
  x: Math.min(Math.max(next.x, whole.x - next.width / 2), whole.x + whole.width - next.width / 2),
  y: Math.min(Math.max(next.y, whole.y - next.height / 2), whole.y + whole.height - next.height / 2),
})
let held = null
const fit = () => {
  const room = svg.getBoundingClientRect()
  if (room.width === 0 || room.height === 0) return
  const scale = Math.min(1, room.width / whole.width, room.height / whole.height)
  const [width, height] = [room.width / scale, room.height / scale]
  fitted = view = { x: whole.x + (whole.width - width) / 2, y: whole.y + (whole.height - height) / 2, width, height }
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
`

/** The graph as a web page: one self-contained HTML document, the graph running the way its picture in the terminal runs, with nothing selected, each node lit as the pointer passes over it or the keyboard's focus is on it. */
export function pageOf(graph: Graph, title: string, direction: Direction = 'down'): string {
  const body =
    graph.nodes.length === 0
      ? '<p>Nothing to draw: the graph has no nodes.</p>'
      : `<main>\n${svgOf(graph, layoutOf(graph, WIDE, SHEET, false, direction), CELL[direction], { selected: null, isFlowing: false, isLighting: true })}\n</main>\n<script>${SCRIPT}</script>`
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

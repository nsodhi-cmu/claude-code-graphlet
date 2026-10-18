import type { ClientModule } from 'claude-code'

import { piecesOf, styleOf } from './draw'
import type { Drawing } from './draw'

// The surface module: it paints the drawing it is handed, and posts what a
// click lands on, whether it makes a double click on a box, how far a drag
// from no box has gone, and each key pressed while it holds the keyboard.
// What to do about any of them is the hooks module's to say.

/** How long the beads of a flowing line stay on their cells before each moves on to the next, in milliseconds. */
const STEP_MS = 150
/** The longest a second click on a box may come after the first and the two still be a double click, which opens its node, in milliseconds. */
const DOUBLE_CLICK_MS = 400

/** Whether the drawing each instance was last handed has lines that flow. */
const isFlowing = new WeakMap<object, boolean>()
/** Where each instance's pointer went down on no hit, while the button is held, and which drag that began. */
const grips = new WeakMap<object, { x: number; y: number; grab: number }>()
/** The node each instance's last click landed on, and when, while a second click there would make it a double click. */
const clicks = new WeakMap<object, { node: string; at: number }>()

/**
 * Paints the drawing. Where its lines move, the instance counts the steps of
 * the flow in its state, a step every `STEP_MS`, and paints each step's beads
 * and pulse; while they do not, a step paints nothing new and is not taken.
 */
const Surface: ClientModule<Drawing, number> = (drawing, surface) => {
  const { Box, Text } = surface.elements
  isFlowing.set(surface, drawing.rows.some(row => row.some(span => span.beat !== undefined || span.isPulsing === true)))
  if (isFlowing.get(surface) === true && surface.state === undefined) {
    surface.setState(0)
    surface.every(STEP_MS, () => {
      if (isFlowing.get(surface) === true) surface.setState((surface.state ?? 0) + 1)
    })
  }
  surface.onPointer(event => {
    const grip = grips.get(surface)
    if (grip !== undefined && (event.type === 'move' || event.type === 'up')) {
      if (event.button !== undefined) surface.post({ drag: { x: event.x - grip.x, y: event.y - grip.y }, grab: grip.grab, ...(event.type === 'up' ? { isDropped: true } : {}) })
      if (event.type === 'up' || event.button === undefined) grips.delete(surface)
      return
    }
    if (event.type !== 'down') return
    grips.delete(surface)
    if (event.button !== 'left') return
    const hit = drawing.hits.find(
      area => event.x >= area.x && event.x < area.x + area.width && event.y >= area.y && event.y < area.y + area.height,
    )
    const last = clicks.get(surface)
    clicks.delete(surface)
    if (hit === undefined) grips.set(surface, { x: event.x, y: event.y, grab: Math.random() })
    else if (!('node' in hit)) surface.post('by' in hit ? { by: hit.by } : { page: true })
    else if (last?.node === hit.node && Date.now() - last.at <= DOUBLE_CLICK_MS) surface.post({ node: hit.node, isOpened: true })
    else {
      clicks.set(surface, { node: hit.node, at: Date.now() })
      surface.post({ node: hit.node })
    }
  })
  surface.onKey(event => surface.post({ key: event.key, ...(event.ctrl === true || event.meta === true ? { isChord: true } : {}) }))
  return (
    <Box flexDirection="column">
      {drawing.rows.map(row => (
        <Text wrap="truncate-end">
          {row.length === 0
            ? ' '
            : row.flatMap(span =>
                (surface.state === undefined ? [{ text: span.text, glow: 'plain' as const }] : piecesOf(span, surface.state)).map(piece => (
                  <Text {...styleOf(span, piece.glow)}>{piece.text}</Text>
                )),
              )}
        </Text>
      ))}
    </Box>
  )
}

export default Surface

import type { ClientModule } from 'claude-code'

import { piecesOf, styleOf } from './draw'
import type { Drawing } from './draw'

// The surface module: it paints the drawing it is handed, and posts what a
// click lands on, how far a drag from no box has gone, and each key pressed
// while it holds the keyboard. What to do about any of them is the hooks
// module's to say.

/** How long the beads of a flowing line stay on their cells before each moves on to the next, in milliseconds. */
const STEP_MS = 150

/** Whether the drawing each instance was last handed has lines that flow. */
const isFlowing = new WeakMap<object, boolean>()
/** Where each instance's pointer went down on no hit, while the button is held, and which drag that began. */
const grips = new WeakMap<object, { x: number; y: number; grab: number }>()

/**
 * Paints the drawing. Where its lines flow, the instance counts the steps of
 * the flow in its state, a step every `STEP_MS`, and paints each step's beads;
 * while they do not, a step paints nothing new and is not taken.
 */
const Surface: ClientModule<Drawing, number> = (drawing, surface) => {
  const { Box, Text } = surface.elements
  isFlowing.set(surface, drawing.rows.some(row => row.some(span => span.beat !== undefined)))
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
    if (hit === undefined) grips.set(surface, { x: event.x, y: event.y, grab: Math.random() })
    else surface.post('node' in hit ? { node: hit.node } : 'by' in hit ? { by: hit.by } : { page: true })
  })
  surface.onKey(event => surface.post({ key: event.key, ...(event.ctrl === true || event.meta === true ? { isChord: true } : {}) }))
  return (
    <Box flexDirection="column">
      {drawing.rows.map(row => (
        <Text wrap="truncate-end">
          {row.length === 0
            ? ' '
            : row.flatMap(span =>
                (surface.state === undefined ? [{ text: span.text }] : piecesOf(span, surface.state)).map(piece => (
                  <Text {...styleOf(span, piece.isBead)}>{piece.text}</Text>
                )),
              )}
        </Text>
      ))}
    </Box>
  )
}

export default Surface

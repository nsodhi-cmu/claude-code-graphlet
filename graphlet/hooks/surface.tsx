import type { ClientModule } from 'claude-code'

import { styleOf } from './draw'
import type { Drawing } from './draw'

// The surface module: it paints the drawing it is handed, and posts what a
// click lands on and each key pressed while it holds the keyboard. What to do
// about either is the hooks module's to say.

/** How long the beads of a flowing line stay on their cells before each moves on to the next, in milliseconds. */
const STEP_MS = 150

/** Whether the drawing each instance was last handed has lines that flow. */
const isFlowing = new WeakMap<object, boolean>()

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
    if (event.type !== 'down' || event.button !== 'left') return
    const hit = drawing.hits.find(
      area => event.x >= area.x && event.x < area.x + area.width && event.y >= area.y && event.y < area.y + area.height,
    )
    if (hit !== undefined) surface.post('node' in hit ? { node: hit.node } : 'by' in hit ? { by: hit.by } : { page: true })
  })
  surface.onKey(event => surface.post({ key: event.key, ...(event.ctrl === true || event.meta === true ? { isChord: true } : {}) }))
  return (
    <Box flexDirection="column">
      {drawing.rows.map(row => (
        <Text wrap="truncate-end">
          {row.length === 0 ? ' ' : row.map(span => <Text {...styleOf(span, surface.state)}>{span.text}</Text>)}
        </Text>
      ))}
    </Box>
  )
}

export default Surface

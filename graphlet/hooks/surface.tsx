import type { ClientModule, TextProps } from 'claude-code'

import { COLORS } from './draw'
import type { Drawing, Span } from './draw'

// The surface module: it paints the drawing it is handed, and posts what a
// click lands on and each key pressed while it holds the keyboard. What to do
// about either is the hooks module's to say.

const styleOf = (span: Span): TextProps => {
  const color = COLORS[span.paint]
  return {
    ...(color === undefined ? {} : { color }),
    ...(span.paint === 'dim' ? { dimColor: true } : {}),
    ...(span.isBold ? { bold: true } : {}),
    ...(span.isInverse ? { inverse: true } : {}),
  }
}

const Surface: ClientModule<Drawing> = (drawing, surface) => {
  const { Box, Text } = surface.elements
  surface.onPointer(event => {
    if (event.type !== 'down' || event.button !== 'left') return
    const hit = drawing.hits.find(
      area => event.x >= area.x && event.x < area.x + area.width && event.y >= area.y && event.y < area.y + area.height,
    )
    if (hit !== undefined) surface.post('node' in hit ? { node: hit.node } : 'by' in hit ? { by: hit.by } : { page: true })
  })
  surface.onKey(event => surface.post({ key: event.key }))
  return (
    <Box flexDirection="column">
      {drawing.rows.map(row => (
        <Text wrap="truncate-end">
          {row.length === 0 ? ' ' : row.map(span => <Text {...styleOf(span)}>{span.text}</Text>)}
        </Text>
      ))}
    </Box>
  )
}

export default Surface

import { expect, test } from 'claude-code/testing'

import type { GraphletMove } from '../types'
import { rowText } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
import type { Look } from '../hooks/layout'
import { MOVES, viewOf } from '../hooks/view'

/** A source of numbers from 0 up to 1 that gives the same ones every run. */
const numbers = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

const LABELS = ['a', 'node', 'src/some/long/path/to/file.component.ts', 'Validate the incoming request', 'x-y_z.w', '']
const LOOKS: Look[] = (['pinned', 'sheet'] as const).flatMap(scroll =>
  (['wrap', 'clip'] as const).flatMap(labels => (['separate', 'merged'] as const).map(links => ({ scroll, labels, links }))),
)

test('any graph, in any room, under any settings, is drawn inside its room with no two boxes on one cell, and every move and scroll has an answer', () => {
  const next = numbers(7)
  const pick = (below: number): number => Math.floor(next() * below)
  for (let run = 0; run < 300; run += 1) {
    const count = 1 + pick(run % 10 === 0 ? 40 : 12)
    const hasLayers = pick(3) === 0
    const graph = readGraph({
      nodes: Array.from({ length: count }, (_, index) => ({
        id: `n${index}`,
        label: `${LABELS[pick(LABELS.length)]}${index}`,
        ...(hasLayers ? { layer: pick(4) } : {}),
        ...(pick(4) === 0 ? { mark: '◆', badge: String(pick(30)) } : {}),
      })),
      links: Array.from({ length: pick(count * 2 + 1) }, () => ({ from: `n${pick(count)}`, to: `n${pick(count)}` })),
      isDirected: run % 3 !== 1,
    })
    const view = viewOf(LOOKS[pick(LOOKS.length)] ?? { scroll: 'pinned', labels: 'wrap', links: 'separate' })
    const room = { columns: 40 + pick(140), rows: 2 + pick(50) }
    const selected = pick(5) === 0 ? null : `n${pick(count)}`

    const pan = view.show(graph, selected, room, { x: pick(300), y: pick(60) })
    const drawing = view.draw(graph, selected, room, pan)
    expect(Math.max(0, ...drawing.rows.map(row => [...rowText(row)].length))).toBeLessThanOrEqual(room.columns)
    expect(drawing.rows.length).toBeLessThanOrEqual(room.rows)
    const cells: string[] = []
    for (const hit of drawing.hits) {
      expect(Math.min(hit.x, hit.y)).toBeGreaterThanOrEqual(0)
      expect(hit.x + hit.width).toBeLessThanOrEqual(room.columns)
      expect(hit.y + hit.height).toBeLessThanOrEqual(drawing.rows.length)
      if (!('node' in hit)) continue
      for (let cell = 0; cell < hit.width * hit.height; cell += 1) {
        cells.push(`${hit.x + (cell % hit.width)},${hit.y + Math.floor(cell / hit.width)}`)
      }
    }
    expect(new Set(cells).size).toBe(cells.length)

    const ids = new Set<string | null>([...graph.nodes.map(node => node.id), null])
    for (const move of ['left', 'right', 'up', 'down'] as const) expect(ids.has(view.step(graph, selected, move, room, pan))).toBe(true)
    expect(view.scroll(graph, room, pan, pick(7) - 3).x).toBeGreaterThanOrEqual(0)
    expect(view.measure(graph, room.columns).rows).toBeGreaterThanOrEqual(drawing.rows.length)
  }
})

test('the letters under the arrows move as the arrows do', () => {
  const moves: Record<string, GraphletMove> = { h: 'left', j: 'down', k: 'up', l: 'right' }
  for (const [letter, move] of Object.entries(moves)) {
    expect(MOVES[letter]).toBe(move)
    expect(MOVES[move]).toBe(move)
  }
  expect(MOVES.t).toBeUndefined()
})

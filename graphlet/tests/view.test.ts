import { expect, test } from 'claude-code/testing'

import { LOOK, busy, numbers } from './fixture'
import type { GraphletMove } from '../types'
import { rowText, sizeOf } from '../hooks/draw'
import { ranksOf, readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import type { Look } from '../hooks/layout'
import { FOCUS_NODES, MOVES, collapsedOf, focusOf, openingOf, viewOf } from '../hooks/view'

const LABELS = ['a', 'node', 'src/some/long/path/to/file.component.ts', 'Validate the incoming request', 'x-y_z.w', '', '数据库连接池', '✅ 完成']
const LOOKS: Look[] = (['pinned', 'sheet'] as const).flatMap(scroll =>
  (['wrap', 'clip'] as const).flatMap(labels => (['separate', 'merged'] as const).map(edges => ({ scroll, labels, edges }))),
)

test('any graph, in any room, under any settings, is drawn inside its room with no two boxes on one cell, every move and scroll has an answer, and its picture in SVG holds every node once and is short enough for a surface', () => {
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
        ...(pick(3) === 0 ? { group: `g${pick(3)}` } : {}),
      })),
      edges: Array.from({ length: pick(count * 2 + 1) }, () => ({ from: `n${pick(count)}`, to: `n${pick(count)}` })),
      isDirected: run % 3 !== 1,
      ...([{}, { direction: 'down' as const }, { direction: 'right' as const }][pick(3)] ?? {}),
    })
    const view = viewOf(LOOKS[pick(LOOKS.length)] ?? { scroll: 'pinned', labels: 'wrap', edges: 'separate' })
    const room = { columns: 40 + pick(140), rows: 2 + pick(50) }
    const selected = pick(5) === 0 ? null : `n${pick(count)}`

    const pan = view.show(graph, selected, room, { x: pick(300), y: pick(60) })
    const drawing = view.draw(graph, selected, room, pan)
    expect(Math.max(0, ...drawing.rows.map(row => sizeOf(rowText(row))))).toBeLessThanOrEqual(room.columns)
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

    const vector = view.vector(graph, selected, room)
    expect(vector === undefined).toBe(graph.nodes.length === 0)
    expect(view.order(graph, room).toSorted()).toEqual(graph.nodes.map(node => node.id).toSorted())
    const source = vector?.source ?? ''
    expect(source).not.toMatch(/NaN|Infinity|undefined/)
    expect(source.match(/<g class="node /g)?.length ?? 0).toBe(graph.nodes.length)
    const [left = 0, top = 0, wide = 0, tall = 0] = (/viewBox="([^"]*)"/.exec(source)?.[1] ?? '').split(' ').map(Number)
    const boxes = [...source.matchAll(/<rect class="(?:box|hull)" x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(([whole = '', ...sizes]) => {
      const [x = NaN, y = NaN, width = NaN, height = NaN] = sizes.map(Number)
      return { isBox: whole.includes('"box"'), x, y, right: x + width, bottom: y + height }
    })
    expect(boxes.filter(box => box.x < left || box.y < top || box.right > left + wide || box.bottom > top + tall)).toEqual([])
    const nodes = boxes.filter(box => box.isBox)
    expect(nodes.filter(box => nodes.some(other => other !== box && box.x < other.right && other.x < box.right && box.y < other.bottom && other.y < box.bottom))).toEqual([])
  }
})

test('a picture in SVG lights the node the pointer is over while that leaves it short enough for a surface, and else does not, and is none where even that is too long', () => {
  const view = viewOf(LOOK, true, false)
  const room = { columns: 80, rows: 1000 }
  expect(view.vector(readGraph(busy(12, 20)), null, room)?.source).toContain(':hover)')
  const unlit = view.vector(readGraph(busy(250, 500)), null, room)?.source
  expect(unlit).toBeDefined()
  expect(unlit).not.toContain(':hover)')
  expect(view.vector(readGraph(busy(1000, 2000)), null, room)).toBeUndefined()
})

test('the letters under the arrows move as the arrows do', () => {
  const moves: Record<string, GraphletMove> = { h: 'left', j: 'down', k: 'up', l: 'right' }
  for (const [letter, move] of Object.entries(moves)) {
    expect(MOVES[letter]).toBe(move)
    expect(MOVES[move]).toBe(move)
  }
  expect(MOVES.t).toBeUndefined()
})

test('in focus, a graph is its selected node and those nearest it, of nodes as near the ones named first, each saying how many of its edges lead out of focus', () => {
  const ids = Array.from({ length: 30 }, (_, index) => `n${index}`)
  const chain = readGraph({
    nodes: [...ids.map(id => ({ id, label: id })), { id: 'far', label: 'far', badge: '2' }],
    edges: [...ids.slice(1).map((id, index) => ({ from: ids[index] ?? '', to: id })), { from: 'n29', to: 'far' }],
  })
  const focused = focusOf(chain, 'n10')
  expect(focused.nodes.map(node => node.id)).toEqual(ids.slice(0, FOCUS_NODES))
  expect(focused.nodes.find(node => node.id === 'n23')?.badge).toBe('+1')
  expect(focused.nodes.find(node => node.id === 'n10')?.badge).toBeUndefined()
  expect(focused.unread).toEqual({ nodes: 31 - FOCUS_NODES, edges: 30 - (FOCUS_NODES - 1) })
  expect(focusOf(chain, null)).toBe(chain)
  expect(focusOf(chain, 'nowhere')).toBe(chain)
})

test('in focus, of the nodes as near the selected one, those of highest priority are kept first, and then the ones named first', () => {
  const leaves = Array.from({ length: 30 }, (_, index) => `leaf${index}`)
  const star = readGraph({
    nodes: [{ id: 'hub', label: 'hub' }, ...leaves.map(id => ({ id, label: id, ...(id === 'leaf29' ? { priority: 1 } : id === 'leaf0' ? { priority: -1 } : {}) }))],
    edges: leaves.map(id => ({ from: 'hub', to: id })),
  })
  expect(focusOf(star, 'hub').nodes.map(node => node.id)).toEqual(['hub', ...leaves.slice(1, FOCUS_NODES - 1), 'leaf29'])
})

test('a graph that says not which way it runs runs right where that fits its room\'s columns in half the rows or fewer, or fits its room whole where running down does not, and else down', () => {
  const view = viewOf({ scroll: 'pinned', labels: 'wrap', edges: 'separate' })
  const chain = readGraph({ nodes: ['lint', 'test', 'build', 'deploy'].map(id => ({ id, label: id })), edges: [['lint', 'test'], ['test', 'build'], ['build', 'deploy']].map(([from = '', to = '']) => ({ from, to })) })
  const fan = readGraph({ nodes: ['root', 'a', 'b'].map(id => ({ id, label: id })), edges: [{ from: 'root', to: 'a' }, { from: 'root', to: 'b' }] })
  expect(view.direction(chain, { columns: 80, rows: 40 })).toBe('right')
  expect(view.direction(chain, { columns: 30, rows: 40 })).toBe('down')
  expect(view.direction(fan, { columns: 80, rows: 40 })).toBe('down')
  expect(view.direction(fan, { columns: 80, rows: 8 })).toBe('right')
  expect(view.direction({ ...chain, direction: 'down' }, { columns: 80, rows: 40 })).toBe('down')
  expect(view.direction({ ...fan, direction: 'right' }, { columns: 20, rows: 40 })).toBe('right')
  expect(view.measure(chain, 80)).toEqual({ columns: 41, rows: 4 })
})

test('collapsed, a group is one box where its first node stood, saying its label and how many nodes it holds, its edges those of all of them once for each label and tone, and none between two of them', () => {
  const graph = readGraph({
    nodes: [{ id: 'in', label: 'in' }, { id: 'a', label: 'a', group: 'g' }, { id: 'out', label: 'out' }, { id: 'b', label: 'b', group: 'g', priority: 2 }],
    edges: [{ from: 'in', to: 'a' }, { from: 'in', to: 'b' }, { from: 'a', to: 'b' }, { from: 'b', to: 'out', tone: 'bad' }, { from: 'a', to: 'a' }],
    groups: [{ id: 'g', label: 'Group', tone: 'note' }],
  })
  const shut = collapsedOf(graph, new Set(['g']))
  expect(shut.nodes).toEqual([
    { id: 'in', label: 'in', isForemost: false },
    { id: 'g', label: 'Group', mark: '▸', badge: '2', holds: 2, isForemost: true, tone: 'note', priority: 2 },
    { id: 'out', label: 'out', isForemost: false },
  ])
  expect(shut.edges).toEqual([
    { from: 'in', to: 'g', isDirected: true },
    { from: 'g', to: 'out', isDirected: true, tone: 'bad' },
  ])
  expect(shut.groups).toEqual([])
  expect(collapsedOf(graph, new Set())).toBe(graph)
  const toned = readGraph({
    nodes: [{ id: 'm1', label: 'm1', group: 'g' }, { id: 'm2', label: 'm2', group: 'g' }, { id: 'x', label: 'x' }],
    edges: [{ from: 'm1', to: 'x' }, { from: 'm2', to: 'x', tone: 'bad' }],
  })
  expect(collapsedOf(toned, new Set(['g'])).edges).toEqual([
    { from: 'g', to: 'x', isDirected: true },
    { from: 'g', to: 'x', isDirected: true, tone: 'bad' },
  ])
})

test('collapsed in a graph whose nodes name their layers, a group\'s box stands in its first node\'s layer, so every other node keeps its own', () => {
  const graph = readGraph({
    nodes: [{ id: 'top', label: 'top', layer: 0 }, { id: 'a', label: 'a', layer: 2, group: 'g' }, { id: 'b', label: 'b', layer: 3, group: 'g' }, { id: 'low', label: 'low', layer: 5 }],
    edges: [{ from: 'top', to: 'a' }, { from: 'b', to: 'low' }],
  })
  const shut = collapsedOf(graph, new Set(['g']))
  expect(shut.nodes.map(node => `${node.id} ${node.layer}`)).toEqual(['top 0', 'g 2', 'low 5'])
  expect([...ranksOf(shut)]).toEqual([['top', 0], ['g', 1], ['low', 2]])
})

/** A graph of groups one after another, each a chain of as many nodes as `sizes` says, its last node joined to the next group's first; the node `foremost` names has a priority of 1. */
const chainsOf = (sizes: number[], foremost = ''): Graph => {
  const ids = sizes.map((size, group) => Array.from({ length: size }, (_, at) => `g${group} n${at}`))
  return readGraph({
    nodes: ids.flatMap((group, at) => group.map(id => ({ id, label: id, group: `g${at}`, ...(id === foremost ? { priority: 1 } : {}) }))),
    edges: ids.flat().slice(1).map((id, at) => ({ from: ids.flat()[at] ?? '', to: id })),
  })
}

test('auto collapses every group of more than one node in a graph of more than 25 nodes that its room does not show whole, and none in any other', () => {
  const view = viewOf(LOOK, true)
  const tiny = { columns: 40, rows: 10 }
  expect(openingOf(view, chainsOf([12, 1, 8, 6]), tiny, 'auto')).toEqual(new Set(['g0', 'g2', 'g3']))
  expect(openingOf(view, chainsOf([12, 1, 8, 6]), { columns: 1000, rows: 1000 }, 'auto')).toEqual(new Set())
  expect(openingOf(view, chainsOf([12, 13]), tiny, 'auto')).toEqual(new Set())
})

test('expanded starts every group open, and collapsed every group of more than one node, in any room', () => {
  const view = viewOf(LOOK, true)
  const graph = chainsOf([12, 1, 8, 6])
  for (const room of [{ columns: 40, rows: 10 }, { columns: 1000, rows: 1000 }]) {
    expect(openingOf(view, graph, room, 'expanded')).toEqual(new Set())
    expect(openingOf(view, graph, room, 'collapsed')).toEqual(new Set(['g0', 'g2', 'g3']))
  }
})

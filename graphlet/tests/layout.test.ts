import { describe, expect, test } from 'claude-code/testing'

import { LOOK, SEPARATE, graphOf, numbers } from './fixture'
import { readGraph } from '../hooks/layers'
import { viewOf } from '../hooks/view'
import { rowText } from '../hooks/draw'
import type { Graph } from '../hooks/layers'
import { breadthOf, costOf, layoutOf, routeOf, wordsOf, wrap } from '../hooks/layout'
import type { Layout, Wire } from '../hooks/layout'

const ROOM = { columns: 80, rows: 40 }
const laid = (graph: Graph, look = SEPARATE): Layout => layoutOf(graph, ROOM, look)

/** Where each node's box starts and how wide it is, shelf by shelf. */
const boxes = (layout: Layout): Array<Array<[id: string, x: number, width: number]>> =>
  layout.shelves.map(shelf =>
    shelf.places.flatMap(place => ('node' in place.slot ? [[place.slot.node.id, place.x, place.width] as [string, number, number]] : [])),
  )

/** The columns a shelf's lanes stand in. */
const lanes = (layout: Layout, shelf: number): number[] =>
  (layout.shelves[shelf]?.places ?? []).flatMap(place => ('lane' in place.slot ? [place.x] : []))

describe('wrapping a label', () => {
  test('a label that fits its line is left on it', () => {
    expect(wrap('Save to the database', 24, 3)).toEqual(['Save to the database'])
  })

  test('a longer one is broken at its spaces', () => {
    expect(wrap('Validate the incoming request and normalize it', 24, 3)).toEqual([
      'Validate the incoming',
      'request and normalize it',
    ])
  })

  test('a word too long for a line is broken after the last dash, slash, dot, or underscore that fits', () => {
    expect(wrap('invoice-line-item-renderer.component.ts', 24, 3)).toEqual(['invoice-line-item-', 'renderer.component.ts'])
    expect(wrap('src/components/checkout/Summary.tsx', 24, 3)).toEqual(['src/components/checkout/', 'Summary.tsx'])
  })

  test('a word a little longer than a line keeps a line to itself, so a file\'s name is not broken for the sake of a few characters', () => {
    expect(wrap('building-glider/index.html', 24, 3, 32)).toEqual(['building-glider/index.html'])
    expect(wrap('see building-glider/index.html there', 24, 3, 32)).toEqual(['see', 'building-glider/index.html', 'there'])
    expect(wrap('invoice-line-item-renderer.component.ts', 24, 3, 32)).toEqual(['invoice-line-item-', 'renderer.component.ts'])
  })

  test('a word with nowhere to break is broken where the line ends', () => {
    expect(wrap('abcdefghijklmnopqrstuvwxyz0123', 10, 3)).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz0123'])
  })

  test('a label in characters two cells wide is wrapped by the cells it takes', () => {
    expect(wrap('数据库 连接池 管理器', 8, 3)).toEqual(['数据库', '连接池', '管理器'])
    expect(wrap('这是一个非常长的标签', 8, 3)).toEqual(['这是一个', '非常长的', '标签'])
  })

  test('what is left after the last line allowed is cut short there, and ends in an ellipsis', () => {
    expect(wrap('one two three four five six seven eight nine ten', 9, 3)).toEqual(['one two', 'three', 'four fiv…'])
  })
})

describe('what a box says', () => {
  const graph = readGraph({
    nodes: [
      { id: 'a', label: 'a-file-with-a-very-long-name.component.ts', mark: '◆', badge: '3' },
      { id: 'b', label: 'b' },
    ],
    edges: [
      { from: 'a', to: 'a' },
      { from: 'a', to: 'b' },
    ],
  })
  const [a, b] = graph.nodes

  test('its mark, its label on as many lines as it takes, and its badge, after the sign of a loop where it has an edge to itself', () => {
    expect(a === undefined ? undefined : wordsOf(graph, a, 'wrap')).toEqual({
      mark: '◆ ',
      lines: ['a-file-with-a-very-long-', 'name.component.ts'],
      badge: '  ↺ 3',
    })
    expect(b === undefined ? undefined : wordsOf(graph, b, 'wrap')).toEqual({ mark: '', lines: ['b'], badge: '' })
  })

  test('with labels cut, the label keeps to one line, cut in its middle', () => {
    expect(a === undefined ? undefined : wordsOf(graph, a, 'clip').lines).toEqual(['a-file-with-a-ve…me.component.ts'])
  })
})

describe('boxes on their shelves', () => {
  test('a box is as wide as what it says, and never too narrow for its two ports to stand apart', () => {
    const layout = laid(graphOf(['a', 'a longer label'], [['a', 'a longer label']]))
    expect(boxes(layout).flat().map(([, , width]) => width)).toEqual([7, 18])
  })

  test('a box is as tall as its own label, a shelf as tall as its tallest box, and a lane as tall as its shelf', () => {
    const tall = 'a label long enough to wrap onto a second line'
    const layout = laid(graphOf(['top', 'short', tall, 'end'], [['top', 'short'], ['top', tall], ['top', 'end'], ['short', 'end']]))
    expect(layout.shelves.map(shelf => shelf.rows)).toEqual([3, 4, 3])
    expect(layout.shelves[1]?.places.map(place => ['lane' in place.slot ? 'lane' : place.slot.node.id, place.rows])).toEqual([
      ['short', 3],
      [tall, 4],
      ['lane', 4],
    ])
  })

  test('a box sits over the middle of what its edges reach, and under the middle of what reaches it', () => {
    const graph = graphOf(['top', 'l', 'r', 'bottom'], [['top', 'l'], ['top', 'r'], ['l', 'bottom'], ['r', 'bottom']])
    const middles = boxes(laid(graph)).map(shelf => shelf.map(([, x, width]) => x + Math.floor(width / 2)))
    const between = Math.round(((middles[1]?.[0] ?? 0) + (middles[1]?.[1] ?? 0)) / 2)
    expect(middles[0]).toEqual([between])
    expect(middles[2]).toEqual([between])
  })

  test('an edge that passes several shelves keeps to one column through all of them', () => {
    const layout = laid(graphOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']]))
    expect(lanes(layout, 1)).toHaveLength(1)
    expect(lanes(layout, 1)).toEqual(lanes(layout, 2))
  })

  test('pinned, a shelf that fits the room is laid out across it and a longer one across its own length; on a sheet all are laid out across the longest', () => {
    const users = Array.from({ length: 9 }, (_, index) => `user-number-${index}`)
    const graph = graphOf(['core', ...users], users.map(user => [user, 'core']))
    const pinned = laid(graph)
    expect(pinned.shelves.map(shelf => shelf.across)).toEqual([pinned.shelves[0]?.width, 80])
    const sheet = laid(graph, { ...SEPARATE, scroll: 'sheet' })
    expect(sheet.shelves.map(shelf => shelf.across)).toEqual([sheet.shelves[0]?.width, sheet.shelves[0]?.width])
  })

  test('a graph\'s priorities never leave its seating weighing more than with none, and where they change it, its edges of higher priority bend less', () => {
    const next = numbers(41)
    const pick = (below: number): number => Math.floor(next() * below)
    /** Whether one list of numbers comes before another, the first that differs deciding. */
    const isEarlier = (a: number[], b: number[]): boolean => {
      const at = a.findIndex((one, index) => one !== b[index])
      return at !== -1 && (a[at] ?? 0) < (b[at] ?? 0)
    }
    const seats = (layout: Layout): string => JSON.stringify(layout.shelves.map(shelf => shelf.places.map(place => place.x)))
    for (let run = 0; run < 300; run += 1) {
      const count = 3 + pick(12)
      const nodes = Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: `node ${index}` }))
      const edges = Array.from({ length: count + pick(2 * count) }, () => ({ from: `n${pick(count)}`, to: `n${pick(count)}` }))
      const ranked = readGraph({ nodes: nodes.map(node => (pick(3) === 0 ? { ...node, priority: pick(4) - 1 } : node)), edges })
      const priority = new Map(ranked.nodes.map(node => [node.id, node.priority ?? 0]))
      const rankOf = (wire: Wire): number => Math.max(priority.get(wire.edge.from) ?? 0, priority.get(wire.edge.to) ?? 0)
      const [mine, theirs] = [laid(ranked), laid(readGraph({ nodes, edges }))]
      const ranks = [...new Set(mine.channels.flatMap(channel => channel.wires.map(rankOf)))].sort((a, b) => b - a)
      const [after, before] = [costOf(mine.channels, ranks, rankOf), costOf(theirs.channels, ranks, rankOf)]
      expect(after.weight).toBeLessThanOrEqual(before.weight)
      if (seats(mine) !== seats(theirs)) expect(isEarlier(after.ranked, before.ranked)).toBe(true)
    }
  })

  test('a room narrower than the narrowest a graph is laid out for is taken to be that wide', () => {
    expect(layoutOf(graphOf(['a'], []), { columns: 10, rows: 10 }, SEPARATE).columns).toBe(40)
  })
})

describe('the rows between two shelves', () => {
  const tracks = (layout: Layout, channel = 0): number => new Set(layout.channels[channel]?.wires.map(wire => wire.track)).size
  const rows = (layout: Layout): number[] => layout.channels.map(channel => channel.rows)

  test('a row the edges turn on and a row of arrowheads, and under the last shelf nothing', () => {
    expect(rows(laid(graphOf(['a', 'b'], [['a', 'b']])))).toEqual([2, 0])
  })

  test('two shelves with no edge between them are a row apart', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 0 },
        { id: 'b', label: 'b', layer: 1 },
      ],
      edges: [],
    })
    expect(rows(laid(graph))).toEqual([1, 0])
  })

  test('edges to one node turn on one row, however many nodes they come from', () => {
    const users = ['u1', 'u2', 'u3', 'u4']
    expect(tracks(laid(graphOf([...users, 'core'], users.map(user => [user, 'core']))))).toBe(1)
  })

  test('nodes that all edge to the very same nodes share one row', () => {
    expect(tracks(laid(graphOf(['a', 'b', 'c', 'd'], [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']])))).toBe(1)
  })

  /** Two nodes whose edges fan out across the same nodes, the one's to one more of them, so that wherever the two stand their fans overlap. */
  const APART = readGraph({
    nodes: [
      ...['u0', 'u1'].map(id => ({ id, label: id, layer: 0 })),
      ...['d0', 'd1', 'd2'].map(id => ({ id, label: id, layer: 1 })),
    ],
    edges: [
      { from: 'u0', to: 'd0' },
      { from: 'u0', to: 'd1' },
      { from: 'u0', to: 'd2' },
      { from: 'u1', to: 'd0' },
      { from: 'u1', to: 'd2' },
    ],
  })

  test('one node\'s edges turn on a row of their own where they would run into another node\'s', () => {
    expect(tracks(laid(APART))).toBe(2)
    expect(rows(laid(APART))[0]).toBe(3)
  })

  test('merged, every edge turns on the one row', () => {
    const layout = laid(APART, LOOK)
    expect(tracks(layout)).toBe(1)
    expect(rows(layout)[0]).toBe(2)
  })

  test('a node has a port for each bundle of edges that reaches it, and a box is widened where its ports need the room', () => {
    const sources = ['a', 'b', 'c', 'd']
    const graph = graphOf([...sources, 'T', ...sources.map(id => `${id}2`)], [...sources.map(id => [id, 'T'] as [string, string]), ...sources.map(id => [id, `${id}2`] as [string, string])])
    const layout = laid(graph)
    const into = layout.channels[0]?.wires.filter(wire => 'node' in wire.to.place.slot && wire.to.place.slot.node.id === 'T') ?? []
    expect(new Set(into.map(wire => wire.to.at)).size).toBe(4)
    expect(into[0]?.to.place.width).toBe(9)
    const merged = laid(graph, LOOK)
    const one = merged.channels[0]?.wires.filter(wire => 'node' in wire.to.place.slot && wire.to.place.slot.node.id === 'T') ?? []
    expect(new Set(one.map(wire => wire.to.at)).size).toBe(1)
  })

  test('an edge back up has a row for its arrowhead above the rows the edges turn on', () => {
    const layout = laid(graphOf(['a', 'b'], [['a', 'b'], ['b', 'a']]))
    expect(layout.channels[0]).toMatchObject({ rows: 3, topRows: 1, bottomRows: 1 })
  })

  test('edges between two nodes of the last shelf run under it', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 0 },
        { id: 'b', label: 'b', layer: 0 },
      ],
      edges: [{ from: 'a', to: 'b' }],
    })
    expect(laid(graph).channels[0]).toMatchObject({ rows: 2, topRows: 1, bottomRows: 0 })
  })

  test('where two shelves slide apart, no two bundles share a row, since what does not meet as laid out may once slid', () => {
    const users = Array.from({ length: 9 }, (_, index) => `user-number-${index}`)
    const graph = graphOf(['one', 'two', ...users], [['one', 'user-number-0'], ['two', 'user-number-8']])
    const loose = laid(graph)
    expect(loose.shelves[0]?.across).not.toBe(loose.shelves[1]?.across)
    expect(tracks(loose)).toBe(2)
    expect(tracks(laid(graph, { ...SEPARATE, scroll: 'sheet' }))).toBe(1)
  })
})

describe('folding into a room', () => {
  test('a graph still wider than its room once folded is not folded again into one a few columns narrower and far taller', () => {
    const next = numbers(109)
    const count = 10 + Math.floor(next() * 25)
    const groups = 2 + Math.floor(next() * 4)
    const graph = readGraph({
      nodes: Array.from({ length: count }, (_, at) => ({ id: `n${at}`, label: `node ${at}${next() < 0.4 ? ' long label' : ''}`, ...(next() < 0.75 ? { group: `g${Math.floor(next() * groups)}` } : {}) })),
      edges: Array.from({ length: count + Math.floor(next() * count) }, (_, at) => ({ from: `n${Math.floor(next() * Math.max(1, at % count))}`, to: `n${at % count}` })),
    })
    const layout = layoutOf(graph, { columns: 50, rows: 1000 }, LOOK, true)
    expect(breadthOf(layout)).toBeGreaterThan(50)
    expect(layout.rows).toBeLessThan(45)
  })
})

describe('frames', () => {
  test('a picture of a graph with groups has no more than four columns side by side that hold nothing but lines across them', () => {
    const next = numbers(23)
    const pick = (below: number): number => Math.floor(next() * below)
    const view = viewOf({ ...LOOK, scroll: 'sheet' })
    for (let run = 0; run < 60; run += 1) {
      const count = 20 + pick(40)
      const graph = readGraph({
        nodes: Array.from({ length: count }, (_, at) => ({ id: `n${at}`, label: `node ${at}`, ...(pick(10) < 7 ? { group: `g${Math.floor((at * 4) / count)}` } : {}) })),
        edges: Array.from({ length: count + pick(count) }, (_, at) => ({ from: `n${pick(Math.max(1, (at % count)))}`, to: `n${at % count}` })),
        direction: 'down',
      })
      const rows = view.draw(graph, null, { columns: 1000, rows: 1000 }, { x: 0, y: 0 }).rows.slice(0, -1).map(rowText)
      const width = Math.max(...rows.map(row => row.length))
      const isEmpty = (x: number): boolean => rows.every(row => [' ', '─', '┈', undefined].includes(row[x]))
      const kept = Array.from({ length: width }, (_, x) => x).filter(x => !isEmpty(x))
      const gaps = kept.slice(1).map((x, at) => x - (kept[at] ?? x) - 1)
      expect(Math.max(0, ...gaps)).toBeLessThanOrEqual(4)
    }
  })

  test('a frame, with all it holds, and a node no frame holds are each moved toward the edges that join them, so an edge between them runs straight where nothing beside them stops it', () => {
    const graph = readGraph({
      nodes: [{ id: 'Browser', label: 'Browser' }, ...['API', 'Auth', 'Cache'].map(id => ({ id, label: id, group: 'back' })), ...['Postgres', 'Redis'].map(id => ({ id, label: id, group: 'data' })), { id: 'Logs', label: 'Logs' }],
      edges: [['Browser', 'API'], ['API', 'Auth'], ['API', 'Cache'], ['Auth', 'Postgres'], ['Cache', 'Redis'], ['API', 'Logs']].map(([from = '', to = '']) => ({ from, to })),
      groups: [{ id: 'back', label: 'Backend' }, { id: 'data', label: 'Data' }],
      direction: 'right',
    })
    const wires = layoutOf(graph, { columns: 60, rows: 40 }, LOOK, false, 'right').channels.flatMap(channel => channel.wires)
    const straight = (from: string, to: string): boolean => wires.filter(wire => wire.edge.from === from && wire.edge.to === to).every(wire => routeOf(wire, place => place.x).out === routeOf(wire, place => place.x).into)
    expect([straight('Browser', 'API'), straight('Auth', 'Postgres'), straight('Cache', 'Redis')]).toEqual([true, true, true])
  })

  test('settling is undone where it would leave the layout weighing more, its edges running farther sideways with none straighter', () => {
    const graph = readGraph({
      nodes: [{ id: 'n0', label: 'Validate request0', group: 'g2', priority: 2 }, { id: 'n1', label: 'n1', group: 'g0' }, { id: 'n2', label: 'n2' }, { id: 'n3', label: 'n3', group: 'g0' }],
      edges: [['n1', 'n1'], ['n3', 'n1'], ['n1', 'n0'], ['n0', 'n3']].map(([from = '', to = '']) => ({ from, to })),
    })
    const layout = layoutOf(graph, { columns: 137, rows: 1000 }, { ...LOOK, scroll: 'sheet' }, true)
    const sideways = layout.channels.flatMap(channel => channel.wires).reduce((sum, wire) => sum + Math.abs(routeOf(wire, place => place.x).out - routeOf(wire, place => place.x).into), 0)
    expect([breadthOf(layout), sideways]).toEqual([34, 4])
  })

  test('a group\'s nodes on one shelf are packed a gap apart, however far apart the shelves above would seat them, so its frame is no wider than they are', () => {
    const graph = readGraph({
      nodes: [...['Left side', 'Middle one', 'Middle two', 'Right side'].map(id => ({ id, label: id })), { id: 'A', label: 'A', group: 'g' }, { id: 'B', label: 'B', group: 'g' }],
      edges: [{ from: 'Left side', to: 'A' }, { from: 'Right side', to: 'B' }, { from: 'Middle one', to: 'Middle two' }],
      direction: 'down',
    })
    const layout = laid(graph)
    const [a, b] = ['A', 'B'].map(id => layout.shelves.flatMap(shelf => shelf.places).find(place => 'node' in place.slot && place.slot.node.id === id))
    if (a === undefined || b === undefined) throw new Error('both are laid out')
    expect(b.x - (a.x + a.width)).toBe(2)
    expect(layout.frames[0]?.width).toBe(b.x + b.width - a.x + 4)
  })
})

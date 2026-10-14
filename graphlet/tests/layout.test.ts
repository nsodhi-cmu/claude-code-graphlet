import { describe, expect, test } from 'claude-code/testing'

import { LOOK, graphOf } from './fixture'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import { layoutOf, wordsOf, wrap } from '../hooks/layout'
import type { Layout } from '../hooks/layout'

const ROOM = { columns: 80, rows: 40 }
const laid = (graph: Graph, look = LOOK): Layout => layoutOf(graph, ROOM, look)

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
    links: [
      { from: 'a', to: 'a' },
      { from: 'a', to: 'b' },
    ],
  })
  const [a, b] = graph.nodes

  test('its mark, its label on as many lines as it takes, and its badge, after the sign of a loop where it links to itself', () => {
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

  test('a box sits over the middle of what it links to, and under the middle of what links to it', () => {
    const graph = graphOf(['top', 'l', 'r', 'bottom'], [['top', 'l'], ['top', 'r'], ['l', 'bottom'], ['r', 'bottom']])
    const middles = boxes(laid(graph)).map(shelf => shelf.map(([, x, width]) => x + Math.floor(width / 2)))
    const between = Math.round(((middles[1]?.[0] ?? 0) + (middles[1]?.[1] ?? 0)) / 2)
    expect(middles[0]).toEqual([between])
    expect(middles[2]).toEqual([between])
  })

  test('a link that passes several shelves keeps to one column through all of them', () => {
    const layout = laid(graphOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']]))
    expect(lanes(layout, 1)).toHaveLength(1)
    expect(lanes(layout, 1)).toEqual(lanes(layout, 2))
  })

  test('pinned, a shelf that fits the room is laid out across it and a longer one across its own length; on a sheet all are laid out across the longest', () => {
    const users = Array.from({ length: 9 }, (_, index) => `user-number-${index}`)
    const graph = graphOf(['core', ...users], users.map(user => [user, 'core']))
    const pinned = laid(graph)
    expect(pinned.shelves.map(shelf => shelf.across)).toEqual([pinned.shelves[0]?.width, 80])
    const sheet = laid(graph, { ...LOOK, scroll: 'sheet' })
    expect(sheet.shelves.map(shelf => shelf.across)).toEqual([sheet.shelves[0]?.width, sheet.shelves[0]?.width])
  })

  test('a room narrower than the narrowest a graph is laid out for is taken to be that wide', () => {
    expect(layoutOf(graphOf(['a'], []), { columns: 10, rows: 10 }, LOOK).columns).toBe(40)
  })
})

describe('the rows between two shelves', () => {
  const tracks = (layout: Layout, channel = 0): number => new Set(layout.channels[channel]?.wires.map(wire => wire.track)).size
  const rows = (layout: Layout): number[] => layout.channels.map(channel => channel.rows)

  test('a row the links turn on and a row of arrowheads, and under the last shelf nothing', () => {
    expect(rows(laid(graphOf(['a', 'b'], [['a', 'b']])))).toEqual([2, 0])
  })

  test('two shelves with no link between them are a row apart', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 0 },
        { id: 'b', label: 'b', layer: 1 },
      ],
      links: [],
    })
    expect(rows(laid(graph))).toEqual([1, 0])
  })

  test('links to one node turn on one row, however many nodes they come from', () => {
    const users = ['u1', 'u2', 'u3', 'u4']
    expect(tracks(laid(graphOf([...users, 'core'], users.map(user => [user, 'core']))))).toBe(1)
  })

  test('nodes that all link to the very same nodes share one row', () => {
    expect(tracks(laid(graphOf(['a', 'b', 'c', 'd'], [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']])))).toBe(1)
  })

  test('links that would run into each other, and are bound for different nodes, turn on rows of their own', () => {
    const graph = graphOf(['a', 'b', 'x', 'y', 'z'], [['a', 'y'], ['a', 'z'], ['b', 'x'], ['b', 'y']])
    expect(tracks(laid(graph))).toBe(2)
    expect(rows(laid(graph))[0]).toBe(3)
  })

  test('merged, every link turns on the one row', () => {
    const graph = graphOf(['a', 'b', 'x', 'y', 'z'], [['a', 'y'], ['a', 'z'], ['b', 'x'], ['b', 'y']])
    const layout = laid(graph, { ...LOOK, links: 'merged' })
    expect(tracks(layout)).toBe(1)
    expect(rows(layout)[0]).toBe(2)
  })

  test('a link back up has a row for its arrowhead above the rows the links turn on', () => {
    const layout = laid(graphOf(['a', 'b'], [['a', 'b'], ['b', 'a']]))
    expect(layout.channels[0]).toMatchObject({ rows: 3, hasUpHeads: true, hasDownHeads: true })
  })

  test('links between two nodes of the last shelf run under it', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 0 },
        { id: 'b', label: 'b', layer: 0 },
      ],
      links: [{ from: 'a', to: 'b' }],
    })
    expect(laid(graph).channels[0]).toMatchObject({ rows: 2, hasUpHeads: true, hasDownHeads: false })
  })

  test('where two shelves slide apart, no two bundles share a row, since what does not meet as laid out may once slid', () => {
    const users = Array.from({ length: 9 }, (_, index) => `user-number-${index}`)
    const graph = graphOf(['one', 'two', ...users], [['one', 'user-number-0'], ['two', 'user-number-8']])
    const loose = laid(graph)
    expect(loose.shelves[0]?.across).not.toBe(loose.shelves[1]?.across)
    expect(tracks(loose)).toBe(2)
    expect(tracks(laid(graph, { ...LOOK, scroll: 'sheet' }))).toBe(1)
  })
})

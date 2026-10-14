import { describe, expect, test } from 'claude-code/testing'

import { LOOK, SHOP, graphOf, graphRows, picture, undirected } from './fixture'
import type { Drawing, Hit, Span } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import type { Look } from '../hooks/layout'
import { viewOf } from '../hooks/view'

const ORIGIN = { x: 0, y: 0 }
/** A room the shop fits whole, and a room as narrow as a graph is laid out for. */
const WHOLE = { columns: 90, rows: 60 }
const SMALL = { columns: 40, rows: 60 }

const drawn = (graph: Graph, selected: string | null = null, room = SMALL, look: Look = LOOK): Drawing =>
  viewOf(look).draw(graph, selected, room, ORIGIN)

/** Every span of the drawing whose text holds `text`. */
const spansWith = (drawing: Drawing, text: string): Span[] =>
  drawing.rows.flatMap(row => row.filter(span => span.text.includes(text)))

/** The hits that select a node. */
const boxes = (drawing: Drawing): Array<Hit & { node: string }> =>
  drawing.hits.filter((hit): hit is Hit & { node: string } => 'node' in hit)

describe('the drawing', () => {
  test('a box a node, in layers, each over what it links to, with the links between them', () => {
    expect(graphRows(drawn(SHOP, null, WHOLE))).toEqual([
      '           ┌───────────────┐  ┌────────────────────┐',
      '           │ ○ checkout.ts │  │ ○ pages/invoice.ts │',
      '           └───────┬───────┘  └───────┬────────────┘',
      '                   │                  │',
      '                   ▼                  ▼',
      '             ┌───────────┐  ┌──────────────────┐  ┌─────────┐  ┌────────────┐',
      '             │ ● cart.ts │  │ ● src/invoice.ts │  │ ○ ui.ts │  │ ▲ email.ts │',
      '             └─────┬─────┘  └─────────┬────────┘  └────┬────┘  └──────┬─────┘',
      '                   └──────────────────┴───────┬────────┴──────────────┘',
      '                                              ▼',
      '                                       ┌────────────┐',
      '                                       │ ◆ price.ts │',
      '                                       └──────┬─────┘',
      '                                              │',
      '                                              ▼',
      '                                      ┌───────────────┐',
      '                                      │ → money.ts  2 │',
      '                                      └───────────────┘',
    ])
  })

  test('a link that closes a loop runs back up dashed, down a lane past the layers between, to an arrowhead beside where the node\'s own links leave', () => {
    expect(graphRows(drawn(graphOf(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']])))).toEqual([
      '                ┌─────┐',
      '                │  A  │',
      '                └─┬───┘',
      '                  │ ▲',
      '                  │ └┈┈┈┐',
      '                  ▼     ┊',
      '               ┌─────┐  ┊',
      '               │  B  │  ┊',
      '               └──┬──┘  ┊',
      '                  │ ┌┈┈┈┘',
      '                  ▼ ┊',
      '                ┌───┴─┐',
      '                │  C  │',
      '                └─────┘',
    ])
  })

  test('two nodes that link to each other are joined by two links side by side, one each way', () => {
    expect(graphRows(drawn(graphOf(['A', 'B'], [['A', 'B'], ['B', 'A']])))).toEqual([
      '                ┌─────┐',
      '                │  A  │',
      '                └─┬───┘',
      '                  │ ▲',
      '                  │ ┊',
      '                  ▼ ┊',
      '                ┌───┴─┐',
      '                │  B  │',
      '                └─────┘',
    ])
  })

  test('a link past a layer runs straight down a lane beside that layer\'s boxes, to an arrowhead of its own on the node it reaches', () => {
    const graph = graphOf(['A', 'B', 'C', 'D', 'E'], [['A', 'B'], ['B', 'C'], ['A', 'C'], ['C', 'D'], ['A', 'D'], ['B', 'E'], ['E', 'D']])
    expect(graphRows(drawn(graph))).toEqual([
      '              ┌─────┐',
      '              │  A  │',
      '              └──┬──┘',
      '                 ├─────┬────┐',
      '                 ▼     │    │',
      '              ┌─────┐  │    │',
      '              │  B  │  │    │',
      '              └──┬──┘  │    │',
      '             ┌───┴───┐ │    │',
      '             ▼       ▼ ▼    │',
      '          ┌─────┐  ┌─────┐  │',
      '          │  E  │  │  C  │  │',
      '          └──┬──┘  └──┬──┘  │',
      '             └────┬───┴─────┘',
      '                  ▼',
      '               ┌─────┐',
      '               │  D  │',
      '               └─────┘',
    ])
  })

  test('a link between two nodes of one layer runs under the layer, to an arrowhead under the node it reaches', () => {
    const graph = readGraph({
      nodes: [
        { id: 'A', label: 'A', layer: 0 },
        { id: 'B', label: 'B', layer: 1 },
        { id: 'C', label: 'C', layer: 1 },
        { id: 'D', label: 'D', layer: 1 },
      ],
      links: [
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'A', to: 'D' },
        { from: 'B', to: 'D' },
        { from: 'C', to: 'B' },
      ],
    })
    expect(graphRows(drawn(graph))).toEqual([
      '                ┌─────┐',
      '                │  A  │',
      '                └──┬──┘',
      '          ┌────────┼────────┐',
      '          ▼        ▼        ▼',
      '       ┌─────┐  ┌─────┐  ┌─────┐',
      '       │  B  │  │  C  │  │  D  │',
      '       └───┬─┘  └──┬──┘  └─────┘',
      '         ▲ │       │        ▲',
      '         └─│───────┘        │',
      '           └────────────────┘',
    ])
  })

  test('a node that links to itself carries the sign of a loop', () => {
    expect(graphRows(drawn(graphOf(['A', 'B'], [['A', 'A'], ['A', 'B']])))).toEqual([
      '                ┌──────┐',
      '                │ A  ↺ │',
      '                └───┬──┘',
      '                    │',
      '                    ▼',
      '                 ┌─────┐',
      '                 │  B  │',
      '                 └─────┘',
    ])
  })

  const LONG = readGraph({
    nodes: [
      { id: 'a', label: 'invoice-line-item-renderer.component.ts' },
      { id: 'b', label: 'Validate the incoming request and normalize every field before it is stored' },
      { id: 'c', label: 'ok' },
    ],
    links: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
  })

  test('a long label is wrapped onto more lines of a taller box, and a short one is set in the middle of the narrowest', () => {
    expect(graphRows(drawn(LONG, null, { columns: 60, rows: 60 }))).toEqual([
      '                  ┌───────────────────────┐',
      '                  │ invoice-line-item-    │',
      '                  │ renderer.component.ts │',
      '                  └───────────┬───────────┘',
      '                              │',
      '                              ▼',
      '                ┌──────────────────────────┐',
      '                │ Validate the incoming    │',
      '                │ request and normalize    │',
      '                │ every field before it i… │',
      '                └─────────────┬────────────┘',
      '                              │',
      '                              ▼',
      '                           ┌─────┐',
      '                           │ ok  │',
      '                           └─────┘',
    ])
  })

  test('a box shorter than the tallest of its layer is drawn from the layer\'s top, and its links run on down past the rows it leaves', () => {
    const tall = 'a-file-with-a-very-long-name.component.ts'
    const graph = graphOf(['top', 'short', tall, 'end'], [['top', 'short'], ['top', tall], ['short', 'end'], [tall, 'end'], ['end', 'short']])
    expect(graphRows(drawn(graph, null, { columns: 60, rows: 60 }))).toEqual([
      '                      ┌─────┐',
      '                      │ top │',
      '                      └──┬──┘',
      '              ┌──────────┴─────────┐',
      '              ▼                    ▼',
      '          ┌───────┐  ┌──────────────────────────┐',
      '          │ short │  │ a-file-with-a-very-long- │',
      '          └──┬────┘  │ name.component.ts        │',
      '             │ ▲     └─────────────┬────────────┘',
      '             │ ┊                   │',
      '             └─┊──────┬────────────┘',
      '               └┈┈┈┈┐ │',
      '                    ┊ ▼',
      '                  ┌─┴───┐',
      '                  │ end │',
      '                  └─────┘',
    ])
    const hits = boxes(drawn(graph, null, { columns: 60, rows: 60 }))
    expect(hits.map(hit => [hit.node, hit.height])).toEqual([
      ['top', 3],
      ['short', 3],
      [tall, 4],
      ['end', 3],
    ])
  })

  test('a link between two boxes of one layer and different heights is whole from the shorter box to the taller', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'cart.ts', layer: 0 },
        { id: 'b', label: 'invoice-line-item-renderer.component.ts', layer: 0 },
      ],
      links: [{ from: 'a', to: 'b' }],
    })
    expect(graphRows(drawn(graph, null, { columns: 60, rows: 60 }))).toEqual([
      '           ┌─────────┐  ┌───────────────────────┐',
      '           │ cart.ts │  │ invoice-line-item-    │',
      '           └────┬────┘  │ renderer.component.ts │',
      '                │       └───────────────────────┘',
      '                │                   ▲',
      '                └───────────────────┘',
    ])
  })

  test('with labels cut, every box is three rows, its label cut in the middle to fit one line', () => {
    expect(graphRows(drawn(LONG, null, { columns: 60, rows: 60 }, { ...LOOK, labels: 'clip' })).slice(0, 8)).toEqual([
      '            ┌──────────────────────────────────┐',
      '            │ invoice-line-ite…er.component.ts │',
      '            └─────────────────┬────────────────┘',
      '                              │',
      '                              ▼',
      '            ┌──────────────────────────────────┐',
      '            │ Validate the inc…re it is stored │',
      '            └─────────────────┬────────────────┘',
    ])
  })

  const MESH = graphOf(['b', 'a', 'c', 'z', 'x', 'y'], [['a', 'x'], ['a', 'y'], ['a', 'z'], ['b', 'x'], ['b', 'z'], ['c', 'y'], ['c', 'x']])

  test('links from different nodes reach a node at arrowheads of their own, and a link that crosses another passes over it unbroken', () => {
    expect(graphRows(drawn(MESH)).slice(2, 7)).toEqual([
      '       └──┬──┘  └──┬──┘  └──┬──┘',
      '         ┌┴──────┐ │ ┌──────┴┐',
      '         │ ┌─────│─┼─│─────┐ │',
      '         ▼ ▼     ▼ ▼ ▼     ▼ ▼',
      '       ┌─────┐  ┌─────┐  ┌─────┐',
    ])
  })

  test('one node\'s links turn on a row of their own where they would run into another node\'s; merged, they share one', () => {
    const graph = readGraph({
      nodes: [
        ...['u0', 'u1', 'u2'].map(id => ({ id, label: id, layer: 0 })),
        ...['d0', 'd1', 'd2'].map(id => ({ id, label: id, layer: 1 })),
      ],
      links: [
        { from: 'u0', to: 'd0' },
        { from: 'u1', to: 'd0' },
        { from: 'u1', to: 'd2' },
      ],
    })
    expect(graphRows(drawn(graph, null, { columns: 70, rows: 60 }))).toEqual([
      '                      ┌─────┐  ┌─────┐  ┌─────┐',
      '                      │ u0  │  │ u1  │  │ u2  │',
      '                      └──┬──┘  └──┬──┘  └─────┘',
      '                      ┌──┘        │',
      '                      │ ┌─────────┴──────┐',
      '                      ▼ ▼                ▼',
      '                    ┌─────┐  ┌─────┐  ┌─────┐',
      '                    │ d0  │  │ d1  │  │ d2  │',
      '                    └─────┘  └─────┘  └─────┘',
    ])
    expect(graphRows(drawn(graph, null, { columns: 70, rows: 60 }, { ...LOOK, links: 'merged' })).slice(2, 5)).toEqual([
      '                      └──┬──┘  └──┬──┘  └─────┘',
      '                       ┌─┴────────┴──────┐',
      '                       ▼                 ▼',
    ])
  })

  test('links that come down a column to their row go above links that leave the row down that column, so the two never run into one line', () => {
    const graph = readGraph({
      nodes: [
        ...['u0', 'u1'].map(id => ({ id, label: id, layer: 0 })),
        ...['d0', 'd1', 'd2'].map(id => ({ id, label: id, layer: 1 })),
      ],
      links: [
        { from: 'u0', to: 'd0' },
        { from: 'u0', to: 'd1' },
        { from: 'u0', to: 'd2' },
        { from: 'u1', to: 'd1' },
        { from: 'u1', to: 'd2' },
      ],
    })
    expect(graphRows(drawn(graph, null, { columns: 70, rows: 60 })).slice(2, 6)).toEqual([
      '                              └──┬──┘  └──┬──┘',
      '                                 │ ┌──────┴─┐',
      '                         ┌───────┼─│──────┐ │',
      '                         ▼       ▼ ▼      ▼ ▼',
    ])
  })

  test('merged, every link turns on one row and every node has one arrowhead', () => {
    expect(graphRows(drawn(MESH, null, SMALL, { ...LOOK, links: 'merged' })).slice(2, 5)).toEqual([
      '       └──┬──┘  └──┬──┘  └──┬──┘',
      '          ├────────┼────────┤',
      '          ▼        ▼        ▼',
    ])
  })

  test('nodes that all link to the very same nodes share one row, which says nothing false', () => {
    expect(graphRows(drawn(graphOf(['A', 'B', 'C', 'D'], [['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D']]))).slice(2, 5)).toEqual([
      '            └──┬──┘  └──┬──┘',
      '               ├────────┤',
      '               ▼        ▼',
    ])
  })

  test('an undirected graph is laid out from the node it names first, a link meets both its boxes at ticks with no arrowhead, and the link that closes a loop runs under a layer', () => {
    const graph = undirected(graphOf(['a', 'b', 'c', 'd'], [['b', 'a'], ['a', 'c'], ['c', 'b'], ['d', 'c'], ['c', 'd'], ['d', 'd']]))
    expect(graphRows(drawn(graph))).toEqual([
      '                 ┌─────┐',
      '                 │  a  │',
      '                 └──┬──┘',
      '               ┌────┴───┐',
      '            ┌──┴──┐  ┌──┴──┐',
      '            │  b  │  │  c  │',
      '            └──┬──┘  └─┬─┬─┘',
      '               └───────┘ │',
      '                     ┌───┴──┐',
      '                     │ d  ↺ │',
      '                     └──────┘',
    ])
  })

  test('in an undirected graph, a link between two nodes of one layer is a line of its own between ticks of its own; merged, it shares the one row', () => {
    const whole = undirected(graphOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd']]))
    expect(graphRows(drawn(whole)).slice(6)).toEqual([
      '       └─┬─┬─┘  └─┬─┬─┘  └─┬─┬─┘',
      '         └─│──────┘ └──────│─┘',
      '           └───────────────┘',
    ])
    expect(graphRows(drawn(whole, null, SMALL, { ...LOOK, links: 'merged' })).slice(6)).toEqual([
      '       └──┬──┘  └─┬─┬─┘  └──┬──┘',
      '          └───────┴─┴───────┘',
    ])
  })

  test('an empty graph draws nothing', () => {
    expect(drawn(readGraph({ nodes: [], links: [] }))).toEqual({ rows: [], hits: [] })
  })

  test('the last row is the foot, and a click in its corner opens the graph as a web page', () => {
    const drawing = drawn(graphOf(['A', 'B'], [['A', 'B']]))
    expect(picture(drawing).at(-1)).toBe('                                  html ↗')
    expect(drawing.hits.at(-1)).toEqual({ x: 34, y: 8, width: 6, height: 1, page: true })
  })
})

describe('what is selected', () => {
  const drawing = drawn(SHOP, 'src/invoice.ts', WHOLE)

  test('the selected box has a double frame, and its label is bold and inverse in its own tone', () => {
    expect(graphRows(drawing).slice(5, 8)).toEqual([
      '             ┌───────────┐  ╔══════════════════╗  ┌─────────┐  ┌────────────┐',
      '             │ ● cart.ts │  ║ ● src/invoice.ts ║  │ ○ ui.ts │  │ ▲ email.ts │',
      '             └─────┬─────┘  ╚═════════╤════════╝  └────┬────┘  └──────┬─────┘',
    ])
    expect(spansWith(drawing, '● src/invoice.ts')).toEqual([
      { text: '● src/invoice.ts', paint: 'bad', isBold: true, isInverse: true },
    ])
  })

  test('the selected box, the boxes linked to it, and the links between them are lit; the rest keep their own paint', () => {
    expect(drawing.rows[0]?.filter(span => span.text.includes('┌')).map(span => span.paint)).toEqual(['dim', 'accent'])
    expect(drawing.rows[4]?.filter(span => span.text === '▼').map(span => span.paint)).toEqual(['dim', 'accent'])
    expect(drawing.rows[5]?.filter(span => span.text.trim() !== '').map(span => span.paint)).toEqual(['bad', 'accent', 'dim', 'warn'])
    expect(drawing.rows[8]?.filter(span => span.text.trim() !== '').map(span => [span.text.length, span.paint])).toEqual([
      [19, 'dim'],
      [9, 'accent'],
      [24, 'dim'],
    ])
    expect(spansWith(drawing, '┌────────────┐').at(-1)?.paint).toBe('accent')
    expect(spansWith(drawing, '● cart.ts')).toEqual([{ text: '● cart.ts', paint: 'bad' }])
  })

  test('where a link leaves a box, the border shows it in the border\'s own paint, lit or not', () => {
    expect(drawing.rows[7]?.filter(span => span.text.trim() !== '').map(span => span.paint)).toEqual(['bad', 'accent', 'dim', 'warn'])
    expect(drawing.rows[12]?.filter(span => span.text.trim() !== '').map(span => span.paint)).toEqual(['accent'])
  })

  test('a badge is dim, apart from the label it follows', () => {
    const money = drawn(SHOP, 'src/money.ts', WHOLE)
    expect(money.rows[16]?.filter(span => span.text.trim() !== '').slice(1, 3)).toEqual([
      { text: '→ money.ts', paint: 'dim', isBold: true, isInverse: true },
      { text: '  2', paint: 'dim' },
    ])
  })

  test('a link back up is lit along its whole way, through the lane it passes in', () => {
    const loop = drawn(graphOf(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]), 'C')
    expect(spansWith(loop, '┊').every(span => span.paint === 'accent')).toBe(true)
    expect(spansWith(loop, '▲')).toEqual([{ text: '▲', paint: 'accent' }])
  })
})

describe('where a click lands', () => {
  test('every box is a hit over exactly its own cells, and no two hits overlap', () => {
    const drawing = drawn(SHOP, 'src/cart.ts', WHOLE)
    const rows = picture(drawing)
    expect(boxes(drawing).map(hit => hit.node)).toEqual([
      'src/pages/checkout.ts',
      'src/pages/invoice.ts',
      'src/cart.ts',
      'src/invoice.ts',
      'src/ui.ts',
      'src/email.ts',
      'src/price.ts',
      'src/money.ts',
    ])
    for (const hit of boxes(drawing)) {
      expect('┌╔').toContain(rows[hit.y]?.[hit.x] ?? ' ')
      expect('┘╝').toContain(rows[hit.y + hit.height - 1]?.[hit.x + hit.width - 1] ?? ' ')
    }
    const cells = boxes(drawing).flatMap(hit =>
      Array.from({ length: hit.width * hit.height }, (_, index) => `${hit.x + (index % hit.width)},${hit.y + Math.floor(index / hit.width)}`),
    )
    expect(new Set(cells).size).toBe(cells.length)
  })

  test('a lane is no hit', () => {
    const graph = graphOf(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['A', 'C']])
    expect(boxes(drawn(graph)).map(hit => hit.node)).toEqual(['A', 'B', 'C'])
  })
})

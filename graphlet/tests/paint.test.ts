import { describe, expect, test } from 'claude-code/testing'

import { LOOK, SHOP, cellsOf, graphOf, graphRows, numbers, picture, undirected } from './fixture'
import { rowText } from '../hooks/draw'
import type { Drawing, Hit, Span } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import { layoutOf } from '../hooks/layout'
import type { Layout, Look, Place } from '../hooks/layout'
import { paint } from '../hooks/paint'
import { viewOf } from '../hooks/view'
import { sightOf, slideOf, within } from '../hooks/window'

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

  test('the two links between two nodes stay side by side, though a link from farther up reaches the lower one too', () => {
    const graph = graphOf(['Home', 'Glider', 'Building', 'Writings'], [['Home', 'Glider'], ['Glider', 'Building'], ['Building', 'Writings'], ['Writings', 'Building'], ['Home', 'Writings']])
    expect(graphRows(drawn(graph, null, { columns: 60, rows: 60 }))).toEqual([
      '                        ┌──────┐',
      '                        │ Home │',
      '                        └───┬──┘',
      '                            ├───────┐',
      '                            ▼       │',
      '                       ┌────────┐   │',
      '                       │ Glider │   │',
      '                       └────┬───┘   │',
      '                            │       │',
      '                            ▼       │',
      '                      ┌──────────┐  │',
      '                      │ Building │  │',
      '                      └────┬─────┘  │',
      '                           │ ▲      │',
      '                           ├─┊──────┘',
      '                           ▼ ┊',
      '                      ┌──────┴───┐',
      '                      │ Writings │',
      '                      └──────────┘',
    ])
  })

  test('where two bundles of links must each pass over the other, they step between rows at jogs, and never run into one line', () => {
    const at = (id: string, layer: number) => ({ id, label: id, layer })
    const graph = readGraph({
      nodes: [at('a', 0), at('b', 0), at('c', 0), at('x', 1), at('y', 1), at('z', 1)],
      links: [
        { from: 'a', to: 'y' },
        { from: 'b', to: 'x' },
        { from: 'b', to: 'z' },
        { from: 'c', to: 'y' },
      ],
    })
    expect(graphRows(drawn(graph, null, { columns: 60, rows: 60 }))).toEqual([
      '                 ┌─────┐  ┌─────┐  ┌─────┐',
      '                 │  a  │  │  b  │  │  c  │',
      '                 └──┬──┘  └──┬──┘  └──┬──┘',
      '                    └───┐    │        │',
      '                    ┌───│────┴───┐    │',
      '                    │   └────┬───│────┘',
      '                    │        │   └────┐',
      '                    ▼        ▼        ▼',
      '                 ┌─────┐  ┌─────┐  ┌─────┐',
      '                 │  x  │  │  y  │  │  z  │',
      '                 └─────┘  └─────┘  └─────┘',
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

  test('a label in characters two cells wide takes two cells a character, so its box and its row stay in line', () => {
    const graph = graphOf(['用户服务', '数据库', '✅ Done', '缓存层'], [['用户服务', '数据库'], ['用户服务', '缓存层'], ['数据库', '✅ Done'], ['缓存层', '✅ Done']])
    expect(graphRows(drawn(graph))).toEqual([
      '              ┌──────────┐',
      '              │ 用户服务 │',
      '              └─────┬────┘',
      '              ┌─────┴─────┐',
      '              ▼           ▼',
      '         ┌────────┐  ┌────────┐',
      '         │ 数据库 │  │ 缓存层 │',
      '         └────┬───┘  └────┬───┘',
      '              └─────┬─────┘',
      '                    ▼',
      '               ┌─────────┐',
      '               │ ✅ Done │',
      '               └─────────┘',
    ])
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
      '             │ └┈┈┈┈┈┈┐            │',
      '             └──────┬─┊────────────┘',
      '                    ▼ ┊',
      '                  ┌───┴─┐',
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

/** The ways a line leaves each character it is drawn in. */
const [UP, DOWN, LEFT, RIGHT] = [1, 2, 4, 8]
const WAYS: Readonly<Record<string, number>> = {
  '│': UP | DOWN,
  '┊': UP | DOWN,
  '─': LEFT | RIGHT,
  '┈': LEFT | RIGHT,
  '┌': DOWN | RIGHT,
  '┐': DOWN | LEFT,
  '└': UP | RIGHT,
  '┘': UP | LEFT,
  '├': UP | DOWN | RIGHT,
  '┤': UP | DOWN | LEFT,
  '┬': DOWN | LEFT | RIGHT,
  '┴': UP | LEFT | RIGHT,
  '┼': UP | DOWN | LEFT | RIGHT,
  '▼': UP,
  '▲': DOWN,
}

/** One end of a line, in the channel it is drawn in: the node it stands for there, and whether the line leaves it or reaches it, or with no arrowheads, whether it is above the line or below. */
type Said = { node: string; channel: number; side: 'from' | 'to' | 'above' | 'below' }

/**
 * What a picture says, read the way a person reads it: in each channel, the
 * links its lines make, as `channel from to`. Where boxes and lanes stand is
 * taken from the layout, and every line is read from its characters alone. A
 * line joins every box it leaves at a tick to every box it reaches at an
 * arrowhead; with no arrowheads, every box above it to every box below, or
 * where it meets boxes on one side only, each of them to each. A lane stands
 * for the one link it carries, and a line that meets another's side passes
 * under it. A line the window's edge cuts says nothing of what it was bound
 * for. Also answers where each line ends with nothing to meet it.
 */
function readOff(graph: Graph, layout: Layout, drawing: Drawing, xOf: (place: Place) => number): { links: string[]; loose: string[] } {
  const rows = picture(drawing).slice(0, -1).map(cellsOf)
  const at = (x: number, y: number): string => rows[y]?.[x] ?? ' '
  const isOff = (x: number): boolean => x < 0 || x >= layout.columns
  const ways = new Map<string, number>()
  const ends = new Map<string, Said>()
  const boxAt = new Map<string, { node: string; x: number; y: number; width: number; rows: number; shelf: number }>()
  const lanes = new Set<string>()
  const shelfOf = new Map<string, number>()
  layout.shelves.forEach((shelf, index) => {
    for (const place of shelf.places) {
      const x = xOf(place)
      if ('node' in place.slot) {
        const box = { node: place.slot.node.id, x, y: shelf.top, width: place.width, rows: place.rows, shelf: index }
        shelfOf.set(box.node, index)
        for (let cell = 0; cell < box.width * box.rows; cell += 1) boxAt.set(`${x + (cell % box.width)},${box.y + Math.floor(cell / box.width)}`, box)
        continue
      }
      for (let row = 0; row < shelf.rows; row += 1) lanes.add(`${x},${shelf.top + row}`)
    }
  })
  layout.shelves.forEach((shelf, index) => {
    for (const place of shelf.places) {
      const x = xOf(place)
      if (!('lane' in place.slot) || isOff(x)) continue
      const { lane, isUp } = place.slot
      const [top, bottom] = [`${x},${shelf.top}`, `${x},${shelf.top + shelf.rows - 1}`]
      const [high, low] = (shelfOf.get(lane.from) ?? 0) < (shelfOf.get(lane.to) ?? 0) ? [lane.from, lane.to] : [lane.to, lane.from]
      ways.set(top, UP)
      ways.set(bottom, DOWN)
      if (!graph.isDirected) {
        ends.set(top, { node: low, channel: index - 1, side: 'below' })
        ends.set(bottom, { node: high, channel: index, side: 'above' })
      } else {
        ends.set(top, isUp ? { node: lane.from, channel: index - 1, side: 'from' } : { node: lane.to, channel: index - 1, side: 'to' })
        ends.set(bottom, isUp ? { node: lane.to, channel: index, side: 'to' } : { node: lane.from, channel: index, side: 'from' })
      }
    }
  })
  rows.forEach((row, y) =>
    row.forEach((char, x) => {
      const key = `${x},${y}`
      const box = boxAt.get(key)
      if (lanes.has(key)) return
      if (box !== undefined) {
        if (x === box.x || x === box.x + box.width - 1) return
        if (y === box.y + box.rows - 1 && '┬╤'.includes(char)) {
          ways.set(key, DOWN)
          ends.set(key, { node: box.node, channel: box.shelf, side: graph.isDirected ? 'from' : 'above' })
        } else if (y === box.y && '┴╧'.includes(char)) {
          ways.set(key, UP)
          ends.set(key, { node: box.node, channel: box.shelf - 1, side: graph.isDirected ? 'from' : 'below' })
        }
        return
      }
      if (WAYS[char] === undefined) return
      ways.set(key, WAYS[char])
      const into = boxAt.get(`${x},${char === '▼' ? y + 1 : y - 1}`)
      if (char === '▼' && into !== undefined) ends.set(key, { node: into.node, channel: into.shelf - 1, side: 'to' })
      if (char === '▲' && into !== undefined) ends.set(key, { node: into.node, channel: into.shelf, side: 'to' })
    }),
  )

  const root = new Map([...ways.keys()].map(key => [key, key]))
  const find = (key: string): string => {
    const up = root.get(key) ?? key
    if (up === key) return key
    const top = find(up)
    root.set(key, top)
    return top
  }
  const loose: string[] = []
  const cut = new Set<string>()
  for (const [key, own] of ways) {
    const [x = 0, y = 0] = key.split(',').map(Number)
    const meet = (dx: number, dy: number, back: number): void => {
      let [nx, ny] = [x + dx, y + dy]
      while (dy === 0 && ways.get(`${nx},${ny}`) === (UP | DOWN) && !ends.has(`${nx},${ny}`)) nx += dx
      if (((ways.get(`${nx},${ny}`) ?? 0) & back) !== 0) root.set(find(key), find(`${nx},${ny}`))
      else if (isOff(nx)) cut.add(key)
      else loose.push(`'${at(x, y)}' at ${x},${y}`)
    }
    if (own & RIGHT) meet(1, 0, LEFT)
    if (own & LEFT) meet(-1, 0, RIGHT)
    if (own & DOWN) meet(0, 1, UP)
    if (own & UP) meet(0, -1, DOWN)
  }

  const lines = new Map<string, Said[]>()
  for (const [key, end] of ends) lines.set(find(key), [...(lines.get(find(key)) ?? []), end])
  const isCut = new Set([...cut].map(find))
  const links = new Set<string>()
  for (const [line, said] of lines) {
    const on = (side: Said['side']): string[] => [...new Set(said.filter(end => end.side === side).map(end => end.node))]
    const pairs = graph.isDirected
      ? on('from').flatMap(from => on('to').map(to => [from, to]))
      : on('above').length > 0 && on('below').length > 0
        ? on('above').flatMap(above => on('below').map(below => [above, below].sort()))
        : isCut.has(line)
          ? []
          : [...on('above'), ...on('below')].flatMap((one, index, all) => all.slice(index + 1).map(other => [one, other].sort()))
    for (const [one, other] of pairs) links.add(`${said[0]?.channel} ${one} ${other}`)
  }
  return { links: [...links].sort(), loose }
}

/** The links a picture of a graph laid out so should say: each link, in every channel it crosses. */
function linksOf(graph: Graph, layout: Layout): string[] {
  const shelfOf = new Map(layout.shelves.flatMap((shelf, index) => shelf.places.flatMap(place => ('node' in place.slot ? [[place.slot.node.id, index] as const] : []))))
  return graph.links
    .filter(link => link.from !== link.to)
    .flatMap(link => {
      const [from, to] = [shelfOf.get(link.from) ?? 0, shelfOf.get(link.to) ?? 0]
      const ends = graph.isDirected ? [link.from, link.to] : [link.from, link.to].sort()
      return Array.from({ length: Math.max(1, Math.abs(from - to)) }, (_, step) => `${Math.min(from, to) + step} ${ends.join(' ')}`)
    })
    .sort()
}

describe('what a picture says', () => {
  const next = numbers(31)
  const pick = (below: number): number => Math.floor(next() * below)
  const someGraph = (): Graph => {
    const count = 2 + pick(15)
    const links = Array.from({ length: pick(count * 2 + 2) }, () => [`n${pick(count)}`, `n${pick(count)}`])
    return readGraph({
      nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: [`Validate the request ${index}`, `数据库 ${index}`, `✅ ${index}`][pick(4)] ?? `n${index}` })),
      links: [...links, ...links.filter(() => pick(3) === 0).map(([from, to]) => [to, from])].map(([from = '', to = '']) => ({ from, to })),
      isDirected: pick(4) !== 0,
    })
  }
  const someLook = (scroll = pick(2) === 0 ? 'pinned' : 'sheet'): Look => ({ scroll: scroll as Look['scroll'], labels: pick(3) === 0 ? 'clip' : 'wrap', links: 'separate' })

  test('a graph drawn whole says every link it has, in every channel the link crosses, and no link it does not have', () => {
    for (let run = 0; run < 300; run += 1) {
      const graph = someGraph()
      const look = someLook()
      const columns = viewOf(look).measure(graph, 40 + pick(100)).columns
      const layout = layoutOf(graph, { columns, rows: 0 }, look)
      const drawing = paint(layout, graph, null, { columns, rows: layout.rows + 1 }, ORIGIN)
      const said = readOff(graph, layout, drawing, place => place.x)
      expect(said.loose).toEqual([])
      expect(said.links).toEqual([...new Set(linksOf(graph, layout))])
    }
  })

  test('scrolled anywhere, what a window shows of a graph says no link the graph does not have', () => {
    for (let run = 0; run < 300; run += 1) {
      const graph = someGraph()
      const room = { columns: 40 + pick(60), rows: 1000 }
      const layout = layoutOf(graph, room, someLook('pinned'))
      const at = within({ x: pick(200), y: 0 }, sightOf(layout, room).most)
      const drawing = paint(layout, graph, null, { columns: room.columns, rows: layout.rows + 1 }, at)
      const said = readOff(graph, layout, drawing, place => place.x - slideOf(layout, layout.shelves[place.shelf], at.x))
      expect(said.loose).toEqual([])
      const links = new Set(linksOf(graph, layout))
      expect(said.links.filter(link => !links.has(link))).toEqual([])
    }
  })
})

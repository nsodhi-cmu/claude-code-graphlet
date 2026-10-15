import { describe, expect, test } from 'claude-code/testing'

import { LOOK, SHOP, cellsOf, graphOf, graphRows, numbers, picture, undirected } from './fixture'
import type { GraphletLink } from '../types'
import { BEATS, piecesOf } from '../hooks/draw'
import type { Drawing, Hit, Span } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import { labelOf, layoutOf } from '../hooks/layout'
import type { Layout, Look, Place } from '../hooks/layout'
import { paint } from '../hooks/paint'
import { viewOf } from '../hooks/view'
import { sightOf, slideOf } from '../hooks/window'

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

  test('a link\'s label is written beside the port it leaves its box by, each port far enough from the next for its label, and lit with its link', () => {
    const graph = readGraph({
      nodes: ['Read', 'Valid?', 'Save', 'Ask again'].map(id => ({ id, label: id })),
      links: [
        { from: 'Read', to: 'Valid?' },
        { from: 'Valid?', to: 'Save', label: 'yes' },
        { from: 'Valid?', to: 'Ask again', label: 'no' },
        { from: 'Ask again', to: 'Read', label: 'retry' },
      ],
    })
    expect(graphRows(drawn(graph, null, { columns: 50, rows: 60 }))).toEqual([
      '                 ┌──────┐',
      '                 │ Read │',
      '                 └──┬───┘',
      '                    │ ▲',
      '                    │ └┈┈┈┈┐',
      '                    ▼      ┊',
      '               ┌────────┐  ┊',
      '               │ Valid? │  ┊',
      '               └┬────┬──┘  ┊',
      '                │yes │no   ┊',
      '                └┐   └───┐ ┊',
      '                 ▼       ▼ ┊retry',
      '             ┌──────┐  ┌───┴───────┐',
      '             │ Save │  │ Ask again │',
      '             └──────┘  └───────────┘',
    ])
    const lit = drawn(graph, 'Valid?', { columns: 50, rows: 60 })
    expect([...spansWith(lit, 'yes'), ...spansWith(lit, 'no'), ...spansWith(lit, 'retry')].map(span => span.paint)).toEqual(['accent', 'accent', 'plain'])
  })

  test('links past a layer from one node run down one lane beside that layer\'s boxes, which branches where each of them leaves it', () => {
    const graph = graphOf(['A', 'B', 'C', 'D', 'E'], [['A', 'B'], ['B', 'C'], ['A', 'C'], ['C', 'D'], ['A', 'D'], ['B', 'E'], ['E', 'D']])
    expect(graphRows(drawn(graph))).toEqual([
      '              ┌─────┐',
      '              │  A  │',
      '              └──┬──┘',
      '                 ├────────┐',
      '                 ▼        │',
      '              ┌─────┐     │',
      '              │  B  │     │',
      '              └──┬──┘     │',
      '             ┌───┴───┐ ┌──┴─┐',
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

  test('in a graph of both kinds, a link that runs one way ends at an arrowhead, one that runs no way meets both its boxes at ticks, and the two never share a line', () => {
    const home = readGraph({
      nodes: ['Modem', 'Router', 'Laptop', 'TV', 'NAS'].map(id => ({ id, label: id })),
      links: [
        { from: 'Modem', to: 'Router', isDirected: false },
        { from: 'Router', to: 'Laptop', isDirected: false },
        { from: 'Router', to: 'TV', isDirected: false },
        { from: 'Router', to: 'NAS', isDirected: false },
        { from: 'Laptop', to: 'NAS', label: 'backup' },
      ],
    })
    expect(graphRows(drawn(home, null, { columns: 60, rows: 40 }))).toEqual([
      '                         ┌───────┐',
      '                         │ Modem │',
      '                         └───┬───┘',
      '                             │',
      '                        ┌────┴───┐',
      '                        │ Router │',
      '                        └────┬───┘',
      '                        ┌────┴────┬─────┐',
      '                   ┌────┴───┐  ┌──┴──┐  │',
      '                   │ Laptop │  │ TV  │  │',
      '                   └┬───────┘  └─────┘  │',
      '                    │backup             │',
      '                    │ ┌─────────────────┘',
      '                    ▼ │',
      '                  ┌───┴─┐',
      '                  │ NAS │',
      '                  └─────┘',
    ])
  })

  test('two links between the same two nodes with different labels are two lines, each with its label and its own arrowhead', () => {
    const graph = readGraph({
      nodes: ['Idle', 'Running'].map(id => ({ id, label: id })),
      links: [
        { from: 'Idle', to: 'Running', label: 'start' },
        { from: 'Idle', to: 'Running', label: 'resume' },
        { from: 'Running', to: 'Idle', label: 'done' },
      ],
    })
    expect(graphRows(drawn(graph))).toEqual([
      '           ┌────────────────┐',
      '           │      Idle      │',
      '           └┬──────┬────────┘',
      '            │start │resume ▲',
      '            └────┐ │ ┌┈┈┈┈┈┘',
      '                 ▼ ▼ ┊done',
      '                ┌────┴────┐',
      '                │ Running │',
      '                └─────────┘',
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
    expect(drawing.rows[4]?.filter(span => span.text.trim() === '▼').map(span => span.paint)).toEqual(['dim', 'accent'])
    expect(drawing.rows[5]?.filter(span => span.text.trim() !== '').map(span => span.paint)).toEqual(['bad', 'accent', 'dim', 'warn'])
    expect(drawing.rows[8]?.filter(span => span.text.trim() !== '').map(span => [span.text.trim().length, span.paint])).toEqual([
      [19, 'dim'],
      [9, 'accent'],
      [24, 'dim'],
    ])
    expect(spansWith(drawing, '┌────────────┐').at(-1)?.paint).toBe('accent')
    expect(spansWith(drawing, '● cart.ts').map(span => span.paint)).toEqual(['bad'])
  })

  test('where a link leaves a box, the border shows it in the border\'s own paint, lit or not', () => {
    expect(drawing.rows[7]?.filter(span => span.text.trim() !== '').map(span => span.paint)).toEqual(['bad', 'accent', 'dim', 'warn'])
    expect(drawing.rows[12]?.filter(span => span.text.trim() !== '').map(span => span.paint)).toEqual(['accent'])
  })

  test('a badge is dim, apart from the label it follows', () => {
    const money = drawn(SHOP, 'src/money.ts', WHOLE)
    expect(money.rows[16]?.filter(span => span.text.trim() !== '').slice(1, 3)).toEqual([
      { text: '→ money.ts', paint: 'dim', isBold: true, isInverse: true },
      { text: '  2 ', paint: 'dim' },
    ])
  })

  test('a link back up is lit along its whole way, through the lane it passes in', () => {
    const loop = drawn(graphOf(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]), 'C')
    expect(spansWith(loop, '┊').every(span => span.paint === 'accent')).toBe(true)
    expect(spansWith(loop, '▲')).toEqual([{ text: '▲', paint: 'accent' }])
  })
})

describe('lines that flow', () => {
  /** The picture with each cell that is a bead at `step` of the flow drawn as `•`. */
  const beadsAt = (drawing: Drawing, step: number): string[] =>
    graphRows({
      ...drawing,
      rows: drawing.rows.map(row =>
        row.flatMap(span => piecesOf(span, step).map(piece => ({ ...span, text: piece.glow === 'bright' ? '•'.repeat(cellsOf(piece.text).length) : piece.text }))),
      ),
    })
  const loop = graphOf(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']])
  const flowing = viewOf({ ...LOOK, motion: 'flowing' })

  test('flowing, a lit line has a bead every few cells, and at each step of the flow the beads move on a cell the way the link runs: down, along, and back up', () => {
    const drawing = flowing.draw(loop, 'C', SMALL, ORIGIN)
    expect(beadsAt(drawing, 0)).toEqual([
      '                ┌─────┐',
      '                │  A  │',
      '                └─┬───┘',
      '                  │ ▲',
      '                  │ •┈┈┈•',
      '                  ▼     ┊',
      '               ┌─────┐  ┊',
      '               │  B  │  ┊',
      '               └──┬──┘  •',
      '                  │ ┌┈┈┈┘',
      '                  ▼ ┊',
      '                ╔═══╧═╗',
      '                ║  C  ║',
      '                ╚═════╝',
    ])
    expect(beadsAt(drawing, 1)).toEqual([
      '                ┌─────┐',
      '                │  A  │',
      '                └─┬───┘',
      '                  │ ▲',
      '                  │ └┈┈•┐',
      '                  ▼     ┊',
      '               ┌─────┐  ┊',
      '               │  B  │  •',
      '               └──┬──┘  ┊',
      '                  • ┌•┈┈┘',
      '                  ▼ ┊',
      '                ╔═══╧═╗',
      '                ║  C  ║',
      '                ╚═════╝',
    ])
    expect(beadsAt(drawing, BEATS)).toEqual(beadsAt(drawing, 0))
  })

  test('a lit link with no direction, and a lit link with another running back, pulse whole instead, brightening and fading at once', () => {
    const glows = (drawing: Drawing, step: number): string[] => drawing.rows.flatMap(row => row.filter(span => span.isPulsing).flatMap(span => piecesOf(span, step).map(piece => piece.glow)))
    const friends = flowing.draw(undirected(loop), 'C', SMALL, ORIGIN)
    expect(friends.rows.flat().some(span => span.beat !== undefined)).toBe(false)
    expect([0, 1, 2, 3].map(step => [...new Set(glows(friends, step))])).toEqual([['dim'], ['plain'], ['bright'], ['plain']])
    const both = flowing.draw(graphOf(['A', 'B', 'C'], [['A', 'B'], ['B', 'A'], ['B', 'C']]), 'B', SMALL, ORIGIN)
    expect(both.rows.flat().some(span => span.isPulsing)).toBe(true)
    expect(both.rows.flat().some(span => span.beat !== undefined)).toBe(true)
  })

  test('a lane flows where a lit link it carries flows, though links it carries that are not lit run both ways', () => {
    const graph = readGraph({
      nodes: [['a', 0], ['b', 0], ['x', 1], ['y', 2], ['d', 3]].map(([id, layer]) => ({ id: String(id), label: String(id), layer: Number(layer) })),
      links: [['a', 'x'], ['x', 'y'], ['y', 'd'], ['a', 'd'], ['b', 'd'], ['d', 'b']].map(([from = '', to = '']) => ({ from, to })),
    })
    const drawing = flowing.draw(graph, 'a', SMALL, ORIGIN)
    expect(drawing.rows.flat().some(span => span.isPulsing)).toBe(false)
    expect(drawing.rows.flat().some(span => span.beat !== undefined)).toBe(true)
  })

  test('nothing moves that is not lit, nor with the lines still', () => {
    const moving = (drawing: Drawing): number => drawing.rows.flat().filter(span => span.beat !== undefined || span.isPulsing).length
    expect(moving(flowing.draw(loop, null, SMALL, ORIGIN))).toBe(0)
    expect(moving(drawn(loop, 'C'))).toBe(0)
    expect(moving(drawn(undirected(loop), 'C'))).toBe(0)
    expect(flowing.draw(loop, 'A', SMALL, ORIGIN).rows.flat().every(span => (span.beat === undefined && !span.isPulsing) || span.paint === 'accent')).toBe(true)
  })
})

describe('what the window does not show', () => {
  const graph = graphOf(
    ['Checkout', 'Cart', 'Payments', 'Shipping', 'Receipts', 'Ledger'],
    [['Checkout', 'Cart'], ['Checkout', 'Payments'], ['Checkout', 'Shipping'], ['Checkout', 'Receipts'], ['Payments', 'Ledger'], ['Receipts', 'Ledger']],
  )
  const room = { columns: 40, rows: 8 }
  const shown = (selected: string): Drawing => {
    const view = viewOf(LOOK)
    return view.draw(graph, selected, room, view.show(graph, selected, room, ORIGIN))
  }

  test('a node joined to the selected one that the window does not show is named at the edge it lies past, over nothing but unlit lines and blanks, and a click on its name selects it', () => {
    const checkout = shown('Checkout')
    expect(graphRows(checkout)).toEqual([
      '              ╔══════════╗',
      '              ║ Checkout ║',
      '              ╚═╤═══╤════╝    Receipts ▸',
      '    ┌───────────┼───┴─────────┬─────────',
      '    ▼           ▼             ▼',
      '┌──────┐  ┌──────────┐  ┌──────────┐  ┌─',
      '│ Cart │  │ Payments │  │ Shipping │  │…',
    ])
    expect(checkout.hits[0]).toEqual({ node: 'Receipts', x: 30, y: 2, width: 10, height: 1 })
    const payments = shown('Payments')
    expect(graphRows(payments)).toEqual([
      '    ┌───────────┼ ▴ Checkout ─┬─────────',
      '    ▼           ▼             ▼',
      '┌──────┐  ╔══════════╗  ┌──────────┐  ┌─',
      '│ Cart │  ║ Payments ║  │ Shipping │  │…',
      '└──────┘  ╚═════╤════╝  └──────────┘  └─',
      '                └───┬───────────────────',
      '           ▾ Ledger ▼',
    ])
    expect(spansWith(payments, '▴ Checkout').map(span => span.paint)).toEqual(['accent'])
    expect(boxes(payments).slice(0, 2).map(hit => hit.node)).toEqual(['Checkout', 'Ledger'])
  })

  test('a box the edge cuts down to its border and an ellipsis shows none of its label, and its node is named', () => {
    const shorter = graphOf(
      ['Checkout', 'Car', 'Payments', 'Shipping', 'Receipts', 'Ledger'],
      [['Checkout', 'Car'], ['Checkout', 'Payments'], ['Checkout', 'Shipping'], ['Checkout', 'Receipts'], ['Payments', 'Ledger'], ['Receipts', 'Ledger']],
    )
    const view = viewOf(LOOK)
    const rows = graphRows(view.draw(shorter, 'Checkout', room, view.show(shorter, 'Checkout', room, ORIGIN)))
    expect(rows.filter(row => row.endsWith('│ …') || row.endsWith('Receipts ▸'))).toHaveLength(2)
  })

  test('a node the window shows, and any node while the selected one is out of view, is not named', () => {
    expect(boxes(viewOf(LOOK).draw(graph, 'Payments', WHOLE, ORIGIN)).map(hit => hit.node)).toEqual(graph.nodes.map(node => node.id))
    expect(boxes(viewOf(LOOK).draw(graph, 'Ledger', room, ORIGIN)).map(hit => hit.node)).toEqual(['Checkout', 'Cart', 'Payments', 'Shipping', 'Receipts'])
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
 * for. Also answers where each line ends with nothing to meet it, and each
 * label that is not where it should be: the words beside a tick, in the row
 * past the box, are written on that line for each node it reaches, and
 * between any two nodes the labels written so must be the labels of the
 * links between them, one for one, and a link's label must be written beside
 * a tick of the node it leaves. Through a window, which may cut a label or
 * leave its box out of view, the words beside a tick need only start the
 * label of a link between the two; and beside a line the edge cuts with no
 * arrowhead left in view, which may run either way or none, they need only
 * start the label of a link of that node.
 */
function readOff(
  graph: Graph,
  layout: Layout,
  drawing: Drawing,
  xOf: (place: Place) => number,
  isWindow = false,
): { links: string[]; loose: string[]; labels: string[] } {
  const rows = picture(drawing).slice(0, -1).map(cellsOf)
  const at = (x: number, y: number): string => rows[y]?.[x] ?? ' '
  const isOff = (x: number): boolean => x < 0 || x >= layout.columns
  const ways = new Map<string, number>()
  const ends = new Map<string, Said[]>()
  const boxAt = new Map<string, { node: string; x: number; y: number; width: number; rows: number; shelf: number }>()
  const lanes = new Set<string>()
  const shelfOf = new Map<string, number>()
  /** The words written from a cell on, up to the next line. */
  const wordsAt = (x: number, y: number): string => {
    let words = ''
    for (let at = x; at < (rows[y]?.length ?? 0) && WAYS[at < 0 ? ' ' : (rows[y]?.[at] ?? ' ')] === undefined; at += 1) words += rows[y]?.[at] ?? ''
    return words.trim()
  }
  const written = new Map<string, { node: string; text: string }>()
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
      const highOf = (link: GraphletLink): [string, string] =>
        (shelfOf.get(link.from) ?? 0) < (shelfOf.get(link.to) ?? 0) ? [link.from, link.to] : [link.to, link.from]
      ways.set(top, UP)
      ways.set(bottom, DOWN)
      if (lane.every(link => !link.isDirected)) {
        ends.set(top, lane.map(link => ({ node: highOf(link)[1], channel: index - 1, side: 'below' as const })))
        ends.set(bottom, lane.map(link => ({ node: highOf(link)[0], channel: index, side: 'above' as const })))
      } else {
        ends.set(top, lane.map(link => (isUp ? { node: link.from, channel: index - 1, side: 'from' as const } : { node: link.to, channel: index - 1, side: 'to' as const })))
        ends.set(bottom, lane.map(link => (isUp ? { node: link.to, channel: index, side: 'to' as const } : { node: link.from, channel: index, side: 'from' as const })))
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
          ends.set(key, [{ node: box.node, channel: box.shelf, side: 'above' }])
          written.set(key, { node: box.node, text: wordsAt(x + 1, y + 1) })
        } else if (y === box.y && '┴╧'.includes(char)) {
          ways.set(key, UP)
          ends.set(key, [{ node: box.node, channel: box.shelf - 1, side: 'below' }])
          written.set(key, { node: box.node, text: wordsAt(x + 1, y - 1) })
        }
        return
      }
      if (WAYS[char] === undefined) return
      ways.set(key, WAYS[char])
      const into = boxAt.get(`${x},${char === '▼' ? y + 1 : y - 1}`)
      if (char === '▼' && into !== undefined) ends.set(key, [{ node: into.node, channel: into.shelf - 1, side: 'to' }])
      if (char === '▲' && into !== undefined) ends.set(key, [{ node: into.node, channel: into.shelf, side: 'to' }])
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
  for (const [key, said] of ends) lines.set(find(key), [...(lines.get(find(key)) ?? []), ...said])
  /** The lines that run one way: those with an arrowhead, or a lane of links that do. Their ticks are where they leave. */
  const isOneWay = new Set([...lines].filter(([, said]) => said.some(end => end.side === 'to' || end.side === 'from')).map(([line]) => line))
  for (const [line, said] of lines) if (isOneWay.has(line)) lines.set(line, said.map(end => (end.side === 'above' || end.side === 'below' ? { ...end, side: 'from' as const } : end)))
  const isCut = new Set([...cut].map(find))
  const links = new Set<string>()
  const labels: string[] = []
  /** Who a label stands between: the node it is written beside and the node a line from there reaches, either way round where the line runs no way. */
  const pairOf = (node: string, other: string, isDirected: boolean): string => JSON.stringify(isDirected ? [true, node, other] : [false, ...[node, other].sort()])
  const linkLabels = new Map<string, string[]>()
  for (const link of graph.links.filter(one => one.from !== one.to && labelOf(one) !== '')) {
    const pair = pairOf(link.from, link.to, link.isDirected)
    linkLabels.set(pair, [...(linkLabels.get(pair) ?? []), labelOf(link)])
  }
  const writtenLabels = new Map<string, string[]>()
  for (const [key, { node, text }] of written) {
    const own = ends.get(key)?.[0]
    if (text === '' || own === undefined) continue
    const said = lines.get(find(key)) ?? []
    const isDirected = isOneWay.has(find(key))
    if (!isDirected && isCut.has(find(key))) {
      const isOwn = graph.links.some(link => (link.from === node || link.to === node) && labelOf(link).startsWith(text))
      if (!isOwn) labels.push(`'${text}' beside ${node}, which has no link labelled so`)
      continue
    }
    const across = said.filter(end => (isDirected ? end.side === 'to' : end.side !== own.side))
    for (const other of new Set((across.length > 0 || isDirected ? across : said).map(end => end.node).filter(one => one !== node))) {
      const pair = pairOf(node, other, isDirected)
      if (isWindow && !(linkLabels.get(pair) ?? []).some(label => label.startsWith(text))) labels.push(`'${text}' beside ${node}, on a line to ${other} with no such label`)
      writtenLabels.set(pair, [...(writtenLabels.get(pair) ?? []), text])
    }
  }
  if (!isWindow) {
    for (const pair of new Set([...linkLabels.keys(), ...writtenLabels.keys()])) {
      const [had, said] = [(linkLabels.get(pair) ?? []).toSorted(), (writtenLabels.get(pair) ?? []).toSorted()]
      if (JSON.stringify(had) !== JSON.stringify(said)) labels.push(`between ${pair}, labels ${JSON.stringify(said)} are written for links labelled ${JSON.stringify(had)}`)
    }
  }
  if (!isWindow) {
    for (const link of graph.links) {
      const label = labelOf(link)
      const isBeside = [...written.values()].some(({ node, text }) => text === label && (node === link.from || (!link.isDirected && node === link.to)))
      if (label !== '' && link.from !== link.to && !isBeside) labels.push(`'${label}' of ${link.from} to ${link.to} is written nowhere beside it`)
    }
  }
  for (const [line, said] of lines) {
    const on = (side: Said['side']): string[] => [...new Set(said.filter(end => end.side === side).map(end => end.node))]
    const pairs = isOneWay.has(line)
      ? on('from').flatMap(from => on('to').map(to => `${from} ${to}`))
      : (on('above').length > 0 && on('below').length > 0
          ? on('above').flatMap(above => on('below').map(below => [above, below]))
          : isCut.has(line)
            ? []
            : [...on('above'), ...on('below')].flatMap((one, index, all) => all.slice(index + 1).map(other => [one, other]))
        ).map(ends => ends.sort().join(' -- '))
    for (const pair of pairs) links.add(`${said[0]?.channel} ${pair}`)
  }
  return { links: [...links].sort(), loose, labels }
}

/** The links a picture of a graph laid out so should say: each link, in every channel it crosses. */
function linksOf(graph: Graph, layout: Layout): string[] {
  const shelfOf = new Map(layout.shelves.flatMap((shelf, index) => shelf.places.flatMap(place => ('node' in place.slot ? [[place.slot.node.id, index] as const] : []))))
  return graph.links
    .filter(link => link.from !== link.to)
    .flatMap(link => {
      const [from, to] = [shelfOf.get(link.from) ?? 0, shelfOf.get(link.to) ?? 0]
      const ends = link.isDirected ? `${link.from} ${link.to}` : [link.from, link.to].sort().join(' -- ')
      return Array.from({ length: Math.max(1, Math.abs(from - to)) }, (_, step) => `${Math.min(from, to) + step} ${ends}`)
    })
    .sort()
}

describe('what a picture says', () => {
  const next = numbers(31)
  const pick = (below: number): number => Math.floor(next() * below)
  const nameOf = (index: number): string => [`Validate the request ${index}`, `数据库 ${index}`, `✅ ${index}`][pick(4)] ?? `n${index}`
  /** A link's own direction, now and then, so that a graph has links of both kinds. */
  const someWay = (): { isDirected?: boolean } => (pick(4) === 0 ? { isDirected: pick(2) === 0 } : {})
  /** A label for a link, now and then. */
  const someLabel = (): { label?: string } => (pick(3) === 0 ? { label: ['yes', 'no', 'retry', '数据', 'GET /items', 'a much longer label than fits'][pick(6)] ?? 'x' } : {})
  /** A graph of any shape, its links often running both ways. */
  const someGraph = (): Graph => {
    const count = 2 + pick(15)
    const links = Array.from({ length: pick(count * 2 + 2) }, () => [`n${pick(count)}`, `n${pick(count)}`])
    return readGraph({
      nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: nameOf(index) })),
      links: [...links, ...links.filter(() => pick(3) === 0).map(([from, to]) => [to, from])].map(([from = '', to = '']) => ({ from, to, ...someLabel(), ...someWay() })),
      isDirected: pick(4) !== 0,
    })
  }
  /** A graph in two or three layers it names, few nodes over many and densely linked, which is where bundles most often ask to pass over each other. */
  const crowdedGraph = (): Graph => {
    const count = 4 + pick(10)
    return readGraph({
      nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: nameOf(index), layer: index < 2 ? 0 : pick(2 + pick(2)) })),
      links: Array.from({ length: count + pick(count) }, () => ({ from: `n${pick(count)}`, to: `n${pick(count)}`, ...someLabel(), ...someWay() })),
      isDirected: pick(5) !== 0,
    })
  }
  /** Two layers facing each other, linked both ways. */
  const facingGraph = (): Graph => {
    const [top, bottom] = [2 + pick(3), 2 + pick(4)]
    return readGraph({
      nodes: [
        ...Array.from({ length: top }, (_, index) => ({ id: `t${index}`, label: nameOf(index), layer: 0 })),
        ...Array.from({ length: bottom }, (_, index) => ({ id: `b${index}`, label: nameOf(index), layer: 1 })),
      ],
      links: Array.from({ length: top + bottom + pick(top * bottom) }, () =>
        pick(2) === 0 ? { from: `t${pick(top)}`, to: `b${pick(bottom)}`, ...someLabel() } : { from: `b${pick(bottom)}`, to: `t${pick(top)}`, ...someLabel() },
      ),
    })
  }
  const anyGraph = (run: number): Graph => [someGraph, crowdedGraph, facingGraph][run % 3]?.() ?? someGraph()
  const someLook = (scroll = pick(2) === 0 ? 'pinned' : 'sheet'): Look => ({ scroll: scroll as Look['scroll'], labels: pick(3) === 0 ? 'clip' : 'wrap', links: 'separate', motion: 'still' })

  /** How long a test that reads many pictures may take: a slow machine's while. */
  const READING = { timeoutMs: 30_000 }

  test('a graph drawn whole, or folded into a room, says every link it has, in every channel the link crosses, and no link it does not have', READING, () => {
    for (let run = 0; run < 900; run += 1) {
      const graph = anyGraph(run)
      const look = someLook()
      const laid = layoutOf(graph, { columns: 40 + pick(100), rows: 0 }, look, pick(2) === 0)
      const columns = Math.max(laid.columns, ...laid.shelves.map(shelf => shelf.across))
      const layout = { ...laid, columns }
      const drawing = paint(layout, graph, null, { columns, rows: layout.rows + 1 }, ORIGIN)
      const said = readOff(graph, layout, drawing, place => place.x - slideOf(layout, layout.shelves[place.shelf], 0))
      expect(said.loose).toEqual([])
      expect(said.labels).toEqual([])
      expect(said.links).toEqual([...new Set(linksOf(graph, layout))])
    }
  })

  test('merged, a labeled link with no direction between two nodes of one layer keeps a line of its own', () => {
    const graph = undirected(graphOf(['r', 'a', 'b', 'c'], [['r', 'a'], ['r', 'b'], ['a', 'c']]))
    const labeled = readGraph({ ...graph, links: [...graph.links, { from: 'a', to: 'b', isDirected: false, label: 'go' }].map(link => (link.from === 'a' && link.to === 'c' ? { ...link, label: 'go' } : link)) })
    const look: Look = { ...LOOK, links: 'merged' }
    const layout = layoutOf(labeled, { columns: 60, rows: 0 }, look)
    expect(readOff(labeled, layout, paint(layout, labeled, null, { columns: 60, rows: layout.rows + 1 }, ORIGIN), place => place.x).labels).toEqual([])
  })

  test('merged, where the links between two layers share one row, every label still stands beside links it is true of', READING, () => {
    for (let run = 0; run < 400; run += 1) {
      const graph = anyGraph(run)
      const look: Look = { ...someLook(), links: 'merged' }
      const columns = viewOf(look).measure(graph, 40 + pick(100)).columns
      const layout = layoutOf(graph, { columns, rows: 0 }, look)
      const said = readOff(graph, layout, paint(layout, graph, null, { columns, rows: layout.rows + 1 }, ORIGIN), place => place.x)
      expect(said.loose).toEqual([])
      expect(said.labels).toEqual([])
    }
  })

  test('scrolled to any column, a window lays its links within the rows each channel has, and says no link the graph does not have', READING, () => {
    for (let run = 0; run < 60; run += 1) {
      const graph = anyGraph(run)
      const room = { columns: 40 + pick(30), rows: 1000 }
      const layout = layoutOf(graph, room, someLook('pinned'))
      const links = new Set(linksOf(graph, layout))
      for (let x = 0; x <= sightOf(layout, room).most.x; x += 1) {
        const drawing = paint(layout, graph, null, { columns: room.columns, rows: layout.rows + 1 }, { x, y: 0 })
        for (const channel of layout.channels) {
          const tracks = channel.rows - Number(channel.hasTopRow) - Number(channel.hasBottomRow)
          for (const wire of channel.wires) expect(Math.max(wire.track, wire.jog?.track ?? 0)).toBeLessThan(Math.max(1, tracks))
        }
        const said = readOff(graph, layout, drawing, place => place.x - slideOf(layout, layout.shelves[place.shelf], x), true)
        expect(said.loose).toEqual([])
        expect(said.labels).toEqual([])
        expect(said.links.filter(link => !links.has(link))).toEqual([])
      }
    }
  })
})

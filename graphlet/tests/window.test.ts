import { describe, expect, test } from 'claude-code/testing'

import type { GraphletMove } from '../types'
import { LOOK, SHOP, graphOf, picture } from './fixture'
import type { Hit, Pan } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import { viewOf } from '../hooks/view'

const pinned = viewOf(LOOK)
const sheet = viewOf({ ...LOOK, scroll: 'sheet' })

const ORIGIN: Pan = { x: 0, y: 0 }
/** A room the shop fits whole, one too narrow for its longest layer, and one too short for its layers. */
const WHOLE = { columns: 90, rows: 40 }
const NARROW = { columns: 44, rows: 40 }
const SHORT = { columns: 90, rows: 12 }

/** One node with `count` nodes that link to it. */
const wide = (count: number): Graph => {
  const users = Array.from({ length: count }, (_, index) => `user${index}`)
  return graphOf(['core', ...users], users.map(user => [user, 'core']))
}

describe('how much room a graph needs', () => {
  test('the rows it takes drawn whole, and the columns its longest layer is laid out across', () => {
    expect(pinned.measure(SHOP, 90)).toEqual({ columns: 90, rows: 19 })
    expect(sheet.measure(SHOP, 44)).toEqual({ columns: 64, rows: 19 })
  })
})

describe('a layer longer than the room', () => {
  test('it keeps its order and runs off the edge, where a cut box ends in an ellipsis and a row counts the nodes out of view', () => {
    expect(picture(pinned.draw(SHOP, 'src/ui.ts', NARROW, ORIGIN))).toEqual([
      ' ┌───────────────┐  ┌────────────────────┐',
      ' │ ○ checkout.ts │  │ ○ pages/invoice.ts │',
      ' └────┬──────────┘  └────┬───────────────┘',
      '      │                  │',
      '      │                  │',
      '      │                  │',
      '      ▼                  ▼',
      '┌───────────┐  ┌──────────────────┐  ╔══════',
      '│ ● cart.ts │  │ ● src/invoice.ts │  ║ ○ ui…',
      '└─────┬─────┘  └──────┬───────────┘  ╚════╤═',
      '      └───────────────┼───────────────────┴─',
      '                      ▼',
      '               ┌────────────┐',
      '               │ ◆ price.ts │',
      '               └──────┬─────┘',
      '                      │',
      '                      ▼',
      '              ┌───────────────┐',
      '              │ → money.ts  2 │',
      '              └───────────────┘',
      '                     2 more →  copy · html ↗',
    ])
  })

  test('scrolled, it slides under the window while the layers that fit stay where they are, and each link to it keeps a row of its own', () => {
    const start = picture(pinned.draw(SHOP, 'src/email.ts', NARROW, ORIGIN))
    const end = picture(pinned.draw(SHOP, 'src/email.ts', NARROW, { x: 20, y: 0 }))
    expect(end.slice(2, 10)).toEqual([
      ' └───────┬───────┘  └──────────┬─────────┘',
      '─────────┘                     │',
      '     ┌─────────────────────────┘',
      '     │',
      '     ▼',
      '──────────────┐  ┌─────────┐  ╔════════════╗',
      '…c/invoice.ts │  │ ○ ui.ts │  ║ ▲ email.ts ║',
      '─────┬────────┘  └────┬────┘  ╚══════╤═════╝',
    ])
    expect(end.at(-1)).toBe('← 2 more                       copy · html ↗')
    for (const row of [1, 12, 17]) expect(end[row]).toBe(start[row])
  })

  test('the links between a layer that fits and one that has slid are given their rows again as they now stand, so they never run into one line', () => {
    const graph = readGraph({
      nodes: [
        ...['A', 'B'].map(id => ({ id, label: id, layer: 0 })),
        ...Array.from({ length: 8 }, (_, index) => ({ id: `c${index + 1}`, label: `c${index + 1}`, layer: 1 })),
      ],
      links: [
        { from: 'A', to: 'c4' },
        { from: 'B', to: 'c5' },
      ],
    })
    const room = { columns: 52, rows: 10 }
    expect(picture(pinned.draw(graph, 'c8', room, pinned.show(graph, 'c8', room, ORIGIN))).slice(1, 6)).toEqual([
      '                  └──┬──┘  └──┬──┘',
      '            ┌────────┘        │',
      '            │        ┌────────┘',
      '            │        │',
      '            ▼        ▼',
    ])
  })

  test('which nodes a window shows, and where, does not depend on which of them is selected', () => {
    const graph = wide(12)
    const room = { columns: 60, rows: 40 }
    const places = (selected: string): Array<[number, number, number]> => {
      const drawing = pinned.draw(graph, selected, room, { x: 30, y: 0 })
      const isName = (hit: Hit): boolean => /^[▴▾◂]|▸$/u.test((picture(drawing)[hit.y] ?? '').slice(hit.x, hit.x + hit.width))
      return drawing.hits.flatMap(hit => ('node' in hit && !isName(hit) ? [[hit.x, hit.y, hit.width] as [number, number, number]] : []))
    }
    expect(places('user11')).toEqual(places('user0'))
    expect(places('core')).toEqual(places('user0'))
  })

  test('a window that shows the selected box whole stays where it is, though the box stands at its edge', () => {
    expect(pinned.show(SHOP, 'src/ui.ts', NARROW, { x: 4, y: 0 })).toEqual({ x: 4, y: 0 })
    expect(picture(pinned.draw(SHOP, 'src/ui.ts', NARROW, { x: 4, y: 0 }))[8]).toBe(
      '…art.ts │  │ ● src/invoice.ts │  ║ ○ ui.ts ║',
    )
  })

  test('the window moves no farther than it must to show the selected node and the start of the one past it', () => {
    const shownFor = (id: string, from: number): Pan => pinned.show(SHOP, id, NARROW, { x: from, y: 0 })
    expect(shownFor('src/cart.ts', 0)).toEqual({ x: 0, y: 0 })
    expect(shownFor('src/ui.ts', 0)).toEqual({ x: 10, y: 0 })
    expect(shownFor('src/email.ts', 0)).toEqual({ x: 20, y: 0 })
    expect(shownFor('src/invoice.ts', 5)).toEqual({ x: 5, y: 0 })
    expect(shownFor('src/invoice.ts', 20)).toEqual({ x: 9, y: 0 })
    expect(shownFor('src/cart.ts', 20)).toEqual({ x: 0, y: 0 })
  })

  test('a node in a layer that fits is in view wherever the window stands, so selecting it moves nothing', () => {
    expect(pinned.show(SHOP, 'src/price.ts', NARROW, { x: 17, y: 0 })).toEqual({ x: 17, y: 0 })
    expect(pinned.show(SHOP, 'src/pages/checkout.ts', NARROW, { x: 17, y: 0 })).toEqual({ x: 17, y: 0 })
  })

  test('a click on a count scrolls most of a room that way, and no farther than the graph goes', () => {
    const count = pinned.draw(SHOP, 'src/ui.ts', NARROW, ORIGIN).hits.find((hit): hit is Hit & { by: Pan } => 'by' in hit)
    expect(count).toEqual({ x: 21, y: 20, width: 8, height: 1, by: { x: 28, y: 0 } })
    expect(pinned.scroll(SHOP, NARROW, ORIGIN, { x: 28, y: 0 })).toEqual({ x: 20, y: 0 })
    expect(pinned.scroll(SHOP, NARROW, { x: 20, y: 0 }, { x: -28, y: 0 })).toEqual(ORIGIN)
  })

  test('the wheel goes along a graph that is longer than the room, and down one that is taller', () => {
    expect(pinned.scroll(SHOP, NARROW, ORIGIN, 1)).toEqual({ x: 8, y: 0 })
    expect(pinned.scroll(SHOP, NARROW, { x: 8, y: 0 }, -1)).toEqual(ORIGIN)
    expect(pinned.scroll(SHOP, NARROW, ORIGIN, 9)).toEqual({ x: 20, y: 0 })
    expect(pinned.scroll(SHOP, SHORT, ORIGIN, 1)).toEqual({ x: 0, y: 2 })
    expect(pinned.scroll(SHOP, WHOLE, ORIGIN, 3)).toEqual(ORIGIN)
  })

  test('nothing is drawn past the room, every hit lies in it, and no two boxes share a cell, at any width and wherever the window stands', () => {
    const loops = graphOf(['A', 'B', 'C', 'D', 'E', 'F', 'G'], [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E'], ['E', 'B'], ['D', 'F'], ['F', 'G'], ['G', 'A'], ['C', 'F'], ['D', 'D']])
    const graphs: Array<[Graph, string]> = [
      [SHOP, 'src/email.ts'],
      [wide(1), 'core'],
      [wide(25), 'user12'],
      [loops, 'D'],
    ]
    for (const view of [pinned, sheet, viewOf({ ...LOOK, links: 'merged', labels: 'clip' })]) {
      for (const columns of [40, 41, 47, 59, 72, 100, 160]) {
        for (const [graph, selected] of graphs) {
          for (const x of [0, 7, 33, 400]) {
            const room = { columns, rows: 14 }
            const drawing = view.draw(graph, selected, room, { x, y: 3 })
            expect(Math.max(...picture(drawing).map(row => row.length))).toBeLessThanOrEqual(columns)
            expect(drawing.rows.length).toBeLessThanOrEqual(room.rows)
            for (const hit of drawing.hits) {
              expect(hit.x).toBeGreaterThanOrEqual(0)
              expect(hit.y).toBeGreaterThanOrEqual(0)
              expect(hit.x + hit.width).toBeLessThanOrEqual(columns)
              expect(hit.y + hit.height).toBeLessThanOrEqual(drawing.rows.length)
            }
            const cells = drawing.hits.flatMap(hit =>
              'node' in hit ? Array.from({ length: hit.width }, (_, index) => `${hit.x + index},${hit.y}`) : [],
            )
            expect(new Set(cells).size).toBe(cells.length)
          }
        }
      }
    }
  })
})

describe('laid on one sheet', () => {
  test('every layer lies across the longest, each box by what it is linked to, and all of them move together', () => {
    expect(picture(sheet.draw(SHOP, 'src/cart.ts', NARROW, ORIGIN))).toEqual([
      '┌───────────────┐  ┌────────────────────┐',
      '│ ○ checkout.ts │  │ ○ pages/invoice.ts │',
      '└─────┬─────────┘  └─────┬──────────────┘',
      '      │                  │',
      '      ▼                  ▼',
      '╔═══════════╗  ┌──────────────────┐  ┌──────',
      '║ ● cart.ts ║  │ ● src/invoice.ts │  │ ○ ui…',
      '╚═════╤═════╝  └─────────┬────────┘  └────┬─',
      '      └──────────────────┴───────┬────────┴─',
      '                                 ▼',
      '                          ┌────────────┐',
      '                          │ ◆ price.ts │',
      '                          └──────┬─────┘',
      '                                 │',
      '                                 ▼',
      '                         ┌───────────────┐',
      '                         │ → money.ts  2 │',
      '                         └───────────────┘',
      '                     2 more →  copy · html ↗',
    ])
    const rightEdges = (x: number): Map<string, number> =>
      new Map(sheet.draw(SHOP, 'src/cart.ts', NARROW, { x, y: 0 }).hits.flatMap(hit => ('node' in hit ? [[hit.node, hit.x + hit.width] as [string, number]] : [])))
    const [before, after] = [rightEdges(0), rightEdges(12)]
    for (const id of ['src/pages/checkout.ts', 'src/pages/invoice.ts', 'src/invoice.ts', 'src/price.ts', 'src/money.ts']) {
      expect(after.get(id)).toBe((before.get(id) ?? 0) - 12)
    }
  })

  test('the window goes to the selected node wherever on the sheet it is', () => {
    expect(sheet.show(SHOP, 'src/email.ts', NARROW, ORIGIN)).toEqual({ x: 20, y: 0 })
    expect(sheet.show(SHOP, 'src/price.ts', NARROW, { x: 20, y: 0 })).toEqual({ x: 20, y: 0 })
    expect(sheet.show(SHOP, 'src/pages/checkout.ts', NARROW, { x: 20, y: 0 })).toEqual({ x: 0, y: 0 })
  })
})

describe('a room too short for every layer', () => {
  test('the window shows the selected layer with its links, and the row under it counts the nodes above and below', () => {
    expect(picture(pinned.draw(SHOP, 'src/money.ts', SHORT, pinned.show(SHOP, 'src/money.ts', SHORT, ORIGIN)))).toEqual([
      '               └─────┬─────┘  └────────────────┬─┘  └────┬────┘  └──────┬─────┘',
      '                     └─────────────────────────┼─────────┴──────────────┘',
      '                                               ▼',
      '                                        ┌────────────┐',
      '                                        │ ◆ price.ts │',
      '                                        └──────┬─────┘',
      '                                               │',
      '                                               ▼',
      '                                       ╔═══════════════╗',
      '                                       ║ → money.ts  2 ║',
      '                                       ╚═══════════════╝',
      '                                 ↑ 6 more                                    copy · html ↗',
    ])
    const top = picture(pinned.draw(SHOP, 'src/pages/checkout.ts', SHORT, ORIGIN))
    expect(top[1]).toContain('○ checkout.ts')
    expect(top.at(-1)?.trim()).toStartWith('↓ 2 more')
  })

  test('moving a layer down shows that layer and the links on both sides of it', () => {
    const shownFor = (id: string, from: number): number => pinned.show(SHOP, id, SHORT, { x: 0, y: from }).y
    expect(shownFor('src/pages/checkout.ts', 0)).toBe(0)
    expect(shownFor('src/cart.ts', 0)).toBe(0)
    expect(shownFor('src/price.ts', 0)).toBe(4)
    expect(shownFor('src/money.ts', 4)).toBe(7)
    expect(shownFor('src/cart.ts', 7)).toBe(3)
  })
})

describe('moving the selection', () => {
  const walk = (graph: Graph, room: typeof WHOLE, pan: Pan, from: string, ...moves: GraphletMove[]): string | null =>
    moves.reduce<string | null>((at, move) => pinned.step(graph, at, move, room, pan), from)
  const inShop = (from: string, ...moves: GraphletMove[]): string | null => walk(SHOP, WHOLE, ORIGIN, from, ...moves)

  test('left and right walk the layer and stop at its ends', () => {
    expect(inShop('src/cart.ts', 'right')).toBe('src/invoice.ts')
    expect(inShop('src/cart.ts', 'right', 'right', 'right', 'right', 'right')).toBe('src/email.ts')
    expect(inShop('src/cart.ts', 'left')).toBe('src/cart.ts')
  })

  test('up and down follow a link, to the linked node nearest in the window', () => {
    expect(inShop('src/invoice.ts', 'up')).toBe('src/pages/invoice.ts')
    expect(inShop('src/pages/invoice.ts', 'down')).toBe('src/invoice.ts')
    expect(inShop('src/price.ts', 'up')).toBe('src/invoice.ts')
    expect(inShop('src/price.ts', 'down')).toBe('src/money.ts')
  })

  test('with no link to follow, they land on the node of the next layer nearest in the window', () => {
    expect(inShop('src/ui.ts', 'up')).toBe('src/pages/invoice.ts')
    expect(inShop('src/email.ts', 'up')).toBe('src/pages/invoice.ts')
  })

  test('nearest is by where the boxes stand in the window, so it goes with the window', () => {
    expect(walk(SHOP, NARROW, ORIGIN, 'src/price.ts', 'up')).toBe('src/invoice.ts')
    expect(walk(SHOP, NARROW, { x: 20, y: 0 }, 'src/price.ts', 'up')).toBe('src/ui.ts')
  })

  test('the top and bottom layers are where they stop', () => {
    expect(inShop('src/pages/checkout.ts', 'up')).toBe('src/pages/checkout.ts')
    expect(inShop('src/money.ts', 'down')).toBe('src/money.ts')
  })

  test('up and down move a layer at a time, whatever link passes it, so the keys reach every node; a step along a layer skips its lanes', () => {
    const passed = readGraph({
      nodes: ['A', 'B', 'C'].map((id, layer) => ({ id, label: id, layer })),
      links: [{ from: 'A', to: 'C' }],
      direction: 'down',
    })
    expect(walk(passed, WHOLE, ORIGIN, 'A', 'down')).toBe('B')
    expect(walk(passed, WHOLE, ORIGIN, 'C', 'up')).toBe('B')
    expect(walk(passed, WHOLE, ORIGIN, 'B', 'right')).toBe('B')
    expect(walk(passed, WHOLE, ORIGIN, 'A', 'down', 'down')).toBe('C')
  })

  test('in a graph that runs right, the keys are turned with it: left and right follow its links, and up and down walk a layer', () => {
    const graph = readGraph({ nodes: ['A', 'B', 'C', 'D'].map(id => ({ id, label: id })), links: [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'C', to: 'D' }], direction: 'right' })
    expect(walk(graph, WHOLE, ORIGIN, 'A', 'right')).not.toBe('A')
    expect(walk(graph, WHOLE, ORIGIN, 'B', 'down')).toBe('C')
    expect(walk(graph, WHOLE, ORIGIN, 'C', 'up')).toBe('B')
    expect(walk(graph, WHOLE, ORIGIN, 'C', 'right')).toBe('D')
    expect(walk(graph, WHOLE, ORIGIN, 'D', 'left')).toBe('C')
    expect(walk(graph, WHOLE, ORIGIN, 'A', 'down')).toBe('A')
  })

  test('a graph that runs right is scrolled by cells as the room asks, across it and down it, and by the wheel along its layers, across the room', () => {
    const ids = Array.from({ length: 12 }, (_, index) => `step${index}`)
    const chain = readGraph({ nodes: ids.map(id => ({ id, label: id })), links: ids.slice(1).map((id, index) => ({ from: ids[index] ?? '', to: id })), direction: 'right' })
    const room = { columns: 40, rows: 6 }
    expect(pinned.scroll(chain, room, ORIGIN, { x: 5, y: 0 })).toEqual({ x: 0, y: 5 })
    expect(pinned.scroll(chain, room, ORIGIN, 1)).toEqual({ x: 0, y: 8 })
    const moved = picture(pinned.draw(chain, null, room, pinned.scroll(chain, room, ORIGIN, { x: 11, y: 0 })))
    expect(moved[1]?.startsWith('│ step1 ├')).toBe(true)
  })

  test('in an undirected graph, a step follows a link whichever way round it names its nodes, past a nearer node it does not join', () => {
    const nodes = [...['p', 'q', 't'].map(id => ({ id, label: id, layer: 0 })), { id: 'r', label: 'r', layer: 1 }]
    for (const [one, other] of [[['r', 'p'], ['t', 'r']], [['p', 'r'], ['r', 't']]] as const) {
      const graph = readGraph({ nodes, links: [one, other].map(([from, to]) => ({ from, to })), isDirected: false })
      expect(walk(graph, WHOLE, ORIGIN, 'r', 'up')).toBe('p')
    }
  })

  test('with nothing selected, there is nowhere to move from', () => {
    expect(pinned.step(SHOP, null, 'down', WHOLE, ORIGIN)).toBeNull()
  })

  test('a graph with no nodes has a window that stands still', () => {
    const empty = readGraph({ nodes: [], links: [] })
    expect(pinned.show(empty, null, WHOLE, { x: 5, y: 5 })).toEqual(ORIGIN)
    expect(pinned.scroll(empty, WHOLE, ORIGIN, 3)).toEqual(ORIGIN)
  })
})

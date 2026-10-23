import type { GraphletGraph, GraphletNode } from '../types'
import { charactersOf, rowText, sizeOf } from '../hooks/draw'
import type { Drawing } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import type { Look } from '../hooks/layout'

/** How graphs are drawn unless a person's settings say otherwise. */
export const LOOK: Look = { scroll: 'pinned', labels: 'wrap', edges: 'merged' }
/** How graphs are drawn with their edges kept separate: as still pictures are, and as the tests of how edges find their way are. */
export const SEPARATE: Look = { ...LOOK, edges: 'separate' }

/** A graph of nodes labelled by their ids, with an edge for each pair, that runs down. */
export const graphOf = (ids: string[], edges: Array<[from: string, to: string]>, rest: Partial<GraphletNode> = {}): Graph =>
  readGraph({ nodes: ids.map(id => ({ id, label: id, ...rest })), edges: edges.map(([from, to]) => ({ from, to })), direction: 'down' })

/** A graph read again with its edges undirected. */
export const undirected = (graph: Graph): Graph => readGraph({ ...graph, edges: graph.edges.map(edge => ({ ...edge, isDirected: false })) })

/** A source of numbers from 0 up to 1 that gives the same ones every run. */
export const numbers = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/** A row of a picture as the cells a terminal draws it in: a character two cells wide, and then nothing. */
export const cellsOf = (row: string): string[] => charactersOf(row).flatMap(character => (sizeOf(character) === 2 ? [character, ''] : [character]))

/** A drawing as the text of its rows. */
export const picture = (drawing: Drawing): string[] => drawing.rows.map(rowText)

/** The rows of a drawing over its last, the foot. */
export const graphRows = (drawing: Drawing): string[] => picture(drawing).slice(0, -1)

const file = (id: string, label: string, layer: number, rest: Partial<GraphletNode> = {}): GraphletNode => ({
  id,
  label,
  layer,
  mark: '○',
  ...rest,
})

/**
 * A shop's files around a change to `price.ts`, every node in a layer it
 * names: two pages over the four files that use the change, and under it the
 * one file it uses.
 */
export const SHOP_GRAPH: GraphletGraph = {
  nodes: [
    file('src/price.ts', 'price.ts', 2, { mark: '◆', tone: 'note' }),
    file('src/cart.ts', 'cart.ts', 1, { mark: '●', tone: 'bad' }),
    file('src/invoice.ts', 'src/invoice.ts', 1, { mark: '●', tone: 'bad' }),
    file('src/ui.ts', 'ui.ts', 1),
    file('src/email.ts', 'email.ts', 1, { mark: '▲', tone: 'warn' }),
    file('src/pages/checkout.ts', 'checkout.ts', 0),
    file('src/pages/invoice.ts', 'pages/invoice.ts', 0),
    file('src/money.ts', 'money.ts', 3, { mark: '→', tone: 'dim', badge: '2' }),
  ],
  edges: [
    { from: 'src/cart.ts', to: 'src/price.ts' },
    { from: 'src/invoice.ts', to: 'src/price.ts' },
    { from: 'src/ui.ts', to: 'src/price.ts' },
    { from: 'src/email.ts', to: 'src/price.ts' },
    { from: 'src/pages/checkout.ts', to: 'src/cart.ts' },
    { from: 'src/pages/invoice.ts', to: 'src/invoice.ts' },
    { from: 'src/price.ts', to: 'src/money.ts' },
  ],
}

export const SHOP = readGraph(SHOP_GRAPH)

/** A graph of `count` nodes and `edges` edges, each node joined to nodes all over the graph: as busy as a graph is drawn. */
export const busy = (count: number, edges: number): GraphletGraph => ({
  nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: `node number ${index}` })),
  edges: Array.from({ length: edges }, (_, index) => ({ from: `n${index % count}`, to: `n${(index * 7 + 1) % count}` })),
})

import { describe, expect, test } from 'claude-code/testing'

import { graphOf, numbers, undirected } from './fixture'
import { layersOf, loopLinks, ranksOf, readGraph } from '../hooks/layers'
import type { Graph, Slot } from '../hooks/layers'

const named = (slot: Slot): string => ('node' in slot ? slot.node.id : `${slot.lane.from}→${slot.lane.to}`)
const layers = (graph: Graph): string[][] => layersOf(graph).slots.map(layer => layer.map(named))

describe('reading a graph', () => {
  test('a node needs an id of its own, a link needs both its ends, and each link is kept once', () => {
    const graph = readGraph({
      nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'again' }, { id: '', label: 'nameless' }, { id: 'b', label: 'B' }],
      links: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
        { from: 'a', to: 'nowhere' },
        { from: 'b', to: 'b' },
      ],
    })
    expect(graph.nodes.map(node => node.label)).toEqual(['A', 'B'])
    expect(graph.links).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'b' },
    ])
  })

  test('a link keeps the label it is first given, made safe to draw, and a blank label is none', () => {
    const graph = readGraph({
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      links: [
        { from: 'a', to: 'b', label: ' yes\n  sir ' },
        { from: 'a', to: 'b', label: 'no' },
        { from: 'b', to: 'a', label: '   ' },
      ],
    })
    expect(graph.links).toEqual([
      { from: 'a', to: 'b', label: 'yes sir' },
      { from: 'b', to: 'a' },
    ])
  })

  test('text is made safe to draw, a node with no label is called by its id, and a tone that is none of the tones is dropped', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'two\nlines\tand a tab', mark: ' ◆ ', badge: '', tone: 'warn' },
        { id: 'b', label: '   ', tone: 'loud' as never },
        { id: 'c\nd', label: '' },
        { id: '  ', label: '' },
      ],
      links: [],
    })
    expect(graph.nodes).toEqual([
      { id: 'a', label: 'two lines and a tab', mark: '◆', tone: 'warn' },
      { id: 'b', label: 'b' },
      { id: 'c\nd', label: 'c d' },
      { id: '  ', label: '·' },
    ])
  })

  test('a graph is read up to the most nodes and the most links it may have', () => {
    const many = Array.from({ length: 700 }, (_, index) => ({ id: `n${index}`, label: 'n' }))
    const graph = readGraph({ nodes: many, links: many.map((node, index) => ({ from: node.id, to: `n${(index + 1) % 700}` })) })
    expect(graph.nodes).toHaveLength(500)
    expect(graph.nodes.at(-1)?.id).toBe('n499')
    expect(graph.links).toHaveLength(499)
  })

  test('what is no graph at all reads as an empty one', () => {
    expect(readGraph(undefined as never)).toEqual({ nodes: [], links: [], isDirected: true })
    expect(readGraph({ nodes: 'many', links: null } as never)).toEqual({ nodes: [], links: [], isDirected: true })
  })

  test('a graph is directed unless it says it is not, and an undirected one keeps a link once whichever way round it names its nodes', () => {
    const nodes = [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }]
    const links = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'b', to: 'b' }]
    expect(readGraph({ nodes, links, isDirected: 'no' as never })).toMatchObject({ links, isDirected: true })
    expect(readGraph({ nodes, links, isDirected: false })).toMatchObject({
      links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'b' }],
      isDirected: false,
    })
  })
})

describe('layers', () => {
  test('a node stands one layer under the lowest node that links to it', () => {
    expect(layers(graphOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'c']]))).toEqual([['a'], ['b', 'd'], ['c']])
  })

  test('the layers nodes name are kept, in their order, with none left empty between them', () => {
    const graph = readGraph({
      nodes: [
        { id: 'low', label: 'low', layer: 7 },
        { id: 'high', label: 'high', layer: -3 },
        { id: 'middle', label: 'middle', layer: 0 },
      ],
      links: [{ from: 'low', to: 'high' }],
    })
    expect([...ranksOf(graph)]).toEqual([
      ['low', 2],
      ['high', 0],
      ['middle', 1],
    ])
  })

  test('with a layer left out on any node, every layer is worked out from the links', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 5 },
        { id: 'b', label: 'b' },
      ],
      links: [{ from: 'b', to: 'a' }],
    })
    expect(layers(graph)).toEqual([['b'], ['a']])
  })

  test('a loop is laid out from the node nothing else leads to, and the link that closes it runs back up', () => {
    const graph = graphOf(['c', 'a', 'b', 'start'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['start', 'a']])
    expect([...loopLinks(graph)]).toEqual([{ from: 'c', to: 'a' }])
    expect(layers(graph)).toEqual([['start'], ['a'], ['b', 'c→a'], ['c']])
    expect(layersOf(graph).pieces[1]?.find(piece => piece.isUp)?.link).toEqual({ from: 'c', to: 'a' })
  })

  test('a loop with no way in is entered at the node the graph names first', () => {
    expect(layers(graphOf(['b', 'c', 'a'], [['a', 'b'], ['b', 'c'], ['c', 'a']]))).toEqual([['b'], ['c', 'a→b'], ['a']])
  })

  test('a node with more links below it than above moves down toward them, so fewer links run long', () => {
    const graph = graphOf(['a', 'b', 'c', 'late'], [['a', 'b'], ['b', 'c'], ['late', 'c']])
    expect(layers(graph)).toEqual([['a'], ['b', 'late'], ['c']])
  })

  test('a link between layers that are not neighbors has a lane in each layer it passes through', () => {
    const graph = graphOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']])
    expect(layers(graph)).toEqual([['a'], ['b', 'a→d'], ['c', 'a→d'], ['d']])
    expect(layersOf(graph).pieces.map(between => between.length)).toEqual([2, 2, 2])
  })

  test('links between two nodes of one layer are kept apart from the stretches between layers, and a link to itself is in neither', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 0 },
        { id: 'b', label: 'b', layer: 0 },
      ],
      links: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'a' },
      ],
    })
    expect(layersOf(graph).flats).toEqual([[{ from: 'a', to: 'b' }]])
    expect(layersOf(graph).pieces).toEqual([])
  })

  test('a layer is ordered by what it is joined to in its neighbors, so links do not cross', () => {
    const graph = graphOf(
      ['top1', 'top2', 'x', 'y'],
      [
        ['top1', 'y'],
        ['top2', 'x'],
      ],
    )
    expect(layers(graph)).toEqual([
      ['top1', 'top2'],
      ['y', 'x'],
    ])
  })

  test('an undirected graph stands each node as many layers down as it is links from the first node of its part, so a loop closes under a layer and nothing runs back up', () => {
    const graph = undirected(graphOf(['a', 'b', 'c', 'd', 'e', 'x', 'y'], [['c', 'b'], ['b', 'a'], ['d', 'c'], ['a', 'e'], ['e', 'd'], ['y', 'x']]))
    expect(layers(graph)).toEqual([['a', 'x'], ['b', 'e', 'y'], ['c', 'd']])
    expect(layersOf(graph).flats).toEqual([[], [], [{ from: 'd', to: 'c' }]])
    expect(layersOf(graph).pieces.flat().filter(piece => piece.isUp)).toEqual([])
  })

  test('in an undirected graph, a link across layers the nodes name runs down its lanes from whichever end stands higher', () => {
    const graph = readGraph({
      nodes: ['a', 'b', 'c'].map((id, layer) => ({ id, label: id, layer })),
      links: [{ from: 'c', to: 'a' }],
      isDirected: false,
    })
    expect(layers(graph)).toEqual([['a'], ['b', 'c→a'], ['c']])
    expect(layersOf(graph).pieces.flat().map(piece => [named(piece.upper), named(piece.lower), piece.isUp])).toEqual([
      ['a', 'c→a', false],
      ['c→a', 'c', false],
    ])
  })

  test('with nothing crossing, every layer keeps the order the graph names its nodes in', () => {
    const users = Array.from({ length: 5 }, (_, index) => `user${index}`)
    expect(layers(graphOf(['core', ...users], users.map(user => [user, 'core'])))[0]).toEqual(users)
  })
})

describe('folding into a room', () => {
  const fold = { columns: 26, widthOf: () => 5, gap: 2 }
  const folded = (graph: Graph, columns = fold.columns): string[][] => layersOf(graph, { ...fold, columns }).slots.map(layer => layer.map(named))

  test('a layer too wide for its room gives up the nodes it names last, each into the layer under it where it is joined to nothing there', () => {
    const graph = graphOf(['root', 'a', 'b', 'c', 'd', 'e', 'f'], [['root', 'a'], ['root', 'b'], ['root', 'c'], ['root', 'd'], ['root', 'e'], ['e', 'f']])
    expect(folded(graph)).toEqual([['root'], ['a', 'b', 'e', 'root→c', 'root→d'], ['f', 'c', 'd']])
  })

  test('where every node of the layer is joined to the layer under it, the nodes it gives up go to a layer put in between, and each layer under is folded in turn', () => {
    const graph = graphOf(
      ['root', 'a', 'b', 'c', 'd', 'a1', 'b1', 'c1', 'd1'],
      [['root', 'a'], ['root', 'b'], ['root', 'c'], ['root', 'd'], ['a', 'a1'], ['b', 'b1'], ['c', 'c1'], ['d', 'd1']],
    )
    expect(folded(graph, 20)).toEqual([
      ['root'],
      ['a', 'b', 'root→c', 'root→d'],
      ['a→a1', 'b→b1', 'c', 'd'],
      ['a1', 'b1', 'c→c1', 'd→d1'],
      ['c1', 'd1'],
    ])
  })

  test('folded into any room, every layer fits it that has a node it may give up, and no link that ran down or along a layer runs back up', () => {
    const next = numbers(17)
    const pick = (below: number): number => Math.floor(next() * below)
    for (let run = 0; run < 300; run += 1) {
      const count = 2 + pick(24)
      const graph = readGraph({
        nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: 'x'.repeat(1 + pick(20)) })),
        links: Array.from({ length: pick(count * 2) }, () => ({ from: `n${pick(count)}`, to: `n${pick(count)}` })),
        isDirected: pick(4) !== 0,
      })
      const room = { columns: 20 + pick(80), widthOf: (node: { label: string }) => node.label.length + 4, gap: 2 }
      const layerOf = (slots: Slot[][]): Map<string, number> =>
        new Map(slots.flatMap((layer, index) => layer.flatMap(slot => ('node' in slot ? [[slot.node.id, index] as const] : []))))
      const layers = layersOf(graph, room).slots
      const [before, after] = [layerOf(layersOf(graph).slots), layerOf(layers)]
      for (const link of graph.isDirected ? graph.links : []) {
        const [was, is] = [(before.get(link.to) ?? 0) - (before.get(link.from) ?? 0), (after.get(link.to) ?? 0) - (after.get(link.from) ?? 0)]
        expect(Math.sign(is) === Math.sign(was) || (was === 0 && is > 0)).toBe(true)
      }
      for (const layer of layers) {
        const nodes = layer.flatMap(slot => ('node' in slot ? [slot.node] : []))
        const width = nodes.reduce((sum, node) => sum + room.widthOf(node), 0) + (layer.length - nodes.length) + (layer.length - 1) * room.gap
        const isStuck = graph.isDirected && nodes.every(node => graph.links.some(link => link.from === node.id && link.to !== node.id && after.get(link.to) === after.get(node.id)))
        if (nodes.length > 1 && !isStuck) expect(width).toBeLessThanOrEqual(room.columns)
      }
    }
  })
})

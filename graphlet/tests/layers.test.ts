import { describe, expect, test } from 'claude-code/testing'

import { graphOf, numbers, undirected } from './fixture'
import { layersOf, loopEdges, ranksOf, readGraph, slotGroups } from '../hooks/layers'
import type { Graph, Slot } from '../hooks/layers'

const named = (slot: Slot): string => ('node' in slot ? slot.node.id : slot.lane.map(edge => `${edge.from}→${edge.to}`).join(' '))
const layers = (graph: Graph): string[][] => layersOf(graph).slots.map(layer => layer.map(named))

describe('reading a graph', () => {
  test('a node needs an id of its own, an edge needs both its ends, and each edge is kept once', () => {
    const graph = readGraph({
      nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'again' }, { id: '', label: 'nameless' }, { id: 'b', label: 'B' }],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
        { from: 'a', to: 'nowhere' },
        { from: 'b', to: 'b' },
      ],
    })
    expect(graph.nodes.map(node => node.label)).toEqual(['A', 'B'])
    expect(graph.edges).toEqual([
      { from: 'a', to: 'b', isDirected: true },
      { from: 'b', to: 'b', isDirected: true },
    ])
  })

  test('an edge is kept once for each label it is given between the same two nodes, the label made safe to draw, and a blank label is none', () => {
    const graph = readGraph({
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      edges: [
        { from: 'a', to: 'b', label: ' yes\n  sir ' },
        { from: 'a', to: 'b', label: 'no' },
        { from: 'a', to: 'b', label: 'yes sir' },
        { from: 'b', to: 'a', label: '   ' },
        { from: 'b', to: 'a' },
      ],
    })
    expect(graph.edges).toEqual([
      { from: 'a', to: 'b', isDirected: true, label: 'yes sir' },
      { from: 'a', to: 'b', isDirected: true, label: 'no' },
      { from: 'b', to: 'a', isDirected: true },
    ])
  })

  test('text is made safe to draw, a node with no label is called by its id, and a tone that is none of the tones, or an edge\'s of plain, is dropped', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'two\nlines\tand a tab', mark: ' ◆ ', badge: '', tone: 'warn' },
        { id: 'b', label: '   ', tone: 'loud' as never },
        { id: 'c\nd', label: '' },
        { id: '  ', label: '' },
      ],
      edges: [
        { from: 'a', to: 'b', tone: 'bad' },
        { from: 'b', to: 'a', tone: 'plain' },
        { from: 'a', to: '  ', tone: 'loud' as never },
      ],
    })
    expect(graph.edges).toEqual([
      { from: 'a', to: 'b', isDirected: true, tone: 'bad' },
      { from: 'b', to: 'a', isDirected: true },
      { from: 'a', to: '  ', isDirected: true },
    ])
    expect(graph.nodes).toEqual([
      { id: 'a', label: 'two lines and a tab', mark: '◆', tone: 'warn', isForemost: false },
      { id: 'b', label: 'b', isForemost: false },
      { id: 'c\nd', label: 'c d', isForemost: false },
      { id: '  ', label: '·', isForemost: false },
    ])
  })

  test('a node is in the group it names; a group the graph does not list is labelled by its id, one whose id another group or a node has is dropped, and a group no node is in is left out', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', group: 'lib' },
        { id: 'b', label: 'b', group: 'tests' },
        { id: 'c', label: 'c', group: 'a' },
        { id: 'd', label: 'd', group: 7 as never },
        { id: 'e', label: 'e' },
      ],
      edges: [],
      groups: [
        { id: 'lib', label: '  src/\nlib ', tone: 'note' },
        { id: 'lib', label: 'again' },
        { id: 'a', label: 'a node' },
        { id: 'empty', label: 'nobody' },
        { id: 'loud', tone: 'loud' as never },
      ],
    })
    expect(graph.nodes.map(node => node.group)).toEqual(['lib', 'tests', undefined, undefined, undefined])
    expect(graph.groups).toEqual([
      { id: 'lib', label: 'src/ lib', tone: 'note' },
      { id: 'tests', label: 'tests' },
    ])
  })

  test('a graph puts foremost the nodes of its highest priority, where that is above 0 and above another node\'s, and drops a priority that is no whole number', () => {
    const read = (priorities: unknown[]) => readGraph({ nodes: priorities.map((priority, index) => ({ id: `n${index}`, label: 'n', priority: priority as number })), edges: [] }).nodes
    const foremost = (priorities: unknown[]): string[] => read(priorities).filter(node => node.isForemost).map(node => node.id)
    expect(foremost([0, 2, 1, 2])).toEqual(['n1', 'n3'])
    expect(foremost([0, -1, 0])).toEqual([])
    expect(foremost([3, 3])).toEqual([])
    expect(foremost([undefined, 1, 'high', Infinity, NaN])).toEqual(['n1'])
    expect(read([0, 'high', -2, 2.5, -0]).map(node => node.priority)).toEqual([undefined, undefined, -2, undefined, undefined])
  })

  test('a graph is read up to the most nodes and the most edges it may have, and what is left out is counted', () => {
    const many = Array.from({ length: 1300 }, (_, index) => ({ id: `n${index}`, label: 'n' }))
    const ring = readGraph({ nodes: [...many, many[0] ?? { id: '', label: '' }], edges: many.map((node, index) => ({ from: node.id, to: `n${(index + 1) % 1300}` })) })
    expect(ring.nodes).toHaveLength(1000)
    expect(ring.nodes.at(-1)?.id).toBe('n999')
    expect(ring.edges).toHaveLength(999)
    expect(ring.unread).toEqual({ nodes: 300, edges: 301 })
    const dense = readGraph({ nodes: many.slice(0, 60), edges: many.slice(0, 60).flatMap(a => many.slice(0, 60).map(b => ({ from: a.id, to: b.id }))) })
    expect(dense.edges).toHaveLength(2000)
    expect(dense.unread).toEqual({ nodes: 0, edges: 3600 - 2000 })
  })

  test('what is no graph at all reads as an empty one', () => {
    const empty = { nodes: [], edges: [], groups: [], unread: { nodes: 0, edges: 0 } }
    expect(readGraph(undefined as never)).toEqual(empty)
    expect(readGraph({ nodes: 'many', edges: null } as never)).toEqual(empty)
  })

  test('an edge runs one way unless it says it does not, or its graph does and it says nothing; one that runs no way is kept once whichever way round it names its nodes', () => {
    const nodes = [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }]
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'b', to: 'b' }]
    const ways = (graph: Graph): string[] => graph.edges.map(edge => `${edge.from}${edge.isDirected ? '->' : '--'}${edge.to}`)
    expect(ways(readGraph({ nodes, edges, isDirected: 'no' as never }))).toEqual(['a->b', 'b->a', 'b->b'])
    expect(ways(readGraph({ nodes, edges, isDirected: false }))).toEqual(['a--b', 'b--b'])
    const mixed = [
      { from: 'a', to: 'b', isDirected: false },
      { from: 'b', to: 'a' },
      { from: 'b', to: 'a', isDirected: false },
      { from: 'a', to: 'b', isDirected: 'yes' as never },
      { from: 'a', to: 'b', isDirected: true },
    ]
    expect(ways(readGraph({ nodes, edges: mixed }))).toEqual(['a--b', 'b->a', 'a->b'])
    expect(ways(readGraph({ nodes, edges: mixed, isDirected: false }))).toEqual(['a--b', 'a->b'])
  })
})

describe('layers', () => {
  test('a node stands one layer under the lowest node with an edge to it', () => {
    expect(layers(graphOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'c']]))).toEqual([['a'], ['b', 'd'], ['c']])
  })

  test('the layers nodes name are kept, in their order, with none left empty between them', () => {
    const graph = readGraph({
      nodes: [
        { id: 'low', label: 'low', layer: 7 },
        { id: 'high', label: 'high', layer: -3 },
        { id: 'middle', label: 'middle', layer: 0 },
      ],
      edges: [{ from: 'low', to: 'high' }],
    })
    expect([...ranksOf(graph)]).toEqual([
      ['low', 2],
      ['high', 0],
      ['middle', 1],
    ])
  })

  test('with a layer left out on any node, every layer is worked out from the edges', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 5 },
        { id: 'b', label: 'b' },
      ],
      edges: [{ from: 'b', to: 'a' }],
    })
    expect(layers(graph)).toEqual([['b'], ['a']])
  })

  test('a loop is laid out from the node nothing else leads to, and the edge that closes it runs back up', () => {
    const graph = graphOf(['c', 'a', 'b', 'start'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['start', 'a']])
    expect([...loopEdges(graph)]).toEqual([{ from: 'c', to: 'a', isDirected: true }])
    expect(layers(graph)).toEqual([['start'], ['a'], ['b', 'c→a'], ['c']])
    expect(layersOf(graph).pieces[1]?.find(piece => piece.isUp)?.edge).toEqual({ from: 'c', to: 'a', isDirected: true })
  })

  test('a loop with no way in is entered at the node the graph names first', () => {
    expect(layers(graphOf(['b', 'c', 'a'], [['a', 'b'], ['b', 'c'], ['c', 'a']]))).toEqual([['b'], ['c', 'a→b'], ['a']])
  })

  test('of the two ways the edges that close loops are found, the one that leaves edges passing fewer layers is kept', () => {
    const tangle = graphOf(['A', 'B', 'C', 'D'], [['C', 'A'], ['B', 'C'], ['D', 'B'], ['A', 'C'], ['A', 'D'], ['D', 'A']])
    expect(layers(tangle)).toEqual([['D'], ['A', 'B'], ['C']])
    const returns = graphOf(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A'], ['C', 'A'], ['B', 'A']])
    expect(layers(returns).map(layer => layer.filter(slot => !slot.includes('→')))).toEqual([['A'], ['B'], ['C'], ['D']])
  })

  test('a node with more edges below it than above moves down toward them, so fewer edges run long', () => {
    const graph = graphOf(['a', 'b', 'c', 'late'], [['a', 'b'], ['b', 'c'], ['late', 'c']])
    expect(layers(graph)).toEqual([['a'], ['b', 'late'], ['c']])
  })

  test('an edge between layers that are not neighbors has a lane in each layer it passes through', () => {
    const graph = graphOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']])
    expect(layers(graph)).toEqual([['a'], ['b', 'a→d'], ['c', 'a→d'], ['d']])
    expect(layersOf(graph).pieces.map(between => between.length)).toEqual([2, 2, 2])
  })

  test('edges between two nodes of one layer are kept apart from the stretches between layers, and an edge to itself is in neither', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 0 },
        { id: 'b', label: 'b', layer: 0 },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'a' },
      ],
    })
    expect(layersOf(graph).flats).toEqual([[{ from: 'a', to: 'b', isDirected: true }]])
    expect(layersOf(graph).pieces).toEqual([])
  })

  test('the slots of a group stand together in each layer, the lanes of edges within it among them, and the groups stand in one order across the layers', () => {
    const next = numbers(41)
    const pick = (below: number): number => Math.floor(next() * below)
    for (let run = 0; run < 200; run += 1) {
      const count = 2 + pick(16)
      const graph = readGraph({
        nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: `n${index}`, ...(pick(3) === 0 ? {} : { group: `g${pick(3)}` }) })),
        edges: Array.from({ length: pick(count * 2) }, () => ({ from: `n${pick(count)}`, to: `n${pick(count)}` })),
      })
      const groupOf = slotGroups(graph)
      const order: string[][] = []
      for (const layer of layersOf(graph).slots) {
        const groups = layer.map(groupOf)
        const met = [...new Set(groups.flatMap(group => group ?? []))]
        for (const group of met) expect(groups.lastIndexOf(group) - groups.indexOf(group) + 1).toBe(groups.filter(one => one === group).length)
        order.push(met)
      }
      for (const a of order) for (const b of order) expect(a.filter(group => b.includes(group))).toEqual(b.filter(group => a.includes(group)))
    }
  })

  test('a layer is ordered by what it is joined to in its neighbors, so edges do not cross', () => {
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

  test('an undirected graph stands each node as many layers down as it is edges away from the first node of its part, so a loop closes under a layer and nothing runs back up', () => {
    const graph = undirected(graphOf(['a', 'b', 'c', 'd', 'e', 'x', 'y'], [['c', 'b'], ['b', 'a'], ['d', 'c'], ['a', 'e'], ['e', 'd'], ['y', 'x']]))
    expect(layers(graph)).toEqual([['a', 'x'], ['b', 'e', 'y'], ['c', 'd']])
    expect(layersOf(graph).flats).toEqual([[], [], [{ from: 'd', to: 'c', isDirected: false }]])
    expect(layersOf(graph).pieces.flat().filter(piece => piece.isUp)).toEqual([])
  })

  test('an edge with no direction never closes a loop, so it never turns an edge that runs one way back up', () => {
    const graph = readGraph({ nodes: ['b', 'c', 'a'].map(id => ({ id, label: id })), edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a', isDirected: false }] })
    expect(layers(graph)).toEqual([['a'], ['b', 'c→a'], ['c']])
    expect(layersOf(graph).pieces.flat().some(piece => piece.isUp)).toBe(false)
  })

  test('any graph with edges of both kinds is laid in layers, no edge with no direction running up, and an edge that runs one way running up only where it closes a loop of edges that run one way', () => {
    const next = numbers(23)
    const pick = (below: number): number => Math.floor(next() * below)
    for (let run = 0; run < 3000; run += 1) {
      const count = 2 + pick(14)
      const graph = readGraph({
        nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: `n${index}` })),
        edges: Array.from({ length: pick(count * 3) }, () => ({ from: `n${pick(count)}`, to: `n${pick(count)}`, isDirected: pick(3) !== 0 })),
      })
      const layers = layersOf(graph)
      const closing = loopEdges({ ...graph, edges: graph.edges.filter(edge => edge.isDirected) })
      for (const piece of layers.pieces.flat()) expect(piece.isUp && (!piece.edge.isDirected || !closing.has(piece.edge))).toBe(false)
    }
  })

  test('in an undirected graph, an edge across layers the nodes name runs down its lanes from whichever end stands higher', () => {
    const graph = readGraph({
      nodes: ['a', 'b', 'c'].map((id, layer) => ({ id, label: id, layer })),
      edges: [{ from: 'c', to: 'a' }],
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
  const fold = { columns: 26, widthOf: () => 5, gap: 2, frameOf: (_: string, inner: number) => inner + 4 }
  const folded = (graph: Graph, columns = fold.columns): string[][] => layersOf(graph, { ...fold, columns }).slots.map(layer => layer.map(named))

  test('a layer too wide for its room gives up the nodes it names last, each into the layer under it where it is joined to nothing there', () => {
    const graph = graphOf(['root', 'a', 'b', 'c', 'd', 'e', 'f'], [['root', 'a'], ['root', 'b'], ['root', 'c'], ['root', 'd'], ['root', 'e'], ['e', 'f']])
    expect(folded(graph)).toEqual([['root'], ['a', 'b', 'e', 'root→c root→d'], ['f', 'c', 'd']])
  })

  test('where every node of the layer is joined to the layer under it, a node it gives up takes the nodes under it down a layer with it, and each layer under is folded in turn', () => {
    const graph = graphOf(
      ['root', 'a', 'b', 'c', 'd', 'a1', 'b1', 'c1', 'd1'],
      [['root', 'a'], ['root', 'b'], ['root', 'c'], ['root', 'd'], ['a', 'a1'], ['b', 'b1'], ['c', 'c1'], ['d', 'd1']],
    )
    expect(folded(graph, 20)).toEqual([
      ['root'],
      ['a', 'b', 'root→c root→d'],
      ['a→a1', 'b→b1', 'c', 'd'],
      ['a1', 'b1', 'c→c1', 'd→d1'],
      ['c1', 'd1'],
    ])
  })

  test('a node given up takes down only the nodes that must stay under it, and shares the layer under with the nodes that were there', () => {
    const kids = ['a', 'b', 'c', 'd', 'e']
    const graph = graphOf(['root', ...kids, ...kids.map(kid => `${kid}1`)], [...kids.map(kid => ['root', kid] as [string, string]), ...kids.map(kid => [kid, `${kid}1`] as [string, string])])
    expect(folded(graph)).toEqual([
      ['root'],
      ['a', 'b', 'c', 'root→d root→e'],
      ['a1', 'b→b1', 'c→c1', 'd', 'e'],
      ['b1', 'c1', 'd1', 'e1'],
    ])
  })

  test('folded into any room, no layer is wider than both the room and the widest layer unfolded, and no edge that ran down or along a layer runs back up', () => {
    const next = numbers(17)
    const pick = (below: number): number => Math.floor(next() * below)
    for (let run = 0; run < 300; run += 1) {
      const count = 2 + pick(30)
      const graph = readGraph({
        nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: 'x'.repeat(1 + pick(20)) })),
        edges: Array.from({ length: pick(count * 2) }, () => ({ from: `n${pick(count)}`, to: `n${pick(count)}` })),
        isDirected: pick(4) !== 0,
      })
      const room = { columns: 20 + pick(80), widthOf: (node: { label: string }) => node.label.length + 4, gap: 2, frameOf: (_: string, inner: number) => inner + 4 }
      const widthOf = (layer: Slot[]): number => {
        const nodes = layer.flatMap(slot => ('node' in slot ? [slot.node] : []))
        return nodes.reduce((sum, node) => sum + room.widthOf(node), 0) + (layer.length - nodes.length) + (layer.length - 1) * room.gap
      }
      const layerOf = (slots: Slot[][]): Map<string, number> =>
        new Map(slots.flatMap((layer, index) => layer.flatMap(slot => ('node' in slot ? [[slot.node.id, index] as const] : []))))
      const [plain, folded] = [layersOf(graph).slots, layersOf(graph, room).slots]
      expect(Math.max(...folded.map(widthOf))).toBeLessThanOrEqual(Math.max(room.columns, ...plain.map(widthOf)))
      const [before, after] = [layerOf(plain), layerOf(folded)]
      for (const edge of graph.edges.filter(one => one.isDirected)) {
        const [was, is] = [(before.get(edge.to) ?? 0) - (before.get(edge.from) ?? 0), (after.get(edge.to) ?? 0) - (after.get(edge.from) ?? 0)]
        expect(Math.sign(is) === Math.sign(was) || (was === 0 && is > 0)).toBe(true)
      }
    }
  })

})

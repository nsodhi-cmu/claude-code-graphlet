import { describe, expect, test } from 'claude-code/testing'

import { graphOf } from './fixture'
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

  test('text is made safe to draw, and a node with no label is called by its id', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'two\nlines\tand a tab', mark: ' ◆ ', badge: '' },
        { id: 'b', label: '   ' },
      ],
      links: [],
    })
    expect(graph.nodes).toEqual([
      { id: 'a', label: 'two lines and a tab', mark: '◆' },
      { id: 'b', label: 'b' },
    ])
  })

  test('what is no graph at all reads as an empty one', () => {
    expect(readGraph(undefined as never)).toEqual({ nodes: [], links: [] })
    expect(readGraph({ nodes: 'many', links: null } as never)).toEqual({ nodes: [], links: [] })
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

  test('with nothing crossing, every layer keeps the order the graph names its nodes in', () => {
    const users = Array.from({ length: 5 }, (_, index) => `user${index}`)
    expect(layers(graphOf(['core', ...users], users.map(user => [user, 'core'])))[0]).toEqual(users)
  })
})

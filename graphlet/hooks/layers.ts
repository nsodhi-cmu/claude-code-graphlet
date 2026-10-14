import type { GraphletGraph, GraphletLink, GraphletNode } from '../types'

// A graph in layers: every node in a row of the drawing, every link cut into
// the stretches that cross from one layer to the next, with a lane kept for
// it in each layer it passes through, and each layer ordered so that the
// stretches between it and its neighbors cross as little as an ordering can
// make them.

/** A graph as it is drawn: every node once, and every link once, between two of its nodes. */
export type Graph = { nodes: GraphletNode[]; links: GraphletLink[] }

/** How many times the layers are ordered against their neighbors, down and back up, before the best ordering is kept. */
const SWEEPS = 4

const tidy = (text: unknown): string =>
  typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim() : ''

/**
 * Reads a graph leniently: a node needs an id no node before it has, text is
 * made safe to draw, and a link is kept once, where both its ends are nodes.
 * A link from a node to itself is kept, and drawn as a sign on the node.
 */
export function readGraph(graph: GraphletGraph): Graph {
  const nodes: GraphletNode[] = []
  const ids = new Set<string>()
  for (const node of Array.isArray(graph?.nodes) ? graph.nodes : []) {
    if (typeof node?.id !== 'string' || node.id === '' || ids.has(node.id)) continue
    ids.add(node.id)
    const [mark, badge] = [tidy(node.mark), tidy(node.badge)]
    nodes.push({
      id: node.id,
      label: tidy(node.label) || node.id,
      ...(mark === '' ? {} : { mark }),
      ...(node.tone === undefined ? {} : { tone: node.tone }),
      ...(badge === '' ? {} : { badge }),
      ...(Number.isFinite(node.layer) ? { layer: node.layer } : {}),
    })
  }
  const links: GraphletLink[] = []
  for (const link of Array.isArray(graph?.links) ? graph.links : []) {
    if (!ids.has(link?.from) || !ids.has(link?.to)) continue
    if (!links.some(one => one.from === link.from && one.to === link.to)) links.push({ from: link.from, to: link.to })
  }
  return { nodes, links }
}

/** Whether a link runs from `from` to `to`. */
export function isLinked(graph: Graph, from: string, to: string): boolean {
  return graph.links.some(link => link.from === from && link.to === to)
}

/** Whether a link joins the two nodes, whichever way it runs. */
export function isJoined(graph: Graph, a: string, b: string): boolean {
  return isLinked(graph, a, b) || isLinked(graph, b, a)
}

/**
 * The links that close a loop: followed from the nodes nothing links to, and
 * then from any node not yet reached, each link that leads back to a node
 * still being followed. With these turned around, the graph has no loop.
 */
export function loopLinks(graph: Graph): Set<GraphletLink> {
  const closing = new Set<GraphletLink>()
  const state = new Map<string, 'open' | 'done'>()
  const follow = (id: string): void => {
    state.set(id, 'open')
    for (const link of graph.links) {
      if (link.from !== id || link.to === id) continue
      if (state.get(link.to) === 'open') closing.add(link)
      else if (!state.has(link.to)) follow(link.to)
    }
    state.set(id, 'done')
  }
  const sources = graph.nodes.filter(node => !graph.links.some(link => link.to === node.id && link.from !== node.id))
  for (const node of [...sources, ...graph.nodes]) if (!state.has(node.id)) follow(node.id)
  return closing
}

/** Layers numbered from 0 with none left empty, in the order they were in. */
function packed(ranks: Map<string, number>): Map<string, number> {
  const used = [...new Set(ranks.values())].sort((a, b) => a - b)
  return new Map([...ranks].map(([id, rank]) => [id, used.indexOf(rank)]))
}

/**
 * The layer of each node, 0 the top. Where every node names its layer, those
 * are kept, in their order. Else a node stands one layer under the lowest
 * node that links to it, the links that close a loop read the other way
 * around, and is then moved down toward what it links to wherever that makes
 * more links shorter than longer.
 */
export function ranksOf(graph: Graph): Map<string, number> {
  if (graph.nodes.every(node => node.layer !== undefined)) {
    return packed(new Map(graph.nodes.map(node => [node.id, node.layer ?? 0])))
  }
  const closing = loopLinks(graph)
  const down = graph.links
    .filter(link => link.from !== link.to)
    .map(link => (closing.has(link) ? { from: link.to, to: link.from } : link))
  const ranks = new Map<string, number>()
  const rankOf = (id: string): number => {
    const known = ranks.get(id)
    if (known !== undefined) return known
    const above = down.filter(link => link.to === id).map(link => rankOf(link.from) + 1)
    const rank = Math.max(0, ...above)
    ranks.set(id, rank)
    return rank
  }
  for (const node of graph.nodes) rankOf(node.id)

  const settled = new Set<string>()
  const settle = (id: string): void => {
    if (settled.has(id)) return
    settled.add(id)
    const below = down.filter(link => link.from === id)
    for (const link of below) settle(link.to)
    const above = down.filter(link => link.to === id)
    if (below.length > above.length) ranks.set(id, Math.min(...below.map(link => ranks.get(link.to) ?? 0)) - 1)
  }
  for (const node of graph.nodes) settle(node.id)
  return packed(ranks)
}

/** What stands in a layer: a node, or the lane a link passes through the layer in, up it where the link runs against the flow. */
export type Slot = { node: GraphletNode } | { lane: GraphletLink; isUp: boolean }

/**
 * One stretch of a link, from a slot of one layer to a slot of the next. The
 * link runs down it, from `upper` to `lower`, unless it `isUp`.
 */
export type Piece = { link: GraphletLink; upper: Slot; lower: Slot; isUp: boolean }

/**
 * A graph in layers, top to bottom: the slots of each layer in order, the
 * stretches between each layer and the next, and the links that join two
 * nodes of one layer.
 */
export type Layers = { slots: Slot[][]; pieces: Piece[][]; flats: GraphletLink[][] }

/** How many pairs of stretches between two neighboring layers cross. */
function crossingsOf(pieces: Piece[], upper: Slot[], lower: Slot[]): number {
  const ends = pieces.map(piece => [upper.indexOf(piece.upper), lower.indexOf(piece.lower)] as const)
  let crossings = 0
  for (const [i, j] of ends) for (const [k, l] of ends) if (i < k && j > l) crossings += 1
  return crossings
}

/**
 * A layer in the order that sits each slot by what it is joined to in the
 * layer `beside` it: by the middle of those slots' places, scaled to this
 * layer's length. A slot joined to nothing there keeps its own place, and
 * slots that tie keep their order.
 */
function sorted(layer: Slot[], beside: Slot[], pieces: Piece[]): Slot[] {
  const scale = beside.length > 1 && layer.length > 1 ? (layer.length - 1) / (beside.length - 1) : 1
  const pulls = new Map(
    layer.map((slot, own) => {
      const places = pieces.flatMap(piece =>
        piece.upper === slot ? [beside.indexOf(piece.lower)] : piece.lower === slot ? [beside.indexOf(piece.upper)] : [],
      )
      const pull = places.length === 0 ? own : (places.reduce((sum, place) => sum + place, 0) / places.length) * scale
      return [slot, pull]
    }),
  )
  return [...layer].sort((a, b) => (pulls.get(a) ?? 0) - (pulls.get(b) ?? 0))
}

/**
 * The graph in layers. A link between two layers that are not neighbors
 * gets a lane in each layer between them, after that layer's nodes. The
 * layers are then ordered against the layer above on the way down and the
 * layer below on the way back up, a few times over, and the ordering whose
 * stretches cross least is the one kept; with nothing crossing, every layer
 * keeps the order the graph names its nodes in.
 */
export function layersOf(graph: Graph): Layers {
  const ranks = ranksOf(graph)
  const count = Math.max(-1, ...ranks.values()) + 1
  const slotOf = new Map<string, Slot>(graph.nodes.map(node => [node.id, { node }]))
  let slots: Slot[][] = Array.from({ length: count }, () => [])
  for (const node of graph.nodes) slots[ranks.get(node.id) ?? 0]?.push(slotOf.get(node.id) ?? { node })
  const pieces: Piece[][] = Array.from({ length: Math.max(0, count - 1) }, () => [])
  const flats: GraphletLink[][] = Array.from({ length: count }, () => [])

  for (const link of graph.links) {
    const [from, to] = [ranks.get(link.from) ?? 0, ranks.get(link.to) ?? 0]
    if (link.from === link.to) continue
    if (from === to) {
      flats[from]?.push(link)
      continue
    }
    const isUp = from > to
    const [first, last] = [Math.min(from, to), Math.max(from, to)]
    const bottom = slotOf.get(isUp ? link.from : link.to)
    let upper = slotOf.get(isUp ? link.to : link.from)
    for (let layer = first; layer < last && upper !== undefined && bottom !== undefined; layer += 1) {
      const lower: Slot = layer + 1 === last ? bottom : { lane: link, isUp }
      if (lower !== bottom) slots[layer + 1]?.push(lower)
      pieces[layer]?.push({ link, upper, lower, isUp })
      upper = lower
    }
  }

  const crossings = (order: Slot[][]): number =>
    pieces.reduce((sum, between, index) => sum + crossingsOf(between, order[index] ?? [], order[index + 1] ?? []), 0)
  let best = slots
  for (let sweep = 0; sweep < SWEEPS && crossings(best) > 0; sweep += 1) {
    for (let index = 1; index < count; index += 1) {
      slots = slots.with(index, sorted(slots[index] ?? [], slots[index - 1] ?? [], pieces[index - 1] ?? []))
    }
    if (crossings(slots) < crossings(best)) best = slots
    for (let index = count - 2; index >= 0; index -= 1) {
      slots = slots.with(index, sorted(slots[index] ?? [], slots[index + 1] ?? [], pieces[index] ?? []))
    }
    if (crossings(slots) < crossings(best)) best = slots
  }
  return { slots: best, pieces, flats }
}

import type { GraphletGraph, GraphletLink, GraphletNode, GraphletTone } from '../types'

// A graph in layers: every node in a row of the drawing, every link cut into
// the stretches that cross from one layer to the next, with a lane kept for
// it in each layer it passes through, and each layer ordered so that the
// stretches between it and its neighbors cross as little as an ordering can
// make them.

/**
 * A graph as it is drawn: every node once, every link once, between two of
 * its nodes, and whether each link runs from one of them to the other.
 */
export type Graph = { nodes: GraphletNode[]; links: GraphletLink[]; isDirected: boolean }

/** How many times the layers are ordered against their neighbors, down and back up, before the best ordering is kept. */
const SWEEPS = 4
/** The tones a node may have. Any other is dropped, and the node drawn plain. */
export const TONES: readonly GraphletTone[] = ['plain', 'dim', 'note', 'good', 'warn', 'bad']
/** What a node with nothing to call it by is labelled. */
const NAMELESS = '·'
/** The most nodes and the most links of a graph that are read. A graph past either is no picture a person can follow, and is slow to lay out. */
const MOST_NODES = 500
const MOST_LINKS = 500

const tidy = (text: unknown): string =>
  typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim() : ''

/**
 * Reads a graph leniently: a node needs an id no node before it has, text is
 * made safe to draw, a tone that is none of the tones is dropped, and a link
 * is kept once, where both its ends are nodes, with the label it is first
 * given; in an undirected graph, once whichever way round it names them. A
 * link from a node to itself is kept, and drawn as a sign on the node. Nodes
 * and links past the most that are read are left out. A graph is directed
 * unless it says it is not.
 */
export function readGraph(graph: GraphletGraph): Graph {
  const nodes: GraphletNode[] = []
  const ids = new Set<string>()
  for (const node of Array.isArray(graph?.nodes) ? graph.nodes : []) {
    if (nodes.length === MOST_NODES) break
    if (typeof node?.id !== 'string' || node.id === '' || ids.has(node.id)) continue
    ids.add(node.id)
    const [mark, badge] = [tidy(node.mark), tidy(node.badge)]
    nodes.push({
      id: node.id,
      label: tidy(node.label) || tidy(node.id) || NAMELESS,
      ...(mark === '' ? {} : { mark }),
      ...(TONES.includes(node.tone as GraphletTone) ? { tone: node.tone } : {}),
      ...(badge === '' ? {} : { badge }),
      ...(Number.isFinite(node.layer) ? { layer: node.layer } : {}),
    })
  }
  const isDirected = graph?.isDirected !== false
  const links: GraphletLink[] = []
  for (const link of Array.isArray(graph?.links) ? graph.links : []) {
    if (links.length === MOST_LINKS) break
    if (!ids.has(link?.from) || !ids.has(link?.to)) continue
    const isKept = links.some(
      one => (one.from === link.from && one.to === link.to) || (!isDirected && one.from === link.to && one.to === link.from),
    )
    const label = tidy(link.label)
    if (!isKept) links.push({ from: link.from, to: link.to, ...(label === '' ? {} : { label }) })
  }
  return { nodes, links, isDirected }
}

/** Whether a link runs from `from` to `to`. */
function isLinked(graph: Graph, from: string, to: string): boolean {
  return graph.links.some(link => link.from === from && link.to === to)
}

/** Whether a link joins the two nodes, whichever way it runs. */
export function isJoined(graph: Graph, a: string, b: string): boolean {
  return isLinked(graph, a, b) || isLinked(graph, b, a)
}

/**
 * Links that close the loops, found by following the links from the nodes
 * nothing links to, and then from any node not yet reached: each link that
 * leads back to a node still being followed.
 */
function followedLoops(graph: Graph): Set<GraphletLink> {
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

/**
 * Links that close the loops, found by putting the nodes in a row, first to
 * last, so that as few links as can run backward along it, in Eades, Lin and
 * Smyth's order: over and over, each node that links to nothing left goes to the end
 * of the row, and each node nothing left links to goes next at its front;
 * where none of either is left, the node that links out to the most nodes
 * left over those that link into it goes next, and of two that tie, the one a
 * walk from the nodes nothing links to reaches first, so that a loop is
 * entered where the walk enters it. A link that runs backward along the row
 * closes a loop; with these turned around, the graph has no loop.
 */
function orderedLoops(graph: Graph): Set<GraphletLink> {
  const links = graph.links.filter(link => link.from !== link.to)
  const outOf = new Map<string, GraphletLink[]>(graph.nodes.map(node => [node.id, []]))
  const into = new Map<string, GraphletLink[]>(graph.nodes.map(node => [node.id, []]))
  for (const link of links) {
    outOf.get(link.from)?.push(link)
    into.get(link.to)?.push(link)
  }
  const reached = new Map<string, number>()
  const walk = (id: string): void => {
    if (reached.has(id)) return
    reached.set(id, reached.size)
    for (const link of outOf.get(id) ?? []) walk(link.to)
  }
  for (const node of graph.nodes) if ((into.get(node.id) ?? []).length === 0) walk(node.id)
  for (const node of graph.nodes) walk(node.id)

  const left = new Set(graph.nodes.map(node => node.id))
  const outs = (id: string): number => (outOf.get(id) ?? []).filter(link => left.has(link.to)).length
  const ins = (id: string): number => (into.get(id) ?? []).filter(link => left.has(link.from)).length
  const [front, back]: [string[], string[]] = [[], []]
  while (left.size > 0) {
    for (let isPeeled = true; isPeeled; ) {
      isPeeled = false
      for (const id of [...left].filter(one => outs(one) === 0)) {
        back.unshift(id)
        left.delete(id)
        isPeeled = true
      }
      for (const id of [...left].filter(one => ins(one) === 0)) {
        front.push(id)
        left.delete(id)
        isPeeled = true
      }
    }
    const next = [...left].sort((a, b) => outs(b) - ins(b) - (outs(a) - ins(a)) || (reached.get(a) ?? 0) - (reached.get(b) ?? 0))[0]
    if (next === undefined) break
    front.push(next)
    left.delete(next)
  }
  const at = new Map([...front, ...back].map((id, index) => [id, index]))
  return new Set(links.filter(link => (at.get(link.from) ?? 0) > (at.get(link.to) ?? 0)))
}

/** Layers numbered from 0 with none left empty, in the order they were in. */
function packed(ranks: Map<string, number>): Map<string, number> {
  const used = [...new Set(ranks.values())].sort((a, b) => a - b)
  return new Map([...ranks].map(([id, rank]) => [id, used.indexOf(rank)]))
}

/**
 * How few links apart each node is from the first node the graph names of
 * those it is joined to, through any others, whichever way the links run.
 */
function distancesOf(graph: Graph): Map<string, number> {
  const distances = new Map<string, number>()
  for (const start of graph.nodes) {
    if (distances.has(start.id)) continue
    distances.set(start.id, 0)
    const reached = [start.id]
    for (const id of reached) {
      for (const link of graph.links) {
        const other = link.from === id ? link.to : link.to === id ? link.from : undefined
        if (other === undefined || distances.has(other)) continue
        distances.set(other, (distances.get(id) ?? 0) + 1)
        reached.push(other)
      }
    }
  }
  return distances
}

/**
 * The layer of each node of a directed graph, 0 the top, with the links that
 * close a loop read the other way around: a node stands one layer under the
 * lowest node that links to it, and is then moved down toward what it links
 * to wherever that makes more links shorter than longer.
 */
function ranksWith(graph: Graph, closing: Set<GraphletLink>): Map<string, number> {
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

/** How many layers a graph's links pass by, laid out in these layers: the lanes they take. */
const passedBy = (graph: Graph, ranks: Map<string, number>): number =>
  graph.links.reduce((sum, link) => sum + Math.max(0, Math.abs((ranks.get(link.from) ?? 0) - (ranks.get(link.to) ?? 0)) - 1), 0)

/**
 * The links that close a loop: found both by following the links from where
 * the graph starts and in Eades, Lin and Smyth's order, and of the two, those
 * whose layers leave the links passing fewest layers by; where they tie,
 * those followed. With these turned around, the graph has no loop.
 */
export function loopLinks(graph: Graph): Set<GraphletLink> {
  const [followed, ordered] = [followedLoops(graph), orderedLoops(graph)]
  return passedBy(graph, ranksWith(graph, ordered)) < passedBy(graph, ranksWith(graph, followed)) ? ordered : followed
}

/**
 * The layer of each node, 0 the top. Where every node names its layer, those
 * are kept, in their order. Else, in an undirected graph, a node stands as
 * many layers down as it is links away from the first node the graph names
 * of those it is joined to. A directed graph is laid in layers with the links
 * that close a loop turned around.
 */
export function ranksOf(graph: Graph): Map<string, number> {
  if (graph.nodes.every(node => node.layer !== undefined)) {
    return packed(new Map(graph.nodes.map(node => [node.id, node.layer ?? 0])))
  }
  if (!graph.isDirected) return distancesOf(graph)
  return ranksWith(graph, loopLinks(graph))
}

/** The room a graph is folded into: the columns a layer may take, how wide a node's box is, and the room between two neighbors in a layer. A lane takes a column. */
export type Fold = { columns: number; widthOf: (node: GraphletNode) => number; gap: number }

/**
 * The layers folded into a room: each layer too wide for it gives up a node
 * at a time, from the top down, until it fits or has one node left. A node
 * sinks into the layer under its own where it is joined to nothing there, and
 * else into a layer put in under its own for the nodes it gives up. Of those
 * that may go, the one joined to fewest nodes above it goes first, since each
 * such link takes a lane past the layer it leaves, and of those the one the
 * graph names last, so that the layer keeps the nodes named first. In a
 * directed graph a node that links to a node of its own layer stays, so that
 * no link turns back up for the fold.
 */
function folded(graph: Graph, ranks: Map<string, number>, fold: Fold): Map<string, number> {
  const folds = new Map(ranks)
  const links = graph.links.filter(link => link.from !== link.to)
  const rankOf = (id: string): number => folds.get(id) ?? 0
  const othersOf = (id: string): number[] =>
    links.flatMap(link => (link.from === id ? [rankOf(link.to)] : link.to === id ? [rankOf(link.from)] : []))
  const lanesIn = (rank: number): number =>
    links.filter(link => Math.min(rankOf(link.from), rankOf(link.to)) < rank && rank < Math.max(rankOf(link.from), rankOf(link.to))).length
  const nodesIn = (rank: number): GraphletNode[] => graph.nodes.filter(node => rankOf(node.id) === rank)
  const fits = (nodes: GraphletNode[], lanes: number): boolean =>
    nodes.reduce((sum, node) => sum + fold.widthOf(node), 0) + lanes + (nodes.length + lanes - 1) * fold.gap <= fold.columns
  for (let rank = 0; rank <= Math.max(...folds.values()); rank += 1) {
    for (let nodes = nodesIn(rank); nodes.length > 1 && !fits(nodes, lanesIn(rank)); nodes = nodesIn(rank)) {
      const going = nodes
        .filter(node => !graph.isDirected || !links.some(link => link.from === node.id && rankOf(link.to) === rank))
        .map(node => ({ node, above: othersOf(node.id).filter(other => other < rank).length, isFree: !othersOf(node.id).includes(rank + 1) }))
        .sort((a, b) => Number(b.isFree) - Number(a.isFree) || a.above - b.above || graph.nodes.indexOf(b.node) - graph.nodes.indexOf(a.node))[0]
      if (going === undefined) break
      if (!going.isFree) for (const [id, at] of folds) if (at > rank) folds.set(id, at + 1)
      folds.set(going.node.id, rank + 1)
    }
  }
  return folds
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
  const [above, below] = [new Map(upper.map((slot, place) => [slot, place])), new Map(lower.map((slot, place) => [slot, place]))]
  const ends = pieces.map(piece => [above.get(piece.upper) ?? 0, below.get(piece.lower) ?? 0] as const)
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
  const placeOf = new Map(beside.map((slot, place) => [slot, place]))
  const joined = new Map<Slot, number[]>()
  for (const piece of pieces) {
    for (const [own, far] of [[piece.upper, piece.lower], [piece.lower, piece.upper]] as const) {
      const place = placeOf.get(far)
      if (place !== undefined) joined.set(own, [...(joined.get(own) ?? []), place])
    }
  }
  const pulls = new Map(
    layer.map((slot, own) => {
      const places = joined.get(slot) ?? []
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
 * keeps the order the graph names its nodes in. Given a room to `fold` into,
 * the layers are folded into it first.
 */
export function layersOf(graph: Graph, fold?: Fold): Layers {
  const ranks = fold === undefined ? ranksOf(graph) : folded(graph, ranksOf(graph), fold)
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
    const isUp = graph.isDirected && from > to
    const [first, last] = [Math.min(from, to), Math.max(from, to)]
    const bottom = slotOf.get(from > to ? link.from : link.to)
    let upper = slotOf.get(from > to ? link.to : link.from)
    for (let layer = first; layer < last && upper !== undefined && bottom !== undefined; layer += 1) {
      const lower: Slot = layer + 1 === last ? bottom : { lane: link, isUp }
      if (lower !== bottom) slots[layer + 1]?.push(lower)
      pieces[layer]?.push({ link, upper, lower, isUp })
      upper = lower
    }
  }

  const crossings = (order: Slot[][]): number =>
    pieces.reduce((sum, between, index) => sum + crossingsOf(between, order[index] ?? [], order[index + 1] ?? []), 0)
  let best = { slots, crossings: crossings(slots) }
  const keepBest = (): void => {
    const now = crossings(slots)
    if (now < best.crossings) best = { slots, crossings: now }
  }
  for (let sweep = 0; sweep < SWEEPS && best.crossings > 0; sweep += 1) {
    for (let index = 1; index < count; index += 1) {
      slots = slots.with(index, sorted(slots[index] ?? [], slots[index - 1] ?? [], pieces[index - 1] ?? []))
    }
    keepBest()
    for (let index = count - 2; index >= 0; index -= 1) {
      slots = slots.with(index, sorted(slots[index] ?? [], slots[index + 1] ?? [], pieces[index] ?? []))
    }
    keepBest()
  }
  return { slots: best.slots, pieces, flats }
}

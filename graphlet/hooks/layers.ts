import type { GraphletGraph, GraphletLink, GraphletNode, GraphletTone } from '../types'

// A graph in layers: every node in a row of the drawing, every link cut into
// the stretches that cross from one layer to the next, with a lane kept for
// it in each layer it passes through, and each layer ordered so that the
// stretches between it and its neighbors cross as little as an ordering can
// make them.

/** A link as it is drawn: between two nodes, and whether it runs one way, from `from` to `to`, or only joins them. */
export type Link = GraphletLink & { isDirected: boolean }

/**
 * A graph as it is drawn: every node once, every link once, between two of
 * its nodes, and how many nodes and links it was given past the most that
 * are read, which are left out.
 */
export type Graph = { nodes: GraphletNode[]; links: Link[]; unread: { nodes: number; links: number } }

/** How many times the layers are ordered against their neighbors, down and back up, before the best ordering is kept. */
const SWEEPS = 4
/** The tones a node may have. Any other is dropped, and the node drawn plain. */
export const TONES: readonly GraphletTone[] = ['plain', 'dim', 'note', 'good', 'warn', 'bad']
/** What a node with nothing to call it by is labelled. */
const NAMELESS = '·'
/** The most nodes and the most links of a graph that are read. A graph past either is no picture a person can follow, and is slow to lay out. */
const MOST_NODES = 1000
const MOST_LINKS = 2000

const tidy = (text: unknown): string =>
  typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim() : ''

/**
 * Reads a graph leniently: a node needs an id no node before it has, text is
 * made safe to draw, a tone that is none of the tones is dropped, and a link
 * is kept where both its ends are nodes, once for each label it is given; a
 * link that runs no way, once whichever way round it names them. A
 * link runs one way unless it says it does not, or says nothing in a graph
 * that says its links do not. A link from a node to itself is kept, and
 * drawn as a sign on the node. Nodes and links past the most that are read
 * are left out, and counted.
 */
export function readGraph(graph: GraphletGraph): Graph {
  const nodes: GraphletNode[] = []
  const [ids, given] = [new Set<string>(), new Set<string>()]
  for (const node of Array.isArray(graph?.nodes) ? graph.nodes : []) {
    if (typeof node?.id !== 'string' || node.id === '' || given.has(node.id)) continue
    given.add(node.id)
    if (nodes.length === MOST_NODES) continue
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
  const links: Link[] = []
  const kept = new Set<string>()
  let unreadLinks = 0
  for (const link of Array.isArray(graph?.links) ? graph.links : []) {
    if (!given.has(link?.from) || !given.has(link?.to)) continue
    const isDirected = typeof link.isDirected === 'boolean' ? link.isDirected : graph?.isDirected !== false
    const label = tidy(link.label)
    const key = JSON.stringify([...(isDirected ? [link.from, link.to] : [link.from, link.to].sort().concat('--')), label])
    if (kept.has(key)) continue
    kept.add(key)
    if (links.length === MOST_LINKS || !ids.has(link.from) || !ids.has(link.to)) {
      unreadLinks += 1
      continue
    }
    links.push({ from: link.from, to: link.to, isDirected, ...(label === '' ? {} : { label }) })
  }
  return { nodes, links, unread: { nodes: given.size - nodes.length, links: unreadLinks } }
}

/** Whether a link runs from `from` to `to`. */
function isLinked(graph: Graph, from: string, to: string): boolean {
  return graph.links.some(link => link.from === from && link.to === to)
}

/** Whether a link joins the two nodes, whichever way it runs. */
export function isJoined(graph: Graph, a: string, b: string): boolean {
  return isLinked(graph, a, b) || isLinked(graph, b, a)
}

/** Each node's links out, and each node's links in, a link to itself in neither, in the order the graph names them. */
function adjacencyOf(graph: Graph): { outOf: Map<string, GraphletLink[]>; into: Map<string, GraphletLink[]> } {
  const outOf = new Map<string, GraphletLink[]>(graph.nodes.map(node => [node.id, []]))
  const into = new Map<string, GraphletLink[]>(graph.nodes.map(node => [node.id, []]))
  for (const link of graph.links) {
    if (link.from === link.to) continue
    outOf.get(link.from)?.push(link)
    into.get(link.to)?.push(link)
  }
  return { outOf, into }
}

/**
 * Links that close the loops, found by following the links from the nodes
 * nothing links to, and then from any node not yet reached: each link that
 * leads back to a node still being followed.
 */
function followedLoops(graph: Graph): Set<GraphletLink> {
  const { outOf, into } = adjacencyOf(graph)
  const closing = new Set<GraphletLink>()
  const state = new Map<string, 'open' | 'done'>()
  const follow = (id: string): void => {
    state.set(id, 'open')
    for (const link of outOf.get(id) ?? []) {
      if (state.get(link.to) === 'open') closing.add(link)
      else if (!state.has(link.to)) follow(link.to)
    }
    state.set(id, 'done')
  }
  const sources = graph.nodes.filter(node => (into.get(node.id) ?? []).length === 0)
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
  const { outOf, into } = adjacencyOf(graph)
  const links = graph.links.filter(link => link.from !== link.to)
  const reached = new Map<string, number>()
  const walk = (id: string): void => {
    if (reached.has(id)) return
    reached.set(id, reached.size)
    for (const link of outOf.get(id) ?? []) walk(link.to)
  }
  for (const node of graph.nodes) if ((into.get(node.id) ?? []).length === 0) walk(node.id)
  for (const node of graph.nodes) walk(node.id)

  const left = new Set(graph.nodes.map(node => node.id))
  const outs = new Map(graph.nodes.map(node => [node.id, (outOf.get(node.id) ?? []).length]))
  const ins = new Map(graph.nodes.map(node => [node.id, (into.get(node.id) ?? []).length]))
  const take = (id: string): void => {
    left.delete(id)
    for (const link of into.get(id) ?? []) outs.set(link.from, (outs.get(link.from) ?? 0) - 1)
    for (const link of outOf.get(id) ?? []) ins.set(link.to, (ins.get(link.to) ?? 0) - 1)
  }
  const [front, back]: [string[], string[]] = [[], []]
  while (left.size > 0) {
    for (let isPeeled = true; isPeeled; ) {
      isPeeled = false
      for (const id of [...left].filter(one => outs.get(one) === 0)) {
        back.unshift(id)
        take(id)
        isPeeled = true
      }
      for (const id of [...left].filter(one => ins.get(one) === 0)) {
        front.push(id)
        take(id)
        isPeeled = true
      }
    }
    let next: string | undefined
    for (const id of left) {
      const [lead, best] = [(outs.get(id) ?? 0) - (ins.get(id) ?? 0), next === undefined ? -Infinity : (outs.get(next) ?? 0) - (ins.get(next) ?? 0)]
      if (lead > best || (lead === best && (reached.get(id) ?? 0) < (reached.get(next ?? '') ?? 0))) next = id
    }
    if (next === undefined) break
    front.push(next)
    take(next)
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
  const [above, below] = [new Map<string, string[]>(), new Map<string, string[]>()]
  for (const link of graph.links) {
    if (link.from === link.to) continue
    const [from, to] = closing.has(link) ? [link.to, link.from] : [link.from, link.to]
    above.set(to, [...(above.get(to) ?? []), from])
    below.set(from, [...(below.get(from) ?? []), to])
  }
  const ranks = new Map<string, number>()
  const rankOf = (id: string): number => {
    const known = ranks.get(id)
    if (known !== undefined) return known
    const rank = Math.max(0, ...(above.get(id) ?? []).map(from => rankOf(from) + 1))
    ranks.set(id, rank)
    return rank
  }
  for (const node of graph.nodes) rankOf(node.id)

  const settled = new Set<string>()
  const settle = (id: string): void => {
    if (settled.has(id)) return
    settled.add(id)
    const downs = below.get(id) ?? []
    for (const to of downs) settle(to)
    if (downs.length > (above.get(id) ?? []).length) ranks.set(id, Math.min(...downs.map(to => ranks.get(to) ?? 0)) - 1)
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
 * are kept, in their order. Else, where no link runs one way, a node stands
 * as many layers down as it is links away from the first node the graph
 * names of those it is joined to. Any other graph is laid in layers with the
 * links that close a loop turned around, a link that runs no way taken as
 * running from the node it names first.
 */
export function ranksOf(graph: Graph): Map<string, number> {
  if (graph.nodes.every(node => node.layer !== undefined)) {
    return packed(new Map(graph.nodes.map(node => [node.id, node.layer ?? 0])))
  }
  if (graph.links.every(link => !link.isDirected)) return distancesOf(graph)
  return ranksWith(graph, loopLinks(graph))
}

/** The room a graph is folded into: the columns a layer may take, how wide a node's box is, and the room between two neighbors in a layer. A lane takes a column. */
export type Fold = { columns: number; widthOf: (node: GraphletNode) => number; gap: number }

/**
 * The layers folded into a room: each layer too wide for it gives up a node
 * at a time, from the top down, until it fits, has one node left, or giving
 * up none of those left would make it narrower, the lanes its links would
 * take past the layer being as wide as the box. A node given up goes into the
 * layer under its own, and takes down with it the nodes that must stay under
 * it: one joined to it that stood lower than it and would now stand no lower,
 * and so on from there. Where the layers were named, every node of the layers
 * under its own goes down with it, but for a node that takes none down, which
 * sinks alone. The node given up first is the one whose links would add
 * fewest lanes past the layer, then the one with fewest links to nodes above
 * it, then one that takes no node down with it, then the one the graph names
 * last, so that the layer keeps the nodes named first. A node with a link
 * that runs one way to a node of its own layer stays, so that no link turns
 * back up for the fold.
 */
function folded(graph: Graph, ranks: Map<string, number>, fold: Fold): Map<string, number> {
  let folds = new Map(ranks)
  const links = graph.links.filter(link => link.from !== link.to)
  const isNamed = graph.nodes.every(node => node.layer !== undefined)
  const rankOf = (id: string): number => folds.get(id) ?? 0
  const [joined, outward, under] = [new Map<string, string[]>(), new Map<string, string[]>(), new Map<string, string[]>()]
  const add = (map: Map<string, string[]>, key: string, value: string): void => void map.set(key, [...(map.get(key) ?? []), value])
  for (const link of links) {
    add(joined, link.from, link.to)
    add(joined, link.to, link.from)
    if (link.isDirected) add(outward, link.from, link.to)
    const [from, to] = [ranks.get(link.from) ?? 0, ranks.get(link.to) ?? 0]
    if (from < to) add(under, link.from, link.to)
    if (to < from) add(under, link.to, link.from)
  }
  /** The layers after a node of `rank` goes into the one under it, with the nodes that must stay under it. */
  const sunk = (id: string, rank: number): Map<string, number> => {
    const isFree = !(under.get(id) ?? []).some(other => rankOf(other) === rank + 1)
    if (isNamed) return new Map([...folds].map(([other, at]) => [other, other === id || (at > rank && !isFree) ? at + 1 : at]))
    const moved = new Map(folds).set(id, rank + 1)
    const queue = [id]
    for (const at of queue) {
      for (const other of under.get(at) ?? []) {
        if ((moved.get(other) ?? 0) > (moved.get(at) ?? 0)) continue
        moved.set(other, (moved.get(at) ?? 0) + 1)
        queue.push(other)
      }
    }
    return moved
  }
  /** How many lanes the links passing a layer take there, shared as they are when the graph is laid in layers, but by this layer's links alone. */
  const lanesIn = (ranks: Map<string, number>, rank: number): number => {
    const passing = links.filter(link => Math.min(ranks.get(link.from) ?? 0, ranks.get(link.to) ?? 0) < rank && rank < Math.max(ranks.get(link.from) ?? 0, ranks.get(link.to) ?? 0))
    const keyOf = (link: Link, end: 0 | 1): string =>
      JSON.stringify([link.isDirected && (ranks.get(link.from) ?? 0) > (ranks.get(link.to) ?? 0), link.isDirected, link.label, end, endsOf(link, ranks)[end]])
    const bound = new Map<string, number>()
    for (const link of passing) bound.set(keyOf(link, 1), (bound.get(keyOf(link, 1)) ?? 0) + 1)
    const shared = [...bound.values()].filter(count => count > 1).length
    return shared + new Set(passing.filter(link => (bound.get(keyOf(link, 1)) ?? 0) === 1).map(link => keyOf(link, 0))).size
  }
  const nodesIn = (ranks: Map<string, number>, rank: number): GraphletNode[] => graph.nodes.filter(node => ranks.get(node.id) === rank)
  const widthIn = (ranks: Map<string, number>, rank: number): number => {
    const [nodes, lanes] = [nodesIn(ranks, rank), lanesIn(ranks, rank)]
    return nodes.reduce((sum, node) => sum + fold.widthOf(node), 0) + lanes + (nodes.length + lanes - 1) * fold.gap
  }
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]))
  for (let rank = 0; rank <= Math.max(...folds.values()); rank += 1) {
    const kept = new Set<string>()
    for (let width = widthIn(folds, rank); nodesIn(folds, rank).length > 1 && width > fold.columns; ) {
      const passing = new Set(links.flatMap(link => (Math.min(rankOf(link.from), rankOf(link.to)) < rank && rank < Math.max(rankOf(link.from), rankOf(link.to)) ? [link.from, link.to] : [])))
      const going = nodesIn(folds, rank)
        .filter(node => !kept.has(node.id) && !(outward.get(node.id) ?? []).some(to => rankOf(to) === rank))
        .map(node => {
          const above = (joined.get(node.id) ?? []).filter(other => rankOf(other) < rank)
          const lanes = above.length > 1 ? 1 : above.filter(other => !passing.has(other)).length
          return { node, lanes, above: above.length, isFree: !(under.get(node.id) ?? []).some(other => rankOf(other) === rank + 1) }
        })
        .sort((a, b) => a.lanes - b.lanes || a.above - b.above || Number(b.isFree) - Number(a.isFree) || (order.get(b.node.id) ?? 0) - (order.get(a.node.id) ?? 0))[0]
      if (going === undefined) break
      const moved = sunk(going.node.id, rank)
      const narrower = widthIn(moved, rank)
      if (narrower < width) {
        folds = moved
        width = narrower
      } else kept.add(going.node.id)
    }
  }
  return packed(folds)
}

/**
 * What stands in a layer: a node, or a lane, which the links bound for one
 * node pass through the layer in, the one way, up it where they run against
 * the flow. A lane holds the links it carries there.
 */
export type Slot = { node: GraphletNode } | { lane: Link[]; isUp: boolean }

/** The two nodes of a link: the one it leaves and the one it is bound for; for a link that runs no way, the higher and the lower. */
const endsOf = (link: Link, ranks: Map<string, number>): [string, string] =>
  link.isDirected || (ranks.get(link.to) ?? 0) >= (ranks.get(link.from) ?? 0) ? [link.from, link.to] : [link.to, link.from]

/**
 * The lane each link passes each layer between its ends in, as a key the
 * links that share the lane have in common, from the layer under its higher
 * end down. In a layer, the links of one kind that pass it the one way, with
 * one label, bound for the same node share a lane, which carries what
 * reaches that node from many; of the links that share no such lane
 * anywhere, those from the same node share one, which carries what leaves it
 * for many; and a link that shares with none has one of its own. Neither
 * kind of lane says anything false: every link it carries goes to the one
 * node, or comes from it; and a lane from a node feeds no lane others reach,
 * where their lines would meet.
 */
function laneKeys(graph: Graph, ranks: Map<string, number>): Map<Link, string[]> {
  const spans = graph.links.flatMap(link => {
    const [from, to] = [ranks.get(link.from) ?? 0, ranks.get(link.to) ?? 0]
    const layers = Array.from({ length: Math.max(0, Math.abs(from - to) - 1) }, (_, step) => Math.min(from, to) + 1 + step)
    return link.from === link.to || layers.length === 0 ? [] : [{ link, layers, isUp: link.isDirected && from > to, ends: endsOf(link, ranks) }]
  })
  const count = (keys: string[], counts: Map<string, number>): void => {
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const [toward, from] = [new Map<string, number>(), new Map<string, number>()]
  const towardKey = (span: (typeof spans)[number], layer: number): string => JSON.stringify([layer, span.isUp, span.link.isDirected, span.link.label, 'to', span.ends[1]])
  const fromKey = (span: (typeof spans)[number], layer: number): string => JSON.stringify([layer, span.isUp, span.link.isDirected, span.link.label, 'from', span.ends[0]])
  for (const span of spans) count(span.layers.map(layer => towardKey(span, layer)), toward)
  const isBound = (span: (typeof spans)[number]): boolean => span.layers.some(layer => (toward.get(towardKey(span, layer)) ?? 0) > 1)
  for (const span of spans) if (!isBound(span)) count(span.layers.map(layer => fromKey(span, layer)), from)
  return new Map(
    spans.map((span, index) => [
      span.link,
      span.layers.map(layer => {
        const [bound, leaving] = [towardKey(span, layer), fromKey(span, layer)]
        return (toward.get(bound) ?? 0) > 1 ? bound : !isBound(span) && (from.get(leaving) ?? 0) > 1 ? leaving : JSON.stringify([layer, index])
      }),
    ]),
  )
}

/**
 * One stretch of a link, from a slot of one layer to a slot of the next. The
 * link runs down it, from `upper` to `lower`, unless it `isUp`.
 */
export type Piece = { link: Link; upper: Slot; lower: Slot; isUp: boolean }

/**
 * A graph in layers, top to bottom: the slots of each layer in order, the
 * stretches between each layer and the next, and the links that join two
 * nodes of one layer.
 */
export type Layers = { slots: Slot[][]; pieces: Piece[][]; flats: Link[][] }

/**
 * How many pairs of stretches between two neighboring layers cross: with the
 * stretches in the order of their places above, how many pairs stand the other
 * way round below, counted as Barth, Jünger and Mutzel count them.
 */
function crossingsOf(pieces: Piece[], upper: Slot[], lower: Slot[]): number {
  const [above, below] = [new Map(upper.map((slot, place) => [slot, place])), new Map(lower.map((slot, place) => [slot, place]))]
  const ends = pieces.map(piece => [above.get(piece.upper) ?? 0, below.get(piece.lower) ?? 0] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const counted = Array.from({ length: lower.length + 1 }, () => 0)
  let [crossings, seen] = [0, 0]
  for (const [, place] of ends) {
    let atOrBefore = 0
    for (let at = place + 1; at > 0; at -= at & -at) atOrBefore += counted[at] ?? 0
    crossings += seen - atOrBefore
    for (let at = place + 1; at < counted.length; at += at & -at) counted[at] = (counted[at] ?? 0) + 1
    seen += 1
  }
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
 * passes a lane in each layer between them, after that layer's nodes, which
 * it may share with links bound for the same node, or else from it. The
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
  const slots: Slot[][] = Array.from({ length: count }, () => [])
  for (const node of graph.nodes) slots[ranks.get(node.id) ?? 0]?.push(slotOf.get(node.id) ?? { node })
  const pieces: Piece[][] = Array.from({ length: Math.max(0, count - 1) }, () => [])
  const flats: Link[][] = Array.from({ length: count }, () => [])
  const lanes = new Map<string, Slot & { lane: Link[] }>()
  const laneKeysOf = laneKeys(graph, ranks)

  for (const link of graph.links) {
    const [from, to] = [ranks.get(link.from) ?? 0, ranks.get(link.to) ?? 0]
    if (link.from === link.to) continue
    if (from === to) {
      flats[from]?.push(link)
      continue
    }
    const isUp = link.isDirected && from > to
    const [first, last] = [Math.min(from, to), Math.max(from, to)]
    const bottom = slotOf.get(from > to ? link.from : link.to)
    let upper = slotOf.get(from > to ? link.to : link.from)
    const keys = laneKeysOf.get(link) ?? []
    for (let layer = first; layer < last && upper !== undefined && bottom !== undefined; layer += 1) {
      const key = keys[layer - first] ?? ''
      const lane = layer + 1 === last ? undefined : (lanes.get(key) ?? { lane: [], isUp })
      if (lane !== undefined && !lanes.has(key)) {
        lanes.set(key, lane)
        slots[layer + 1]?.push(lane)
      }
      lane?.lane.push(link)
      const lower = lane ?? bottom
      pieces[layer]?.push({ link, upper, lower, isUp })
      upper = lower
    }
  }

  const crossings = (order: Slot[][]): number =>
    pieces.reduce((sum, between, index) => sum + crossingsOf(between, order[index] ?? [], order[index + 1] ?? []), 0)
  let best = { slots: [...slots], crossings: crossings(slots) }
  const keepBest = (): void => {
    const now = crossings(slots)
    if (now < best.crossings) best = { slots: [...slots], crossings: now }
  }
  for (let sweep = 0; sweep < SWEEPS && best.crossings > 0; sweep += 1) {
    for (let index = 1; index < count; index += 1) slots[index] = sorted(slots[index] ?? [], slots[index - 1] ?? [], pieces[index - 1] ?? [])
    keepBest()
    for (let index = count - 2; index >= 0; index -= 1) slots[index] = sorted(slots[index] ?? [], slots[index + 1] ?? [], pieces[index] ?? [])
    keepBest()
  }
  return { slots: best.slots, pieces, flats }
}

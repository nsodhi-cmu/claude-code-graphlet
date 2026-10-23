import type { GraphletDirection, GraphletEdge, GraphletGraph, GraphletGroup, GraphletNode, GraphletTone } from '../types'

// A graph in layers: every node in a row of the drawing, every edge cut into
// the stretches that cross from one layer to the next, with a lane kept for
// it in each layer it passes through, and each layer ordered so that the
// stretches between it and its neighbors cross as little as an ordering can
// make them.

/**
 * A node as it is drawn, whether it is one the graph puts foremost, drawn
 * with a heavy border, and for a box that stands for a collapsed group, how
 * many nodes it holds.
 */
export type Node = GraphletNode & { isForemost: boolean; holds?: number }

/** An edge as it is drawn: between two nodes, and whether it runs one way, from `from` to `to`, or only joins them. */
export type Edge = GraphletEdge & { isDirected: boolean }

/** A group as it is drawn: its id, what its frame says, its tone where it has one, and whether it is collapsed at first. */
export type Group = { id: string; label: string; tone?: GraphletTone; isCollapsed?: true }

/**
 * A graph as it is drawn: every node once, every edge once, between two of
 * its nodes, the groups that hold any of its nodes, how many nodes and edges
 * it was given past the most that are read, which are left out, and which way
 * it runs, where it says.
 */
export type Graph = { nodes: Node[]; edges: Edge[]; groups: Group[]; unread: { nodes: number; edges: number }; direction?: GraphletDirection }

/** How many times the layers are ordered against their neighbors, down and back up, before the best ordering is kept. */
const SWEEPS = 4
/** The tones a node may have. Any other is dropped, and the node drawn plain. */
export const TONES: readonly GraphletTone[] = ['plain', 'dim', 'note', 'good', 'warn', 'bad']
/** What a node with nothing to call it by is labelled. */
const NAMELESS = '·'
/** The most nodes and the most edges of a graph that are read. A graph past either is no picture a person can follow, and is slow to lay out. */
const MOST_NODES = 1000
const MOST_EDGES = 2000

const tidy = (text: unknown): string =>
  typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim() : ''

/**
 * Reads a graph leniently: a node needs an id no node before it has, text is
 * made safe to draw, a tone that is none of the tones is dropped, and so is an
 * edge's of `plain`, which is an edge's when it has none, a priority
 * that is not a whole number is dropped, and so is one of 0, which is a node's
 * when it has none. The nodes put foremost are those of the highest
 * priority, where it is above 0 and above another node's. An edge
 * is kept where both its ends are nodes, once for each label it is given; an
 * edge that runs no way, once whichever way round it names them. An
 * edge runs one way unless it says it does not, or says nothing in a graph
 * that says its edges do not. An edge from a node to itself is kept, and
 * drawn as a sign on the node. Nodes and edges past the most that are read
 * are left out, and counted. A graph that names its edges `links` is read
 * the same. A direction that is neither way is dropped.
 * A group needs an id that no group before it and no node has; a node's
 * group that the graph does not list is a group labelled by its id, unless
 * a node has that id, and then the node is in none. A group no node is in
 * is left out.
 */
export function readGraph(graph: GraphletGraph): Graph {
  const nodes: GraphletNode[] = []
  const [ids, given] = [new Set<string>(), new Set<string>()]
  const named = new Map<GraphletNode, unknown>()
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
      ...(Number.isInteger(node.priority) && node.priority !== 0 ? { priority: node.priority } : {}),
    })
    named.set(nodes.at(-1) as GraphletNode, node.group)
  }
  const listed = new Map<string, GraphletGroup>()
  for (const group of Array.isArray(graph?.groups) ? graph.groups : []) {
    if (typeof group?.id === 'string' && group.id !== '' && !given.has(group.id) && !listed.has(group.id)) listed.set(group.id, group)
  }
  for (const node of nodes) {
    const group = named.get(node)
    if (typeof group !== 'string' || group === '' || given.has(group)) continue
    node.group = group
    if (!listed.has(group)) listed.set(group, { id: group })
  }
  const held = new Set(nodes.map(node => node.group))
  const groups: Group[] = [...listed.values()].filter(group => held.has(group.id)).map(group => {
    const label = tidy(group.label) || tidy(group.id) || NAMELESS
    return { id: group.id, label, ...(TONES.includes(group.tone as GraphletTone) ? { tone: group.tone } : {}), ...(group.isCollapsed === true ? { isCollapsed: true as const } : {}) }
  })
  const priorities = nodes.map(priorityOf)
  const [top, lowest] = [Math.max(...priorities), Math.min(...priorities)]
  const edges: Edge[] = []
  const kept = new Set<string>()
  let unreadEdges = 0
  const older = graph as GraphletGraph & { links?: unknown }
  for (const edge of Array.isArray(graph?.edges) ? graph.edges : Array.isArray(older?.links) ? (older.links as GraphletEdge[]) : []) {
    if (!given.has(edge?.from) || !given.has(edge?.to)) continue
    const isDirected = typeof edge.isDirected === 'boolean' ? edge.isDirected : graph?.isDirected !== false
    const label = tidy(edge.label)
    const key = JSON.stringify([...(isDirected ? [edge.from, edge.to] : [edge.from, edge.to].sort().concat('--')), label])
    if (kept.has(key)) continue
    kept.add(key)
    if (edges.length === MOST_EDGES || !ids.has(edge.from) || !ids.has(edge.to)) {
      unreadEdges += 1
      continue
    }
    const tone = TONES.includes(edge.tone as GraphletTone) && edge.tone !== 'plain' ? edge.tone : undefined
    edges.push({ from: edge.from, to: edge.to, isDirected, ...(label === '' ? {} : { label }), ...(tone === undefined ? {} : { tone }) })
  }
  return {
    nodes: nodes.map(node => ({ ...node, isForemost: priorityOf(node) === top && top > 0 && top > lowest })),
    edges,
    groups,
    unread: { nodes: given.size - nodes.length, edges: unreadEdges },
    ...(graph?.direction === 'down' || graph?.direction === 'right' ? { direction: graph.direction } : {}),
  }
}

/** A node's priority: 0 where it has none. */
export const priorityOf = (node: GraphletNode): number => node.priority ?? 0

/** Whether an edge runs from `from` to `to`. */
function hasEdge(graph: Graph, from: string, to: string): boolean {
  return graph.edges.some(edge => edge.from === from && edge.to === to)
}

/** Whether an edge joins the two nodes, whichever way it runs. */
export function isJoined(graph: Graph, a: string, b: string): boolean {
  return hasEdge(graph, a, b) || hasEdge(graph, b, a)
}

/** Each node's edges out, and each node's edges in, an edge to itself in neither, in the order the graph names them. */
function adjacencyOf(graph: Graph): { outOf: Map<string, GraphletEdge[]>; into: Map<string, GraphletEdge[]> } {
  const outOf = new Map<string, GraphletEdge[]>(graph.nodes.map(node => [node.id, []]))
  const into = new Map<string, GraphletEdge[]>(graph.nodes.map(node => [node.id, []]))
  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue
    outOf.get(edge.from)?.push(edge)
    into.get(edge.to)?.push(edge)
  }
  return { outOf, into }
}

/**
 * Edges that close the loops, found by following the edges from the nodes
 * no edge reaches, and then from any node not yet reached: each edge that
 * leads back to a node still being followed.
 */
function followedLoops(graph: Graph): Set<GraphletEdge> {
  const { outOf, into } = adjacencyOf(graph)
  const closing = new Set<GraphletEdge>()
  const state = new Map<string, 'open' | 'done'>()
  const follow = (id: string): void => {
    state.set(id, 'open')
    for (const edge of outOf.get(id) ?? []) {
      if (state.get(edge.to) === 'open') closing.add(edge)
      else if (!state.has(edge.to)) follow(edge.to)
    }
    state.set(id, 'done')
  }
  const sources = graph.nodes.filter(node => (into.get(node.id) ?? []).length === 0)
  for (const node of [...sources, ...graph.nodes]) if (!state.has(node.id)) follow(node.id)
  return closing
}

/**
 * Edges that close the loops, found by putting the nodes in a row, first to
 * last, so that as few edges as can run backward along it, in Eades, Lin and
 * Smyth's order: over and over, each node with no edge out to a node left goes to the end
 * of the row, and each node with no edge in from a node left goes next at its front;
 * where none of either is left, the node with the most edges out to nodes
 * left over edges in from them goes next, and of two that tie, the one a
 * walk from the nodes no edge reaches reaches first, so that a loop is
 * entered where the walk enters it. An edge that runs backward along the row
 * closes a loop; with these turned around, the graph has no loop.
 */
function orderedLoops(graph: Graph): Set<GraphletEdge> {
  const { outOf, into } = adjacencyOf(graph)
  const edges = graph.edges.filter(edge => edge.from !== edge.to)
  const reached = new Map<string, number>()
  const walk = (id: string): void => {
    if (reached.has(id)) return
    reached.set(id, reached.size)
    for (const edge of outOf.get(id) ?? []) walk(edge.to)
  }
  for (const node of graph.nodes) if ((into.get(node.id) ?? []).length === 0) walk(node.id)
  for (const node of graph.nodes) walk(node.id)

  const left = new Set(graph.nodes.map(node => node.id))
  const outs = new Map(graph.nodes.map(node => [node.id, (outOf.get(node.id) ?? []).length]))
  const ins = new Map(graph.nodes.map(node => [node.id, (into.get(node.id) ?? []).length]))
  const take = (id: string): void => {
    left.delete(id)
    for (const edge of into.get(id) ?? []) outs.set(edge.from, (outs.get(edge.from) ?? 0) - 1)
    for (const edge of outOf.get(id) ?? []) ins.set(edge.to, (ins.get(edge.to) ?? 0) - 1)
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
  return new Set(edges.filter(edge => (at.get(edge.from) ?? 0) > (at.get(edge.to) ?? 0)))
}

/** Layers numbered from 0 with none left empty, in the order they were in. */
function packed(ranks: Map<string, number>): Map<string, number> {
  const used = [...new Set(ranks.values())].sort((a, b) => a - b)
  return new Map([...ranks].map(([id, rank]) => [id, used.indexOf(rank)]))
}

/**
 * How few edges apart each node is from the first node the graph names of
 * those it is joined to, through any others, whichever way the edges run.
 */
function distancesOf(graph: Graph): Map<string, number> {
  const distances = new Map<string, number>()
  for (const start of graph.nodes) {
    if (distances.has(start.id)) continue
    distances.set(start.id, 0)
    const reached = [start.id]
    for (const id of reached) {
      for (const edge of graph.edges) {
        const other = edge.from === id ? edge.to : edge.to === id ? edge.from : undefined
        if (other === undefined || distances.has(other)) continue
        distances.set(other, (distances.get(id) ?? 0) + 1)
        reached.push(other)
      }
    }
  }
  return distances
}

/**
 * The layer of each node of a directed graph, 0 the top, with the edges that
 * close a loop read the other way around: a node stands one layer under the
 * lowest node with an edge to it, and is then moved down toward what its edges
 * reach wherever that makes more edges shorter than longer.
 */
function ranksWith(graph: Graph, closing: Set<GraphletEdge>): Map<string, number> {
  const [above, below] = [new Map<string, string[]>(), new Map<string, string[]>()]
  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue
    const [from, to] = closing.has(edge) ? [edge.to, edge.from] : [edge.from, edge.to]
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

/** How many layers a graph's edges pass by, laid out in these layers: the lanes they take. */
const passedBy = (graph: Graph, ranks: Map<string, number>): number =>
  graph.edges.reduce((sum, edge) => sum + Math.max(0, Math.abs((ranks.get(edge.from) ?? 0) - (ranks.get(edge.to) ?? 0)) - 1), 0)

/**
 * The edges that close a loop: found both by following the edges from where
 * the graph starts and in Eades, Lin and Smyth's order, and of the two, those
 * whose layers leave the edges passing fewest layers by; where they tie,
 * those followed. With these turned around, the graph has no loop.
 */
export function loopEdges(graph: Graph): Set<GraphletEdge> {
  const [followed, ordered] = [followedLoops(graph), orderedLoops(graph)]
  return passedBy(graph, ranksWith(graph, ordered)) < passedBy(graph, ranksWith(graph, followed)) ? ordered : followed
}

/**
 * The layer of each node, 0 the top. Where every node names its layer, those
 * are kept, in their order. Else, where no edge runs one way, a node stands
 * as many layers down as it is edges away from the first node the graph
 * names of those it is joined to. Any other graph is laid in layers with the
 * edges that close a loop turned around, found among the edges that run one
 * way alone. An edge that runs no way is taken as running from the node it
 * names first, unless that would close a loop with the others, as they are
 * laid; then each such edge runs forward along an order the edges that run
 * one way keep as they are laid, so that none of them closes a loop.
 */
export function ranksOf(graph: Graph): Map<string, number> {
  if (graph.nodes.every(node => node.layer !== undefined)) {
    return packed(new Map(graph.nodes.map(node => [node.id, node.layer ?? 0])))
  }
  if (graph.edges.every(edge => !edge.isDirected)) return distancesOf(graph)
  const closing = loopEdges({ ...graph, edges: graph.edges.filter(edge => edge.isDirected) })
  /** Edges as they are laid, those that close a loop turned around. */
  const laid = (edges: Edge[]): Edge[] => edges.filter(edge => edge.from !== edge.to).map(edge => (closing.has(edge) ? { ...edge, from: edge.to, to: edge.from } : edge))
  if (orderOf(graph.nodes, laid(graph.edges)).length === graph.nodes.length) return ranksWith(graph, closing)
  const place = new Map(orderOf(graph.nodes, laid(graph.edges.filter(edge => edge.isDirected))).map((id, index) => [id, index]))
  const isBefore = (a: string, b: string): boolean => (place.get(a) ?? 0) < (place.get(b) ?? 0)
  return ranksWith({ ...graph, edges: graph.edges.map(edge => (edge.isDirected || isBefore(edge.from, edge.to) ? edge : { ...edge, from: edge.to, to: edge.from })) }, closing)
}

/**
 * The nodes in an order every edge runs forward along, of those with nothing
 * left before them always the one the graph names first; where the edges
 * run in a loop, only the nodes before it.
 */
function orderOf(nodes: GraphletNode[], edges: Edge[]): string[] {
  const before = new Map(nodes.map(node => [node.id, 0]))
  const after = new Map<string, string[]>()
  for (const edge of edges) {
    before.set(edge.to, (before.get(edge.to) ?? 0) + 1)
    after.set(edge.from, [...(after.get(edge.from) ?? []), edge.to])
  }
  const order: string[] = []
  const left = nodes.map(node => node.id)
  for (let next = left.find(id => before.get(id) === 0); next !== undefined; next = left.find(id => before.get(id) === 0)) {
    order.push(next)
    left.splice(left.indexOf(next), 1)
    before.set(next, -1)
    for (const id of after.get(next) ?? []) before.set(id, (before.get(id) ?? 0) - 1)
  }
  return order
}

/** The room a graph is folded into: the columns a layer may take, how wide a node's box is, the room between two neighbors in a layer, and how wide a group's frame is around nodes of it that take `inner` columns side by side. A lane takes a column. */
export type Fold = { columns: number; widthOf: (node: GraphletNode) => number; gap: number; frameOf: (group: string, inner: number) => number }

/**
 * The layers folded into a room: each layer too wide for it gives up a node
 * at a time, from the top down, until it fits, has one node left, or giving
 * up none of those left would make it narrower, the lanes its edges would
 * take past the layer being as wide as the box. A node given up goes into the
 * layer under its own, and takes down with it the nodes that must stay under
 * it: one joined to it that stood lower than it and would now stand no lower,
 * and so on from there. Where the layers were named, every node of the layers
 * under its own goes down with it, but for a node that takes none down, which
 * sinks alone. The node given up first is the one whose edges would add
 * fewest lanes past the layer, then the one with fewest edges to nodes above
 * it, then one that takes no node down with it, then the one the graph names
 * last, so that the layer keeps the nodes named first. A node with an edge
 * that runs one way to a node of its own layer stays, so that no edge turns
 * back up for the fold.
 */
function folded(graph: Graph, ranks: Map<string, number>, fold: Fold): Map<string, number> {
  let folds = new Map(ranks)
  const edges = graph.edges.filter(edge => edge.from !== edge.to)
  const isNamed = graph.nodes.every(node => node.layer !== undefined)
  const rankOf = (id: string): number => folds.get(id) ?? 0
  const [joined, outward, under] = [new Map<string, string[]>(), new Map<string, string[]>(), new Map<string, string[]>()]
  const add = (map: Map<string, string[]>, key: string, value: string): void => void map.set(key, [...(map.get(key) ?? []), value])
  for (const edge of edges) {
    add(joined, edge.from, edge.to)
    add(joined, edge.to, edge.from)
    if (edge.isDirected) add(outward, edge.from, edge.to)
    const [from, to] = [ranks.get(edge.from) ?? 0, ranks.get(edge.to) ?? 0]
    if (from < to) add(under, edge.from, edge.to)
    if (to < from) add(under, edge.to, edge.from)
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
  /** How many lanes the edges passing a layer take there, shared as they are when the graph is laid in layers, but by this layer's edges alone. */
  const lanesIn = (ranks: Map<string, number>, rank: number): number => {
    const passing = edges.filter(edge => Math.min(ranks.get(edge.from) ?? 0, ranks.get(edge.to) ?? 0) < rank && rank < Math.max(ranks.get(edge.from) ?? 0, ranks.get(edge.to) ?? 0))
    const keyOf = (edge: Edge, end: 0 | 1): string =>
      JSON.stringify([edge.isDirected && (ranks.get(edge.from) ?? 0) > (ranks.get(edge.to) ?? 0), edge.isDirected, edge.label, edge.tone, end, endsOf(edge, ranks)[end]])
    const bound = new Map<string, number>()
    for (const edge of passing) bound.set(keyOf(edge, 1), (bound.get(keyOf(edge, 1)) ?? 0) + 1)
    const shared = [...bound.values()].filter(count => count > 1).length
    return shared + new Set(passing.filter(edge => (bound.get(keyOf(edge, 1)) ?? 0) === 1).map(edge => keyOf(edge, 0))).size
  }
  const nodesIn = (ranks: Map<string, number>, rank: number): Node[] => graph.nodes.filter(node => ranks.get(node.id) === rank)
  const widthIn = (ranks: Map<string, number>, rank: number): number => {
    const [nodes, lanes] = [nodesIn(ranks, rank), lanesIn(ranks, rank)]
    const groups = [...new Set(nodes.flatMap(node => node.group ?? []))]
    const sideBySide = (some: Node[]): number => some.reduce((sum, node) => sum + fold.widthOf(node) + fold.gap, -fold.gap)
    const items = [
      ...nodes.filter(node => node.group === undefined).map(fold.widthOf),
      ...groups.map(group => fold.frameOf(group, sideBySide(nodes.filter(node => node.group === group)))),
    ]
    return items.reduce((sum, width) => sum + width, 0) + lanes + (items.length + lanes - 1) * fold.gap
  }
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]))
  for (let rank = 0; rank <= Math.max(...folds.values()); rank += 1) {
    const kept = new Set<string>()
    for (let width = widthIn(folds, rank); nodesIn(folds, rank).length > 1 && width > fold.columns; ) {
      const passing = new Set(edges.flatMap(edge => (Math.min(rankOf(edge.from), rankOf(edge.to)) < rank && rank < Math.max(rankOf(edge.from), rankOf(edge.to)) ? [edge.from, edge.to] : [])))
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
 * What stands in a layer: a node, or a lane, which the edges bound for one
 * node pass through the layer in, the one way, up it where they run against
 * the flow. A lane holds the edges it carries there.
 */
export type Slot = { node: Node } | { lane: Edge[]; isUp: boolean }

/** The two nodes of an edge: the one it leaves and the one it is bound for; for an edge that runs no way, the higher and the lower. */
const endsOf = (edge: Edge, ranks: Map<string, number>): [string, string] =>
  edge.isDirected || (ranks.get(edge.to) ?? 0) >= (ranks.get(edge.from) ?? 0) ? [edge.from, edge.to] : [edge.to, edge.from]

/**
 * The lane each edge passes each layer between its ends in, as a key the
 * edges that share the lane have in common, from the layer under its higher
 * end down. In a layer, the edges of one kind that pass it the one way, with
 * one label and one tone, both within one group or not, bound for the same
 * node share a lane, which carries what
 * reaches that node from many; of the edges that share no such lane
 * anywhere, those from the same node share one, which carries what leaves it
 * for many; and an edge that shares with none has one of its own. Neither
 * kind of lane says anything false: every edge it carries goes to the one
 * node, or comes from it; and a lane from a node feeds no lane others reach,
 * where their lines would meet.
 */
function laneKeys(graph: Graph, ranks: Map<string, number>): Map<Edge, string[]> {
  const within = innerGroups(graph)
  const spans = graph.edges.flatMap(edge => {
    const [from, to] = [ranks.get(edge.from) ?? 0, ranks.get(edge.to) ?? 0]
    const layers = Array.from({ length: Math.max(0, Math.abs(from - to) - 1) }, (_, step) => Math.min(from, to) + 1 + step)
    return edge.from === edge.to || layers.length === 0 ? [] : [{ edge, layers, isUp: edge.isDirected && from > to, ends: endsOf(edge, ranks) }]
  })
  const count = (keys: string[], counts: Map<string, number>): void => {
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const [toward, from] = [new Map<string, number>(), new Map<string, number>()]
  const towardKey = (span: (typeof spans)[number], layer: number): string => JSON.stringify([layer, span.isUp, span.edge.isDirected, span.edge.label, span.edge.tone, within(span.edge), 'to', span.ends[1]])
  const fromKey = (span: (typeof spans)[number], layer: number): string => JSON.stringify([layer, span.isUp, span.edge.isDirected, span.edge.label, span.edge.tone, within(span.edge), 'from', span.ends[0]])
  for (const span of spans) count(span.layers.map(layer => towardKey(span, layer)), toward)
  const isBound = (span: (typeof spans)[number]): boolean => span.layers.some(layer => (toward.get(towardKey(span, layer)) ?? 0) > 1)
  for (const span of spans) if (!isBound(span)) count(span.layers.map(layer => fromKey(span, layer)), from)
  return new Map(
    spans.map((span, index) => [
      span.edge,
      span.layers.map(layer => {
        const [bound, leaving] = [towardKey(span, layer), fromKey(span, layer)]
        return (toward.get(bound) ?? 0) > 1 ? bound : !isBound(span) && (from.get(leaving) ?? 0) > 1 ? leaving : JSON.stringify([layer, index])
      }),
    ]),
  )
}

/**
 * One stretch of an edge, from a slot of one layer to a slot of the next. The
 * edge runs down it, from `upper` to `lower`, unless it `isUp`.
 */
export type Piece = { edge: Edge; upper: Slot; lower: Slot; isUp: boolean }

/**
 * A graph in layers, top to bottom: the slots of each layer in order, the
 * stretches between each layer and the next, and the edges that join two
 * nodes of one layer.
 */
export type Layers = { slots: Slot[][]; pieces: Piece[][]; flats: Edge[][] }

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
function sorted(layer: Slot[], beside: Slot[], pieces: Piece[], groupOf: (slot: Slot) => string | undefined): Slot[] {
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
  return together([...layer].sort((a, b) => (pulls.get(a) ?? 0) - (pulls.get(b) ?? 0)), slot => pulls.get(slot) ?? 0, groupOf)
}

/** Each slot's group: a node's, or a lane's whose edges are within one group. */
export function slotGroups(graph: Graph): (slot: Slot) => string | undefined {
  const within = innerGroups(graph)
  return slot => ('node' in slot ? slot.node.group : slot.lane[0] === undefined ? undefined : within(slot.lane[0]))
}

/** Which group each edge is within: the group of both its nodes, where they are of one; else none. */
function innerGroups(graph: Graph): (edge: GraphletEdge) => string | undefined {
  const groupOf = new Map(graph.nodes.map(node => [node.id, node.group]))
  return edge => {
    const group = groupOf.get(edge.from)
    return group !== undefined && group === groupOf.get(edge.to) ? group : undefined
  }
}

/**
 * A layer with the slots of each group together, standing where the group's
 * own slots stand on average by `pullOf`, each group's in the order they
 * stood, and the rest as they stood. A layer with no group is as it was.
 */
function together(layer: Slot[], pullOf: (slot: Slot) => number, groupOf: (slot: Slot) => string | undefined): Slot[] {
  const blocks = new Map<string, Slot[]>()
  for (const slot of layer) {
    const group = groupOf(slot)
    if (group !== undefined) blocks.set(group, [...(blocks.get(group) ?? []), slot])
  }
  if (blocks.size === 0) return layer
  const items = layer.flatMap(slot => {
    const group = groupOf(slot)
    const block = group === undefined ? [slot] : (blocks.get(group) ?? [])
    return block[0] === slot ? [{ pull: block.reduce((sum, one) => sum + pullOf(one), 0) / block.length, block }] : []
  })
  return items.sort((a, b) => a.pull - b.pull).flatMap(item => item.block)
}

/**
 * The layers with the groups in one order across all of them, so that no
 * two groups' frames cross: each layer's groups, where they stand, put in
 * the order of where each group stands on average over the layers it is in,
 * and of two that stand alike, the one met first from the top.
 */
function inOrder(slots: Slot[][], groupOf: (slot: Slot) => string | undefined): Slot[][] {
  const stands = new Map<string, number[]>()
  slots.forEach(layer => layer.forEach((slot, index) => {
    const group = groupOf(slot)
    if (group !== undefined) stands.set(group, [...(stands.get(group) ?? []), (index + 0.5) / layer.length])
  }))
  const average = (group: string): number => {
    const at = stands.get(group) ?? []
    return at.reduce((sum, one) => sum + one, 0) / Math.max(at.length, 1)
  }
  const first = [...stands.keys()]
  const ranked = new Map(first.toSorted((a, b) => average(a) - average(b) || first.indexOf(a) - first.indexOf(b)).map((group, rank) => [group, rank]))
  return slots.map(layer => {
    const order = [...new Set(layer.flatMap(slot => groupOf(slot) ?? []))]
    const placed = order.toSorted((a, b) => (ranked.get(a) ?? 0) - (ranked.get(b) ?? 0))
    const blockOf = (group: string): Slot[] => layer.filter(slot => groupOf(slot) === group)
    return layer.flatMap(slot => {
      const group = groupOf(slot)
      if (group === undefined) return [slot]
      return layer.find(one => groupOf(one) === group) === slot ? blockOf(placed[order.indexOf(group)] ?? group) : []
    })
  })
}

/**
 * The graph in layers. An edge between two layers that are not neighbors
 * passes a lane in each layer between them, after that layer's nodes, which
 * it may share with edges bound for the same node, or else from it. The
 * layers are then ordered against the layer above on the way down and the
 * layer below on the way back up, a few times over, and the ordering whose
 * stretches cross least is the one kept; with nothing crossing, every layer
 * keeps the order the graph names its nodes in. The slots of a group stand
 * together in each layer, and the groups in one order across the layers.
 * Given a room to `fold` into, the layers are folded into it first.
 */
export function layersOf(graph: Graph, fold?: Fold): Layers {
  const ranks = fold === undefined ? ranksOf(graph) : folded(graph, ranksOf(graph), fold)
  const count = Math.max(-1, ...ranks.values()) + 1
  const slotOf = new Map<string, Slot>(graph.nodes.map(node => [node.id, { node }]))
  const slots: Slot[][] = Array.from({ length: count }, () => [])
  for (const node of graph.nodes) slots[ranks.get(node.id) ?? 0]?.push(slotOf.get(node.id) ?? { node })
  const pieces: Piece[][] = Array.from({ length: Math.max(0, count - 1) }, () => [])
  const flats: Edge[][] = Array.from({ length: count }, () => [])
  const lanes = new Map<string, Slot & { lane: Edge[] }>()
  const laneKeysOf = laneKeys(graph, ranks)
  const groupOf = slotGroups(graph)

  for (const edge of graph.edges) {
    const [from, to] = [ranks.get(edge.from) ?? 0, ranks.get(edge.to) ?? 0]
    if (edge.from === edge.to) continue
    if (from === to) {
      flats[from]?.push(edge)
      continue
    }
    const isUp = edge.isDirected && from > to
    const [first, last] = [Math.min(from, to), Math.max(from, to)]
    const bottom = slotOf.get(from > to ? edge.from : edge.to)
    let upper = slotOf.get(from > to ? edge.to : edge.from)
    const keys = laneKeysOf.get(edge) ?? []
    for (let layer = first; layer < last && upper !== undefined && bottom !== undefined; layer += 1) {
      const key = keys[layer - first] ?? ''
      const lane = layer + 1 === last ? undefined : (lanes.get(key) ?? { lane: [], isUp })
      if (lane !== undefined && !lanes.has(key)) {
        lanes.set(key, lane)
        slots[layer + 1]?.push(lane)
      }
      lane?.lane.push(edge)
      const lower = lane ?? bottom
      pieces[layer]?.push({ edge, upper, lower, isUp })
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
    for (let index = 1; index < count; index += 1) slots[index] = sorted(slots[index] ?? [], slots[index - 1] ?? [], pieces[index - 1] ?? [], groupOf)
    keepBest()
    for (let index = count - 2; index >= 0; index -= 1) slots[index] = sorted(slots[index] ?? [], slots[index + 1] ?? [], pieces[index] ?? [], groupOf)
    keepBest()
  }
  const kept = best.slots.map(layer => together(layer, slot => layer.indexOf(slot), groupOf))
  return { slots: graph.groups.length === 0 ? kept : inOrder(kept, groupOf), pieces, flats }
}

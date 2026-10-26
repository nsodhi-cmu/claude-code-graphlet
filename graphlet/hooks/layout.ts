import type { GraphletDirection, GraphletEdge, GraphletNode } from '../types'
import { charactersOf, clipMiddle, fitting, sizeOf } from './draw'
import type { Room } from './draw'
import { groupOfSlot, layersOf, priorityOf } from './layers'
import type { Edge, Graph, Group, Piece, Slot } from './layers'

// The layout: a box a node, the boxes of a layer side by side on a shelf with
// the lanes of the edges that pass through it, and between two shelves a
// channel the edges cross in. It is worked out once for a room's width, in an
// order that never changes, whatever window it is then seen through.

/**
 * How a graph wider than its room scrolls. `pinned`: a shelf that fits the
 * room stays in view, and the shelves longer than it lie on one sheet as wide
 * as the longest, which slides under the window. `sheet`: every shelf lies on
 * that sheet, each box by what it is joined to, and the sheet moves whole.
 */
export type Scroll = 'pinned' | 'sheet'

/** What becomes of a label too long for one line of a box: it is wrapped onto more lines, or cut to one. */
export type Labels = 'wrap' | 'clip'

/**
 * How the edges that cross between two shelves share the rows there.
 * `separate`: one box's edges turn on a row of their own wherever they would
 * run into another's. `merged`: those of one kind turn on one row, which is
 * shorter, and are told apart by selecting a node.
 */
export type Edges = 'separate' | 'merged'

/** How graphs are drawn: the person's settings. */
export type Look = { scroll: Scroll; labels: Labels; edges: Edges }

/**
 * Which way a graph runs: `down`, its layers one under another, each a row
 * of boxes; or `right`, its layers side by side, each a column of them. A
 * layout is worked out the same way for both, across a shelf and along the
 * layers, and only its picture turns: running right, across is down the
 * room and along is across it.
 */
export type Direction = GraphletDirection

/**
 * What a direction makes of a layout: the room between two neighbors of a
 * shelf; how far apart two ports of one face stand, so that a column or a
 * row between two is free to step an edge aside at; and whether an edge's
 * label lies across the face it leaves, beside its port, as it does running
 * down, or along its line, as it does running right.
 */
const GRAINS: Readonly<Record<Direction, { gap: number; portStep: number; isLabelAcross: boolean }>> = {
  down: { gap: 2, portStep: 2, isLabelAcross: true },
  right: { gap: 1, portStep: 2, isLabelAcross: false },
}

/**
 * The most cells a line of a wrapped label takes, the most a word may take
 * and still keep a line to itself, and the most lines a label is wrapped onto.
 */
const LABEL_COLUMNS = 24
const WORD_COLUMNS = 32
const LABEL_ROWS = 3
/** The most cells of a label that is cut to one line. */
const CLIP_CELLS = 32
/** The most cells an edge's label takes: a longer one is cut in its middle. */
const EDGE_LABEL_CELLS = 16
/** What a box adds to its widest line: a space and a border on each side. */
const BOX_PADDING = 4
/** The narrowest box: one whose two ports stand apart. A shorter label is set in its middle. */
const BOX_COLUMNS = 7
/** The room between two neighbors on a shelf of a graph that runs down. */
export const GAP = GRAINS.down.gap
/** The narrowest room a graph that runs down is laid out for: a box of the widest kind, and a little over. */
export const LEAST_COLUMNS = 40
/** The fewest rows a graph that runs right is laid out across: a room shorter than its boxes shows them through a window that slides down them. */
const LEAST_ROWS = 1
/** How many times a folded layout that its boxes' ports still make wider than its room is folded again, narrower by as much as it overflowed. */
const REFOLDS = 2
/** The most nodes, and the most edges, a graph is folded into its room for: folding more takes long, and makes a picture longer than a reply can hold. */
const FOLDED_NODES = 60
const FOLDED_EDGES = 120
/** How many times the shelves are seated again, after they are first seated, each time down, back up, and against both neighbors at once; each seating tried lays every track again. */
const RESEATS = 1
/** How much more a lane's wire weighs than a box's where a shelf is balanced, so that an edge through lanes keeps straight before a box sits square. */
const LANE_WEIGHT = 2
/** How many bent edges a row of height is worth, where seatings are weighed against each other. */
const ROW_BENDS = 2
/** How much more a wire with the flow weighs than one against it, where a shelf is balanced and where seatings are weighed, so that an edge that closes a loop bends before the edges it runs back past. */
const FLOW_WEIGHT = 2
/** How much less a bend in a wire to or from a lane weighs than one between two boxes, where seatings are weighed, so that an edge through lanes bends before the edges between neighbors do. */
const LANE_BEND = 2
/** The characters a long word may be broken after with nothing lost. */
const BREAKS = '/-_.'
/** The sign in the box of a node with an edge to itself. */
const LOOP = '↺'
/** The most empty columns a layout with frames keeps side by side: past it, columns that hold nothing on any shelf but lines that cross them are taken out. */
const CARVED_GAP = 4
/** How many times the units on shelves with frames are each moved toward their wires, where nothing stops them sooner. */
const SETTLES = 8
/** How many times over the shelves of a group's frame are lined up with one another by the wires between them. */
const ALIGNS = 4
/** How far a group's frame stands out from what it holds across a shelf: its border, and a blank inside it. */
const FRAME_MARGIN = 2
/** What a frame's top border takes besides its label: its two corners, a cell of border and a blank before the label, and a blank and a cell of border after. */
const TITLE_CELLS = 6
/** How many rows a frame's border takes along the layers, at each end of what it holds: its border, and running right, where a row is a column, a blank inside it. */
const FRAME_ENDS: Readonly<Record<Direction, number>> = { down: 1, right: 2 }

/**
 * A label on lines no wider than `columns` cells, broken at its spaces. A
 * word of up to `word` cells keeps a line to itself, however wide that makes
 * the line; a longer one is broken after the last `/`, `-`, `_` or `.` that
 * fits a line, or with none, where the line ends. What is left after `rows`
 * lines is cut short on the last of them, and ends in an ellipsis.
 */
export function wrap(label: string, columns: number, rows: number, word = columns): string[] {
  const lines: string[] = []
  let line = ''
  for (const next of label.split(' ')) {
    if (line !== '' && sizeOf(line) + 1 + sizeOf(next) <= columns) {
      line = `${line} ${next}`
      continue
    }
    if (line !== '') lines.push(line)
    const characters = charactersOf(next)
    const sizes = characters.map(sizeOf)
    let [at, left] = [0, sizes.reduce((sum, size) => sum + size, 0)]
    while (left > word) {
      let [end, used] = [at, 0]
      while (end < characters.length && (end === at || used + (sizes[end] ?? 0) <= columns)) used += sizes[end++] ?? 0
      const fits = characters.slice(at, end)
      const last = Math.max(...[...BREAKS].map(mark => fits.lastIndexOf(mark)))
      const cut = at + (last > 0 ? last + 1 : fits.length)
      lines.push(characters.slice(at, cut).join(''))
      left -= sizes.slice(at, cut).reduce((sum, size) => sum + size, 0)
      at = cut
    }
    line = characters.slice(at).join('')
  }
  if (line !== '') lines.push(line)
  if (lines.length <= rows) return lines
  const last = charactersOf(lines.slice(rows - 1).join(' '))
  return [...lines.slice(0, rows - 1), `${last.slice(0, fitting(last, columns - 1)).join('').trimEnd()}…`]
}

/** A label on the lines every picture of its node wraps it onto. */
export function linesOf(label: string): string[] {
  return wrap(label, LABEL_COLUMNS, LABEL_ROWS, WORD_COLUMNS)
}

/** What is written on an edge, cut to the cells an edge's label may take; nothing where it has no label. */
export const labelOf = (edge: GraphletEdge): string => (edge.label === undefined ? '' : clipMiddle(edge.label, EDGE_LABEL_CELLS))

/** Whether an edge keeps to lines of edges that say what it says: one with a label or a tone, which is then true of every edge of the line. */
export const isApart = (edge: GraphletEdge): boolean => labelOf(edge) !== '' || edge.tone !== undefined

/** What a box says: its node's mark, the lines of its label, and what follows the last of them, dim. */
export type Words = { mark: string; lines: string[]; badge: string }

/** What a node's box says. A node with an edge to itself carries the sign of a loop before its badge. */
export function wordsOf(graph: Graph, node: GraphletNode, labels: Labels): Words {
  const isLooped = graph.edges.some(edge => edge.from === node.id && edge.to === node.id)
  const after = [...(isLooped ? [LOOP] : []), ...(node.badge === undefined ? [] : [node.badge])].join(' ')
  return {
    mark: node.mark === undefined ? '' : `${node.mark} `,
    lines: labels === 'clip' ? [clipMiddle(node.label, CLIP_CELLS)] : linesOf(node.label),
    badge: after === '' ? '' : `  ${after}`,
  }
}

/** How wide a box is that says `words`: as wide as its widest line, and never too narrow for its two ports to stand apart. */
function widthOf(words: Words): number {
  const widest = Math.max(1, ...words.lines.map((line, index) => sizeOf(line) + (index === words.lines.length - 1 ? sizeOf(words.badge) : 0)))
  return Math.max(BOX_COLUMNS, sizeOf(words.mark) + widest + BOX_PADDING)
}

/**
 * A slot where it stands: on which shelf, where it starts along the shelf,
 * how wide it is and how many rows it takes from the shelf's top, and for a
 * node what its box says.
 */
export type Place = { slot: Slot; shelf: number; x: number; width: number; rows: number; words?: Words }

/**
 * One layer as it is laid out: its places, the columns they take side by
 * side with the frames that span the layer, the columns they are laid out
 * across, which the window slides over
 * when they are more than the room's, and the rows its tallest box takes. A
 * lane runs down all of them.
 */
export type Shelf = { places: Place[]; width: number; across: number; top: number; rows: number }

/**
 * One end of a wire: the place it meets, whether that place is on the shelf
 * above the channel, and how far along the place its port is. A lane has the
 * one port. Each face of a box has a port for the wires that leave it, and a
 * port for each bundle that reaches it, dealt out across its middle.
 */
export type End = { place: Place; isAbove: boolean; at: number }

/**
 * An edge's stretch across one channel, from the place it leaves to the place
 * it reaches, with an arrowhead there where that place is the edge's own end
 * and the edge runs one way. One that `isUp` runs against the flow. Where it
 * does not go straight across, it turns on the row of the channel that is its
 * `track`, and where its bundle runs on two tracks, steps across to the
 * other at its `jog`. It keeps `clearOf` the other ports of the face it
 * leaves and the columns next to them, and of the columns next to its own
 * where it leaves with others, so that it never runs beside another's tick
 * or arrowhead.
 */
export type Wire = {
  edge: Edge
  from: End
  to: End
  hasHead: boolean
  isUp: boolean
  /** Which of its channel's bundles it is of. */
  bundle: number
  track: number
  /** Where it steps from its track to the one it arrives on: `at` columns along from the start of the place it leaves. */
  jog: { at: number; track: number } | null
  clearOf: number[]
}

/**
 * The rows between two shelves, or under the last: its `topRows`, for the
 * arrowheads that point up and the labels of the edges that leave the shelf
 * above, when there are any, then a row a track, then its `bottomRows`, for
 * the arrowheads that point down and the labels of the edges that leave the
 * shelf below, when there are any. Running down, a label lies across a row,
 * so either is one row; running right, a label lies along its line, so
 * either is as many as the longest label, and one more. Its wires turn in
 * bundles, each on a track; with the wires merged it has none, and one
 * track. A channel `isLoose` where its two shelves slide apart under a
 * window.
 */
export type Channel = {
  top: number
  rows: number
  wires: Wire[]
  bundles: Wire[][]
  isLoose: boolean
  topRows: number
  bottomRows: number
  /** The rows a frame's bottom border takes, under its `topRows`, for a group that ends on the shelf above: none where none does. */
  frameBottom: number
  /** The rows a frame's top border takes, over its `bottomRows`, for a group that starts on the shelf below: none where none does. */
  frameTop: number
  /** The columns the sides of frames run down through its tracks, which no wire steps aside at. */
  walls: number[]
}

/**
 * A group's frame as laid out: around every place of the group, from shelf
 * `first` to shelf `last`, across a shelf from `x` for `width`, and along
 * the layers from the row of its top border to the row of its bottom one.
 */
export type Frame = { group: Group; first: number; last: number; x: number; width: number; top: number; bottom: number }

/**
 * A graph laid out for a room `columns` across, the way it runs, with `gap`
 * between two neighbors of a shelf. Channel `n` is under shelf `n`.
 */
export type Layout = { shelves: Shelf[]; channels: Channel[]; frames: Frame[]; columns: number; rows: number; direction: Direction; gap: number }

export const middleOf = (place: Place, x: number): number => x + Math.floor(place.width / 2)

/** How many columns a layout reaches across, from the start of the first thing on any shelf, frames included, to the end of the last, and no fewer than its widest shelf. */
export function breadthOf(layout: Layout): number {
  const spans = [...layout.shelves.flatMap(shelf => shelf.places), ...layout.frames]
  const reach = spans.length === 0 ? 0 : Math.max(...spans.map(one => one.x + one.width)) - Math.min(...spans.map(one => one.x))
  return Math.max(reach, ...layout.shelves.map(shelf => shelf.width))
}

/**
 * The column a wire leaves in and the column it arrives in, where `xOf` puts
 * each place. A wire that crosses its channel leaves its box straight toward
 * the port it is bound for where the box reaches over that port, clear of
 * its corners and of its other ports and their labels, and else by its own
 * port, to turn on its track; a wire with a label always leaves by its own
 * port, beside which its label is written.
 */
export function routeOf(wire: Wire, xOf: (place: Place) => number): { out: number; into: number } {
  const { place } = wire.from
  const x = xOf(place)
  const into = xOf(wire.to.place) + wire.to.at
  const own = x + wire.from.at
  if ('lane' in place.slot || wire.from.isAbove === wire.to.isAbove || labelOf(wire.edge) !== '') return { out: own, into }
  const isOver = into > x + 1 && into < x + place.width - 2 && !wire.clearOf.includes(into - x)
  return { out: isOver ? into : own, into }
}

/** The wires of the channel under a shelf: the stretches that cross it, and the edges between two nodes of that shelf. */
function wiresOf(pieces: Piece[], flats: Edge[], shelf: Shelf, placeOf: Map<Slot, Place>): Wire[] {
  const wires: Wire[] = []
  const rest = { bundle: 0, track: 0, jog: null, clearOf: [] }
  for (const piece of pieces) {
    const [upper, lower] = [placeOf.get(piece.upper), placeOf.get(piece.lower)]
    if (upper === undefined || lower === undefined) continue
    const above: End = { place: upper, isAbove: true, at: 0 }
    const below: End = { place: lower, isAbove: false, at: 0 }
    const [from, to] = piece.isUp ? [below, above] : [above, below]
    wires.push({ edge: piece.edge, from, to, hasHead: piece.edge.isDirected && 'node' in to.place.slot, isUp: piece.isUp, ...rest })
  }
  const find = (id: string): Place | undefined =>
    shelf.places.find(place => 'node' in place.slot && place.slot.node.id === id)
  for (const edge of flats) {
    const [from, to] = [find(edge.from), find(edge.to)]
    if (from === undefined || to === undefined) continue
    wires.push({
      edge,
      from: { place: from, isAbove: true, at: 0 },
      to: { place: to, isAbove: true, at: 0 },
      hasHead: edge.isDirected,
      isUp: false,
      ...rest,
    })
  }
  return wires
}

/**
 * A channel's wires in bundles, the wires that turn on one track. Kept
 * apart, a bundle is the wires that leave one face of a place, a fan, with
 * the fans of every other place whose wires reach the very same faces, so
 * that run together they say nothing false. Edges of the two kinds are never
 * of one bundle. An edge with no direction, whose line has no arrowhead to
 * tell its two ends apart, between two nodes of the shelf is a bundle alone,
 * and merged too where it has a label or a tone. Merged, a bundle is every
 * wire of one kind with neither that runs the one way, with the flow or
 * against it. Wires with a label or a tone are bundled as they are kept apart
 * whichever the setting, and wires with different labels or tones are never
 * of one bundle, so that a label is true of every wire of the line it is
 * written beside, and a tone of every wire of the line it paints; merged, the
 * bundles with either keep tracks of their own, apart from the one the rest
 * share. Kept apart, a wire that leaves a box for a
 * lane that wires from elsewhere reach too is a fan of its own, so that it meets the lane's
 * others there without joining them to the box's other edges.
 */
function bundlesOf(wires: Wire[], edges: Edges): Wire[][] {
  const ids = new Map<Place, number>()
  const faceOf = (end: End): string => {
    if (!ids.has(end.place)) ids.set(end.place, ids.size)
    return `${ids.get(end.place)}${end.isAbove ? 'v' : '^'}`
  }
  const isAlone = (wire: Wire): boolean => !wire.edge.isDirected && wire.from.isAbove === wire.to.isAbove && (edges === 'separate' || isApart(wire.edge))
  const reaching = new Map<Place, Set<Place>>()
  for (const wire of wires) if ('lane' in wire.to.place.slot) reaching.set(wire.to.place, new Set([...(reaching.get(wire.to.place) ?? []), wire.from.place]))
  /** Whether a wire leaves a box for a lane that wires from elsewhere reach too, which it must reach on a line of its own. */
  const isJoining = (wire: Wire): boolean => 'node' in wire.from.place.slot && (reaching.get(wire.to.place)?.size ?? 0) > 1
  const fans = new Map<string, { way: string; isMerged: boolean; wires: Wire[] }>()
  for (const wire of wires.filter(wire => !isAlone(wire))) {
    const way = JSON.stringify([wire.isUp, wire.edge.isDirected, wire.edge.label ?? '', wire.edge.tone ?? ''])
    const isMerged = edges === 'merged' && !isApart(wire.edge)
    const key = isMerged ? way : `${way} ${faceOf(wire.from)}${isJoining(wire) ? ` into ${faceOf(wire.to)}` : ''}`
    fans.set(key, { way, isMerged, wires: [...(fans.get(key)?.wires ?? []), wire] })
  }
  const bound = new Map<string, Wire[]>()
  for (const [key, { way, isMerged, wires: fan }] of fans) {
    const reached = [...new Set(fan.map(wire => faceOf(wire.to)))].sort().join(' ')
    const sign = isMerged ? key : `${way} ${reached}`
    bound.set(sign, [...(bound.get(sign) ?? []), ...fan])
  }
  return [...bound.values(), ...wires.filter(isAlone).map(wire => [wire])]
}

/**
 * Deals every face of every place its ports, and widens a box that is too
 * narrow for them and their labels. The wires of one bundle that leave a face
 * share a port, and so do the wires of one bundle that reach it, so two
 * bundles never run into one port. A port of wires with a label has the label
 * written after it along the face, and the next port stands past the label;
 * else a face's ports stand the direction's `portStep` apart; running right,
 * a label lies along its line and takes nothing of the face. The ports stand
 * across the face's middle, in the order of where along their shelves the
 * places at the wires' other ends
 * stand, so that wires from the left arrive on the left; of two that lead to
 * a place in common, the one with the flow is first, wherever their other
 * wires lead, so that the edges two boxes have each way stand in the same
 * order on both. A wire that leaves straight keeps clear of the face's other
 * ports and the columns beside them, and of their labels.
 */
function dealPorts(shelves: Shelf[], channels: Channel[], direction: Direction): void {
  const { portStep, isLabelAcross } = GRAINS[direction]
  /** How many places across a face a label takes beside its port. */
  const spanOf = (label: string): number => (isLabelAcross ? sizeOf(label) : 0)
  type Group = { ends: End[]; leaving: Wire[]; heading: number; isUp: boolean; far: Set<Place>; label: string }
  const faces = new Map<Place, { top: Group[]; bottom: Group[] }>()
  const indexOf = new Map(shelves.flatMap(shelf => shelf.places.map((place, index) => [place, index] as const)))
  const alongOf = (place: Place): number => ((indexOf.get(place) ?? 0) + 0.5) / (shelves[place.shelf]?.places.length ?? 1)
  const groupOf = (ends: End[], far: End[], leaving: Wire[], isUp: boolean): void => {
    const [first] = ends
    if (first === undefined) return
    const face = faces.get(first.place) ?? { top: [], bottom: [] }
    faces.set(first.place, face)
    const heading = far.reduce((sum, end) => sum + alongOf(end.place), 0) / far.length
    const label = leaving[0] === undefined ? '' : labelOf(leaving[0].edge)
    ;(first.isAbove ? face.bottom : face.top).push({ ends, leaving, heading, isUp, far: new Set(far.map(end => end.place)), label })
  }
  /** A face's groups by their heading, each against the flow moved past every group with the flow that leads to a place it does. */
  const ordered = (groups: Group[]): Group[] => {
    const order = [...groups].sort((a, b) => a.heading - b.heading || Number(a.isUp) - Number(b.isUp))
    for (const up of order.filter(group => group.isUp)) {
      const from = order.indexOf(up)
      const past = order.findLastIndex(group => !group.isUp && [...group.far].some(place => up.far.has(place)))
      if (past > from) order.splice(past, 0, ...order.splice(from, 1))
    }
    return order
  }
  const byPlace = <T>(items: T[], endOf: (item: T) => End): T[][] => {
    const groups = new Map<string, T[]>()
    for (const item of items) {
      const key = `${endOf(item).place.shelf} ${alongOf(endOf(item).place)} ${endOf(item).isAbove}`
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return [...groups.values()]
  }
  for (const channel of channels) {
    for (const leaving of channel.bundles.flatMap(bundle => byPlace(bundle, wire => wire.from))) {
      groupOf(leaving.map(wire => wire.from), leaving.map(wire => wire.to), leaving, leaving[0]?.isUp ?? false)
    }
    for (const bundle of channel.bundles) {
      for (const reaching of byPlace(bundle, wire => wire.to)) {
        groupOf(reaching.map(wire => wire.to), reaching.map(wire => wire.from), [], bundle[0]?.isUp ?? false)
      }
    }
  }
  /** Where along a face its ports stand from the first, each far enough past the one before for that one's label and a gap; and the last column the last label takes. */
  const spread = (groups: Group[]): { steps: number[]; end: number } => {
    const steps = groups.reduce<number[]>(
      (at, group, index) => (index === 0 ? [0] : [...at, (at[index - 1] ?? 0) + Math.max(portStep, spanOf(groups[index - 1]?.label ?? '') + 2)]),
      [],
    )
    return { steps, end: (steps.at(-1) ?? 0) + spanOf(groups.at(-1)?.label ?? '') }
  }
  for (const [place, face] of faces) {
    if ('lane' in place.slot) continue
    const [top, bottom] = [ordered(face.top), ordered(face.bottom)]
    place.width = Math.max(place.width, spread(top).end + 3, spread(bottom).end + 3)
    for (const groups of [top, bottom]) {
      const { steps, end } = spread(groups)
      const isLabeled = groups.some(group => group.label !== '')
      const first = isLabeled || !isLabelAcross ? Math.floor((place.width - 1 - end) / 2) : Math.floor(place.width / 2) - (groups.length - 1)
      const ports = steps.map(step => first + step)
      const written = groups.flatMap((group, index) => Array.from({ length: group.label === '' ? 0 : spanOf(group.label) + 1 }, (_, cell) => (ports[index] ?? 0) + 1 + cell))
      groups.forEach((group, index) => {
        const own = ports[index] ?? 0
        const beside = group.leaving.length > 1 ? [own - 1, own + 1] : []
        for (const end of group.ends) end.at = own
        const others = ports.filter((_, other) => other !== index)
        const clear = others.flatMap(port => [port - 1, port, port + 1])
        for (const wire of group.leaving) wire.clearOf = [...clear, ...beside, ...written]
      })
    }
  }
}

/**
 * Seats a shelf's places across `columns`, by the places of `beside` its
 * wires join them to. A box goes as near as it can to where its ports stand
 * over or under the ports of the boxes it is joined to, or with none, of the
 * lanes; the boxes are pushed apart where they would overlap, and slid back
 * together toward where they wanted to be. A lane then goes to the very
 * column of the port it is joined to, so that an edge runs straight through
 * the shelves it passes, and pushes aside the boxes in its way. Last, the
 * shelf moves a column either way where that stands more of it exactly over
 * or under what it is joined to. With nothing beside it to sit by, the shelf
 * is centered.
 */
function seat(shelf: Shelf, columns: number, beside: Place[], wires: Wire[], gap: number): void {
  const { places } = shelf
  const isBeside = new Set(beside)
  /** For each place, the places beside it that a wire joins it to, with the port at each end of that wire. */
  const joins = new Map<Place, Array<{ other: Place; own: number; far: number }>>()
  for (const wire of wires) {
    for (const [near, far] of [[wire.from, wire.to], [wire.to, wire.from]] as const) {
      if (!isBeside.has(far.place) || isBeside.has(near.place)) continue
      joins.set(near.place, [...(joins.get(near.place) ?? []), { other: far.place, own: near.at, far: far.at }])
    }
  }
  const joinedTo = (place: Place): Array<{ other: Place; own: number; far: number }> => joins.get(place) ?? []
  const wanted = places.map(place => {
    const all = joinedTo(place)
    const boxes = all.filter(({ other }) => 'node' in other.slot)
    const joined = 'node' in place.slot && boxes.length > 0 ? boxes : all
    if (joined.length === 0) return undefined
    return Math.round(joined.reduce((sum, { other, own, far }) => sum + other.x + far - own, 0) / joined.length)
  })
  if (wanted.every(want => want === undefined)) {
    let x = Math.floor((columns - shelf.width) / 2)
    for (const place of places) {
      place.x = x
      x += place.width + gap
    }
    return
  }

  let x = 0
  places.forEach((place, index) => {
    place.x = Math.max(x, wanted[index] ?? x)
    x = place.x + place.width + gap
  })
  let limit = columns
  for (const place of [...places].reverse()) {
    place.x = Math.max(0, Math.min(place.x, limit - place.width))
    limit = place.x - gap
  }
  const slideBy = (by: number): void => {
    const [first, last] = [places[0], places.at(-1)]
    if (first === undefined || last === undefined) return
    const slide = Math.max(-first.x, Math.min(by, columns - last.x - last.width))
    for (const place of places) place.x += slide
  }
  const offsets = places.flatMap((place, index) => (wanted[index] === undefined ? [] : [(wanted[index] ?? 0) - place.x]))
  slideBy(Math.round(offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length))

  const seated = new Set<Place>()
  /** Moves a place toward `to`, one `way` along the shelf, pushing the places in its way; it stops at a lane already seated and at the shelf's end, and answers where it got to. */
  const shove = (index: number, to: number, way: number): number => {
    const place = places[index]
    if (place === undefined) return way > 0 ? columns + gap : -gap
    if ((to - place.x) * way <= 0 || seated.has(place)) return place.x
    const next = places[index + way]
    if (way > 0) {
      place.x = Math.min(to, shove(index + 1, to + place.width + gap, way) - gap - place.width)
    } else {
      place.x = Math.max(to, shove(index - 1, to - gap - (next?.width ?? 0), way) + (next?.width ?? 0) + gap)
    }
    return place.x
  }
  places.forEach((place, index) => {
    if ('node' in place.slot) return
    const to = wanted[index] ?? place.x
    shove(index, to, Math.sign(to - place.x))
    seated.add(place)
  })

  const met = (shift: number): number =>
    places.filter(place => joinedTo(place).some(({ other, own, far }) => place.x + shift + own === other.x + far)).length
  const [first, last] = [places[0], places.at(-1)]
  const canShift = (shift: number): boolean =>
    first !== undefined && last !== undefined && first.x + shift >= 0 && last.x + last.width + shift <= columns
  const best = [0, -1, 1].filter(canShift).reduce((kept, shift) => (met(shift) > met(kept) ? shift : kept), 0)
  for (const place of places) place.x += best
}

/** How much a wire weighs where the place at its end `near` is moved toward it: a lane's `LANE_WEIGHT` times a box's, and one with the flow `FLOW_WEIGHT` times one against it. */
const weightOf = (near: End, wire: Wire): number => ('lane' in near.place.slot ? LANE_WEIGHT : 1) * (wire.isUp ? 1 : FLOW_WEIGHT)

/** A column a place's wire would have it stand at, how much the wire weighs, and its rank. */
type Wish = { at: number; weight: number; rank: number }

/**
 * The column that half of what `wishes` of the highest rank among them weigh
 * wants a place to stand at or left of, and half at or right of; where they
 * split evenly between two, the column halfway between, so that a place
 * wished two ways stands between.
 */
function medianOf(wishes: Wish[]): number | undefined {
  const top = Math.max(...wishes.map(wish => wish.rank))
  const sorted = wishes.filter(wish => wish.rank === top).sort((a, b) => a.at - b.at)
  const half = sorted.reduce((sum, wish) => sum + wish.weight, 0) / 2
  let seen = 0
  for (const [index, wish] of sorted.entries()) {
    seen += wish.weight
    if (seen > half) return wish.at
    if (seen === half) return Math.round((wish.at + (sorted[index + 1]?.at ?? wish.at)) / 2)
  }
  return undefined
}

/**
 * Balances a shelf against the places of `beside` its wires join it to: each
 * place stands where its wires to them run least sideways, all told, of the
 * seatings that keep the places in their order, a gap apart, and within the
 * shelf's `columns`; a lane's wires weigh `LANE_WEIGHT` times a box's, and a
 * wire with the flow `FLOW_WEIGHT` times one against it. Where `rankOf` ranks
 * the wires, only those of the highest rank count where a place, or a run of
 * places, has wires of more than one. A place with no such wire stands where
 * its neighbors let it, and a shelf with none is left where it was. The best
 * seating is found by pooling: places in order, each at its wires' median,
 * and any two that would stand out of order merged into one run at the
 * median of all their wires; a place with no wires joins the run before it.
 */
function balance(shelf: Shelf, columns: number, beside: Place[], wires: Wire[], rankOf: (wire: Wire) => number, gap: number): void {
  const { places } = shelf
  const isBeside = new Set(beside)
  const offsets = places.map((_, index) => places.slice(0, index).reduce((sum, place) => sum + place.width + gap, 0))
  const indexOf = new Map(places.map((place, index) => [place, index]))
  const wishes: Wish[][] = places.map(() => [])
  for (const wire of wires) {
    for (const [near, far] of [[wire.from, wire.to], [wire.to, wire.from]] as const) {
      const index = indexOf.get(near.place)
      if (index === undefined || !isBeside.has(far.place) || isBeside.has(near.place)) continue
      const weight = weightOf(near, wire)
      wishes[index]?.push({ at: far.place.x + far.at - near.at - (offsets[index] ?? 0), weight, rank: rankOf(wire) })
    }
  }
  const runs: Array<{ first: number; last: number; wishes: Wish[]; at: number | undefined }> = []
  places.forEach((_, index) => {
    const before = runs.at(-1)
    if ((wishes[index] ?? []).length === 0 && before !== undefined) {
      before.last = index
      return
    }
    let run = { first: index, last: index, wishes: wishes[index] ?? [], at: medianOf(wishes[index] ?? []) }
    for (let before = runs.at(-1); before?.at !== undefined && run.at !== undefined && before.at > run.at; before = runs.at(-1)) {
      runs.pop()
      const pooled = [...before.wishes, ...run.wishes]
      run = { first: before.first, last: run.last, wishes: pooled, at: medianOf(pooled) }
    }
    runs.push(run)
  })
  let at = runs.find(run => run.at !== undefined)?.at
  if (at === undefined) return
  const last = places.length - 1
  const most = Math.max(0, columns - (offsets[last] ?? 0) - (places[last]?.width ?? 0))
  for (const run of runs) {
    at = Math.max(at, run.at ?? at)
    for (let index = run.first; index <= run.last; index += 1) {
      const place = places[index]
      if (place !== undefined) place.x = Math.min(Math.max(at, 0), most) + (offsets[index] ?? 0)
    }
  }
}

/** How much a wire's bend weighs: one for an edge with the flow between two boxes, less by `FLOW_WEIGHT` against the flow, and less again by `LANE_BEND` to or from a lane. */
const bendOf = (wire: Wire): number => (wire.isUp ? 1 / FLOW_WEIGHT : 1) / ('lane' in wire.from.place.slot || 'lane' in wire.to.place.slot ? LANE_BEND : 1)

/**
 * What a seating weighs: its channels' rows and bent edges, all told, a row
 * as much as `ROW_BENDS` bent edges, each weighing as `bendOf` says; the
 * bent edges of each rank but the lowest, the highest first; and how far its
 * wires run sideways, each cell weighing as its wire's bend does.
 */
export type Cost = { weight: number; ranked: number[]; sideways: number }

/** What a seating of these channels weighs, with each wire's rank one of `ranks`, the highest first, as `rankOf` says. It lays every channel's tracks again. */
export function costOf(channels: Channel[], ranks: number[], rankOf: (wire: Wire) => number): Cost {
  let [rows, sideways] = [0, 0]
  const bent = ranks.map(() => 0)
  for (const channel of channels.filter(one => one.wires.length > 0)) {
    rows += layTracks(channel, place => place.x)
    for (const wire of channel.wires) {
      const { out, into } = routeOf(wire, place => place.x)
      const at = ranks.indexOf(rankOf(wire))
      bent[at] = (bent[at] ?? 0) + (out === into ? 0 : bendOf(wire))
      sideways += Math.abs(out - into) * bendOf(wire)
    }
  }
  return { weight: rows * ROW_BENDS + bent.reduce((sum, one) => sum + one, 0), ranked: bent.slice(0, -1), sideways }
}

/** Whether one list of numbers comes before another, the first that differs deciding. */
const isLess = (a: number[], b: number[]): boolean => {
  const at = a.findIndex((one, index) => one !== b[index])
  return at !== -1 && (a[at] ?? 0) < (b[at] ?? 0)
}

/**
 * Seats the shelves again, `RESEATS` times over, each time balancing every
 * shelf down against the one above it, back up against the one below, and
 * then against both, where they are laid out across the same columns. Of the
 * first seating and the seating after each pass, the one kept is the one
 * that weighs least, as `costOf` weighs it; of those that weigh the same,
 * the one whose bent edges of each rank but the lowest weigh least, the
 * highest rank first; and of those, the one whose wires run least sideways.
 * Where `rankOf` gives the wires more than one rank, the passes are then
 * made again from the seating kept, balanced by the wires of the highest
 * rank, and a seating they make is kept instead only where it weighs no
 * more and its edges of higher rank bend less. A layout whose shelves are
 * all laid out across its columns is then set in their middle.
 */
function reseat(shelves: Shelf[], channels: Channel[], columns: number, rankOf: (wire: Wire) => number, gap: number): void {
  const ranks = [...new Set(channels.flatMap(channel => channel.wires.map(rankOf)))].sort((a, b) => b - a)
  const seating = (): number[][] => shelves.map(shelf => shelf.places.map(place => place.x))
  let best = { cost: costOf(channels, ranks, rankOf), seating: seating() }
  const restore = (): void => shelves.forEach((shelf, index) => shelf.places.forEach((place, at) => (place.x = best.seating[index]?.[at] ?? place.x)))
  for (const isRanked of ranks.length > 1 ? [false, true] : [false]) {
    if (isRanked) restore()
    for (let time = 0; time < RESEATS; time += 1) {
      for (const pass of ['down', 'up', 'both'] as const) {
        const order = shelves.map((_, index) => index)
        for (const index of pass === 'up' ? order.reverse() : order) {
          const shelf = shelves[index]
          if (shelf === undefined) continue
          const [above, below] = [shelves[index - 1], shelves[index + 1]].map(one => (one?.across === shelf.across ? one : undefined))
          const sides = [...(pass !== 'up' && above !== undefined ? [{ shelf: above, channel: channels[index - 1] }] : []), ...(pass !== 'down' && below !== undefined ? [{ shelf: below, channel: channels[index] }] : [])]
          if (sides.length > 0) balance(shelf, shelf.across, sides.flatMap(side => side.shelf.places), sides.flatMap(side => side.channel?.wires ?? []), isRanked ? rankOf : () => 0, gap)
        }
        const cost = costOf(channels, ranks, rankOf)
        const isBetter = isRanked
          ? cost.weight <= best.cost.weight && isLess(cost.ranked, best.cost.ranked)
          : isLess([cost.weight, ...cost.ranked, cost.sideways], [best.cost.weight, ...best.cost.ranked, best.cost.sideways])
        if (isBetter) best = { cost, seating: seating() }
      }
    }
  }
  restore()
  if (!shelves.every(shelf => shelf.across === columns)) return
  const placed = shelves.flatMap(shelf => shelf.places)
  const [left, right] = [Math.min(...placed.map(place => place.x)), Math.max(...placed.map(place => place.x + place.width))]
  const by = Math.floor((columns - (right - left)) / 2) - left
  for (const place of placed) place.x += by
}

/** Where one end of a wire meets the run it turns on: its column, and whether it comes down to the run from above or up to it from below. */
type Stop = { wire: Wire; isOut: boolean; x: number; isAbove: boolean; isTurning: boolean }

/**
 * A stretch of track a bundle's wires turn on, from `start` to `end`: the
 * whole bundle, or one of the two halves of it that meet at a jog. Its wires
 * come down to it from above in the columns `fromAbove`, and up to it from
 * below in the columns `fromBelow`.
 */
type Run = { stops: Stop[]; start: number; end: number; jog: number | null; fromAbove: number[]; fromBelow: number[]; below: Set<number> }

const runOf = (stops: Stop[], jog: number | null): Run => {
  const columns = [...stops.map(stop => stop.x), ...(jog === null ? [] : [jog])]
  const turning = stops.filter(stop => stop.isTurning)
  return {
    stops,
    start: Math.min(...columns),
    end: Math.max(...columns),
    jog,
    fromAbove: turning.filter(stop => stop.isAbove).map(stop => stop.x),
    fromBelow: turning.filter(stop => !stop.isAbove).map(stop => stop.x),
    below: new Set(turning.filter(stop => !stop.isAbove).map(stop => stop.x)),
  }
}

/**
 * For each run, the runs it asks to go above, in the order they stand: those
 * that go down from their own track a column it comes down to its track, so
 * that below it the two would run into one line.
 */
function asksOf(runs: Run[]): number[][] {
  const belowAt = new Map<number, number[]>()
  runs.forEach((run, index) => {
    for (const column of run.below) belowAt.set(column, [...(belowAt.get(column) ?? []), index])
  })
  return runs.map((run, a) => [...new Set(run.fromAbove.flatMap(column => belowAt.get(column) ?? []))].filter(b => b !== a).sort((x, y) => x - y))
}

/** Runs that ask to go above one another in a ring, each above the next: none of them can be given it. What is `excused` of a run is not asked of it. */
function ringOf(runs: Run[], excused: Map<Run, Set<Run>>): number[] | undefined {
  const asks = asksOf(runs)
  const state = runs.map(() => 'new' as 'new' | 'open' | 'done')
  const path: number[] = []
  const follow = (a: number): number[] | undefined => {
    state[a] = 'open'
    path.push(a)
    for (const b of asks[a] ?? []) {
      if (excused.get(runs[a] as Run)?.has(runs[b] as Run)) continue
      if (state[b] === 'open') return path.slice(path.indexOf(b))
      const ring = state[b] === 'new' ? follow(b) : undefined
      if (ring !== undefined) return ring
    }
    path.pop()
    state[a] = 'done'
    return undefined
  }
  for (let a = 0; a < runs.length; a += 1) {
    const ring = state[a] === 'new' ? follow(a) : undefined
    if (ring !== undefined) return ring
  }
  return undefined
}

/**
 * Breaks a ring by cutting one run of it in two at a jog: a column between
 * where it must go below the run before it and where it must go above the run
 * after it, that no wire of the channel comes down or up. The half on each
 * side keeps the stops there, so the one goes above and the other below, and
 * the jog joins them. A run already cut is not cut again. Answers whether it
 * found a run to cut.
 */
function cutRing(runs: Run[], ring: number[], used: Set<number>): boolean {
  for (const [index, at] of ring.entries()) {
    const run = runs[at]
    const [before, after] = [runs[ring.at(index - 1) ?? at], runs[ring[(index + 1) % ring.length] ?? at]]
    if (run === undefined || before === undefined || after === undefined || run.jog !== null) continue
    const unders = before.fromAbove.filter(column => run.below.has(column))
    const overs = run.fromAbove.filter(column => after.below.has(column))
    for (const under of unders) {
      for (const over of overs) {
        const middle = (under + over) / 2
        const free = Array.from({ length: Math.abs(over - under) - 1 }, (_, step) => Math.min(under, over) + 1 + step)
          .filter(column => !used.has(column))
          .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0]
        if (free === undefined) continue
        const isOverSide = (stop: Stop): boolean => (stop.x < free) === (over < free)
        runs.splice(at, 1, runOf(run.stops.filter(isOverSide), free), runOf(run.stops.filter(stop => !isOverSide(stop)), free))
        used.add(free)
        return true
      }
    }
  }
  return false
}

/**
 * The runs of a channel's bundles, each with its track counted down from the
 * channel's first, where `xOf` puts each place. A bundle none of whose wires
 * turns needs no track, unless the channel `isLoose`: its two shelves slide
 * apart, so what goes straight as laid out may turn once they have slid. Two
 * runs share a track only where they do not meet, and never in a loose
 * channel. A run that comes down a column to its track goes above one that
 * goes down the same column from its own, so that the two never run into one
 * line; where runs ask that of each other in a ring, one of them is cut in two
 * at a jog, a column no wire comes down or up and no frame's side runs
 * down, and where none can be, one of the ring is not given it, and the
 * rings left are cut as before. Where every run has a track of its own, no
 * more are cut than `most` tracks allow. Of the runs that may go on a track,
 * the ones that cross the rest least from there go first.
 */
function tracksOf(bundles: Wire[][], xOf: (place: Place) => number, isLoose: boolean, most: number, walls: number[]): Map<Run, number> {
  const routes = new Map(bundles.flat().map(wire => [wire, routeOf(wire, xOf)]))
  const used = new Set([...[...routes.values()].flatMap(route => [route.out, route.into]), ...walls])
  const runs = bundles.flatMap(wires => {
    const stops = wires.flatMap(wire => {
      const { out, into } = routes.get(wire) ?? { out: 0, into: 0 }
      const isTurning = out !== into
      return [
        { wire, isOut: true, x: out, isAbove: wire.from.isAbove, isTurning },
        { wire, isOut: false, x: into, isAbove: wire.to.isAbove, isTurning },
      ]
    })
    return stops.some(stop => stop.isTurning) || isLoose ? [runOf(stops, null)] : []
  })
  const excused = new Map<Run, Set<Run>>()
  for (let ring = ringOf(runs, excused); ring !== undefined; ring = ringOf(runs, excused)) {
    if ((!isLoose || runs.length < most) && cutRing(runs, ring, used)) continue
    const [above, below] = [runs[ring[0] ?? 0], runs[ring[1 % ring.length] ?? 0]]
    if (above === undefined || below === undefined) break
    excused.set(above, new Set([...(excused.get(above) ?? []), below]))
  }

  const laid = runs.sort((a, b) => a.start - b.start)
  const [aboveOf, belowOf] = [laid.map(run => run.fromAbove.toSorted((x, y) => x - y)), laid.map(run => run.fromBelow.toSorted((x, y) => x - y))]
  /** How many of these columns, in order, stand within a run's ends. */
  const within = (columns: number[], run: Run): number => {
    const firstPast = (column: number, isAt: boolean): number => {
      let [low, high] = [0, columns.length]
      while (low < high) {
        const middle = (low + high) >> 1
        if ((columns[middle] ?? 0) < column || (!isAt && columns[middle] === column)) low = middle + 1
        else high = middle
      }
      return low
    }
    return Math.max(0, firstPast(run.end, true) - firstPast(run.start, false))
  }
  /** For each pair, whether the first asks to go above the second, and how many times they cross if it does. */
  const asks = laid.map(() => laid.map(() => false))
  asksOf(laid).forEach((below, a) => {
    for (const b of below) (asks[a] as boolean[])[b] = true
  })
  const crossings = laid.map((a, ai) => laid.map((b, bi) => within(aboveOf[bi] ?? [], a) + within(belowOf[ai] ?? [], b)))
  const mustFollow = (a: number, b: number): boolean => asks[b]?.[a] === true && asks[a]?.[b] !== true

  const waiting = new Set(laid.keys())
  const held = laid.map((_, a) => [...waiting].filter(b => b !== a && mustFollow(a, b)).length)
  const cost = laid.map((_, a) => [...waiting].reduce((sum, b) => sum + (crossings[a]?.[b] ?? 0) - (crossings[b]?.[a] ?? 0), 0))
  const tracks = new Map<Run, number>()
  for (let track = 0; waiting.size > 0; track += 1) {
    const free = [...waiting].filter(a => held[a] === 0)
    const first = [...waiting][0]
    const row: number[] = []
    for (const a of (free.length > 0 || first === undefined ? free : [first]).sort((x, y) => (cost[x] ?? 0) - (cost[y] ?? 0) || x - y)) {
      const [start, end] = [laid[a]?.start ?? 0, laid[a]?.end ?? 0]
      const isClear = row.every(b => (laid[b]?.end ?? 0) < start || end < (laid[b]?.start ?? 0))
      if (row.length === 0 || (isClear && !isLoose)) row.push(a)
    }
    for (const a of row) {
      const run = laid[a]
      if (run !== undefined) tracks.set(run, track)
      waiting.delete(a)
    }
    for (const a of row) {
      for (const b of waiting) {
        if (mustFollow(b, a)) held[b] = (held[b] ?? 0) - 1
        cost[b] = (cost[b] ?? 0) - (crossings[b]?.[a] ?? 0) + (crossings[a]?.[b] ?? 0)
      }
    }
  }
  return tracks
}

/**
 * Gives each of a channel's wires its track, where `xOf` puts each place, and
 * where its bundle was cut in two, the jog it steps to the other half's track
 * at; answers how many tracks the channel has, one where its wires are
 * merged. Laid again `under` a window, a loose channel has only the tracks it
 * was laid out with, but its runs are where the window shows them, so those
 * that do not meet share tracks again, and only where that is still too many
 * is each given its own, with no more cut than there is room for.
 */
export function layTracks(channel: Channel, xOf: (place: Place) => number, under?: number): number {
  const shared = under === undefined ? undefined : tracksOf(channel.bundles, xOf, false, Infinity, channel.walls)
  const tracks =
    shared !== undefined && under !== undefined && Math.max(0, ...shared.values()) < under
      ? shared
      : tracksOf(channel.bundles, xOf, channel.isLoose, under ?? Infinity, channel.walls)
  const onto = new Map<Wire, { out?: Run; into?: Run }>()
  for (const run of tracks.keys()) {
    for (const stop of run.stops) onto.set(stop.wire, { ...onto.get(stop.wire), [stop.isOut ? 'out' : 'into']: run })
  }
  for (const wire of channel.wires) {
    const { out, into } = onto.get(wire) ?? {}
    wire.track = out === undefined ? 0 : (tracks.get(out) ?? 0)
    wire.jog =
      out === undefined || into === undefined || out === into || into.jog === null
        ? null
        : { at: into.jog - xOf(wire.from.place), track: tracks.get(into) ?? 0 }
  }
  return Math.max(0, ...tracks.values()) + 1
}

/**
 * Lays a graph out. Where it is to `fold`, its layers are folded first into
 * as many as it takes for each to fit the room, a box and the room beside it
 * a node and a column and the room beside it a lane; where the boxes' ports
 * or the frames then make a shelf wider than the room after all, it is
 * folded again into less room, and kept so where that makes it narrower
 * and fits the room, or takes fewer of its columns times its rows. A graph
 * of more than
 * `FOLDED_NODES` nodes or `FOLDED_EDGES` edges is laid out unfolded. Every
 * face of every box is dealt its ports. The longest shelf is seated first, in
 * the middle of what it is laid out across, then each other shelf against the
 * one nearer it where the two are laid out across the same columns. Pinned,
 * that is the room's for every shelf that fits it, and the longest's for
 * every shelf longer than the room. The shelves are then seated again, as
 * `reseat` says, a wire ranked by the higher priority of its edge's two
 * nodes, and the channels given the rows their wires need.
 *
 * Running right, the room across is the room's rows less the foot's, and a
 * graph is laid out across no more of them than its longest shelf takes, so
 * that it is as tall as it needs and no taller; its layers are never folded,
 * since a graph that names no way runs right only where it fits as it is.
 */
export function layoutOf(graph: Graph, room: Room, look: Look, fold = false, direction: Direction = 'down'): Layout {
  if (direction === 'right') return laidOut(graph, Math.max(room.rows - 1, LEAST_ROWS), look, undefined, direction)
  const columns = Math.max(room.columns, LEAST_COLUMNS)
  if (!fold || graph.nodes.length > FOLDED_NODES || graph.edges.length > FOLDED_EDGES) return laidOut(graph, columns, look)
  let [into, layout] = [columns, laidOut(graph, columns, look, columns)]
  for (let tries = 0; tries < REFOLDS && breadthOf(layout) > columns; tries += 1) {
    into -= breadthOf(layout) - columns
    const narrower = laidOut(graph, columns, look, into)
    if (breadthOf(narrower) >= breadthOf(layout) || (breadthOf(narrower) > columns && breadthOf(narrower) * narrower.rows >= breadthOf(layout) * layout.rows)) break
    layout = narrower
  }
  return layout
}

/** A graph laid out across `room` running down, or across as much of it as it takes running right, its layers first folded `into` so many columns where they are to be. */
function laidOut(graph: Graph, room: number, look: Look, into?: number, direction: Direction = 'down'): Layout {
  const { gap } = GRAINS[direction]
  /** How wide a node's box is at least for the labels of the edges it may leave by, each beside a port of its own, with a gap after all but the last. */
  const writtenOf = (node: GraphletNode): number => {
    const leaving = graph.edges.filter(edge => edge.from !== edge.to && (edge.from === node.id || (!edge.isDirected && edge.to === node.id)))
    const labels = [...new Set(leaving.map(labelOf).filter(text => text !== ''))]
    return labels.length === 0 ? 0 : labels.reduce((sum, text) => sum + sizeOf(text) + 2, 0) + 1
  }
  const widths = new Map(graph.nodes.map(node => [node.id, direction === 'down' ? Math.max(widthOf(wordsOf(graph, node, look.labels)), writtenOf(node)) : wordsOf(graph, node, look.labels).lines.length + 2]))
  const size = { widthOf: (node: GraphletNode) => widths.get(node.id) ?? BOX_COLUMNS, gap }
  const layers = layersOf(
    graph,
    into === undefined ? undefined : { ...size, columns: into, frameOf: (group, inner) => Math.max(inner + 2 * FRAME_MARGIN, sizeOf(graph.groups.find(one => one.id === group)?.label ?? '') + TITLE_CELLS) },
    size,
  )
  const placeOf = new Map<Slot, Place>()
  const shelves: Shelf[] = layers.slots.map((slots, shelf) => {
    const places = slots.map(slot => {
      const words = 'node' in slot ? wordsOf(graph, slot.node, look.labels) : undefined
      const [wide, tall] = words === undefined ? [1, 0] : [widthOf(words), words.lines.length + 2]
      const [width, rows] = words === undefined || direction === 'down' ? [wide, tall] : [tall, wide]
      const place: Place = { slot, shelf, x: 0, width, rows, ...(words === undefined ? {} : { words }) }
      placeOf.set(slot, place)
      return place
    })
    const rows = Math.max(...places.map(place => place.rows))
    for (const place of places) if ('lane' in place.slot) place.rows = rows
    return { places, width: 0, across: room, top: 0, rows }
  })
  /** What a wire has written where it leaves its box: its label; nothing where it leaves a lane. */
  const saidOf = (wire: Wire): string => ('node' in wire.from.place.slot ? labelOf(wire.edge) : '')
  /** The rows a channel keeps on one side of its tracks for the arrowheads that point to that side's shelf and the labels of the edges that leave it: one running down, and running right as many as the longest label takes, and one more. */
  const bandOf = (wires: Wire[], isAbove: boolean): number => {
    const labels = wires.filter(wire => wire.from.isAbove === isAbove).map(saidOf).filter(label => label !== '')
    const hasHeads = wires.some(wire => wire.hasHead && wire.to.isAbove === isAbove)
    if (labels.length === 0) return hasHeads ? 1 : 0
    return GRAINS[direction].isLabelAcross ? 1 : Math.max(...labels.map(sizeOf)) + 1
  }
  const channels: Channel[] = shelves.map((shelf, index) => {
    const wires = wiresOf(layers.pieces[index] ?? [], layers.flats[index] ?? [], shelf, placeOf)
    return { top: 0, rows: 0, wires, bundles: bundlesOf(wires, look.edges), isLoose: false, topRows: bandOf(wires, true), bottomRows: bandOf(wires, false), frameBottom: 0, frameTop: 0, walls: [] }
  })
  dealPorts(shelves, channels, direction)

  for (const shelf of shelves) shelf.width = shelf.places.reduce((sum, place) => sum + place.width + gap, -gap)
  let columns = direction === 'down' ? room : Math.min(room, Math.max(LEAST_ROWS, ...shelves.map(shelf => shelf.width)))
  const widest = Math.max(columns, ...shelves.map(shelf => shelf.width))
  for (const shelf of shelves) shelf.across = look.scroll === 'sheet' || shelf.width > columns ? widest : columns
  const first = shelves.reduce((longest, shelf, index) => (shelf.width > (shelves[longest]?.width ?? 0) ? index : longest), 0)
  shelves.forEach((_, step) => {
    for (const index of step === 0 ? [first] : [first - step, first + step]) {
      const shelf = shelves[index]
      if (shelf === undefined) continue
      const nearer = step === 0 ? undefined : shelves[index < first ? index + 1 : index - 1]
      const between = channels[index < first ? index : index - 1]?.wires ?? []
      seat(shelf, shelf.across, nearer?.across === shelf.across ? nearer.places : [], between, gap)
    }
  })
  channels.forEach((channel, index) => {
    const [shelf, next] = [shelves[index], shelves[index + 1]]
    channel.isLoose = shelf !== undefined && next !== undefined && next.across !== shelf.across
    if (look.edges === 'merged') {
      const apart = channel.bundles.filter(bundle => bundle[0] !== undefined && isApart(bundle[0].edge))
      const shared = [true, false].map(isDirected => channel.wires.filter(wire => !isApart(wire.edge) && wire.edge.isDirected === isDirected))
      channel.bundles = [...shared.filter(bundle => bundle.length > 0), ...apart]
    }
    channel.bundles.forEach((bundle, at) => {
      for (const wire of bundle) wire.bundle = at
    })
  })
  const priority = new Map(graph.nodes.map(node => [node.id, priorityOf(node)]))
  const rankOf = (wire: Wire): number => Math.max(priority.get(wire.edge.from) ?? 0, priority.get(wire.edge.to) ?? 0)
  reseat(shelves, channels, columns, rankOf, gap)

  const frames = framesOf(graph, shelves, channels, direction === 'down' ? columns : room, gap, direction, rankOf)
  if (frames.length > 0) carve(shelves, channels, frames, direction === 'down' ? columns : room, direction)
  shelves.forEach((shelf, index) => {
    const spans = [...shelf.places, ...frames.filter(frame => frame.first <= index && index <= frame.last)]
    if (spans.length > 0) shelf.width = Math.max(shelf.width, Math.max(...spans.map(one => one.x + one.width)) - Math.min(...spans.map(one => one.x)))
  })
  if (frames.length > 0) {
    const end = Math.max(...shelves.flatMap(shelf => shelf.places.map(place => place.x + place.width)), ...frames.map(frame => frame.x + frame.width))
    if (direction === 'right') columns = Math.min(room, Math.max(columns, end))
    for (const shelf of shelves) shelf.across = end > columns ? end : columns
    for (const channel of channels) channel.isLoose = false
    for (const frame of frames) {
      const [below, above] = [channels[frame.last], channels[frame.first - 1]]
      if (below !== undefined) below.frameBottom = FRAME_ENDS[direction]
      if (above !== undefined) above.frameTop = FRAME_ENDS[direction]
      for (const channel of channels.slice(frame.first, frame.last)) channel.walls.push(frame.x, frame.x + frame.width - 1)
    }
  }

  let top = frames.some(frame => frame.first === 0) ? FRAME_ENDS[direction] : 0
  shelves.forEach((shelf, index) => {
    const [channel, next] = [channels[index], shelves[index + 1]]
    shelf.top = top
    top += shelf.rows
    if (channel === undefined) return
    const tracks = layTracks(channel, place => place.x)
    const spare = channel.isLoose && channel.bundles.length > 1 ? 1 : 0
    const framing = channel.frameBottom + channel.frameTop
    channel.top = top
    channel.rows =
      channel.wires.length === 0
        ? Math.max(next === undefined ? 0 : 1, framing)
        : channel.topRows + tracks + channel.bottomRows + spare + framing
    top += channel.rows
  })
  for (const frame of frames) {
    const [above, below] = [channels[frame.first - 1], channels[frame.last]]
    frame.top = above === undefined ? 0 : above.top + above.rows - above.bottomRows - above.frameTop
    frame.bottom = below === undefined ? top : below.top + below.topRows + below.frameBottom - 1
  }
  return { shelves, channels, frames, columns, rows: top, direction, gap }
}

/**
 * Each group's frame, around every place of it, standing `FRAME_MARGIN` out
 * from them across their shelves, or more where the label needs it, what it
 * holds then in its middle, the places of each shelf first packed a gap
 * apart around their own middle, and moved as little as keeps them within
 * the widest shelf's, and then, `ALIGNS` times over, moved together within
 * it toward where their wires to the group's other shelves run least
 * sideways; and where the graph runs down, wide enough
 * for the group's label in its top border, between the lines that cross it
 * into the group's first shelf and out of it, or else widened back past the
 * first of them until it is. On each shelf it spans, what is
 * not the group's is moved clear of it, a gap from its border: what stands
 * before it in the shelf's order moved back where it can be, and else the
 * frame, with all it holds, moved on; and what stands after it moved on.
 * That is done over and over, the frames only ever moving on, until nothing
 * is moved. Where that leaves the layout reaching past `columns`, every shelf
 * is packed from its start instead, the frames still whole. A shelf a frame
 * passes with nothing of its group on it takes the frame where it stands
 * among the shelf's places. Last, what stands on the shelves is settled, as
 * `settle` says.
 */
function framesOf(graph: Graph, shelves: Shelf[], channels: Channel[], columns: number, gap: number, direction: Direction, rankOf: (wire: Wire) => number): Frame[] {
  if (graph.groups.length === 0) return []
  const inGroups = channels
    .flatMap(channel => channel.wires)
    .filter(wire => wire.from.place.shelf !== wire.to.place.shelf && groupOfSlot(wire.from.place.slot) !== undefined && groupOfSlot(wire.from.place.slot) === groupOfSlot(wire.to.place.slot))
  const framed = graph.groups.flatMap(group => {
    const held = shelves.flatMap((shelf, index) => shelf.places.filter(place => groupOfSlot(place.slot) === group.id).map(place => ({ place, index })))
    if (held.length === 0) return []
    const spanOf = (places: Place[]): [number, number] => [Math.min(...places.map(place => place.x)), Math.max(...places.map(place => place.x + place.width))]
    const blocks = [...new Set(held.map(one => one.index))].map(index => held.filter(one => one.index === index).map(({ place }) => place).toSorted((a, b) => a.x - b.x))
    for (const block of blocks) {
      const [start, end] = spanOf(block)
      let x = Math.round((start + end) / 2 - block.reduce((sum, place) => sum + place.width + gap, -gap) / 2)
      for (const place of block) {
        place.x = x
        x += place.width + gap
      }
    }
    const [wide, high] = spanOf(blocks.reduce((widest, block) => (spanOf(block)[1] - spanOf(block)[0] > spanOf(widest)[1] - spanOf(widest)[0] ? block : widest)))
    for (const block of blocks) {
      const [start, end] = spanOf(block)
      const by = start < wide ? wide - start : end > high ? high - end : 0
      for (const place of block) place.x += by
    }
    const members = new Set(held.map(({ place }) => place))
    const within = inGroups.filter(wire => members.has(wire.from.place))
    for (let time = 0; time < ALIGNS; time += 1) {
      for (const block of time % 2 === 0 ? blocks : blocks.toReversed()) {
        const [start, end] = spanOf(block)
        const wishes = within.flatMap(wire =>
          ([[wire.from, wire.to], [wire.to, wire.from]] as const)
            .filter(([near]) => block.includes(near.place))
            .map(([near, far]) => ({ at: far.place.x + far.at - near.at - (near.place.x - start), weight: weightOf(near, wire), rank: 0 })),
        )
        const at = medianOf(wishes)
        if (at === undefined) continue
        const by = Math.max(wide - start, Math.min(high - end, at - start))
        for (const place of block) place.x += by
      }
    }
    const [left, right] = spanOf(held.map(({ place }) => place))
    const title = direction === 'down' ? sizeOf(group.label) + TITLE_CELLS : 0
    const [first, last] = [Math.min(...held.map(({ index }) => index)), Math.max(...held.map(({ index }) => index))]
    const [inner, width] = [right - left + 2 * FRAME_MARGIN, Math.max(right - left + 2 * FRAME_MARGIN, title)]
    const frame: Frame = { group, first, last, x: left - FRAME_MARGIN - Math.floor((width - inner) / 2), width, top: 0, bottom: 0 }
    if (direction === 'down') {
      const crossed = (channels[first - 1]?.wires ?? []).flatMap(wire => {
        const { out, into } = routeOf(wire, place => place.x)
        return members.has(wire.to.place) && !wire.to.isAbove ? [into] : members.has(wire.from.place) && !wire.from.isAbove ? [out] : []
      })
      const stops = [frame.x + 1, ...new Set(crossed.toSorted((a, b) => a - b)), frame.x + frame.width - 1]
      const room = Math.max(...stops.slice(1).map((stop, index) => stop - (stops[index] ?? 0) - 2))
      const wanted = sizeOf(group.label) + 2
      if (room < wanted) {
        const end = frame.x + frame.width
        frame.x -= wanted - Math.max(0, (stops[1] ?? 0) - frame.x - 3)
        frame.width = end - frame.x
      }
    }
    return [{ frame, held: members }]
  })
  const shift = (one: (typeof framed)[number], by: number): void => {
    one.frame.x += by
    for (const place of one.held) place.x += by
  }
  for (const one of framed) if (one.frame.x < 0) shift(one, -one.frame.x)
  const isHeld = (place: Place): boolean => framed.some(({ held }) => held.has(place))
  /** Moves what stands on each shelf clear of the frames there, over and over until nothing moves: back where it can be first, unless the shelves are being packed, and else on. */
  const clear = (isPacking: boolean): void => {
    for (let isMoved = true; isMoved; ) {
      isMoved = false
      shelves.forEach((shelf, index) => {
        const spanning = framed.filter(({ frame }) => frame.first <= index && index <= frame.last)
        if (spanning.length === 0 && !isPacking) return
        const items: Array<{ place: Place } | { one: (typeof framed)[number] }> = []
        for (const place of shelf.places) {
          const one = spanning.find(({ held }) => held.has(place))
          if (one === undefined) items.push({ place })
          else if (!items.some(item => 'one' in item && item.one === one)) items.push({ one })
        }
        const middleOf = (item: (typeof items)[number]): number => ('place' in item ? item.place.x + item.place.width / 2 : item.one.frame.x + item.one.frame.width / 2)
        for (const one of spanning.filter(one => !items.some(item => 'one' in item && item.one === one))) {
          const at = items.findIndex(item => middleOf(item) > one.frame.x + one.frame.width / 2)
          items.splice(at === -1 ? items.length : at, 0, { one })
        }
        let limit = Infinity
        for (const item of isPacking ? [] : [...items].reverse()) {
          if ('one' in item) limit = item.one.frame.x - gap
          else {
            item.place.x = Math.min(item.place.x, limit - item.place.width)
            limit = item.place.x - gap
          }
        }
        let cursor = 0
        for (const item of items) {
          if ('place' in item) {
            item.place.x = Math.max(item.place.x, cursor)
            cursor = item.place.x + item.place.width + gap
            continue
          }
          if (item.one.frame.x < cursor) {
            shift(item.one, cursor - item.one.frame.x)
            isMoved = true
          }
          cursor = item.one.frame.x + item.one.frame.width + gap
        }
      })
    }
  }
  clear(false)
  const spans = [...shelves.flatMap(shelf => shelf.places), ...framed.map(({ frame }) => frame)]
  if (Math.max(...spans.map(one => one.x + one.width)) > columns) {
    for (const one of framed) shift(one, -one.frame.x)
    for (const place of shelves.flatMap(shelf => shelf.places)) if (!isHeld(place)) place.x = 0
    clear(true)
  }
  settle(
    [
      ...framed.map(one => ({ first: one.frame.first, last: one.frame.last, width: one.frame.width, x: () => one.frame.x, move: (by: number) => shift(one, by), places: one.held })),
      ...shelves.flatMap((shelf, index) =>
        shelf.places.filter(place => !isHeld(place)).map(place => ({ first: index, last: index, width: place.width, x: () => place.x, move: (by: number) => void (place.x += by), places: new Set([place]) })),
      ),
    ],
    channels,
    columns,
    gap,
    direction === 'down',
    rankOf,
  )
  return framed.map(({ frame }) => frame)
}

/** What moves as one where frames stand: a frame with all it holds, from shelf `first` to shelf `last`, or a place no frame holds. */
type Unit = { first: number; last: number; width: number; x: () => number; move: (by: number) => void; places: Set<Place> }

/**
 * Settles the units, each frame with all it holds and each place no frame
 * holds, each keeping its order among the units it shares a shelf with: up
 * to `SETTLES` times or until nothing moves, each unit in turn moves toward
 * where its wires to other units run least sideways, weighed and ranked as
 * `balance` weighs and ranks them, as far as its neighbors on its shelves let
 * it, and within `columns` or as far as the units already reach, where that
 * is farther. A settling that weighs more than what it started from, as
 * `costOf` weighs it, is undone. Last, where they are to be `isCentered`,
 * they are set in the middle of `columns` where they fit them, and else
 * they start where they started.
 */
function settle(units: Unit[], channels: Channel[], columns: number, gap: number, isCentered: boolean, rankOf: (wire: Wire) => number): void {
  const start = Math.min(...units.map(unit => unit.x()))
  const reach = (): number => Math.max(0, ...units.map(unit => unit.x() + unit.width))
  const limit = Math.max(columns, reach())
  const ranks = [...new Set(channels.flatMap(channel => channel.wires.map(rankOf)))].sort((a, b) => b - a)
  const weighed = (cost: Cost): number[] => [cost.weight, ...cost.ranked, cost.sideways]
  const before = weighed(costOf(channels, ranks, rankOf))
  const started = units.map(unit => unit.x())
  const unitOf = new Map(units.flatMap(unit => [...unit.places].map(place => [place, unit] as const)))
  const pulls = new Map<Unit, Array<{ near: End; far: End; weight: number; rank: number }>>()
  for (const wire of channels.flatMap(channel => channel.wires)) {
    for (const [near, far] of [[wire.from, wire.to], [wire.to, wire.from]] as const) {
      const [own, other] = [unitOf.get(near.place), unitOf.get(far.place)]
      if (own === undefined || other === undefined || own === other) continue
      const pulled = pulls.get(own) ?? []
      pulled.push({ near, far, weight: weightOf(near, wire), rank: rankOf(wire) })
      pulls.set(own, pulled)
    }
  }
  const neighbors = new Map(units.map(unit => [unit, { before: new Set<Unit>(), after: new Set<Unit>() }]))
  const onShelf = new Map<number, Unit[]>()
  for (const unit of units) {
    for (let shelf = unit.first; shelf <= unit.last; shelf += 1) {
      const row = onShelf.get(shelf) ?? []
      row.push(unit)
      onShelf.set(shelf, row)
    }
  }
  for (const row of onShelf.values()) {
    row.sort((a, b) => a.x() - b.x())
    row.forEach((unit, index) => {
      const [left, right] = [row[index - 1], row[index + 1]]
      if (left !== undefined) neighbors.get(unit)?.before.add(left)
      if (right !== undefined) neighbors.get(unit)?.after.add(right)
    })
  }
  const order = units.toSorted((a, b) => a.x() - b.x())
  for (let time = 0; time < SETTLES; time += 1) {
    let isMoved = false
    for (const unit of time % 2 === 0 ? order : order.toReversed()) {
      const wanted = medianOf((pulls.get(unit) ?? []).map(({ near, far, weight, rank }) => ({ at: far.place.x + far.at - near.place.x - near.at, weight, rank })))
      const beside = neighbors.get(unit)
      if (wanted === undefined || beside === undefined) continue
      const least = Math.max(-unit.x(), ...[...beside.before].map(other => other.x() + other.width + gap - unit.x()))
      const most = Math.min(limit - unit.width - unit.x(), ...[...beside.after].map(other => other.x() - gap - unit.width - unit.x()))
      const by = Math.max(least, Math.min(most, wanted))
      if (by === 0) continue
      unit.move(by)
      isMoved = true
    }
    if (!isMoved) break
  }
  if (isLess(before, weighed(costOf(channels, ranks, rankOf)))) units.forEach((unit, index) => unit.move((started[index] ?? unit.x()) - unit.x()))
  const left = Math.min(...units.map(unit => unit.x()))
  const by = isCentered && reach() - left <= columns ? Math.floor((columns - (reach() - left)) / 2) - left : start - left
  for (const unit of units) unit.move(by)
}

/**
 * Takes out a layout's empty columns: where more than `CARVED_GAP` columns
 * side by side hold nothing on any shelf or in any channel but stretches of
 * line that cross them, no box, lane, frame's side or label, edge's label, or
 * line that turns up or down, the rest of them are taken out, and what stands
 * past them moved back as many. Every shelf moves alike, so no line that ran
 * straight bends; a graph that runs down and then fits `columns` is set in
 * their middle.
 */
function carve(shelves: Shelf[], channels: Channel[], frames: Frame[], columns: number, direction: Direction): void {
  const places = shelves.flatMap(shelf => shelf.places)
  const spans = [...places, ...frames]
  const [low, high] = [Math.min(...spans.map(one => one.x)), Math.max(...spans.map(one => one.x + one.width))]
  const isUsed = Array.from({ length: Math.max(0, high - low) }, () => false)
  const use = (from: number, to: number): void => {
    for (let x = Math.max(from, low); x < Math.min(to, high); x += 1) isUsed[x - low] = true
  }
  for (const place of places) use(place.x, place.x + place.width)
  for (const frame of frames) {
    use(frame.x, frame.x + (direction === 'down' ? sizeOf(frame.group.label) + TITLE_CELLS : 1))
    use(frame.x + frame.width - 1, frame.x + frame.width)
  }
  for (const wire of channels.flatMap(channel => channel.wires)) {
    const { out, into } = routeOf(wire, place => place.x)
    use(out, out + 1)
    use(into, into + 1)
    const label = labelOf(wire.edge)
    if (direction === 'down' && label !== '' && 'node' in wire.from.place.slot) use(wire.from.place.x + wire.from.at, wire.from.place.x + wire.from.at + 2 + sizeOf(label))
  }
  const before: number[] = [0]
  let run = 0
  isUsed.forEach((used, at) => {
    run = used ? 0 : run + 1
    before.push((before[at] ?? 0) + (run > CARVED_GAP ? 1 : 0))
  })
  const moved = (x: number): number => x - (before[Math.min(Math.max(x - low, 0), before.length - 1)] ?? 0)
  for (const place of places) place.x = moved(place.x)
  for (const frame of frames) {
    const end = moved(frame.x + frame.width - 1) + 1
    frame.x = moved(frame.x)
    frame.width = end - frame.x
  }
  const reach = high - (before.at(-1) ?? 0) - low
  if (direction !== 'down' || reach > columns) return
  const by = Math.floor((columns - reach) / 2) - low
  for (const place of places) place.x += by
  for (const frame of frames) frame.x += by
}

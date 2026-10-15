import type { GraphletLink, GraphletNode } from '../types'
import { clipMiddle } from './draw'
import type { Room } from './draw'
import { layersOf } from './layers'
import type { Graph, Piece, Slot } from './layers'

// The layout: a box a node, the boxes of a layer side by side on a shelf with
// the lanes of the links that pass through it, and between two shelves a
// channel the links cross in. It is worked out once for a room's width, in an
// order that never changes, whatever window it is then seen through.

/**
 * How a graph wider than its room scrolls. `pinned`: each shelf slides only
 * as far as it is long, so one that fits the room stays in view. `sheet`: the
 * shelves lie on one sheet as wide as the longest, each box by what it is
 * linked to, and the sheet moves whole.
 */
export type Scroll = 'pinned' | 'sheet'

/** What becomes of a label too long for one line of a box: it is wrapped onto more lines, or cut to one. */
export type Labels = 'wrap' | 'clip'

/**
 * How the links that cross between two shelves share the rows there.
 * `separate`: one box's links turn on a row of their own wherever they would
 * run into another's. `merged`: they all turn on one row, which is shorter,
 * and are told apart by selecting a node.
 */
export type Links = 'separate' | 'merged'

/** How graphs are drawn: the person's settings. */
export type Look = { scroll: Scroll; labels: Labels; links: Links }

/**
 * The widest a line of a wrapped label is, the longest a word may be and
 * still keep a line to itself, and the most lines a label is wrapped onto.
 */
const LABEL_COLUMNS = 24
const WORD_COLUMNS = 32
const LABEL_ROWS = 3
/** The most characters of a label that is cut to one line. */
const CLIP_CHARS = 32
/** What a box adds to its widest line: a space and a border on each side. */
const BOX_PADDING = 4
/** The narrowest box: one whose two ports stand apart. A shorter label is set in its middle. */
const BOX_COLUMNS = 7
/** The room between two neighbors on a shelf. */
export const GAP = 2
/** The narrowest room a graph is laid out for: a box of the widest kind, and a little over. */
export const LEAST_COLUMNS = 40
/** How far apart two ports of one face of a box are. */
const PORT_STEP = 2
/** The characters a long word may be broken after with nothing lost. */
const BREAKS = '/-_.'
/** The sign in the box of a node that links to itself. */
const LOOP = '↺'

export const sizeOf = (text: string): number => [...text].length

/**
 * A label on lines no wider than `columns`, broken at its spaces. A word of
 * up to `word` characters keeps a line to itself, however wide that makes
 * the line; a longer one is broken after the last `/`, `-`, `_` or `.` that
 * fits a line, or with none, where the line ends. What is left after `rows`
 * lines is cut short on the last of them, and ends in an ellipsis.
 */
export function wrap(label: string, columns: number, rows: number, word = columns): string[] {
  const lines: string[] = []
  let line = ''
  for (const next of label.split(' ')) {
    let rest = [...next]
    if (line !== '' && sizeOf(line) + 1 + rest.length <= columns) {
      line = `${line} ${next}`
      continue
    }
    if (line !== '') lines.push(line)
    while (rest.length > word) {
      const fits = rest.slice(0, columns)
      const last = Math.max(...[...BREAKS].map(mark => fits.lastIndexOf(mark)))
      const cut = last > 0 ? last + 1 : columns
      lines.push(rest.slice(0, cut).join(''))
      rest = rest.slice(cut)
    }
    line = rest.join('')
  }
  if (line !== '') lines.push(line)
  if (lines.length <= rows) return lines
  const last = [...lines.slice(rows - 1).join(' ')]
  return [...lines.slice(0, rows - 1), `${last.slice(0, columns - 1).join('').trimEnd()}…`]
}

/** A label on the lines every picture of its node wraps it onto. */
export function linesOf(label: string): string[] {
  return wrap(label, LABEL_COLUMNS, LABEL_ROWS, WORD_COLUMNS)
}

/** What a box says: its node's mark, the lines of its label, and what follows the last of them, dim. */
export type Words = { mark: string; lines: string[]; badge: string }

/** What a node's box says. A node that links to itself carries the sign of a loop before its badge. */
export function wordsOf(graph: Graph, node: GraphletNode, labels: Labels): Words {
  const isLooped = graph.links.some(link => link.from === node.id && link.to === node.id)
  const after = [...(isLooped ? [LOOP] : []), ...(node.badge === undefined ? [] : [node.badge])].join(' ')
  return {
    mark: node.mark === undefined ? '' : `${node.mark} `,
    lines: labels === 'clip' ? [clipMiddle(node.label, CLIP_CHARS)] : linesOf(node.label),
    badge: after === '' ? '' : `  ${after}`,
  }
}

/**
 * A slot where it stands: on which shelf, where it starts along the shelf,
 * how wide it is and how many rows it takes from the shelf's top, and for a
 * node what its box says.
 */
export type Place = { slot: Slot; shelf: number; x: number; width: number; rows: number; words?: Words }

/**
 * One layer as it is laid out: its places, the columns they take side by
 * side, the columns they are laid out across, which the window slides over
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
 * A link's stretch across one channel, from the place it leaves to the place
 * it reaches, with an arrowhead there where that place is the link's own end
 * and the graph is directed. One that `isUp` runs against the flow. Where it
 * does not go straight across, it turns on the row of the channel that is its
 * `track`, and where its bundle runs on two tracks, steps across to the
 * other at its `jog`. It keeps `clearOf` the other ports of the face it
 * leaves, of the columns next to its own where it leaves with others, and in
 * an undirected graph of the columns next to the other ports, so that two
 * ticks never touch.
 */
export type Wire = {
  link: GraphletLink
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
 * The rows between two shelves, or under the last: a row of the arrowheads
 * that point up, when there are any, then a row a track, then a row of the
 * arrowheads that point down, when there are any. Its wires turn in bundles,
 * each on a track; with the wires merged it has none, and one track. A
 * channel `isLoose` where its two shelves slide apart under a window.
 */
export type Channel = {
  top: number
  rows: number
  wires: Wire[]
  bundles: Wire[][]
  isLoose: boolean
  hasUpHeads: boolean
  hasDownHeads: boolean
}

/** A graph laid out for a room `columns` wide. Channel `n` is under shelf `n`. */
export type Layout = { shelves: Shelf[]; channels: Channel[]; columns: number; rows: number }

export const middleOf = (place: Place, x: number): number => x + Math.floor(place.width / 2)

/**
 * The column a wire leaves in and the column it arrives in, where `xOf` puts
 * each place. A wire that crosses its channel leaves its box straight toward
 * the port it is bound for where the box reaches over that port, clear of
 * its corners and of its other ports, and else by its own port, to turn on
 * its track.
 */
export function routeOf(wire: Wire, xOf: (place: Place) => number): { out: number; into: number } {
  const { place } = wire.from
  const x = xOf(place)
  const into = xOf(wire.to.place) + wire.to.at
  const own = x + wire.from.at
  if ('lane' in place.slot || wire.from.isAbove === wire.to.isAbove) return { out: own, into }
  const isOver = into > x + 1 && into < x + place.width - 2 && !wire.clearOf.includes(into - x)
  return { out: isOver ? into : own, into }
}

/** The wires of the channel under a shelf: the stretches that cross it, and the links between two nodes of that shelf. */
function wiresOf(pieces: Piece[], flats: GraphletLink[], shelf: Shelf, placeOf: Map<Slot, Place>, isDirected: boolean): Wire[] {
  const wires: Wire[] = []
  const rest = { bundle: 0, track: 0, jog: null, clearOf: [] }
  for (const piece of pieces) {
    const [upper, lower] = [placeOf.get(piece.upper), placeOf.get(piece.lower)]
    if (upper === undefined || lower === undefined) continue
    const above: End = { place: upper, isAbove: true, at: 0 }
    const below: End = { place: lower, isAbove: false, at: 0 }
    const [from, to] = piece.isUp ? [below, above] : [above, below]
    wires.push({ link: piece.link, from, to, hasHead: isDirected && 'node' in to.place.slot, isUp: piece.isUp, ...rest })
  }
  const find = (id: string): Place | undefined =>
    shelf.places.find(place => 'node' in place.slot && place.slot.node.id === id)
  for (const link of flats) {
    const [from, to] = [find(link.from), find(link.to)]
    if (from === undefined || to === undefined) continue
    wires.push({
      link,
      from: { place: from, isAbove: true, at: 0 },
      to: { place: to, isAbove: true, at: 0 },
      hasHead: isDirected,
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
 * that run together they say nothing false. In an undirected graph, whose
 * lines have no arrowheads to tell their two ends apart, a link between two
 * nodes of the shelf is a bundle alone. Merged, it is every wire that runs
 * the one way, with the flow or against it.
 */
function bundlesOf(wires: Wire[], links: Links, isDirected: boolean): Wire[][] {
  const ids = new Map<Place, number>()
  const faceOf = (end: End): string => {
    if (!ids.has(end.place)) ids.set(end.place, ids.size)
    return `${ids.get(end.place)}${end.isAbove ? 'v' : '^'}`
  }
  const isAlone = (wire: Wire): boolean => links === 'separate' && !isDirected && wire.from.isAbove === wire.to.isAbove
  const fans = new Map<string, Wire[]>()
  for (const wire of wires.filter(wire => !isAlone(wire))) {
    const key = links === 'merged' ? `${wire.isUp}` : `${wire.isUp} ${faceOf(wire.from)}`
    fans.set(key, [...(fans.get(key) ?? []), wire])
  }
  const bound = new Map<string, Wire[]>()
  for (const [key, fan] of fans) {
    const reached = [...new Set(fan.map(wire => faceOf(wire.to)))].sort().join(' ')
    const sign = links === 'merged' ? key : `${key.split(' ')[0]} ${reached}`
    bound.set(sign, [...(bound.get(sign) ?? []), ...fan])
  }
  return [...bound.values(), ...wires.filter(isAlone).map(wire => [wire])]
}

/**
 * Deals every face of every place its ports, and widens a box that is too
 * narrow for them. The wires of one bundle that leave a face share a port,
 * and so do the wires of one bundle that reach it, so two bundles never run
 * into one port. A face's ports stand `PORT_STEP` apart across its middle, in
 * the order of where along their shelves the places at the wires' other ends
 * stand, so that wires from the left arrive on the left; of two that lead to
 * a place in common, the one with the flow is first, wherever their other
 * wires lead, so that the links two boxes have each way run side by side and
 * never cross. A wire that leaves straight keeps clear of the face's other
 * ports, and in an undirected graph, where a wire meets the box it reaches at
 * a tick too, of the columns beside them.
 */
function dealPorts(shelves: Shelf[], channels: Channel[], isDirected: boolean): void {
  type Group = { ends: End[]; leaving: Wire[]; heading: number; isUp: boolean; far: Set<Place> }
  const faces = new Map<Place, { top: Group[]; bottom: Group[] }>()
  const alongOf = (place: Place): number =>
    ((shelves[place.shelf]?.places.indexOf(place) ?? 0) + 0.5) / (shelves[place.shelf]?.places.length ?? 1)
  const groupOf = (ends: End[], far: End[], leaving: Wire[], isUp: boolean): void => {
    const [first] = ends
    if (first === undefined) return
    const face = faces.get(first.place) ?? { top: [], bottom: [] }
    faces.set(first.place, face)
    const heading = far.reduce((sum, end) => sum + alongOf(end.place), 0) / far.length
    ;(first.isAbove ? face.bottom : face.top).push({ ends, leaving, heading, isUp, far: new Set(far.map(end => end.place)) })
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
  for (const [place, face] of faces) {
    if ('lane' in place.slot) continue
    const most = Math.max(face.top.length, face.bottom.length)
    place.width = Math.max(place.width, PORT_STEP * most + 1)
    for (const groups of [ordered(face.top), ordered(face.bottom)]) {
      const ports = groups.map((_, index) => Math.floor(place.width / 2) + PORT_STEP * index - (groups.length - 1))
      groups.forEach((group, index) => {
        const own = ports[index] ?? 0
        const beside = group.leaving.length > 1 ? [own - 1, own + 1] : []
        for (const end of group.ends) end.at = own
        const others = ports.filter((_, other) => other !== index)
        const clear = isDirected ? others : others.flatMap(port => [port - 1, port, port + 1])
        for (const wire of group.leaving) wire.clearOf = [...clear, ...beside]
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
 * column of the port it is joined to, so that a link runs straight through
 * the shelves it passes, and pushes aside the boxes in its way. Last, the
 * shelf moves a column either way where that stands more of it exactly over
 * or under what it is joined to. With nothing beside it to sit by, the shelf
 * is centered.
 */
function seat(shelf: Shelf, columns: number, beside: Place[], wires: Wire[]): void {
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
      x += place.width + GAP
    }
    return
  }

  let x = 0
  places.forEach((place, index) => {
    place.x = Math.max(x, wanted[index] ?? x)
    x = place.x + place.width + GAP
  })
  let limit = columns
  for (const place of [...places].reverse()) {
    place.x = Math.max(0, Math.min(place.x, limit - place.width))
    limit = place.x - GAP
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
    if (place === undefined) return way > 0 ? columns + GAP : -GAP
    if ((to - place.x) * way <= 0 || seated.has(place)) return place.x
    const next = places[index + way]
    if (way > 0) {
      place.x = Math.min(to, shove(index + 1, to + place.width + GAP, way) - GAP - place.width)
    } else {
      place.x = Math.max(to, shove(index - 1, to - GAP - (next?.width ?? 0), way) + (next?.width ?? 0) + GAP)
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

/** Whether run `a` must go above run `b`: it comes down a column that `b` goes down from its own, so below it they would run into one line. */
const asksAbove = (a: Run, b: Run): boolean => a.fromAbove.some(column => b.below.has(column))

/** Runs that ask to go above one another in a ring, each above the next: none of them can be given it. */
function ringOf(runs: Run[]): number[] | undefined {
  const state = runs.map(() => 'new' as 'new' | 'open' | 'done')
  const path: number[] = []
  const follow = (a: number): number[] | undefined => {
    state[a] = 'open'
    path.push(a)
    for (let b = 0; b < runs.length; b += 1) {
      if (b === a || !asksAbove(runs[a] as Run, runs[b] as Run)) continue
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
 * at a jog, and where none can be, one of the ring is not given it; where
 * every run has a track of its own, no more are cut than `most` tracks allow.
 * Of the
 * runs that may go on a track, the ones that cross the rest least from there
 * go first.
 */
function tracksOf(bundles: Wire[][], xOf: (place: Place) => number, isLoose: boolean, most: number): Map<Run, number> {
  const routes = new Map(bundles.flat().map(wire => [wire, routeOf(wire, xOf)]))
  const used = new Set([...routes.values()].flatMap(route => [route.out, route.into]))
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
  const canCut = (): boolean => !isLoose || runs.length < most
  for (let ring = ringOf(runs); ring !== undefined && canCut() && cutRing(runs, ring, used); ring = ringOf(runs));

  const laid = runs.sort((a, b) => a.start - b.start)
  const within = (columns: number[], run: Run): number => columns.filter(column => column > run.start && column < run.end).length
  /** For each pair, whether the first asks to go above the second, and how many times they cross if it does. */
  const asks = laid.map(a => laid.map(b => asksAbove(a, b)))
  const crossings = laid.map(a => laid.map(b => within(b.fromAbove, a) + within(a.fromBelow, b)))
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
  const shared = under === undefined ? undefined : tracksOf(channel.bundles, xOf, false, Infinity)
  const tracks =
    shared !== undefined && under !== undefined && Math.max(0, ...shared.values()) < under
      ? shared
      : tracksOf(channel.bundles, xOf, channel.isLoose, under ?? Infinity)
  const onto = new Map<Wire, { out?: Run; into?: Run }>()
  for (const run of tracks.keys()) {
    for (const stop of run.stops) onto.set(stop.wire, { ...onto.get(stop.wire), [stop.isOut ? 'out' : 'into']: run })
  }
  for (const wire of channel.wires) {
    const { out, into } = onto.get(wire) ?? {}
    wire.track = out === undefined ? wire.track : (tracks.get(out) ?? 0)
    wire.jog =
      out === undefined || into === undefined || out === into || into.jog === null
        ? null
        : { at: into.jog - xOf(wire.from.place), track: tracks.get(into) ?? 0 }
  }
  return Math.max(0, ...tracks.values()) + 1
}

/**
 * Lays a graph out. Every face of every box is dealt its ports. The longest
 * shelf is seated first, in the middle of what it is laid out across, then
 * each other shelf against the one nearer it where the two are laid out
 * across the same columns. Pinned, that is the room's for every shelf that
 * fits it, and a longer shelf runs on alone from the left edge. The channels
 * are then given the rows their wires need.
 */
export function layoutOf(graph: Graph, room: Room, look: Look): Layout {
  const columns = Math.max(room.columns, LEAST_COLUMNS)
  const layers = layersOf(graph)
  const placeOf = new Map<Slot, Place>()
  const shelves: Shelf[] = layers.slots.map((slots, shelf) => {
    const places = slots.map(slot => {
      const words = 'node' in slot ? wordsOf(graph, slot.node, look.labels) : undefined
      const lines = words?.lines ?? []
      const widest = Math.max(1, ...lines.map((line, index) => sizeOf(line) + (index === lines.length - 1 ? sizeOf(words?.badge ?? '') : 0)))
      const width = words === undefined ? 1 : Math.max(BOX_COLUMNS, sizeOf(words.mark) + widest + BOX_PADDING)
      const place: Place = { slot, shelf, x: 0, width, rows: lines.length + 2, ...(words === undefined ? {} : { words }) }
      placeOf.set(slot, place)
      return place
    })
    const rows = Math.max(...places.map(place => place.rows))
    for (const place of places) if ('lane' in place.slot) place.rows = rows
    return { places, width: 0, across: columns, top: 0, rows }
  })
  const channels: Channel[] = shelves.map((shelf, index) => {
    const wires = wiresOf(layers.pieces[index] ?? [], layers.flats[index] ?? [], shelf, placeOf, graph.isDirected)
    return {
      top: 0,
      rows: 0,
      wires,
      bundles: bundlesOf(wires, look.links, graph.isDirected),
      isLoose: false,
      hasUpHeads: wires.some(wire => wire.hasHead && wire.to.isAbove),
      hasDownHeads: wires.some(wire => wire.hasHead && !wire.to.isAbove),
    }
  })
  dealPorts(shelves, channels, graph.isDirected)

  for (const shelf of shelves) shelf.width = shelf.places.reduce((sum, place) => sum + place.width + GAP, -GAP)
  const widest = Math.max(columns, ...shelves.map(shelf => shelf.width))
  for (const shelf of shelves) shelf.across = look.scroll === 'sheet' ? widest : Math.max(columns, shelf.width)
  const first = shelves.reduce((longest, shelf, index) => (shelf.width > (shelves[longest]?.width ?? 0) ? index : longest), 0)
  shelves.forEach((_, step) => {
    for (const index of step === 0 ? [first] : [first - step, first + step]) {
      const shelf = shelves[index]
      if (shelf === undefined) continue
      const nearer = step === 0 ? undefined : shelves[index < first ? index + 1 : index - 1]
      const between = channels[index < first ? index : index - 1]?.wires ?? []
      seat(shelf, shelf.across, nearer?.across === shelf.across ? nearer.places : [], between)
    }
  })

  let top = 0
  shelves.forEach((shelf, index) => {
    const [channel, next] = [channels[index], shelves[index + 1]]
    shelf.top = top
    top += shelf.rows
    if (channel === undefined) return
    channel.isLoose = next !== undefined && next.across !== shelf.across
    channel.bundles.forEach((bundle, index) => {
      for (const wire of bundle) wire.bundle = look.links === 'merged' ? 0 : index
    })
    if (look.links === 'merged') channel.bundles = []
    const tracks = layTracks(channel, place => place.x)
    const heads = (channel.hasUpHeads ? 1 : 0) + (channel.hasDownHeads ? 1 : 0)
    channel.top = top
    channel.rows = channel.wires.length === 0 ? (next === undefined ? 0 : 1) : heads + tracks
    top += channel.rows
  })
  return { shelves, channels, columns, rows: top }
}

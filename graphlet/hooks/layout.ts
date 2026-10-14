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
/** How far from a box's middle its second port is. */
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
 * above the channel, and which of the place's two ports it meets it at. With
 * the flow, down the drawing, a wire leaves a box's bottom and enters a box's
 * top by the `main` port; against it, by the `side` port.
 */
export type End = { place: Place; isAbove: boolean; port: 'main' | 'side' }

/**
 * A link's stretch across one channel, from the place it leaves to the place
 * it reaches, with an arrowhead there where that place is the link's own end.
 * One that `isUp` runs against the flow. Where it does not go straight
 * across, it turns on the row of the channel that is its `track`.
 */
export type Wire = { link: GraphletLink; from: End; to: End; hasHead: boolean; isUp: boolean; track: number }

/**
 * The rows between two shelves, or under the last: a row of the arrowheads
 * that point up, when there are any, then a row a track, then a row of the
 * arrowheads that point down, when there are any.
 */
export type Channel = { top: number; rows: number; wires: Wire[]; hasUpHeads: boolean; hasDownHeads: boolean }

/** A graph laid out for a room `columns` wide. Channel `n` is under shelf `n`. */
export type Layout = { shelves: Shelf[]; channels: Channel[]; columns: number; rows: number }

export const middleOf = (place: Place, x: number): number => x + Math.floor(place.width / 2)

/** The column an end meets its place at, the place starting at `x`. */
export function columnOf(end: End, x: number): number {
  const { place } = end
  if ('lane' in place.slot) return x
  const middle = middleOf(place, x)
  return end.port === 'main' ? middle : Math.min(middle + PORT_STEP, x + place.width - 2)
}

/**
 * The column a wire leaves in and the column it arrives in, where `xOf` puts
 * each place. A wire that crosses its channel leaves its box straight toward
 * the port it is bound for where the box reaches over that port, clear of
 * its corners, and else by its own port, to turn on its track.
 */
export function routeOf(wire: Wire, xOf: (place: Place) => number): { out: number; into: number } {
  const { place } = wire.from
  const x = xOf(place)
  const into = columnOf(wire.to, xOf(wire.to.place))
  const own = columnOf(wire.from, x)
  if ('lane' in place.slot || wire.from.isAbove === wire.to.isAbove) return { out: own, into }
  const other = columnOf({ ...wire.from, port: wire.from.port === 'main' ? 'side' : 'main' }, x)
  const isOver = into > x + 1 && into < x + place.width - 2 && into !== other
  return { out: isOver ? into : own, into }
}

/**
 * Seats a shelf's places across `columns`, by the places of `beside` they
 * are joined to. A box goes as near as it can to the middle of the boxes it
 * is joined to, or with none, of the lanes; the boxes are pushed apart where
 * they would overlap, and slid back together toward where they wanted to be.
 * A lane then goes to the very column of what it is joined to, so that a
 * link runs straight through the shelves it passes, and pushes aside the
 * boxes in its way. Last, the shelf moves a column either way where that
 * stands more of it exactly over or under what it is joined to. With nothing
 * beside it to sit by, the shelf is centered.
 */
function seat(shelf: Shelf, columns: number, beside: Place[], pieces: Piece[]): void {
  const { places } = shelf
  const placeOf = new Map(beside.map(place => [place.slot, place]))
  const joins = new Map<Slot, Array<{ other: Place; isUp: boolean }>>()
  for (const piece of pieces) {
    for (const [own, far] of [[piece.upper, piece.lower], [piece.lower, piece.upper]] as const) {
      const other = placeOf.get(far)
      if (other !== undefined) joins.set(own, [...(joins.get(own) ?? []), { other, isUp: piece.isUp }])
    }
  }
  const joinedTo = (place: Place): Array<{ other: Place; isUp: boolean }> => joins.get(place.slot) ?? []
  const portOf = (place: Place, isUp: boolean): number =>
    columnOf({ place, isAbove: true, port: isUp ? 'side' : 'main' }, place.x) - place.x
  const wanted = places.map(place => {
    const all = joinedTo(place)
    const boxes = all.filter(({ other }) => 'node' in other.slot)
    const joined = 'node' in place.slot && boxes.length > 0 ? boxes : all
    if (joined.length === 0) return undefined
    const column = joined.reduce((sum, { other, isUp }) => sum + other.x + portOf(other, isUp), 0) / joined.length
    return Math.round(column) - ('lane' in place.slot ? 0 : Math.floor(place.width / 2))
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
    places.filter(place => joinedTo(place).some(({ other, isUp }) => place.x + shift + portOf(place, isUp) === other.x + portOf(other, isUp)))
      .length
  const [first, last] = [places[0], places.at(-1)]
  const canShift = (shift: number): boolean =>
    first !== undefined && last !== undefined && first.x + shift >= 0 && last.x + last.width + shift <= columns
  const best = [0, -1, 1].filter(canShift).reduce((kept, shift) => (met(shift) > met(kept) ? shift : kept), 0)
  for (const place of places) place.x += best
}

/** The wires of the channel under a shelf: the stretches that cross it, and the links between two nodes of that shelf. */
function wiresOf(pieces: Piece[], flats: GraphletLink[], shelf: Shelf, placeOf: Map<Slot, Place>): Wire[] {
  const wires: Wire[] = []
  for (const piece of pieces) {
    const [upper, lower] = [placeOf.get(piece.upper), placeOf.get(piece.lower)]
    if (upper === undefined || lower === undefined) continue
    const port = piece.isUp ? 'side' : 'main'
    const above: End = { place: upper, isAbove: true, port }
    const below: End = { place: lower, isAbove: false, port }
    const [from, to] = piece.isUp ? [below, above] : [above, below]
    wires.push({ link: piece.link, from, to, hasHead: 'node' in to.place.slot, isUp: piece.isUp, track: 0 })
  }
  const find = (id: string): Place | undefined =>
    shelf.places.find(place => 'node' in place.slot && place.slot.node.id === id)
  for (const link of flats) {
    const [from, to] = [find(link.from), find(link.to)]
    if (from === undefined || to === undefined) continue
    wires.push({
      link,
      from: { place: from, isAbove: true, port: 'main' },
      to: { place: to, isAbove: true, port: 'side' },
      hasHead: true,
      isUp: false,
      track: 0,
    })
  }
  return wires
}

/**
 * Wires that turn on one track: the wires that leave one port, a fan, with
 * the fans of every other port that is wired to the very same ports, so
 * that run together they say nothing false. `isTurning` says whether any of
 * them turns as the layout stands, `start` and `end` are the columns they
 * span, and the rest the columns the ones that turn come down to the track
 * in and go down from it in.
 */
type Bundle = { wires: Wire[]; isTurning: boolean; start: number; end: number; fromAbove: number[]; fromBelow: number[] }

const xOf = (place: Place): number => place.x

/** A channel's wires in bundles. Wires with and against the flow are never bundled together. */
function bundlesOf(wires: Wire[]): Bundle[] {
  const portOf = (end: End): string => `${end.place.shelf} ${end.place.x} ${end.port}`
  const fans = new Map<string, Wire[]>()
  for (const wire of wires) {
    const key = `${wire.isUp} ${portOf(wire.from)}`
    fans.set(key, [...(fans.get(key) ?? []), wire])
  }
  const bound = new Map<string, Wire[]>()
  for (const [key, fan] of fans) {
    const reached = [...new Set(fan.map(wire => portOf(wire.to)))].sort().join(', ')
    const sign = `${key.split(' ')[0]} ${reached}`
    bound.set(sign, [...(bound.get(sign) ?? []), ...fan])
  }
  return [...bound.values()].map(group => {
    const routes = group.map(wire => ({ wire, ...routeOf(wire, xOf) }))
    const turning = routes.filter(route => route.out !== route.into)
    const columns = routes.flatMap(route => [route.out, route.into])
    return {
      wires: group,
      isTurning: turning.length > 0,
      start: Math.min(...columns),
      end: Math.max(...columns),
      fromAbove: turning.flatMap(route => [
        ...(route.wire.from.isAbove ? [route.out] : []),
        ...(route.wire.to.isAbove ? [route.into] : []),
      ]),
      fromBelow: turning.flatMap(route => [
        ...(route.wire.from.isAbove ? [] : [route.out]),
        ...(route.wire.to.isAbove ? [] : [route.into]),
      ]),
    }
  })
}

/**
 * The track of each bundle, counted down from the channel's first. Two
 * bundles share a track only where their runs do not meet, and never where
 * the channel `isLoose`: its two shelves slide apart, so what does not meet
 * as they are laid out may once they have slid. A bundle that comes down a
 * column to its track goes above one that goes down the same column from
 * its own, so that the two never run into one line; where bundles ask that
 * of each other in a ring, one of them is not given it. Of the bundles that
 * may go on a track, the ones that cross the rest least from there go first.
 */
function tracksOf(bundles: Bundle[], isLoose: boolean): Map<Bundle, number> {
  const laid = bundles.filter(bundle => isLoose || bundle.isTurning).sort((a, b) => a.start - b.start)
  const leaving = laid.map(bundle => new Set(bundle.fromBelow))
  const within = (columns: number[], bundle: Bundle): number =>
    columns.filter(column => column > bundle.start && column < bundle.end).length
  /** For each pair, whether the first asks to go above the second, and how many times they cross if it does. */
  const asks = laid.map(a => laid.map((_, b) => a.fromAbove.some(column => leaving[b]?.has(column))))
  const crossings = laid.map(a => laid.map(b => within(b.fromAbove, a) + within(a.fromBelow, b)))
  const mustFollow = (a: number, b: number): boolean => asks[b]?.[a] === true && asks[a]?.[b] !== true

  const waiting = new Set(laid.keys())
  const held = laid.map((_, a) => [...waiting].filter(b => b !== a && mustFollow(a, b)).length)
  const cost = laid.map((_, a) => [...waiting].reduce((sum, b) => sum + (crossings[a]?.[b] ?? 0) - (crossings[b]?.[a] ?? 0), 0))
  const tracks = new Map<Bundle, number>()
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
      const bundle = laid[a]
      if (bundle !== undefined) tracks.set(bundle, track)
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
 * Gives each of a channel's wires its track, and answers how many tracks
 * the channel has. Merged, that is one for them all.
 */
function layTracks(wires: Wire[], links: Links, isLoose: boolean): number {
  if (links === 'merged') return 1
  const tracks = tracksOf(bundlesOf(wires), isLoose)
  for (const [bundle, track] of tracks) for (const wire of bundle.wires) wire.track = track
  return Math.max(0, ...tracks.values()) + 1
}

/**
 * Lays a graph out: the longest shelf first, in the middle of what it is
 * laid out across, then each other shelf against the one nearer it where the
 * two are laid out across the same columns. Pinned, that is the room's for
 * every shelf that fits it, and a longer shelf runs on alone from the left
 * edge. The channels are then given the rows their wires need.
 */
export function layoutOf(graph: Graph, room: Room, look: Look): Layout {
  const columns = Math.max(room.columns, LEAST_COLUMNS)
  const layers = layersOf(graph)
  const placeOf = new Map<Slot, Place>()
  const shelves: Shelf[] = layers.slots.map((slots, shelf) => {
    let x = 0
    const places = slots.map(slot => {
      const words = 'node' in slot ? wordsOf(graph, slot.node, look.labels) : undefined
      const lines = words?.lines ?? []
      const widest = Math.max(1, ...lines.map((line, index) => sizeOf(line) + (index === lines.length - 1 ? sizeOf(words?.badge ?? '') : 0)))
      const width = words === undefined ? 1 : Math.max(BOX_COLUMNS, sizeOf(words.mark) + widest + BOX_PADDING)
      const place: Place = { slot, shelf, x, width, rows: lines.length + 2, ...(words === undefined ? {} : { words }) }
      placeOf.set(slot, place)
      x += width + GAP
      return place
    })
    const rows = Math.max(...places.map(place => place.rows))
    for (const place of places) if ('lane' in place.slot) place.rows = rows
    return { places, width: x - GAP, across: columns, top: 0, rows }
  })
  const widest = Math.max(columns, ...shelves.map(shelf => shelf.width))
  for (const shelf of shelves) shelf.across = look.scroll === 'sheet' ? widest : Math.max(columns, shelf.width)
  const first = shelves.reduce((longest, shelf, index) => (shelf.width > (shelves[longest]?.width ?? 0) ? index : longest), 0)
  shelves.forEach((_, step) => {
    for (const index of step === 0 ? [first] : [first - step, first + step]) {
      const shelf = shelves[index]
      if (shelf === undefined) continue
      const nearer = step === 0 ? undefined : shelves[index < first ? index + 1 : index - 1]
      const between = layers.pieces[index < first ? index : index - 1] ?? []
      seat(shelf, shelf.across, nearer?.across === shelf.across ? nearer.places : [], between)
    }
  })

  const channels: Channel[] = []
  let top = 0
  shelves.forEach((shelf, index) => {
    shelf.top = top
    top += shelf.rows
    const wires = wiresOf(layers.pieces[index] ?? [], layers.flats[index] ?? [], shelf, placeOf)
    const hasUpHeads = wires.some(wire => wire.hasHead && wire.to.isAbove)
    const hasDownHeads = wires.some(wire => wire.hasHead && !wire.to.isAbove)
    const next = shelves[index + 1]
    const isLoose = next !== undefined && next.across !== shelf.across
    const tracks = layTracks(wires, look.links, isLoose)
    const rows = wires.length === 0 ? (next === undefined ? 0 : 1) : (hasUpHeads ? 1 : 0) + tracks + (hasDownHeads ? 1 : 0)
    channels.push({ top, rows, wires, hasUpHeads, hasDownHeads })
    top += rows
  })
  return { shelves, channels, columns, rows: top }
}

import type { GraphletGraph, GraphletLink, GraphletNode, GraphletTone } from '../types'
import { rowText } from './draw'
import type { Drawing, Room, Span } from './draw'
import { TONES } from './layers'
import type { Graph } from './layers'
import type { View } from './view'

// Graphs in a reply: the fenced blocks marked `graphlet` that the model
// writes, each read from its lines of arrows, and drawn as a still picture,
// or as plain text where a surface draws no picture.

/** The language a fenced block names to be drawn as a graph. */
export const LANGUAGE = 'graphlet'

/** What the model is told of graph blocks, as one section of the system prompt. */
export const GUIDE = `# Graphs in replies

This session draws graphs in your replies. When how things connect matters to the answer (a flow, dependencies, states and their transitions), write a fenced block whose language is \`${LANGUAGE}\`, one chain of nodes per line:

\`\`\`${LANGUAGE}
Start -> Read the request -> Valid?
Valid? ->|yes| Save it -> Done
Valid? ->|no| Ask for a correction [warn]
Ask for a correction -> Read the request
\`\`\`

- A node is its label: one label is one node. \`->\` links one way; \`--\` joins two nodes with no direction, as friends.
- \`->|yes|\` writes a word or two on a link. A tone after a label colors its node: [good], [warn], [bad], [note], [dim]. There are no shapes, styles, or subgraphs.
- Keep labels short and a graph to a couple dozen nodes: split a larger one. Introduce it with a sentence.
- Only in replies, never in files. When asked for Mermaid, Graphviz, or a text diagram, write that instead.`

/** A reply cut at its graph blocks, in order: the runs of text between them, and each block's graph. */
export type Part = { text: string } | { graph: GraphletGraph }

/** The line that opens a fenced block: its run of backticks, with none after it on the line, or of tildes; and the first word after the run. */
const OPENING = /^\s*(`{3,}(?=[^`]*$)|~{3,})\s*(\S*)/
/** A line that does nothing but close a fenced block. */
const CLOSING = /^\s*(`{3,}|~{3,})\s*$/
/**
 * What joins two nodes on a line: an arrow, `->`, `-->` or `→`, a link the way
 * it points, and so `<-`, `<--` or `←`; one with a head at each end, `<->` or
 * `↔`, a link each way; and two dashes or more with a blank before them and a
 * blank or a pipe after, ` -- `, a link with no direction, so that dashes within a label, as in
 * `--force`, stay part of it. Words in pipes right after it, `->|yes|`, with
 * no arrow among them, are the link's label.
 */
const JOIN = /(<-+>|↔|<-+|←|-+>|→|(?<=^|\s)-{2,}(?=\s|$|\|))(?:\|((?:(?!-+>)[^|\n])*)\|)?/
/** A label Mermaid's way, `A -- yes --> B`, which is read as `A ->|yes| B`. */
const SAID_BETWEEN = /(?<=^|\s)-{2,}[ \t]+([^-|\n]+?)[ \t]+-+>/g
/** A tone in brackets at the end of a label. */
const TONE = new RegExp(`\\[(${TONES.join('|')})\\]$`, 'i')

/** What is written between two arrows, less the blanks around it and the dashes at its end. */
const trimmed = (said: string): string => {
  let end = said.length
  while (end > 0 && (said[end - 1] === '-' || /\s/.test(said[end - 1] ?? ''))) end -= 1
  return said.slice(0, end).trim()
}

/** Whether a line closes the fenced block `fence` opened: a run of the same character, at least as long. */
const closes = (line: string, fence: string): boolean => {
  const [, run = ''] = CLOSING.exec(line) ?? []
  return run[0] === fence[0] && run.length >= fence.length
}

/**
 * A reply cut at its graph blocks. A graph block is a fenced block whose
 * language is `graphlet`, that is closed, and that names a node. Every other
 * fenced block stays in the text whole, a `graphlet` one inside it too, and a
 * block still open runs to the reply's end, as it is drawn while it streams.
 * A run of text with nothing in it but blanks is left out.
 */
export function partsOf(reply: string): Part[] {
  const lines = reply.split('\n')
  const parts: Part[] = []
  let run: string[] = []
  const flush = (): void => {
    const first = run.findIndex(line => line.trim() !== '')
    if (first !== -1) parts.push({ text: run.slice(first).join('\n').trimEnd() })
    run = []
  }
  for (let at = 0; at < lines.length; ) {
    const line = lines[at] ?? ''
    const [, fence = '', language = ''] = OPENING.exec(line) ?? []
    if (fence === '') {
      run.push(line)
      at += 1
      continue
    }
    const end = lines.findIndex((one, index) => index > at && closes(one, fence))
    if (end === -1) {
      run.push(...lines.slice(at))
      break
    }
    const graph = language.toLowerCase() === LANGUAGE ? graphOf(lines.slice(at + 1, end)) : undefined
    if (graph !== undefined && graph.nodes.length > 0) {
      flush()
      parts.push({ graph })
    } else {
      run.push(...lines.slice(at, end + 1))
    }
    at = end + 1
  }
  flush()
  return parts
}

/**
 * The graph a block's lines say. Each line is a chain of labels joined by
 * arrows or dashes, each a link, with the words in pipes after one written on
 * it; a line with neither names a node alone. An arrow is a link that runs
 * one way, a two-headed arrow a link each way, and a dash a link that runs no
 * way; a block whose links are all dashes is an undirected graph. A node is
 * known by its label, so
 * the same label on any line is the same node, and a tone in brackets after a
 * label is its node's, the first one given. A blank label is passed over, and
 * pipes left at a label's ends are not part of it.
 */
export function graphOf(lines: readonly string[]): GraphletGraph {
  const nodes = new Map<string, GraphletNode>()
  const joins: Array<GraphletLink & { join: string }> = []
  const nodeOf = (said: string): string[] => {
    const words = trimmed(trimmed(said).replace(/^\|+|\|+$/g, ''))
    const tone = TONE.exec(words)
    const id = trimmed(tone === null ? words : words.slice(0, tone.index)).replace(/\s+/g, ' ')
    if (id === '') return []
    const node = nodes.get(id) ?? { id, label: id }
    if (node.tone === undefined && tone?.[1] !== undefined) node.tone = tone[1].toLowerCase() as GraphletTone
    nodes.set(id, node)
    return [id]
  }
  for (const line of lines) {
    const said = line.replace(SAID_BETWEEN, '->|$1|').split(JOIN)
    let from: string | undefined
    for (let at = 0; at < said.length; at += 3) {
      const [to] = nodeOf(said[at] ?? '')
      if (to === undefined) continue
      const label = said[at - 1]?.trim() ?? ''
      if (from !== undefined) joins.push({ from, to, join: said[at - 2] ?? '', ...(label === '' ? {} : { label }) })
      from = to
    }
  }
  const isUndirected = joins.length > 0 && joins.every(({ join }) => /^-+$/.test(join))
  const links = joins.flatMap(({ join, ...link }) => {
    const back = { ...link, from: link.to, to: link.from }
    if (/^-+$/.test(join)) return [isUndirected ? link : { ...link, isDirected: false }]
    if (/^-+>$|^→$/.test(join)) return [link]
    return /^<-+$|^←$/.test(join) ? [back] : [link, back]
  })
  return { nodes: [...nodes.values()], links, ...(isUndirected ? { isDirected: false } : {}) }
}

/** A row less its first `count` cells. */
const after = (row: Span[], count: number): Span[] => {
  let left = count
  return row.flatMap(span => {
    const characters = [...span.text]
    const cut = Math.min(left, characters.length)
    left -= cut
    return cut === characters.length ? [] : [{ ...span, text: characters.slice(cut).join('') }]
  })
}

/**
 * A graph drawn as a still picture in a room: laid out once in it, as tall as
 * it needs, from its top left corner, with nothing selected.
 * Nothing in it answers a click, so its foot keeps only the counts of what is
 * out of view, and is left off where nothing is. The columns blank down the
 * whole of its left side are cut away.
 */
export function pictureOf(view: View, graph: Graph, room: Room): Drawing {
  const drawing = view.draw(graph, null, room, { x: 0, y: 0 })
  const foot = drawing.rows.at(-1)
  if (foot === undefined) return { rows: [], hits: [] }
  const corner = drawing.hits.find(hit => 'page' in hit)
  const counts = rowText(foot).slice(0, corner?.x).trimEnd()
  const kept = [...drawing.rows.slice(0, -1), ...(counts === '' ? [] : [[{ text: counts, paint: 'dim' as const }]])]
  const blank = Math.min(
    ...kept.map(rowText).filter(text => text !== '').map(text => text.length - text.trimStart().length),
  )
  return { rows: kept.map(row => after(row, blank)), hits: [] }
}

/** A picture as plain text, fenced as code marked `text`, by more backticks than any run of them inside it. */
export function fencedOf(drawing: Drawing): string {
  const text = drawing.rows.map(rowText).join('\n')
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map(run => run.length + 1)))
  return `${fence}text\n${text}\n${fence}`
}

import type { GraphletTone } from '../types'

// What a picture is made of: rows of painted text, and the rectangles of them
// that answer a click. Plain data, so a drawing crosses to the surface module
// whole.

/** How a run of text is painted: a node's tone, or `accent` for what is selected or linked to it. */
export type Paint = GraphletTone | 'accent'

/** The color each paint takes: a theme key, so it follows the person's theme. */
export const COLORS: Readonly<Record<Paint, string | undefined>> = {
  plain: undefined,
  dim: undefined,
  note: 'suggestion',
  good: 'success',
  warn: 'warning',
  bad: 'error',
  accent: 'claude',
}

/** A run of text in one paint. */
export type Span = { text: string; paint: Paint; isBold?: true; isInverse?: true }

/** How a surface's `Text` paints a run. */
export function styleOf(span: Span): { color?: string; dimColor?: true; bold?: true; inverse?: true } {
  const color = COLORS[span.paint]
  return {
    ...(color === undefined ? {} : { color }),
    ...(span.paint === 'dim' ? { dimColor: true } : {}),
    ...(span.isBold ? { bold: true } : {}),
    ...(span.isInverse ? { inverse: true } : {}),
  }
}

/** Where a window stands over something larger than it, or how far it is to move: in cells. */
export type Pan = { x: number; y: number }

/**
 * A rectangle of the drawing, in cells, and what a click inside it does:
 * selects `node`, scrolls the graph `by`, or opens the graph as a web page.
 */
export type Hit = { x: number; y: number; width: number; height: number } & ({ node: string } | { by: Pan } | { page: true })

/** A picture: its rows, top to bottom, and where a click does what. */
export type Drawing = { rows: Span[][]; hits: Hit[] }

/** The room a drawing may take, in cells. */
export type Room = { columns: number; rows: number }

/**
 * Where a window `size` long over `total` stands to show `start` to `end`. A
 * window at `from` that already shows them stays there; one that does not
 * moves just far enough to show them and `margin` more on each side, or as
 * much of that margin as the window has room for. What is longer than the
 * window is shown from its start.
 */
export function reveal(from: number, start: number, end: number, size: number, total: number, margin = 0): number {
  const most = Math.max(0, total - size)
  const at = Math.min(Math.max(Math.round(from), 0), most)
  if (start >= at && end <= at + size) return at
  const spare = Math.max(0, Math.min(margin, Math.floor((size - (end - start)) / 2)))
  const shown = Math.min(Math.max(at, end + spare - size), start - spare)
  return Math.min(Math.max(shown, 0), most)
}

/** How many nodes lie past each edge of a window. */
export type Beyond = { left: number; right: number; above: number; below: number }

/**
 * The row under a graph larger than its room: how many nodes lie past each
 * edge, the sides' at the sides and the others between them. A click on a
 * count scrolls the graph a `page` that way.
 */
export function beyondRow(beyond: Beyond, columns: number, page: Pan, y: number): { row: Span[]; hits: Hit[] } {
  const left = beyond.left > 0 ? `← ${beyond.left} more` : ''
  const right = beyond.right > 0 ? `${beyond.right} more →` : ''
  const between = (more: string): string[] => [
    ...(beyond.above > 0 ? [`↑ ${beyond.above}${more}`] : []),
    ...(beyond.below > 0 ? [`↓ ${beyond.below}${more}`] : []),
  ]
  const room = columns - left.length - right.length - 4
  const [first = '', second = ''] = between(' more').join(' · ').length <= room ? between(' more') : between('')
  const middle = first === '' || second === '' ? first + second : `${first} · ${second}`
  const start = Math.max(left === '' ? 0 : left.length + 2, Math.floor((columns - middle.length) / 2))
  const gap = Math.max(1, columns - start - middle.length - right.length)

  const hits: Hit[] = []
  const hit = (text: string, x: number, by: Pan): void => {
    if (text !== '') hits.push({ x, y, width: text.length, height: 1, by })
  }
  hit(left, 0, { x: -page.x, y: 0 })
  hit(beyond.above > 0 ? first : '', start, { x: 0, y: -page.y })
  hit(beyond.below > 0 ? (beyond.above > 0 ? second : first) : '', start + middle.length - (second || first).length, {
    x: 0,
    y: page.y,
  })
  hit(right, start + middle.length + gap, { x: page.x, y: 0 })
  const text = `${left.padEnd(start)}${middle}${' '.repeat(gap)}${right}`
  return { row: [{ text: text.trimEnd(), paint: 'dim' }], hits }
}

/** What the corner of a drawing's last row says, as much of it as the row has room for: a click there opens the graph as a web page. */
const PAGE_LABELS = ['html ↗', '↗']
/** The room between the counts and the corner. */
const CORNER_GAP = 2

/**
 * The last row of a drawing: the counts of what is out of view, when
 * anything is, and in its right corner what a click opens the graph as a
 * web page by.
 */
export function footRow(beyond: Beyond | undefined, columns: number, page: Pan, y: number): { row: Span[]; hits: Hit[] } {
  const none = { left: 0, right: 0, above: 0, below: 0 }
  for (const label of PAGE_LABELS) {
    const room = columns - label.length - CORNER_GAP
    const counts = beyondRow(beyond ?? none, room, page, y)
    const said = rowText(counts.row)
    if (said.length > room) continue
    const x = columns - label.length
    return {
      row: [{ text: `${said.padEnd(x)}${label}`, paint: 'dim' }],
      hits: [...counts.hits, { x, y, width: label.length, height: 1, page: true }],
    }
  }
  return beyondRow(beyond ?? none, columns, page, y)
}

export function rowText(row: Span[]): string {
  return row.map(span => span.text).join('')
}

let graphemes: Intl.Segmenter | undefined
/**
 * The characters a person sees in a text: a letter with the marks on it is
 * one, and so is an emoji with the ones joined to it. Where the runtime cannot
 * tell, each code point is one.
 */
export function charactersOf(text: string): string[] {
  if (typeof Intl?.Segmenter !== 'function') return [...text]
  graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(graphemes.segment(text), part => part.segment)
}

/** The characters a terminal draws two cells wide: those of East Asian scripts and the fullwidth forms. */
const WIDE = /^[\u1100-\u115f\u2329\u232a\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f200}-\u{1f2ff}\u{20000}-\u{3fffd}]/u
/** An emoji drawn as a picture, two cells wide: one that is by default, one a variation selector asks to be, or a flag. */
const PICTURE = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\ufe0f|\p{Regional_Indicator})/u
/** What takes no cell of its own: a mark on the character before it, or a sign that shapes the text and draws nothing. */
const UNSEEN = /^[\p{Mn}\p{Me}\p{Cf}]+$/u

/** How many cells a text takes in a terminal: two a wide character or emoji, none a mark alone, and one any other. */
export const sizeOf = (text: string): number =>
  charactersOf(text).reduce((sum, character) => sum + (WIDE.test(character) || PICTURE.test(character) ? 2 : UNSEEN.test(character) ? 0 : 1), 0)

/** How many of a text's first characters fit in `cells`, and at least one. */
export function fitting(characters: string[], cells: number): number {
  let [count, used] = [0, 0]
  for (const character of characters) {
    if (used + sizeOf(character) > cells) break
    used += sizeOf(character)
    count += 1
  }
  return Math.max(1, Math.min(count, characters.length))
}

/** A label cut to `max` cells from its middle, so that it keeps how it starts and how it ends. */
export function clipMiddle(label: string, max: number): string {
  if (sizeOf(label) <= max) return label
  const characters = charactersOf(label)
  const kept = Math.max(0, max - 1)
  const head = characters.slice(0, fitting(characters, Math.ceil(kept / 2)))
  const tail = characters.toReversed().slice(0, fitting(characters.toReversed(), Math.floor(kept / 2))).toReversed()
  return `${head.join('')}…${tail.join('')}`
}

/** One cell of a canvas. The cell after a character two cells wide holds nothing, `''`, for the character covers it. */
export type Cell = { char: string; paint: Paint; isBold?: true; isInverse?: true }

/**
 * The cells a window is painted on, and the one way they are written: what
 * falls outside them is not. A character two cells wide takes two; where the
 * window's edge would cut it, or a later write covers half of it, what is
 * left of it is blank, so that no row ever holds half a character.
 */
export type Canvas = { cells: Cell[][]; put: (x: number, y: number, text: string, style: Omit<Cell, 'char'>) => void }

export function canvasOf(columns: number, rows: number): Canvas {
  const cells: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ char: ' ', paint: 'plain' as Paint })),
  )
  const put: Canvas['put'] = (x, y, text, style) => {
    const row = cells[y]
    if (row === undefined) return
    const blank = (at: number): void => {
      const cell = row[at]
      if (cell !== undefined) row[at] = { ...cell, char: ' ' }
    }
    const set = (at: number, char: string): void => {
      const cell = row[at]
      if (cell === undefined) return
      if (cell.char === '') blank(at - 1)
      else if (sizeOf(cell.char) === 2) blank(at + 1)
      row[at] = { char, ...style }
    }
    let at = x
    for (const character of charactersOf(text)) {
      const size = sizeOf(character)
      if (size === 2 && (at < 0 || at + 1 >= columns)) {
        set(at, ' ')
        set(at + 1, ' ')
      } else if (size > 0) {
        set(at, character)
        if (size === 2) set(at + 1, '')
      }
      at += size
    }
  }
  return { cells, put }
}

/** A row of cells as the runs of one paint it holds, less the blanks it ends in. */
export function spansOf(cells: Cell[]): Span[] {
  let end = cells.length
  while (end > 0 && cells[end - 1]?.char === ' ') end -= 1
  const spans: Span[] = []
  for (const cell of cells.slice(0, end)) {
    const last = spans.at(-1)
    if (last !== undefined && last.paint === cell.paint && last.isBold === cell.isBold && last.isInverse === cell.isInverse) {
      last.text += cell.char
    } else {
      spans.push({
        text: cell.char,
        paint: cell.paint,
        ...(cell.isBold ? { isBold: true as const } : {}),
        ...(cell.isInverse ? { isInverse: true as const } : {}),
      })
    }
  }
  return spans
}

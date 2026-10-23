import { describe, expect, test } from 'claude-code/testing'

import { cellsOf } from './fixture'
import { beyondRow, bounded, canvasOf, clipMiddle, footRow, leftOut, reveal, rowText, sizeOf, spansOf } from '../hooks/draw'
import type { Paint, Span } from '../hooks/draw'

describe('a window brought to what it must show', () => {
  test('one that already shows it stays where it is', () => {
    expect(reveal(10, 12, 20, 30, 100)).toBe(10)
    expect(reveal(10, 10, 40, 30, 100)).toBe(10)
  })

  test('one that does not moves just far enough to', () => {
    expect(reveal(10, 50, 60, 30, 100)).toBe(30)
    expect(reveal(40, 12, 20, 30, 100)).toBe(12)
  })

  test('what is longer than the window is shown from its start', () => {
    expect(reveal(0, 50, 95, 30, 100)).toBe(50)
    expect(reveal(80, 50, 95, 30, 100)).toBe(50)
  })

  test('a window that moves shows a margin past what it was moved for, and one that need not move ignores the margin', () => {
    expect(reveal(10, 50, 60, 30, 100, 4)).toBe(34)
    expect(reveal(40, 12, 20, 30, 100, 4)).toBe(8)
    expect(reveal(10, 30, 40, 30, 100, 4)).toBe(10)
    expect(reveal(10, 10, 20, 30, 100, 4)).toBe(10)
  })

  test('a window with no room for the margin shows what it was moved for, and as much margin as is left', () => {
    expect(reveal(0, 10, 13, 3, 100, 2)).toBe(10)
    expect(reveal(0, 10, 13, 5, 100, 2)).toBe(9)
    expect(reveal(40, 10, 13, 4, 100, 2)).toBe(10)
  })

  test('a window asked to stand between two cells stands on one', () => {
    expect(reveal(10.4, 12, 20, 30, 100)).toBe(10)
    expect(reveal(10.6, 50, 60, 30, 100)).toBe(30)
  })

  test('the window never leaves what it is a window on', () => {
    expect(reveal(0, 90, 110, 30, 100)).toBe(70)
    expect(reveal(50, -5, 3, 30, 100)).toBe(0)
    expect(reveal(5, 0, 10, 30, 20)).toBe(0)
  })
})

describe('the row that counts what is out of view', () => {
  const page = { x: 40, y: 5 }

  test('each count sits where a reader looks for it: the sides at the sides, above and below between them', () => {
    const { row, hits } = beyondRow({ left: 3, right: 12, above: 2, below: 5 }, 60, page, 9)
    expect(row).toEqual([{ text: '← 3 more            ↑ 2 more · ↓ 5 more            12 more →', paint: 'dim' }])
    expect(hits).toEqual([
      { x: 0, y: 9, width: 8, height: 1, by: { x: -40, y: 0 } },
      { x: 20, y: 9, width: 8, height: 1, by: { x: 0, y: -5 } },
      { x: 31, y: 9, width: 8, height: 1, by: { x: 0, y: 5 } },
      { x: 51, y: 9, width: 9, height: 1, by: { x: 40, y: 0 } },
    ])
  })

  test('a side with nothing past it is not spoken of, and takes no click', () => {
    const { row, hits } = beyondRow({ left: 0, right: 0, above: 0, below: 5 }, 30, page, 2)
    expect(rowText(row)).toBe('           ↓ 5 more')
    expect(hits).toEqual([{ x: 11, y: 2, width: 8, height: 1, by: { x: 0, y: 5 } }])
    expect(rowText(beyondRow({ left: 0, right: 7, above: 0, below: 0 }, 30, page, 0).row)).toBe(
      '                      7 more →',
    )
  })

  test('where the row is too narrow for every word, above and below keep their numbers and drop the word', () => {
    const { row, hits } = beyondRow({ left: 12, right: 12, above: 12, below: 12 }, 40, page, 0)
    expect(rowText(row)).toBe('← 12 more     ↑ 12 · ↓ 12      12 more →')
    expect(hits.map(hit => [hit.x, hit.width])).toEqual([
      [0, 9],
      [14, 4],
      [21, 4],
      [31, 9],
    ])
  })
})

describe('the last row', () => {
  const page = { x: 20, y: 5 }
  test('what was left out of a graph is said before the corner, short where the row is narrow, and before the corner\'s words', () => {
    const unread = { nodes: 12, edges: 340 }
    expect(rowText(footRow(undefined, 60, page, 9, leftOut(unread)).row)).toBe('12 nodes and 340 edges left out  copy · html ↗'.padStart(60))
    expect(rowText(footRow(undefined, 40, page, 9, leftOut(unread)).row)).toBe('12 nodes and 340 edges left out  ↗'.padStart(40))
    expect(rowText(footRow(undefined, 30, page, 9, leftOut(unread)).row)).toBe('+12 nodes +340 edges  ↗'.padStart(30))
    expect(rowText(footRow(undefined, 30, page, 9, leftOut({ nodes: 1, edges: 0 })).row)).toBe('1 node left out  copy · ↗'.padStart(30))
    expect(rowText(footRow({ left: 3, right: 0, above: 0, below: 0 }, 60, page, 9, leftOut(unread)).row)).toBe(`${'← 3 more'.padEnd(14)}12 nodes and 340 edges left out  copy · html ↗`)
  })

  test('a note of wide characters, as what is being found, keeps the row to the room\'s cells and each of the corner\'s words where a click on it lands', () => {
    const { row, hits } = footRow(undefined, 40, page, 0, ['/日本語 · no match', '/日本語'])
    const cells = cellsOf(rowText(row))
    expect(rowText(row)).toBe(`${' '.repeat(7)}/日本語 · no match  copy · html ↗`)
    expect(cells).toHaveLength(40)
    expect(hits.map(hit => cells.slice(hit.x, hit.x + hit.width).join(''))).toEqual(['copy', 'html ↗'])
  })

  test('a still drawing has no corner: the counts and the note reach the right edge, and nothing in the row but a count takes a click', () => {
    const { row, hits } = footRow({ left: 0, right: 7, above: 0, below: 0 }, 60, page, 9, leftOut({ nodes: 1, edges: 0 }), false)
    expect(rowText(row)).toBe(`${'7 more →'.padStart(43)}  1 node left out`)
    expect(hits).toEqual([{ x: 35, y: 9, width: 8, height: 1, by: { x: 20, y: 0 } }])
  })
})

describe('text and cells', () => {
  test('a label is cut from its middle, so that how it starts and how it ends both stay', () => {
    expect(clipMiddle('subscription-manager.test.ts', 16)).toBe('subscrip…test.ts')
    expect(clipMiddle('cart.ts', 16)).toBe('cart.ts')
    expect(clipMiddle('数据库连接池管理器', 9)).toBe('数据…理器')
  })

  test('text takes the cells a terminal draws it in: two a wide character or emoji, one an emoji and all that is joined to it, none a mark', () => {
    expect(sizeOf('数据库')).toBe(6)
    expect(sizeOf('✅ done')).toBe(7)
    expect(sizeOf('👨‍👩‍👧')).toBe(2)
    expect(sizeOf('🇯🇵')).toBe(2)
    expect(sizeOf('❤️')).toBe(2)
    expect(sizeOf('cafe\u0301')).toBe(4)
    expect(sizeOf('◆ ↺ … →')).toBe(7)
  })

  test('on a canvas a wide character covers the cell after it, and what an edge or a later write leaves of it is blank, never half a character', () => {
    const canvas = canvasOf(7, 1)
    canvas.put(-1, 0, '数a数据', { paint: 'plain' })
    canvas.put(5, 0, 'x', { paint: 'plain' })
    canvas.put(6, 0, '库', { paint: 'plain' })
    expect(canvas.cells.map(row => rowText(spansOf(row)))).toEqual([' a数 x'])
    canvas.put(2, 0, 'y', { paint: 'plain' })
    expect(canvas.cells.map(row => rowText(spansOf(row)))).toEqual([' ay  x'])
  })

  test('what is written past a canvas\'s edges is not kept, and a row reads as its runs of one paint, each blank in the run before it and blanks before any in the run after, less the blanks it ends in', () => {
    const canvas = canvasOf(6, 1)
    canvas.put(-2, 0, 'abcd', { paint: 'bad' })
    canvas.put(3, 0, 'xyz!', { paint: 'dim', isBold: true })
    canvas.put(0, 4, 'below', { paint: 'plain' })
    expect(canvas.cells.map(spansOf)).toEqual([
      [
        { text: 'cd ', paint: 'bad' },
        { text: 'xyz', paint: 'dim', isBold: true },
      ],
    ])
    const inverse = canvasOf(9, 1)
    inverse.put(2, 0, 'ab', { paint: 'note' })
    inverse.put(5, 0, ' c', { paint: 'note', isInverse: true })
    expect(inverse.cells.map(spansOf)).toEqual([
      [
        { text: '  ab ', paint: 'note' },
        { text: ' c', paint: 'note', isInverse: true },
      ],
    ])
    expect(spansOf(canvasOf(4, 1).cells[0] ?? [])).toEqual([])
  })
})

describe('a drawing too large to draw', () => {
  const row = (paints: Paint[]): Span[] => paints.map(paint => ({ text: '─', paint }))
  const rows = (paints: Paint[]): Span[][] => Array.from({ length: 60 }, () => row(Array.from({ length: 150 }, (_, x) => paints[x % paints.length] ?? 'plain')))
  const line = (paint: Paint): Span[][] => Array.from({ length: 60 }, () => [{ text: '─'.repeat(150), paint }])

  test('is drawn plainer, as little as it takes: with its dim paint plain, then plain but for what is lit, then all plain', () => {
    const small = { rows: [row(['dim', 'accent', 'dim'])], hits: [] }
    expect(bounded(small)).toEqual(small)
    expect(bounded({ rows: rows(['accent']), hits: [] }).rows).toEqual(line('accent'))
    expect(bounded({ rows: rows(['dim', 'plain']), hits: [] }).rows).toEqual(line('plain'))
    expect(bounded({ rows: rows(['bad', 'warn']), hits: [] }).rows).toEqual(line('plain'))
    expect(bounded({ rows: rows(['accent', 'bad']), hits: [] }).rows).toEqual(line('plain'))
  })
})


import { describe, expect, test } from 'claude-code/testing'

import { beyondRow, canvasOf, clipMiddle, reveal, rowText, spansOf } from '../hooks/draw'

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

describe('text and cells', () => {
  test('a label is cut from its middle, so that how it starts and how it ends both stay', () => {
    expect(clipMiddle('subscription-manager.test.ts', 16)).toBe('subscrip…test.ts')
    expect(clipMiddle('cart.ts', 16)).toBe('cart.ts')
  })

  test('what is written past a canvas\'s edges is not kept, and a row reads as its runs of one paint, less the blanks it ends in', () => {
    const canvas = canvasOf(6, 1)
    canvas.put(-2, 0, 'abcd', { paint: 'bad' })
    canvas.put(3, 0, 'xyz!', { paint: 'dim', isBold: true })
    canvas.put(0, 4, 'below', { paint: 'plain' })
    expect(canvas.cells.map(spansOf)).toEqual([
      [
        { text: 'cd', paint: 'bad' },
        { text: ' ', paint: 'plain' },
        { text: 'xyz', paint: 'dim', isBold: true },
      ],
    ])
    expect(spansOf(canvasOf(4, 1).cells[0] ?? [])).toEqual([])
  })
})

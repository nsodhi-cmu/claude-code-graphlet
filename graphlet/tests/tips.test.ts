import { expect, test } from 'claude-code/testing'

import { TIPS, tipOf } from '../hooks/tips'
import type { Moment } from '../hooks/tips'

/** How many times each tip is picked over rolls spread evenly across [0, 1), `count` of them, by its text. */
const picked = (moment: Moment, count: number): Record<string, number> => {
  const times: Record<string, number> = {}
  for (let at = 0; at < count; at++) {
    const tip = tipOf(moment, at / count)
    if (tip !== undefined) times[tip] = (times[tip] ?? 0) + 1
  }
  return times
}

const EVERY: Moment = { isDrawingReplies: true, hasGraph: true, isClickable: true, columns: 1000 }

test('of the tips true at a moment, each is picked as often as its weight', () => {
  expect(Object.values(picked(EVERY, 1400))).toEqual([300, 100, 200, 200, 200, 200, 100, 100])
  expect(Object.keys(picked(EVERY, 1400))).toEqual(TIPS.map(tip => tip.text))
})

test('before any graph, only the tips that ask for one are said; with graphs in replies off, none says Claude draws them; a tip that says to click is said only where a click is reported; and one too long for the row is not said', () => {
  expect(Object.keys(picked({ ...EVERY, hasGraph: false }, 1400))).toEqual([
    'Ask Claude Code to graph how things connect, powered by graphlet',
    'Building a mod? Use graphlet as a dependency to draw graphs',
  ])
  expect(Object.keys(picked({ ...EVERY, hasGraph: false, isDrawingReplies: false }, 1400))).toEqual(['Building a mod? Use graphlet as a dependency to draw graphs'])
  expect(Object.keys(picked({ ...EVERY, isClickable: false }, 1400))).toEqual(TIPS.slice(0, 5).map(tip => tip.text))
  expect(Object.keys(picked({ ...EVERY, columns: 60 }, 1400))).toEqual([
    'Building a mod? Use graphlet as a dependency to draw graphs',
    'Graphs can group nodes and label edges, powered by graphlet',
    'Use /config to change how graphlet draws graphs',
    'Click copy under a graph to paste it anywhere as text',
  ])
  expect(tipOf({ ...EVERY, columns: 10 }, 0.5)).toBeUndefined()
})

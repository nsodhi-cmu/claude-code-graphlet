import { expect, test } from 'claude-code/testing'

import { LOOK, graphOf as graphNamed, picture } from './fixture'
import { GUIDE, fencedOf, graphOf, partsOf, pictureOf } from '../hooks/reply'
import { viewOf } from '../hooks/view'

const view = viewOf(LOOK)
const still = viewOf(LOOK, true)

test('a reply is cut at its closed graphlet blocks, and every other fence stays in the text whole, with what it holds', () => {
  const reply = [
    'Two graphs:',
    '',
    '```graphlet',
    'a -> b',
    '```',
    '```python',
    'x -> y',
    '```',
    '````markdown',
    '```graphlet',
    'c -> d',
    '```',
    '````',
    '  ~~~ GRAPHLET title',
    'e',
    '  ~~~',
    '```graphlet',
    '',
    '```',
    '```graphlet``` is code, not a fence.',
    '```graphlet',
    'f -> g',
  ].join('\n')
  expect(partsOf(reply)).toEqual([
    { text: 'Two graphs:' },
    { graph: { nodes: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }], links: [{ from: 'a', to: 'b' }] } },
    { text: '```python\nx -> y\n```\n````markdown\n```graphlet\nc -> d\n```\n````' },
    { graph: { nodes: [{ id: 'e', label: 'e' }], links: [] } },
    { text: '```graphlet\n\n```\n```graphlet``` is code, not a fence.\n```graphlet\nf -> g' },
  ])
})

test('the example the model is shown is a graph block that is drawn, with the tone it describes', () => {
  const graphs = partsOf(GUIDE).flatMap(part => ('graph' in part ? [part.graph] : []))
  expect(graphs.map(graph => graph.nodes.map(node => `${node.label}${node.tone === undefined ? '' : ` [${node.tone}]`}`))).toEqual([
    ['Start', 'Read the request', 'Valid?', 'Save it', 'Done', 'Ask for a correction [warn]'],
  ])
  expect(graphs[0]?.links).toHaveLength(6)
})

test('a block\'s lines are chains of arrows, a node is known by its label, and the first tone in brackets after it is its own', () => {
  const graph = graphOf([
    'Parse -> Check [WARN] ->  Emit',
    '  Emit   ->Parse',
    'Check [bad] -> Done [good]',
    'Lonely',
    '-> Parse ->',
    'a --> b → c->d',
    'Read  the   request -> Not [a tone]',
    '[warn]',
    '',
  ])
  expect(graph.nodes).toEqual([
    { id: 'Parse', label: 'Parse' },
    { id: 'Check', label: 'Check', tone: 'warn' },
    { id: 'Emit', label: 'Emit' },
    { id: 'Done', label: 'Done', tone: 'good' },
    { id: 'Lonely', label: 'Lonely' },
    { id: 'a', label: 'a' },
    { id: 'b', label: 'b' },
    { id: 'c', label: 'c' },
    { id: 'd', label: 'd' },
    { id: 'Read the request', label: 'Read the request' },
    { id: 'Not [a tone]', label: 'Not [a tone]' },
  ])
  expect(graph.links.map(link => `${link.from} → ${link.to}`)).toEqual([
    'Parse → Check',
    'Check → Emit',
    'Emit → Parse',
    'Check → Done',
    'a → b',
    'b → c',
    'c → d',
    'Read the request → Not [a tone]',
  ])
})

test('no run of blanks, dashes, or brackets, however long, slows the reading of a reply', () => {
  const long = 200_000
  const reply = [
    `${' '.repeat(long)}x`,
    '```graphlet',
    `a${' '.repeat(long)}b -> c`,
    '-'.repeat(long),
    `d ${'['.repeat(long)}`,
    '```',
    ' '.repeat(long),
  ].join('\n')
  expect(partsOf(reply).map(part => ('graph' in part ? part.graph.nodes.length : part.text.length))).toEqual([long + 1, 3])
})

test('a graph in a reply is drawn still, as narrow as its widest layer and against the left edge, with no foot while all of it is in view', () => {
  const loop = graphNamed(['parse', 'check', 'emit'], [['parse', 'check'], ['check', 'emit'], ['emit', 'parse']])
  const drawing = pictureOf(view, loop, { columns: 100, rows: 1000 })
  expect(picture(drawing)).toEqual([
    ' ┌───────┐',
    ' │ parse │',
    ' └──┬────┘',
    '    │ ▲',
    '    │ └┈┈┈┈┐',
    '    ▼      ┊',
    '┌───────┐  ┊',
    '│ check │  ┊',
    '└───┬───┘  ┊',
    '    │ ┌┈┈┈┈┘',
    '    ▼ ┊',
    ' ┌────┴─┐',
    ' │ emit │',
    ' └──────┘',
  ])
  expect(drawing.hits).toEqual([])
})

test('a graph wider than its reply folds the nodes it names last onto a row of their own, and fits', () => {
  const ids = ['root', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']
  const fan = graphNamed(ids, ids.slice(1).map(id => ['root', id] as [string, string]))
  expect(picture(pictureOf(still, fan, { columns: 50, rows: 1000 }))).toEqual([
    '              ┌──────┐',
    '              │ root │',
    '              └───┬──┘',
    '   ┌────────┬─────┴───┬──────────┬─────┬──┬──┐',
    '   ▼        ▼         ▼          ▼     │  │  │',
    '┌─────┐  ┌─────┐  ┌───────┐  ┌──────┐  │  │  │',
    '│ one │  │ two │  │ three │  │ four │  │  │  │',
    '└─────┘  └─────┘  └───────┘  └──────┘  │  │  │',
    '                      ┌────────────────┘ ┌│──┘',
    '                      │        ┌─────────│┘',
    '                      ▼        ▼         ▼',
    '                  ┌──────┐  ┌─────┐  ┌───────┐',
    '                  │ five │  │ six │  │ seven │',
    '                  └──────┘  └─────┘  └───────┘',
  ])
})

test('a still picture wider than its room keeps the count of what is past the edge, and no corner to click', () => {
  const ids = ['root', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']
  const fan = graphNamed(ids, ids.slice(1).map(id => ['root', id] as [string, string]))
  const drawing = pictureOf(view, fan, { columns: 50, rows: 1000 })
  expect(picture(drawing).at(-1)).toBe('                                  2 more →')
  expect(drawing.hits).toEqual([])
})

test('a picture as plain text is fenced by more backticks than any run of them in it', () => {
  const ticks = graphNamed(['```', 'b'], [['```', 'b']])
  expect(fencedOf(pictureOf(view, ticks, { columns: 100, rows: 1000 })).split('\n')).toEqual([
    '````text',
    '┌─────┐',
    '│ ``` │',
    '└──┬──┘',
    '   │',
    '   ▼',
    '┌─────┐',
    '│  b  │',
    '└─────┘',
    '````',
  ])
})

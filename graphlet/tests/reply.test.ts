import { expect, test } from 'claude-code/testing'

import { LOOK, graphOf as graphNamed, picture } from './fixture'
import { GUIDE, fencedOf, graphOf, partsOf, pictureOf } from '../hooks/reply'
import { sizeOf } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
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

test('a label in bold gives its node a priority of 1, whichever side of the bold its tone is written, and is the same node as the label unbolded, its pipes and dashes dropped as any label\'s', () => {
  const graph = graphOf(['Start -> **Valid?** -> Done [good]', 'Valid? -> **Ask again** [warn]', '**Retry [bad]** -> Start', '**two** and **three** -> ****', 'Done -> **|Start|**'])
  expect(graph.nodes).toEqual([
    { id: 'Start', label: 'Start', priority: 1 },
    { id: 'Valid?', label: 'Valid?', priority: 1 },
    { id: 'Done', label: 'Done', tone: 'good' },
    { id: 'Ask again', label: 'Ask again', tone: 'warn', priority: 1 },
    { id: 'Retry', label: 'Retry', tone: 'bad', priority: 1 },
    { id: '**two** and **three**', label: '**two** and **three**' },
    { id: '****', label: '****' },
  ])
})

test('a block whose links are all dashes is an undirected graph; in any other, an arrow runs one way, a two-headed arrow each way, and a dash no way', () => {
  const friends = graphOf(['Alice -- Bob -- Carol', 'Carol --- Dan', 'e-mail -- front-end'])
  expect(friends.isDirected).toBe(false)
  expect(friends.links.map(link => `${link.from} – ${link.to}`)).toEqual(['Alice – Bob', 'Bob – Carol', 'Carol – Dan', 'e-mail – front-end'])
  const mixed = graphOf(['A -> B', 'B -- C', 'C <-> D', 'D ↔ A', 'E <-- A', 'F ← E'])
  expect(mixed.isDirected).toBeUndefined()
  expect(mixed.links.map(link => `${link.from} ${link.isDirected === false ? '–' : '→'} ${link.to}`)).toEqual(['A → B', 'B – C', 'C → D', 'D → C', 'D → A', 'A → D', 'A → E', 'E → F'])
  expect(picture(pictureOf(still, readGraph(friends), { columns: 80, rows: 1000 })).join('\n')).not.toMatch(/[▲▼]/)
  expect(picture(pictureOf(still, readGraph({ ...graphOf(['Client -> API -> Database', 'API -- Cache', 'Cache -- Database']), direction: 'down' }), { columns: 60, rows: 1000 }))).toEqual([
    ' ┌────────┐',
    ' │ Client │',
    ' └────┬───┘',
    '      │',
    '      ▼',
    '   ┌─────┐',
    '   │ API │',
    '   └─┬─┬─┘',
    '     │ └────┐',
    ' ┌───┴───┐  │',
    ' │ Cache │  │',
    ' └───┬───┘  │',
    '     │ ┌────┘',
    '     │ ▼',
    '┌────┴─────┐',
    '│ Database │',
    '└──────────┘',
  ])
})

test('the same two nodes may be linked again under another label, and a link given again under the same label is one link', () => {
  const graph = graphOf(['Idle ->|start| Running', 'Idle ->|resume| Running', 'Idle ->|start| Running', 'Running -> Idle'])
  expect(readGraph(graph).links.map(link => `${link.from} -> ${link.to} ${link.label ?? ''}`.trim())).toEqual(['Idle -> Running start', 'Idle -> Running resume', 'Running -> Idle'])
})

test('a name and a colon alone on a line opens a group for the lines indented under it, and subgraph does up to end, as Mermaid writes it; a node is in the first group it is named under', () => {
  const graph = graphOf([
    'Browser -> API',
    'Backend:',
    '  API -> Auth',
    '',
    '  API -> Cache',
    '  Cache:',
    '    Redis',
    'subgraph Data',
    'Auth -> Postgres',
    'Redis',
    'end',
    'Step 1: read -> Auth',
  ])
  expect(graph.groups).toEqual([
    { id: 'group:Backend', label: 'Backend' },
    { id: 'group:Cache', label: 'Cache' },
    { id: 'group:Data', label: 'Data' },
  ])
  expect(graph.nodes.map(node => `${node.id} ${node.group ?? '-'}`)).toEqual([
    'Browser -',
    'API group:Backend',
    'Auth group:Backend',
    'Cache group:Backend',
    'Redis group:Cache',
    'Postgres group:Data',
    'Step 1: read -',
  ])
})

test('the groups of a block are drawn in frames in its picture, every group open', () => {
  const block = ['Client -> API', 'Backend:', '  API -> Auth', '  API -> Orders', 'Data:', '  Postgres', 'Auth -> Postgres', 'Orders -> Postgres']
  const drawing = picture(pictureOf(still, readGraph(graphOf(block)), { columns: 78, rows: 1000 })).join('\n')
  expect(drawing).toContain('╭─ Backend ─')
  expect(drawing).toContain('╭─ Data ─')
  expect(drawing).not.toContain('▸')
})

test('a group folded into a narrow reply keeps its frame within the reply, its layers drawn together under one another', () => {
  const block = ['Gateway -> Auth service', 'Gateway -> Orders service', 'Gateway -> Billing service', 'Gateway -> Search service', 'Backend:', '  Gateway', '  Auth service', '  Orders service', '  Billing service', '  Search service']
  const rows = picture(pictureOf(still, readGraph({ ...graphOf(block), direction: 'down' }), { columns: 60, rows: 1000 }))
  expect(Math.max(...rows.map(sizeOf))).toBeLessThanOrEqual(60)
  expect(rows[0]).toMatch(/^╭─ Backend ─+╮$/)
  expect(rows.at(-1)).toMatch(/^╰─+╯$/)
})

test('dashes within a label, and a dash in prose, stay part of the label', () => {
  const graph = graphOf(['git commit --amend -> git push --force', 'Fetch — with retry -> Parse', 'npm run build --watch -> Done'])
  expect(graph.nodes.map(node => node.id)).toEqual(['git commit --amend', 'git push --force', 'Fetch — with retry', 'Parse', 'npm run build --watch', 'Done'])
  expect(graph.links).toHaveLength(3)
})

test('words in pipes right after an arrow or dashes are the link\'s label, and so are words between dashes and an arrow, as Mermaid writes them', () => {
  const graph = graphOf(['Valid? ->|yes| Save it', 'Valid? -->| no | Ask again ->|retry| Read', 'A --|by train| B', 'C -- on error --> D', 'E ->| F ->| G'])
  expect(graph.links).toEqual([
    { from: 'Valid?', to: 'Save it', label: 'yes' },
    { from: 'Valid?', to: 'Ask again', label: 'no' },
    { from: 'Ask again', to: 'Read', label: 'retry' },
    { from: 'A', to: 'B', label: 'by train', isDirected: false },
    { from: 'C', to: 'D', label: 'on error' },
    { from: 'E', to: 'F' },
    { from: 'F', to: 'G' },
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
    '└─────┬─┘  ┊',
    '      │ ┌┈┈┘',
    '      ▼ ┊',
    '   ┌────┴─┐',
    '   │ emit │',
    '   └──────┘',
  ])
  expect(drawing.hits).toEqual([])
})

test('a graph wider than its reply folds the nodes it names last onto a row of their own, the links to them down one lane, and fits', () => {
  const ids = ['root', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']
  const fan = graphNamed(ids, ids.slice(1).map(id => ['root', id] as [string, string]))
  expect(picture(pictureOf(still, fan, { columns: 50, rows: 1000 }))).toEqual([
    '                  ┌──────┐',
    '                  │ root │',
    '                  └───┬──┘',
    '   ┌────────┬─────────┼──────────┬─────────┬─────┐',
    '   ▼        ▼         ▼          ▼         ▼     │',
    '┌─────┐  ┌─────┐  ┌───────┐  ┌──────┐  ┌──────┐  │',
    '│ one │  │ two │  │ three │  │ four │  │ five │  │',
    '└─────┘  └─────┘  └───────┘  └──────┘  └──────┘  │',
    '                                   ┌─────────┬───┘',
    '                                   ▼         ▼',
    '                                ┌─────┐  ┌───────┐',
    '                                │ six │  │ seven │',
    '                                └─────┘  └───────┘',
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

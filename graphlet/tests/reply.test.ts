import { expect, test } from 'claude-code/testing'

import { LOOK, cellsOf, graphOf as graphNamed, picture } from './fixture'
import { GUIDE, fencedOf, graphOf, inReply, partsOf, pictureOf } from '../hooks/reply'
import { rowText, sizeOf } from '../hooks/draw'
import type { Drawing, Hit } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
import { viewOf } from '../hooks/view'

const view = viewOf(LOOK, false, false)
const still = viewOf(LOOK, true, false)

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
    { graph: { nodes: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }], edges: [{ from: 'a', to: 'b' }] } },
    { text: '```python\nx -> y\n```\n````markdown\n```graphlet\nc -> d\n```\n````' },
    { graph: { nodes: [{ id: 'e', label: 'e' }], edges: [] } },
    { text: '```graphlet\n\n```\n```graphlet``` is code, not a fence.\n```graphlet\nf -> g' },
  ])
})

test('the example the model is shown is a graph block that is drawn, with the tone it describes', () => {
  const graphs = partsOf(GUIDE).flatMap(part => ('graph' in part ? [part.graph] : []))
  expect(graphs.map(graph => graph.nodes.map(node => `${node.label}${node.tone === undefined ? '' : ` [${node.tone}]`}`))).toEqual([
    ['Start', 'Read the request', 'Valid?', 'Save it', 'Done', 'Ask for a correction [warn]'],
  ])
  expect(graphs[0]?.edges).toHaveLength(6)
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
  expect(graph.edges.map(edge => `${edge.from} → ${edge.to}`)).toEqual([
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

test('a block whose edges are all dashes is an undirected graph; in any other, an arrow runs one way, a two-headed arrow each way, and a dash no way', () => {
  const friends = graphOf(['Alice -- Bob -- Carol', 'Carol --- Dan', 'e-mail -- front-end'])
  expect(friends.isDirected).toBe(false)
  expect(friends.edges.map(edge => `${edge.from} – ${edge.to}`)).toEqual(['Alice – Bob', 'Bob – Carol', 'Carol – Dan', 'e-mail – front-end'])
  const mixed = graphOf(['A -> B', 'B -- C', 'C <-> D', 'D ↔ A', 'E <-- A', 'F ← E'])
  expect(mixed.isDirected).toBeUndefined()
  expect(mixed.edges.map(edge => `${edge.from} ${edge.isDirected === false ? '–' : '→'} ${edge.to}`)).toEqual(['A → B', 'B – C', 'C → D', 'D → C', 'D → A', 'A → D', 'A → E', 'E → F'])
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

test('the same two nodes may be joined again under another label, and an edge given again under the same label is one edge', () => {
  const graph = graphOf(['Idle ->|start| Running', 'Idle ->|resume| Running', 'Idle ->|start| Running', 'Running -> Idle'])
  expect(readGraph(graph).edges.map(edge => `${edge.from} -> ${edge.to} ${edge.label ?? ''}`.trim())).toEqual(['Idle -> Running start', 'Idle -> Running resume', 'Running -> Idle'])
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

test('a name and a colon with nothing indented under it is a node as ever, a line that only starts with subgraph is a chain, and Mermaid\'s labelled groups are named by their label, closed only by end', () => {
  const graph = graphOf([
    'Deploy:',
    'Subgraph search -> Match found',
    'subgraph api["API tier"]',
    '  End -> Gateway',
    'end',
    'subgraph one [Backend]',
    '  Auth',
    'end',
    'Done',
  ])
  expect(graph.groups).toEqual([
    { id: 'group:API tier', label: 'API tier' },
    { id: 'group:Backend', label: 'Backend' },
  ])
  expect(graph.nodes.map(node => `${node.id} ${node.group ?? '-'}`)).toEqual([
    'Deploy: -',
    'Subgraph search -',
    'Match found -',
    'End group:API tier',
    'Gateway group:API tier',
    'Auth group:Backend',
    'Done -',
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

test('a graph whose frame would push a layer past the reply has its shelves packed instead, so all of it fits, frames and all', () => {
  const graph = readGraph({
    nodes: [{ id: 'a', label: 'Auth' }, { id: 'b', label: 'Validate the request' }, { id: 'db', label: '数据库', group: 'g' }, { id: 'c', label: 'Cache' }, { id: 'v', label: 'Validate the request' }],
    edges: [{ from: 'v', to: 'c' }, { from: 'db', to: 'db' }, { from: 'db', to: 'c' }],
    groups: [{ id: 'g', label: 'the first group' }],
    direction: 'down',
  })
  const rows = picture(pictureOf(still, graph, { columns: 54, rows: 1000 }))
  expect(Math.max(...rows.map(sizeOf))).toBeLessThanOrEqual(54)
  expect(still.measure(graph, 54).columns).toBeLessThanOrEqual(54)
  expect(rows.join('\n')).not.toContain('more')
  expect(rows.join('\n')).toContain(' the first group ')
})

test('a frame wide enough for its label writes it whole, where no line crosses its border', () => {
  const graph = readGraph({ nodes: [{ id: 'a', label: 'A', group: 'g' }], edges: [], groups: [{ id: 'g', label: 'Backend services' }], direction: 'down' })
  expect(picture(pictureOf(still, graph, { columns: 60, rows: 1000 }))).toEqual([
    '╭─ Backend services ─╮',
    '│      ┌─────┐       │',
    '│      │  A  │       │',
    '│      └─────┘       │',
    '╰────────────────────╯',
  ])
})

test('dashes within a label, and a dash in prose, stay part of the label', () => {
  const graph = graphOf(['git commit --amend -> git push --force', 'Fetch — with retry -> Parse', 'npm run build --watch -> Done'])
  expect(graph.nodes.map(node => node.id)).toEqual(['git commit --amend', 'git push --force', 'Fetch — with retry', 'Parse', 'npm run build --watch', 'Done'])
  expect(graph.edges).toHaveLength(3)
})

test('words in pipes right after an arrow or dashes are the edge\'s label, and so are words between dashes and an arrow, as Mermaid writes them', () => {
  const graph = graphOf(['Valid? ->|yes| Save it', 'Valid? -->| no | Ask again ->|retry| Read', 'A --|by train| B', 'C -- on error --> D', 'E ->| F ->| G'])
  expect(graph.edges).toEqual([
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

test('a graph wider than its reply folds the nodes it names last onto a row of their own, the edges to them down one lane, and fits', () => {
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
  expect(picture(drawing).at(-1)).toBe('2 more →'.padStart(50))
  expect(drawing.hits).toEqual([])
})

/** What the cells a hit covers say, along its middle row: a box's label between its borders, or the words of the foot. */
const said = (drawing: Drawing, hit: Hit): string =>
  cellsOf(rowText(drawing.rows[hit.y + Math.floor(hit.height / 2)] ?? []))
    .slice(hit.x, hit.x + hit.width)
    .join('')

test('in a reply, a drawing stands at the reply\'s left edge with its corner at its own right edge, and every click lands on what it says', () => {
  const small = graphNamed(['A', 'B', 'C'], [['A', 'B'], ['A', 'C']])
  const drawing = inReply(viewOf(LOOK, true)).draw(small, null, { columns: 60, rows: 1000 }, { x: 0, y: 0 })
  expect(picture(drawing)).toEqual([
    '     ┌─────┐',
    '     │  A  │',
    '     └──┬──┘',
    '   ┌────┴───┐',
    '   ▼        ▼',
    '┌─────┐  ┌─────┐',
    '│  B  │  │  C  │',
    '└─────┘  └─────┘',
    '   copy · html ↗',
  ])
  expect(drawing.hits.map(hit => said(drawing, hit))).toEqual(['│  A  │', '│  B  │', '│  C  │', 'copy', 'html ↗'])

  const ids = ['root', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']
  const fan = graphNamed(ids, ids.slice(1).map(id => ['root', id] as [string, string]))
  const wide = inReply(viewOf(LOOK)).draw(fan, null, { columns: 50, rows: 1000 }, { x: 0, y: 0 })
  expect(picture(wide).at(-1)).toBe('                           2 more →  copy · html ↗')
  expect(wide.hits.filter(hit => !('node' in hit)).map(hit => said(wide, hit))).toEqual(['2 more →', 'copy', 'html ↗'])
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

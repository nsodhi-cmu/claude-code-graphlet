import { describe, expect, test } from 'claude-code/testing'

import { LOOK, SHOP, graphOf } from './fixture'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import { layoutOf } from '../hooks/layout'
import { altOf, svgOf } from '../hooks/svg'
import type { Seen } from '../hooks/svg'

const ROOM = { columns: 80, rows: 1000 }
const NOTHING: Seen = { selected: null, isLighting: false }

/** A graph drawn as a surface draws it, laid out folded into an 80 columns' room, eight pixels a column. */
const drawn = (graph: Graph, seen: Partial<Seen> = {}): string => svgOf(graph, layoutOf(graph, ROOM, LOOK, true, graph.direction ?? 'down'), 8, { ...NOTHING, ...seen }).source

const numbers = (text: string): number[] => (text.match(/-?[\d.]+/g) ?? []).map(Number)
/** The classes of each element of a kind, `node` or `link`, in the order drawn. */
const classes = (svg: string, kind: string): string[][] => [...svg.matchAll(new RegExp(`<g class="(${kind} [^"]*)"`, 'g'))].map(([, names = '']) => names.split(' '))

describe('what a picture shows of its selection', () => {
  test('the selected node has a second border inside its box and bold words, and the boxes its links reach are in the accent', () => {
    const svg = drawn(SHOP, { selected: 'src/cart.ts' })
    expect(classes(svg, 'node').filter(names => names.includes('selected'))).toEqual([['node', 'bad', 'selected', 'n1']])
    expect(classes(svg, 'node').filter(names => names.includes('near')).map(names => names.at(-1))).toEqual(['n0', 'n5'])
    expect(svg.match(/<rect class="ring"/g)).toHaveLength(1)
    expect(svg).toMatch(/<g class="node bad selected n1"[^>]*><rect class="box"[^>]*\/><rect class="ring"/)
  })

  test('the links that touch the selected node are lit, whichever way they run, and no other', () => {
    const graph = readGraph({
      nodes: ['a', 'b', 'c', 'd'].map(id => ({ id, label: id })),
      links: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
        { from: 'a', to: 'c' },
        { from: 'a', to: 'd', isDirected: false },
        { from: 'c', to: 'd' },
      ],
    })
    const lit = classes(drawn(graph, { selected: 'a' }), 'link').map(names => names.includes('lit'))
    expect(lit).toEqual([true, true, true, true, false])
    expect(classes(drawn(graph), 'link').flat()).not.toContain('lit')
  })
})

describe('what a picture shows as the pointer passes over it', () => {
  test('each node has a rule that lights its links in the accent and quiets every other link and every node they do not reach, as the pointer is over it, or else as the keyboard is on it', () => {
    const svg = drawn(graphOf(['a', 'b', 'c'], [['a', 'b'], ['c', 'c']]), { isLighting: true })
    const lit = (index: number): string => `:is(svg:has(.n${index}:hover), svg:not(:has(.node:hover)):has(.n${index}:focus))`
    expect(svg).toContain(`${lit(0)} :is(.node:not(.n0,.n1), .link:not(.e0)) { opacity: 0.25; }\n${lit(0)} .link.e0 { color: var(--accent); --label: currentColor; }`)
    expect(svg).toContain(`${lit(2)} :is(.node:not(.n2), .link:not(.e2)) { opacity: 0.25; }`)
    expect(drawn(graphOf(['a', 'b'], [['a', 'b']]))).not.toContain(':hover)')
  })
})

describe('a picture as a document', () => {
  test('it is a document of its own, on a sheet as large as the document, which is as large as what it draws and the room around it, and says how wide it is', () => {
    const { source: svg, width: wide } = svgOf(SHOP, layoutOf(SHOP, ROOM, LOOK, true, 'down'), 8, NOTHING)
    expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" ')
    const [x = NaN, y = NaN, width = NaN, height = NaN] = numbers(/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '')
    expect(numbers(/ width="([^"]*)" height="([^"]*)"/.exec(svg)?.slice(1).join(' ') ?? '')).toEqual([Math.ceil(width), Math.ceil(height)])
    expect(wide).toBe(Math.ceil(width))
    expect(numbers(/<rect class="sheet" ([^>]*)>/.exec(svg)?.[1] ?? '')).toEqual([x, y, width, height, 8])
    const boxes = [...svg.matchAll(/<rect class="box" x="([\d.-]+)" y="([\d.-]+)"/g)].map(([, left = '', top = '']) => [Number(left), Number(top)])
    expect(Math.min(...boxes.map(([left = NaN]) => left)) - x).toBe(12)
    expect(Math.min(...boxes.map(([, top = NaN]) => top)) - y).toBe(12)
  })

  test('a label cut short, on its last line or in its middle, has the whole of it as its title, and one written whole on its lines has none', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen'
    const graph = graphOf([long, 'src/a/long/path/to/a/file.component.ts', 'short'], [[long, 'short']])
    const svg = drawn(graph)
    expect(svg).toContain(`<title>${long}</title>`)
    expect(svg.match(/<title>/g)).toHaveLength(1)
    const clipped = svgOf(graph, layoutOf(graph, ROOM, { ...LOOK, labels: 'clip' }, true, 'down'), 8, NOTHING).source
    expect(clipped.match(/<title>[^<]*<\/title>/g)).toEqual([`<title>${long}</title>`, '<title>src/a/long/path/to/a/file.component.ts</title>'])
  })
})

test('what a graph says is escaped in a picture, and what no XML document may hold is left out of it, so that one label never spoils the whole', () => {
  const svg = drawn(readGraph({ nodes: [{ id: 'a', label: 'a <b> & "c"' }, { id: 'b', label: 'half \ud800 of \ufffe a pair' }], links: [{ from: 'a', to: 'b', label: "it's" }] }))
  expect(svg).toContain('>a &lt;b&gt; &amp; &quot;c&quot;</tspan>')
  expect(svg).toContain('>half  of  a pair</tspan>')
  expect(svg).toContain('>it&#39;s</text>')
  expect(svg).not.toMatch(/[\ud800-\udfff\ufffe]/)
})

describe('what a picture says for a reader who cannot see it', () => {
  test('how many nodes and links the graph has, each link by its ends, its way, and its label, and each node no link joins', () => {
    const graph = readGraph({
      nodes: [{ id: 'a', label: 'Start' }, { id: 'b', label: 'Valid?' }, { id: 'c', label: 'Peer' }, { id: 'd', label: 'Alone' }],
      links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a', label: 'retry' }, { from: 'b', to: 'c', isDirected: false }],
    })
    expect(altOf(graph)).toBe('A graph of 4 nodes and 3 links: Start → Valid?; Valid? → Start (retry); Valid? — Peer; Alone.')
    expect(altOf(graphOf(['only'], []))).toBe('A graph of 1 node and 0 links: only.')
  })

  test('what would run long is counted instead', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `node number ${index}`)
    const alt = altOf(graphOf(ids, ids.slice(1).map((id, index) => [ids[index] ?? '', id])))
    expect(alt.length).toBeLessThanOrEqual(1000 + '; and 999 more.'.length)
    expect(alt).toStartWith('A graph of 200 nodes and 199 links: node number 0 → node number 1; ')
    expect(alt).toMatch(/; and \d+ more\.$/)
  })
})

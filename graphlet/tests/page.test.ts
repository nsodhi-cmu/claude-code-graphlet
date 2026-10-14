import { describe, expect, test } from 'claude-code/testing'

import { SHOP, graphOf } from './fixture'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'
import { pageOf } from '../hooks/page'

const count = (text: string, part: string): number => text.split(part).length - 1
const numbers = (text: string): number[] => (text.match(/-?[\d.]+/g) ?? []).map(Number)

/** A node's box as a page draws it. */
type Box = { x: number; y: number; right: number; bottom: number }

/** Each node's box, in the graph's order. */
const boxes = (page: string): Box[] =>
  [...page.matchAll(/<rect class="box" ([^>]*)>/g)].map(([, sizes = '']) => {
    const [x = NaN, y = NaN, width = NaN, height = NaN] = numbers(sizes)
    return { x, y, right: x + width, bottom: y + height }
  })

/**
 * A link as a page draws it: where its two ends stand in the graph, whether
 * its line is dashed, its path with the points along it, and the tip of its
 * arrowhead.
 */
type Drawn = { from: number; to: number; isDashed: boolean; path: string; xs: number[]; ys: number[]; tip: { x: number; y: number } }

const LINK = /<g class="link" data-from="(\d+)" data-to="(\d+)"><path( stroke-dasharray="[^"]*")? d="([^"]*)"\/><polygon points="([^"]*)"\/><\/g>/g

const links = (page: string): Drawn[] =>
  [...page.matchAll(LINK)].map(([, from, to, dashes, path = '', head = '']) => {
    const points = numbers(path)
    const [x = NaN, y = NaN] = numbers(head)
    return {
      from: Number(from),
      to: Number(to),
      isDashed: dashes !== undefined,
      path,
      xs: points.filter((_, index) => index % 2 === 0),
      ys: points.filter((_, index) => index % 2 === 1),
      tip: { x, y },
    }
  })

/** A graph's boxes as a page stands them, each with its node's id: row by row down the page, and left to right along each. */
const rows = (graph: Graph, page: string): Array<Array<Box & { id: string }>> => {
  const stood = boxes(page).map((box, index) => ({ ...box, id: graph.nodes[index]?.id ?? '' }))
  const tops = [...new Set(stood.map(box => box.y))].sort((a, b) => a - b)
  return tops.map(top => stood.filter(box => box.y === top).sort((a, b) => a.x - b.x))
}

/** The width and the height of a page's drawing. */
const size = (page: string): number[] => numbers(/viewBox="0 0 ([^"]*)"/.exec(page)?.[1] ?? '')

const isOver = (a: Box, b: Box): boolean => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom

describe('the nodes of a page', () => {
  test('every node has a box in its tone, with its label written once, after its mark and before its badge', () => {
    const page = pageOf(SHOP, 'Shop')
    expect(boxes(page)).toHaveLength(SHOP.nodes.length)
    for (const node of SHOP.nodes) expect(count(page, `>${node.label}<`)).toBe(1)
    expect(page).toMatch(/<g class="node dim"[^>]*><rect[^>]*><text><tspan[^>]*><tspan class="mark">→<\/tspan><tspan[^>]*>money\.ts<\/tspan><tspan class="badge"[^>]*>2<\/tspan>/)
    expect(count(page, 'class="node bad"')).toBe(2)
  })

  test('a label too long for one line is on several, one under another, and every box of its layer is taller for it', () => {
    const long = 'Validate the incoming request and normalize it'
    const page = pageOf(graphOf(['short', long, 'under'], [['short', 'under'], [long, 'under']]), '')
    const lines = /<tspan x="([\d.]+)" y="([\d.]+)">Validate the incoming<\/tspan><tspan x="\1" y="([\d.]+)">request and normalize it<\/tspan>/
    const [, , first = NaN, second = NaN] = (lines.exec(page) ?? []).map(Number)
    expect(second).toBeGreaterThan(first)
    const [beside, tall, under] = boxes(page).map(box => box.bottom - box.y)
    expect(tall).toBeGreaterThan(under ?? NaN)
    expect(beside).toBe(tall)
  })

  test("the boxes stand in the layers and the order of the terminal's picture, each layer in the middle of the drawing", () => {
    const graph = graphOf(
      ['top1', 'top2', 'x', 'y', 'under'],
      [
        ['top1', 'y'],
        ['top2', 'x'],
        ['x', 'under'],
      ],
    )
    const page = pageOf(graph, '')
    const stood = rows(graph, page)
    expect(stood.map(row => row.map(box => box.id))).toEqual([['top1', 'top2'], ['y', 'x'], ['under']])
    const [width = NaN] = size(page)
    for (const row of stood) {
      const middle = ((row[0]?.x ?? NaN) + (row.at(-1)?.right ?? NaN)) / 2
      expect(Math.abs(middle - width / 2)).toBeLessThanOrEqual(1)
    }
  })

  test('one node, a loop, and a graph of many nodes all draw, every box inside the drawing and none over another', () => {
    const many = Array.from({ length: 120 }, (_, index) => `node-${index}`)
    const graphs = [
      graphOf(['only'], []),
      graphOf(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['b', 'b']]),
      graphOf(many, many.flatMap((id, index) => [[many[Math.floor(index / 2)] ?? id, id], [id, many[(index * 7 + 1) % many.length] ?? id]])),
    ]
    for (const graph of graphs) {
      const page = pageOf(graph, 'Any')
      const [width = NaN, height = NaN] = size(page)
      const stood = boxes(page)
      expect(page).not.toMatch(/NaN|Infinity|undefined/)
      expect(stood).toHaveLength(graph.nodes.length)
      expect(links(page)).toHaveLength(graph.links.length)
      expect(stood.filter(box => box.x < 0 || box.y < 0 || box.right > width || box.bottom > height)).toEqual([])
      expect(stood.filter(box => stood.some(other => other !== box && isOver(box, other)))).toEqual([])
    }
  })
})

describe('the links of a page', () => {
  test('each link is drawn once, as a path and an arrowhead, and names its ends by where they stand in the graph', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 0 },
        { id: 'b', label: 'b', layer: 0 },
        { id: 'c', label: 'c', layer: 1 },
      ],
      links: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'a' },
        { from: 'a', to: 'c' },
        { from: 'c', to: 'b' },
      ],
    })
    const page = pageOf(graph, '')
    expect(count(page, '<path')).toBe(4)
    expect(count(page, '<polygon')).toBe(4)
    expect(links(page).map(link => [link.from, link.to])).toEqual([[0, 1], [0, 0], [0, 2], [2, 1]])
  })

  test('a link down the page is solid and reaches the top of its box; one that runs back up is dashed, climbs through its lanes without turning back, and reaches the bottom of its box beside where the other leaves', () => {
    const page = pageOf(graphOf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]), '')
    const [a, b, , d] = boxes(page)
    const [down, , , up] = links(page)
    expect(down).toMatchObject({ isDashed: false, tip: { y: b?.y } })
    expect(down?.ys[0]).toBe(a?.bottom)
    expect(up).toMatchObject({ isDashed: true, tip: { y: a?.bottom } })
    expect(up?.ys[0]).toBe(d?.y)
    expect(up?.path).toMatch(/^M[^CL]+(C[^CL]+L[^CL]+){2}C[^CL]+$/)
    expect(up?.ys).toEqual([...(up?.ys ?? [])].sort((high, low) => low - high))
    expect(up?.tip.x).toBeGreaterThan(down?.xs[0] ?? NaN)
    expect(up?.tip.x).toBeLessThan(a?.right ?? NaN)
  })

  test("a link past a layer runs straight down its lane there, clear of the layer's boxes, and one between neighbors is a single curve", () => {
    const page = pageOf(graphOf(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c']]), '')
    const [, b = { x: NaN, y: NaN, right: NaN, bottom: NaN }] = boxes(page)
    const [near, , far] = links(page)
    expect(near?.path).toMatch(/^M[^CL]+C[^CL]+$/)
    expect(far?.path).toMatch(/^M[^CL]+C[^CL]+L[^CL]+C[^CL]+$/)
    const into = { x: far?.xs[3] ?? NaN, y: far?.ys[3] ?? NaN }
    const out = { x: far?.xs[4] ?? NaN, y: far?.ys[4] ?? NaN }
    expect(into).toEqual({ x: out.x, y: b.y })
    expect(out.y).toBe(b.bottom)
    expect(into.x < b.x || into.x > b.right).toBe(true)
  })

  test('a link between two nodes of one layer is an arc under the layer', () => {
    const graph = readGraph({
      nodes: [
        { id: 'a', label: 'a', layer: 0 },
        { id: 'b', label: 'b', layer: 0 },
      ],
      links: [{ from: 'a', to: 'b' }],
    })
    const page = pageOf(graph, '')
    const [a, b = { x: NaN, y: NaN, right: NaN, bottom: NaN }] = boxes(page)
    const [arc] = links(page)
    expect(arc?.isDashed).toBe(false)
    expect(Math.min(...(arc?.ys ?? []))).toBe(a?.bottom)
    expect(Math.max(...(arc?.ys ?? []))).toBeGreaterThan(b.bottom)
    expect(arc?.tip.y).toBe(b.bottom)
    expect((arc?.tip.x ?? NaN) > b.x && (arc?.tip.x ?? NaN) < b.right).toBe(true)
  })

  test('a link from a node to itself is a loop out of the side of its box and back into it', () => {
    const page = pageOf(graphOf(['a'], [['a', 'a']]), '')
    const [a = { x: NaN, y: NaN, right: NaN, bottom: NaN }] = boxes(page)
    const [loop] = links(page)
    expect(loop).toMatchObject({ from: 0, to: 0, isDashed: false, tip: { x: a.right } })
    expect(Math.min(...(loop?.xs ?? []))).toBe(a.right)
    expect(Math.max(...(loop?.xs ?? []))).toBeGreaterThan(a.right)
    expect(loop?.ys[0]).toBeGreaterThan(a.y)
    expect(loop?.tip.y).toBeGreaterThan(loop?.ys[0] ?? NaN)
    expect(loop?.tip.y).toBeLessThan(a.bottom)
  })
})

describe('the page as a document', () => {
  test('what a graph and a title say is escaped, a tone the page does not know is drawn plain, and an id is never written', () => {
    const id = '"><img src=x>'
    const graph = readGraph({
      nodes: [{ id, label: '<script>alert(1)</script> & "quotes"', mark: '<b>', badge: "it's", tone: '" onload="alert(2)' as never }],
      links: [{ from: id, to: id }],
    })
    const page = pageOf(graph, '</title><script>alert(3)</script>')
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(page).toContain('&amp; &quot;quotes&quot;')
    expect(page).toContain('&lt;b&gt;')
    expect(page).toContain('it&#39;s')
    expect(page).toContain('<title>&lt;/title&gt;&lt;script&gt;alert(3)&lt;/script&gt;</title>')
    expect(page).toContain('<g class="node plain"')
    expect(count(page, '<script')).toBe(1)
    expect(page).not.toMatch(/img|onload|"quotes"|it's/)
  })

  test('the page fetches nothing: it names no address, and has no source, link or import', () => {
    expect(pageOf(SHOP, 'Shop')).not.toMatch(/https?:|\/\/|src=|href=|url\(|@import|<link|<iframe/)
  })

  test('an empty graph gives a page that says there is nothing to draw', () => {
    const page = pageOf(graphOf([], []), 'Empty')
    expect(page).toStartWith('<!doctype html>')
    expect(page).toContain('<title>Empty</title>')
    expect(page).toContain('Nothing to draw')
    expect(page).not.toMatch(/<svg|<script/)
  })
})

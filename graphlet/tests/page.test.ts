import { describe, expect, test } from 'claude-code/testing'

import { SHOP, graphOf, undirected } from './fixture'
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
 * arrowhead, where it has one.
 */
type Drawn = { from: number; to: number; isDashed: boolean; path: string; xs: number[]; ys: number[]; tip: { x: number; y: number } }

const LINK = /<g class="link e(\d+) e(\d+)"><path( stroke-dasharray="[^"]*")? d="([^"]*)"\/>(?:<polygon points="([^"]*)"\/>)?<\/g>/g

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

/** Where a page's drawing starts, and its width and its height. */
const size = (page: string): number[] => numbers(/viewBox="([^"]*)"/.exec(page)?.[1] ?? '')

const isOver = (a: Box, b: Box): boolean => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom

describe('the nodes of a page', () => {
  test('every node has a box in its tone, with its label written once, after its mark and before its badge', () => {
    const page = pageOf(SHOP, 'Shop')
    expect(boxes(page)).toHaveLength(SHOP.nodes.length)
    for (const node of SHOP.nodes) expect(count(page, `>${node.label}<`)).toBe(1)
    expect(page).toMatch(/<g class="node dim n7"[^>]*><rect[^>]*><text><tspan[^>]*><tspan class="mark">→<\/tspan><tspan[^>]*>money\.ts<\/tspan><tspan class="badge"[^>]*>2<\/tspan>/)
    expect(count(page, 'class="node bad n')).toBe(2)
  })

  test('a node the graph puts foremost has a heavy box and bold words, and no other node has', () => {
    const page = pageOf(readGraph({ ...SHOP, nodes: SHOP.nodes.map(node => ({ ...node, ...(node.id === 'src/cart.ts' ? { priority: 3 } : {}) })) }), 'Shop')
    expect(count(page, ' foremost n')).toBe(1)
    expect(page).toMatch(/<g class="node bad foremost n1"[^>]*><rect[^>]*><text><tspan[^>]*><tspan class="mark">●<\/tspan><tspan[^>]*>cart\.ts</)
    const widthOf = (rule: RegExp): number => Number(rule.exec(page)?.[1])
    expect(widthOf(/\.foremost \.box \{ stroke-width: ([\d.]+); \}/)).toBe(2 * widthOf(/\n\.box \{[^}]*stroke-width: ([\d.]+); \}/))
    expect(count(pageOf(SHOP, 'Shop'), ' foremost n')).toBe(0)
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

  test("the boxes stand in the layers and the order of the terminal's picture, and across where it has them, so a box over the one box it links to stands over its middle", () => {
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
    const middleOf = (id: string): number => {
      const box = stood.flat().find(one => one.id === id)
      return ((box?.x ?? NaN) + (box?.right ?? NaN)) / 2
    }
    expect(Math.abs(middleOf('under') - middleOf('x'))).toBeLessThan(1)
    expect(Math.abs(middleOf('x') - middleOf('top2'))).toBeLessThan(1)
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
      const [left = NaN, top = NaN, width = NaN, height = NaN] = size(page)
      const stood = boxes(page)
      expect(page).not.toMatch(/NaN|Infinity|undefined/)
      expect(stood).toHaveLength(graph.nodes.length)
      expect(links(page)).toHaveLength(graph.links.length)
      expect(stood.filter(box => box.x < left || box.y < top || box.right > left + width || box.bottom > top + height)).toEqual([])
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

  test('a link\'s label is written once, on the first stretch of its link, and escaped', () => {
    const graph = readGraph({
      nodes: ['a', 'b', 'c'].map(id => ({ id, label: id })),
      links: [
        { from: 'a', to: 'b', label: '<i>yes</i>' },
        { from: 'a', to: 'c' },
      ],
    })
    const page = pageOf(graph, 'labels')
    expect(page).toMatch(/<g class="link e0 e1"><path [^>]*\/><polygon [^>]*\/><text x="[\d.]+" y="[\d.]+">&lt;i&gt;yes&lt;\/i&gt;<\/text><\/g>/)
    expect(count(page, '&lt;i&gt;yes')).toBe(1)
    expect(page).not.toContain('<i>yes')
  })

  test('labels that would stand over each other are written one under the other, a long label is cut as the terminal cuts it, and a link to itself has none', () => {
    const graph = readGraph({
      nodes: ['a', 'b'].map(id => ({ id, label: id })),
      links: [
        { from: 'a', to: 'b', label: 'yes' },
        { from: 'b', to: 'a', label: 'no' },
        { from: 'a', to: 'a', label: 'again' },
      ],
    })
    const page = pageOf(graph, 'labels')
    const at = (text: string): number => Number(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)">${text}</text>`).exec(page)?.[1])
    expect(Math.abs(at('yes') - at('no'))).toBeGreaterThanOrEqual(11)
    expect(page).not.toContain('again')
    const long = pageOf(readGraph({ nodes: ['a', 'b'].map(id => ({ id, label: id })), links: [{ from: 'a', to: 'b', label: 'a much longer label than a link may say' }] }), 'long')
    expect(long).toContain('>a much l…may say</text>')
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

describe('an undirected graph on a page', () => {
  test('a link has no arrowhead and reaches its boxes, and runs down the page whichever way round it names them', () => {
    const page = pageOf(undirected(graphOf(['a', 'b', 'c'], [['b', 'a'], ['c', 'b'], ['a', 'c'], ['c', 'c']])), '')
    const [a, b, c] = boxes(page)
    const [down, arc, , loop] = links(page)
    expect(count(page, '<polygon')).toBe(0)
    expect(links(page).map(link => [link.from, link.to, link.isDashed])).toEqual([
      [1, 0, false],
      [2, 1, false],
      [0, 2, false],
      [2, 2, false],
    ])
    expect([down?.ys[0], down?.ys.at(-1)]).toEqual([a?.bottom, b?.y])
    expect(arc?.ys.at(-1)).toBe(b?.bottom)
    expect(loop?.xs.at(-1)).toBe(c?.right)
  })
})

describe('a graph of both kinds on a page', () => {
  test('a link that runs one way has an arrowhead, and one that runs no way has none', () => {
    const page = pageOf(readGraph({ nodes: ['a', 'b', 'c'].map(id => ({ id, label: id })), links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', isDirected: false }, { from: 'c', to: 'a', isDirected: false }] }), '')
    expect([...page.matchAll(/<g class="link[^"]*">(.*?)<\/g>/g)].map(([, inner = '']) => inner.includes('<polygon'))).toEqual([true, false, false])
  })
})

describe('links between the same two nodes on a page', () => {
  test('a link between the same two boxes as one before it, of the same kind, runs beside it, so the two never lie on one line', () => {
    const page = pageOf(readGraph({ nodes: ['a', 'b'].map(id => ({ id, label: id })), links: [{ from: 'a', to: 'b', label: 'start' }, { from: 'a', to: 'b', label: 'resume' }] }), '')
    const [first = [], second = []] = [...page.matchAll(/<g class="link[^"]*"><path d="([^"]*)"/g)].map(([, path = '']) => numbers(path))
    expect(first).not.toEqual(second)
    expect((first[0] ?? 0) - (second[0] ?? 0)).toBeGreaterThan(0)
    expect([first[1], first.at(-1)]).toEqual([second[1], second.at(-1)])
  })

  test('a link of each kind between the same two boxes, twins between boxes of one layer, and twins that run back up all run apart, the ones back up on the far side', () => {
    const pathsOf = (graph: Graph): number[][] => [...pageOf(graph, '').matchAll(/<g class="link[^"]*"><path(?: stroke-dasharray="[^"]*")? d="([^"]*)"/g)].map(([, path = '']) => numbers(path))
    const [one, none] = pathsOf(readGraph({ nodes: ['a', 'b'].map(id => ({ id, label: id })), links: [{ from: 'a', to: 'b' }, { from: 'a', to: 'b', isDirected: false }] }))
    expect(one).not.toEqual(none)
    const flat = readGraph({ nodes: ['a', 'b'].map(id => ({ id, label: id, layer: 0 })), links: [{ from: 'a', to: 'b', label: 'x' }, { from: 'a', to: 'b', label: 'y' }] })
    const [x, y] = pathsOf(flat)
    expect(x).not.toEqual(y)
    const [p = [], q = [], r = [], s = []] = pathsOf(
      readGraph({
        nodes: ['a', 'b'].map(id => ({ id, label: id })),
        links: [{ from: 'a', to: 'b', label: 'p' }, { from: 'a', to: 'b', label: 'q' }, { from: 'b', to: 'a', label: 'r' }, { from: 'b', to: 'a', label: 's' }],
      }),
    )
    expect(Math.min(r[0] ?? 0, s[0] ?? 0) - Math.max(p[0] ?? 0, q[0] ?? 0)).toBeGreaterThanOrEqual(12)
  })
})

describe('the page as a document', () => {
  test('a link in a tone is drawn in its tone\'s color, and a link in none in the color of lines', () => {
    const graph = readGraph({
      nodes: ['a', 'b', 'c'].map(id => ({ id, label: id })),
      links: [{ from: 'a', to: 'b', tone: 'bad' }, { from: 'a', to: 'c' }],
    })
    const page = pageOf(graph, '')
    expect(count(page, '<g class="link toned bad e0 e1">')).toBe(1)
    expect(links(page).map(link => [link.from, link.to])).toEqual([[0, 2]])
    expect(page).toContain('.link.toned { color: var(--tone); }')
  })

  test('a graph that runs right is drawn with its layers side by side, a link leaving a box by its right side and reaching the next by its left', () => {
    const graph = readGraph({ nodes: ['a', 'b', 'c'].map(id => ({ id, label: id })), links: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }] })
    const page = pageOf(graph, '', 'right')
    const [a, b, c] = boxes(page)
    expect((b?.x ?? 0) > (a?.right ?? 0) && b?.x === c?.x && (c?.y ?? 0) > (b?.bottom ?? 0)).toBe(true)
    const [toB] = links(page)
    expect(toB?.xs[0]).toBe(a?.right)
    expect(toB?.tip.x).toBe(b?.x)
  })

  test('a group is drawn as a frame around its nodes, its label at its top, and no other node within it', () => {
    const graph = readGraph({
      nodes: [{ id: 'in', label: 'in' }, { id: 'a', label: 'a', group: 'g' }, { id: 'b', label: 'b', group: 'g' }, { id: 'out', label: 'out' }],
      links: [{ from: 'in', to: 'a' }, { from: 'in', to: 'out' }, { from: 'a', to: 'b' }],
      groups: [{ id: 'g', label: 'Group <1>' }],
    })
    const page = pageOf(graph, '')
    const [hull] = [...page.matchAll(/<rect class="hull" ([^>]*)>/g)].map(([, sizes = '']) => {
      const [x = NaN, y = NaN, width = NaN, height = NaN] = numbers(sizes)
      return { x, y, right: x + width, bottom: y + height }
    })
    const [inBox, a, b, out] = boxes(page)
    const isWithin = (box: Box | undefined): boolean => box !== undefined && hull !== undefined && box.x > hull.x && box.right < hull.right && box.y > hull.y && box.bottom < hull.bottom
    expect([inBox, a, b, out].map(isWithin)).toEqual([false, true, true, false])
    expect(page).toContain('<text class="title"')
    expect(page).toContain('>Group &lt;1&gt;</text>')
  })

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
    expect(page).toContain('<g class="node plain n0"')
    expect(count(page, '<script')).toBe(1)
    expect(page).not.toMatch(/img|onload|"quotes"|it's/)
  })

  test('the page fetches nothing: it names no address but the namespace of SVG, and has no source, link or import', () => {
    const page = pageOf(SHOP, 'Shop')
    expect(count(page, ' xmlns="http://www.w3.org/2000/svg"')).toBe(1)
    expect(page.replace(' xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/https?:|\/\/|src=|href=|url\(|@import|<link|<iframe/)
  })

  test('an empty graph gives a page that says there is nothing to draw', () => {
    const page = pageOf(graphOf([], []), 'Empty')
    expect(page).toStartWith('<!doctype html>')
    expect(page).toContain('<title>Empty</title>')
    expect(page).toContain('Nothing to draw')
    expect(page).toContain('--page:')
    expect(page).not.toMatch(/<svg|<script/)
  })
})

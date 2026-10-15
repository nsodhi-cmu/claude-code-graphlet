import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, RenderPropsOf, RenderSurface } from 'claude-code'

import { LOOK, SHOP, cellsOf, graphOf, picture, undirected } from './fixture'
import { readGraph } from '../hooks/layers'
import { GUIDE, graphOf as graphLines, pictureOf } from '../hooks/reply'
import { viewOf } from '../hooks/view'

// The mod through the engine, as another mod uses it: a host says what its
// panes hold, places the drawing among its own elements, and hears what the
// person does to the graph. And as the model uses it: a reply that holds a
// graph block, drawn on each surface, and the section of the system prompt
// that tells the model of such blocks.

/**
 * A mod that uses graphlet. It shows the shop's graph in two panes: `free`,
 * where the selection is graphlet's to keep, and `held`, where the host says
 * which node is selected. Over each drawing it writes `host` and then what
 * graphlet answered it and what it has heard, and it has a Button for a turn
 * of the wheel, one for a scroll by no number at all, and one for a step to
 * the right.
 */
const HOST: Plugin = {
  name: 'host',
  tier: 'prepend',
  register(on) {
    const node = (id: string, label: string, layer: number, rest: object = {}) => ({ id, label, layer, mark: '○', ...rest })
    const GRAPH = {
      nodes: [
        node('src/price.ts', 'price.ts', 2, { mark: '◆', tone: 'note' as const }),
        node('src/cart.ts', 'cart.ts', 1, { mark: '●', tone: 'bad' as const }),
        node('src/invoice.ts', 'src/invoice.ts', 1, { mark: '●', tone: 'bad' as const }),
        node('src/ui.ts', 'ui.ts', 1),
        node('src/email.ts', 'email.ts', 1, { mark: '▲', tone: 'warn' as const }),
        node('src/pages/checkout.ts', 'checkout.ts', 0),
        node('src/pages/invoice.ts', 'pages/invoice.ts', 0),
        node('src/money.ts', 'money.ts', 3, { mark: '→', tone: 'dim' as const, badge: '2' }),
      ],
      links: [
        { from: 'src/cart.ts', to: 'src/price.ts' },
        { from: 'src/invoice.ts', to: 'src/price.ts' },
        { from: 'src/ui.ts', to: 'src/price.ts' },
        { from: 'src/email.ts', to: 'src/price.ts' },
        { from: 'src/pages/checkout.ts', to: 'src/cart.ts' },
        { from: 'src/pages/invoice.ts', to: 'src/invoice.ts' },
        { from: 'src/price.ts', to: 'src/money.ts' },
      ],
    }
    const heard: string[] = []

    on('graphlet.select', async ($, e, next) => {
      heard.push(`select ${e.pane} ${e.node}`)
      return next(e)
    })
    on('graphlet.key', async ($, e, next) => {
      heard.push(`key ${e.pane} ${e.key}`)
      return next(e)
    })
    on('ui.press', { plugin: 'host' }, async ($, e) => {
      if (e.element === 'wheel') await $.graphlet.scroll({ pane: e.requestId, by: 1 })
      if (e.element === 'drift') await $.graphlet.scroll({ pane: e.requestId, by: Number.NaN })
      if (e.element === 'right') heard.push(`step ${await $.graphlet.step({ pane: e.requestId, move: 'right' })}`)
      $.ui.invalidate('ui.render')
      return { element: e.element }
    })
    const HUB = {
      nodes: [{ id: 'hub', label: 'hub' }, ...Array.from({ length: 40 }, (_, index) => ({ id: `leaf${index}`, label: `leaf${index}` }))],
      links: Array.from({ length: 40 }, (_, index) => ({ from: 'hub', to: `leaf${index}` })),
    }
    const DENSE = {
      nodes: Array.from({ length: 60 }, (_, index) => ({ id: `d${index}`, label: `node number ${index}`, ...(index % 5 === 0 ? { tone: 'bad' as const } : {}) })),
      links: Array.from({ length: 180 }, (_, index) => ({ from: `d${index < 30 ? 0 : (index * 7) % 60}`, to: `d${(index * 13 + 5) % 60}` })),
    }
    on('ui.render', { component: 'Pane', requestId: 'dense' }, async ($, e, next) => {
      await $.graphlet.show({ pane: 'dense', graph: DENSE, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      return next(e)
    })
    const RANKED = {
      nodes: [
        { id: 'request', label: 'request' },
        { id: 'router', label: 'router', priority: 2 },
        { id: 'cache', label: 'cache', priority: 2 },
        { id: 'database', label: 'database', priority: 1 },
      ],
      links: [
        { from: 'request', to: 'router' },
        { from: 'router', to: 'cache' },
        { from: 'router', to: 'database' },
      ],
    }
    on('ui.render', { component: 'Pane', requestId: 'ranked' }, async ($, e, next) => {
      const { Box, Text } = $.ui.resolve(e)
      const shown = await $.graphlet.show({ pane: 'ranked', graph: RANKED, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      const drawing = await next(e)
      return (
        <Box flexDirection="column">
          <Text>{`host ${JSON.stringify({ shown })}`}</Text>
          {drawing}
        </Box>
      )
    })
    on('ui.render', { component: 'Pane', requestId: 'big' }, async ($, e, next) => {
      await $.graphlet.show({ pane: 'big', graph: HUB, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      return next(e)
    })
    on('ui.render', { component: 'Pane' }, async ($, e, next) => {
      if (e.requestId !== 'free' && e.requestId !== 'held') return next(e)
      const { Box, Text, Button } = $.ui.resolve(e)
      const columns = e.props.bodyColumns
      const size = await $.graphlet.measure({ graph: GRAPH, columns })
      const shown = await $.graphlet.show({
        pane: e.requestId,
        graph: GRAPH,
        columns,
        rows: e.props.scroll.bodyRows,
        ...(e.requestId === 'held' ? { selected: 'src/ui.ts' } : {}),
      })
      const drawing = await next(e)
      return (
        <Box flexDirection="column">
          <Text>{`host ${JSON.stringify({ size, shown, heard })}`}</Text>
          {drawing}
          <Button key="wheel" label="wheel" onPress={() => undefined} />
          <Button key="drift" label="drift" onPress={() => undefined} />
          <Button key="right" label="right" onPress={() => undefined} />
        </Box>
      )
    })
  },
}

const WITH_HOST = { plugins: [HOST] }

const PANE: RenderPropsOf['Pane'] = {
  title: 'Host',
  isFocused: false,
  bodyColumns: 90,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}
const NARROW: RenderPropsOf['Pane'] = { ...PANE, bodyColumns: 44 }

/**
 * Stands in for what lies beneath the plugins: a pane no plugin draws is the
 * engine's own, and the temporary folder, the file system, and the programs
 * are the test's. Returns what the plugin did to each.
 */
const world = (on: On) => {
  const seen = {
    written: [] as Array<{ path: string; text: string }>,
    ran: [] as string[][],
    toasts: [] as string[],
    /** The one program that opens a file on this system; null when none does. */
    opener: 'xdg-open' as string | null,
  }
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'the engine drew this') as never
  })
  on('ui.press', ($, e) => ({ element: e.element }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('env.get', ($, e) => ({ value: e.name === 'TMPDIR' ? '/var/tmp/' : undefined }))
  on('fs.write', ($, e) => {
    seen.written.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    seen.ran.push([...e.argv])
    if (e.argv[0] !== seen.opener) return { deny: 'no such program' }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return seen
}

const mount = ($: Engine, requestId: string, props = PANE) =>
  $.ui.mount({ plugin: 'graphlet', surface: 'terminal', component: 'Pane', requestId, props })

type Pane = Awaited<ReturnType<typeof mount>>

/** The rows graphlet's surface module drew. */
const rowsOf = async (pane: Pane): Promise<string[]> => {
  const drawn = (await pane.drawn({ in: 'graph' })) as { children?: Array<{ children?: unknown[] }> }
  return (drawn.children ?? []).map(row =>
    (row.children ?? [])
      .map(span => (typeof span === 'string' ? span : ((span as { children?: string[] }).children ?? []).join('')))
      .join(''),
  )
}

/** What the host wrote over the drawing. */
const said = async (
  pane: Pane,
): Promise<{ size: { columns: number; rows: number }; shown: { rows: number; selected: string | null }; heard: string[] }> =>
  JSON.parse(((await pane.find({ type: 'Text', text: /^host / }))?.text ?? 'host {}').slice('host '.length))

const view = viewOf(LOOK)
const ORIGIN = { x: 0, y: 0 }
/** Where a node's box is in the shop's graph, drawn whole in the pane's room. */
const boxOf = (id: string): { x: number; y: number } => {
  const hit = view.draw(SHOP, null, { columns: 90, rows: 40 }, ORIGIN).hits.find(one => 'node' in one && one.node === id)
  if (hit === undefined) throw new Error(`${id} is not drawn`)
  return hit
}
const click = (pane: Pane, at: { x: number; y: number }) =>
  pane.pointer({ type: 'down', x: at.x + 1, y: at.y + 1, button: 'left', in: 'graph' })

test('a pane\'s owner says what the pane holds, and next hands it the drawing to place among its own elements', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free')
  expect(await rowsOf(pane)).toEqual(picture(view.draw(SHOP, 'src/price.ts', { columns: 90, rows: 40 }, ORIGIN)))
  expect(await said(pane)).toEqual({
    size: { columns: 90, rows: 19 },
    shown: { rows: 19, selected: 'src/price.ts' },
    heard: [],
  })
  expect(await pane.find({ in: 'graph', type: 'Text', text: /^◆ price\.ts$/ })).toMatchObject({
    props: { color: 'suggestion', bold: true, inverse: true },
  })
  expect(await pane.find({ in: 'graph', type: 'Text', text: /^● cart\.ts *$/ })).toMatchObject({ props: { color: 'error' } })
  await pane.unmount()
})

test('a click on a box selects its node: the owner hears of it, and a pane whose owner names no selection draws it selected', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free')
  await click(pane, boxOf('src/email.ts'))
  expect(await said(pane)).toMatchObject({
    shown: { selected: 'src/email.ts' },
    heard: ['select free src/email.ts'],
  })
  expect((await rowsOf(pane))[6]).toContain('║ ▲ email.ts ║')

  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'graph' })
  await pane.pointer({ type: 'down', x: boxOf('src/ui.ts').x + 1, y: boxOf('src/ui.ts').y + 1, button: 'right', in: 'graph' })
  expect((await said(pane)).heard).toHaveLength(1)
  await pane.unmount()
})

test('the arrow keys and the letters under them move the selection, and any other key is handed to the owner', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free')
  await click(pane, boxOf('src/email.ts'))
  await pane.key({ key: 'left', in: 'graph' })
  await pane.key({ key: 'j', in: 'graph' })
  await pane.key({ key: 'down', in: 'graph' })
  await pane.key({ key: 'down', in: 'graph' })
  await pane.key({ key: 't', in: 'graph' })
  await pane.redraw()
  expect(await said(pane)).toMatchObject({
    shown: { selected: 'src/money.ts' },
    heard: ['select free src/email.ts', 'select free src/ui.ts', 'select free src/price.ts', 'select free src/money.ts', 'key free t'],
  })
  await pane.unmount()
})

test('a pane whose owner names no selection opens on the first node the graph names of those of the highest priority, and draws the others of it heavy', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'ranked', NARROW)
  expect((await said(pane)).shown.selected).toBe('router')
  expect(await rowsOf(pane)).toEqual([
    '                ┌─────────┐',
    '                │ request │',
    '                └────┬────┘',
    '                     │',
    '                     ▼',
    '                ╔════════╗',
    '                ║ router ║',
    '                ╚════╤═══╝',
    '              ┌──────┴─────┐',
    '              ▼            ▼',
    '          ┏━━━━━━━┓  ┌──────────┐',
    '          ┃ cache ┃  │ database │',
    '          ┗━━━━━━━┛  └──────────┘',
    '                                      html ↗',
  ])
  expect(await pane.find({ in: 'graph', type: 'Text', text: /^ *cache *$/ })).toMatchObject({ props: { bold: true } })
  await pane.unmount()
})

test('a pane whose owner names the selected node draws that one, whatever is picked, and still hears each pick', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'held')
  expect((await said(pane)).shown.selected).toBe('src/ui.ts')
  await click(pane, boxOf('src/email.ts'))
  expect(await said(pane)).toMatchObject({ shown: { selected: 'src/ui.ts' }, heard: ['select held src/email.ts'] })
  await pane.unmount()
})

test('a click on a count scrolls the graph and selects nothing; the window stays until another node is selected', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free', NARROW)
  const before = await rowsOf(pane)
  expect(before.at(-1)).toBe('                            2 more →  html ↗')

  await pane.pointer({ type: 'down', x: 30, y: before.length - 1, button: 'left', in: 'graph' })
  const scrolled = await rowsOf(pane)
  expect(scrolled.at(-1)).toStartWith('← 2 more')
  expect((await said(pane)).heard).toEqual([])

  await pane.redraw()
  expect(await rowsOf(pane)).toEqual(scrolled)

  await pane.key({ key: 'up', in: 'graph' })
  await pane.key({ key: 'left', in: 'graph' })
  await pane.key({ key: 'left', in: 'graph' })
  await pane.key({ key: 'left', in: 'graph' })
  expect((await said(pane)).shown.selected).toBe('src/cart.ts')
  expect((await rowsOf(pane)).at(-1)).toStartWith('                            2 more →')
  await pane.unmount()
})

test('a drag from where no box is moves the graph with the pointer and selects nothing; the window stays where it is dropped', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free', NARROW)
  const room = { columns: 44, rows: 40 }
  const from = view.show(SHOP, 'src/price.ts', room, ORIGIN)
  const shownAt = (x: number): string[] => picture(view.draw(SHOP, 'src/price.ts', room, view.scroll(SHOP, room, from, { x, y: 0 })))
  const isFree = (x: number, y: number): boolean =>
    [0, 6, 8, 10].every(by => !view.draw(SHOP, 'src/price.ts', room, view.scroll(SHOP, room, from, { x: by, y: 0 })).hits.some(hit => hit.x <= x && x < hit.x + hit.width && hit.y <= y && y < hit.y + hit.height))
  const blank = { x: 20, y: 4 }
  expect(isFree(blank.x, blank.y)).toBe(true)
  await pane.pointer({ type: 'down', ...blank, button: 'left', in: 'graph' })
  await pane.pointer({ type: 'move', x: blank.x - 6, y: blank.y, button: 'left', in: 'graph' })
  expect(await rowsOf(pane)).toEqual(shownAt(6))
  await pane.pointer({ type: 'move', x: blank.x - 10, y: blank.y, button: 'left', in: 'graph' })
  await pane.pointer({ type: 'up', x: blank.x - 10, y: blank.y, button: 'left', in: 'graph' })
  expect(await rowsOf(pane)).toEqual(shownAt(10))
  expect((await said(pane)).heard).toEqual([])
  await pane.redraw()
  expect(await rowsOf(pane)).toEqual(shownAt(10))

  await pane.pointer({ type: 'move', x: blank.x + 30, y: blank.y, in: 'graph' })
  expect(await rowsOf(pane)).toEqual(shownAt(10))
  await pane.pointer({ type: 'down', ...blank, button: 'left', in: 'graph' })
  await pane.pointer({ type: 'move', x: blank.x + 4, y: blank.y, button: 'left', in: 'graph' })
  await pane.pointer({ type: 'move', x: blank.x + 40, y: blank.y, in: 'graph' })
  await pane.pointer({ type: 'down', ...blank, button: 'left', in: 'graph' })
  await pane.pointer({ type: 'move', x: blank.x - 2, y: blank.y, button: 'left', in: 'graph' })
  expect(await rowsOf(pane)).toEqual(shownAt(8))

  const other = view.draw(SHOP, 'src/price.ts', room, view.scroll(SHOP, room, from, { x: 8, y: 0 })).hits.find(hit => 'node' in hit && hit.node !== 'src/price.ts' && hit.height > 2)
  if (other === undefined || !('node' in other)) throw new Error('no other node is in view')
  await click(pane, other)
  const picked = await rowsOf(pane)
  await pane.pointer({ type: 'up', x: blank.x - 30, y: blank.y, button: 'left', in: 'graph' })
  expect((await said(pane)).shown.selected).toBe(other.node)
  expect(await rowsOf(pane)).toEqual(picked)
  await pane.unmount()
})

test('/ finds a node by its label as it is typed: the selection goes to the first found and return to the next, and what is typed there is not the owner\'s', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free')
  await click(pane, boxOf('src/email.ts'))
  for (const key of ['/', 'i', 'n']) await pane.key({ key, in: 'graph' })
  await pane.redraw()
  expect((await said(pane)).shown.selected).toBe('src/invoice.ts')
  expect((await rowsOf(pane)).at(-1)).toContain('/in · 1 of 2')
  await pane.key({ key: 'return', in: 'graph' })
  await pane.redraw()
  expect((await said(pane)).shown.selected).toBe('src/pages/invoice.ts')
  expect((await rowsOf(pane)).at(-1)).toContain('/in · 2 of 2')
  for (const key of ['backspace', 'backspace', 'backspace', 't']) await pane.key({ key, in: 'graph' })
  await pane.redraw()
  expect((await rowsOf(pane)).at(-1)).not.toContain('/')
  expect((await said(pane)).heard).toEqual([
    'select free src/email.ts',
    'select free src/price.ts',
    'select free src/invoice.ts',
    'select free src/pages/invoice.ts',
    'select free src/price.ts',
    'key free t',
  ])
  await pane.unmount()
})

test('f draws the graph in focus on the selected node and its nearest, each saying how many of its links lead out of focus, and f again draws it all', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'big')
  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'graph' })
  await pane.key({ key: 'f', in: 'graph' })
  await pane.redraw()
  const focused = (await rowsOf(pane)).join('\n')
  expect(focused).toContain('hub  +17')
  expect(focused).toContain('17 nodes and 17 links left out')
  await pane.key({ key: 'f', in: 'graph' })
  await pane.redraw()
  const whole = (await rowsOf(pane)).join('\n')
  expect(whole).toContain('║ hub ║')
  expect(whole).not.toContain('+17')
  expect(whole).not.toContain('left out')
  await pane.unmount()
})

test('the owner passes on a turn of the wheel, and asks where a move of its own keys lands', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free', NARROW)
  await pane.press({ plugin: 'host', key: 'wheel' })
  expect(await rowsOf(pane)).toEqual(picture(view.draw(SHOP, 'src/price.ts', { columns: 44, rows: 40 }, { x: 8, y: 0 })))

  await click(pane, { x: 0, y: 6 })
  await pane.press({ plugin: 'host', key: 'right' })
  expect((await said(pane)).heard).toEqual(['select free src/cart.ts', 'step src/invoice.ts'])
  expect((await said(pane)).shown.selected).toBe('src/cart.ts')
  await pane.unmount()
})

test('a room or a scroll that is no number draws the smallest picture and scrolls nothing, and leaves the pane drawing', WITH_HOST, async ($, on) => {
  world(on)
  const odd = await mount($, 'free', { ...PANE, bodyColumns: Number.NaN, scroll: { offset: 0, bodyRows: Number.POSITIVE_INFINITY } })
  expect((await said(odd)).shown).toEqual({ rows: 2, selected: 'src/price.ts' })
  await odd.unmount()

  const pane = await mount($, 'free', NARROW)
  const before = await rowsOf(pane)
  await pane.press({ plugin: 'host', key: 'drift' })
  expect(await rowsOf(pane)).toEqual(before)
  await pane.press({ plugin: 'host', key: 'wheel' })
  expect(await rowsOf(pane)).not.toEqual(before)
  await pane.unmount()
})

test('each pane has its own graph, selection, and window', WITH_HOST, async ($, on) => {
  world(on)
  const [free, held] = [await mount($, 'free'), await mount($, 'held', NARROW)]
  await click(free, boxOf('src/email.ts'))
  expect((await said(free)).shown.selected).toBe('src/email.ts')
  expect((await said(held)).shown.selected).toBe('src/ui.ts')
  expect((await rowsOf(held)).at(-1)).toContain('more')
  expect((await rowsOf(free)).at(-1)?.trim()).toBe('html ↗')
  await free.unmount()
  await held.unmount()
})

test('a pane graphlet was told nothing of is left as it is, and so is every surface but the terminal', WITH_HOST, async ($, on) => {
  world(on)
  const other = await mount($, 'someone-elses')
  expect(await other.find({ type: 'Text', text: 'the engine drew this' })).toBeDefined()
  expect(await other.find({ type: 'Client' })).toBeUndefined()
  await other.unmount()

  const terminal = await mount($, 'free')
  await terminal.unmount()
  const desktop = await $.ui.mount({ plugin: 'graphlet', surface: 'desktop', component: 'Pane', requestId: 'free', props: PANE })
  expect(await desktop.find({ type: 'Text', text: 'the engine drew this' })).toBeDefined()
  expect(await desktop.find({ type: 'Client' })).toBeUndefined()
  await desktop.unmount()
})

test('graphs are drawn as the person\'s settings say', { ...WITH_HOST, options: { scroll: 'sheet', labels: 'clip', links: 'merged' } }, async ($, on) => {
  world(on)
  const pane = await mount($, 'free', NARROW)
  const sheet = viewOf({ scroll: 'sheet', labels: 'clip', links: 'merged', motion: 'still' })
  const rows = await rowsOf(pane)
  expect(rows).toEqual(picture(sheet.draw(SHOP, 'src/price.ts', { columns: 44, rows: 40 }, sheet.show(SHOP, 'src/price.ts', { columns: 44, rows: 40 }, ORIGIN))))
  expect(rows).not.toEqual(picture(view.draw(SHOP, 'src/price.ts', { columns: 44, rows: 40 }, ORIGIN)))
  await pane.unmount()
})

test('flowing, the beads of the selected node\'s links move on at each step of the surface\'s clock, and come round again; still, nothing moves', { ...WITH_HOST, options: { motion: 'flowing' } }, async ($, on) => {
  world(on)
  const pane = await mount($, 'free')
  /** Where the bright cells of lit lines stand, as `row:column`. */
  const beads = async (): Promise<string[]> => {
    const drawn = (await pane.drawn({ in: 'graph' })) as { children?: Array<{ children?: unknown[] }> }
    return (drawn.children ?? []).flatMap((row, y) => {
      let x = 0
      return (row.children ?? []).flatMap(span => {
        const { props = {}, children = [] } = typeof span === 'string' ? {} : (span as { props?: Record<string, unknown>; children?: string[] })
        const text = typeof span === 'string' ? span : children.join('')
        const at = x
        x += cellsOf(text).length
        return props.color === 'claude' && props.bold === true && props.inverse !== true ? [`${y}:${at}`] : []
      })
    })
  }
  const first = await beads()
  expect(first.length).toBeGreaterThan(0)
  await pane.advance(150)
  const second = await beads()
  expect(second.length).toBeGreaterThan(0)
  expect(second).not.toEqual(first)
  await pane.advance(450)
  expect(await beads()).toEqual(first)
  await pane.unmount()
})

test('a graph too busy to draw whole in a large pane is drawn plainer, as far as the engine needs, and still drawn', { ...WITH_HOST, options: { motion: 'flowing' } }, async ($, on) => {
  world(on)
  const pane = await mount($, 'dense', { ...PANE, bodyColumns: 200, scroll: { offset: 0, bodyRows: 60 } })
  const rows = await rowsOf(pane)
  expect(rows).toHaveLength(60)
  expect(rows.some(row => row.includes('node number 0'))).toBe(true)
  expect(JSON.stringify(await pane.drawn({ in: 'graph' })).length).toBeLessThan(100_000)
  await pane.advance(150)
  expect(JSON.stringify(await pane.drawn({ in: 'graph' })).length).toBeLessThan(100_000)
  await pane.unmount()
})

test('still, the lit lines are drawn once and the clock moves nothing', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free')
  const before = await pane.drawn({ in: 'graph' })
  await pane.advance(600)
  expect(await pane.drawn({ in: 'graph' })).toEqual(before)
  expect((await pane.findAll({ type: 'Text', in: 'graph' })).some(text => text.props.color === 'claude' && text.props.dimColor === true)).toBe(false)
  await pane.unmount()
})

test('a click in the corner writes the graph out as a web page in the temporary folder, and opens it', WITH_HOST, async ($, on) => {
  const seen = world(on)
  const pane = await mount($, 'free')
  const rows = await rowsOf(pane)
  await pane.pointer({ type: 'down', x: 87, y: rows.length - 1, button: 'left', in: 'graph' })
  expect(seen.written.map(file => file.path)).toEqual(['/var/tmp/graphlet-free.html'])
  expect(seen.written[0]?.text).toStartWith('<!doctype html>')
  expect(seen.written[0]?.text).toContain('pages/invoice.ts')
  expect(seen.ran).toEqual([['xdg-open', '/var/tmp/graphlet-free.html']])
  expect(seen.toasts).toEqual(['graphlet: opened the graph in your browser.'])
  expect((await said(pane)).heard).toEqual([])
  await pane.unmount()
})

test('each system\'s opener is tried in turn, and where none opens the page graphlet says where it is', WITH_HOST, async ($, on) => {
  const seen = world(on)
  const pane = await mount($, 'free')
  const corner = { type: 'down', x: 87, y: (await rowsOf(pane)).length - 1, button: 'left', in: 'graph' } as const

  seen.opener = 'open'
  await pane.pointer(corner)
  expect(seen.ran.map(argv => argv[0])).toEqual(['xdg-open', 'open'])
  expect(seen.toasts).toEqual(['graphlet: opened the graph in your browser.'])

  seen.opener = null
  await pane.pointer(corner)
  expect(seen.ran.slice(2).map(argv => argv[0])).toEqual(['xdg-open', 'open', 'cmd'])
  expect(seen.toasts.at(-1)).toBe("graphlet: the graph's page is at /var/tmp/graphlet-free.html")
  await pane.unmount()
})

/** A mod that uses graphlet to show an undirected loop of three in its pane `ring`, and places the drawing as it is handed over. */
const RING_HOST: Plugin = {
  name: 'ring-host',
  tier: 'prepend',
  register(on) {
    const RING = {
      nodes: ['a', 'b', 'c'].map(id => ({ id, label: id })),
      links: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
      isDirected: false,
    }
    on('ui.render', { component: 'Pane', requestId: 'ring' }, async ($, e, next) => {
      await $.graphlet.show({ pane: 'ring', graph: RING, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      return next(e)
    })
  },
}

test('a graph its owner says is undirected reaches graphlet as one, and is drawn with no arrowheads', { plugins: [RING_HOST] }, async ($, on) => {
  world(on)
  const pane = await mount($, 'ring')
  const ring = undirected(graphOf(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]))
  expect(await rowsOf(pane)).toEqual(picture(view.draw(ring, 'a', { columns: 90, rows: 40 }, ORIGIN)))
  expect((await rowsOf(pane)).join('\n')).not.toMatch(/[▲▼]/)
  await pane.unmount()
})

test('flowing, the lit links of an undirected graph pulse together on the surface\'s clock, dim, then bright, and round again', { plugins: [RING_HOST], options: { motion: 'flowing' } }, async ($, on) => {
  world(on)
  const pane = await mount($, 'ring')
  /** How the accent's runs that are not the selected label glow: dim, bright, or neither. */
  const glows = async (): Promise<string[]> =>
    [...new Set((await pane.findAll({ type: 'Text', in: 'graph' })).filter(text => text.props.color === 'claude' && text.props.inverse !== true).map(text => (text.props.dimColor === true ? 'dim' : text.props.bold === true ? 'bright' : 'plain')))].sort()
  expect(await glows()).toEqual(['dim', 'plain'])
  await pane.advance(300)
  expect(await glows()).toEqual(['bright', 'plain'])
  await pane.advance(300)
  expect(await glows()).toEqual(['dim', 'plain'])
  await pane.unmount()
})

const REPLY = [
  'Here is how a request flows:',
  '',
  '```graphlet',
  'Start -> Read the request -> Valid?',
  'Valid? -> Save it -> Done',
  'Valid? -> Ask for a correction [warn]',
  'Ask for a correction -> Read the request',
  '```',
  '',
  'The dashed line is the retry.',
].join('\n')

/** The picture of the graph in `REPLY`. */
const FLOW = [
  '                  ┌───────┐',
  '                  │ Start │',
  '                  └───┬───┘',
  '                      │',
  '                      ▼',
  '            ┌──────────────────┐',
  '            │ Read the request │',
  '            └──────┬───────────┘',
  '                   │   ▲',
  '                   │   └┈┈┐',
  '                   ▼      ┊',
  '              ┌────────┐  ┊',
  '              │ Valid? │  ┊',
  '              └────┬───┘  ┊',
  '     ┌─────────────┴────┐ ┊',
  '     ▼                  ▼ ┊',
  '┌─────────┐  ┌────────────┴─────────┐',
  '│ Save it │  │ Ask for a correction │',
  '└────┬────┘  └──────────────────────┘',
  '     │',
  '     ▼',
  ' ┌──────┐',
  ' │ Done │',
  ' └──────┘',
]

/** Stands in for the engine's own drawing of a reply's text: the bullet, on the block that opens a reply, and then the text. */
const replies = (on: On): void => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, `${e.props.isFirstOfReply ? '● ' : ''}${e.props.text}`) as never
  })
}

/** A surface drawing a block of a reply, in a transcript 80 columns wide. */
const say = ($: Engine, surface: RenderSurface, text: string, rest: Partial<RenderPropsOf['AssistantMessage']> = {}) =>
  $.ui.mount({
    plugin: 'graphlet',
    surface,
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true, ...rest },
    viewport: { columns: 80, rows: 40 },
  })

/** What a drawn element says: its own text and its children's. */
const textOf = (node: unknown): string =>
  typeof node === 'string' ? node : ((node as { children?: unknown[] }).children ?? []).map(textOf).join('')

/** A drawn tree as the lines a terminal shows: each Text its lines, a Markdown its text, and a Box's margins as blank rows above and columns to the left. */
const screenOf = (node: unknown): string[] => {
  if (typeof node === 'string') return node.split('\n')
  const { type, props = {}, children = [] } = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  if (type === 'Text') return textOf(node).split('\n')
  if (type === 'Markdown') return String(props.text).split('\n')
  const left = ' '.repeat(Number(props.marginLeft ?? 0))
  const above = Array<string>(Number(props.marginTop ?? 0)).fill('')
  return [...above, ...children.flatMap(screenOf).map(line => (line === '' ? '' : `${left}${line}`))]
}

test('a graph block in a reply is drawn in its place, in color, under the engine\'s own drawing of the text before it', async ($, on) => {
  replies(on)
  const reply = await say($, 'terminal', REPLY)
  expect(screenOf(await reply.drawn())).toEqual([
    '● Here is how a request flows:',
    '',
    ...FLOW.map(line => `  ${line}`),
    '',
    '  The dashed line is the retry.',
  ])
  expect((await reply.findAll({ type: 'Text', text: /Ask for a correction/ })).map(text => text.props.color)).toContain('warning')
  expect(await reply.find({ type: 'Markdown' })).toMatchObject({ props: { text: 'The dashed line is the retry.' } })
  await reply.unmount()
})

test('a reply with no graph in its blocks, a block still being written, and a summary are left to the engine as they are', async ($, on) => {
  replies(on)
  const texts = ['Nothing to draw.', 'Being written:\n\n```graphlet\nA -> B', '```graphlet\n\n```', '```mermaid\ngraph TD; A --> B\n```']
  for (const text of texts) {
    const reply = await say($, 'terminal', text)
    expect(screenOf(await reply.drawn())).toEqual(`● ${text}`.split('\n'))
    await reply.unmount()
  }
  const summary = await say($, 'terminal', REPLY, { isSummary: true })
  expect(screenOf(await summary.drawn())).toEqual(`● ${REPLY}`.split('\n'))
  await summary.unmount()
})

test('on every other surface, a graph block becomes its picture as plain text, fenced as code', async ($, on) => {
  replies(on)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const reply = await say($, surface, REPLY)
    expect(screenOf(await reply.drawn())).toEqual([
      '● Here is how a request flows:',
      '',
      '```text',
      ...FLOW,
      '```',
      '',
      'The dashed line is the retry.',
    ])
    await reply.unmount()
  }
})

test('a graph in a reply keeps its links separate whatever the setting, since nothing in a reply can be selected to tell merged links apart', { options: { links: 'merged' } }, async ($, on) => {
  replies(on)
  const block = ['A -> C', 'B -> C', 'B -> D']
  const graph = readGraph(graphLines(block))
  const drawnAs = (links: 'separate' | 'merged'): string[] => picture(pictureOf(viewOf({ ...LOOK, links }, true), graph, { columns: 78, rows: 1000 }))
  expect(drawnAs('separate')).not.toEqual(drawnAs('merged'))
  const reply = await say($, 'desktop', ['```graphlet', ...block, '```'].join('\n'))
  expect(screenOf(await reply.drawn())).toEqual(['● ```text', ...drawnAs('separate'), '```'])
  await reply.unmount()
})

test('the model is told of graph blocks wherever the session draws, and not in a run that draws nowhere', async ($, on) => {
  const intro = { id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }
  on('prompt.compose', () => ({ sections: [intro] }))
  const compose = (surfaces: RenderSurface[]) =>
    $.prompt.compose({ model: 'claude', promptModel: 'claude', surfaces, tools: [], outputStyle: null, traits: [] })
  expect((await compose(['terminal'])).sections).toEqual([intro, { id: 'graphlet:graphs', text: GUIDE, scope: 'session' }])
  expect((await compose(['mobile'])).sections.map(section => section.id)).toEqual(['intro', 'graphlet:graphs'])
  expect((await compose([])).sections).toEqual([intro])
})

test('a run that draws nowhere is told of graph blocks where EVAL_GRAPHLET_GUIDE is 1, so what the model writes can be evaluated', async ($, on) => {
  const intro = { id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }
  on('prompt.compose', () => ({ sections: [intro] }))
  on('env.get', ($, e) => ({ value: e.name === 'EVAL_GRAPHLET_GUIDE' ? '1' : undefined }))
  const composed = await $.prompt.compose({ model: 'claude', promptModel: 'claude', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(composed.sections).toEqual([intro, { id: 'graphlet:graphs', text: GUIDE, scope: 'session' }])
})

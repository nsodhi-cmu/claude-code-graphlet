import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, RenderPropsOf, RenderSurface } from 'claude-code'

import { LOOK, SHOP, busy, graphOf, graphRows, picture, undirected } from './fixture'
import type { Drawing, Hit } from '../hooks/draw'
import { readGraph } from '../hooks/layers'
import { GUIDE, graphOf as graphLines, pictureOf } from '../hooks/reply'
import { TIPS } from '../hooks/tips'
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
      edges: [
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
      heard.push(`select ${e.site} ${e.node}`)
      return next(e)
    })
    on('graphlet.open', async ($, e, next) => {
      heard.push(`open ${e.site} ${e.node}`)
      return next(e)
    })
    on('graphlet.key', async ($, e, next) => {
      heard.push(`key ${e.site} ${e.key} ${e.selected}`)
      return next(e)
    })
    on('graphlet.collapse', async ($, e, next) => {
      heard.push(`collapse ${e.site} ${e.group} ${e.isCollapsed}`)
      return next(e)
    })
    let isBandShown = true
    on('ui.press', { plugin: 'host' }, async ($, e) => {
      if (e.element === 'hide') isBandShown = false
      if (e.element === 'wheel') await $.graphlet.scroll({ site: e.requestId, by: 1 })
      if (e.element === 'drift') await $.graphlet.scroll({ site: e.requestId, by: Number.NaN })
      if (e.element === 'right') heard.push(`step ${await $.graphlet.step({ site: e.requestId, move: 'right' })}`)
      if (e.element === 'text') heard.push(await $.graphlet.text({ graph: GRAPH, columns: 78 }))
      $.ui.invalidate('ui.render')
      return { element: e.element }
    })
    const HUB = {
      nodes: [{ id: 'hub', label: 'hub' }, ...Array.from({ length: 40 }, (_, index) => ({ id: `leaf${index}`, label: `leaf${index}` }))],
      edges: Array.from({ length: 40 }, (_, index) => ({ from: 'hub', to: `leaf${index}` })),
    }
    const DENSE = {
      nodes: Array.from({ length: 60 }, (_, index) => ({ id: `d${index}`, label: `node number ${index}`, ...(index % 5 === 0 ? { tone: 'bad' as const } : {}) })),
      edges: Array.from({ length: 180 }, (_, index) => ({ from: `d${index < 30 ? 0 : (index * 7) % 60}`, to: `d${(index * 13 + 5) % 60}` })),
    }
    on('ui.render', { component: 'Pane', requestId: 'dense' }, async ($, e, next) => {
      await $.graphlet.show({ site: 'dense', graph: DENSE, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      return next(e)
    })
    const RANKED = {
      nodes: [
        { id: 'request', label: 'request' },
        { id: 'router', label: 'router', priority: 2 },
        { id: 'cache', label: 'cache', priority: 2 },
        { id: 'database', label: 'database', priority: 1 },
      ],
      edges: [
        { from: 'request', to: 'router' },
        { from: 'router', to: 'cache' },
        { from: 'router', to: 'database' },
      ],
    }
    on('ui.render', { component: 'Pane', requestId: 'ranked' }, async ($, e, next) => {
      const { Box, Text } = $.ui.resolve(e)
      const shown = await $.graphlet.show({ site: 'ranked', graph: RANKED, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      const drawing = await next(e)
      return (
        <Box flexDirection="column">
          <Text>{`host ${JSON.stringify({ shown })}`}</Text>
          {drawing}
        </Box>
      )
    })
    const GROUPED = {
      nodes: [
        { id: 'web', label: 'web' },
        { id: 'api', label: 'api', group: 'back' },
        { id: 'auth', label: 'auth', group: 'back' },
        { id: 'db', label: 'db', group: 'data' },
      ],
      edges: [
        { from: 'web', to: 'api' },
        { from: 'api', to: 'auth' },
        { from: 'auth', to: 'db' },
      ],
      groups: [{ id: 'back', label: 'Backend' }, { id: 'data', label: 'Data', isCollapsed: true }],
      direction: 'down' as const,
    }
    on('ui.render', { component: 'Pane', requestId: 'grouped' }, async ($, e, next) => {
      const { Box, Text } = $.ui.resolve(e)
      const shown = await $.graphlet.show({ site: 'grouped', graph: GROUPED, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      const drawing = await next(e)
      return (
        <Box flexDirection="column">
          <Text>{`host ${JSON.stringify({ shown, heard })}`}</Text>
          {drawing}
        </Box>
      )
    })
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      if (!isBandShown) return next(e)
      const { Box, Text, Button } = $.ui.resolve(e)
      await $.graphlet.show({ site: e.requestId, graph: GRAPH, columns: e.props.bodyColumns, rows: e.props.maxRows })
      const drawing = await next(e)
      return (
        <Box flexDirection="column">
          <Text>{`host ${JSON.stringify({ heard })}`}</Text>
          {drawing}
          <Button key="hide" label="hide" onPress={() => undefined} />
        </Box>
      )
    })
    on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
      if (e.props.tool !== 'deps') return next(e)
      await $.graphlet.show({ site: e.requestId, graph: GRAPH, columns: (e.viewport?.columns ?? 80) - 2, rows: 1000 })
      return next(e)
    })
    on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
      if (e.props.command !== 'deps') return next(e)
      await $.graphlet.show({ site: e.requestId, graph: GRAPH, columns: (e.viewport?.columns ?? 80) - 2, rows: 1000 })
      return next(e)
    })
    const HUGE = {
      nodes: Array.from({ length: 400 }, (_, index) => ({ id: `n${index}`, label: `node number ${index}` })),
      edges: Array.from({ length: 800 }, (_, index) => ({ from: `n${index % 400}`, to: `n${(index * 7 + 1) % 400}` })),
    }
    on('ui.render', { component: 'Pane', requestId: 'huge' }, async ($, e, next) => {
      await $.graphlet.show({ site: 'huge', graph: HUGE, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      return next(e)
    })
    on('ui.render', { component: 'Pane', requestId: 'big' }, async ($, e, next) => {
      await $.graphlet.show({ site: 'big', graph: HUB, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
      return next(e)
    })
    on('ui.render', { component: 'Pane' }, async ($, e, next) => {
      if (e.requestId !== 'free' && e.requestId !== 'held') return next(e)
      const { Box, Text, Button } = $.ui.resolve(e)
      const columns = e.props.bodyColumns
      const size = await $.graphlet.measure({ graph: GRAPH, columns })
      const shown = await $.graphlet.show({
        site: e.requestId,
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
          <Button key="text" label="text" onPress={() => undefined} />
        </Box>
      )
    })
  },
}

const WITH_HOST = { plugins: [HOST] }
/** A host, with graphs drawn as pictures on the desktop app, VS Code, and the mobile app, as the person's `pictures` setting says. */
const PICTURING = { ...WITH_HOST, options: { pictures: 'on' } }

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
    copied: [] as string[],
    /** The one program that opens a file on this system; null when none does. */
    opener: 'xdg-open' as string | null,
  }
  on('ui.render', { component: 'Pane' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'the engine drew this') as never
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'the engine drew this') as never
  })
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'the engine drew this') as never
  })
  on('ui.render', { component: 'CommandOutput' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'the engine drew this') as never
  })
  on('ui.press', ($, e) => ({ element: e.element }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', ($, e) => {
    seen.copied.push(e.text)
    return { value: { isCopied: true as const } }
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

/** The rows graphlet's surface module drew, in the Client under `key`. */
const rowsOf = async (pane: Pick<Pane, 'drawn'>, key = 'graph'): Promise<string[]> => {
  const drawn = (await pane.drawn({ in: key })) as { children?: Array<{ children?: unknown[] }> }
  return (drawn.children ?? []).map(row =>
    (row.children ?? [])
      .map(span => (typeof span === 'string' ? span : ((span as { children?: string[] }).children ?? []).join('')))
      .join(''),
  )
}

/** What the host wrote over the drawing. */
const said = async (
  pane: Pick<Pane, 'find'>,
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
const click = (pane: Pick<Pane, 'pointer'>, at: { x: number; y: number }) =>
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
    heard: ['select free src/email.ts', 'select free src/ui.ts', 'select free src/price.ts', 'select free src/money.ts', 'key free t src/money.ts'],
  })
  await pane.unmount()
})

test('return, or a double click on a box, opens its node: the owner hears which, and a key graphlet has no use for comes with the node selected', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free')
  await click(pane, boxOf('src/email.ts'))
  await pane.key({ key: 'return', in: 'graph' })
  await click(pane, boxOf('src/cart.ts'))
  await click(pane, boxOf('src/cart.ts'))
  await pane.key({ key: 'x', in: 'graph' })
  await pane.redraw()
  expect(await said(pane)).toMatchObject({
    shown: { selected: 'src/cart.ts' },
    heard: ['select free src/email.ts', 'open free src/email.ts', 'select free src/cart.ts', 'open free src/cart.ts', 'key free x src/cart.ts'],
  })
  await pane.unmount()
})

test('a group its owner says is collapsed is drawn as one box; space opens it and collapses it again, a double click on its box or return opens it and selects its first node, and a click on a frame\'s label collapses its group, each heard by the owner', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'grouped', NARROW)
  const screen = async (): Promise<string> => (await rowsOf(pane)).join('\n')
  expect(await screen()).toContain('│ ▸ Data  1 │')
  expect(await screen()).toContain('╭─ Backend ─')
  const at = async (text: string): Promise<{ x: number; y: number }> => {
    const rows = await rowsOf(pane)
    const y = rows.findIndex(row => row.includes(text))
    return { x: (rows[y] ?? '').indexOf(text), y }
  }
  await click(pane, await at('▸ Data'))
  await pane.key({ key: 'space', in: 'graph' })
  await pane.redraw()
  expect(await screen()).toContain('╭─ Data ─')
  expect((await said(pane)).shown.selected).toBe('db')
  await pane.key({ key: 'space', in: 'graph' })
  await pane.redraw()
  expect(await screen()).toContain('▸ Data  1')
  expect((await said(pane)).shown.selected).toBe('data')
  await pane.key({ key: 'return', in: 'graph' })
  await pane.redraw()
  expect(await screen()).toContain('╭─ Data ─')
  const title = await at(' Backend ')
  await pane.pointer({ type: 'down', x: title.x + 2, y: title.y, button: 'left', in: 'graph' })
  await pane.redraw()
  expect(await screen()).toContain('▸ Backend  2')
  const box = await at('▸ Backend')
  await click(pane, box)
  await click(pane, box)
  await pane.redraw()
  expect(await screen()).toContain('╭─ Backend ─')
  expect((await said(pane)).heard).toEqual([
    'select grouped data',
    'collapse grouped data false',
    'select grouped db',
    'collapse grouped data true',
    'collapse grouped data false',
    'select grouped db',
    'collapse grouped back true',
    'select grouped back',
    'collapse grouped back false',
    'select grouped api',
  ])
  await pane.unmount()
})

test('finding a node in a collapsed group opens the group and selects the node', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'grouped', NARROW)
  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'graph' })
  for (const key of ['/', 'd', 'b']) await pane.key({ key, in: 'graph' })
  await pane.redraw()
  expect((await said(pane)).shown.selected).toBe('db')
  expect((await rowsOf(pane)).join('\n')).toContain('╭─ Data ─')
  expect((await said(pane)).heard).toEqual(['collapse grouped data false', 'select grouped db'])
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
    '                               copy · html ↗',
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
  expect(before.at(-1)).toBe('                     2 more →  copy · html ↗')

  await pane.pointer({ type: 'down', x: 23, y: before.length - 1, button: 'left', in: 'graph' })
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
  expect((await rowsOf(pane)).at(-1)).toStartWith('                     2 more →')
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
    'key free t src/price.ts',
  ])
  await pane.unmount()
})

test('f draws the graph in focus on the selected node and its nearest, each saying how many of its edges lead out of focus, and f again draws it all', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'big')
  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'graph' })
  await pane.key({ key: 'f', in: 'graph' })
  await pane.redraw()
  const focused = (await rowsOf(pane)).join('\n')
  expect(focused).toContain('hub  +17')
  expect(focused).toContain('17 nodes and 17 edges left out')
  await pane.key({ key: 'f', in: 'graph' })
  await pane.redraw()
  const whole = (await rowsOf(pane)).join('\n')
  expect(whole).toContain('║ hub ║')
  expect(whole).not.toContain('+17')
  expect(whole).not.toContain('left out')
  await pane.unmount()
})

test('c, or a click on copy in the corner, copies the whole graph as plain text, drawn still with nothing selected, and is not the owner\'s; a key held with ctrl is neither graphlet\'s nor the owner\'s', WITH_HOST, async ($, on) => {
  const seen = world(on)
  const pane = await mount($, 'free', NARROW)
  await click(pane, { x: 0, y: 0 })
  await pane.key({ key: 'c', ctrl: true, in: 'graph' })
  await pane.key({ key: 'c', in: 'graph' })
  const corner = ((await pane.find({ type: 'Client' }))?.props.props as Drawing).hits.find(hit => 'copy' in hit) ?? { x: 0, y: 0 }
  await pane.pointer({ type: 'down', x: corner.x, y: corner.y, button: 'left', in: 'graph' })
  expect(seen.copied).toHaveLength(2)
  expect(seen.copied[1]).toBe(seen.copied[0])
  expect(seen.copied.slice(0, 1)).toEqual([
    [
      '┌───────────────┐  ┌────────────────────┐',
      '│ ○ checkout.ts │  │ ○ pages/invoice.ts │',
      '└─────────┬─────┘  └─────────┬──────────┘',
      '          │                  │',
      '          ▼                  ▼',
      '    ┌───────────┐  ┌──────────────────┐  ┌─────────┐  ┌────────────┐',
      '    │ ● cart.ts │  │ ● src/invoice.ts │  │ ○ ui.ts │  │ ▲ email.ts │',
      '    └─────┬─────┘  └────────────────┬─┘  └────┬────┘  └──────┬─────┘',
      '          └─────────────────────────┼─────────┴──────────────┘',
      '                                    ▼',
      '                             ┌────────────┐',
      '                             │ ◆ price.ts │',
      '                             └──────┬─────┘',
      '                                    │',
      '                                    ▼',
      '                            ┌───────────────┐',
      '                            │ → money.ts  2 │',
      '                            └───────────────┘',
    ].join('\n'),
  ])
  expect(seen.toasts).toEqual(['graphlet: copied the graph as text.', 'graphlet: copied the graph as text.'])
  expect((await said(pane)).heard).toEqual(['select free src/pages/checkout.ts'])
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

test('a mod asks for its graph as plain text, drawn still as a reply draws it, for a tool to hand back or a file', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await mount($, 'free')
  await pane.press({ plugin: 'host', key: 'text' })
  expect((await said(pane)).heard).toEqual([picture(pictureOf(viewOf(LOOK, true, false), SHOP, { columns: 78, rows: 1000 })).join('\n')])
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
  expect((await rowsOf(free)).at(-1)?.trim()).toBe('copy · html ↗')
  await free.unmount()
  await held.unmount()
})

const BAND: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 90, scroll: { offset: 0, bodyRows: 30 }, view: {} }

test('a graph in the band above the prompt is drawn as a pane\'s is, among its owner\'s elements, and a click on a box selects its node; the band yields to a survey', WITH_HOST, async ($, on) => {
  world(on)
  const band = await $.ui.mount({ plugin: 'graphlet', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: BAND })
  expect(await rowsOf(band)).toEqual(picture(view.draw(SHOP, 'src/price.ts', { columns: 90, rows: 30 }, ORIGIN)))
  await click(band, boxOf('src/email.ts'))
  expect(JSON.parse(((await band.find({ type: 'Text', text: /^host / }))?.text ?? 'host {}').slice('host '.length))).toEqual({ heard: ['select band src/email.ts'] })
  await band.redraw({ ...BAND, hasSurvey: true })
  expect(JSON.stringify(await band.drawn())).not.toContain('surface.tsx')
  await band.unmount()
})

test('the band is drawn only on a render where its owner says what it holds: once its owner stops, the band is as the engine draws it', WITH_HOST, async ($, on) => {
  world(on)
  const band = await $.ui.mount({ plugin: 'graphlet', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: BAND })
  const hasGraph = async (): Promise<boolean> => JSON.stringify(await band.drawn()).includes('surface.tsx')
  expect(await hasGraph()).toBe(true)
  await band.press({ plugin: 'host', key: 'hide' })
  await band.redraw()
  expect(await hasGraph()).toBe(false)
  expect(await band.find({ type: 'Text', text: 'the engine drew this' })).toBeDefined()
  await band.unmount()
})

test('the band drawn on two surfaces at once is drawn with the graph on the terminal and as a picture on the desktop app, as each surface\'s render names it', PICTURING, async ($, on) => {
  world(on)
  const desk = await $.ui.mount({ plugin: 'graphlet', surface: 'desktop', component: 'AbovePrompt', requestId: 'band', props: BAND })
  const term = await $.ui.mount({ plugin: 'graphlet', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: BAND })
  await Promise.all([desk.redraw(), term.redraw()])
  expect(JSON.stringify(await term.drawn())).toContain('surface.tsx')
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  await Promise.all([desk.unmount(), term.unmount()])
})

test('a tool\'s row or a command\'s row holds its graph as a pane does, to click, move through, copy, and open as a web page; another row is the engine\'s', WITH_HOST, async ($, on) => {
  const seen = world(on)
  const room = { columns: 78, rows: 1000 }
  const row = (component: 'ToolResult' | 'CommandOutput', requestId: string, props: RenderPropsOf['ToolResult'] | RenderPropsOf['CommandOutput']) =>
    $.ui.mount({ plugin: 'graphlet', surface: 'terminal', component, requestId, props, viewport: { columns: 80, rows: 40 } } as never) as Promise<Pane>
  const tool = await row('ToolResult', 'toolu_1', { tool_use_id: 'toolu_1', tool: 'deps', output: {}, isErrored: false })
  const drawn = view.draw(SHOP, 'src/price.ts', room, ORIGIN)
  expect(await rowsOf(tool)).toEqual(picture(drawn))
  await tool.key({ key: 'c', in: 'graph' })
  expect(seen.toasts).toEqual(['graphlet: copied the graph as text.'])
  const corner = drawn.hits.find(hit => 'page' in hit) ?? { x: 0, y: 0 }
  await tool.pointer({ type: 'down', x: corner.x, y: corner.y, button: 'left', in: 'graph' })
  expect(seen.written.map(file => file.path)).toEqual(['/var/tmp/graphlet-toolu_1.html'])
  await tool.unmount()
  const command = await row('CommandOutput', 'command_1', { command: 'deps', args: '', text: '', isErrored: false })
  expect(await rowsOf(command)).toEqual(picture(drawn))
  await command.unmount()
  const other = await row('ToolResult', 'toolu_2', { tool_use_id: 'toolu_2', tool: 'Bash', output: {}, isErrored: false })
  expect(screenOf(await other.drawn())).toEqual(['the engine drew this'])
  await other.unmount()
})

test('on the main screen, which reports no click, a site\'s graph has no corner', WITH_HOST, async ($, on) => {
  world(on)
  const pane = await $.ui.mount({ plugin: 'graphlet', surface: 'terminal', component: 'Pane', requestId: 'ranked', props: NARROW, viewport: { columns: 80, rows: 40, isFullscreen: false } })
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
    ' ',
  ])
  expect(((await pane.find({ type: 'Client' }))?.props.props as Drawing).hits.filter(hit => 'copy' in hit || 'page' in hit)).toEqual([])
  await pane.unmount()
})

test('a pane graphlet was told nothing of is left as it is', WITH_HOST, async ($, on) => {
  world(on)
  const other = await mount($, 'someone-elses')
  expect(await other.find({ type: 'Text', text: 'the engine drew this' })).toBeDefined()
  expect(await other.find({ type: 'Client' })).toBeUndefined()
  await other.unmount()
})

test('with pictures in apps off, as they are unless the person turns them on, a site\'s graph on every surface but the terminal is plain text, as it runs and with its groups as they are there, with nothing to click', WITH_HOST, async ($, on) => {
  world(on)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const drawn = await $.ui.mount({ plugin: 'graphlet', surface, component: 'Pane', requestId: 'grouped', props: NARROW })
    expect(String((await drawn.find({ type: 'Code' }))?.props.source).split('\n')).toEqual([
      '         ┌─────┐',
      '         │ web │',
      '         └──┬──┘',
      '            │',
      '╭─ Backend ─│─────╮',
      '│           ▼     │',
      '│        ┌─────┐  │',
      '│        │ api │  │',
      '│        └──┬──┘  │',
      '│           │     │',
      '│           ▼     │',
      '│       ┌──────┐  │',
      '│       │ auth │  │',
      '│       └───┬──┘  │',
      '╰───────────│─────╯',
      '            │',
      '            ▼',
      '      ╭───────────╮',
      '      │ ▸ Data  1 │',
      '      ╰───────────╯',
    ])
    expect(await drawn.find({ type: 'Client' })).toBeUndefined()
    expect(await drawn.find({ type: 'Svg' })).toBeUndefined()
    await drawn.unmount()
  }
})

/** The words of each control under a picture, by its key, in order: a Button's label, and a Select's label and options with the picked one marked. */
const controlsOf = async (drawn: Pick<Pane, 'findAll'>): Promise<string[]> => [
  ...(await drawn.findAll({ type: 'Select' })).map(one => {
    const { key, label, value, options = [] } = one.props as { key: string; label: string; value?: string; options?: Array<{ value: string; label: string }> }
    return `${key} ${label}: ${options.map(option => (option.value === value ? `[${option.label}]` : option.label)).join(' | ')}`
  }),
  ...(await drawn.findAll({ type: 'Button' })).map(one => `${String(one.props.key)} ${String(one.props.label)}`),
]

test('with pictures in apps on, on the desktop app, VS Code, and the mobile app, a site\'s graph is a picture in SVG, running as it runs on the terminal, with its groups as they are there and its selected node selected, over controls that pick, open, and fold its nodes, and, except on the mobile app, open it as a web page', PICTURING, async ($, on) => {
  world(on)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const drawn = await $.ui.mount({ plugin: 'graphlet', surface, component: 'Pane', requestId: 'grouped', props: NARROW })
    const svg = await drawn.find({ type: 'Svg' })
    const source = String(svg?.props.source)
    expect(svg?.props).toMatchObject({ isInteractive: true, alt: 'A graph of 4 nodes and 3 edges: web → api; api → auth; auth → Data.' })
    expect(source).toStartWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(svg?.props.width)}" `)
    expect(source).toMatch(/<g class="node plain selected n0"[^>]*>(?:(?!<\/g>).)*>web</)
    expect(source).toContain('>Backend</text>')
    expect(source).toMatch(/<g class="node plain n3"[^>]*>(?:(?!<\/g>).)*>▸<\/tspan><tspan[^>]*>Data<\/tspan><tspan class="badge"[^>]*>1</)
    expect(await controlsOf(drawn)).toEqual(
      surface === 'mobile'
        ? ['graphlet:graph:previous ‹', 'graphlet:graph:next ›', 'graphlet:graph:open Open']
        : ['graphlet:graph:node Node: [web] | api | auth | ▸ Data', 'graphlet:graph:open Open', 'graphlet:graph:page Open in browser'],
    )
    expect(await drawn.find({ type: 'Client' })).toBeUndefined()
    await drawn.unmount()
  }
})

test('under a site\'s picture, a pick from the list selects a node, the group control collapses the selected node\'s group and opens it again, open opens a node, and each is heard by the owner', PICTURING, async ($, on) => {
  const seen = world(on)
  const pane = await $.ui.mount({ plugin: 'graphlet', surface: 'desktop', component: 'Pane', requestId: 'grouped', props: NARROW })
  await pane.select({ key: 'graphlet:graph:node', value: 'auth' })
  expect(await controlsOf(pane)).toEqual(['graphlet:graph:node Node: web | api | [auth] | ▸ Data', 'graphlet:graph:open Open', 'graphlet:graph:group Collapse Backend', 'graphlet:graph:page Open in browser'])
  await pane.press({ key: 'graphlet:graph:group' })
  expect(await controlsOf(pane)).toEqual(['graphlet:graph:node Node: web | [▸ Backend] | ▸ Data', 'graphlet:graph:group Expand Backend', 'graphlet:graph:page Open in browser'])
  await pane.press({ key: 'graphlet:graph:group' })
  await pane.press({ key: 'graphlet:graph:open' })
  await pane.redraw()
  expect((await said(pane)).heard).toEqual(['select grouped auth', 'collapse grouped back true', 'collapse grouped back false', 'select grouped api', 'open grouped api'])
  await pane.press({ key: 'graphlet:graph:page' })
  expect(seen.written.map(file => file.path)).toEqual(['/var/tmp/graphlet-grouped.html'])
  expect(seen.written[0]?.text).toContain('>Backend</text>')
  expect(seen.ran).toEqual([['xdg-open', '/var/tmp/graphlet-grouped.html']])
  await pane.unmount()
})

test('on the mobile app, the controls under a site\'s picture step through its nodes in the order the picture is read, round from the last to the first', PICTURING, async ($, on) => {
  world(on)
  const pane = await $.ui.mount({ plugin: 'graphlet', surface: 'mobile', component: 'Pane', requestId: 'grouped', props: NARROW })
  await pane.press({ key: 'graphlet:graph:previous' })
  await pane.press({ key: 'graphlet:graph:previous' })
  await pane.press({ key: 'graphlet:graph:next' })
  expect((await said(pane)).heard).toEqual(['select grouped data', 'select grouped auth', 'select grouped data'])
  await pane.unmount()
})

test('under the picture of a large graph, a control draws it in focus on the selected node and its nearest, and all of it again', PICTURING, async ($, on) => {
  world(on)
  const pane = await $.ui.mount({ plugin: 'graphlet', surface: 'vscode', component: 'Pane', requestId: 'big', props: PANE })
  const nodes = async (): Promise<number> => String((await pane.find({ type: 'Svg' }))?.props.source).match(/<g class="node /g)?.length ?? 0
  expect(await nodes()).toBe(41)
  await pane.press({ key: 'graphlet:graph:focus' })
  expect(await nodes()).toBe(24)
  expect(await pane.find({ type: 'Text', text: '17 nodes and 17 edges left out' })).toBeDefined()
  expect((await controlsOf(pane)).filter(control => control.startsWith('graphlet:graph:focus'))).toEqual(['graphlet:graph:focus Show all'])
  await pane.press({ key: 'graphlet:graph:focus' })
  expect(await nodes()).toBe(41)
  await pane.unmount()
})

test('a graph too large for a picture a surface takes is plain text there, as it runs and with its groups as they are there', PICTURING, async ($, on) => {
  world(on)
  const pane = await $.ui.mount({ plugin: 'graphlet', surface: 'desktop', component: 'Pane', requestId: 'huge', props: PANE })
  expect(await pane.find({ type: 'Svg' })).toBeUndefined()
  expect(String((await pane.find({ type: 'Code' }))?.props.source)).toContain('node number 0')
  await pane.unmount()
})

test('graphs are drawn as the person\'s settings say', { ...WITH_HOST, options: { scroll: 'sheet', labels: 'clip', edges: 'separate' } }, async ($, on) => {
  world(on)
  const pane = await mount($, 'free', NARROW)
  const sheet = viewOf({ scroll: 'sheet', labels: 'clip', edges: 'separate' })
  const rows = await rowsOf(pane)
  expect(rows).toEqual(picture(sheet.draw(SHOP, 'src/price.ts', { columns: 44, rows: 40 }, sheet.show(SHOP, 'src/price.ts', { columns: 44, rows: 40 }, ORIGIN))))
  expect(rows).not.toEqual(picture(view.draw(SHOP, 'src/price.ts', { columns: 44, rows: 40 }, ORIGIN)))
  await pane.unmount()
})

test('a graph too busy to draw whole in a large pane is drawn plainer, as far as the engine needs, and still drawn', { ...WITH_HOST, options: { edges: 'separate' } }, async ($, on) => {
  world(on)
  const pane = await mount($, 'dense', { ...PANE, bodyColumns: 200, scroll: { offset: 0, bodyRows: 60 } })
  const rows = await rowsOf(pane)
  expect(rows).toHaveLength(60)
  expect(rows.some(row => row.includes('node number 0'))).toBe(true)
  expect(JSON.stringify(await pane.drawn({ in: 'graph' })).length).toBeLessThan(100_000)
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
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
      isDirected: false,
    }
    on('ui.render', { component: 'Pane', requestId: 'ring' }, async ($, e, next) => {
      await $.graphlet.show({ site: 'ring', graph: RING, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
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

/** A surface drawing a block of a reply, in a transcript 80 columns wide, in the fullscreen layout unless it says otherwise. */
const say = <P extends RenderSurface>($: Engine, surface: P, text: string, rest: Partial<RenderPropsOf['AssistantMessage']> = {}, isFullscreen = true) =>
  $.ui.mount({
    plugin: 'graphlet',
    surface,
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true, ...rest },
    viewport: { columns: 80, rows: 40, isFullscreen },
  })

/** What a drawn element says: its own text and its children's. */
const textOf = (node: unknown): string =>
  typeof node === 'string' ? node : ((node as { children?: unknown[] }).children ?? []).map(textOf).join('')

/**
 * A drawn tree as the lines a terminal shows: each Text its lines, a Markdown
 * its text, a Button its label, a Client the rows it was handed, a Box's margins as blank rows above and
 * columns to the left, and a row Box its children on one line, the first and
 * last as far apart as its width holds where it spaces them between.
 */
const screenOf = (node: unknown): string[] => {
  if (typeof node === 'string') return node.split('\n')
  const { type, props = {}, children = [] } = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  if (type === 'Text') return textOf(node).split('\n')
  if (type === 'Markdown') return String(props.text).split('\n')
  if (type === 'Button') return [String(props.label)]
  if (type === 'Client') return picture(props.props as Drawing)
  if (props.flexDirection === 'row') {
    const [first = '', ...after] = children.map(child => screenOf(child)[0] ?? '')
    const rest = after.join('')
    const gap = props.justifyContent === 'space-between' ? Math.max(0, Number(props.width) - first.length - rest.length) : 0
    return [`${first}${' '.repeat(gap)}${rest}`]
  }
  const left = ' '.repeat(Number(props.marginLeft ?? 0))
  const above = Array<string>(Number(props.marginTop ?? 0)).fill('')
  return [...above, ...children.flatMap(screenOf).map(line => (line === '' ? '' : `${left}${line}`))]
}

type Reply = Awaited<ReturnType<typeof say<'terminal'>>>

/** The Clients a reply block is drawn with, in order: the key of each, and the drawing its module was handed. */
const clientsOf = async (reply: Reply): Promise<Array<{ key: string; drawing: Drawing }>> =>
  (await reply.findAll({ type: 'Client' })).map(client => ({ key: String(client.props.key), drawing: client.props.props as Drawing }))

/** Where in a drawing a click does what `is` asks for. */
const hitOf = (drawing: Drawing, is: (hit: Hit) => boolean): Hit => {
  const hit = drawing.hits.find(is)
  if (hit === undefined) throw new Error('no such hit')
  return hit
}

/** A click on a hit of the Client under `key`. */
const press = (reply: Reply, key: string, at: Hit) => reply.pointer({ type: 'down', x: at.x, y: at.y, button: 'left', in: key })

/** What the selected box shows, as the surface module under `key` drew it last: none where nothing is selected. */
const selectedIn = async (reply: Reply, key: string): Promise<string[]> =>
  (await reply.findAll({ in: key, type: 'Text' })).filter(text => text.props.inverse === true).map(text => text.text.trim())

test('a graph block in a reply is drawn in its place, in color, under the engine\'s own drawing of the text before it, with its corner to copy it and open it by', async ($, on) => {
  replies(on)
  const reply = await say($, 'terminal', REPLY)
  expect(screenOf(await reply.drawn())).toEqual([
    '● Here is how a request flows:',
    '',
    ...FLOW.map(line => `  ${line}`),
    `  ${'copy · html ↗'.padStart(37)}`,
    '',
    '  The dashed line is the retry.',
  ])
  const [graph] = await clientsOf(reply)
  expect(graph?.drawing.rows.flat().filter(span => span.text.includes('Ask for a correction')).map(span => span.paint)).toEqual(['warn'])
  expect(await reply.find({ type: 'Markdown' })).toMatchObject({ props: { text: 'The dashed line is the retry.' } })
  await reply.unmount()
})

test('on the main screen, which reports no click, a graph in a reply is drawn still, in color, with no corner', async ($, on) => {
  replies(on)
  const reply = await say($, 'terminal', REPLY, {}, false)
  expect(screenOf(await reply.drawn())).toEqual(['● Here is how a request flows:', '', ...FLOW.map(line => `  ${line}`), '', '  The dashed line is the retry.'])
  expect(await reply.find({ type: 'Client' })).toBeUndefined()
  expect((await reply.findAll({ type: 'Text', text: /Ask for a correction/ })).map(text => text.props.color)).toContain('warning')
  await reply.unmount()
})

test('a graph in a reply runs right where that fits the reply\'s width in half the rows or fewer, as a pipeline does', async ($, on) => {
  replies(on)
  const reply = await say($, 'terminal', 'The pipeline:\n\n```graphlet\nlint -> test -> build -> deploy\n```')
  expect(screenOf(await reply.drawn())).toEqual([
    '● The pipeline:',
    '',
    '  ┌──────┐  ┌──────┐  ┌───────┐  ┌────────┐',
    '  │ lint ├─▶│ test ├─▶│ build ├─▶│ deploy │',
    '  └──────┘  └──────┘  └───────┘  └────────┘',
    `  ${'copy · html ↗'.padStart(41)}`,
  ])
  await reply.unmount()
})

test('in a reply, nothing is selected until a box is clicked; then the arrows move the selection, return opens nothing, and no mod hears any of it, since none owns the graph', WITH_HOST, async ($, on) => {
  world(on)
  replies(on)
  const reply = await say($, 'terminal', REPLY)
  const [{ key = '', drawing = { rows: [], hits: [] } } = {}] = await clientsOf(reply)
  expect(await selectedIn(reply, key)).toEqual([])
  await press(reply, key, hitOf(drawing, hit => 'node' in hit && hit.node === 'Valid?'))
  expect(await selectedIn(reply, key)).toEqual(['Valid?'])
  await reply.key({ key: 'down', in: key })
  await reply.key({ key: 'return', in: key })
  await reply.key({ key: 'x', in: key })
  expect(await selectedIn(reply, key)).toEqual(['Ask for a correction'])
  await reply.unmount()
  const pane = await mount($, 'free')
  expect((await said(pane)).heard).toEqual([])
  await pane.unmount()
})

test('in a reply, space folds a group into one box and opens it again, / finds a node by its label, and c copies the graph as it stands', async ($, on) => {
  const seen = world(on)
  replies(on)
  const block = ['Client -> API', 'Backend:', '  API -> Auth', '  API -> Orders', 'Data:', '  Postgres', 'Orders -> Postgres']
  const reply = await say($, 'terminal', ['The tiers:', '', '```graphlet', ...block, '```'].join('\n'))
  const [{ key = '', drawing = { rows: [], hits: [] } } = {}] = await clientsOf(reply)
  await press(reply, key, hitOf(drawing, hit => 'node' in hit && hit.node === 'Auth'))
  await reply.key({ key: 'space', in: key })
  expect(await selectedIn(reply, key)).toEqual(['▸ Backend'])
  await reply.key({ key: 'c', in: key })
  expect(seen.copied[0]?.split('\n')).toEqual([
    '┌────────┐  ╭──────────────╮ ╭─ Data ────────╮',
    '│ Client ├─▶│ ▸ Backend  3 ├┐│               │',
    '└────────┘  ╰──────────────╯││  ┌──────────┐ │',
    '                            └──▶│ Postgres │ │',
    '                             │  └──────────┘ │',
    '                             │               │',
    '                             ╰───────────────╯',
  ])
  await reply.key({ key: 'space', in: key })
  expect(await selectedIn(reply, key)).toEqual(['API'])
  for (const typed of ['/', 'g', 'r', 'e']) await reply.key({ key: typed, in: key })
  expect(await selectedIn(reply, key)).toEqual(['Postgres'])
  expect(await rowsOf(reply, key)).toEqual([
    '           ╭─ Backend ────────────╮',
    '           │                      │',
    '┌────────┐ │           ┌──────┐   │ ╭─ Data ────────╮',
    '│ Client ├┐│         ┌▶│ Auth │   │ │               │',
    '└────────┘││  ┌─────┐│ └──────┘   │ │  ╔══════════╗ │',
    '          └──▶│ API ├┤            │┌──▶║ Postgres ║ │',
    '           │  └─────┘│ ┌────────┐ │││  ╚══════════╝ │',
    '           │         └▶│ Orders ├──┘│               │',
    '           │           └────────┘ │ ╰───────────────╯',
    '           │                      │',
    '           ╰──────────────────────╯',
    '                         /gre · 1 of 1  copy · html ↗',
  ])
  await reply.unmount()
})

/** Where a text first stands in the rows the Client under `key` drew last: its column and its row. */
const textAt = async (reply: Reply, key: string, text: string): Promise<{ x: number; y: number }> => {
  const rows = await rowsOf(reply, key)
  const y = rows.findIndex(row => row.includes(text))
  return { x: (rows[y] ?? '').indexOf(text), y }
}

/** A click on the count of what is out of view below a reply's graph, which scrolls it a page down. */
const pageDown = async (reply: Reply, key: string): Promise<void> => {
  const rows = await rowsOf(reply, key)
  await reply.pointer({ type: 'down', x: rows.at(-1)?.indexOf('↓') ?? 0, y: rows.length - 1, button: 'left', in: key })
}

/** The fourteen steps of a chain too long for the screen. */
const STEPS = Array.from({ length: 14 }, (_, at) => `step number ${at + 1}`)

test('in the fullscreen layout, a reply\'s graph taller than the screen is seen through a window the screen has room for, which a click on a count moves down it; on the main screen it is drawn whole', async ($, on) => {
  replies(on)
  const text = ['```graphlet', STEPS.join(' -> '), '```'].join('\n')
  const clicked = await say($, 'terminal', text)
  const [{ key = '', drawing = { rows: [], hits: [] } } = {}] = await clientsOf(clicked)
  expect(drawing.rows).toHaveLength(32)
  expect(picture(drawing).join('\n')).not.toContain('step number 14')
  await pageDown(clicked, key)
  await pageDown(clicked, key)
  expect(await rowsOf(clicked, key)).toHaveLength(32)
  expect((await rowsOf(clicked, key)).join('\n')).toContain('step number 14')
  await clicked.unmount()
  const still = await say($, 'terminal', text, {}, false)
  const whole = screenOf(await still.drawn()).join('\n')
  expect(STEPS.filter(step => !whole.includes(step))).toEqual([])
  await still.unmount()
})

test('a group collapsed or opened stays on the rows where it stood in the window: its box where the selected node it holds was, and its frame where its box was', async ($, on) => {
  replies(on)
  const steps = Array.from({ length: 20 }, (_, at) => `step number ${at + 1}`)
  const block = [steps.join(' -> '), 'Middle:', ...steps.slice(5, 9).map(step => `  ${step}`)]
  const reply = await say($, 'terminal', ['```graphlet', ...block, '```'].join('\n'))
  const [{ key = '' } = {}] = await clientsOf(reply)
  await pageDown(reply, key)
  const node = await textAt(reply, key, 'step number 8')
  await reply.pointer({ type: 'down', ...node, button: 'left', in: key })
  await reply.key({ key: 'space', in: key })
  const box = await textAt(reply, key, '▸ Middle')
  expect(box.y).toBe(node.y)
  await reply.key({ key: 'space', in: key })
  expect((await textAt(reply, key, ' Middle ')).y).toBe(box.y - 1)
  await reply.unmount()
})

/** A map of a system too large for the screen: five tiers, the largest of nine services. */
const SERVICES = [
  ...['Web app', 'iOS app', 'Android app', 'Admin console'].map(client => `${client} -> CDN`),
  'CDN -> WAF -> Load balancer -> API gateway',
  ...['Auth', 'Users', 'Orders', 'Payments', 'Inventory', 'Shipping', 'Search', 'Notifications', 'Reports'].map(service => `API gateway -> ${service}`),
  'Auth -> Redis', 'Users -> Postgres', 'Orders -> Postgres', 'Payments -> Postgres', 'Inventory -> Postgres', 'Shipping -> Kafka', 'Search -> Elasticsearch', 'Notifications -> Kafka', 'Reports -> S3',
  'Orders -> Payments', 'Prometheus -> Grafana -> PagerDuty', 'Sentry -> PagerDuty', 'Auth -> Prometheus',
  'Clients:', ...['Web app', 'iOS app', 'Android app', 'Admin console'].map(node => `  ${node}`),
  'Edge:', ...['CDN', 'WAF', 'Load balancer', 'API gateway'].map(node => `  ${node}`),
  'Services:', ...['Auth', 'Users', 'Orders', 'Payments', 'Inventory', 'Shipping', 'Search', 'Notifications', 'Reports'].map(node => `  ${node}`),
  'Data:', ...['Postgres', 'Redis', 'Elasticsearch', 'S3', 'Kafka'].map(node => `  ${node}`),
  'Ops:', ...['Prometheus', 'Grafana', 'Sentry', 'PagerDuty'].map(node => `  ${node}`),
]

test('fit, a reply\'s graph too large for the screen starts with its largest group collapsed, and on the main screen with every group open', async ($, on) => {
  replies(on)
  const text = ['```graphlet', ...SERVICES, '```'].join('\n')
  const clicked = await say($, 'terminal', text)
  const [{ key = '' } = {}] = await clientsOf(clicked)
  expect((await rowsOf(clicked, key)).join('\n')).toContain('▸ Services  9')
  await clicked.unmount()
  const still = await say($, 'terminal', text, {}, false)
  expect(screenOf(await still.drawn()).join('\n')).not.toContain('▸')
  await still.unmount()
})

test('expanded, a reply\'s graph starts with every group open, however large', { options: { groups: 'expanded' } }, async ($, on) => {
  replies(on)
  const clicked = await say($, 'terminal', ['```graphlet', ...SERVICES, '```'].join('\n'))
  const [{ key = '' } = {}] = await clientsOf(clicked)
  expect((await rowsOf(clicked, key)).join('\n')).not.toContain('▸')
  await clicked.unmount()
})

test('in a reply, a graph too large to fold into the reply\'s width is copied whole, as a mod\'s graph is', async ($, on) => {
  const seen = world(on)
  replies(on)
  const label = (layer: number, item: number): string => `layer ${layer} item ${item}`
  const lines = Array.from({ length: 4 * 14 }, (_, at) => `${label(Math.floor(at / 14), at % 14)} -> ${label(Math.floor(at / 14) + 1, at % 14)}`)
  const reply = await say($, 'terminal', ['```graphlet', ...lines, '```'].join('\n'))
  const [graph] = await clientsOf(reply)
  if (graph === undefined) throw new Error('the graph is drawn')
  expect(picture(graph.drawing).at(-1)).toBe('                                                      50 more →  copy · html ↗')
  await press(reply, graph.key, hitOf(graph.drawing, hit => 'copy' in hit))
  expect(seen.copied[0]).not.toMatch(/more/)
  expect(Array.from({ length: 5 * 14 }, (_, at) => label(Math.floor(at / 14), at % 14)).filter(one => !seen.copied[0]?.includes(one))).toEqual([])
  await reply.unmount()
})

test('in a reply, a click on copy in the corner copies the graph as text, as it is drawn there, and one on html ↗ opens it as a web page', async ($, on) => {
  const seen = world(on)
  replies(on)
  const reply = await say($, 'terminal', `${REPLY}\n\n\`\`\`graphlet\nOne -> Two\n\`\`\``)
  const [flow, two] = await clientsOf(reply)
  if (flow === undefined || two === undefined) throw new Error('two graphs are drawn')
  await press(reply, flow.key, hitOf(flow.drawing, hit => 'copy' in hit))
  expect(seen.copied).toEqual([FLOW.join('\n')])
  expect(seen.toasts).toEqual(['graphlet: copied the graph as text.'])
  await press(reply, two.key, hitOf(two.drawing, hit => 'page' in hit))
  expect(seen.written.map(file => file.path)).toEqual([expect.stringMatching(/^\/var\/tmp\/graphlet-reply-[A-Za-z0-9]*-1\.html$/)])
  expect(seen.written[0]?.text).toContain('<title>reply</title>')
  expect(seen.written[0]?.text).toContain('>One</tspan>')
  expect(seen.written[0]?.text).not.toContain('Valid?')
  expect(seen.ran).toEqual([['xdg-open', seen.written[0]?.path]])
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

test('with pictures in apps off, on every surface but the terminal, a graph block becomes its still picture as plain text, fenced as code', async ($, on) => {
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

test('with pictures in apps on, on the desktop app, VS Code, and the mobile app, a graph block is a picture in SVG in its place, with nothing selected, between the engine\'s own drawing of the text before it and the text after, and, except on the mobile app, over a control that opens it as a web page', { options: { pictures: 'on' } }, async ($, on) => {
  const seen = world(on)
  replies(on)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const reply = await say($, surface, REPLY)
    const drawn = (await reply.drawn()) as { type: string; children: Array<{ type: string; props: Record<string, unknown>; children?: Array<{ type: string; props: Record<string, unknown> }> }> }
    expect(drawn.children.map(child => child.type)).toEqual(['Text', 'Box', 'Markdown'])
    expect(textOf(drawn.children[0])).toBe('● Here is how a request flows:')
    expect(drawn.children[2]?.props.text).toBe('The dashed line is the retry.')
    const svg = await reply.find({ type: 'Svg' })
    expect(svg?.props).toMatchObject({ isInteractive: true, alt: 'A graph of 6 nodes and 6 edges: Start → Read the request; Read the request → Valid?; Valid? → Save it; Save it → Done; Valid? → Ask for a correction; Ask for a correction → Read the request.' })
    expect(String(svg?.props.source)).toMatch(/<g class="node warn n\d+"[^>]*>(?:(?!<\/g>).)*>Ask for a correction</)
    expect(String(svg?.props.source)).not.toMatch(/class="(node|edge) [^"]*(selected|near|lit)/)
    expect(await controlsOf(reply)).toEqual(surface === 'mobile' ? [] : ['graphlet:graph:0:page Open in browser'])
    if (surface === 'desktop') await reply.press({ key: 'graphlet:graph:0:page' })
    await reply.unmount()
  }
  expect(seen.written.map(file => file.path)).toEqual([expect.stringMatching(/^\/var\/tmp\/graphlet-reply-[A-Za-z0-9]*-0\.html$/)])
  expect(seen.written[0]?.text).toContain('<title>reply</title>')
  expect(seen.written[0]?.text).toContain('>Ask for a correction</tspan>')
})

test('a graph block too large for a picture a surface takes is its still picture as plain text there, fenced as code', { options: { pictures: 'on' } }, async ($, on) => {
  replies(on)
  const huge = busy(400, 800)
  const labelOf = (id: string): string => huge.nodes.find(node => node.id === id)?.label ?? id
  const lines = huge.edges.map(edge => `${labelOf(edge.from)} -> ${labelOf(edge.to)}`)
  const reply = await say($, 'desktop', ['```graphlet', ...lines, '```'].join('\n'))
  expect(await reply.find({ type: 'Svg' })).toBeUndefined()
  expect(String((await reply.find({ type: 'Markdown' }))?.props.text)).toStartWith('```text\n')
  await reply.unmount()
})

test('a graph in a reply draws its edges merged where it can be clicked, to tell them apart, and keeps them separate where it is still: on the main screen, and as plain text on the other surfaces', async ($, on) => {
  replies(on)
  const block = ['A -> C', 'B -> C', 'B -> D']
  const graph = readGraph(graphLines(block))
  const drawnAs = (edges: 'separate' | 'merged'): string[] => picture(pictureOf(viewOf({ ...LOOK, edges }, true, false), graph, { columns: 78, rows: 1000 }))
  expect(drawnAs('separate')).not.toEqual(drawnAs('merged'))
  const text = ['```graphlet', ...block, '```'].join('\n')
  const clicked = await say($, 'terminal', text)
  expect(graphRows((await clientsOf(clicked))[0]?.drawing ?? { rows: [], hits: [] })).toEqual(drawnAs('merged'))
  await clicked.unmount()
  const still = await say($, 'terminal', text, {}, false)
  expect(screenOf(await still.drawn())).toEqual(['', ...drawnAs('separate').map(line => `  ${line}`)])
  await still.unmount()
  const desktop = await say($, 'desktop', text)
  expect(screenOf(await desktop.drawn())).toEqual(['● ```text', ...drawnAs('separate'), '```'])
  await desktop.unmount()
})

/** Stands in for the engine's own hint line under the prompt: its line, and the tail a hook adds after it. */
const hints = (on: On): void => {
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, `${e.props.hint}${e.props.tail ?? ''}`) as never
  })
}

/** Stands in for the engine beneath a turn's start and end, and for the `/config` rows, with Claude Code's tips as `isTipping` says. */
const turns = (on: On, isTipping: () => boolean): void => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('config.list', () => ({ value: [{ key: 'tips', label: 'Show tips', kind: 'boolean' as const, value: isTipping(), provider: { plugin: 'engine', tier: 'core' as const }, isLocked: false }] }))
}

test('about one reply in five is followed by a tip at the end of the hint line, until the next turn starts, and after a graph, the tips about graphs too; none while a turn runs or a prompt is typed, after a turn with no answer or an agent\'s, or with Claude Code\'s tips off', async ($, on) => {
  let isTipping = true
  hints(on)
  turns(on, () => isTipping)
  replies(on)
  const props = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
  const hint = await $.ui.mount({ plugin: 'graphlet', surface: 'terminal', component: 'PromptHint', props, viewport: { columns: 120, rows: 40, isFullscreen: true } })
  /** The tip the hint line ends with after a turn, ended as `end` says, or '' where it ends with none. */
  const after = async (end: { reason?: 'answer' | 'aborted'; agentId?: string } = {}): Promise<string> => {
    await $.turn.start({ text: 'hi', turnId: 'turn', ...(end.agentId === undefined ? {} : { agentId: end.agentId }) })
    await hint.redraw({ ...props, isWorking: true })
    expect(textOf(await hint.drawn())).toBe('? for shortcuts')
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: end.reason === 'aborted', turnId: 'turn', reason: end.reason ?? 'answer', ...(end.agentId === undefined ? {} : { agentId: end.agentId }) })
    await hint.redraw(props)
    const said = textOf(await hint.drawn()).slice('? for shortcuts'.length)
    if (said === '') return ''
    await hint.redraw({ ...props, isDraft: true })
    expect(textOf(await hint.drawn())).toBe('? for shortcuts')
    await hint.redraw(props)
    expect(said).toStartWith(' · Tip: ')
    return said.slice(' · Tip: '.length)
  }
  const told = async (count: number, end?: { reason?: 'answer' | 'aborted'; agentId?: string }): Promise<string[]> => {
    const tips: string[] = []
    for (let turn = 0; turn < count; turn++) tips.push(await after(end))
    return tips.filter(tip => tip !== '')
  }
  const before = await told(400)
  expect(before.length).toBeGreaterThan(40)
  expect(before.length).toBeLessThan(160)
  expect([...new Set(before)].sort()).toEqual([TIPS[0]?.text, TIPS[1]?.text].sort())

  const reply = await say($, 'terminal', REPLY)
  await reply.unmount()
  const later = await told(400)
  expect(later.filter(tip => !TIPS.some(one => one.text === tip))).toEqual([])
  expect(later.some(tip => tip.startsWith('Graphs can') || tip.startsWith('Click'))).toBe(true)

  expect(await told(100, { reason: 'aborted' })).toEqual([])
  expect(await told(100, { agentId: 'agent' })).toEqual([])
  isTipping = false
  expect(await told(100)).toEqual([])
  await hint.unmount()
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

test('with graphs in replies off, the model is told nothing of graph blocks, and a reply with one is left to the engine as written', { options: { replies: 'off' } }, async ($, on) => {
  const intro = { id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }
  on('prompt.compose', () => ({ sections: [intro] }))
  on('env.get', ($, e) => ({ value: e.name === 'EVAL_GRAPHLET_GUIDE' ? '1' : undefined }))
  replies(on)
  const composed = await $.prompt.compose({ model: 'claude', promptModel: 'claude', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  expect(composed.sections).toEqual([intro])
  for (const surface of ['terminal', 'desktop'] as const) {
    const reply = await say($, surface, REPLY)
    expect(screenOf(await reply.drawn())).toEqual(`● ${REPLY}`.split('\n'))
    await reply.unmount()
  }
})

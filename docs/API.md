# What A Mod Calls

graphlet adds one noun to `$`, `$.graphlet`, in the `engine.create` hook of `graphlet/hooks/register.tsx`. Its types are the mod's contract, `graphlet/types/index.d.ts`. A mod that lists graphlet under `dependencies` in its `plugin.json` has the noun on its own `$`, typed, with nothing to copy.

## A Graph

```ts
type GraphletGraph = { nodes: GraphletNode[]; links: GraphletLink[]; isDirected?: boolean }
type GraphletLink = { from: string; to: string; label?: string; tone?: GraphletTone; isDirected?: boolean }
```

A link names its two nodes by their ids, and the links may run in a loop. A link's `label`, a few words, is written beside it where it leaves the node it is drawn from: its `from` node, or for a link with no direction the one of its two that stands higher. A label longer than a link's labels may be is cut in its middle, in the terminal and on the web page. A link's `tone`, one of a node's tones, paints its line, its arrowhead, and its label where it is not lit: a link that fails in `bad`, the path a mod would show in `note`. A link with no tone, or `plain`, is a dim line, and links of different tones never share a line, as links of different labels never do. Two nodes may be linked more than once under different labels, and each such link is drawn as a line of its own with its label; a link given again under the same label, or with none again, is one link. A link from a node to itself, drawn as `↺`, has no label written. A link runs from one node to the other unless it says `isDirected: false`: then it only joins its two nodes, whichever it names first, and such a link given both ways round is one link. A link that says nothing takes its graph's `isDirected`, and a graph says nothing for a link that runs one way. A graph may have links of both kinds, and a link of each kind between the same two nodes is two links.

| Field of a node | What it holds |
| :- | :- |
| `id` | Unique within the graph. |
| `label` | What the node's box says. |
| `mark` | A sign drawn before the label. Optional. |
| `tone` | How the mark and the label are painted: `plain`, `dim`, `note`, `good`, `warn`, or `bad`. A tone is a meaning, and the person's theme gives each its color. Optional; `plain` when left out. |
| `badge` | A few characters drawn dim after the label: a count, a tag. Optional. |
| `priority` | A whole number for how much the graph is about the node, against its other nodes. Optional; 0 when left out. See below. |
| `layer` | The layer the node stands in. The layers are drawn in the order of their numbers, the lowest at the top, and the numbers need not start anywhere or follow on. Optional: left out on any node of a graph, graphlet works every layer out from the links. |

A node's `priority` matters as it compares with the priorities of the graph's other nodes, and with 0: a graph whose nodes all have one priority, or none, is drawn as one with none. The nodes of the highest priority, where it is above 0 and above another node's, are drawn with heavy frames and bold labels, in the terminal and on the web page. Where graphlet must choose between nodes, the one of higher priority goes first: it is the one a pane selects when nothing else says which, and among nodes that otherwise tie, the one kept in focus and the one named first at a window's edge. And the layout is seated again by the links of the nodes of higher priority first, and that seating is kept only where those links bend less and the drawing's rows and bent links, weighed together, weigh no more, as [LAYOUT.md](LAYOUT.md#shelves) tells. Such a seating may bend other links, or take another row for links it straightens, as any seating may that weighs no more.

## Showing A Graph

A pane belongs to the mod that opened it, and so does its `ui.render` hook. That hook says what the pane holds, and then calls `next(e)`, which resolves to graphlet's drawing, for the mod to place among its own elements:

```tsx
on('ui.render', { component: 'Pane', requestId: 'mine' }, async ($, e, next) => {
  const { Box, Text } = $.ui.resolve(e)
  await $.graphlet.show({ pane: 'mine', graph, columns: e.props.bodyColumns, rows: 20 })
  return (
    <Box flexDirection="column">
      <Text bold>My graph</Text>
      {await next(e)}
    </Box>
  )
})
```

A mod runs before the mods it depends on, so its hook is the outer one and graphlet's is the one `next(e)` reaches. Graphlet's hook draws only the panes `show` has named, on the terminal, and passes every other on.

| Method | What it does |
| :- | :- |
| `measure({ graph, columns })` | Answers the size of the graph's drawing in a room `columns` wide and as tall as it needs: the rows it takes, and the columns its longest layer is laid out across, which are more than `columns` when the graph scrolls sideways. |
| `show({ pane, graph, columns, rows, selected? })` | Says what a pane holds and the room the drawing may take. Answers the rows the drawing takes, and the node drawn as selected. A drawing takes no more rows than it was given, and never fewer than two: a row of the graph, and its foot. |
| `step({ pane, move })` | Answers the node a move from the selected one lands on, for a mod that has keys of its own: `left`, `right`, `up`, or `down`. |
| `scroll({ pane, by })` | Scrolls the graph: by cells, `{ x, y }`, or by turns of the wheel, a number. |
| `select({ pane, node })` | Selects a node. |
| `open({ pane, node })` | Does nothing. |
| `key({ pane, key, selected })` | Does nothing. |

A room has at least one cell each way and at most a thousand, whatever is asked: a count that is no number is taken as one. A room narrower than the narrowest a graph is laid out for, `LEAST_COLUMNS` in `graphlet/hooks/layout.ts`, is drawn as that wide. A scroll by what is no number is ignored.

`show` is called on every render. A drawing is only ever of what `show` was last given, so a mod that keeps its graph and its selection in its own state hands them over each time, and a change of either redraws the pane as any change of its state does.

## The Selection

A pane has one node selected. Either the mod says which, by giving `show` a `selected`, or graphlet keeps it: the node `select` was last called with, or the first the graph names of the nodes of its highest priority.

Graphlet calls `$.graphlet.select` itself when the person clicks the box of a node not selected, or moves with the arrow keys or `h` `j` `k` `l` while the graph has the keyboard. Every method of the noun is also an event, so a mod hears the pick in a hook, where it may act on it and pass it on:

```ts
on('graphlet.select', async ($, e, next) => {
  if (e.pane === 'mine') await remember($, e.node)
  return next(e)
})
```

A mod that says which node is selected hears each pick the same way, and the drawing changes when it next gives `show` the node it was told of.

## Opening A Node

To open a node is to ask for what it stands for: the file, the state, the step. The person opens the selected node with return, or any node with a double click on its box, two clicks there within `DOUBLE_CLICK_MS` of each other in `graphlet/hooks/surface.tsx`; the first of the two selects it, as any click does. Graphlet then calls `$.graphlet.open`, which does nothing: a mod that has something to open hooks `graphlet.open`.

```ts
on('graphlet.open', async ($, e, next) => {
  if (e.pane === 'mine') await goTo($, e.node)
  return next(e)
})
```

## Keys And The Wheel

The graph is drawn by a surface module, the only kind of element that receives arrow keys, and it receives keys only after a click on it. While it has the keyboard, graphlet answers these keys itself:

| Key | What it does |
| :- | :- |
| arrows, `h` `j` `k` `l` | Moves the selection. |
| return | Opens the selected node. |
| `c` | Copies the whole graph as plain text: drawn still, with nothing selected, as a reply draws it, in a room as wide as its longest layer. A toast says whether it was copied. |
| `f` | Draws the graph in focus on the selected node, or draws it all again. |
| `/` | Starts finding a node by its label. While finding, what is typed is what is looked for, the selection goes to the first node found, return goes to the next in place of opening one, and backspace takes back what was typed, or with nothing typed, stops finding. A click on a box stops it too. |

It calls `$.graphlet.key` with every other key, and with no key typed while finding, along with the node selected as it was pressed, `selected`, or null where none is. That method does nothing: a mod with keys of its own hooks `graphlet.key` to answer them.

A drag from where a click does nothing, on no box, name, count or corner, moves the graph with the pointer, as far as its window goes; graphlet answers it itself. The surface posts how far the pointer has gone since the button went down, so a move lost when two fall in one frame is made up by the next. Where the terminal did not report a release, the next press of a button, or a move with no button held, ends the drag where it is.

The terminal reports the mouse only in Claude Code's fullscreen layout. On the main screen, as with `CLAUDE_CODE_NO_FLICKER=0` and in tmux by default, nothing is clicked or dragged.

A turn of the wheel is not a key or a click. It reaches the pane, as `ui.scroll`, and the pane's owner passes it on:

```ts
on('ui.scroll', { component: 'Pane', requestId: 'mine' }, async ($, e, next) => {
  if (e.origin.kind !== 'person') return next(e)
  await $.graphlet.scroll({ pane: 'mine', by: e.by })
  return {}
}).catch(($, e, next) => next(e))
```

A click on one of the counts under a graph larger than its room scrolls it a page that way, and that graphlet answers itself.

## What Graphlet Keeps

For each pane `show` has named, graphlet keeps what it was last given, the node last picked there, and where the person scrolled the window to. A window the person scrolled stays where they left it until another node is selected, and then follows the selection again. It also keeps the layouts it last made, `KEPT_LAYOUTS` of them, each by what its graph holds and how wide its room is, so that a key press, a click, or a render of the same graph in the same room does not lay the graph out again. None of it outlives the session, or a reload of the mod.

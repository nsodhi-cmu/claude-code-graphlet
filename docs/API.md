# What A Mod Calls

graphlet adds one noun to `$`, `$.graphlet`, in the `engine.create` hook of `graphlet/hooks/register.tsx`. Its types are the mod's contract, `graphlet/types/index.d.ts`. A mod that lists graphlet under `dependencies` in its `plugin.json` has the noun on its own `$`, typed, with nothing to copy.

## Depending On It

A mod lists graphlet under `dependencies` in its `.claude-plugin/plugin.json`, and lists graphlet in its own marketplace beside itself, so that installing the mod installs graphlet:

```json
{ "name": "my-mod", "dependencies": ["graphlet"] }
```

```json
{
  "name": "graphlet",
  "source": { "source": "git-subdir", "url": "nsodhi-cmu/claude-code-graphlet", "path": "graphlet" }
}
```

While developing, load both from disk, a `--plugin-dir` each: `claude --plugin-dir ./graphlet --plugin-dir ./my-mod`.

## A Graph

```ts
type GraphletGraph = { nodes: GraphletNode[]; links: GraphletLink[]; groups?: GraphletGroup[]; isDirected?: boolean; direction?: 'down' | 'right' }
type GraphletGroup = { id: string; label?: string; tone?: GraphletTone; isCollapsed?: boolean }
type GraphletLink = { from: string; to: string; label?: string; tone?: GraphletTone; isDirected?: boolean }
```

A link names its two nodes by their ids, and the links may run in a loop. A link's `label`, a few words, is written beside it where it leaves the node it is drawn from: its `from` node, or for a link with no direction the one of its two that stands higher. A label longer than a link's labels may be is cut in its middle, in the terminal and on the web page. A link's `tone`, one of a node's tones, paints its line, its arrowhead, and its label where it is not lit: a link that fails in `bad`, the path a mod would show in `note`. A link with no tone, or `plain`, is a dim line, and links of different tones never share a line, as links of different labels never do. Two nodes may be linked more than once under different labels, and each such link is drawn as a line of its own with its label; a link given again under the same label, or with none again, is one link. A link from a node to itself, drawn as `↺`, has no label written. A link runs from one node to the other unless it says `isDirected: false`: then it only joins its two nodes, whichever it names first, and such a link given both ways round is one link. A link that says nothing takes its graph's `isDirected`, and a graph says nothing for a link that runs one way. A graph may have links of both kinds, and a link of each kind between the same two nodes is two links.

A graph runs the way its `direction` says: `down`, its layers one under another, or `right`, its layers side by side, each a column of boxes. Left out, graphlet runs it down, unless running right fits the room's columns, no layer of it longer than the room, in `FEWER_ROWS` times fewer rows than running down, or fits the room whole where running down does not; `isRighter` in `graphlet/hooks/view.ts` says which. A graph with more layers than the room's columns could hold running right, `LEAST_LAYER_COLUMNS` and `LEAST_CHANNEL_COLUMNS` a layer, is not laid out running right to ask. A graph that names no way may so turn as it grows or its room changes, so a mod whose graph changes as the person looks names one.

| Field of a node | What it holds |
| :- | :- |
| `id` | Unique within the graph. |
| `label` | What the node's box says. |
| `mark` | A sign drawn before the label. Optional. |
| `tone` | How the mark and the label are painted: `plain`, `dim`, `note`, `good`, `warn`, or `bad`. A tone is a meaning, and the person's theme gives each its color. Optional; `plain` when left out. |
| `badge` | A few characters drawn dim after the label: a count, a tag. Optional. |
| `priority` | A whole number for how much the graph is about the node, against its other nodes. Optional; 0 when left out. See below. |
| `group` | The id of the group the node is drawn in. Optional; in none when left out. See below. |
| `layer` | The layer the node stands in. The layers are drawn in the order of their numbers, the lowest first, at the top, or running right at the left, and the numbers need not start anywhere or follow on. Optional: left out on any node of a graph, graphlet works every layer out from the links. |

A node's `priority` matters as it compares with the priorities of the graph's other nodes, and with 0: a graph whose nodes all have one priority, or none, is drawn as one with none. The nodes of the highest priority, where it is above 0 and above another node's, are drawn with heavy frames and bold labels, in the terminal and on the web page. Where graphlet must choose between nodes, the one of higher priority goes first: it is the one a pane selects when nothing else says which, and among nodes that otherwise tie, the one kept in focus and the one named first at a window's edge. And the layout is seated again by the links of the nodes of higher priority first, and that seating is kept only where those links bend less and the drawing's rows and bent links, weighed together, weigh no more, as [LAYOUT.md](LAYOUT.md#shelves) tells. Such a seating may bend other links, or take another row for links it straightens, as any seating may that weighs no more.

A group is a set of nodes drawn together in a frame: a tier of services, a package of files, a phase of states. A node is in the group its `group` names, and the graph's `groups` say what each frame says, its `label`, and how it is painted, its `tone`, dim when left out. A node may name a group the graph does not list; that group is labelled by its id. A group's id is unique among its graph's groups and nodes: a group whose id another group before it or a node has is dropped, and so is a node's group of a node's id, the node then in none. A group holds nodes, not groups. Its nodes stand together in each layer, its frame around all of them across the layers they stand in, and nothing else stands inside it, as [LAYOUT.md](LAYOUT.md#frames) tells.

A group may be collapsed: drawn as one box with round corners, doubled where it is selected and its label bold where it holds a node put foremost, that stands for all it holds, where its first node stood, in its layer where the nodes name theirs, saying its label after `▸` and how many nodes it holds, `▸ Backend  3`, in its tone. A link to or from any of its nodes is a link to or from the box, given once for each label and tone however many of them it joins, and a link between two of them is not drawn. A group is drawn collapsed where its `isCollapsed` says, until the person or the mod opens or collapses it in a pane, as [Groups](#groups) tells; a graph in a reply is drawn with every group open.

## Showing A Graph

graphlet calls the place a graph is drawn its site, and knows it by the id its owner's `ui.render` hook sees as `e.requestId`. A mod may draw a graph in four kinds of site:

| Site | Its `ui.render` component and id | How the graph is drawn |
| :- | :- | :- |
| A pane the mod opened | `Pane`, the id it was opened with | Whole, through a window: it scrolls, takes a selection, the keys, and the mouse. |
| The band above the prompt | `AbovePrompt`, the band's one id | As in a pane, over what the band holds beneath it. |
| The row of a tool's result | `ToolResult`, the call's `tool_use_id` | Still, as a reply's graph is, folded into its room, with `copy · html ↗` under it. |
| The row of a command's output | `CommandOutput`, the row's id | Still, as in a tool's row. |

A site's `ui.render` hook is its owner's: a pane's, the mod that opened it; the band's, every mod that draws there; a tool's row, the mod whose tool it is, which matches on `e.props.tool`; a command's row, the mod whose command it is, on `e.props.command`. That hook says what the site holds, and then calls `next(e)`, which resolves to graphlet's drawing, for the mod to place among its own elements:

```tsx
on('ui.render', { component: 'Pane', requestId: 'mine' }, async ($, e, next) => {
  const { Box, Text } = $.ui.resolve(e)
  const graph = {
    nodes: [
      { id: 'a', label: 'Parse' },
      { id: 'b', label: 'Check', tone: 'warn', mark: '▲' },
      { id: 'c', label: 'Emit' },
    ],
    links: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ],
  }
  await $.graphlet.show({ site: 'mine', graph, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows - 1 })
  return (
    <Box flexDirection="column">
      <Text bold>My graph</Text>
      {await next(e)}
    </Box>
  )
})
```

The drawing is given a row less than the pane's body, for the mod's own title over it. A tool's row is drawn the same way, as tall as the graph needs:

```tsx
on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
  if (e.props.tool !== 'my_tool') return next(e)
  await $.graphlet.show({ site: e.requestId, graph: graphOf(e.props.output), columns: (e.viewport?.columns ?? 80) - 2, rows: 1000 })
  return next(e)
})
```

A mod runs before the mods it depends on, so its hook is the outer one and graphlet's is the one `next(e)` reaches. Graphlet's hook draws a site only on a render where `show` named it, on the terminal, and passes every other on: so a site whose owner stops calling `show` is left as the engine, or another mod, draws it. On every other surface, every site is left as its owner draws it.

| Method | What it does |
| :- | :- |
| `measure({ graph, columns })` | Answers the size of the graph's drawing in a room `columns` wide and as tall as it needs: the rows it takes, and the columns it is laid out across, its longest layer's or the room's running down and all its layers' running right, which are more than `columns` when the graph scrolls sideways. |
| `text({ graph, columns })` | Answers the graph as plain text: its still picture, as a reply draws it, folded into a room `columns` wide, a line a row with no blanks at its end. For what a tool hands back to the model, or a file. |
| `show({ site, graph, columns, rows, selected? })` | Says what a site holds and the room the drawing may take. Answers the rows the drawing takes, and the node drawn as selected. A drawing of a graph with nodes takes at least two rows, a row of the graph and its foot, and no more than it was given where it was given two or more. |
| `step({ site, move })` | Answers the node a move from the selected one lands on, for a mod that has keys of its own: `left`, `right`, `up`, or `down`. |
| `scroll({ site, by })` | Scrolls the graph: by cells, `{ x, y }`, or by turns of the wheel, a number. |
| `select({ site, node })` | Selects a node. |
| `open({ site, node })` | Does nothing. |
| `collapse({ site, group, isCollapsed })` | Collapses a group into one box, or opens it again. |
| `key({ site, key, selected })` | Does nothing. |

A room has at least one cell each way and at most `MOST_CELLS`, in `graphlet/hooks/draw.ts`, whatever is asked: a count that is no number is taken as one. A room narrower than the narrowest a graph is laid out for, `LEAST_COLUMNS` in `graphlet/hooks/layout.ts`, is drawn as that wide. A scroll by what is no number is ignored.

`show` is called on every render of the site, before `next(e)`. A drawing is only ever of what `show` was last given, so a mod that keeps its graph and its selection in its own state hands them over each time, and a change of either redraws the site as any change of its state does. A site holds one graph.

A still site, a tool's row or a command's row, takes no selection, keys, or wheel. A click on `copy` puts the picture on the clipboard as text, and one on `html ↗` opens the graph as a web page, `graphlet-<site>.html`, as under a reply's graph.

## The Selection

A pane has one node selected. Either the mod says which, by giving `show` a `selected`, or graphlet keeps it: the node `select` was last called with, or the first the graph names of the nodes of its highest priority.

Graphlet calls `$.graphlet.select` itself when the person clicks the box of a node not selected, or moves with the arrow keys or `h` `j` `k` `l` while the graph has the keyboard. Every method of the noun is also an event, so a mod hears the pick in a hook, where it may act on it and pass it on:

```ts
on('graphlet.select', async ($, e, next) => {
  if (e.site === 'mine') await remember($, e.node)
  return next(e)
})
```

A mod that says which node is selected hears each pick the same way, and the drawing changes when it next gives `show` the node it was told of.

## Opening A Node

To open a node is to ask for what it stands for: the file, the state, the step. The person opens the selected node with return, or any node with a double click on its box or on its name at the window's edge, two clicks there within `DOUBLE_CLICK_MS` of each other in `graphlet/hooks/surface.tsx`; the first of the two selects it, as any click does. Graphlet then calls `$.graphlet.open`, which does nothing: a mod that has something to open hooks `graphlet.open`.

```ts
on('graphlet.open', async ($, e, next) => {
  if (e.site === 'mine') await goTo($, e.node)
  return next(e)
})
```

## Groups

A pane draws each group collapsed or open as `$.graphlet.collapse` was last called for it there, and else as the group's `isCollapsed` says. Graphlet calls it itself when the person collapses or opens a group, so a mod hears that in a hook on `graphlet.collapse`, as it hears a pick:

- space, with the box of a collapsed group selected, opens the group; with a node of an open group selected, collapses it, and the group's box is then selected;
- return, or a double click, on the box of a collapsed group opens the group, in place of opening a node;
- a click on a frame's label collapses its group;
- finding a node in a collapsed group, with `/`, opens the group.

A node in a collapsed group is drawn as the group's box selected, and `show` answers the group's id as `selected`. A collapsed group's box is selected as a node is, so a click on it, a step onto it, and a key pressed with it selected all name the group's id, and so does `graphlet.select`. Opening a group whose box is selected, by space, return, or a double click, selects the first node it holds with `select`, so a mod that says which node is selected hears which. The web page and `c` take the graph as the pane has it, its groups collapsed or open.

## Keys And The Wheel

The graph is drawn by a surface module, the only kind of element that receives arrow keys, and it receives keys only after a click on it. While it has the keyboard, graphlet answers these keys itself:

| Key | What it does |
| :- | :- |
| arrows, `h` `j` `k` `l` | Moves the selection: along a layer, or along a link to the next, as the graph runs. |
| return | Opens the selected node, or the collapsed group whose box is selected. With nothing selected, it is handed on. |
| space | Collapses the selected node's group, or opens the collapsed group whose box is selected. With a node in no group selected, it is handed on. |
| `c` | Copies the whole graph as plain text: drawn still, with nothing selected, as a reply draws it, running the way it runs in the pane, its groups collapsed or open as they are there, in a room `MOST_CELLS` each way, so that a graph no wider than that is copied whole. A toast says whether it was copied. |
| `f` | Draws the graph in focus on the selected node, or draws it all again. |
| `/` | Starts finding a node by its label. While finding, what is typed is what is looked for, the selection goes to the first node found, return goes to the next in place of opening one, and backspace takes back what was typed, or with nothing typed, stops finding. A click on a box stops it too. |

A key pressed with ctrl or meta held is neither answered nor handed on. It calls `$.graphlet.key` with every other key, and with no key typed while finding, along with the node selected as it was pressed, `selected`, or null where none is. That method does nothing: a mod with keys of its own hooks `graphlet.key` to answer them.

A drag from where a click does nothing, on no box, name, count, frame's label, or corner, moves the graph with the pointer, as far as its window goes; graphlet answers it itself. The surface posts how far the pointer has gone since the button went down, so a move lost when two fall in one frame is made up by the next. Where the terminal did not report a release, the next press of a button, or a move with no button held, ends the drag where it is.

The terminal reports the mouse only in Claude Code's fullscreen layout. On the main screen, as with `CLAUDE_CODE_NO_FLICKER=0` and in tmux by default, nothing is clicked or dragged.

A turn of the wheel is not a key or a click. It reaches the pane, as `ui.scroll`, and the pane's owner passes it on:

```ts
on('ui.scroll', { component: 'Pane', requestId: 'mine' }, async ($, e, next) => {
  if (e.origin.kind !== 'person') return next(e)
  await $.graphlet.scroll({ site: 'mine', by: e.by })
  return {}
}).catch(($, e, next) => next(e))
```

A click on one of the counts under a graph larger than its room scrolls it a page that way, and that graphlet answers itself.

## What Graphlet Keeps

For each site `show` has named, graphlet keeps what it was last given, the node last picked there, where the person scrolled the window to, the groups collapsed or opened there, whether it is drawn in focus, and what is being found. A window the person scrolled stays where they left it until another node is selected, and then follows the selection again. It also keeps the layouts it last made, `KEPT_LAYOUTS` of them, each by what its graph holds, which way it runs, and how wide its room is, and how tall too running right, so that a key press, a click, or a render of the same graph in the same room does not lay the graph out again; and the graphs of the reply blocks it drew last, for the corners under their pictures. None of it outlives the session, or a reload of the mod.

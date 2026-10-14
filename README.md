# graphlet

graphlet is a Claude Code mod that draws graphs, nodes and the links between them, inside Claude Code. It is for other mods to build on. A mod hands it a graph, and graphlet draws the graph in that mod's pane, scrolls it, and says which node the person picked.

```
                            ┌───────┐
                            │ Start │
                            └───┬───┘
                                │
                                ▼
                      ┌──────────────────┐
                      │ Read the request │
                      └─────────┬────────┘
                                │ ▲
                                │ └┈┈┈┈┈┈┈┈┈┈┈┈┐
                                ▼              ┊
                        ╔══════════════╗       ┊
                        ║ Is it valid? ║       ┊
                        ╚═══════╤══════╝       ┊
                   ┌────────────┴────────────┐ ┊
                   ▼                         ▼ ┊
       ┌──────────────────────┐  ┌─────────────┴────────┐
       │ Save to the database │  │ Ask for a correction │
       └─┬─────────┬──────────┘  └──────────────────────┘
         │         └─┐
         ▼           │
┌─────────────────┐  │
│ Notify the team │  │
└────────┬────────┘  │
         ├───────────┘
         ▼
     ┌──────┐
     │ Done │
     └──────┘
                                                          html ↗
```

- **Any directed graph.** The nodes are laid out in layers down the drawing, along the way the links run. A graph with loops is drawn too: the link that closes a loop runs back up, dashed.
- **Every link is drawn**, between neighboring layers, past layers, back up, and between two nodes of one layer. One box's links fan out on a row of their own, apart from another box's.
- **It scrolls.** A graph larger than its room is seen through a window that follows the selection, and that the wheel moves.
- **It answers the mouse and the keyboard.** A click selects a node, the arrow keys move from node to node along the links, and the mod that owns the pane hears each pick.
- **It is a library, and no more.** It adds no command, starts no agent, and calls no model.

## Installing

A mod that depends on graphlet brings it along, so there is usually nothing to install. To install it alone, at the prompt of a session:

```
/plugin install graphlet --marketplace nsodhi-cmu/claude-code-graphlet
```

graphlet is tested on Claude Code 2.1.299. Mods are new and their API still changes between releases, so an older Claude Code may not load it. It draws in the terminal; on the desktop app, the VS Code extension, and the mobile app it draws nothing, and a pane is left as its owner draws it.

## Using It From A Mod

Depend on graphlet in the mod's `.claude-plugin/plugin.json`, and list graphlet in the mod's own marketplace, so that installing the mod installs it:

```json
{ "name": "my-mod", "dependencies": ["graphlet"] }
```

```json
{
  "name": "graphlet",
  "source": { "source": "git-subdir", "url": "nsodhi-cmu/claude-code-graphlet", "path": "graphlet" }
}
```

The mod's `$` then has `$.graphlet`, typed. Its pane's `ui.render` hook says what the pane holds, and `next(e)` hands it the drawing to place among its own elements:

```tsx
on('ui.render', { component: 'Pane', requestId: 'my-pane' }, async ($, e, next) => {
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
  await $.graphlet.show({ pane: 'my-pane', graph, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows - 1 })
  return (
    <Box flexDirection="column">
      <Text bold>My graph</Text>
      {await next(e)}
    </Box>
  )
})

on('graphlet.select', async ($, e, next) => {
  if (e.pane === 'my-pane') $.ui.toast(`picked ${e.node}`)
  return next(e)
})
```

While developing, load both from disk: `claude --plugin-dir ./graphlet --plugin-dir ./my-mod`.

[docs/API.md](docs/API.md) has every method, the selection, the keys, and the wheel.

## Reading A Graph

- A box is a node. Its label is wrapped onto as many lines as it takes, up to a few.
- A link leaves a box where its border has a tick, and reaches a box at an arrowhead.
- A solid line runs with the flow, down the drawing. A dashed line runs against it: the link that closes a loop, on its way back up.
- A line that passes a layer beside its boxes is a link bound for a layer farther on.
- Lines that meet in a tee are joined: they leave the same box, or reach the same box.
- `↺` in a box says the node links to itself.
- The selected node's box has a double frame, and its links and the boxes they reach are lit.

A click on a box selects its node. Once the graph has been clicked it has the keyboard, and the arrow keys, or `h` `j` `k` `l`, move the selection: left and right along a layer, up and down along a link.

### A Graph Larger Than Its Room

The nodes of a layer keep one order, whatever is selected. A layer longer than the room runs off its edge, a box the edge cuts ends in an ellipsis, and the last row counts the nodes out of view on each side. The graph scrolls when the selection moves out of view, and no farther than it takes to show the selected node and the start of the one past it. The wheel scrolls it without moving the selection, and so does a click on one of the counts.

### As A Web Page

A click on `html ↗`, in the corner under a graph, writes the graph out as one web page and opens it in the browser: the same layers, with every link drawn and a node's links lit as the pointer passes over it. The page is a single file with nothing fetched from the network.

## Settings

These are a person's, and hold for every graph any mod draws. They are in `/config`, or `/plugin configure` with graphlet's id, which names the marketplace it was installed from: `graphlet@claude-code-graphlet` when installed alone.

| Setting | What it picks |
| :- | :- |
| **Scrolling** | How a graph wider than its room scrolls. `pinned` slides the long layers and keeps the ones that fit in view. `sheet` lays every layer on one sheet as wide as the longest, each box by the boxes it is linked to, and moves the sheet whole. |
| **Long labels** | What becomes of a label too long for one line of its box. `wrap` breaks it onto more lines. `clip` keeps it to one, cut in the middle. |
| **Links** | How the links between two layers share the rows there. `separate` gives each box's links a row of their own wherever they would run into another's. `merged` runs them all along one row, which is shorter; selecting a node shows which links are its own. |

## How It Works

A graph is read leniently, put in layers, laid out, and painted through a window.

[docs/](docs/) describes each part: what a mod [calls](docs/API.md), the [layers](docs/LAYERS.md), the [layout](docs/LAYOUT.md), the [drawing](docs/DRAWING.md), and the [web page](docs/PAGE.md).

## Developing

```
claude plugin validate --strict ./graphlet    # what the engine would refuse, before a session finds out
claude plugin validate --strict .             # the marketplace manifest
claude plugin test ./graphlet                 # the tests, with no session and no model
```

Each time Claude Code loads the mod from this folder it writes its own API types into `graphlet/.claude-plugin/types/`. `graphlet/tsconfig.json` includes them, so an editor or `tsc -p graphlet` checks the mod against the engine it runs on.

## Security

A mod is code that runs inside Claude Code, unsandboxed, with your permissions. Install one only if you trust its source, and read it first: graphlet's is in `graphlet/hooks/`.

What graphlet does with that access:

- **Draws** in the panes of the mods that ask it to, and nowhere else.
- **Keeps** each such pane's graph, selection, and scroll position in memory, for the session.
- **Writes one file and opens it**, only when you click `html ↗`: the graph as a web page, in your temporary folder, opened with your system's own opener (`xdg-open`, `open`, or `start`).

It reads no file, stores nothing between sessions, calls no model, and makes no network requests.

## Limits

- It draws in the terminal only.
- Layers run top to bottom only.
- Links have a direction. A graph with none is drawn as if each link ran the way it was given.
- A pane holds one graph.
- Links to one box meet at its one arrowhead, and where the links between two layers are too tangled to be kept apart, some share a stretch of line. Selecting a node lights its own.
- A label is drawn one cell a character, so a label written in characters two cells wide pushes its row out of line.

## License

[Apache-2.0](LICENSE)

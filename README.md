# graphlet

graphlet is a Claude Code mod that draws graphs, nodes and the links between them, inside Claude Code. Claude draws them in its replies, and other mods build on it: a mod hands it a graph, and graphlet draws the graph in that mod's pane, scrolls it, and says which node the person picked.

```
                             ┌───────┐
                             │ Start │
                             └───┬───┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │ Read the request │
                       └────────┬─────────┘
                                │ ▲
                                │ └┈┈┈┈┈┈┈┈┈┈┈┐
                                ▼             ┊
                        ╔══════════════╗      ┊
                        ║ Is it valid? ║      ┊
                        ╚═══════╤══════╝      ┊
                   ┌────────────┴───────────┐ ┊
                   ▼                        ▼ ┊
       ┌──────────────────────┐  ┌────────────┴─────────┐
       │ Save to the database │  │ Ask for a correction │
       └─┬───────────┬────────┘  └──────────────────────┘
         │           │
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

- **Any graph, directed or not.** The nodes are laid out in layers down the drawing. A directed graph runs along the way its links run, and the link that closes a loop runs back up, dashed. An undirected graph spreads down from the first node it names, and its links have no arrowheads.
- **Every link is drawn, and can be followed**, between neighboring layers, past layers, back up, and between two nodes of one layer. One box's links fan out on rows of their own, links from different boxes reach a box at arrowheads, or ticks, of their own, and a link that only crosses another passes over it.
- **It scrolls.** A graph larger than its room is seen through a window that follows the selection, and that the wheel moves.
- **It answers the mouse and the keyboard.** A click selects a node, the arrow keys move from node to node along the links, and the mod that owns the pane hears each pick.
- **Claude draws graphs in its replies.** Where graphlet is installed, Claude knows it can answer with a graph, as it knows it can answer with a table, and the graph is drawn in the transcript where Claude wrote it.
- **It is a library for other mods.** It adds no command, registers no tool, starts no agent, and calls no model.

## Installing

A mod that depends on graphlet brings it along. To install it alone, for the graphs in Claude's replies, at the prompt of a session:

```
/plugin install graphlet --marketplace nsodhi-cmu/claude-code-graphlet
```

graphlet is tested on Claude Code 2.1.299. Mods are new and their API still changes between releases, so an older Claude Code may not load it. It draws in the terminal; on the desktop app, the VS Code extension, and the mobile app, a graph in a reply is shown as plain text, and a pane is left as its owner draws it.

## In Claude's Replies

graphlet adds a few lines to the system prompt of every session that draws, saying that a fenced block whose language is `graphlet` is drawn as a graph. Claude writes one where how things connect matters to its answer, a chain of nodes to a line:

````
```graphlet
Start -> Read the request -> Valid?
Valid? -> Save it -> Done
Valid? -> Ask for a correction [warn]
Ask for a correction -> Read the request
```
````

The block is drawn in its place in the reply, with the person's settings, its links always kept separate. A tone in brackets colors its node. The picture fits the reply: a layer too wide for it is folded onto more rows. The picture is still: it does not scroll or take a selection, and a graph that cannot be folded narrow enough counts the nodes past its edge. Where graphlet draws no picture, the block becomes the same picture as plain text. The conversation keeps the block as Claude wrote it.

[docs/REPLIES.md](docs/REPLIES.md) has the block's syntax, what the model is told, and why it is a block and not a tool.

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

A graph is directed. Given `isDirected: false`, it is undirected: a link only joins its two nodes, whichever it names first.

While developing, load both from disk: `claude --plugin-dir ./graphlet --plugin-dir ./my-mod`.

[docs/API.md](docs/API.md) has every method, the selection, the keys, and the wheel.

## Reading A Graph

- A box is a node. Its label is wrapped onto as many lines as it takes, up to a few.
- A link leaves a box where its border has a tick, and reaches a box at an arrowhead. In an undirected graph there are no arrowheads, and a link meets both its boxes at ticks.
- A solid line runs with the flow, down the drawing. A dashed line runs against it: the link that closes a loop, on its way back up. An undirected graph has no flow, and every line in it is solid.
- A line that passes a layer beside its boxes is a link bound for a layer farther on.
- Lines that meet are joined: they leave the same box, or reach the same box. In an undirected graph, a line joins each box whose bottom it meets to each box whose top it meets, and a line that meets the bottoms of two boxes of one layer, and nothing else, joins those two. A link that only crosses another passes over it unbroken.
- `↺` in a box says the node links to itself.
- The selected node's box has a double frame, and its links and the boxes they reach are lit.

A click on a box selects its node. Once the graph has been clicked it has the keyboard, and the arrow keys, or `h` `j` `k` `l`, move the selection: left and right along a layer, up and down along a link.

### A Graph Larger Than Its Room

The nodes of a layer keep one order, whatever is selected. A layer longer than the room runs off its edge, a box the edge cuts ends in an ellipsis, and the last row counts the nodes out of view on each side. The graph scrolls when the selection moves out of view, and no farther than it takes to show the selected node and the start of the one past it. The wheel scrolls it without moving the selection, and so does a click on one of the counts.

### As A Web Page

A click on `html ↗`, in the corner under a graph, writes the graph out as one web page and opens it in the browser: the same layers, with every link drawn and a node's links lit as the pointer passes over it. The page is a single file with nothing fetched from the network.

## Settings

These are a person's, and hold for every graph graphlet draws, in a reply or in any mod's pane. They are in `/config`, or `/plugin configure` with graphlet's id, which names the marketplace it was installed from: `graphlet@claude-code-graphlet` when installed alone.

| Setting | What it picks |
| :- | :- |
| **Scrolling** | How a graph wider than its room scrolls. `pinned` slides the long layers and keeps the ones that fit in view. `sheet` lays every layer on one sheet as wide as the longest, each box by the boxes it is linked to, and moves the sheet whole. |
| **Long labels** | What becomes of a label too long for one line of its box. `wrap` breaks it onto more lines. `clip` keeps it to one, cut in the middle. |
| **Links** | How the links between two layers share the rows there. `separate` gives each box's links rows of their own wherever they would run into another's, and each box an arrowhead, or in an undirected graph a tick, for each set of boxes whose links reach it. `merged` runs them all along one row, into one arrowhead or tick where they reach a box, which is shorter; selecting a node shows which links are its own. A graph in a reply, which nothing selects, keeps its links separate. |

## How It Works

A graph is read leniently, put in layers, laid out, and painted through a window.

[docs/](docs/) describes each part: what a mod [calls](docs/API.md), the [layers](docs/LAYERS.md), the [layout](docs/LAYOUT.md), the [drawing](docs/DRAWING.md), the [web page](docs/PAGE.md), and the [graphs in replies](docs/REPLIES.md).

## Developing

```
claude plugin validate --strict ./graphlet    # what the engine would refuse, before a session finds out
claude plugin validate --strict .             # the marketplace manifest
claude plugin test ./graphlet                 # the tests, with no session and no model
claude plugin eval ./graphlet --no-publish    # how Claude uses graph blocks: runs the model, so it costs
```

Each time Claude Code loads the mod from this folder it writes its own API types into `graphlet/.claude-plugin/types/`. `graphlet/tsconfig.json` includes them, so an editor or `tsc -p graphlet` checks the mod against the engine it runs on.

## Security

A mod is code that runs inside Claude Code, unsandboxed, with your permissions. Install one only if you trust its source, and read it first: graphlet's is in `graphlet/hooks/`.

What graphlet does with that access:

- **Tells Claude** that it can draw graphs, in one section of the system prompt of every session that draws. The section rides on every request.
- **Draws** in Claude's replies where they hold a graph block, in the panes of the mods that ask it to, and nowhere else.
- **Keeps** each such pane's graph, selection, and scroll position in memory, for the session.
- **Writes one file and opens it**, only when you click `html ↗`: the graph as a web page, in your temporary folder, opened with your system's own opener (`xdg-open`, `open`, or `start`).

It reads no file, stores nothing between sessions, calls no model, and makes no network requests.

## Limits

- It draws pictures in the terminal only. Elsewhere a reply's graph is plain text, and a pane's is not drawn.
- A graph in a reply is still. It does not scroll, and has no web page.
- Where an organization manages Claude Code, the engine adds graphlet's section to the system prompt only if the organization lists graphlet in managed settings. Otherwise Claude is not told of graph blocks there, though graphlet still draws one Claude writes.
- Layers run top to bottom only.
- A graph's links are all directed or all undirected. One graph cannot mix the two.
- A graph has at most 500 nodes and 500 links, and a pane holds one. What is past those is left out.
- Where links between two layers must each pass over another and there is no free column to step one aside at, or a window slides two layers so that more of them need stepping aside than the rows between allow, two of them may share a stretch of line. Selecting a node lights its own.
- A character is taken to be as wide as Unicode says a terminal draws it: two cells for the wide characters of East Asian scripts and for emoji, none for a mark on the character before it. A terminal or font that draws a character at another width pushes its row out of line.

## License

[Apache-2.0](LICENSE)

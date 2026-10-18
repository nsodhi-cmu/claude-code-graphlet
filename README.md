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
        └─────┬───────────┬────┘  └──────────────────────┘
              │           │
              ▼           │
     ┌─────────────────┐  │
     │ Notify the team │  │
     └──────────────┬──┘  │
                    ├─────┘
                    ▼
                ┌──────┐
                │ Done │
                └──────┘
                                                          html ↗
```

- **Any graph, directed or not, or both.** The nodes are laid out in layers down the drawing, or across it where that fits better, as a pipeline does. A directed graph runs along the way its links run, and the link that closes a loop runs back up, dashed. An undirected graph spreads down from the first node it names, and its links have no arrowheads. A graph may have links of both kinds, each drawn as what it is.
- **Every link is drawn, and can be followed**, between neighboring layers, past layers, back up, and between two nodes of one layer. One box's links fan out on rows of their own, links from different boxes reach a box at arrowheads, or ticks, of their own, and a link that only crosses another passes over it.
- **Nodes can be grouped.** A mod can put nodes in groups, each drawn in a frame with its name: a tier of services, a package of files, a phase of states. Nothing else stands inside a frame, and a link into a group crosses its border.
- **A link can say what it means.** Its label, `yes` or `retry`, is written beside the line where it leaves its box, and the box makes room for it. A mod can give it a tone, as it gives a node one, to paint a failing dependency red or the path it found blue.
- **It scrolls.** A graph larger than its room is seen through a window that follows the selection, and that the wheel moves.
- **It answers the mouse and the keyboard.** A click selects a node, the arrow keys move from node to node along the links, return or a double click opens one, and the mod that owns the pane hears each pick and each open.
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
Valid? ->|yes| Save it -> Done
Valid? ->|no| Ask for a correction [warn]
Ask for a correction -> Read the request
```
````

With the **Graphs in replies** setting off, graphlet adds nothing to the system prompt and draws no block, for a person who wants it only as a library for the mods that use it.

The block is drawn in its place in the reply, with the person's settings, its links always kept separate. A tone in brackets colors its node, a label in bold, `**Valid?**`, is drawn in a heavy frame where not every label is, and words in pipes after an arrow, `->|yes|`, are written on its link. Where links have no direction, Claude writes them as `--`, drawn with no arrowheads, alone or among arrows. The picture fits the reply: a layer too wide for it is folded onto more rows, and a graph that fits across the reply in half the rows or fewer, as a pipeline does, runs right. The picture is still: it does not scroll or take a selection, and a graph that cannot be folded narrow enough counts the nodes past its edge. Under it, `copy` puts the picture on the clipboard as text, and `html ↗` opens the graph as a web page, where all of it can be seen. Where graphlet draws no picture, the block becomes the same picture as plain text. The conversation keeps the block as Claude wrote it.

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

on('graphlet.open', async ($, e, next) => {
  if (e.pane === 'my-pane') $.ui.toast(`opened ${e.node}`)
  return next(e)
})
```

A link runs from one node to the other. Given `isDirected: false`, it only joins its two nodes, whichever it names first; a graph given `isDirected: false` has every link that does not say so join its nodes that way. A node may say how much the graph is about it with a whole number, its `priority`, 0 when left out: the nodes of the highest, where that is above 0 and above another node's, are drawn in heavy frames; the first node of the highest is selected where neither the mod nor the person has picked one; and the layout keeps the links of nodes of higher priority straighter where that leaves the drawing's rows and bent links weighing no more.

While developing, load both from disk: `claude --plugin-dir ./graphlet --plugin-dir ./my-mod`.

[docs/API.md](docs/API.md) has every method, the selection, the keys, and the wheel.

## Reading A Graph

- A box is a node. Its label is wrapped onto as many lines as it takes, up to a few.
- A link leaves a box where its border has a tick, and reaches a box at an arrowhead. A link with no direction has no arrowhead, and meets both its boxes at ticks.
- A solid line runs with the flow, down the drawing. A dashed line runs against it: the link that closes a loop, on its way back up. An undirected graph has no flow, and every line in it is solid.
- A line that passes a layer beside its boxes is a link bound for a layer farther on.
- Lines that meet are joined: they leave the same box, or reach the same box. In an undirected graph, a line joins each box whose bottom it meets to each box whose top it meets, and a line that meets the bottoms of two boxes of one layer, and nothing else, joins those two. A link that only crosses another passes over it unbroken.
- Words written beside a line, just past the box it leaves, are its label. A label is true of every link of the line it stands beside, since links with different labels never share a line. A line in color is a link in a tone, and the same holds of it.
- `↺` in a box says the node links to itself.
- A frame with round corners, `╭─ Backend ─╮`, holds the nodes of a group, and nothing else. A line that crosses it is a link into the group or out of it.
- A box with a heavy frame, `┏━┓`, is a node the graph is about: one of the nodes its graph gives the highest priority.
- The selected node's box has a double frame, and its links, their labels, and the boxes they reach are lit.
- A graph that runs right reads the same way turned: its layers stand side by side, a solid line runs with the flow across the drawing, a dashed one back, and a link's label is written on its line, just past the box it leaves.

A click on a box selects its node. Once the graph has been clicked it has the keyboard, and the arrow keys, or `h` `j` `k` `l`, move the selection: left and right along a layer, up and down along a link; in a graph that runs right, the other way round. Return, or a double click on a box, opens the node, for the mod that owns the pane to act on: to go to the file it stands for, say. `c` copies the whole graph as plain text, to paste into a pull request or a chat.

A graph too large to take in has two more keys:

- `f` draws it in focus on the selected node: that node and the nodes nearest it, as many as a pane shows whole, each saying how many of its links lead out of focus, `+3`. The focus follows the selection, and `f` again draws the whole graph.
- `/` finds a node by its label as it is typed. The nodes found have their borders lit, the selection goes to the first of them, and return goes to the next; the row under the graph says what is looked for and which of the found is selected, `/pars · 2 of 5`. Backspace takes back what was typed, and with nothing typed stops finding.

### A Graph Larger Than Its Room

The nodes of a layer keep one order, whatever is selected. A layer longer than the room runs off its edge, a box the edge cuts ends in an ellipsis, and the last row counts the nodes out of view on each side. A node joined to the selected one that is out of view is named at the edge it lies past, `cart.ts ▸`, where the edge has room, and a click on its name selects it. The graph scrolls when the selection moves out of view, and no farther than it takes to show the selected node and the start of the one past it. The wheel scrolls it without moving the selection, and so does a click on one of the counts, or a drag from where a click does nothing.

### As A Web Page

A click on `html ↗`, in the corner under a graph, writes the graph out as one web page and opens it in the browser: the same layers, with every link drawn and a node's links lit as the pointer passes over it. The page opens with the whole graph in view; the wheel zooms in around the pointer, and a drag moves it, so a graph too large for any terminal can be explored there. The page is a single file with nothing fetched from the network.

## Settings

These are a person's, and hold for every graph graphlet draws, in a reply or in any mod's pane. They are in `/config`, or `/plugin configure` with graphlet's id, which names the marketplace it was installed from: `graphlet@claude-code-graphlet` when installed alone.

| Setting | What it picks |
| :- | :- |
| **Scrolling** | How a graph wider than its room scrolls. `pinned` keeps the layers that fit in view, and slides the long ones together, on one sheet as wide as the longest. `sheet` lays every layer on one sheet as wide as the longest, each box by the boxes it is linked to, and moves the sheet whole. |
| **Long labels** | What becomes of a label too long for one line of its box. `wrap` breaks it onto more lines. `clip` keeps it to one, cut in the middle. |
| **Links** | How the links between two layers share the rows there. `separate` gives each box's links rows of their own wherever they would run into another's, and each box an arrowhead, or in an undirected graph a tick, for each set of boxes whose links reach it. `merged` runs all those of one kind along one row, into one arrowhead or tick where they reach a box, which is shorter; selecting a node shows which links are its own. Links with a label or a tone keep rows and arrowheads of their own either way. A graph in a reply, which nothing selects, keeps its links separate. |
| **Motion** | Whether the selected node's links move. `still` lights them as lines. `flowing` runs beads along each link that runs one way, a bright cell every few, moving on from the node it leaves to the node it reaches, down the links that run down and back up the ones that close a loop; a link with no direction, and two links that run both ways between two nodes, pulse instead, brightening and fading together. A graph in a reply, which nothing selects, never moves. |
| **Graphs in replies** | Whether Claude draws graphs in its replies. `on` tells Claude it can, in a few lines of the system prompt, and draws each graph block it writes. `off` adds nothing to the system prompt and leaves every reply as Claude wrote it, for graphlet as a library for other mods alone. |

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

- **Tells Claude** that it can draw graphs, in one section of the system prompt of every session that draws, unless **Graphs in replies** is off. The section rides on every request.
- **Draws** in Claude's replies where they hold a graph block, in the panes of the mods that ask it to, and nowhere else.
- **Keeps** each such pane's graph, selection, and scroll position in memory, for the session, and the graphs of the replies it drew last, for the clicks under their pictures.
- **Writes one file and opens it**, only when you click `html ↗`: the graph as a web page, in your temporary folder, opened with your system's own opener (`xdg-open`, `open`, or `start`).
- **Copies a graph to your clipboard**, only when you ask it to, by `c` or a click on `copy`: the graph as plain text.

It reads no file, stores nothing between sessions, calls no model, and makes no network requests.

## Limits

- It draws pictures in the terminal only. Elsewhere a reply's graph is plain text, and a pane's is not drawn.
- A graph in a reply is still. It does not scroll or take a selection; its web page shows all of it.
- Where an organization manages Claude Code, the engine adds graphlet's section to the system prompt only if the organization lists graphlet in managed settings. Otherwise Claude is not told of graph blocks there, though graphlet still draws one Claude writes.
- A graph has at most 1000 nodes and 2000 links, and a pane holds one. What is past those is left out, and the row under the graph says how much.
- Where links between two layers must each pass over another and there is no free column to step one aside at, or a window slides two layers so that more of them need stepping aside than the rows between allow, two of them may share a stretch of line. Selecting a node lights its own.
- A character is taken to be as wide as Unicode says a terminal draws it: two cells for the wide characters of East Asian scripts and for emoji, none for a mark on the character before it. A terminal or font that draws a character at another width pushes its row out of line.

## License

[Apache-2.0](LICENSE)

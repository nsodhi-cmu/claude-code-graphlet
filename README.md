# graphlet

graphlet draws graphs in Claude Code: boxes for the things, and lines for how they connect. Claude draws them in its replies, and other mods draw them in their panes, in the band above the prompt, and under their tools' results.

```
● Here is how the app fits together:

            ┌─────────┐
            │ Browser │
            └───┬─────┘
                │ ▲
                │ └┈┈┈┈┈┈┈┈┈┈┈┈┈┐
   ╭─ Backend ──│────────────╮  ┊
   │            ▼            │  ┊
   │     ┌─────────────┐     │  ┊
   │     │     API     │     │  ┊
   │     └┬──────┬─────┘     │  ┊
   │      │order │login      │  ┊
   │      │      └┐ ┌┈┈┈┈┈┈┈┈┈┈┈┘
   │      ▼       ▼ ┊denied  │
   │ ┌────────┐  ┌──┴──────┐ │
   │ │ Orders │  │  Auth   │ │
   │ └──┬─┬───┘  └────┬────┘ │
   ╰────│─│───────────│──────╯
        │ └─────────┐ │
  ╭─────│ Data ─────│─│─────╮
  │     ▼           ▼ ▼     │
  │ ┌───────┐  ┌──────────┐ │
  │ │ Redis │  │ Postgres │ │
  │ └───────┘  └──────────┘ │
  ╰─────────────────────────╯
                    copy · html ↗
```

## In Claude's Replies

Ask Claude for a graph, or for something a graph answers, like how a request moves through your app or how your services depend on each other, and it draws one in its reply. graphlet tells Claude, in a few lines of the system prompt, that it can answer with a graph the way it answers with a table. Claude writes the graph as a short block of arrows, one chain of nodes to a line, and graphlet draws the block where Claude wrote it. The picture above is this block:

````
```graphlet
Browser -> API
Backend:
  API ->|login| Auth
  API ->|order| Orders
Data:
  Postgres
  Redis
Orders -> Postgres
Orders -> Redis
Auth -> Postgres
Auth ->|denied| Browser
```
````

In Claude Code's fullscreen layout you can click the graph and move through it, as in a mod's pane. The conversation keeps the block as Claude wrote it, so an export or `/copy` has the arrows. [docs/REPLIES.md](docs/REPLIES.md) has the whole syntax of a block.

## In Other Mods

A mod can depend on graphlet to draw graphs in its own panes, in the band above the prompt, and in the rows of its tools' results and its commands' output, where the person can click and move through them, and the mod hears what they picked. It can also ask for a graph as plain text, for a tool to hand back to Claude. The mod lists graphlet in its `.claude-plugin/plugin.json`:

```json
{ "name": "my-mod", "dependencies": ["graphlet"] }
```

Its `$` then has `$.graphlet`, typed. Its pane's render hook says what the pane holds, and `next(e)` is graphlet's drawing of it:

```tsx
on('ui.render', { component: 'Pane', requestId: 'my-pane' }, async ($, e, next) => {
  const graph = {
    nodes: [{ id: 'a', label: 'Parse' }, { id: 'b', label: 'Check' }, { id: 'c', label: 'Emit' }],
    links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
  }
  await $.graphlet.show({ site: 'my-pane', graph, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
  return next(e)
})

on('graphlet.select', async ($, e, next) => {
  if (e.site === 'my-pane') $.ui.toast(`picked ${e.node}`)
  return next(e)
})
```

[docs/API.md](docs/API.md) has the whole API: every method, the graph's fields, the selection, the keys, and how to ship a mod that depends on graphlet.

## Features

- **Links with a direction, or without.** A link can run one way, to an arrowhead, or just join two nodes, and one graph can have both.
- **Labels.** A link can say what it means, like `yes` or `retry`, in a few words beside its line.
- **Tones.** A node can be colored by what it means, `good`, `warn`, `bad`, `note`, or `dim`, and a mod can color a link the same way.
- **Emphasis.** The nodes a graph is most about can be drawn in heavy frames.
- **Groups.** Nodes can be grouped, each group in a frame with its name, and a group can be collapsed into one box and opened again.
- **Down or right.** A graph runs down the screen, or left to right where that fits better, as a pipeline does.
- **Fitting its room.** A graph too wide for a reply is folded onto more rows where it can be, and one too large for its room scrolls, following the selection.
- **Selecting.** A click selects a node and lights its links, and the arrow keys move along them. Where a mod draws the graph, return or a double click opens the node for the mod to act on.
- **Finding and focusing.** `/` finds a node by its label as you type, and in a large graph, `f` shows only the selected node and the nodes nearest it.
- **Copy.** `copy`, under a graph, or `c`, puts the graph on your clipboard as text, to paste into a pull request or a chat.
- **The web page.** `html ↗`, under a graph, opens it as a web page in your browser, where you can zoom and pan around all of it.

## Installing

At the prompt of a Claude Code session:

```
/plugin install graphlet --marketplace nsodhi-cmu/claude-code-graphlet
```

A mod that depends on graphlet brings it along. graphlet is tested on Claude Code 2.1.302. Mods are new and their API still changes between releases, so an older Claude Code may not load it.

## Settings

These hold for every graph graphlet draws, in a reply or for any mod. They are in `/config`, or `/plugin configure graphlet@claude-code-graphlet` when graphlet was installed alone. The first choice of each is the default.

| Setting | What it picks |
| :- | :- |
| **Scrolling** | `pinned` keeps the layers that fit in view while the longer ones slide; `sheet` moves the whole graph as one sheet. |
| **Long labels** | `wrap` breaks a long label onto more lines; `clip` keeps it to one, cut in the middle. |
| **Links** | `separate` keeps each node's links on lines of their own; `merged` lets links share lines, which is shorter. |
| **Motion** | `still` lights the selected node's links; `flowing` also sets them moving: beads run the way each link runs, and a link that runs no one way pulses. |
| **Graphs in replies** | `on` lets Claude draw graphs in its replies; `off` leaves graphlet to the mods that use it. |

## Security

A mod is code that runs inside Claude Code, unsandboxed, with your permissions. Install one only if you trust its source, and read it first: graphlet's is in `graphlet/hooks/`.

What graphlet does with that access:

- **Tells Claude** that it can draw graphs, in one section of the system prompt of every session that draws, unless **Graphs in replies** is off. The section rides on every request.
- **Draws** in Claude's replies where they hold a graph block, where the mods that use it ask it to, and nowhere else.
- **Keeps** each graph's selection and scroll position in memory for the session: those of the mods' graphs it drew last, and of the graphs in the replies it drew last.
- **Writes one file and opens it**, only when you click `html ↗`: the graph as a web page, in your temporary folder, opened with your system's own opener (`xdg-open`, `open`, or `start`).
- **Copies a graph to your clipboard**, only when you click `copy` or press `c`.

It reads no file, stores nothing between sessions, calls no model, and makes no network requests.

## Limits

- It draws pictures in the terminal only. On the desktop app, the VS Code extension, and the mobile app, a graph is shown as plain text.
- The mouse reaches a graph only in Claude Code's fullscreen layout. On the main screen, a graph in a reply is a still picture.
- A graph takes keys only once it has been clicked, and keeps them until Escape gives them back to the prompt. A drag on a graph moves it rather than selecting its text: `copy` takes it as text.
- Where an organization manages Claude Code, Claude is told of graph blocks only if the organization lists graphlet in managed settings. graphlet still draws a block Claude writes.
- A graph is read up to 1000 nodes and 2000 links. What is past those is left out, and the row under the graph says how much.
- Where links are too tangled to keep apart, two of them may share a stretch of line. Selecting a node lights its own.
- A character is taken to be as wide as Unicode says a terminal draws it. A terminal or font that draws it wider or narrower pushes its row out of line.

## Documentation

[docs/](docs/) is for anyone who wants to dig deeper: what a mod [calls](docs/API.md), how a graph is put in [layers](docs/LAYERS.md) and [laid out](docs/LAYOUT.md), how it is [drawn](docs/DRAWING.md), the [web page](docs/PAGE.md), the [graphs in replies](docs/REPLIES.md), and how to [contribute](docs/CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)

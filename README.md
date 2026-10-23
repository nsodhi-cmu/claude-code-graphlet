# graphlet

graphlet is a **mod** that draws graphs inside Claude Code!

```
> "Hey Claude, can you sketch my system's architecture?"

                        ┌─────────┐         ╭─ Services ──╮ ╭─ Storage ─────╮
  ┌─────────┐  ┌─────┐  │         ├login───┐│             │ │               │
  │ Browser ├─▶│ CDN ├─▶│ Gateway │        ││  ┌──────┐   │ │  ┌──────────┐ │
  └─────────┘  └─────┘  │         ├orders─┐└──▶│ Auth ├───────▶│          │ │
                        └─────────┘       │ │  └──────┘   │ │  │ Database │ │
                                          │ │             │┌──▶│          │ │
                                          │ │  ┌────────┐ │││  └──────────┘ │
                                          └───▶│ Orders ├──┤│               │
                                            │  └────────┘ │││  ┌───────┐    │
                                            │             │└──▶│ Cache │    │
                                            ╰─────────────╯ │  └───────┘    │
                                                            │               │
                                                            ╰───────────────╯
                                                                copy · html ↗
```

## Install

At the prompt of a Claude Code session:

```
/plugin install graphlet --marketplace nsodhi-cmu/claude-code-graphlet
```

If another mod uses graphlet as a dependency, that mod will automatically install graphlet; you don't need to manually run the above command.

Claude Code mods were introduced in Claude Code 2.1.287.

## 1. In Claude's Replies

Having graphlet installed means Claude unlocks the ability to respond with graphs! Either ask Claude directly for a graph, or sometimes Claude will create a graph when it deems it appropriate to do so.

graphlet modifies the system prompt and teaches Claude a new syntax, which graphlet can then render into a visual graph. The example graph above is written as:

````
```graphlet
Browser -> CDN -> Gateway
Gateway ->|login| Auth
Gateway ->|orders| Orders
Auth -> Database
Orders -> Database
Orders -> Cache
Services:
  Auth
  Orders
Storage:
  Database
  Cache
```
````

On the desktop app, VS Code extension, or mobile app, rendering a text graph doesn't make much sense as none of them are terminal interfaces. Therefore, there is a setting that renders graphs on those platforms as images. However, that feature is currently **experimental**.

[docs/REPLIES.md](docs/REPLIES.md) has the full graphlet syntax.

## 2. In Other Mods

If you are creating your own mod and would like to draw graphs, you can also use graphlet to render those graphs.

It should list graphlet in its `.claude-plugin/plugin.json`:

```json
{ "name": "my-mod", "dependencies": ["graphlet"] }
```

Its render hook then hands graphlet the graph, and `next(e)` is the drawing:

```tsx
on('ui.render', { component: 'Pane', requestId: 'my-pane' }, async ($, e, next) => {
  const graph = {
    nodes: [{ id: 'a', label: 'Parse' }, { id: 'b', label: 'Check' }, { id: 'c', label: 'Emit' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
  }
  await $.graphlet.show({ site: 'my-pane', graph, columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows })
  return next(e)
})

on('graphlet.select', async ($, e, next) => {
  if (e.site === 'my-pane') $.ui.toast(`picked ${e.node}`)
  return next(e)
})
```

[docs/API.md](docs/API.md) has the whole API, and how to ship a mod that uses graphlet.

## Graph Features

- **Directed and undirected edges**, in one graph if you like.
- **Labels** on edges, like `yes` or `retry`.
- **Tones**: color a node `good`, `warn`, `bad`, `note`, or `dim`; a mod can color edges too.
- **Emphasis**: heavy frames for the nodes that matter most.
- **Groups**, framed and named, that collapse into one box and open again.
- **Down or right**, whichever fits better.
- **Fitting its room**: a graph folds to a reply's width, and scrolls, following the selection, when it is too large.
- **Selecting**: click a node to light its edges, and move along them with the arrow keys. In a mod's graph, return or a double click opens a node.
- **Finding and focusing**: `/` finds a node as you type, and in a large graph, `f` shows just the selected node and its nearest.
- **Copy**: `copy`, or `c`, puts the graph on your clipboard as text.
- **The web page**: `html ↗`, or `Open in browser` under a picture, opens the graph in your browser, to zoom and pan.
- **Pictures beyond the terminal**, an experimental feature to draw images on the desktop app, VS Code extension, and the mobile app.

## Settings

In `/config`, or `/plugin configure graphlet@claude-code-graphlet`. The first choice of each is the default.

| Setting | What it picks |
| :- | :- |
| **Scrolling** | `pinned` keeps the layers that fit in view while longer ones slide; `sheet` moves the whole graph. |
| **Long labels** | `wrap` breaks a long label onto more lines; `clip` cuts it to one. |
| **Edges** | `merged` lets a node's edges share lines, which is shorter; `separate` gives each node's edges lines of their own. |
| **Graphs in replies** | `on` lets Claude draw graphs in its normal replies; `off` keeps graphlet out of Claude's replies and the system prompt, leaving it only for mods that use it. |
| **Pictures in apps (experimental)** | `off` draws a graph on the desktop app, VS Code extension, and the mobile app as text in a code block; `on` draws it as a picture, with controls under a mod's graph. |

## Limits

- The pictures drawn on the desktop app, VS Code extension, and the mobile app still have some visual bugs, which is why this feature is experimental.
- The mouse reaches a graph only in Claude Code's fullscreen layout. On the main screen, a reply's graph is a still picture.
- The wheel scrolls the transcript, not a graph: drag a graph taller than the screen, or move through it with the arrow keys.
- A clicked graph keeps the keys until Escape. A drag moves it rather than selecting its text, so use `copy`.
- Where an organization manages Claude Code, Claude is told it can draw graphs only if graphlet is listed in managed settings.
- A graph is read up to 1000 nodes and 2000 edges, and the row under it says what was left out.
- Where edges are too tangled to keep apart, two may share a stretch of line.
- A character is taken to be as wide as Unicode says. A font that draws it wider or narrower pushes its row out of line.

## Security and Privacy

graphlet makes no network requests, calls no model, and keeps nothing between sessions. The only file it writes is the web page `html ↗` and `Open in browser` open, in your temporary folder.

# graphlet

graphlet draws graphs in Claude Code: in Claude's replies, and in other mods.

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

A mod that depends on graphlet installs it too. Claude Code mods were introduced in Claude Code 2.1.287.

## In Claude's Replies

Ask Claude for a graph, or for something a graph answers, and it draws one in its reply: graphlet tells Claude it can, and draws the short block of arrows Claude writes. The graph above is this block:

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

In Claude Code's fullscreen layout, click a graph to move through it. [docs/REPLIES.md](docs/REPLIES.md) has the block's whole syntax.

## In Other Mods

A mod can use graphlet to draw graphs in its panes, in the band above the prompt, and in its tools' and commands' rows, and hear what the person clicks; or get a graph as plain text, for a tool to hand back to Claude. It lists graphlet in its `.claude-plugin/plugin.json`:

```json
{ "name": "my-mod", "dependencies": ["graphlet"] }
```

Its render hook then hands graphlet the graph, and `next(e)` is the drawing:

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

[docs/API.md](docs/API.md) has the whole API, and how to ship a mod that uses graphlet.

## Features

- **Directed and undirected links**, in one graph if you like.
- **Labels** on links, like `yes` or `retry`.
- **Tones**: color a node `good`, `warn`, `bad`, `note`, or `dim`; a mod can color links too.
- **Emphasis**: heavy frames for the nodes that matter most.
- **Groups**, framed and named, that collapse into one box and open again.
- **Down or right**, whichever fits better.
- **Fitting its room**: a graph folds to a reply's width, and scrolls, following the selection, when it is too large.
- **Selecting**: click a node to light its links, and move along them with the arrow keys. In a mod's graph, return or a double click opens a node.
- **Finding and focusing**: `/` finds a node as you type, and in a large graph, `f` shows just the selected node and its nearest.
- **Copy**: `copy`, or `c`, puts the graph on your clipboard as text.
- **The web page**: `html ↗` opens the graph in your browser, to zoom and pan.

## Settings

In `/config`, or `/plugin configure graphlet@claude-code-graphlet`. The first choice of each is the default.

| Setting | What it picks |
| :- | :- |
| **Scrolling** | `pinned` keeps the layers that fit in view while longer ones slide; `sheet` moves the whole graph. |
| **Long labels** | `wrap` breaks a long label onto more lines; `clip` cuts it to one. |
| **Links** | `separate` gives each node's links lines of their own; `merged` lets them share, which is shorter. |
| **Motion** | `still` lights the selected node's links; `flowing` also sets them moving. |
| **Graphs in replies** | `on` lets Claude draw graphs in its replies, with a few lines in its system prompt; `off` leaves graphlet to the mods that use it. |

## Limits

- The desktop and mobile apps show a graph as a still picture in text. The VS Code extension doesn't draw mods yet; run `claude` in its terminal instead.
- The mouse reaches a graph only in Claude Code's fullscreen layout. On the main screen, a reply's graph is a still picture.
- A clicked graph keeps the keys until Escape. A drag moves it rather than selecting its text, so use `copy`.
- Where an organization manages Claude Code, Claude is told it can draw graphs only if graphlet is listed in managed settings.
- A graph is read up to 1000 nodes and 2000 links, and the row under it says what was left out.
- Where links are too tangled to keep apart, two may share a stretch of line.
- A character is taken to be as wide as Unicode says. A font that draws it wider or narrower pushes its row out of line.

## Security and Privacy

graphlet makes no network requests, calls no model, and keeps nothing between sessions. The only file it writes is the web page `html ↗` opens, in your temporary folder.

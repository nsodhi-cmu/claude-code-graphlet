# Graphs In Replies

Claude, the model in a session where graphlet is installed, draws a graph in a reply by writing it as a fenced block whose language is `graphlet`. graphlet tells the model the block exists, and draws each such block in the transcript in its place. Reading a reply's blocks and making their pictures is `graphlet/hooks/reply.ts`; the two hooks that tell the model and draw the blocks are in `graphlet/hooks/register.tsx`.

## What The Model Is Told

A `prompt.compose` hook adds one section to the end of the system prompt, `graphlet:graphs`, on the session's side of the cache boundary. Its text is `GUIDE` in `reply.ts`: what a block looks like, with an example, and when to write one and when not to. The example is itself a block that graphlet draws.

The section is added wherever the session draws, that is, wherever `e.surfaces` names a surface, unless the person's `replies` setting is `off`: then no section is added anywhere, and the hook that draws a reply passes every block on as it is, so graphlet is only a library for the mods that use it. A run that draws nowhere, such as `claude -p`, gets no section, since a block there would reach the person as written, unless the environment variable `EVAL_GRAPHLET_GUIDE` is `1`, as the evals set it, so that what the model writes with the guide can be measured.

Where an organization manages Claude Code, the engine runs `prompt.compose` hooks only for the plugins the organization lists in managed settings. Unless graphlet is listed, the model there is not told, and graphlet still draws any block the model writes.

## A Graph Block

````
```graphlet
Start -> Read the request -> Valid?
Valid? ->|yes| Save it -> Done
Valid? ->|no| Ask for a correction [warn]
Ask for a correction -> Read the request
```
````

`partsOf` cuts a reply at its graph blocks, and `graphOf` reads each block's lines.

- A graph block is a fenced block, of backticks or of tildes, whose language, the first word after the fence, is `graphlet` in any case. It is drawn once it is closed and names at least one node. One that names none is left as written.
- Each line is a chain of labels joined by arrows or dashes, each an edge between the label before it and the label after. A line with neither names one node.
  - An arrow, `->`, `-->`, or `→`, is an edge the way it points, and so is one pointing back, `<-`, `<--`, or `←`.
  - Two dashes or more, with a blank before them and a blank or a pipe after, ` -- `, are an edge with no direction, drawn with no arrowhead, in a block with arrows or without. A block whose edges are all dashes is an undirected graph.
  - An arrow with a head at each end, `<->` or `↔`, is an edge each way.
  - Dashes within a label stay part of it, as in `git push --force` or `e-mail`, and so does a dash written in prose, `—`.
  - Words in pipes right after an arrow or dashes, as in `Valid? ->|no| Ask again`, are the edge's label, written on it, as long as no arrow stands among them; and so are words between dashes and an arrow, `A -- on error --> B`, as Mermaid writes them. An edge each way that a two-headed arrow makes carries the label both ways. The same two nodes joined again under another label are joined twice, each edge drawn with its own label, and an edge written again under the same label is one edge. Pipes left at a label's ends are not part of it.
- A node is known by its label, so the same label on any line is the same node. The blanks around a label are dropped, and a run of blanks inside one is read as one space.
- A tone in brackets at the end of a label is its node's: `[plain]`, `[dim]`, `[note]`, `[good]`, `[warn]`, or `[bad]`, in any case. The first tone given for a node holds. Brackets that name no tone are part of the label.
- A label in bold, as Markdown writes it, `**Valid?**`, gives its node a priority of 1, so that a graph with a bold label and a label not bold draws the bold one heavy, as [DRAWING.md](DRAWING.md#reading-the-picture) tells. Its asterisks are not part of the label, so the same label bold and not is the same node, and its tone may stand inside the bold or after it. A label with an asterisk between the two pairs is not bold.
- A label left blank, by an arrow at the start or the end of a line or a tone written alone, is passed over.
- A line that is a name and a colon alone, `Backend:`, with the next line indented under it, opens a group named so, and the lines indented under it are in it, up to a line indented no more than it; with nothing indented under it, it names a node, colon and all, as any line with no edge does. A node is in the first group it is named under, wherever else it is named, so edges between groups may be written on lines of their own. A group's id is its name after `group:`, so that no node's label is one. A line with no edge on it that opens a group as Mermaid writes it, `subgraph Backend`, `subgraph "Back end"`, or `subgraph api["API tier"]`, opens a group too, named by what it shows, for the lines up to a line `end`. A group in a group is not drawn inside it: a node is in the innermost group it is named under. Blank lines are passed over.

```graphlet
Client -> API
Backend:
  API -> Auth
  API -> Orders
Data:
  Postgres
Orders -> Postgres
```

The graph is then read as any other, by [`readGraph`](LAYERS.md), so the same limits hold, and its layers are worked out from its edges.

A fenced block in another language stays in the reply whole, with all it holds, a `graphlet` block inside it included. A block whose fence is not yet closed, as while the reply streams in, runs to the end of the reply, and is left as written until it closes.

Nothing a reply says is changed where it is kept. The stored message, what the model reads back on later turns, and what an export or `/copy` takes, all hold the block as the model wrote it.

## On The Terminal

A `ui.render` hook on `AssistantMessage` sees each block of a reply's text. One that holds no graph block, and a summary of the model's text (`isSummary`), it passes on as they are. For one that does hold a graph block, the hook's answer is the whole of the block's drawing, the bullet that opens the reply and the room above it included. It answers with a column:

- The text before the first graph, drawn by the engine itself: `next(e)` with the block's `text` cut to that run, so the run keeps the bullet and the spacing a reply has.
- Then each graph and each later run of text, indented by the width of the bullet, `BULLET_COLUMNS`, and a blank row apart. In Claude Code's fullscreen layout, the only one where the terminal reports the mouse, a graph is a `Client`, the surface module a mod's site draws its graph with, keyed `graph:` and its place among the block's graphs: its rows of painted text, and under them its foot, a row as wide as the picture, with the counts of what is out of view, where there are any, and at the right edge the corner, `copy · html ↗`. On the main screen, where nothing can be clicked, a graph is its still picture instead, each row a `Text`, with no corner. A run of text is a `Markdown`, which the terminal draws as it draws a reply.

A reply that opens with a graph has no text before it for the engine to draw, and so no bullet. The guide asks the model to introduce a graph with a sentence.

```
● Here is how a request flows:

                    ┌───────┐
                    │ Start │
                    └───┬───┘
                        │
                        ▼
              ┌──────────────────┐
              │ Read the request │
              └──────┬───────────┘
                     │   ▲
                     │   └┈┈┐
                     ▼      ┊
                ┌────────┐  ┊
                │ Valid? │  ┊
                └┬────┬──┘  ┊
                 │yes │no   ┊
       ┌─────────┘    └───┐ ┊
       ▼                  ▼ ┊
  ┌─────────┐  ┌────────────┴─────────┐
  │ Save it │  │ Ask for a correction │
  └────┬────┘  └──────────────────────┘
       │
       ▼
   ┌──────┐
   │ Done │
   └──────┘
                          copy · html ↗

  The dashed line is the retry.
```

### The Picture

A graph in a reply is drawn as a mod's site draws one, with the person's settings, but for four things. Its layers are folded into the reply's width, and it is no taller than the screen has room for. It opens with nothing selected, so that a reply reads as written until the person clicks. Its groups start as the person's `groups` setting says, since a block has no way to say one is collapsed. And no mod owns it, so what a mod's site tells its owner goes nowhere.

- **Its way.** It runs right or down as [API.md](API.md#a-graph) tells of a graph that names no way, with running down folded as far as it goes; the block has no way to say.
- **Its width.** The room is the reply's width: the columns the surface measured, less the bullet's, or `REPLY_COLUMNS` less the bullet's where it measured none. A layer too wide for it is folded onto more layers, as [LAYERS.md](LAYERS.md#folding-into-a-room) tells, so the graph fits the reply where it can and is not cut off at its edge. `alignedLeft` in `reply.ts` cuts away the columns blank down the whole of its left side, so a small graph stands at the reply's left edge, as the text does, and brings the foot's note and corner in to the right edge of what is left.
- **Its height.** In the fullscreen layout, the terminal's rows less `SPARE_ROWS`, and at least `LEAST_REPLY_ROWS`: a graph taller than that is seen through a window, which a drag, the keys, or a click on a count scrolls, since the wheel scrolls the transcript. On the main screen, as tall as the graph needs, up to `MOST_CELLS`.
- **Its groups.** As the `groups` setting says, decided when the graph is first drawn to click and changed only by the person: `expanded`, every group open; `collapsed`, every group of more than one node collapsed; `auto`, the default, one or the other, collapsed where the graph has more than `AUTO_NODES` nodes and is not seen whole with every group open, by `openingOf` in `view.ts`. A still picture has every group open, since nothing there opens one.
- **What the person does to it.** A click on a box selects its node, and once the graph has been clicked the keys of a mod's site are its keys too, as [API.md](API.md#keys-and-the-wheel) tells. With nothing selected, an arrow selects the first node the graph names of those of the highest priority, the node a site opens on. Return, or a double click, opens a collapsed group, and on any other node does nothing, since opening a node is its owner's act. No `graphlet.select`, `graphlet.collapse`, or other event of the noun is raised: graphlet does each itself, and only that graph is drawn again. The wheel scrolls the transcript, as it does over any reply.
- **Its edges.** They are drawn as the `edges` setting says, as a site's are, since a selected node lights its own and tells merged edges apart. Where the graph is still, on the main screen, in plain text, and as a copy takes it, its edges are always kept separate, as `separate` keeps them.
- **Its foot.** In its right corner, a click on `copy` puts the graph on the clipboard as plain text, drawn still, folded into the reply's width as it is drawn there, with its groups as they are, or where the graph does not fold into that width, in a room `MOST_CELLS` each way, as a site's is, so that it is copied whole; and a click on `html ↗` opens the graph as a [web page](PAGE.md), where all of a graph too large for the reply can be seen. A graph still wider than the reply, where a layer cannot fold far enough, the graph has more nodes than `FOLDED_NODES` or more edges than `FOLDED_EDGES`, or the reply is narrower than the narrowest room a graph is laid out for, is seen from its top left corner, and its foot counts the nodes past the edge, `3 more →`; a click on a count, a drag, or a selection past the edge scrolls it across, as a site's is.
- **What is kept.** graphlet keeps the place of each graph of the `KEPT_REPLIES` blocks it drew last, by the block's request and the graph's key: what was picked, collapsed, found, focused, and scrolled there. A block is drawn again as it comes back into view, as the person left it. None of it outlives the session.
- **Where its Client fails.** A `ui.fault` hook notes the Client, writes why to the debug log, and the graph is drawn as its still picture from then on.
- **Its size.** A reply's text and pictures are one drawing to the engine, so its pictures share what the engine's bound on a drawing leaves after the text, and a picture past its share is drawn plainer, as [DRAWING.md](DRAWING.md#too-large-to-draw) tells.

The still picture is `stillOf`: the graph drawn in the reply's width as tall as it needs, with nothing selected, its edges separate, and no corner, at the left edge. `pictureOf` is the same picture with its foot as its last row, as plain text takes it.

## On Other Surfaces

On the desktop app, VS Code, and the mobile app, graphlet draws no picture of its own unless the person turns on the `pictures` setting, an experiment. The hook rewrites the block's `text` instead: each graph block becomes its still picture as plain text, in a fenced code block marked `text`, and the engine draws the reply as it draws any other. The picture is made as on the terminal, to the width the surface measured, and has no color. `fencedOf` fences it with more backticks than any run of them inside it, so that no label closes the fence early. A block `lint -> test -> build -> deploy` reaches the engine there as:

````
```text
┌──────┐  ┌──────┐  ┌───────┐  ┌────────┐
│ lint ├─▶│ test ├─▶│ build ├─▶│ deploy │
└──────┘  └──────┘  └───────┘  └────────┘
```
````

Any other surface but the terminal is drawn the same way.

### Pictures

With the `pictures` setting `on`, each graph on the desktop app, VS Code, and the mobile app is drawn as a [picture in SVG](SVG.md), an `Svg`. The hook answers with a column, as on the terminal: the text before the first graph, drawn by the engine itself, and then each graph and each later run of text, a `Markdown`, a gap apart. A graph's picture is laid out as on the terminal, folded into the reply's width, with nothing selected and every group open, and runs the way it runs there, as [SVG.md](SVG.md#on-a-surface) tells. Under it, a dim line says what was left out of the graph, where anything was, and on the desktop app and VS Code, a `Button`, `Open in browser`, opens the graph as a [web page](PAGE.md#opening-it).

graphlet keeps the graph each control opens for the blocks it keeps the places of, `KEPT_REPLIES`, and a press under an older one says in a toast that it is no longer kept. Where a graph's picture would be longer than an `Svg` may be, `MOST_SVG_CHARS`, the graph is its still picture as plain text instead, fenced as code, drawn by a `Markdown`.

## Why A Block, And Not A Tool

The engine offers the model two ways to draw. A plugin can register a tool with `$.tool.register`, which the model calls with a graph and whose result row a `ui.render` hook could draw. Or the model can write the graph in its reply, as text, which a `ui.render` hook on `AssistantMessage` draws. graphlet takes the second.

- A block stands in the reply where the model speaks of it, between its sentences, as a table does. A tool's result is a row of its own, under the row of the call.
- A block costs no turn. A tool call ends the model's response, and its result goes back to the model as input, the drawing's text with it.
- A plugin's tool waits behind ToolSearch unless it asks to be listed, and a listed tool's schema rides on every request. The guide is a few lines.
- A block reads as what it is wherever it is not drawn: in an export, in `/copy`, and in the stored transcript, it is lines of arrows.

What a tool would add is a result the model reads back, and a result in a run with no surface. The model wrote the graph it would read, and a run with no surface has nowhere to draw it.

## Evaluating What The Model Writes

`graphlet/evals/` is a suite for `claude plugin eval`, which runs the model on each case's prompt in a `claude -p` session with graphlet loaded, and grades its reply. Every case sets `EVAL_GRAPHLET_GUIDE` to `1`, so the session is told of graph blocks as a session that draws is. Each case's graders, patterns on the reply and a judge model's checklist, are named in its `case.yaml`. The cases are of these kinds:

| Kind | Asks for |
| :- | :- |
| `draws-*`, `labels-the-branches`, `colors-what-went-wrong` | something a graph answers: a flow, a state machine, files and their imports, a site map, who knows whom, a home network with a nightly backup, decisions with named outcomes, a pipeline stuck at one step |
| `groups-the-tiers` | a web app whose parts fall into a client, a backend, and a data tier |
| `keeps-a-big-graph-small` | a map of a system with many parts |
| `quiet-*` | something no graph answers: a language question, a poem, a one-line answer |
| `writes-mermaid-when-asked` | a Mermaid flowchart by name |

The suite calls the model, as the person, and so costs what those calls cost. `--no-publish` keeps the report on the machine; `--runs 1` and `--max-cost-usd` keep a try small.


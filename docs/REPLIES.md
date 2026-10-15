# Graphs In Replies

Claude, the model in a session where graphlet is installed, draws a graph in a reply by writing it as a fenced block whose language is `graphlet`. graphlet tells the model the block exists, and draws each such block in the transcript in its place. Reading a reply's blocks and making their pictures is `graphlet/hooks/reply.ts`; the two hooks that tell the model and draw the blocks are in `graphlet/hooks/register.tsx`.

## What The Model Is Told

A `prompt.compose` hook adds one section to the end of the system prompt, `graphlet:graphs`, on the session's side of the cache boundary. Its text is `GUIDE` in `reply.ts`: what a block looks like, an example, the tones, and when to write one and when not to. The example is itself a block that graphlet draws.

The section is added wherever the session draws, that is, wherever `e.surfaces` names a surface. A run that draws nowhere, such as `claude -p`, gets no section, since a block there would reach the person as written, unless the environment variable `EVAL_GRAPHLET_GUIDE` is `1`, as the evals set it, so that what the model writes with the guide can be measured.

Where an organization manages Claude Code, the engine runs `prompt.compose` hooks only for the plugins the organization lists in managed settings. Unless graphlet is listed, the model there is not told, and graphlet still draws any block the model writes.

## A Graph Block

````
```graphlet
Start -> Read the request -> Valid?
Valid? -> Save it -> Done
Valid? -> Ask for a correction [warn]
Ask for a correction -> Read the request
```
````

`partsOf` cuts a reply at its graph blocks, and `graphOf` reads each block's lines.

- A graph block is a fenced block, of backticks or of tildes, whose language, the first word after the fence, is `graphlet` in any case. It is drawn once it is closed and names at least one node. One that names none is left as written.
- Each line is a chain of labels joined by arrows, `->`, `-->`, or `→`, and each arrow is a link from the label before it to the label after. A line with no arrow names one node.
- A node is known by its label, so the same label on any line is the same node. The blanks around a label are dropped, and a run of blanks inside one is read as one space.
- A tone in brackets at the end of a label is its node's: `[plain]`, `[dim]`, `[note]`, `[good]`, `[warn]`, or `[bad]`, in any case. The first tone given for a node holds. Brackets that name no tone are part of the label.
- A label left blank, by an arrow at the start or the end of a line or a tone written alone, is passed over.

The graph is then read as any other, by [`readGraph`](LAYERS.md), so the same limits hold, and its layers are worked out from its links.

A fenced block in another language stays in the reply whole, with all it holds, a `graphlet` block inside it included. A block whose fence is not yet closed, as while the reply streams in, runs to the end of the reply, and is left as written until it closes.

Nothing a reply says is changed where it is kept. The stored message, what the model reads back on later turns, and what an export or `/copy` takes, all hold the block as the model wrote it.

## On The Terminal

A `ui.render` hook on `AssistantMessage` sees each block of a reply's text. One that holds no graph block, and a summary of the model's text (`isSummary`), it passes on as they are. For one that does hold a graph block, the hook's answer is the whole of the block's drawing, the bullet that opens the reply and the room above it included. It answers with a column:

- The text before the first graph, drawn by the engine itself: `next(e)` with the block's `text` cut to that run, so the run keeps the bullet and the spacing a reply has.
- Then each graph and each later run of text, indented by the width of the bullet, `BULLET_COLUMNS`, and a blank row apart. A graph is its rows of painted text, each a `Text`. A run of text is a `Markdown`, which the terminal draws as it draws a reply.

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
        └────────┬─────────┘
                 │ ▲
                 │ └┈┈┈┈┈┈┈┈┐
                 ▼          ┊
            ┌────────┐      ┊
            │ Valid? │      ┊
            └────┬───┘      ┊
       ┌─────────┴────────┐ ┊
       ▼                  ▼ ┊
  ┌─────────┐  ┌────────────┴─────────┐
  │ Save it │  │ Ask for a correction │
  └────┬────┘  └──────────────────────┘
       │
       ▼
   ┌──────┐
   │ Done │
   └──────┘

  The dashed line is the retry.
```

### The Picture

`pictureOf` draws a graph for a reply, with the person's settings, as a pane's graph is drawn, but for two things. Its links are always kept separate, as the `links` setting's `separate` keeps them, since nothing in a reply can be selected to tell merged links apart. And its layers are folded into the reply's width.

- **Its width.** The room is the reply's width: the columns the surface measured, less the bullet's, or `REPLY_COLUMNS` less the bullet's where it measured none. A layer too wide for it is folded onto more layers, as [LAYERS.md](LAYERS.md#folding-into-a-room) tells, so the graph fits the reply where it can and is not cut off at its edge. The graph is laid out no wider than its widest layer then needs, and the columns blank down the whole of its left side are cut away, so a small graph stands at the reply's left edge, as the text does.
- **Its height.** As tall as the graph needs, up to the most rows a room has, `MOST_CELLS`.
- **It is still.** Nothing is selected or lit, no key or wheel moves it, and nothing in it answers a click. Its rows are plain `Text`, with no `Client` around them to take the pointer or the keyboard.
- **Its foot.** There is no `html ↗` corner. A graph still wider than the reply, where a layer cannot fold far enough, or the reply is narrower than the narrowest room a graph is laid out for, is seen from its top left corner, as a pane's is before it is scrolled, and its foot keeps the counts of the nodes past the edge, `3 more →`. A graph that is all in view has no foot.

## On Other Surfaces

On the desktop app, the VS Code extension, and the mobile app, graphlet draws no picture of its own. The hook rewrites the block's `text` instead: each graph block becomes its picture as plain text, in a fenced code block marked `text`, and the engine draws the reply as it draws any other. The picture is made as on the terminal, to the width the surface measured, and has no color. `fencedOf` fences it with more backticks than any run of them inside it, so that no label closes the fence early.

## Why A Block, And Not A Tool

The engine offers the model two ways to draw. A plugin can register a tool with `$.tool.register`, which the model calls with a graph and whose result row a `ui.render` hook could draw. Or the model can write the graph in its reply, as text, which a `ui.render` hook on `AssistantMessage` draws. graphlet takes the second.

- A block stands in the reply where the model speaks of it, between its sentences, as a table does. A tool's result is a row of its own, under the row of the call.
- A block costs no turn. A tool call ends the model's response, and its result goes back to the model as input, the drawing's text with it.
- A plugin's tool waits behind ToolSearch unless it asks to be listed, and a listed tool's schema rides on every request. The guide is a few lines.
- A block reads as what it is wherever it is not drawn: in an export, in `/copy`, and in the stored transcript, it is lines of arrows.

What a tool would add is a result the model reads back, and a result in a run with no surface. The model wrote the graph it would read, and a run with no surface has nowhere to draw it.

## Evaluating What The Model Writes

`graphlet/evals/` is a suite for `claude plugin eval`, which runs the model on each case's prompt in a `claude -p` session with graphlet loaded, and grades its reply. Every case sets `EVAL_GRAPHLET_GUIDE` to `1`, so the session is told of graph blocks as a session that draws is. The cases are of three kinds:

| Kind | Asks for | Graded on |
| :- | :- | :- |
| `draws-*` | something a graph answers: a flow, a state machine, files and their imports, a site map | a closed graph block with a link in it, no Mermaid in the block, and the graph being right: by a judge model's checklist, or for the imports by a pattern for each link |
| `quiet-*` | something no graph answers: a language question, a poem, a one-line answer | no graph block |
| `writes-mermaid-when-asked` | a Mermaid flowchart by name | a Mermaid block, and no graph block |

The suite calls the model, as the person, and so costs what those calls cost. `--no-publish` keeps the report on the machine; `--runs 1` and `--max-cost-usd` keep a try small.


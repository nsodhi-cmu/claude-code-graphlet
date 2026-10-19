# Contributing

graphlet has no build and nothing to install. Claude Code loads `graphlet/` as it is and runs the TypeScript in `graphlet/hooks/` itself, so a change is tried by loading the folder. [AGENTS.md](../AGENTS.md) says how code, tests, and docs are written here, and [CLAUDE.md](../CLAUDE.md) what the engine expects of a hooks module and refuses to load.

## Commands

```
claude plugin validate --strict ./graphlet    # what the engine would refuse to load
claude plugin validate --strict .             # the marketplace manifest
claude plugin test ./graphlet                 # every test, with no session and no model
claude plugin eval ./graphlet --no-publish    # what the model writes: calls the model, and costs
claude --plugin-dir ./graphlet                # a session that draws graphs in replies, from this folder
claude --plugin-dir ./graphlet --plugin-dir ../my-mod    # beside a mod that uses it
```

## Where Things Are

| File | What it is | Doc |
| :- | :- | :- |
| `.claude-plugin/marketplace.json` | The marketplace that lists the plugin. | |
| `graphlet/.claude-plugin/plugin.json` | The manifest, and the person's settings under `userConfig`. | [README](../README.md#settings) |
| `graphlet/hooks/hooks.json` | The hooks module the engine loads: `register.tsx`. | |
| `graphlet/hooks/register.tsx` | Every hook, and everything that touches the engine. | [API](API.md), [REPLIES](REPLIES.md) |
| `graphlet/hooks/layers.ts` | Reading a graph, and putting it in layers. | [LAYERS](LAYERS.md) |
| `graphlet/hooks/layout.ts` | Boxes on shelves, and the wires in the channels between them. | [LAYOUT](LAYOUT.md) |
| `graphlet/hooks/paint.ts` | Painting a layout through a window. | [DRAWING](DRAWING.md) |
| `graphlet/hooks/window.ts` | What a room shows of a layout, and where a scroll or a step goes. | [DRAWING](DRAWING.md#the-window) |
| `graphlet/hooks/view.ts` | A graph as a person looks at it: which way it runs, in focus, with groups collapsed, laid out once for a room. | [API](API.md#a-graph), [DRAWING](DRAWING.md#focus) |
| `graphlet/hooks/draw.ts` | What a drawing is made of: runs of paint, the rectangles a click lands on, cells, widths, and the foot. | [DRAWING](DRAWING.md) |
| `graphlet/hooks/page.ts` | The graph as a web page. | [PAGE](PAGE.md) |
| `graphlet/hooks/reply.ts` | A reply's graph blocks, what the model is told of them, their drawings at the reply's edge, and their still pictures. | [REPLIES](REPLIES.md) |
| `graphlet/hooks/surface.tsx` | The surface module: it paints a drawing and posts clicks, drags, and keys. | [DRAWING](DRAWING.md), [API](API.md#keys-and-the-wheel) |
| `graphlet/types/index.d.ts` | The contract: a graph's types, and what the mod adds to `$`. | [API](API.md) |
| `graphlet/tests/` | The tests. | [below](#the-tests) |
| `graphlet/evals/` | The evals. | [below](#the-evals) |

`register.tsx` is the only file that touches the engine, and `surface.tsx` decides nothing: it paints what it is handed and posts what the person did. Every other file of `graphlet/hooks/` is pure, data in and data out, with nothing awaited, so it is tested without the engine.

## Types

There is no `package.json` and no dependency. Each time Claude Code loads the mod from this folder, it writes its own API types into `graphlet/.claude-plugin/types/`, for the version that loaded it. That folder is ignored by git and never edited. `graphlet/tsconfig.json` includes it, so once the mod has been loaded, an editor or `tsc -p graphlet` checks the mod against the engine it runs on, and `graphlet/.claude-plugin/types/claude-code/index.d.ts` is the reference for the engine's API.

## The Tests

`claude plugin test ./graphlet` runs every `*.test.ts` and `*.test.tsx` under `graphlet/`, each file in a child of the `claude` binary, in an environment like the one the hooks run in. A test file imports `test`, `describe`, and `expect` from `claude-code/testing`. No session starts, and no model is called.

- `graphlet/tests/` has a file for each file of `graphlet/hooks/` it tests, beside `fixture.ts`, which holds what several share: `LOOK`, the settings' defaults; `graphOf`, a graph from ids and pairs of them; `undirected`; `numbers`, a seeded source of numbers, so that a test that draws many graphs draws the same ones every run; `picture` and `graphRows`, a drawing as the text of its rows; `cellsOf`, a row as a terminal's cells; and `SHOP`, a graph of a shop's files.
- A drawing is tested as the whole picture it makes, compared line for line.
- Some tests draw many graphs from `numbers` and check what must hold of every one. In `view.test.ts`, any graph in any room under any settings is drawn inside its room, with no two boxes on one cell. In `paint.test.ts`, `readOff` reads a picture back as a person reads it, from its characters alone, and the picture must say every link its graph has, in every channel the link crosses, and no link it does not have, with each label beside a link it is true of.
- The engine's side is tested in `register.test.tsx` through the kit, as a mod and a person drive it. `HOST` is an inline plugin that uses graphlet: its `tier` is `prepend`, so it loads outside graphlet as a mod that depends on it does, and its `register` closes over nothing of the test file. `world` stands in for what lies beneath the plugins, the toasts, the clipboard, the files, the programs, and the temporary folder, and keeps what graphlet did to each. `$.ui.mount` mounts a pane or a block of a reply on a surface, and the test then clicks with `pointer`, types with `key`, runs the surface's clock with `advance`, and presses the host's buttons with `press`. A reply is mounted in the fullscreen layout unless a test says otherwise, and its graphs are Clients keyed `graph:` and their place among the block's graphs. A test's `options` are the person's settings.

## Probing A Picture

A test's console output is not shown, so to see what the code draws for a graph, as for a new test or a picture in these docs, write a test that fails with the picture:

```ts
import { expect, test } from 'claude-code/testing'
import { picture } from './fixture'
import { readGraph } from '../hooks/layers'
import { graphOf, pictureOf } from '../hooks/reply'
import { viewOf } from '../hooks/view'

test('probe', () => {
  const still = viewOf({ scroll: 'pinned', labels: 'wrap', links: 'separate', motion: 'still' }, true, false)
  const graph = readGraph(graphOf(['Start -> Valid?', 'Valid? ->|yes| Save', 'Valid? ->|no| Retry', 'Retry -> Start']))
  expect(picture(pictureOf(still, graph, { columns: 78, rows: 1000 }))).toEqual([])
})
```

`claude plugin test ./graphlet` prints the picture as what the test received. `viewOf(LOOK)` and its `draw` give a pane's picture instead, with the node it is given selected and the foot under it. Delete the probe before committing. The pictures in these docs are drawn by the code this way, not by hand.

## The Evals

`graphlet/evals/` has a folder for each case, each with its `case.yaml`: a prompt, and graders that read the reply. `claude plugin eval ./graphlet --no-publish` runs them on the model, so they cost money and are run by hand, never by the tests. Their results, `graphlet/evals/results/`, are never committed. [REPLIES.md](REPLIES.md#evaluating-what-the-model-writes) says what each kind of case asks for and how it is graded; they are what to run after a change to what the model is told, `GUIDE`.

## Seeing A Change

The tests cover the layout, the drawing, the engine's side with a stand-in for a mod that uses graphlet, and the engine's own drawing of a reply. To see a graph in a reply, load graphlet alone with `claude --plugin-dir ./graphlet` and ask Claude for a graph. To see one in a pane, load graphlet beside a mod that depends on it, with a `--plugin-dir` each. A pane's graph is clicked only in Claude Code's fullscreen layout, and takes keys once clicked.

A change to the code changes the doc of its part in the same commit.

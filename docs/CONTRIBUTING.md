# Contributing

graphlet has no build and nothing to install. Claude Code loads `graphlet/` as it is and runs the TypeScript in `graphlet/hooks/` itself, so a change is tried by loading the folder. This file says where things are, what the engine expects of a hooks module, and how code, tests, and docs are written here.

## Commands

```
claude plugin validate --strict ./graphlet    # what the engine would refuse to load
claude plugin validate --strict .             # the marketplace manifest
claude plugin test ./graphlet                 # every test, with no session and no model
claude plugin eval ./graphlet --no-publish    # what the model writes: calls the model, and costs
claude --plugin-dir ./graphlet                # a session that draws graphs in replies, from this folder
claude --plugin-dir ./graphlet --plugin-dir ../my-mod    # beside a mod that uses it
```

A graph is clicked only in Claude Code's fullscreen layout, and takes keys once clicked. The desktop app takes no flag: it loads the folder named in `CLAUDE_CODE_PLUGIN_DIRS`, set in the `env` of `~/.claude/settings.json`. There, with the `pictures` setting on, a graph is drawn as a picture.

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
| `graphlet/hooks/window.ts` | What a room shows of a layout, where a scroll or a step goes, and the order a layout is read in. | [DRAWING](DRAWING.md#the-window), [SVG](SVG.md#on-a-surface) |
| `graphlet/hooks/view.ts` | A graph as a person looks at it: which way it runs, in focus, with groups collapsed, laid out once for a room, and drawn in cells or in SVG. | [API](API.md#a-graph), [DRAWING](DRAWING.md#focus), [SVG](SVG.md#on-a-surface) |
| `graphlet/hooks/draw.ts` | What a drawing is made of: runs of paint, the rectangles a click lands on, cells, widths, and the foot. | [DRAWING](DRAWING.md) |
| `graphlet/hooks/svg.ts` | A graph drawn in SVG, for the web page and for the desktop app, VS Code, and the mobile app. | [SVG](SVG.md) |
| `graphlet/hooks/page.ts` | The graph as a web page. | [PAGE](PAGE.md) |
| `graphlet/hooks/reply.ts` | A reply's graph blocks, what the model is told of them, their drawings at the reply's edge, and their still pictures. | [REPLIES](REPLIES.md) |
| `graphlet/hooks/tips.ts` | The tips on the hint line under the prompt, and which one is shown. | |
| `graphlet/hooks/surface.tsx` | The surface module: it paints a drawing and posts clicks, drags, and keys. | [DRAWING](DRAWING.md), [API](API.md#keys-and-the-wheel) |
| `graphlet/types/index.d.ts` | The contract: a graph's types, and what the mod adds to `$`. | [API](API.md) |
| `graphlet/tests/` | The tests. | [below](#the-tests) |
| `graphlet/evals/` | The evals. | [below](#the-evals) |

`register.tsx` is the only file that touches the engine, and `surface.tsx` decides nothing: it paints what it is handed and posts what the person did. Every other file of `graphlet/hooks/` is pure, data in and data out, with nothing awaited, so it is tested without the engine.

## Types

Each time Claude Code loads the mod from this folder, it writes its own API types into `graphlet/.claude-plugin/types/`, for the version that loaded it. That folder is ignored by git and never edited. `graphlet/tsconfig.json` includes it, so once the mod has been loaded, an editor or `tsc -p graphlet` checks the mod against the engine it runs on, and `graphlet/.claude-plugin/types/claude-code/index.d.ts` is the reference for the engine's API.

## What The Engine Expects

The engine reads a hooks module's source before it loads it, and refuses what it cannot follow.

- A noun is added to `$` in an `engine.create` hook, and its types are the plugin's contract: one `.d.ts` that imports nothing, exports types whose names start with the noun's, and declares the noun on `EngineInterface`.
- What a noun's method takes and answers crosses between mods as plain data. A tree of elements does not cross that way: `$.ui.resolve` takes a `ui.render` argument, and a `Client` is stamped with the plugin whose render hook drew it. So the drawing reaches another mod's site through the `ui.render` chain, as what its `next(e)` resolves to.
- A mod runs before the mods it lists under `dependencies`. Its hooks are the outer ones: its `ui.render` hook reaches graphlet's through `next(e)`, and its hook on `graphlet.select` hears a call graphlet's own hooks make.
- A noun's method has no `$` of its own. It calls the engine through the `$` its `engine.create` hook was handed back, and those calls run in the hook that called the method.
- A `Client` is the only element that receives pointer events and arrow keys, and it receives keys only after a click on it, until Escape gives them back. It may be drawn in any render, a reply's included, and the terminal reports the mouse only in the fullscreen layout. Its posts reach the hooks of the plugin that drew it, and no other's, and answering one with `{ props }` redraws that instance alone.
- An event matcher, an environment variable's name, and a `Client`'s `module` path are literals in the source. A call on a plugin's noun is refused from a module whose source does not spell it, which is why a test raises `graphlet.select` through a hook of an inline plugin and not from its own body.

## Writing Code

### Comments

- Comments say what a thing is, not why it came to be; a rationale for a larger decision belongs in `docs/`.
- Comment sparingly: never restate the code, and almost never comment inside a function body.
- No comment or doc names a person, conversation, past attempt, issue number, or commit hash.
- No comment or doc names a mod that uses graphlet. Graphlet is written for any mod.

### TypeScript

- No dependencies. The mod is what Claude Code loads from the folder, with no build step and no `package.json`.
- A boolean is named for the question it answers: `isUp`, `hasHead`.
- A constant that shapes behavior has a name and a comment that says what it bounds.
- Whatever another mod hands over is read leniently and repaired where it can be. No graph makes the mod throw.

### Logging

- The mod keeps no log of its own. A failure the person can act on is said to them; one they cannot goes to the engine's debug log.

### What Comes First

- Prefer OS-agnostic code; where a platform split is unavoidable, isolate it in one function.
- Keep the settings few. Each is one choice a person makes about how every graph is drawn, and none is a number.
- Prefer making illegal states unrepresentable over documenting that they are illegal.
- The mod adds no command, registers no tool, starts no agent, and calls no model.
- What the mod tells the model is one section of the system prompt, and the section rides on every request of every session that draws: keep it as short as it can be and still be followed. It says what a graph block is and when to write one, and nothing else.

## The Tests

`claude plugin test ./graphlet` runs every `*.test.ts` and `*.test.tsx` under `graphlet/`, each file in a child of the `claude` binary, in an environment like the one the hooks run in. A test file imports `test`, `describe`, and `expect` from `claude-code/testing`. No session starts, and no model is called.

- Test names are sentences describing the claim: `an edge that closes a loop runs back up dashed`, not `test loops 2`.
- Keep the set small and keep it hard. A test that is a tautology by the way the code is constructed should not exist; a test that would catch a subtle regression should.
- `graphlet/tests/` has a file for each file of `graphlet/hooks/` it tests, beside `fixture.ts`, which holds what several tests share.
- A drawing is tested as the whole picture it makes, compared line for line.
- `view.test.ts` and `paint.test.ts` draw many seeded random graphs and check what must hold of every one: each is drawn inside its room, and its picture says every edge the graph has and no other.
- The engine's side is tested in `register.test.tsx` through the kit, with `HOST` standing in for a mod that uses graphlet.

## Probing A Picture

A test's console output is not shown, so to see what the code draws for a graph, as for a new test or a picture in these docs, write a test that fails with the picture:

```ts
import { expect, test } from 'claude-code/testing'
import { picture } from './fixture'
import { readGraph } from '../hooks/layers'
import { graphOf, pictureOf } from '../hooks/reply'
import { viewOf } from '../hooks/view'

test('probe', () => {
  const still = viewOf({ scroll: 'pinned', labels: 'wrap', edges: 'separate' }, true, false)
  const graph = readGraph(graphOf(['Start -> Valid?', 'Valid? ->|yes| Save', 'Valid? ->|no| Retry', 'Retry -> Start']))
  expect(picture(pictureOf(still, graph, { columns: 78, rows: 1000 }))).toEqual([])
})
```

`claude plugin test ./graphlet` prints the picture as what the test received. With `LOOK`, the settings' defaults from `fixture.ts`, `viewOf(LOOK)` and its `draw` give a pane's picture instead, with the node it is given selected and the foot under it. Delete the probe before committing. The pictures in these docs are drawn by the code this way, not by hand.

## The Evals

`graphlet/evals/` has a folder for each case, each with its `case.yaml`: a prompt, and graders that read the reply. `claude plugin eval ./graphlet --no-publish` runs them on the model, so they cost money and are run by hand, never by the tests. [REPLIES.md](REPLIES.md#evaluating-what-the-model-writes) says what each kind of case asks for and how it is graded; they are what to run after a change to what the model is told, `GUIDE`.

## Docs

- All documentation belongs inside `docs/`. The only exceptions are the root `README.md` and `graphlet/README.md`, the few lines an installed copy of the plugin carries to point back here.
- Each part of the mod has one file in `docs/`, named for the part.
- Every markdown file is a factual description of the repository as it is, written so that a newcomer can read it and relate it directly to the code. If a sentence would not be true of the code as it stands, it does not belong.
- A change to the code changes the doc of its part in the same commit.
- Do not write counts, ranges, or limits into documentation unless the code enforces them. A number that is merely what happens to be true today reads as a rule to the next reader.

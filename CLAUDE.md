@AGENTS.md

# graphlet

graphlet is a Claude Code mod: a plugin whose hooks are TypeScript that Claude Code loads and runs itself. It draws graphs, nodes and the links between them, in the terminal, for two kinds of user. Claude draws them in its replies: graphlet tells the model, in one section of the system prompt, that a fenced `graphlet` block in a reply is drawn, and draws each such block in the transcript. And other mods build on it: it adds `$.graphlet` to the engine's interface, a mod that depends on it hands it a graph, and graphlet draws the graph inside that mod's site, a pane, the band above the prompt, or a row of its tool's result or its command's output, and says what the person did to it.

## Commands

```
claude plugin validate --strict ./graphlet    # what the engine would refuse to load
claude plugin validate --strict .             # the marketplace manifest
claude plugin test ./graphlet                 # every test, with no session and no model
claude plugin eval ./graphlet --no-publish    # what the model writes, with the guide: calls the model, and costs
claude --plugin-dir ./graphlet --plugin-dir <a mod that uses it>
claude --plugin-dir ./graphlet                # Claude draws graphs in its replies
```

There is no build and nothing to install. To type-check, load the mod once so that Claude Code writes its API types into `graphlet/.claude-plugin/types/`, then point TypeScript at `graphlet/tsconfig.json`.

## Where Things Are

```
.claude-plugin/marketplace.json     the marketplace that lists the plugin
graphlet/.claude-plugin/plugin.json the manifest, and the settings
graphlet/hooks/
  register.tsx    every hook, and everything that touches the engine
  layers.ts       reading a graph, and putting it in layers
  layout.ts       boxes on shelves, and the wires in the channels between them
  paint.ts        painting a layout through a window
  window.ts       what a room shows of a layout, and where a scroll or a step goes
  view.ts         a graph as a person looks at it, drawn as their settings say
  draw.ts         what a drawing is made of
  page.ts         the graph as a web page
  reply.ts        a reply's graph blocks: finding them, reading them, and drawing them at the reply's edge
  tips.ts         the tips on the hint line under the prompt, and which one is shown
  surface.tsx     the surface module that paints a drawing and posts clicks and keys
graphlet/tests/   the tests, one file for each of those it tests
graphlet/types/   the contract: a graph's types, and what the mod adds to `$`
docs/             one file for each part: the API, the layers, the layout, the drawing, the page, the replies, the tips; and how to work on graphlet
```

## What The Engine Expects

The engine reads a hooks module's source before it loads it, and refuses what it cannot follow.

- A noun is added to `$` in an `engine.create` hook, and its types are the plugin's contract: one `.d.ts` that imports nothing, exports types whose names start with the noun's, and declares the noun on `EngineInterface`.
- What a noun's method takes and answers crosses between mods as plain data. A tree of elements does not cross that way: `$.ui.resolve` takes a `ui.render` argument, and a `Client` is stamped with the plugin whose render hook drew it. So the drawing reaches another mod's site through the `ui.render` chain, as what its `next(e)` resolves to.
- A mod runs before the mods it lists under `dependencies`. Its hooks are the outer ones: its `ui.render` hook reaches graphlet's through `next(e)`, and its hook on `graphlet.select` hears a call graphlet's own hooks make.
- A noun's method has no `$` of its own. It calls the engine through the `$` its `engine.create` hook was handed back, and those calls run in the hook that called the method.
- A `Client` is the only element that receives pointer events and arrow keys, and it receives keys only after a click on it, until Escape gives them back. It may be drawn in any render, a reply's included, and the terminal reports the mouse only in the fullscreen layout. Its posts reach the hooks of the plugin that drew it, and no other's, and answering one with `{ props }` redraws that instance alone. One that fails is heard in `ui.fault`, and the engine then draws its site again, for the hook to leave it out.
- An event matcher, an environment variable's name, and a `Client`'s `module` path are literals in the source. A call on a plugin's noun is refused from a module whose source does not spell it, which is why a test raises `graphlet.select` through a hook of an inline plugin and not from its own body.
- In the test kit, an inline plugin's `register` closes over nothing of the test file, and its `tier` says where it loads: `prepend` puts a mod that uses graphlet outside it, as a dependent is.
- A `ui.render` hook on `AssistantMessage` answers for one block of a reply, its bullet and the room above it included. `next(e)` with a rewritten `text` is the engine's own drawing of that text, so the text before a graph keeps the reply's bullet that way. The stored message is never changed.
- A `ui.render` hook on `PromptHint` sets `tail` to add to the hint line under the prompt, which only the terminal draws, dim, cut where the row ends. `turn.complete` hears each turn end, the main loop's and every subagent's (`e.agentId`), and `$.config.list()` reads the `/config` rows, Claude Code's `tips` among them.
- A `prompt.compose` hook adds to the system prompt, and its `e.surfaces` is empty in a run that draws nowhere. Where an organization manages Claude Code, the engine runs it only for a plugin the organization lists in managed settings.

The API's types are the reference for everything else: `graphlet/.claude-plugin/types/claude-code/index.d.ts`, once the mod has been loaded.

## Trying A Change

The tests cover the layout, the drawing, and the engine's side with a stand-in for a mod that uses graphlet, and for the engine's own drawing of a reply. To see a graph in a real pane, load graphlet beside a mod that depends on it, with one `--plugin-dir` each. To see one in a reply, load graphlet alone and ask Claude for a graph.

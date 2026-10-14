# Repository Structure

## Documentation Structure

- All documentation belongs inside `docs/`. The only exceptions are the root `README.md`, this `AGENTS.md`, `CLAUDE.md`, and `graphlet/README.md`, the few lines an installed copy of the plugin carries to point back here.
- Each part of the mod has one file in `docs/`, named for the part.
- To get oriented, start from `README.md`, which covers the whole mod, then `docs/`.
- Every markdown file is a factual description of the repository as it is, written so that a newcomer can read it and relate it directly to the code. If a sentence would not be true of the code as it stands, it does not belong.
- Update a part's doc in the same change that alters the code it describes.
- Do not write counts, ranges, or limits into documentation unless the code enforces them. A number that is merely what happens to be true today reads as a rule to the next reader.

## Code Structure

- The repository is a plugin marketplace with one plugin in it. `.claude-plugin/marketplace.json` lists the plugin, and `graphlet/` is the plugin.
- `graphlet/hooks/register.tsx` is the only file that touches the engine. `graphlet/hooks/surface.tsx` is the surface module: it paints what it is handed and posts what the person did, and decides nothing. Every other file in `graphlet/hooks/` is pure: data in, data out, with nothing awaited.
- `graphlet/types/index.d.ts` is the mod's contract: the types of a graph, and what the mod adds to `$`. It imports nothing.
- Tests live in `graphlet/tests/`, one file for each file of `graphlet/hooks/` it tests, beside a shared `fixture.ts`.
- `graphlet/.claude-plugin/types/` is written by Claude Code and is never edited or committed.

# Style

## Comments

- Comments say what a thing is, not why it came to be; a rationale for a larger decision belongs in `docs/`.
- Comment sparingly: never restate the code, and almost never comment inside a function body.
- No comment or doc names a person, conversation, past attempt, issue number, or commit hash.
- No comment or doc names a mod that uses graphlet. Graphlet is written for any mod.

## TypeScript

- No dependencies. The mod is what Claude Code loads from the folder, with no build step and no `package.json`.
- A boolean is named for the question it answers: `isUp`, `hasHead`.
- A constant that shapes behavior has a name and a comment that says what it bounds.
- Whatever another mod hands over is read leniently and repaired where it can be. No graph makes the mod throw.

## Tests

- Test names are sentences describing the claim: `a link that closes a loop runs back up dashed`, not `test loops 2`.
- Keep the set small and keep it hard. A test that is a tautology by the way the code is constructed should not exist; a test that would catch a subtle regression should.
- A drawing is tested as the whole picture it makes, compared line for line.
- The engine's side of the mod is tested through the engine's own test kit, as another mod and a person would drive it: a graph shown, a click, a key.

## Logging

- The mod keeps no log of its own. A failure the person can act on is said to them; one they cannot goes to the engine's debug log.

# Prioritizations

- Write simple code that reads as a plain description of what it does: prefer the obvious approach over the clever one. Fewer lines is a soft priority.
- Prefer OS-agnostic code; where a platform split is unavoidable, isolate it in one function.
- Keep the settings few. Each is one choice a person makes about how every graph is drawn, and none is a number.
- Prefer making illegal states unrepresentable over documenting that they are illegal.
- The mod adds no command, starts no agent, and calls no model.

# Git

- Never put a session link, a conversation URL, or any other pointer back to the tool that wrote the code into a commit message or a pull request description.
- Every commit has a brief description in its body.

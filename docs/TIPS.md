# Tips

Now and then, after a reply, graphlet shows a tip at the end of the hint line under the prompt, dim, as Claude Code shows its own. The tips and how one is picked are `graphlet/hooks/tips.ts`; the hooks that show them are in `graphlet/hooks/register.tsx`. Nothing about them is kept between sessions.

## When One Is Shown

A `turn.complete` hook hears each turn end. When a turn of the main loop ends with an answer, one in `TIP_ODDS` of them on average, by a roll of the dice, is followed by a tip, unless Claude Code's own `/config` row **Show tips**, `tips`, is off. A turn that was interrupted, ended on an error or a refusal, or ran in a subagent is followed by none. A second roll, kept until the next turn of the main loop starts, picks which tip, and the hint line is drawn again.

A `ui.render` hook on `PromptHint` then sets the line's `tail` to ` · Tip: ` and the tip, which the terminal draws dim after the engine's own line. It leaves the line as it is while a turn runs, while the prompt holds typed text, and on every surface but the terminal, which alone draws a `tail`. So a tip goes while the person types and comes back if they clear the prompt, and the next turn takes it away.

## Which One

`tipOf` picks, by the second roll, among the tips true at the moment and short enough for the row, each as likely as its weight against the others. The row a tip may take is the terminal's columns, less the engine's line and the lead before the tip, so that none is cut off at the row's end; on a row too narrow for any, none is shown.

| Tip | Weight | True |
| :- | :-: | :- |
| Ask Claude Code to graph how things connect, powered by graphlet | 3 | while **Graphs in replies** is on |
| Building a mod? Use graphlet as a dependency to draw graphs | 1 | always |
| Graphs can group nodes and label links, powered by graphlet | 2 | once a graph is drawn |
| Graphs can be directed, undirected, or both, powered by graphlet | 2 | once a graph is drawn |
| Use /config to change how graphlet draws graphs | 2 | once a graph is drawn |
| Click a graph, then use the arrows to move, space to fold, / to find | 2 | once a graph is drawn, in the fullscreen layout |
| Click copy under a graph to paste it anywhere as text | 1 | once a graph is drawn, in the fullscreen layout |
| Click html ↗ under a graph to see a big one whole in your browser | 1 | once a graph is drawn, in the fullscreen layout |

A graph is drawn once graphlet has drawn one in a reply, or a mod has said what one of its sites holds with `show`, in this session. The fullscreen layout is the one where the terminal reports a click, so the tips that say to click are true only there.

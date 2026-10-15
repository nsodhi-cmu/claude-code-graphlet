# The Drawing

A drawing is rows of painted text, and the rectangles of them that answer a click. Painting one is `graphlet/hooks/paint.ts`, the window it is painted through is `graphlet/hooks/window.ts`, and what both are made of is `graphlet/hooks/draw.ts`. The surface module `graphlet/hooks/surface.tsx` puts a pane's rows on the terminal, moves the beads of lines that flow, and posts what a click lands on. A graph in a reply is drawn as a [still picture](REPLIES.md#the-picture), its rows put on the terminal by the hook itself.

## Reading The Picture

```
                ┌─────┐
                │  A  │
                └─┬───┘
                  │ ▲
                  │ └┈┈┈┐
                  ▼     ┊
               ┌─────┐  ┊
               │  B  │  ┊
               └──┬──┘  ┊
                  │ ┌┈┈┈┘
                  ▼ ┊
                ┌───┴─┐
                │  C  │
                └─────┘
```

- A box is a node. A link leaves a box where its border has a tick, and reaches a box at an arrowhead.
- A solid line is a link that runs with the flow, down the drawing. A dashed line is a link that runs against it: the link that closes a loop, on its way back up.
- A line that passes a layer beside its boxes is a link bound for a layer farther on.
- Lines that meet are joined, in a tee or a cross: they leave the same box, or reach the same box. Where a link only crosses another, it passes over unbroken, and the line it crosses is broken there.
- A box has an arrowhead of its own for each set of boxes whose links reach it together, so links from different boxes never run into one line on the way to it.
- `↺` in a box says the node links to itself.

An undirected graph is drawn the same way, with no arrowheads and no flow:

```
                 ┌─────┐
                 │  A  │
                 └──┬──┘
               ┌────┴───┐
            ┌──┴──┐  ┌──┴──┐
            │  B  │  │  C  │
            └──┬──┘  └─┬─┬─┘
               └───────┘ │
                     ┌───┴──┐
                     │ D  ↺ │
                     └──────┘
```

- A link meets both its boxes at ticks, and every line is solid.
- A line joins each box whose bottom it meets to each box whose top it meets. A line that meets the bottoms of two boxes of one layer, and nothing else, is the one link between those two: here, the link between B and C that closes the loop.
- A box has a tick of its own for each set of boxes whose links reach it together, as it would an arrowhead.

A link's label is written beside its line, just past the box it leaves, in the paint of a label and lit with its link:

```
                 ┌──────┐
                 │ Read │
                 └──┬───┘
                    │ ▲
                    │ └┈┈┈┈┐
                    ▼      ┊
               ┌────────┐  ┊
               │ Valid? │  ┊
               └┬────┬──┘  ┊
                │yes │no   ┊
                └┐   └───┐ ┊
                 ▼       ▼ ┊retry
             ┌──────┐  ┌───┴───────┐
             │ Save │  │ Ask again │
             └──────┘  └───────────┘
```

- The words beside a line where it leaves a box are the label of every link of that line, since links with different labels never share one.
- A link down the drawing has its label under the box it leaves; a link back up, over the box it leaves, beside the dashed line.

## What Is Selected

The selected node's box has a double frame, and its label is bold and inverse in the node's own tone. Every link that touches the selected node is lit along its whole way, in the theme's accent color, and so are its label and the borders of the boxes at the other ends. Everything else keeps its own paint: a box's border takes its node's tone, and a link is dim.

Lit is painted over unlit. Where links share a stretch of line, selecting a node shows which of them are its own.

### Flowing

With the `motion` setting at `flowing`, the lit lines of a directed graph flow. Each cell of a lit line has a beat, one of `BEATS`, from where it stands along the way its link runs there: its row on a stretch that runs down, its row counted upward on one that runs up, and its column counted the way a stretch across runs. The beat is a span's `beat`. At each step of the flow, the cells whose beat it is are beads, bright and bold in the accent, and the rest of the lit lines are dim; at the next step the beads stand a cell farther along, so they move on from the node a link leaves to the node it reaches, and every `BEATS` steps they come round again. A cell several lit lines share has the beat of the first. Arrowheads, ticks and labels stay as they are. The surface module takes a step every `STEP_MS`, and only while its drawing has lines that flow.

## The Window

A graph larger than its room is seen through a window, and never laid out again to fit: the layout depends only on the room's width.

- A shelf longer than the room runs off its edge, in the order it always has. A box the edge cuts ends there in an ellipsis.
- `showIn` says where the window stands to show the selected node. A window that already shows the whole box stays where it is. One that does not moves just far enough to show the box, the wires above and below it, and the start of the boxes beside it, or as much of those as a small room leaves it.
- `scrollIn` scrolls the window by cells, or by turns of the wheel, which go the way the graph has more rooms' worth out of view: along it, or down it.
- A drag from a cell where no box or count is moves the window with the pointer, so the graph follows it, and the window stays where it is dropped.
- Every shelf slides under the window together, each as far as its own end. With `scroll` at `pinned`, that leaves a shelf that fits the room where it is while a longer one slides, and the wires between the two follow. With `scroll` at `sheet`, the shelves move as one.

## Names At The Edge

While the window shows the selected node's label, each node joined to it whose label the window does not show is named at the window's edge, after an arrow pointing out toward it: `◂ cart.ts` down the first column and `cart.ts ▸` down the last, for a box off to that side, on the row of its label; `▴ cart.ts` along the top row and `▾ cart.ts` along the bottom, for a box above or below, under or over its middle. A name is lit, as the node's box would be, and a click on it selects the node, which moves the window to it.

A name covers only lines and blanks, never a box or a lit line, and has a blank on either side. The names at the sides are written first. A name with no room where it belongs goes to the nearest place along its edge that has room, and one with none is not written; the lit line still leads to the node, and the foot still counts it.

## The Foot

The last row of a drawing is its foot. A graph with no nodes has no drawing, and so none.

- Under a graph larger than its room, it counts the nodes out of view past each edge: `← 3 more`, `↑ 2 more · ↓ 5 more`, `12 more →`. A click on a count scrolls the graph most of a room that way.
- Where nodes or links were left out of a graph past the most that are read, it says how many: `12 nodes and 340 links left out`, or in a narrow room `+12 nodes +340 links`.
- In its right corner is `html ↗`. A click there opens the graph as a [web page](PAGE.md). Where the row is too narrow for all of it, the corner says only `↗`, and what was left out keeps its place over the corner's words.

A still picture in a reply keeps the counts and what was left out, and drops the corner; it has no foot when all of it is in view and nothing was left out.

## Moving The Selection

`stepIn` says where a move lands. Left and right go along the selected node's shelf, past any lanes. Up and down go to the next shelf: to the node there that a link joins the selected one to, whichever way the link runs, the nearest of them in the window, or with none joined, to the nearest. So the keys reach every node, a shelf at a time. A move with nowhere to go stays where it is.

## Focus

`focusOf` in `view.ts` is a graph in focus on its selected node: that node and the nodes nearest it, by the fewest links between whichever way they run, up to `FOCUS_NODES`, and of nodes as near, those the graph names first; with the links among them. A node shown that is joined to nodes not shown says how many after its badge, `+3`, and what is not shown is counted as left out, so the foot says how much is out of focus. A graph no larger than that is drawn whole. A pane in focus draws the graph in focus on whichever node is selected, so the focus follows the selection.

## Finding

While a node is being found, the nodes whose labels hold what is typed, in any case, are found, in the graph's order. Their boxes have their borders in `note`, over their own tone and under the light of the selection, and the foot says what is looked for and which of the found the selected node is, `/pars · 2 of 5`, or `no match`. Nodes are found in the whole graph, in focus or not, and selecting one out of focus moves the focus to it.

## Paints

A run of text is in one paint: a node's tone, or `accent` for what is selected or linked to it. `COLORS` in `draw.ts` gives each paint a key of the person's theme, so a drawing follows the theme they chose, and `styleOf` turns a run into the props of the `Text` that paints it.

| Paint | Theme color |
| :- | :- |
| `plain` | the terminal's own |
| `dim` | the terminal's own, dimmed |
| `note` | `suggestion` |
| `good` | `success` |
| `warn` | `warning` |
| `bad` | `error` |
| `accent` | `claude` |

## Cells

A drawing is painted on a canvas of cells, a row of them a row of the picture, before its rows become runs of text. A character two cells wide, of an East Asian script or an emoji, takes its cell and the one after, which holds nothing. Where the window's edge would cut such a character, or a later write covers half of it, as the ellipsis of a box the edge cuts may, what is left of it is blank. So no row ever holds half a character, and every row is as wide as the window, whatever its labels are written in.

# The Drawing

A drawing is rows of painted text, and the rectangles of them that answer a click. Painting one is `graphlet/hooks/paint.ts`, the window it is painted through is `graphlet/hooks/window.ts`, and what both are made of is `graphlet/hooks/draw.ts`. The surface module `graphlet/hooks/surface.tsx` puts a pane's rows on the terminal and posts what a click lands on. A graph in a reply is drawn as a [still picture](REPLIES.md#the-picture), its rows put on the terminal by the hook itself.

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

## The Window

A graph larger than its room is seen through a window, and never laid out again to fit: the layout depends only on the room's width.

- A shelf longer than the room runs off its edge, in the order it always has. A box the edge cuts ends there in an ellipsis.
- `showIn` says where the window stands to show the selected node. A window that already shows the whole box stays where it is. One that does not moves just far enough to show the box, the wires above and below it, and the start of the boxes beside it, or as much of those as a small room leaves it.
- `scrollIn` scrolls the window by cells, or by turns of the wheel, which go the way the graph has more rooms' worth out of view: along it, or down it.
- Every shelf slides under the window together, each as far as its own end. With `scroll` at `pinned`, that leaves a shelf that fits the room where it is while a longer one slides, and the wires between the two follow. With `scroll` at `sheet`, the shelves move as one.

## The Foot

The last row of a drawing is its foot. A graph with no nodes has no drawing, and so none.

- Under a graph larger than its room, it counts the nodes out of view past each edge: `← 3 more`, `↑ 2 more · ↓ 5 more`, `12 more →`. A click on a count scrolls the graph most of a room that way.
- Where nodes or links were left out of a graph past the most that are read, it says how many: `12 nodes and 340 links left out`, or in a narrow room `+12 nodes +340 links`.
- In its right corner is `html ↗`. A click there opens the graph as a [web page](PAGE.md). Where the row is too narrow for all of it, the corner says only `↗`, and what was left out keeps its place over the corner's words.

A still picture in a reply keeps the counts and what was left out, and drops the corner; it has no foot when all of it is in view and nothing was left out.

## Moving The Selection

`stepIn` says where a move lands. Left and right go along the selected node's shelf, past any lanes. Up and down go to the next shelf: to the node there that a link joins the selected one to, whichever way the link runs, the nearest of them in the window, or with none joined, to the nearest. So the keys reach every node, a shelf at a time. A move with nowhere to go stays where it is.

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

# The Drawing

A drawing is rows of painted text, and the rectangles of them that answer a click. Painting one is `graphlet/hooks/paint.ts`, the window it is painted through is `graphlet/hooks/window.ts`, and what both are made of is `graphlet/hooks/draw.ts`. The surface module `graphlet/hooks/surface.tsx` puts the rows on the terminal and posts what a click lands on.

## Reading The Picture

```
               ┌─────┐
               │  A  │
               └──┬──┘
                  │ ▲
                  │ └┈┈┈┐
                  ▼     ┊
               ┌─────┐  ┊
               │  B  │  ┊
               └──┬──┘  ┊
                  │ ┌┈┈┈┘
                  ▼ ┊
               ┌────┴┐
               │  C  │
               └─────┘
```

- A box is a node. A link leaves a box where its border has a tick, and reaches a box at an arrowhead.
- A solid line is a link that runs with the flow, down the drawing. A dashed line is a link that runs against it: the link that closes a loop, on its way back up.
- A line that passes a layer beside its boxes is a link bound for a layer farther on.
- Lines that meet in a tee are joined: they leave the same box, or reach the same box. Where one line goes straight through another, in a cross, either two links only cross there, or one box's links part ways under it.
- `↺` in a box says the node links to itself.

## What Is Selected

The selected node's box has a double frame, and its label is bold and inverse in the node's own tone. Every link that touches the selected node is lit along its whole way, in the theme's accent color, and so are the borders of the boxes at the other ends. Everything else keeps its own paint: a box's border takes its node's tone, and a link is dim.

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
- In its right corner is `html ↗`. A click there opens the graph as a [web page](PAGE.md).

## Moving The Selection

`stepIn` says where a move lands. Left and right go along the selected node's shelf, past any lanes. Up and down go to the next shelf: to the node there that a link joins the selected one to, the nearest of them in the window, or with none joined, to the nearest. So the keys reach every node, a shelf at a time. A move with nowhere to go stays where it is.

## Paints

A run of text is in one paint: a node's tone, or `accent` for what is selected or linked to it. `COLORS` in `draw.ts` gives each paint a key of the person's theme, so a drawing follows the theme they chose.

| Paint | Theme color |
| :- | :- |
| `plain` | the terminal's own |
| `dim` | the terminal's own, dimmed |
| `note` | `suggestion` |
| `good` | `success` |
| `warn` | `warning` |
| `bad` | `error` |
| `accent` | `claude` |

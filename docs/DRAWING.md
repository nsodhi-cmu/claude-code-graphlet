# The Drawing

A drawing is rows of painted text, and the rectangles of them that answer a click. Painting one is `graphlet/hooks/paint.ts`, the window it is painted through is `graphlet/hooks/window.ts`, and what both are made of is `graphlet/hooks/draw.ts`. The surface module `graphlet/hooks/surface.tsx` puts a drawing's rows on the terminal, in a pane, the band, a tool's or command's row, or a reply in the fullscreen layout, and posts what a click lands on, whether two make a double click on a box, and how far a drag has gone. A graph in a reply on the main screen is drawn as a [still picture](REPLIES.md#the-picture), its rows put on the terminal by the hook itself.

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

- A box is a node. An edge leaves a box where its border has a tick, and reaches a box at an arrowhead.
- A solid line is an edge that runs with the flow, down the drawing. A dashed line is an edge that runs against it: the edge that closes a loop, on its way back up.
- A line that passes a layer beside its boxes is an edge bound for a layer farther on.
- Lines that meet are joined, in a tee or a cross: they leave the same box, or reach the same box. Where an edge only crosses another, it passes over unbroken, and the line it crosses is broken there.
- With the `edges` setting at `separate`, a box has an arrowhead of its own for each set of boxes whose edges reach it together, so edges from different boxes never run into one line on the way to it. At `merged`, the default, edges of one kind share one line and one arrowhead, and selecting a node tells its own apart.
- `↺` in a box says the node has an edge to itself.
- A box with a heavy frame, `┏━┓`, and a bold label is a node the graph puts foremost: one of the highest priority its nodes have, where that is above 0 and above another node's.
- A frame with round corners, `╭─ Backend ─╮`, holds the nodes of a group, and nothing else. A line that crosses its border is an edge into the group or out of it, and passes over the border, which is broken there.
- A box with round corners that says `▸` and a count, `▸ Backend  3`, is a collapsed group, standing for all its nodes: its edges are theirs. Selected, it has a double frame, as any box does.
- A box with a double frame, `╔═╗`, is the selected node's, and its edges, their labels, and the boxes they reach are lit, as [What Is Selected](#what-is-selected) tells.

An undirected graph is drawn the same way, with no arrowheads and no flow, and in a graph with edges of both kinds, each is drawn as its kind is:

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

- An edge meets both its boxes at ticks, and every line is solid.
- A line joins each box whose bottom it meets to each box whose top it meets. A line that meets the bottoms of two boxes of one layer, and nothing else, is the one edge between those two: here, the edge between B and C that closes the loop.
- A box has a tick of its own for each set of boxes whose edges reach it together, as it would an arrowhead.

An edge's label is written beside its line, just past the box it leaves, in the paint of a label and lit with its edge:

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
            │    └──┐ ┌┘
            ▼       ▼ ┊retry
        ┌──────┐  ┌───┴───────┐
        │ Save │  │ Ask again │
        └──────┘  └───────────┘
```

- The words beside a line where it leaves a box are the label of every edge of that line, since edges with different labels never share one.
- An edge down the drawing has its label under the box it leaves; an edge back up, over the box it leaves, beside the dashed line.
- A line in color is an edge in a tone, and the same holds of it: edges of different tones never share a line.

### Groups

`paintFrame` draws each group's frame before anything else, in the group's tone, or dim, so the lines painted after pass over it. Last, `writeTitle` writes the group's label in the top border, a blank on either side, nearest its left corner where no line crosses the border there or in the cell after; else anywhere it fits; and where nothing is long enough, cut in its middle to the longest stretch there is, or left out where even that is shorter than `LEAST_TITLE_CELLS`, and then there is no label to click. The label is in the group's tone, or plain, and a click on it collapses the group. A collapsed group is drawn by `collapsedOf` in `view.ts` as a node whose box has round corners, before anything is laid out.

```
                          ┌─────────┐
                          │ Browser │
                          └────┬────┘
                               │
               ╭─ Backend ─────│─────╮
               │               ▼     │
               │            ┌─────┐  │
               │            │ API │  │
               │            └──┬──┘  │
               │     ┌─────────┼────────────┐
               │     ▼         ▼     │      ▼
               │ ┌──────┐  ┌───────┐ │  ┌──────┐
               │ │ Auth │  │ Cache │ │  │ Logs │
               │ └─┬────┘  └───┬───┘ │  └──────┘
               ╰───│───────────│─────╯
                   │           │
           ╭───────│ Data ─────│─────╮
           │       ▼           ▼     │
           │ ┌──────────┐  ┌───────┐ │
           │ │ Postgres │  │ Redis │ │
           │ └──────────┘  └───────┘ │
           ╰─────────────────────────╯
```

In a pane, the same graph with its `Data` group collapsed and `API` selected, in a room 44 columns wide, with the foot under it:

```
                 ┌─────────┐
                 │ Browser │
                 └────┬────┘
                      │
          ╭─ Backend ─│──────────╮
          │           ▼          │
          │        ╔═════╗       │
          │        ║ API ║       │
          │        ╚══╤══╝       │
          │     ┌─────┴────┐     │
          │     ▼          ▼     │
          │ ┌──────┐  ┌────────┐ │
          │ │ Auth │  │ Orders │ │
          │ └───┬──┘  └────┬───┘ │
          ╰─────│──────────│─────╯
                └─────┬────┘
                      ▼
                ╭───────────╮
                │ ▸ Data  2 │
                ╰───────────╯
                               copy · html ↗
```

The edges of `Auth` and `Orders` to the nodes of `Data` are edges to its box, and since both reach the very same box, they share one arrowhead.

### A Graph That Runs Right

A graph that runs right has its layers side by side, each a column of boxes, and its edges run across the room:

```
                     ┌──────┐
              ┌─────▶│ Save │
┌────────┐    │      └──────┘
│        ├yes─┘
│        │           ┌───────────┐
│ Valid? ├no────────▶│           │
│        │           │ Ask again │
│        │◀┈┈┈┈┈retry┤           │
└────────┘           └───────────┘
```

- An edge leaves a box at a tick on its side and reaches the next at an arrowhead that points right. The edge that closes a loop runs back dashed, to an arrowhead that points left.
- An edge's label is written on its line, just past the box it leaves.
- A box is as tall as its ports down its side need, its label in its middle.

## What Is Selected

The selected node's box has a double frame, in place of the heavy one of a node put foremost, and its label is bold and inverse in the node's own tone. Every edge that touches the selected node is lit along its whole way, in the theme's accent color, and so are its label and the borders of the boxes at the other ends. Everything else keeps its own paint: a box's border takes its node's tone, and an edge takes its own tone, in its line, its arrowhead, and its label, or is dim where it has none.

Lit is painted over unlit. Where edges share a stretch of line, selecting a node shows which of them are its own.

## The Window

A graph larger than its room is seen through a window, and never laid out again to fit: the layout depends only on the room's width, and for a graph that runs right, on its rows.

- A shelf longer than the room runs off its edge, in the order it always has. A box the edge cuts ends there in an ellipsis.
- `showIn` says where the window stands to show the selected node. A window that already shows the whole box stays where it is. One that does not moves just far enough to show the box, the wires above and below it, and the start of the boxes beside it, or as much of those as a small room leaves it.
- `scrollIn` scrolls the window by cells, or by turns of the wheel, which go the way the graph has more rooms' worth out of view: along its layers, or across them. A window stands as its layout is laid out, across and along, so a scroll by cells across the room and down it is turned to match for a graph that runs right.
- `keepIn` keeps a group that is collapsed or opened where it stood: the window stands so that its box has its top left corner where the selected node it holds had, or its frame where its box had, as near as the layout lets it.
- A drag from a cell a click does nothing on moves the graph with the pointer, and so the window the other way, and the window stays where it is dropped.
- Every shelf slides under the window together, each as far as its own end. With `scroll` at `pinned`, that leaves a shelf that fits the room where it is while a longer one slides, and the wires between the two follow. With `scroll` at `sheet`, the shelves move as one.

## Names At The Edge

While the window shows the selected node's label, each node joined to it whose label the window does not show, apart from the ellipsis of a box the edge cuts, is named at the window's edge, after an arrow pointing out toward it: `◂ cart.ts` down the first column and `cart.ts ▸` down the last, for a box off to that side, on the row of its label; `▴ cart.ts` along the top row and `▾ cart.ts` along the bottom, for a box above or below, under or over its middle. A name is lit, as the node's box would be, and a click on it selects the node, which moves the window to it.

A name covers only lines, arrowheads and blanks, never a box or anything lit, and has a blank on either side. The names at the sides are written first, then those along the top and bottom, and of each, those of the nodes of highest priority first. A name with no room where it belongs goes to the nearest place along its edge that has room, and one with none is not written; the lit line still leads to the node, and the foot still counts it.

## The Foot

The last row of a drawing is its foot. A graph with no nodes has no drawing, and so none.

- Under a graph larger than its room, it counts the nodes out of view past each edge: `← 3 more`, `↑ 2 more · ↓ 5 more`, `12 more →`. A click on a count scrolls the graph most of a room that way.
- Where nodes or edges were left out of a graph past the most that are read, it says how many: `12 nodes and 340 edges left out`, or in a narrow room `+12 nodes +340 edges`.
- In its right corner is `copy · html ↗`. A click on `copy` puts the graph on the clipboard as plain text, as `c` does, and one on `html ↗` opens the graph as a [web page](PAGE.md). Where the row is too narrow for all of it, the corner says `copy · ↗`, and then only `↗`, and what was left out keeps its place over the corner's words.

A still picture, as plain text takes it, on the main screen, on a surface graphlet draws no `Client` or `Svg` on, in place of an `Svg` too long for its surface, and as a copy, keeps the counts and what was left out, reaching the right edge, and has no corner, since nothing in it can be clicked; and no foot when all of it is in view and nothing was left out. A site's drawing on the main screen has no corner either. In a reply, `alignedLeft` brings the note and the corner in to the right edge of the picture, which stands at the reply's left edge.

## Moving The Selection

`stepIn` says where a move lands. Left and right go along the selected node's shelf, past any lanes. Up and down go to the next shelf: to the node there that an edge joins the selected one to, whichever way the edge runs, the nearest of them in the window, or with none joined, to the nearest. So the keys reach every node, a shelf at a time. A move with nowhere to go stays where it is. In a graph that runs right, the keys turn with it: up and down go along a shelf, and left and right to the next.

## Focus

`focusOf` in `view.ts` is a graph in focus on its selected node: that node and the nodes nearest it, by the fewest edges between whichever way they run, up to `FOCUS_NODES`, and of nodes as near, those of highest priority, and of those the ones the graph names first; with the edges among them. A node shown that is joined to nodes not shown says how many after its badge, `+3`, and what is not shown is counted as left out, so the foot says how much is out of focus. A graph no larger than that is drawn whole. A pane in focus draws the graph in focus on whichever node is selected, so the focus follows the selection.

## Finding

While a node is being found, the nodes whose labels hold what is typed, in any case, are found, in the graph's order. Their boxes have their borders in `note`, over their own tone and under the light of the selection, and the foot says what is looked for and which of the found the selected node is, `/pars · 2 of 5`, or `no match`. Nodes are found in the whole graph, in focus or not, and selecting one out of focus moves the focus to it.

## Paints

A run of text is in one paint: a node's tone, or `accent` for what is selected or joined to it. `COLORS` in `draw.ts` gives each paint a key of the person's theme, so a drawing follows the theme they chose, and `styleOf` turns a run into the props of the `Text` that paints it.

| Paint | Theme color |
| :- | :- |
| `plain` | the terminal's own |
| `dim` | the terminal's own, dimmed |
| `note` | `suggestion` |
| `good` | `success` |
| `warn` | `warning` |
| `bad` | `error` |
| `accent` | `claude` |

### Too Large To Draw

The engine draws a tree of elements only up to a size, and unmounts a surface module, or refuses a hook's drawing, past it; each run of a row is an element. `bounded` keeps a drawing's rows within `MOST_TREE_CHARS` characters as a tree, by `treeCharsOf`'s reckoning: each run costs `PIECE_CHARS` besides its text, and each row `ROW_CHARS`. A drawing within it is drawn as it is. One past it is drawn plainer, each way plainer than the one before, until it fits: its dim paint plain; then all but what is lit or selected plain; then all of it plain. `paint` bounds every drawing, and a reply shares what is left of the bound, after its text, among its pictures.

## Cells

A drawing is painted on a canvas of cells, a row of them a row of the picture, before its rows become runs of text. A character two cells wide, of an East Asian script or an emoji, takes its cell and the one after, which holds nothing. Where the window's edge would cut such a character, or a later write covers half of it, as the ellipsis of a box the edge cuts may, what is left of it is blank. So no row ever holds half a character, and every row is as wide as the window, whatever its labels are written in.

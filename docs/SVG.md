# The Picture In SVG

A graph drawn in SVG is what the [web page](PAGE.md) shows, and what the desktop app, VS Code, and the mobile app show in place of the terminal's picture, in a [reply](REPLIES.md#on-other-surfaces) and in a [mod's site](API.md#on-other-surfaces). Drawing it is `svgOf` in `graphlet/hooks/svg.ts`; a view's `vector`, in `graphlet/hooks/view.ts`, lays a graph out for a surface's room and draws it there.

## The Drawing

`svgOf` answers one SVG document of a graph laid out by [`layoutOf`](LAYOUT.md). It runs the way the layout runs, down or right. Each box stands across its layer where the layout has it, its middle on the column its links there leave and reach it by, a cell of the layout as many pixels as the caller says, and the layers stand one after another along, each as long as its longest box, `LAYER_GAP` apart: as tall as its tallest running down, and as wide as its widest running right. Below, down the drawing is along the layers and across is across them; running right, they are turned.

- A node is a rounded box in its tone's color, with its mark, its label on the lines the layout's box has it on, and its badge. A node put foremost has a border twice as heavy, and its words are bold. A label the layout cuts short, on its last line or, with the `labels` setting at `clip`, in its middle, has the whole of it as the box's title, which a surface may show as the pointer rests on it.
- A link is a curve with an arrowhead at the node it reaches, in its tone's color where it has one. Down the drawing it leaves the middle of a box's bottom and reaches the middle of a box's top. A link that runs back up is dashed, and uses the port beside the middle. A link past a layer runs through its lane there.
- A link between two nodes of one layer is an arc under the layer, and a link from a node to itself is a loop at the box's side.
- A link with no direction has no arrowhead and reaches the box itself, and between two layers it runs down the drawing from whichever of its nodes stands higher.
- A link between the same two boxes as one before it, running the same way down or up the drawing, runs `TWIN_STEP` farther aside for each: down the drawing farther left, back up farther right, under a layer in a deeper arc, and from a node to itself in a wider loop, so that two never lie on one line.
- A link's label, cut as the terminal cuts it, is written on its first stretch, at the middle of the curve out of the box it leaves, over a halo of the sheet's color so the line under it does not cut it, in the soft color of words, or in its link's tone. Where it would stand over a label written before it, it is moved down, a line at a time, until it does not. A link from a node to itself has no label written.
- A group's frame is a rounded box where the layout has it across, standing out along from its first and last layers, with the group's label at its top, under every link and node.

Every node is marked by its place in the graph, `n` and the place, and every link by the places of its two ends, `e` and each place, never by an id. Everything a graph says is escaped before it is written, and what no XML document may hold, such as a control character or half of a pair of surrogates, is left out, so that no label spoils the document.

## What Is Selected

The drawing may be given a selected node, as a site's is. Its box is bordered in the accent, with a second border inside it, and its words are bold. Every link that touches it is lit, in the accent, and so are the borders of the boxes at the other ends of those links. Everything else keeps its own color.

Where the person's `motion` setting is `flowing`, the lit links move, as [on the terminal](DRAWING.md#flowing): a lit link that runs one way, with no link running back between the same two nodes, runs beads toward the node it reaches, and every other lit link brightens and fades. Neither moves for a person whose system asks for less motion.

## As The Pointer Passes

With `isLighting`, the drawing has a rule for each node: while the pointer is over the node, or else while the keyboard's focus is on it, its links are lit in the accent, and every other link, and every node not at the other end of one of its links, is quieted, and stops pulsing. It is done in the drawing's style alone, with no script, so it works where a surface draws the SVG in a frame that runs none.

## Its Colors And Its Size

The colors are set once for a light scheme and once for a dark one, and the surface picks by the person's own setting.

The document is as large as what it draws: every box, lane, frame, frame title, and link label, and the points each curve passes through and is pulled toward, with `PAD` around them, all on a sheet with rounded corners and a dim border, in the color of the page, under the rest. Its `width` and `height` are that size in pixels, so a surface draws it at that size, or smaller where its room is narrower.

## On A Surface

A view's `vector` draws a graph whole, laid out as the view lays it out for the room, with a cell of the layout `SURFACE_CELL` pixels across a layer: running down, about the width of a character of a surface's code font, so that a graph laid out in a surface's columns is drawn about as wide as they are. It draws the selected node it is given, and moves its links as the view's `motion` says. The engine takes an `Svg` of no more than `MOST_SVG_CHARS` characters, so the drawing has the rules that light a node as the pointer passes where that leaves it short enough, and else it has none; where even that is too long, the view draws none, and the graph is drawn as plain text instead.

Beside the document, the view answers what the picture says for a reader who cannot see it, `altOf`: how many nodes and links the graph has, then each link by the labels of its two ends, with `→` where it runs one way and `—` where it runs no way, and its label after it in parentheses, and then each node no link joins. What would run past `MOST_ALT_CHARS` characters is counted instead: `; and 12 more`. A view's `order` is the graph's nodes in the order its picture is read, `orderOf` in `graphlet/hooks/window.ts`: its layers from the first, and each across.

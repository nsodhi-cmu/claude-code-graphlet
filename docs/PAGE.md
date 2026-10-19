# The Web Page

A click on `html ↗`, in the corner of a drawing's [foot](DRAWING.md#the-foot), in a pane or the band, or under a still picture in a reply or a tool's or command's row, opens the graph as a web page. Making the page is `graphlet/hooks/page.ts`, and writing it out and opening it is `openPage` in `graphlet/hooks/register.tsx`.

## The Page

`pageOf` answers one HTML document that draws the graph as an inline SVG. It is the terminal's layout, laid out by [`layoutOf`](LAYOUT.md) on one sheet in a room wide enough for all of it, and runs the way the terminal's picture runs, down or right. Each box stands across its layer where that layout has it, its middle on the column its links there leave and reach it by, a cell of the layout a `CELL` of the page, and the layers stand one after another along, each as long as its longest box, a gap apart: as tall as its tallest running down, and as wide as its widest running right. Below, down the page is along the layers and across is across them; running right, they are turned.

- A node is a rounded box in its tone's color, with its mark, its label wrapped as the terminal wraps it, and its badge. A node put foremost has a border twice as heavy, and its words are bold.
- A link is a curve with an arrowhead at the node it reaches, in its tone's color where it has one. Down the page it leaves the middle of a box's bottom and reaches the middle of a box's top. A link that runs back up is dashed, and uses the port beside the middle. A link past a layer runs through its lane there.
- A link between two nodes of one layer is an arc under the layer, and a link from a node to itself is a loop at the box's side.
- A link with no direction has no arrowhead and reaches the box itself, and between two layers it runs down the page from whichever of its nodes stands higher.
- A link between the same two boxes as one before it, running the same way down or up the page, runs `TWIN_STEP` farther aside for each: down the page farther left, back up farther right, under a layer in a deeper arc, and from a node to itself in a wider loop, so that two never lie on one line.
- A link's label, cut as the terminal cuts it, is written on its first stretch, at the middle of the curve out of the box it leaves, over a halo of the page's own color so the line under it does not cut it. Where it would stand over a label written before it, it is moved down, a line at a time, until it does not. A link from a node to itself has no label written.
- A group's frame is a rounded box where the layout has it across, standing out along from its first and last layers, with the group's label at its top, under every link and node.
- A node under the pointer, or with the keyboard's focus, is lit with its links and the nodes at their other ends, and the rest is quieted.

The colors are set once, for a light scheme and for a dark one, and the browser picks by the person's own setting.

The drawing fills the window under the title, and opens whole, in its middle: shrunk to fit where it is larger than the window, and at its own size where it is not, never larger. The wheel zooms it around the pointer, out as far as whole and in as far as `MOST_ZOOM` times its own size, and so does a pinch the browser hands the page as a turn of the wheel. A drag of the main button, or of one finger, moves it, as far as leaves half the window on the drawing; a pinch on a touch screen zooms the whole page, as the browser does. A double click shows it whole again, and so does a new size of the window.

The document is one file and fetches nothing: its style and its few lines of script are inline. Everything a graph says is escaped before it is written, and a node is named in the page only by its place in the graph, never by its id.

A graph with no nodes gives a page that says there is nothing to draw.

## Opening It

`openPage` writes the page into the system's temporary folder, `TMPDIR` or `TEMP` where either is set and `/tmp` where neither is, as `graphlet-<site>.html`, and so over the page it last wrote for that site, or for a graph in a reply as `graphlet-reply-<block>-<n>.html`, named for the reply block and the graph's place in it. It then runs the system's own opener on the file, trying each of `OPENERS` in turn, Linux's `xdg-open`, macOS's `open`, and Windows's `start` through `cmd`, each for at most `OPEN_TIMEOUT_MS`, until one exits with 0. A toast says the page was opened, or, where nothing opened it, where the file is.

The page is headed with the pane's id, or `reply`. It is a picture of the graph as it was when the corner was clicked, and does not follow the pane after that.

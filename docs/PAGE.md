# The Web Page

A click on `html ↗`, in the corner of a drawing's [foot](DRAWING.md#the-foot), opens the graph as a web page. Making the page is `graphlet/hooks/page.ts`, and writing it out and opening it is `openPage` in `graphlet/hooks/register.tsx`.

## The Page

`pageOf` answers one HTML document that draws the graph as an inline SVG. It has the layers and the order within them that the terminal's picture has, since both come from [`layersOf`](LAYERS.md), and places them its own way: each layer in the middle of the widest, its boxes side by side.

- A node is a rounded box in its tone's color, with its mark, its label wrapped as the terminal wraps it, and its badge.
- A link is a curve with an arrowhead at the node it reaches. Down the page it leaves the middle of a box's bottom and reaches the middle of a box's top. A link that runs back up is dashed, and uses the port beside the middle. A link past a layer runs through its lane there.
- A link between two nodes of one layer is an arc under the layer, and a link from a node to itself is a loop at the box's side.
- In an undirected graph a link has no arrowhead and reaches the box itself, and a link between two layers runs down the page from whichever of its nodes stands higher.
- A link's label, cut as the terminal cuts it, is written on its first stretch, at the middle of the curve out of the box it leaves, over a halo of the page's own color so the line under it does not cut it. Where it would stand over a label written before it, it is moved down, a line at a time, until it does not. A link from a node to itself has no label written.
- A node under the pointer, or with the keyboard's focus, is lit with its links and the nodes at their other ends, and the rest is quieted.

The colors are set once, for a light scheme and for a dark one, and the browser picks by the person's own setting.

The drawing fills the window under the title, and opens whole, in its middle: shrunk to fit where it is larger than the window, and at its own size where it is not, never larger. The wheel zooms it around the pointer, out as far as whole and in as far as `MOST_ZOOM` times its own size, and so does a pinch the browser hands the page as a turn of the wheel. A drag of the main button, or of one finger, moves it, as far as leaves half the window on the drawing; a pinch on a touch screen zooms the whole page, as the browser does. A double click shows it whole again, and so does a new size of the window.

The document is one file and fetches nothing: its style and its few lines of script are inline. Everything a graph says is escaped before it is written, and a node is named in the page only by its place in the graph, never by its id.

A graph with no nodes gives a page that says there is nothing to draw.

## Opening It

`openPage` writes the page into the system's temporary folder, `TMPDIR` or `TEMP` where either is set, as `graphlet-<pane>.html`, and so over the page it last wrote for that pane. It then runs the system's own opener on the file, trying each system's in turn: `xdg-open`, `open`, and `start`. A toast says the page was opened, or, where nothing opened it, where the file is.

The page is headed with the pane's id. It is a picture of the graph as it was when the corner was clicked, and does not follow the pane after that.

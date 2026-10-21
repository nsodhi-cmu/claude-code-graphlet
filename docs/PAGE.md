# The Web Page

A click on `html ↗`, in the corner of a drawing's [foot](DRAWING.md#the-foot), in a mod's site or in a reply, opens the graph as a web page. Making the page is `graphlet/hooks/page.ts`, and writing it out and opening it is `openPage` in `graphlet/hooks/register.tsx`.

## The Page

`pageOf` answers one HTML document that draws the graph as its [picture in SVG](SVG.md). It is the terminal's layout, laid out by [`layoutOf`](LAYOUT.md) on one sheet in a room wide enough for all of it, and runs the way the terminal's picture runs, down or right, a cell of the layout a `CELL` of the page across a layer. Nothing is selected on the page, and the node under the pointer, or else the one with the keyboard's focus, has its links lit, and every other link, and every node not at the other end of one of them, is quieted, as [the picture's](SVG.md#as-the-pointer-passes) are. The page's own background is the picture's sheet, in the picture's colors, a graph with no nodes too.

The drawing fills the window under the title, and opens whole, in its middle: shrunk to fit where it is larger than the window, and at its own size where it is not, never larger. The wheel zooms it around the pointer, out as far as whole and in as far as `MOST_ZOOM` times its own size, and so does a pinch the browser hands the page as a turn of the wheel. A drag of the main button, or of one finger, moves it, as far as leaves half the window on the drawing; a pinch on a touch screen zooms the whole page, as the browser does. A double click shows it whole again, and so does a new size of the window.

The document is one file and fetches nothing: its style and its few lines of script are inline, and the only address it names is the namespace of SVG. Everything a graph says is escaped before it is written, and a node is named in the page only by its place in the graph, never by its id.

A graph with no nodes gives a page that says there is nothing to draw.

## Opening It

`openPage` writes the page into the system's temporary folder, `TMPDIR` or `TEMP` where either is set and `/tmp` where neither is, as `graphlet-<site>.html`, and so over the page it last wrote for that site, or for a graph in a reply as `graphlet-reply-<block>-<n>.html`, named for the reply block and the graph's place in it. It then runs the system's own opener on the file, trying each of `OPENERS` in turn, Linux's `xdg-open`, macOS's `open`, and Windows's `start` through `cmd`, each for at most `OPEN_TIMEOUT_MS`, until one exits with 0. A toast says the page was opened, or, where nothing opened it, where the file is.

The page is headed with the site's id, or `reply`. It is a picture of the graph as it was when it was asked for, and does not follow the site after that.

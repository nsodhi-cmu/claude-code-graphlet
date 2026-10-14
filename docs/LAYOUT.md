# The Layout

The layout says where everything stands: a box a node, the boxes of a layer side by side on a shelf with the lanes of the links that pass through it, and between two shelves a channel the links cross in. It is `graphlet/hooks/layout.ts`, and it is worked out for a room's width alone, whatever window the graph is then seen through.

## Boxes

A box says its node's mark, its label, and its badge. A node that links to itself carries the sign of a loop, `↺`, before its badge.

A label too long for one line is wrapped, by `wrap`, at its spaces. A word a little longer than a line keeps a line to itself, so that a file's name is not broken for the sake of a few characters; a word longer than `WORD_COLUMNS` is broken after the last `/`, `-`, `_`, or `.` that fits a line, or with none, where the line ends. What is left after the last line a label may take is cut short there, and ends in an ellipsis. With the `labels` setting at `clip`, a label keeps to one line and is cut in its middle instead, so that a file's name keeps how it starts and how it ends.

A box is as wide as its widest line and no narrower than `BOX_COLUMNS`, which leaves its two ports apart; a label shorter than that is set in the middle. A box is as tall as its own label, and a shelf as tall as its tallest box. A shorter box stands at the shelf's top, and what leaves or reaches its bottom runs on down past the rows it leaves.

## Ports

A link meets a lane in its one column. Each face of a box, its top and its bottom, has a port for each bundle of links that leaves it, and a port for each bundle that reaches it, `PORT_STEP` apart across its middle; the links that leave a face of a directed graph's box are always one bundle. `dealPorts` orders a face's ports by where along their shelves the places at the links' other ends stand, so links from the left arrive on the left; of two that lead to the same place, the one with the flow is first. A box too narrow for its ports is widened. So a link back up arrives beside the links that leave, and links from different boxes into one box arrive at arrowheads of their own, or in an undirected graph at ticks of their own.

A link that crosses a channel leaves its box straight toward the port it is bound for, wherever the box reaches over that port clear of its corners and its other ports, and else by its own port. A link that leaves with others keeps clear of the columns beside their port, and in an undirected graph, where every port shows a tick, of the columns beside the face's other ports, so that two ticks never touch.

## Shelves

`layoutOf` seats the longest shelf first, in the middle of the columns it is laid out across, and then each other shelf against the one nearer it:

- A box goes as near as it can to where its ports stand over or under the ports of the boxes it is joined to. The boxes are pushed apart where they would overlap, and slid back together toward where they wanted to be.
- A lane then goes to the very column of the port it is joined to, and pushes aside the boxes in its way, so that a link runs straight through every shelf it passes.
- Last, the shelf moves a column either way where that stands more of it exactly over or under what it is joined to.

How wide a shelf is laid out is the `scroll` setting's to say. `pinned`: across the room's columns where it fits them, and across its own length where it is longer, alone from the left edge. `sheet`: every shelf across the longest.

## Channels

A channel is the rows between two shelves. The stretches of links that cross it are its wires, and so are the links between two nodes of the shelf above, which run under that shelf and back up to it. The last shelf has a channel under it only for those.

A wire that does not go straight across turns on one row of the channel, its track. A channel's rows are a row of the arrowheads that point up, when it has any, then a row a track, then a row of the arrowheads that point down, when it has any. An undirected graph has no arrowheads, so its channels are their tracks alone. A channel with no wires is one empty row.

### Tracks

Wires that share a track run into one line, which says that everything on it is joined. So wires share a track only as a bundle that says nothing false: the wires that leave one face, a fan, together with the fans of every other face whose wires reach the very same faces. Several boxes' links to one box alone are such a bundle, and so are two boxes that both link to the same two.

In an undirected graph, a line has no arrowheads to tell the boxes it leaves from the boxes it reaches, so a link between two nodes of one shelf is a bundle alone, with a port of its own on each of its boxes. A line then joins each box whose bottom it meets to each box whose top it meets, or, meeting only the bottoms of two boxes, is the one link between them.

`layTracks` gives each bundle a track.

- Two bundles share a track only where their runs do not meet.
- A bundle that comes down a column to its track goes above a bundle that goes down the same column from its own, so that the two never run into one line. Where bundles ask that of each other in a ring, one of them is not given it, and the two do share a stretch of that column.
- Of the bundles that may go on a track, the ones that cross the rest least from there go first.
- Where the two shelves of a channel are laid out across different columns, they slide apart under a window, and what does not meet as laid out may once they have slid. There no two bundles share a track, and each time the window moves the bundles are given their tracks again as the shelves now stand.

Wires of different bundles that cross are painted as one passing over the other, so that a junction always means joined.

With the `links` setting at `merged`, every wire of a channel that runs the one way, with the flow or against it, is one bundle on the one track, and a box has one port for it. That is shorter, and says less: which links are whose is told by selecting a node.

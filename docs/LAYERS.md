# Layers

A graph is drawn in layers: every node in a layer, a row of the drawing, or a column of a graph that runs right, and every edge running between the layers of its two nodes. Putting a graph in layers is `graphlet/hooks/layers.ts`.

## Reading A Graph

`readGraph` is lenient, since a graph is whatever another mod handed over.

- A node needs an `id` that no node before it has. One without is dropped.
- Text is made safe to draw: control characters and line breaks become spaces. A node with no label is called by its id.
- A `tone` that is none of the tones is dropped, and the node or the edge drawn plain; so is an edge's tone of `plain`, which is an edge's when it has none.
- A `priority` that is not a whole number is dropped, and so is one of 0, which is a node's when it has none. Which nodes are put foremost, `isForemost`, as [API.md](API.md#a-graph) tells, is settled for the whole graph as it is read, so a node keeps its heavy frame in a graph drawn in focus, which may leave out the node it was compared with.
- An edge runs one way unless its `isDirected` is `false`, or it has none and its graph's is `false`. Anything else there reads as running one way. A graph whose edges all run no way is undirected; a graph may have edges of both kinds.
- An edge is kept where both its ends are nodes of the graph, and an edge given again is kept once, as [API.md](API.md#a-graph) tells.
- A node is in the group its `group` names, where that is the id of a group the graph lists or of none of its nodes; a group it does not list is labelled by its id. A group needs an id that no group before it and no node has, and a group no node is in is left out.
- A graph that names its edges `links` is read the same.
- What is no graph at all reads as an empty one.
- At most `MOST_NODES` nodes and `MOST_EDGES` edges are read, 1000 and 2000, and what is past them is left out and counted: the nodes, and the edges that are past the most, or that join a node left out. A graph larger than that is slow to lay out, and no picture a person can follow.

## Which Layer A Node Stands In

Where every node names its `layer`, `ranksOf` keeps those, in their order, numbered from the top with none left empty.

Where any node leaves it out, every layer is worked out from the edges.

An undirected graph, every edge of it running no way, has no flow to follow. A node stands as many layers down as the fewest edges between it and the first node the graph names of those it is joined to, through any others: the graph spreads down, a layer an edge, from where it starts. Each part of the graph that no edge joins to the rest starts again at the top. So every edge joins two neighboring layers or two nodes of one layer, and a loop closes where its two sides meet, at a node or by an edge between two nodes of one layer, with nothing running back up. To choose where a graph starts, a mod names that node first.

A graph with any edge that runs one way runs down the way its edges do. An edge that runs no way is laid out as if it ran from the node it names first to the other, unless that would close a loop with the rest; then every such edge is laid out as running forward along an order the edges that run one way keep, so that no edge with no direction ever closes a loop, nor turns an edge that runs one way around. It is never drawn running up:

1. The edges that close a loop are found among the edges that run one way, two ways, and of the two, the edges are kept whose layers, laid out as the next steps say, leave the edges passing fewest layers by; where the two tie, those found the first way.
   - Following the edges from the nodes no edge reaches, and then from any node not yet reached, in the order the graph names them: an edge that leads back to a node still being followed closes a loop.
   - Eades, Lin and Smyth's order: the nodes are put in a row so that as few edges as can run backward along it. Over and over, each node with no edge out to a node left goes to the end of the row, and each node with no edge in from a node left goes next at its front; where neither is left, the node with the most edges out over edges in goes next, and of two that tie, the one the following reaches first. An edge that runs backward along the row closes a loop.

   Read the other way around, either set of edges leaves a graph with no loop. Following keeps a flow that returns to its start drawn from its start; the order keeps a graph of many loops from running its edges long.
2. A node then stands one layer under the lowest node with an edge to it.
3. A node with more edges below it than above it moves down to stand just over the nearest node its edges reach, which makes more edges shorter than longer.

So a directed graph runs down the drawing from where it starts, and the edge of a loop that runs back up is, where the loop is simple, the one that returns to where the loop was entered.

### Folding Into A Room

A graph in a reply is as wide as the reply, and the wheel over it scrolls the transcript, so its layers are folded into the room it has before anything else is laid out. A graph that runs right is never folded: it runs right only where it fits as it is. `layersOf` is then given a `Fold`: the columns a layer may take, how wide each node's box is, and the gap between two neighbors. A layer's width is its boxes and the gaps between them, a column for each lane that passes through it, and for each group it holds, the group's frame around the group's boxes, as wide as its label needs.

`folded` goes down the layers from the top. A layer too wide for the room gives up a node at a time until it fits, has one node left, or giving up any of those left would not make it narrower, the lanes its edges would then take past the layer being as wide as its box:

- A node given up goes into the layer under its own, and takes down with it the nodes that must stay under it: a node joined to it that stood lower than it, and would now stand no lower, goes to the layer under it, and so on from there. The rest stay where they are, so the nodes given up from a layer share the layer under it with the nodes that were there. Where the graph names its layers, every node of the layers under the fold goes down a layer with it, so that the named layers keep their order; but a node with no node in the layer under its own that is joined to it and stood lower than it sinks into that layer alone.
- The node given up first is the one whose edges to the nodes above would add fewest lanes past the layer, as `folded` reckons it: one where more than one of its edges reach nodes above, which may share a lane; where one does, none if an edge of the node it reaches already passes the layer, else one. Then the one with the fewest edges to nodes above it; then one that takes no node down with it; and of those, the one the graph names last, so a folded layer keeps the nodes named first, in a row in the order they were named. Since a node's edges share their lanes, the children of one node folded onto rows of their own are reached down one lane.
- A node with an edge that runs one way to a node of its own layer stays, so that no edge turns back up for the fold.

Each layer under a fold is then folded in turn. A node with many lanes past it, or a layer whose every node edges within it, may still be wider than the room, and so may a box widened for its ports, which the fold cannot know of; `layoutOf` then folds again into the room less what it overflowed by, up to `REFOLDS` times, and keeps the result where it fits the room or takes less room all told, its columns times its rows, so that a graph its frames keep wide is not folded down to a node a layer. A picture still too wide keeps the count of what is past its edge, as a pane's does. A graph of more than `FOLDED_NODES` nodes or `FOLDED_EDGES` edges is not folded at all, since folding it would take long.

## Stretches And Lanes

`layersOf` cuts every edge into stretches, each from a slot of one layer to a slot of the next. An edge between two neighboring layers is one stretch. An edge between layers farther apart passes a lane in each layer between, and has a stretch from each to the next. Edges share lanes, so that many edges far apart take few. In a layer, the edges of one kind that pass it the one way with one label and one tone, bound for the same node, share a lane, which carries what reaches that node from many: an edge joins it where it leaves its node, and the lane runs on to the node they are bound for. Of the edges that share no such lane anywhere, those from the same node share one, which carries what leaves that node for many and branches where each leaves it. An edge that shares with neither has a lane of its own. No lane says anything false: every edge it carries goes to the one node, or comes from it; and a lane from a node never feeds a lane that others reach, where their lines would meet. A stretch of an edge that runs up the drawing, against the flow, says so. An edge that runs no way never does: it runs down from whichever of its nodes stands higher. A lane carries edges of one kind, so a line of it says the same of every edge on it.

An edge between two nodes of one layer is no stretch. Those are kept apart, by layer.

## The Order Within A Layer

A layer starts in the order the graph names its nodes in, with its lanes after them. While any two stretches cross, the layers are ordered against their neighbors: on the way down each layer by the layer above it, and on the way back up each by the layer below, a slot going to the middle of the places of what it is joined to there. That is done `SWEEPS` times over, or until nothing crosses, and the ordering whose stretches cross least is the one kept, its crossings counted by `crossingsOf` as Barth, Jünger and Mutzel count them.

With nothing crossing, nothing is reordered, so the nodes of a layer stay in the order the graph names them in, but for keeping each group's together. The order never depends on what is selected or where the window stands.

Where the graph has groups, `together` keeps the slots of each group side by side in every ordering, where the group's own would stand on average, and a lane carries edges within one group or none, so the lanes of the edges within a group stand among its nodes. Last, `inOrder` puts the groups in one order across all the layers, by where each stands on average over the layers it is in, so that no two groups' frames cross.

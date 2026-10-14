# Layers

A graph is drawn in layers: every node in a row of the drawing, and every link running between the layers of its two nodes. Putting a graph in layers is `graphlet/hooks/layers.ts`.

## Reading A Graph

`readGraph` is lenient, since a graph is whatever another mod handed over.

- A node needs an `id` that no node before it has. One without is dropped.
- Text is made safe to draw: control characters and line breaks become spaces. A node with no label is called by its id.
- A `tone` that is none of the tones is dropped, and the node drawn plain.
- A graph is directed unless its `isDirected` is `false`. Anything else there reads as directed.
- A link is kept where both its ends are nodes of the graph, and once however many times it is given. In an undirected graph, that is once whichever way round it names its nodes.
- A link from a node to itself is kept. It is drawn as a sign in the node's box, not as a line.
- What is no graph at all reads as an empty one.
- At most `MOST_NODES` nodes and `MOST_LINKS` links are read, 500 of each, and what is past them is left out. A graph larger than that is no picture a person can follow, and is slow to lay out.

## Which Layer A Node Stands In

Where every node names its `layer`, `ranksOf` keeps those, in their order, numbered from the top with none left empty.

Where any node leaves it out, every layer is worked out from the links.

An undirected graph has no flow to follow. A node stands as many layers down as the fewest links between it and the first node the graph names of those it is joined to, through any others: the graph spreads down, a layer a link, from where it starts. Each part of the graph that no link joins to the rest starts again at the top. So every link joins two neighboring layers or two nodes of one layer, and a loop closes where its two sides meet, at a node or by a link between two nodes of one layer, with nothing running back up. To choose where a graph starts, a mod names that node first.

A directed graph runs down the way its links do:

1. The links that close a loop are found by following the links from the nodes nothing links to, and then from any node not yet reached, in the order the graph names them. A link that leads back to a node still being followed closes a loop. Read the other way around, those links leave a graph with no loop.
2. A node then stands one layer under the lowest node that links to it.
3. A node with more links below it than above it moves down to stand just over the nearest node it links to, which makes more links shorter than longer.

So a directed graph runs down the drawing from where it starts, and the one link of a loop that runs back up is the one that returns to where the loop was entered.

## Stretches And Lanes

`layersOf` cuts every link into stretches, each from a slot of one layer to a slot of the next. A link between two neighboring layers is one stretch. A link between layers farther apart has a lane in each layer it passes through, a slot of its own there, and a stretch from each to the next. A stretch of a link that runs up the drawing, against the flow, says so. In an undirected graph none does: a link runs down from whichever of its nodes stands higher.

A link between two nodes of one layer is no stretch. Those are kept apart, by layer.

## The Order Within A Layer

A layer starts in the order the graph names its nodes in, with its lanes after them. While any two stretches cross, the layers are ordered against their neighbors: on the way down each layer by the layer above it, and on the way back up each by the layer below, a slot going to the middle of the places of what it is joined to there. That is done a few times over, and the ordering whose stretches cross least is the one kept.

With nothing crossing, nothing is reordered, so the nodes of a layer stay in the order the graph names them in. The order never depends on what is selected or where the window stands.

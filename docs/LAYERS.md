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

1. The links that close a loop are found two ways, and of the two, the links are kept whose layers, laid out as the next steps say, leave the links passing fewest layers by; where the two tie, those found the first way.
   - Following the links from the nodes nothing links to, and then from any node not yet reached, in the order the graph names them: a link that leads back to a node still being followed closes a loop.
   - Eades, Lin and Smyth's order: the nodes are put in a row so that as few links as can run backward along it. Over and over, each node that links to nothing left goes to the end of the row, and each node nothing left links to goes next at its front; where neither is left, the node that links out to most over what links into it goes next, and of two that tie, the one the following reaches first. A link that runs backward along the row closes a loop.

   Read the other way around, either set of links leaves a graph with no loop. Following keeps a flow that returns to its start drawn from its start; the order keeps a graph of many loops from running its links long.
2. A node then stands one layer under the lowest node that links to it.
3. A node with more links below it than above it moves down to stand just over the nearest node it links to, which makes more links shorter than longer.

So a directed graph runs down the drawing from where it starts, and the link of a loop that runs back up is, where the loop is simple, the one that returns to where the loop was entered.

### Folding Into A Room

A graph drawn still, in a reply, cannot scroll, so its layers are folded into the room it has before anything else is laid out. `layersOf` is then given a `Fold`: the columns a layer may take, how wide each node's box is, and the gap between two neighbors. A layer's width is its boxes and the gaps between them, and a column for each lane that passes through it.

`folded` goes down the layers from the top. A layer too wide for the room gives up a node at a time until it fits, or has one node left:

- A node joined to nothing in the layer under its own sinks into that layer. Otherwise a layer is put in under its own, and the nodes it gives up go there.
- Of the nodes that may go, the one joined to the fewest nodes above it goes first, since such a link may take a lane past the layer it leaves; and of those, the one the graph names last, so a folded layer keeps the nodes named first, in a row in the order they were named.
- In a directed graph, a node that links to a node of its own layer stays, so that no link turns back up for the fold.

Each layer under a fold is then folded in turn. A node with many lanes past it, or a layer whose every node links within it, may still be wider than the room; such a picture keeps the count of what is past its edge, as a pane's does.

## Stretches And Lanes

`layersOf` cuts every link into stretches, each from a slot of one layer to a slot of the next. A link between two neighboring layers is one stretch. A link between layers farther apart passes a lane in each layer between, and has a stretch from each to the next. The links bound the same way for the same node share their lanes: a layer has one lane for all those that pass through it, which carries them all, a link joining it where it leaves its node and the lane running on down to the node they are bound for. So a node many links reach from far up is reached down one lane, not a lane a link, and a lane says nothing false, since every link it carries goes to the one node. A stretch of a link that runs up the drawing, against the flow, says so. In an undirected graph none does: a link runs down from whichever of its nodes stands higher.

A link between two nodes of one layer is no stretch. Those are kept apart, by layer.

## The Order Within A Layer

A layer starts in the order the graph names its nodes in, with its lanes after them. While any two stretches cross, the layers are ordered against their neighbors: on the way down each layer by the layer above it, and on the way back up each by the layer below, a slot going to the middle of the places of what it is joined to there. That is done a few times over, and the ordering whose stretches cross least is the one kept.

With nothing crossing, nothing is reordered, so the nodes of a layer stay in the order the graph names them in. The order never depends on what is selected or where the window stands.

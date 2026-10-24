/** How a node is painted. A tone is a meaning, and the surface's theme gives each its color. */
export type GraphletTone = 'plain' | 'dim' | 'note' | 'good' | 'warn' | 'bad'

/** One node of a graph. */
export type GraphletNode = {
  /** Unique within the graph. */
  id: string
  /** What its box says. */
  label: string
  /** A sign drawn before the label. */
  mark?: string
  /** How the mark and the label are painted; `plain` when left out. */
  tone?: GraphletTone
  /** A few characters drawn dim after the label: a count, a tag. */
  badge?: string
  /**
   * The layer the node stands in, counted from the first, at the top, or at
   * the left of a graph that runs right. Left out on
   * any node of a graph, graphlet works the layers out from the edges.
   */
  layer?: number
  /**
   * A whole number for how much the graph is about the node; 0 when left
   * out. A priority matters as it compares with the other nodes' and with 0.
   * The nodes of the highest priority, where it is above 0 and above another
   * node's, are drawn with heavy borders; and the layout keeps the edges of
   * nodes of higher priority straighter where that leaves it weighing no
   * more in rows and bent edges.
   */
  priority?: number
  /** The id of the group the node is drawn in, framed with the group's other nodes. Left out, it is in none. */
  group?: string
}

/**
 * A set of nodes drawn together in a frame, the nodes that name it as their
 * `group`: a tier of services, a package of files, a phase of states. A
 * group holds nodes, not groups.
 */
export type GraphletGroup = {
  /** Unique among the graph's groups and its nodes. */
  id: string
  /** What its frame says, and its box where it is collapsed. Left out, its id. */
  label?: string
  /** How its frame is painted; dim when left out. */
  tone?: GraphletTone
  /**
   * Whether the group is drawn collapsed, as one box that stands for all it
   * holds, until the person or the mod opens it in a site with `collapse`.
   * Left out, it is drawn open, in its frame.
   */
  isCollapsed?: boolean
}

/** An edge between two nodes, by their ids: from one to the other, where it runs one way. */
export type GraphletEdge = {
  from: string
  to: string
  /** A few words written on the edge, where it leaves the node it is drawn from. */
  label?: string
  /**
   * How the edge's line, its arrowhead, and its label are painted where it
   * is not lit, as a node's tone paints the node: an edge that fails `bad`, a
   * path a mod would have followed `note`. Left out, or `plain`, the line is
   * dim. An edge of one tone never shares a line with an edge of another.
   */
  tone?: GraphletTone
  /**
   * Whether the edge runs from one node to the other, drawn with an arrowhead.
   * `false`, it only joins its two nodes, whichever it names first. Left out,
   * it is as its graph says.
   */
  isDirected?: boolean
}

/**
 * Which way a graph runs: `down`, its layers one under another, or `right`,
 * its layers side by side, each a column of boxes.
 */
export type GraphletDirection = 'down' | 'right'

/** A graph. Its edges may run in a loop. */
export type GraphletGraph = {
  nodes: GraphletNode[]
  edges: GraphletEdge[]
  /** The groups its nodes are drawn in. A node may name a group not listed here, which is then labelled by its id. */
  groups?: GraphletGroup[]
  /**
   * Which way the graph runs. Left out, graphlet runs it down, or right
   * where that fits its room's columns in half the rows or fewer, or fits
   * the room whole where running down does not.
   */
  direction?: GraphletDirection
  /**
   * Whether an edge that does not say runs from one node to the other. Left
   * out, it does. `false`, such an edge only joins its two nodes.
   */
  isDirected?: boolean
}

/** A step of the selection, as the arrow keys name it. */
export type GraphletMove = 'left' | 'right' | 'up' | 'down'

/** A size in a surface's cells. */
export type GraphletSize = { columns: number; rows: number }

/** What a site is to hold. */
export type GraphletShow = {
  /**
   * The site the graph is drawn in, by the id its owner's `ui.render` hook
   * sees as `e.requestId`: a pane's, the band's above the prompt, a tool
   * result's row, or a command output's row. Each draws it whole, through
   * a window.
   */
  site: string
  graph: GraphletGraph
  /** The room the drawing may take, in cells. */
  columns: number
  rows: number
  /**
   * The node drawn as selected. Left out, the one the person last picked, or
   * the first the graph names of those of the highest priority. A node in a
   * collapsed group is drawn as its group's box selected.
   */
  selected?: string
}

/** What was drawn for a site. */
export type GraphletShown = {
  /** The rows the drawing takes, never more than it was given. */
  rows: number
  /** The node drawn as selected, or the collapsed group whose box is; null in a graph with no nodes. */
  selected: string | null
}

/** How far to scroll a graph: by cells, or by turns of the wheel. */
export type GraphletScroll = { site: string; by: number | { x: number; y: number } }

/**
 * What graphlet adds to `$`. A mod that lists graphlet under `dependencies`
 * calls these from its own hooks, and hooks `graphlet.select`,
 * `graphlet.open`, `graphlet.collapse`, and `graphlet.key` to hear what the
 * person did.
 */
export type Graphlet = {
  /**
   * The size of a graph's drawing in a room `columns` wide and as tall as it
   * needs: the rows it takes, and the columns it is laid out across, its
   * widest layer's running down and all its layers' running right, which are
   * more than the room's when it scrolls sideways.
   */
  measure(input: { graph: GraphletGraph; columns: number }): Promise<GraphletSize>
  /**
   * The graph as plain text: all of its still picture, drawn with nothing
   * selected and its edges kept separate, folded into a room `columns` wide,
   * however wide that leaves it, a line a row with no blanks at its end. For
   * what a tool hands back to the model, or a file.
   */
  text(input: { graph: GraphletGraph; columns: number }): Promise<string>
  /**
   * Says what a site holds. The site's own `ui.render` hook calls this and
   * then `next(e)`, which resolves to the drawing, for it to place among its
   * own elements. The band above the prompt, which every mod shares, is
   * drawn only on a render where this was called.
   */
  show(input: GraphletShow): Promise<GraphletShown>
  /** The node a move from the selected one lands on in the graph a site holds; null when the site holds none. */
  step(input: { site: string; move: GraphletMove }): Promise<string | null>
  /** Scrolls the graph a site holds. A turn of the wheel reaches the site, whose owner passes it on. */
  scroll(input: GraphletScroll): Promise<void>
  /**
   * Selects a node, or the box of a collapsed group, by its id. Graphlet
   * calls this itself when the person clicks a node or moves with the arrow
   * keys, so a hook on `graphlet.select` hears it. A
   * site whose owner gives `show` no `selected` draws the node this was last
   * called with.
   */
  select(input: { site: string; node: string }): Promise<void>
  /**
   * Does nothing. Graphlet calls it when the person opens a node, by return
   * on the selected one or a double click on its box, for a hook on
   * `graphlet.open` to answer: the act a mod hosts a graph for, such as
   * going to the file a node stands for. Those on the box of a collapsed
   * group open the group instead, with `collapse`.
   */
  open(input: { site: string; node: string }): Promise<void>
  /**
   * Collapses a group of the graph a site holds into one box, or opens it
   * again. Graphlet calls this itself when the person does either, so a hook
   * on `graphlet.collapse` hears it. A site draws a group as this was last
   * called for it there, and else as the group's `isCollapsed` says.
   */
  collapse(input: { site: string; group: string; isCollapsed: boolean }): Promise<void>
  /**
   * Does nothing. Graphlet calls it with each key pressed over a graph that
   * it has no use for itself, and the node selected as it was pressed, for a
   * hook on `graphlet.key` to answer.
   */
  key(input: { site: string; key: string; selected: string | null }): Promise<void>
}

declare module 'claude-code' {
  interface EngineInterface {
    graphlet: Graphlet
  }
}

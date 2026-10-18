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
   * The layer the node stands in, counted down from the top one. Left out on
   * any node of a graph, graphlet works the layers out from the links.
   */
  layer?: number
  /**
   * A whole number for how much the graph is about the node; 0 when left
   * out. A priority matters as it compares with the other nodes' and with 0.
   * The nodes of the highest priority, where it is above 0 and above another
   * node's, are drawn with heavy borders; and the layout keeps the links of
   * nodes of higher priority straighter where that leaves it weighing no
   * more in rows and bent links.
   */
  priority?: number
}

/** A link between two nodes, by their ids: from one to the other, where it runs one way. */
export type GraphletLink = {
  from: string
  to: string
  /** A few words written on the link, where it leaves the node it is drawn from. */
  label?: string
  /**
   * How the link's line, its arrowhead, and its label are painted where it
   * is not lit, as a node's tone paints the node: a link that fails `bad`, a
   * path a mod would have followed `note`. Left out, or `plain`, the line is
   * dim. A link of one tone never shares a line with a link of another.
   */
  tone?: GraphletTone
  /**
   * Whether the link runs from one node to the other, drawn with an arrowhead.
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

/** A graph. Its links may run in a loop. */
export type GraphletGraph = {
  nodes: GraphletNode[]
  links: GraphletLink[]
  /**
   * Which way the graph runs. Left out, graphlet runs it down, or right
   * where that fits its room's columns in half the rows or fewer, or fits
   * the room whole where running down does not.
   */
  direction?: GraphletDirection
  /**
   * Whether a link that does not say runs from one node to the other. Left
   * out, it does. `false`, such a link only joins its two nodes.
   */
  isDirected?: boolean
}

/** A step of the selection, as the arrow keys name it. */
export type GraphletMove = 'left' | 'right' | 'up' | 'down'

/** A size in a surface's cells. */
export type GraphletSize = { columns: number; rows: number }

/** What a pane is to hold. */
export type GraphletShow = {
  /** The pane the graph is drawn in: the id it was opened with. */
  pane: string
  graph: GraphletGraph
  /** The room the drawing may take, in cells. */
  columns: number
  rows: number
  /** The node drawn as selected. Left out, the one the person last picked, or the first the graph names of those of the highest priority. */
  selected?: string
}

/** What was drawn for a pane. */
export type GraphletShown = {
  /** The rows the drawing takes, never more than it was given. */
  rows: number
  /** The node drawn as selected; null in a graph with no nodes. */
  selected: string | null
}

/** How far to scroll a graph: by cells, or by turns of the wheel. */
export type GraphletScroll = { pane: string; by: number | { x: number; y: number } }

/**
 * What graphlet adds to `$`. A mod that lists graphlet under `dependencies`
 * calls these from its own hooks, and hooks `graphlet.select`,
 * `graphlet.open`, and `graphlet.key` to hear what the person did.
 */
export type Graphlet = {
  /**
   * The size of a graph's drawing in a room `columns` wide and as tall as it
   * needs: the rows it takes, and the columns its widest layer is laid out
   * across, which are more than the room's when it scrolls sideways.
   */
  measure(input: { graph: GraphletGraph; columns: number }): Promise<GraphletSize>
  /**
   * Says what a pane holds. The pane's own `ui.render` hook calls this and
   * then `next(e)`, which resolves to the drawing, for it to place among its
   * own elements.
   */
  show(input: GraphletShow): Promise<GraphletShown>
  /** The node a move from the selected one lands on in the graph a pane holds; null when the pane holds none. */
  step(input: { pane: string; move: GraphletMove }): Promise<string | null>
  /** Scrolls the graph a pane holds. A turn of the wheel reaches the pane, whose owner passes it on. */
  scroll(input: GraphletScroll): Promise<void>
  /**
   * Selects a node. Graphlet calls this itself when the person clicks a node
   * or moves with the arrow keys, so a hook on `graphlet.select` hears it. A
   * pane whose owner gives `show` no `selected` draws the node this was last
   * called with.
   */
  select(input: { pane: string; node: string }): Promise<void>
  /**
   * Does nothing. Graphlet calls it when the person opens a node, by return
   * on the selected one or a double click on its box, for a hook on
   * `graphlet.open` to answer: the act a mod hosts a graph for, such as
   * going to the file a node stands for.
   */
  open(input: { pane: string; node: string }): Promise<void>
  /**
   * Does nothing. Graphlet calls it with each key pressed over a graph that
   * it has no use for itself, and the node selected as it was pressed, for a
   * hook on `graphlet.key` to answer.
   */
  key(input: { pane: string; key: string; selected: string | null }): Promise<void>
}

declare module 'claude-code' {
  interface EngineInterface {
    graphlet: Graphlet
  }
}

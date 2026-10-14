import type { GraphletNode } from '../types'
import { readGraph } from '../hooks/layers'
import type { Graph } from '../hooks/layers'

/** A graph of nodes labelled by their ids, with a link for each pair. */
export const graphOf = (ids: string[], links: Array<[from: string, to: string]>, rest: Partial<GraphletNode> = {}): Graph =>
  readGraph({ nodes: ids.map(id => ({ id, label: id, ...rest })), links: links.map(([from, to]) => ({ from, to })) })

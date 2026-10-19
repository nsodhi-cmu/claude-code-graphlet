import { sizeOf } from './draw'

// The tips graphlet shows now and then at the end of the hint line under the
// prompt: what each says, how often it is picked against the others, and
// when it is true to say.

/** What a tip may depend on: whether Claude is told it can draw graphs, whether a graph has been drawn this session, whether the terminal reports a click, and the cells the tip may take. */
export type Moment = { isDrawingReplies: boolean; hasGraph: boolean; isClickable: boolean; columns: number }

/** A tip: what it says, how often it is picked against the others that are true at the moment, and whether it is true at one. */
type Tip = { text: string; weight: number; isTrue: (moment: Moment) => boolean }

/** One reply in this many, on average, is followed by a tip. */
export const TIP_ODDS = 5

/** Every tip graphlet shows. */
export const TIPS: readonly Tip[] = [
  { text: 'Ask Claude Code to graph how things connect, powered by graphlet', weight: 3, isTrue: moment => moment.isDrawingReplies },
  { text: 'Building a mod? Use graphlet as a dependency to draw graphs', weight: 1, isTrue: () => true },
  { text: 'Graphs can group nodes and label links, powered by graphlet', weight: 2, isTrue: moment => moment.hasGraph },
  { text: 'Graphs can be directed, undirected, or both, powered by graphlet', weight: 2, isTrue: moment => moment.hasGraph },
  { text: 'Use /config to change how graphlet draws graphs', weight: 2, isTrue: moment => moment.hasGraph },
  { text: 'Click a graph, then use the arrows to move, space to fold, / to find', weight: 2, isTrue: moment => moment.hasGraph && moment.isClickable },
  { text: 'Click copy under a graph to paste it anywhere as text', weight: 1, isTrue: moment => moment.hasGraph && moment.isClickable },
  { text: 'Click html ↗ under a graph to see a big one whole in your browser', weight: 1, isTrue: moment => moment.hasGraph && moment.isClickable },
]

/** The tip a roll of the dice in [0, 1) lands on, of those true at the moment and short enough for it, each as likely as its weight: none where none is. */
export function tipOf(moment: Moment, roll: number): string | undefined {
  const fitting = TIPS.filter(tip => tip.isTrue(moment) && sizeOf(tip.text) <= moment.columns)
  let left = Math.min(Math.max(roll, 0), 1) * fitting.reduce((sum, tip) => sum + tip.weight, 0)
  return (fitting.find(tip => (left -= tip.weight) < 0) ?? fitting.at(-1))?.text
}

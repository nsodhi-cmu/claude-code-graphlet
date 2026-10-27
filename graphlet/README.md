# graphlet

graphlet is a **mod** that draws graphs inside Claude Code!

1. graphlet gives Claude Code the ability to draw graphs in its replies. Try asking Claude to:
   - sketch your system's architecture
   - trace how a bug got from one function to the crash
   - map which files in this repository import which

2. graphlet can also be used as a dependency for other mods that wish to render graphs.

graphlet adds one section to Claude's system prompt, which the Graphs in replies setting turns off, and reads Claude's replies to draw the graphs in them. When you ask, it copies a graph to your clipboard, or writes it as a web page to `/tmp/graphlet.html` and opens that file in your browser with your system's opener: `xdg-open` on Linux, `open` on macOS. It makes no network requests and sends nothing anywhere.

View the source code and learn more on the [graphlet repository](https://github.com/nsodhi-cmu/claude-code-graphlet).

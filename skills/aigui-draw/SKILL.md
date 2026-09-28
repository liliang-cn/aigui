---
name: aigui-draw
description: Use when an answer would be clearer as a picture than as text — numbers that want a chart, a process or architecture that wants a diagram, a formula, a 3D shape or layout, an orbit or collision, a molecule, or a set of metrics that wants a dashboard — and the aigui MCP tools (aigui_guide, aigui_render, aigui_open) are available. Not for writing code that integrates the @ai-gui SDK; that is the aigui skill.
---

# Drawing with AIGUI

Claude Code's terminal shows text. The `aigui` MCP server draws for you: it takes ordinary markdown with AIGUI blocks in it and returns PNGs, or opens a page in the user's browser where the same blocks are live.

## When to draw

Draw when the picture carries the answer: comparing numbers, showing a trend, a flow with branches, a system's parts and how they connect, a formula worth typesetting, a 3D arrangement, an orbit, a molecule's shape, a set of KPIs. Do not draw what a sentence or a short table already says, and never draw instead of answering — the prose answer comes first, the picture supports it.

## How

1. **Look up the syntax** with `aigui_guide`. Call it with no arguments once to see the blocks, then with the names you will use — `{"blocks": ["chart", "mermaid"]}`. Do this before the first block of each kind in a session; the rules are specific (most blocks take conditions and compute the results themselves) and guessing a field gets the block refused.
2. **Pick the output.**
   - `aigui_render` — PNGs, returned to you and saved to disk. For one or a few pictures inside a conversation. Draws chart, mermaid, maths, tables, bigscreen, dashboard, scene, gravity and molecule.
   - `aigui_open` — one HTML page, opened in the browser. For an answer that is mostly visual, for anything worth exploring (turning a 3D scene or molecule, hovering a chart, watching a wall or an orbit animate), and for the page-only blocks: graph, solid, function, optics, motion, physics, figure, quote and the rest.
3. **Look at what came back.** `aigui_render` returns the images to you: check the picture says what you meant before you describe it. If a block could not be drawn, the result says so — fix its JSON against the guide and try again rather than telling the user it worked.
4. **Tell the user where it is.** Give the file path or the page URL from the result. In a terminal they cannot see the image inline.

## Rules that save a round trip

- Use only numbers you actually have — from the conversation, a file you read, a command you ran. A chart of invented figures looks like evidence.
- One block per fence, valid JSON inside, the fence name on the opening line: ` ```chart `, then the JSON, then ` ``` `.
- For a dashboard of several metrics use one ` ```bigscreen ` block with panels rather than several charts; give it `width` 1100 in `aigui_render`.
- For a molecule in 3D write SMILES with `"view": "3d"`; never write a Molfile from memory.
- If `aigui_render` reports that no browser could start, relay its advice and use `aigui_open` meanwhile.

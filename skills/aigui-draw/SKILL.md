---
name: aigui-draw
description: Use when an answer would be clearer as a picture than as text — numbers that want a chart, a process or architecture that wants a diagram, a formula, a 3D shape or layout, an orbit or collision, a molecule, or a set of metrics that wants a dashboard — and the aigui MCP tools (aigui_guide, aigui_render, aigui_open) are available. Not for writing code that integrates the @ai-gui SDK; that is the aigui skill.
---

# Drawing with AIGUI

Claude Code's terminal shows text. The `aigui` MCP server draws for you: it takes ordinary markdown with AIGUI blocks in it and returns PNGs, or opens a page in the user's browser where the same blocks are live.

## When to draw

Draw when the picture carries the answer: comparing numbers, showing a trend, a flow with branches, a system's parts and how they connect (a cluster, a network, storage — and a process over it, like a write or a failover: use `topology`, whose steps play in the page), a formula worth typesetting, a 3D arrangement, an orbit, a molecule's shape, a set of KPIs. Do not draw what a sentence or a short table already says, and never draw instead of answering — the prose answer comes first, the picture supports it.

## How

1. **Look up the syntax** with `aigui_guide`. Call it with no arguments once to see the blocks, then with the names you will use — `{"blocks": ["chart", "mermaid"]}`. Do this before the first block of each kind in a session; the rules are specific (most blocks take conditions and compute the results themselves) and guessing a field gets the block refused.
2. **Pick the output.** In Claude Code the person is reading a terminal, which shows no images — so the page is the default.
   - `aigui_open` — **the default.** One HTML page, opened in the user's browser, where charts can be hovered, 3D scenes and molecules turned, walls and orbits animate. Required for the page-only blocks: graph, solid, function, optics, motion, physics, figure, quote and the rest.
   - `aigui_render` — PNGs, returned to you, saved to disk, and (from the plugin) opened in the user's image viewer. Use it when the user wants an image file, or when you need to check a picture yourself before showing it. Draws chart, mermaid, maths, tables, bigscreen, dashboard, scene, gravity, topology and molecule.
3. **Look at what came back.** `aigui_render` returns the images to you: check the picture says what you meant before you describe it. Both tools also look the drawing over in a headless browser and list what a reader would trip over on lines starting `!` — labels on top of each other, text cut off or too small, a pie of slivers, more points than the panel can show. Fix the block those lines name and draw again; do not present a picture with `!` lines as finished. If a block could not be drawn, the result says so — fix its JSON against the guide and try again rather than telling the user it worked.
4. **Change it without starting over.** To fix a number, a panel or a step in a page you wrote, use `aigui_edit` with find-and-replace on its markdown — quote the text exactly and include enough of it to occur once — rather than sending the whole answer to `aigui_open` again. To hand the user a file to send or attach, `aigui_export` saves the page as PNG or PDF.
5. **Tell the user where it is.** Say it is open, and give the file path or page URL from the result so they can find it again. If the result does not say it was opened, they have not seen it: give the path and say so.

## Rules that save a round trip

- Use only numbers you actually have — from the conversation, a file you read, a command you ran. A chart of invented figures looks like evidence.
- One block per fence, valid JSON inside, the fence name on the opening line: ` ```chart `, then the JSON, then ` ``` `.
- For a dashboard of several metrics use one ` ```bigscreen ` block with panels rather than several charts; give it `width` 1100 in `aigui_render`.
- For a molecule in 3D write SMILES with `"view": "3d"`; never write a Molfile from memory.
- If `aigui_render` reports that no browser could start, relay its advice and use `aigui_open` meanwhile.

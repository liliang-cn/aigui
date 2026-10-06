# img-view

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that shows pictures in a pane beside the conversation.

```text
/plugin marketplace add liliang-cn/aigui
/plugin install img-view@aigui
```

Pictures arrive on their own:

- every drawing [AIGUI](https://github.com/liliang-cn/aigui) makes, with the problems its checks found;
- an image file Claude reads or writes;
- `/img <path>` for any image by hand; `/img` alone opens the pane.

`p` and `n` step through them, `o` opens the file in the system viewer.

## How it draws

| Where | What you see |
| --- | --- |
| kitty, Ghostty, iTerm2, WezTerm | the picture's own pixels (kitty graphics protocol) |
| any other terminal | colour block art: each cell holds 2×2 pixels, split by the quadrant glyph that fits them best |
| desktop app, VS Code, mobile | the picture, as an image |

Block art needs the picture scaled and decoded: `sips` on macOS, ImageMagick (`magick`) elsewhere. It shows shapes and colours well and small text poorly — for a sharp picture use a terminal from the first row, or press `o`.

`IMG_VIEW=image` or `IMG_VIEW=blocks` overrides the terminal guess.

Mods are an early-access Claude Code feature; this one needs a Claude Code build that loads them.

## Develop

```sh
claude plugin validate mods/img-view
claude plugin test mods/img-view
claude --plugin-dir mods/img-view
```

MIT

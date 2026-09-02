---
"@ai-gui/plugin-ui": patch
---

`@ai-gui/plugin-ui`'s tone colours are actually overridable now.

0.35.0 introduced `--aigui-ui-positive` / `--aigui-ui-warning` / `--aigui-ui-critical` and documented them as a host seam, but shipped their defaults on plain attribute selectors. The plugin's stylesheet is injected when the plugin loads, after the host's own has been parsed, so an override written at the same specificity lost on order alone — and the dark default, `[data-aigui-ui][data-aigui-ui-theme="dark"]`, matched exactly the doubled selector a host reaches for when it notices the first attempt did nothing. A host that reported a theme could not change these colours at all.

Every default is now declared inside `:where()`, which contributes no specificity, so writing the property anywhere wins.

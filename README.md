# Newsprint Paragraphs
Optional companion for [Newsprint by Camus](https://github.com/CamusZ11/obsidian-newsprint). It displays top-level prose soft breaks as separately spaced paragraphs, for vaults that keep Markdown compact without blank separators.
## Install
Download `main.js` and `manifest.json` from the [latest release](https://github.com/CamusZ11/obsidian-newsprint-paragraphs/releases/latest). Put them in `<vault>/.obsidian/plugins/newsprint-paragraphs/`, reload Obsidian and enable **Newsprint Paragraphs** in Settings → Community plugins. Community directory submission is pending; this is currently a manual GitHub installation.
Activate **Newsprint by Camus**. The helper uses the theme's CSS marker; it does nothing when another theme is active. The theme must be installed separately. Style Settings is optional.
## Behavior
The helper spaces top-level prose paragraphs and separates standalone image lines inside top-level quotes. Other quote breaks, inline images, lists, callouts, tables and code retain their line-break semantics. A deliberately inserted hard break in top-level prose is also displayed as a paragraph break; disable the plugin if your notes depend on that distinction. Inline links and emphasis remain intact. Existing paragraph nodes are preserved for Obsidian's virtual renderer.
Switching theme or disabling the plugin rebuilds Reading views using Obsidian's public preview API. The helper does not write notes, modify settings, make network requests, collect data, or install dependencies.
## Compatibility
Minimum Obsidian 1.10.6. Verified on macOS / Obsidian 1.13.7. Uses browser DOM and Obsidian public APIs; mobile and Windows are supported by the implementation but have not been visually tested.
## 中文
适合正文段落之间不留空行的笔记。仅改变阅读时的显示，不改写笔记；必须配合 Newsprint by Camus 主题。顶层引用内的独立图片前后留出段距；普通引用换行、行内图片、列表、提示框、表格与代码保留原来的分行。顶层正文中的手动硬换行也会显示为段落，请按你的写作习惯决定是否启用。
## 1.0.2
Separate standalone images from neighboring text inside top-level quotes. Pair with Newsprint by Camus 1.0.6 for consistent spacing in Reading view and Live Preview.
## License
MIT, see [LICENSE](LICENSE).

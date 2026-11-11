const { Plugin } = require("obsidian");

// Break only around a line whose only meaningful node is an image.
function quoteImageBreaks(nodes) {
  const lines = [[]];
  const breaks = [];
  for (const node of nodes) {
    if (node.nodeName === "BR") {
      breaks.push(node);
      lines.push([]);
    } else if (node.nodeType === 1 || node.textContent.trim()) {
      lines.at(-1).push(node);
    }
  }
  const isImage = (line) => {
    if (line.length !== 1) return false;
    const node = line[0];
    if (node.matches?.(".image-embed, img")) return true;
    // Obsidian may resolve a local image after this postprocessor runs.
    return node.matches?.(".internal-embed[src]") &&
      /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(node.getAttribute("src"));
  };
  return new Set(breaks.filter((_, i) =>
    lines[i].length && lines[i + 1].length && (isImage(lines[i]) || isImage(lines[i + 1]))
  ));
}

module.exports = class NewsprintParagraphs extends Plugin {
  onload() {
    this.registerMarkdownPostProcessor((element) => {
      if (getComputedStyle(element.ownerDocument.body).getPropertyValue("--newsprint-theme").trim() !== "1") return;
      this.splitProse(element);
    });
    this.registerEvent(this.app.workspace.on("css-change", () => this.refreshReadingViews()));
    this.app.workspace.onLayoutReady(() => this.refreshReadingViews());
  }

  splitProse(element) {
    for (const paragraph of element.querySelectorAll("p")) {
      // Preserve structured content and normal line breaks inside quotes.
      const quote = paragraph.parentElement.closest("blockquote");
      if (paragraph.closest("li, .callout, td, th, pre, .metadata-container")) continue;
      if (quote) {
        if (quote.parentElement.closest("blockquote") || paragraph.parentElement !== quote || (quote !== element && quote.parentElement !== element)) continue;
      } else if (paragraph.parentElement !== element) continue;
      const nodes = Array.from(paragraph.childNodes);
      const breaks = quote ? quoteImageBreaks(nodes) : new Set(nodes.filter((node) => node.nodeName === "BR"));
      if (!breaks.size) continue;

      const document = paragraph.ownerDocument;
      const fragment = document.createDocumentFragment();
      let part = document.createElement("span");
      part.className = "np-paragraph";
      const appendPart = () => {
        if (part.childNodes.length) fragment.append(part);
        part = document.createElement("span");
        part.className = "np-paragraph";
      };
      for (const node of nodes) {
        if (breaks.has(node)) appendPart();
        else part.append(node);
      }
      appendPart();
      // Obsidian's virtual renderer retains the original paragraph node.
      // Preserve that node and only replace its children.
      paragraph.replaceChildren(fragment);
    }
  }

  refreshReadingViews() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const preview = leaf.view.previewMode;
      if (!preview) continue;
      const scroll = preview.getScroll();
      preview.set(leaf.view.getViewData(), true);
      preview.applyScroll(scroll);
    }
  }

  onunload() {
    // Run after Obsidian unregisters this plugin's postprocessor.
    setTimeout(() => this.refreshReadingViews(), 0);
  }
};

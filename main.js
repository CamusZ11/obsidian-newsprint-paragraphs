const { Plugin } = require("obsidian");

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
      // Only root prose blocks. Preserve deliberate line breaks in structured
      // content, including lists, quotes, callouts and table cells.
      if (paragraph.parentElement !== element) continue;
      if (paragraph.closest("blockquote, li, .callout, td, th, pre, .metadata-container")) continue;
      if (!Array.from(paragraph.children).some((node) => node.tagName === "BR")) continue;

      const document = paragraph.ownerDocument;
      const fragment = document.createDocumentFragment();
      let part = document.createElement("span");
      part.className = "np-paragraph";
      const appendPart = () => {
        if (part.childNodes.length) fragment.append(part);
        part = document.createElement("span");
        part.className = "np-paragraph";
      };
      for (const node of Array.from(paragraph.childNodes)) {
        if (node.nodeType === 1 && node.tagName === "BR") appendPart();
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

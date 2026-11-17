const { Plugin, editorInfoField } = require("obsidian");
const { StateEffect } = require("@codemirror/state");
const { Decoration, EditorView, ViewPlugin } = require("@codemirror/view");

const refreshNumbers = StateEffect.define();

// Match CSS lower-roman, including decimal fallback outside its range.
const romanNumerals = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"],
  [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"],
  [5, "v"], [4, "iv"], [1, "i"]
];

function lowerRoman(ordinal) {
  if (ordinal < 1 || ordinal > 3999) return String(ordinal);
  let label = "";
  for (const [value, numeral] of romanNumerals) {
    label += numeral.repeat(Math.floor(ordinal / value));
    ordinal %= value;
  }
  return label;
}

function nestedOrdinals(data, cache) {
  const lines = data.split("\n");
  const items = cache?.listItems ?? [];
  const parents = new Map();
  const enclosing = [];
  for (const item of items) {
    const { line, col } = item.position.start;
    while (enclosing.length && (enclosing.at(-1).end < line || enclosing.at(-1).col >= col)) {
      enclosing.pop();
    }
    // Loose items can be reported as roots even inside an enclosing list item.
    parents.set(line, item.parent >= 0 ? item.parent : enclosing.at(-1)?.line ?? item.parent);
    enclosing.push({ line, col, end: item.position.end.line });
  }
  const groups = new Map();
  const ordinals = new Map();
  for (const item of items) {
    const { line, col } = item.position.start;
    const parent = parents.get(line);
    // Keep grouped numbering even if the editor only renders part of a long list.
    for (let ancestor = parents.get(parent); ancestor >= 0; ancestor = parents.get(ancestor)) {
      const group = groups.get(ancestor);
      if (group) group.endLine = Math.max(group.endLine, item.position.end.line);
    }
    const grandparent = parents.get(parent);
    const isSecondLevel = grandparent < 0;
    const isThirdLevel = grandparent >= 0 && parents.get(grandparent) < 0;
    if (!isSecondLevel && !isThirdLevel) continue;
    const marker = /^(\d{1,9})([.)])(?:\s|$)/.exec(lines[line]?.slice(col) ?? "");
    if (!marker) {
      groups.delete(parent);
      continue;
    }
    const previous = groups.get(parent);
    const interrupted = previous && lines.slice(previous.endLine + 1, line)
      .some((line) => line.replace(/^\s*(?:>\s*)+/, "").trim());
    const ordinal = previous?.delimiter === marker[2] && !interrupted
      ? previous.ordinal + 1 : Number(marker[1]);
    groups.set(parent, { delimiter: marker[2], ordinal, endLine: item.position.end.line });
    if (isThirdLevel) {
      ordinals.set(line, lowerRoman(ordinal) + ".");
      continue;
    }
    let label = "";
    for (let n = ordinal; n > 0; n = Math.floor((n - 1) / 26)) {
      label = String.fromCharCode(97 + (n - 1) % 26) + label;
    }
    if (label) ordinals.set(line, label + ".");
  }
  return ordinals;
}

const listNumberStyles = EditorView.baseTheme({
  ".is-live-preview & .cm-line.np-list-ordinal:is(.HyperMD-list-line-2, .HyperMD-list-line-3):not(.cm-active) .cm-formatting-list-ol .list-number": {
    fontSize: "0"
  },
  ".is-live-preview & .cm-line.np-list-ordinal:is(.HyperMD-list-line-2, .HyperMD-list-line-3):not(.cm-active) .cm-formatting-list-ol .list-number::before": {
    content: 'var(--np-list-label) " "',
    fontSize: "var(--np-body-size, var(--font-text-size))"
  }
});

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
    this.registerListNumbers();
  }

  registerListNumbers() {
    const snapshots = new WeakMap();
    const views = new Set();
    const app = this.app;
    const updateFile = (file) => {
      for (const editor of views) {
        if (!file || editor.state.field(editorInfoField, false)?.file === file) {
          editor.dispatch({ effects: refreshNumbers.of(null) });
        }
      }
    };
    const store = (file, data, cache) => {
      const text = data.replace(/\r\n/g, "\n");
      snapshots.set(file, { data: text, ordinals: nestedOrdinals(text, cache) });
      updateFile(file);
    };
    this.registerEvent(app.metadataCache.on("changed", (file, data, cache) => {
      if ([...views].some((view) => view.state.field(editorInfoField, false)?.file === file)) {
        store(file, data, cache);
      } else {
        snapshots.delete(file);
      }
    }));
    this.registerEvent(app.workspace.on("css-change", () => updateFile()));
    const load = (file) => {
      if (snapshots.has(file)) return;
      const cache = app.metadataCache.getFileCache(file);
      if (!cache) return;
      snapshots.set(file, null);
      app.vault.cachedRead(file).then((data) => {
        if (views.size && snapshots.get(file) === null && app.metadataCache.getFileCache(file) === cache) {
          store(file, data, cache);
        }
      }).catch(() => snapshots.delete(file));
    };
    const numbers = ViewPlugin.fromClass(class {
      constructor(view) {
        views.add(view);
        this.decorations = this.build(view);
      }

      update(update) {
        const fileChanged = update.startState.field(editorInfoField, false)?.file !==
          update.state.field(editorInfoField, false)?.file;
        if (update.docChanged || update.viewportChanged || fileChanged ||
          update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refreshNumbers)))) {
          this.decorations = this.build(update.view);
        }
      }

      build(view) {
        const file = view.state.field(editorInfoField, false)?.file;
        if (!file || view.dom.ownerDocument.defaultView.getComputedStyle(view.dom.ownerDocument.body)
          .getPropertyValue("--newsprint-theme").trim() !== "1") return Decoration.none;
        load(file);
        const snapshot = snapshots.get(file);
        const doc = view.state.doc;
        if (!snapshot?.ordinals.size) return Decoration.none;
        if (doc !== this.lastDoc || snapshot !== this.lastSnapshot) {
          this.lastDoc = doc;
          this.lastSnapshot = snapshot;
          this.matchesSnapshot = snapshot.data === doc.toString();
        }
        if (!this.matchesSnapshot) return Decoration.none;
        const marks = [];
        let lastLine = 0;
        for (const { from, to } of view.visibleRanges) {
          const last = doc.lineAt(to).number;
          for (let n = Math.max(lastLine + 1, doc.lineAt(from).number); n <= last; n++) {
            const label = snapshot.ordinals.get(n - 1);
            if (label) marks.push(Decoration.line({
              class: "np-list-ordinal",
              attributes: { style: '--np-list-label: "' + label + '"' }
            }).range(doc.line(n).from));
          }
          lastLine = last;
        }
        return Decoration.set(marks);
      }

      destroy(view) {
        views.delete(view);
      }
    }, { decorations: (value) => value.decorations });
    this.registerEditorExtension([numbers, listNumberStyles]);
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

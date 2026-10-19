/**
 * Filterable "add item" picker replacing a native <select> in the edit
 * dialogs. A long native dropdown opens on top of the cursor, so the mouseup
 * of the opening click already picks a random entry; this one lists matches
 * inline below a text input instead.
 *
 * Set `items` to [{ id, label, group? }] (already sorted) and `placeholder`.
 * Fires `pick` with `detail.id` when an entry is chosen.
 */
class MagSearchPicker extends HTMLElement {
  constructor() {
    super();
    this._items = [];
    this._placeholder = "";
    this._open = false;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        input {
          box-sizing: border-box;
          width: 100%;
          font: inherit;
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, inherit);
        }
        #list {
          max-height: 240px;
          overflow-y: auto;
          margin-top: 4px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
        }
        #list[hidden] { display: none; }
        .group {
          padding: 6px 8px 2px;
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text-color, inherit);
        }
        .item {
          padding: 6px 8px 6px 16px;
          cursor: pointer;
        }
        .item:hover, .item.active {
          background: var(--secondary-background-color, #eee);
        }
        .empty {
          padding: 6px 8px;
          font-style: italic;
          color: var(--secondary-text-color, inherit);
        }
      </style>
      <input id="input" type="search" autocomplete="off" />
      <div id="list" hidden></div>
    `;

    const input = this.shadowRoot.getElementById("input");
    const list = this.shadowRoot.getElementById("list");
    input.addEventListener("focus", () => this._setOpen(true));
    input.addEventListener("click", () => this._setOpen(true));
    input.addEventListener("input", () => {
      this._activeIndex = 0;
      this._setOpen(true);
    });
    input.addEventListener("blur", () => this._setOpen(false));
    input.addEventListener("keydown", (event) => this._onKeyDown(event));
    // mousedown instead of click: keeps focus in the input, so blur does not
    // close the list before the pick lands.
    list.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const item = event.target.closest("[data-id]");
      if (item) {
        this._pick(item.dataset.id);
      }
    });
  }

  set items(items) {
    this._items = items || [];
    const input = this.shadowRoot.getElementById("input");
    input.disabled = this._items.length === 0;
    if (this._open) {
      this._renderList();
    }
  }

  set placeholder(text) {
    this._placeholder = text;
    this.shadowRoot.getElementById("input").placeholder = text;
  }

  _matches() {
    const needle = this.shadowRoot
      .getElementById("input")
      .value.trim()
      .toLowerCase();
    return this._items.filter((item) =>
      item.label.toLowerCase().includes(needle)
    );
  }

  _setOpen(open) {
    this._open = open;
    if (open) {
      this._renderList();
    }
    this.shadowRoot.getElementById("list").hidden = !open;
  }

  _renderList() {
    const list = this.shadowRoot.getElementById("list");
    const matches = this._matches();
    this._activeIndex = Math.min(this._activeIndex || 0, matches.length - 1);
    if (matches.length === 0) {
      list.innerHTML = `<div class="empty">–</div>`;
      return;
    }
    let lastGroup;
    list.innerHTML = matches
      .map((item, index) => {
        let header = "";
        if (item.group !== undefined && item.group !== lastGroup) {
          header = `<div class="group">${_escape(item.group)}</div>`;
          lastGroup = item.group;
        }
        return `${header}<div class="item${
          index === this._activeIndex ? " active" : ""
        }" data-id="${_escape(item.id)}">${_escape(item.label)}</div>`;
      })
      .join("");
  }

  _onKeyDown(event) {
    const matches = this._matches();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!matches.length) {
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      this._activeIndex =
        ((this._activeIndex || 0) + step + matches.length) % matches.length;
      this._setOpen(true);
      this.shadowRoot
        .querySelector(".item.active")
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = matches[this._activeIndex || 0];
      if (item) {
        this._pick(item.id);
      }
    } else if (event.key === "Escape") {
      // Keep the surrounding dialog open; just collapse the list.
      event.stopPropagation();
      this._setOpen(false);
    }
  }

  _pick(id) {
    const input = this.shadowRoot.getElementById("input");
    input.value = "";
    this._activeIndex = 0;
    this.dispatchEvent(new CustomEvent("pick", { detail: { id } }));
    // The host usually re-sets `items` (picked entry gone); refresh anyway.
    if (this._open) {
      this._renderList();
    }
  }
}

function _escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (!customElements.get("mag-search-picker")) {
  customElements.define("mag-search-picker", MagSearchPicker);
}

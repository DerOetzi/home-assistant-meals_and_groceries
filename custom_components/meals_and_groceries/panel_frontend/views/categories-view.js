import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";

class MealsAndGroceriesCategoriesView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._stores = [];
    this._selectedStoreId = "";
    this._categories = [];
    this._error = null;
    this._draggingId = null;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._buildShell();
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._buildShell();
    }
    if (first) {
      this._loadStores();
    }
  }

  get hass() {
    return this._hass;
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        select, input {
          font: inherit;
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, inherit);
        }
        button {
          font: inherit;
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
        }
        button.danger { background: var(--error-color, #db4437); }
        button.icon {
          background: none;
          color: var(--primary-text-color, inherit);
          border: 1px solid var(--divider-color, #ccc);
          padding: 4px 10px;
        }
        #hint { color: var(--secondary-text-color, inherit); font-size: 12px; margin-bottom: 8px; }
        #error { color: var(--error-color, #db4437); }
        ul { list-style: none; margin: 0; padding: 0; }
        li {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          margin-bottom: 4px;
          border: 1px solid var(--divider-color, #eee);
          border-radius: 4px;
          background: var(--card-background-color, transparent);
          cursor: grab;
        }
        li.dragover { border-color: var(--primary-color, #03a9f4); }
        li .name { flex: 1; }
        li .actions { display: flex; gap: 4px; }
        .add-row { display: flex; gap: 8px; margin-top: 16px; }
        .add-row input { flex: 1; }
      </style>
      <div class="toolbar">
        <label id="store-label"></label>
        <select id="store-select"></select>
      </div>
      <p id="hint"></p>
      <div id="error"></div>
      <ul id="list"></ul>
      <div class="add-row">
        <input id="new-name" type="text" />
        <button id="add-btn"></button>
      </div>
    `;

    this.shadowRoot.getElementById("store-select").addEventListener("change", (event) => {
      this._selectedStoreId = event.target.value;
      this._loadCategories();
    });
    this.shadowRoot.getElementById("new-name").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._addCategory();
      }
    });
    this.shadowRoot.getElementById("add-btn").addEventListener("click", () =>
      this._addCategory()
    );
  }

  _applyLabels() {
    const hass = this._hass;
    this.shadowRoot.getElementById("store-label").textContent = t(
      hass,
      "categories_store_label"
    );
    this.shadowRoot.getElementById("hint").textContent = t(hass, "drag_hint");
    this.shadowRoot.getElementById("new-name").placeholder = t(
      hass,
      "category_name_placeholder"
    );
    this.shadowRoot.getElementById("add-btn").textContent = t(hass, "add_category");
  }

  async _loadStores() {
    try {
      const { stores } = await callWS(this._hass, "meals_and_groceries/stores/list");
      this._stores = stores;
      this._selectedStoreId = stores[0]?.subentry_id || "";
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._applyLabels();
    this._renderStoreSelect();
    if (this._selectedStoreId) {
      await this._loadCategories();
    } else {
      this._renderList();
    }
  }

  _renderStoreSelect() {
    const select = this.shadowRoot.getElementById("store-select");
    select.innerHTML = this._stores
      .map(
        (store) =>
          `<option value="${store.subentry_id}" ${
            store.subentry_id === this._selectedStoreId ? "selected" : ""
          }>${_escape(store.title)}</option>`
      )
      .join("");
  }

  async _loadCategories() {
    if (!this._selectedStoreId) {
      this._categories = [];
      this._renderList();
      return;
    }
    try {
      const { categories } = await callWS(
        this._hass,
        "meals_and_groceries/categories/list",
        { subentry_id: this._selectedStoreId }
      );
      this._categories = [...categories].sort((a, b) => a.sort_index - b.sort_index);
      this._error = null;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._renderList();
  }

  _renderList() {
    const hass = this._hass;
    const listEl = this.shadowRoot.getElementById("list");
    const errorEl = this.shadowRoot.getElementById("error");
    errorEl.textContent = this._error
      ? `${t(hass, "error_prefix")}: ${this._error}`
      : "";

    if (!this._stores.length) {
      listEl.innerHTML = `<li>${t(hass, "no_stores")}</li>`;
      return;
    }
    if (this._categories.length === 0) {
      listEl.innerHTML = `<li>${t(hass, "no_categories")}</li>`;
      return;
    }

    listEl.innerHTML = this._categories
      .map(
        (category) => `
        <li draggable="true" data-id="${category.id}">
          <span class="name" data-name>${_escape(category.name)}</span>
          <span class="actions">
            <button class="icon" data-action="rename" data-id="${category.id}">${t(
          hass,
          "edit"
        )}</button>
            <button class="danger" data-action="delete" data-id="${category.id}">${t(
          hass,
          "delete"
        )}</button>
          </span>
        </li>`
      )
      .join("");

    listEl.querySelectorAll("li[draggable]").forEach((li) => {
      li.addEventListener("dragstart", (event) => {
        this._draggingId = li.dataset.id;
        event.dataTransfer.effectAllowed = "move";
      });
      li.addEventListener("dragover", (event) => {
        event.preventDefault();
        li.classList.add("dragover");
      });
      li.addEventListener("dragleave", () => li.classList.remove("dragover"));
      li.addEventListener("drop", (event) => {
        event.preventDefault();
        li.classList.remove("dragover");
        this._reorder(this._draggingId, li.dataset.id);
      });
    });

    listEl.querySelectorAll("[data-action='delete']").forEach((button) => {
      button.addEventListener("click", () => this._deleteCategory(button.dataset.id));
    });
    listEl.querySelectorAll("[data-action='rename']").forEach((button) => {
      button.addEventListener("click", () => this._startRename(button.dataset.id));
    });
  }

  _startRename(categoryId) {
    const li = this.shadowRoot.querySelector(`li[data-id="${categoryId}"]`);
    const nameSpan = li.querySelector("[data-name]");
    const category = this._categories.find((c) => c.id === categoryId);
    nameSpan.innerHTML = `<input type="text" value="${_escapeAttr(category.name)}" />`;
    const input = nameSpan.querySelector("input");
    input.focus();
    input.select();
    const commit = async () => {
      const newName = input.value.trim();
      if (newName && newName !== category.name) {
        await this._renameCategory(categoryId, newName);
      } else {
        this._renderList();
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        this._renderList();
      }
    });
    input.addEventListener("blur", commit);
  }

  async _renameCategory(categoryId, name) {
    try {
      await callWS(this._hass, "meals_and_groceries/categories/update", {
        subentry_id: this._selectedStoreId,
        category_id: categoryId,
        name,
      });
      await this._loadCategories();
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderList();
    }
  }

  async _addCategory() {
    const input = this.shadowRoot.getElementById("new-name");
    const name = input.value.trim();
    if (!name || !this._selectedStoreId) {
      return;
    }
    try {
      await callWS(this._hass, "meals_and_groceries/categories/add", {
        subentry_id: this._selectedStoreId,
        name,
      });
      input.value = "";
      await this._loadCategories();
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderList();
    }
  }

  async _deleteCategory(categoryId) {
    if (!window.confirm(t(this._hass, "confirm_delete_category"))) {
      return;
    }
    try {
      await callWS(this._hass, "meals_and_groceries/categories/delete", {
        subentry_id: this._selectedStoreId,
        category_id: categoryId,
      });
      await this._loadCategories();
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderList();
    }
  }

  async _reorder(draggedId, targetId) {
    if (!draggedId || draggedId === targetId) {
      return;
    }
    const ids = this._categories.map((c) => c.id);
    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, draggedId);

    try {
      await callWS(this._hass, "meals_and_groceries/categories/reorder", {
        subentry_id: this._selectedStoreId,
        category_ids: ids,
      });
      await this._loadCategories();
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderList();
    }
  }
}

function _escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function _escapeAttr(value) {
  return _escape(value).replaceAll('"', "&quot;");
}

if (!customElements.get("mag-categories-view")) {
  customElements.define("mag-categories-view", MealsAndGroceriesCategoriesView);
}

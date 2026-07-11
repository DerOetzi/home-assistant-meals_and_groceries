import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";
import { setIconButton, iconButtonMarkup } from "../cards/icon-button.js";

class MealsAndGroceriesCategoriesView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._stores = [];
    this._selectedStoreId = "";
    this._categories = [];
    this._error = null;
    this._draggingId = null;
    this._editingCategoryId = null;
    this._formName = "";
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

  refresh() {
    if (this._hass && this._selectedStoreId) {
      this._loadCategories();
    }
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
        .toolbar select { flex: 1; }
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
        button.secondary {
          background: none;
          color: var(--primary-text-color, inherit);
          border: 1px solid var(--divider-color, #ccc);
        }
        button.danger { background: var(--error-color, #db4437); }
        button.icon-only {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          padding: 0;
          flex-shrink: 0;
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
        li .drag-handle {
          flex-shrink: 0;
          color: var(--secondary-text-color, inherit);
          opacity: 0.6;
          cursor: grab;
        }
        li .name { flex: 1; }
        li .actions { display: flex; gap: 4px; }
        #form-container:empty { display: none; }
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 5vh 16px;
          overflow-y: auto;
          z-index: 10;
        }
        .form {
          width: 100%;
          max-width: 480px;
          padding: 16px;
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }
        .form-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
        .form-row label { font-size: 12px; color: var(--secondary-text-color, inherit); }
        .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
      </style>
      <div class="toolbar">
        <select id="store-select"></select>
        <button id="add-btn" class="icon-only"></button>
      </div>
      <p id="hint"></p>
      <div id="error"></div>
      <ul id="list"></ul>
      <div id="form-container"></div>
    `;

    this.shadowRoot.getElementById("store-select").addEventListener("change", (event) => {
      this._selectedStoreId = event.target.value;
      this._loadCategories();
    });
    this.shadowRoot
      .getElementById("add-btn")
      .addEventListener("click", () => this._openForm(null));
  }

  _applyLabels() {
    const hass = this._hass;
    this.shadowRoot.getElementById("hint").textContent = t(hass, "drag_hint");
    setIconButton(this.shadowRoot.getElementById("add-btn"), hass, "add_category", "mdi:plus");
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
          <ha-icon class="drag-handle" icon="mdi:drag"></ha-icon>
          <span class="name">${_escape(category.name)}</span>
          <span class="actions">
            <button class="secondary icon-only" ${
              iconButtonMarkup(hass, "edit", "mdi:pencil").attrs
            } data-action="edit" data-id="${category.id}">${
          iconButtonMarkup(hass, "edit", "mdi:pencil").content
        }</button>
            <button class="danger icon-only" ${
              iconButtonMarkup(hass, "delete", "mdi:delete-outline").attrs
            } data-action="delete" data-id="${category.id}">${
          iconButtonMarkup(hass, "delete", "mdi:delete-outline").content
        }</button>
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
    listEl.querySelectorAll("[data-action='edit']").forEach((button) => {
      button.addEventListener("click", () => this._openForm(button.dataset.id));
    });
  }

  _openForm(categoryId) {
    this._editingCategoryId = categoryId;
    const category = categoryId
      ? this._categories.find((c) => c.id === categoryId)
      : null;
    this._formName = category?.name || "";
    this._renderForm();
  }

  _closeForm() {
    this._editingCategoryId = null;
    this.shadowRoot.getElementById("form-container").innerHTML = "";
  }

  _renderForm() {
    const hass = this._hass;
    const container = this.shadowRoot.getElementById("form-container");
    const isEdit = this._editingCategoryId !== null;

    container.innerHTML = `
      <div class="overlay" id="overlay">
        <div class="form">
          <h3>${t(hass, isEdit ? "edit" : "add_category")}</h3>
          <div class="form-row">
            <label>${t(hass, "product_name")}</label>
            <input id="f-name" type="text" value="${_escapeAttr(this._formName)}"
              placeholder="${t(hass, "category_name_placeholder")}" />
          </div>
          <div class="form-actions">
            <button class="secondary icon-only" id="f-cancel" ${
              iconButtonMarkup(hass, "cancel", "mdi:close").attrs
            }>${iconButtonMarkup(hass, "cancel", "mdi:close").content}</button>
            <button class="icon-only" id="f-save" ${
              iconButtonMarkup(hass, "save", "mdi:content-save").attrs
            }>${iconButtonMarkup(hass, "save", "mdi:content-save").content}</button>
          </div>
        </div>
      </div>
    `;

    const nameInput = container.querySelector("#f-name");
    nameInput.focus();
    nameInput.addEventListener("input", (event) => {
      this._formName = event.target.value;
    });
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._save();
      }
    });
    container.querySelector("#overlay").addEventListener("click", (event) => {
      if (event.target.id === "overlay") {
        this._closeForm();
      }
    });
    container
      .querySelector("#f-cancel")
      .addEventListener("click", () => this._closeForm());
    container.querySelector("#f-save").addEventListener("click", () => this._save());
  }

  async _save() {
    const hass = this._hass;
    const name = this._formName.trim();
    if (!name) {
      window.alert(t(hass, "name_required"));
      return;
    }
    try {
      if (this._editingCategoryId) {
        await callWS(hass, "meals_and_groceries/categories/update", {
          subentry_id: this._selectedStoreId,
          category_id: this._editingCategoryId,
          name,
        });
      } else {
        await callWS(hass, "meals_and_groceries/categories/add", {
          subentry_id: this._selectedStoreId,
          name,
        });
      }
      this._closeForm();
      await this._loadCategories();
    } catch (err) {
      window.alert(`${t(hass, "error_prefix")}: ${err?.message || err}`);
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

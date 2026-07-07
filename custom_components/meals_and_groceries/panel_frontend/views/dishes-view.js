import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";

const KIND_IDS = ["dish", "restaurant", "away"];

function _kindKey(kind) {
  return KIND_IDS.includes(kind) ? `dish_kind_${kind}` : "dish_kind_dish";
}

class MealsAndGroceriesDishesView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._dishes = [];
    this._search = "";
    this._filterKind = "";
    this._error = null;
    this._editingDishId = null;
    this._formName = "";
    this._formKind = "dish";
    this._formNotes = "";
    this._stores = [];
    this._products = [];
    this._formIngredients = [];
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
      this._loadDishes();
    }
  }

  get hass() {
    return this._hass;
  }

  refresh() {
    if (this._hass) {
      this._loadDishes();
    }
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
        #search { flex: 1; }
        input, select, textarea {
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
        table { width: 100%; border-collapse: collapse; }
        th, td {
          text-align: left;
          padding: 8px;
          border-bottom: 1px solid var(--divider-color, #eee);
        }
        .row-actions { display: flex; gap: 8px; justify-content: flex-end; }
        #error { color: var(--error-color, #db4437); }
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
        .form-row textarea { resize: vertical; min-height: 60px; }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
        .chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 12px;
          background: var(--secondary-background-color, #eee);
        }
        .chip button {
          padding: 0;
          width: 18px;
          height: 18px;
          line-height: 18px;
          border-radius: 50%;
          background: var(--divider-color, #ccc);
          color: inherit;
        }
        .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
      </style>
      <div class="toolbar">
        <input id="search" type="search" />
        <select id="kind-filter"></select>
        <button id="add-btn"></button>
      </div>
      <div id="error"></div>
      <div id="list"></div>
      <div id="form-container"></div>
    `;

    this.shadowRoot.getElementById("search").addEventListener("input", (event) => {
      this._search = event.target.value;
      this._renderList();
    });
    this.shadowRoot
      .getElementById("kind-filter")
      .addEventListener("change", (event) => {
        this._filterKind = event.target.value;
        this._renderList();
      });
    this.shadowRoot
      .getElementById("add-btn")
      .addEventListener("click", () => this._openForm(null));
    this.shadowRoot.getElementById("list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) {
        return;
      }
      if (button.dataset.action === "edit") {
        this._openForm(button.dataset.id);
      } else if (button.dataset.action === "delete") {
        this._deleteDish(button.dataset.id);
      }
    });
  }

  _applyLabels() {
    const hass = this._hass;
    this.shadowRoot.getElementById("add-btn").textContent = t(hass, "add_dish");
    this.shadowRoot.getElementById("search").placeholder = t(
      hass,
      "dish_search_placeholder"
    );
    const kindFilter = this.shadowRoot.getElementById("kind-filter");
    kindFilter.innerHTML = `
      <option value="">${t(hass, "filter_all_kinds")}</option>
      ${KIND_IDS.map(
        (kind) =>
          `<option value="${kind}" ${
            this._filterKind === kind ? "selected" : ""
          }>${t(hass, _kindKey(kind))}</option>`
      ).join("")}
    `;
  }

  async _loadDishes() {
    try {
      const [{ dishes }, { products }, { stores }] = await Promise.all([
        callWS(this._hass, "meals_and_groceries/dishes/list"),
        callWS(this._hass, "meals_and_groceries/products/list"),
        callWS(this._hass, "meals_and_groceries/stores/list"),
      ]);
      this._dishes = dishes;
      this._products = products;
      this._stores = stores;
      this._error = null;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._applyLabels();
    this._renderList();
  }

  _renderList() {
    const hass = this._hass;
    const listEl = this.shadowRoot.getElementById("list");
    const errorEl = this.shadowRoot.getElementById("error");
    errorEl.textContent = this._error
      ? `${t(hass, "error_prefix")}: ${this._error}`
      : "";

    const needle = this._search.trim().toLowerCase();
    const filtered = this._dishes
      .filter(
        (dish) =>
          dish.name.toLowerCase().includes(needle) &&
          (!this._filterKind || dish.kind === this._filterKind)
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
      listEl.innerHTML = `<p><em>${t(hass, "no_dishes")}</em></p>`;
      return;
    }

    const rows = filtered
      .map(
        (dish) => `
        <tr>
          <td>${_escape(dish.name)}</td>
          <td>${t(hass, _kindKey(dish.kind))}</td>
          <td>${_escape(dish.notes || "")}</td>
          <td>${(dish.ingredients || []).length} ${t(
          hass,
          "dish_ingredient_count"
        )}</td>
          <td class="row-actions">
            <button class="secondary" data-action="edit" data-id="${dish.id}">${t(
          hass,
          "edit"
        )}</button>
            <button class="danger" data-action="delete" data-id="${dish.id}">${t(
          hass,
          "delete"
        )}</button>
          </td>
        </tr>`
      )
      .join("");

    listEl.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>${t(hass, "dish_name")}</th>
            <th>${t(hass, "dish_kind")}</th>
            <th>${t(hass, "dish_notes")}</th>
            <th>${t(hass, "dish_ingredients")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  _openForm(dishId) {
    this._editingDishId = dishId;
    const dish = dishId ? this._dishes.find((d) => d.id === dishId) : null;
    this._formName = dish?.name || "";
    this._formKind = dish?.kind || "dish";
    this._formNotes = dish?.notes || "";
    this._formIngredients = dish ? [...(dish.ingredients || [])] : [];
    this._renderForm();
  }

  _closeForm() {
    this._editingDishId = null;
    this.shadowRoot.getElementById("form-container").innerHTML = "";
  }

  _renderForm() {
    const hass = this._hass;
    const container = this.shadowRoot.getElementById("form-container");
    const isEdit = this._editingDishId !== null;

    container.innerHTML = `
      <div class="overlay" id="overlay">
        <div class="form">
          <h3>${t(hass, isEdit ? "edit_dish" : "add_dish")}</h3>
          <div class="form-row">
            <label>${t(hass, "dish_name")}</label>
            <input id="f-name" type="text" value="${_escapeAttr(this._formName)}" />
          </div>
          <div class="form-row">
            <label>${t(hass, "dish_kind")}</label>
            <select id="f-kind">
              ${KIND_IDS.map(
                (kind) =>
                  `<option value="${kind}" ${
                    this._formKind === kind ? "selected" : ""
                  }>${t(hass, _kindKey(kind))}</option>`
              ).join("")}
            </select>
          </div>
          <div class="form-row">
            <label>${t(hass, "dish_notes")}</label>
            <textarea id="f-notes">${_escape(this._formNotes)}</textarea>
          </div>
          <div class="form-row">
            <label>${t(hass, "dish_ingredients")}</label>
            <div id="ingredient-chips" class="chips"></div>
            <select id="f-ingredient-add"></select>
          </div>
          <div class="form-actions">
            <button class="secondary" id="f-cancel">${t(hass, "cancel")}</button>
            <button id="f-save">${t(hass, "save")}</button>
          </div>
        </div>
      </div>
    `;

    container.querySelector("#overlay").addEventListener("click", (event) => {
      if (event.target.id === "overlay") {
        this._closeForm();
      }
    });
    container.querySelector("#f-name").addEventListener("input", (event) => {
      this._formName = event.target.value;
    });
    container.querySelector("#f-kind").addEventListener("change", (event) => {
      this._formKind = event.target.value;
    });
    container.querySelector("#f-notes").addEventListener("input", (event) => {
      this._formNotes = event.target.value;
    });
    this._renderIngredientChips();
    container
      .querySelector("#f-ingredient-add")
      .addEventListener("change", (event) => {
        const productId = event.target.value;
        if (productId && !this._formIngredients.includes(productId)) {
          this._formIngredients.push(productId);
          this._renderIngredientChips();
        }
      });
    container
      .querySelector("#ingredient-chips")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-remove-ingredient]");
        if (!button) {
          return;
        }
        this._formIngredients = this._formIngredients.filter(
          (id) => id !== button.dataset.removeIngredient
        );
        this._renderIngredientChips();
      });
    container
      .querySelector("#f-cancel")
      .addEventListener("click", () => this._closeForm());
    container.querySelector("#f-save").addEventListener("click", () => this._save());
  }

  _renderIngredientChips() {
    const hass = this._hass;
    const chipsEl = this.shadowRoot.getElementById("ingredient-chips");
    const selectEl = this.shadowRoot.getElementById("f-ingredient-add");
    if (!chipsEl || !selectEl) {
      return;
    }
    chipsEl.innerHTML = this._formIngredients
      .map((productId) => {
        const name =
          this._products.find((p) => p.id === productId)?.name || "?";
        return `
        <span class="chip">
          ${_escape(name)}
          <button data-remove-ingredient="${_escapeAttr(productId)}" title="${t(
          hass,
          "delete"
        )}">×</button>
        </span>`;
      })
      .join("");

    // Products grouped by store, already-linked ones hidden.
    const byStore = new Map();
    for (const product of this._products) {
      if (this._formIngredients.includes(product.id)) {
        continue;
      }
      if (!byStore.has(product.store_subentry_id)) {
        byStore.set(product.store_subentry_id, []);
      }
      byStore.get(product.store_subentry_id).push(product);
    }
    const groupsHtml = [...byStore.entries()]
      .map(([subentryId, products]) => {
        const title =
          this._stores.find((s) => s.subentry_id === subentryId)?.title || "?";
        const options = products
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(
            (product) =>
              `<option value="${product.id}">${_escape(product.name)}</option>`
          )
          .join("");
        return `<optgroup label="${_escapeAttr(title)}">${options}</optgroup>`;
      })
      .join("");
    selectEl.innerHTML = `
      <option value="">${t(hass, "add_ingredient")}</option>
      ${groupsHtml}
    `;
    selectEl.value = "";
    selectEl.disabled = byStore.size === 0;
  }

  async _save() {
    const hass = this._hass;
    const name = this._formName.trim();
    if (!name) {
      window.alert(t(hass, "name_required"));
      return;
    }
    try {
      if (this._editingDishId) {
        await callWS(hass, "meals_and_groceries/dishes/update", {
          dish_id: this._editingDishId,
          name,
          kind: this._formKind,
          notes: this._formNotes || null,
          ingredients: this._formIngredients,
        });
      } else {
        await callWS(hass, "meals_and_groceries/dishes/add", {
          name,
          kind: this._formKind,
          notes: this._formNotes || null,
          ingredients: this._formIngredients,
        });
      }
      this._closeForm();
      await this._loadDishes();
    } catch (err) {
      window.alert(`${t(hass, "error_prefix")}: ${err?.message || err}`);
    }
  }

  async _deleteDish(dishId) {
    if (!window.confirm(t(this._hass, "confirm_delete_dish"))) {
      return;
    }
    try {
      await callWS(this._hass, "meals_and_groceries/dishes/delete", {
        dish_id: dishId,
      });
      await this._loadDishes();
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

if (!customElements.get("mag-dishes-view")) {
  customElements.define("mag-dishes-view", MealsAndGroceriesDishesView);
}

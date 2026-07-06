import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";

class MealsAndGroceriesProductsView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._stores = [];
    this._categoriesByStore = {};
    this._products = [];
    this._search = "";
    this._error = null;
    this._editingProductId = null;
    this._formStoreId = "";
    this._formCategoryId = "";
    this._formBarcodes = [];
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
      this._loadAll();
    }
  }

  get hass() {
    return this._hass;
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
        input, select {
          font: inherit;
          padding: 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, inherit);
        }
        #search { flex: 1; }
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
        .form {
          margin-top: 16px;
          padding: 16px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 8px;
        }
        .form-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
        .form-row label { font-size: 12px; color: var(--secondary-text-color, inherit); }
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
        <button id="add-btn"></button>
      </div>
      <div id="error"></div>
      <div id="list"></div>
      <div id="form-container"></div>
    `;

    this.shadowRoot
      .getElementById("search")
      .addEventListener("input", (event) => {
        this._search = event.target.value;
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
      const productId = button.dataset.id;
      if (button.dataset.action === "edit") {
        this._openForm(productId);
      } else if (button.dataset.action === "delete") {
        this._deleteProduct(productId);
      }
    });
  }

  async _loadAll() {
    try {
      const { stores } = await callWS(this._hass, "meals_and_groceries/stores/list");
      this._stores = stores;

      const categoriesByStore = {};
      for (const store of stores) {
        const { categories } = await callWS(
          this._hass,
          "meals_and_groceries/categories/list",
          { subentry_id: store.subentry_id }
        );
        categoriesByStore[store.subentry_id] = categories;
      }
      this._categoriesByStore = categoriesByStore;

      await this._loadProducts();
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderList();
    }
    this._applyLabels();
  }

  async _loadProducts() {
    const { products } = await callWS(this._hass, "meals_and_groceries/products/list");
    this._products = products;
    this._renderList();
  }

  _applyLabels() {
    const hass = this._hass;
    this.shadowRoot.getElementById("search").placeholder = t(
      hass,
      "search_placeholder"
    );
    this.shadowRoot.getElementById("add-btn").textContent = t(hass, "add_product");
  }

  _storeTitle(subentryId) {
    return this._stores.find((s) => s.subentry_id === subentryId)?.title || "?";
  }

  _categoryName(subentryId, categoryId) {
    if (!categoryId) {
      return t(this._hass, "product_no_category");
    }
    const category = (this._categoriesByStore[subentryId] || []).find(
      (c) => c.id === categoryId
    );
    return category ? category.name : t(this._hass, "product_no_category");
  }

  _renderList() {
    const hass = this._hass;
    const listEl = this.shadowRoot.getElementById("list");
    const errorEl = this.shadowRoot.getElementById("error");
    errorEl.textContent = this._error
      ? `${t(hass, "error_prefix")}: ${this._error}`
      : "";

    const needle = this._search.trim().toLowerCase();
    const filtered = this._products.filter((product) =>
      product.name.toLowerCase().includes(needle)
    );

    if (filtered.length === 0) {
      listEl.innerHTML = `<p><em>${t(hass, "no_products")}</em></p>`;
      return;
    }

    const rows = filtered
      .map((product) => {
        const store = this._storeTitle(product.store_subentry_id);
        const category = this._categoryName(
          product.store_subentry_id,
          product.category_id
        );
        const barcodeCount = `${product.barcodes.length} ${t(
          hass,
          "product_barcode_count"
        )}`;
        return `
          <tr>
            <td>${_escape(product.name)}</td>
            <td>${_escape(store)}</td>
            <td>${_escape(category)}</td>
            <td>${barcodeCount}</td>
            <td class="row-actions">
              <button class="secondary" data-action="edit" data-id="${product.id}">${t(
          hass,
          "edit"
        )}</button>
              <button class="danger" data-action="delete" data-id="${product.id}">${t(
          hass,
          "delete"
        )}</button>
            </td>
          </tr>`;
      })
      .join("");

    listEl.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>${t(hass, "product_name")}</th>
            <th>${t(hass, "product_store")}</th>
            <th>${t(hass, "product_category")}</th>
            <th>${t(hass, "product_barcodes")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  _openForm(productId) {
    this._editingProductId = productId;
    const product = productId
      ? this._products.find((p) => p.id === productId)
      : null;
    this._formBarcodes = product ? [...product.barcodes] : [];
    this._formStoreId =
      product?.store_subentry_id || this._stores[0]?.subentry_id || "";
    this._formCategoryId = product?.category_id || "";
    this._formNameValue = product?.name || "";
    this._renderForm();
  }

  _closeForm() {
    this._editingProductId = null;
    this.shadowRoot.getElementById("form-container").innerHTML = "";
  }

  _renderForm() {
    const hass = this._hass;
    const container = this.shadowRoot.getElementById("form-container");
    const isEdit = this._editingProductId !== null;
    const categories = this._categoriesByStore[this._formStoreId] || [];

    container.innerHTML = `
      <div class="form">
        <h3>${t(hass, isEdit ? "edit_product" : "add_product")}</h3>
        <div class="form-row">
          <label>${t(hass, "product_name")}</label>
          <input id="f-name" type="text" value="${_escapeAttr(
            this._formNameValue || ""
          )}" />
        </div>
        <div class="form-row">
          <label>${t(hass, "product_store")}</label>
          <select id="f-store" ${isEdit ? "disabled" : ""}>
            ${this._stores
              .map(
                (store) =>
                  `<option value="${store.subentry_id}" ${
                    store.subentry_id === this._formStoreId ? "selected" : ""
                  }>${_escape(store.title)}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="form-row">
          <label>${t(hass, "product_category")}</label>
          <select id="f-category">
            <option value="">${t(hass, "product_no_category")}</option>
            ${categories
              .map(
                (category) =>
                  `<option value="${category.id}" ${
                    category.id === this._formCategoryId ? "selected" : ""
                  }>${_escape(category.name)}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="form-row">
          <label>${t(hass, "product_barcodes")}</label>
          <div id="chips" class="chips"></div>
          <input id="f-barcode" type="text" placeholder="${t(
            hass,
            "product_barcode_input_placeholder"
          )}" />
        </div>
        <div class="form-actions">
          <button class="secondary" id="f-cancel">${t(hass, "cancel")}</button>
          <button id="f-save">${t(hass, "save")}</button>
        </div>
      </div>
    `;

    this._renderChips();

    container.querySelector("#f-name").addEventListener("input", (event) => {
      this._formNameValue = event.target.value;
    });
    container.querySelector("#f-store").addEventListener("change", (event) => {
      this._formStoreId = event.target.value;
      this._formCategoryId = "";
      this._renderForm();
    });
    container.querySelector("#f-category").addEventListener("change", (event) => {
      this._formCategoryId = event.target.value;
    });
    container.querySelector("#f-barcode").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      const input = event.target;
      const value = input.value.trim();
      if (value && !this._formBarcodes.includes(value)) {
        this._formBarcodes.push(value);
        this._renderChips();
      }
      input.value = "";
    });
    container.querySelector("#chips").addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-barcode]");
      if (!button) {
        return;
      }
      this._formBarcodes = this._formBarcodes.filter(
        (code) => code !== button.dataset.removeBarcode
      );
      this._renderChips();
    });
    container.querySelector("#f-cancel").addEventListener("click", () =>
      this._closeForm()
    );
    container.querySelector("#f-save").addEventListener("click", () => this._save());
  }

  _renderChips() {
    const chipsEl = this.shadowRoot.getElementById("chips");
    chipsEl.innerHTML = this._formBarcodes
      .map(
        (code) => `
        <span class="chip">
          ${_escape(code)}
          <button data-remove-barcode="${_escapeAttr(code)}" title="${t(
          this._hass,
          "delete"
        )}">×</button>
        </span>`
      )
      .join("");
  }

  async _save() {
    const hass = this._hass;
    const name = (this._formNameValue || "").trim();
    if (!name) {
      window.alert(t(hass, "name_required"));
      return;
    }
    if (!this._formStoreId) {
      window.alert(t(hass, "store_required"));
      return;
    }

    try {
      if (this._editingProductId) {
        await callWS(hass, "meals_and_groceries/products/update", {
          product_id: this._editingProductId,
          name,
          category_id: this._formCategoryId || null,
          barcodes: this._formBarcodes,
        });
      } else {
        await callWS(hass, "meals_and_groceries/products/add", {
          name,
          store_subentry_id: this._formStoreId,
          category_id: this._formCategoryId || null,
          barcodes: this._formBarcodes,
        });
      }
      this._closeForm();
      await this._loadProducts();
    } catch (err) {
      window.alert(`${t(hass, "error_prefix")}: ${err?.message || err}`);
    }
  }

  async _deleteProduct(productId) {
    if (!window.confirm(t(this._hass, "confirm_delete_product"))) {
      return;
    }
    try {
      await callWS(this._hass, "meals_and_groceries/products/delete", {
        product_id: productId,
      });
      await this._loadProducts();
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

if (!customElements.get("mag-products-view")) {
  customElements.define("mag-products-view", MealsAndGroceriesProductsView);
}

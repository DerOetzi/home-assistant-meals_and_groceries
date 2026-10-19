import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";
import { setIconButton, iconButtonMarkup } from "../cards/icon-button.js";
import "../cards/search-picker.js";

class MealsAndGroceriesProductsView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._stores = [];
    this._categoriesByStore = {};
    this._products = [];
    this._search = "";
    this._filterStoreId = "";
    this._error = null;
    this._editingProductId = null;
    this._formOpen = false;
    this._formStoreId = "";
    this._formCategoryId = "";
    this._formBarcodes = [];
    this._groups = [];
    this._tabs = [];
    this._formGroupIds = [];
    this._dishes = [];
    this._formDishIds = [];
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

  refresh() {
    if (this._hass) {
      this._loadAll();
    }
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
        button.icon-only {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          padding: 0;
          flex-shrink: 0;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td {
          text-align: left;
          padding: 8px;
          border-bottom: 1px solid var(--divider-color, #eee);
        }
        .row-actions { display: flex; gap: 8px; justify-content: flex-end; }
        #error { color: var(--error-color, #db4437); }
        @media (max-width: 640px) {
          table, thead, tbody, tr, td { display: block; width: 100%; }
          thead { display: none; }
          tbody tr {
            margin-bottom: 12px;
            padding: 8px 12px;
            border: 1px solid var(--divider-color, #eee);
            border-radius: 8px;
          }
          td {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 6px 0;
            border-bottom: none;
          }
          td::before {
            content: attr(data-label);
            flex-shrink: 0;
            font-weight: 500;
            color: var(--secondary-text-color, inherit);
          }
          td.row-actions {
            justify-content: flex-end;
            flex-wrap: wrap;
          }
          td.row-actions::before { content: none; }
        }
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
        <select id="store-filter"></select>
        <button id="add-btn" class="icon-only"></button>
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
      .getElementById("store-filter")
      .addEventListener("change", (event) => {
        this._filterStoreId = event.target.value;
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
      } else if (button.dataset.action === "add-to-list") {
        this._addToList(productId);
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

      await this._loadLinks();
      await this._loadProducts();
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderList();
    }
    this._applyLabels();
    this._renderStoreFilter();
  }

  _renderStoreFilter() {
    const selectEl = this.shadowRoot.getElementById("store-filter");
    selectEl.innerHTML = `
      <option value="">${t(this._hass, "filter_all_stores")}</option>
      ${this._stores
        .map(
          (store) =>
            `<option value="${store.subentry_id}" ${
              store.subentry_id === this._filterStoreId ? "selected" : ""
            }>${_escape(store.title)}</option>`
        )
        .join("")}
    `;
  }

  /** Groups, tabs and dishes — everything that references products. */
  async _loadLinks() {
    const [{ groups }, { tabs }, { dishes }] = await Promise.all([
      callWS(this._hass, "meals_and_groceries/groups/list"),
      callWS(this._hass, "meals_and_groceries/tabs/list"),
      callWS(this._hass, "meals_and_groceries/dishes/list"),
    ]);
    this._groups = groups;
    this._tabs = [...tabs].sort((a, b) => a.sort_index - b.sort_index);
    this._dishes = [...dishes].sort((a, b) => a.name.localeCompare(b.name));
  }

  _dishesUsing(productId) {
    return this._dishes.filter((dish) => (dish.ingredients || []).includes(productId));
  }

  /** Extra tabs showing the product, each with the groups that put it there. */
  _tabsShowing(product) {
    const groupIds = product.group_ids || [];
    return this._tabs
      .map((tab) => ({
        tab,
        groups: (tab.group_ids || [])
          .filter((groupId) => groupIds.includes(groupId))
          .map((groupId) => this._groups.find((g) => g.id === groupId))
          .filter(Boolean),
      }))
      .filter((entry) => entry.groups.length);
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
    setIconButton(this.shadowRoot.getElementById("add-btn"), hass, "add_product", "mdi:plus");
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
    const filtered = this._products
      .filter(
        (product) =>
          product.name.toLowerCase().includes(needle) &&
          (!this._filterStoreId ||
            product.store_subentry_id === this._filterStoreId)
      )
      .sort(
        (a, b) =>
          this._storeTitle(a.store_subentry_id).localeCompare(
            this._storeTitle(b.store_subentry_id)
          ) || a.name.localeCompare(b.name)
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
        const storeCategory = `${store} – ${category}`;
        const barcodeCount = `${product.barcodes.length} ${t(
          hass,
          "product_barcode_count"
        )}`;
        const barcodeTooltip = product.barcodes.length
          ? _escapeAttr(product.barcodes.join(", "))
          : "";
        const dishes = this._dishesUsing(product.id);
        const dishTooltip = _escapeAttr(dishes.map((d) => d.name).join(", "));
        const tabs = this._tabsShowing(product);
        const tabTooltip = _escapeAttr(
          tabs
            .map(({ tab, groups }) => `${tab.name}: ${groups.map((g) => g.name).join(", ")}`)
            .join(" | ")
        );
        return `
          <tr>
            <td data-label="${_escapeAttr(t(hass, "product_name"))}">${_escape(
          product.name
        )}</td>
            <td data-label="${_escapeAttr(
              t(hass, "product_store_category")
            )}">${_escape(storeCategory)}</td>
            <td data-label="${_escapeAttr(
              t(hass, "product_barcodes")
            )}" title="${barcodeTooltip}">${barcodeCount}</td>
            <td data-label="${_escapeAttr(
              t(hass, "product_dishes")
            )}" title="${dishTooltip}">${dishes.length}</td>
            <td data-label="${_escapeAttr(
              t(hass, "product_tabs")
            )}" title="${tabTooltip}">${tabs.length}</td>
            <td class="row-actions">
              <button class="icon-only" ${
                iconButtonMarkup(hass, "add_to_list", "mdi:cart-plus").attrs
              } data-action="add-to-list" data-id="${product.id}">${
          iconButtonMarkup(hass, "add_to_list", "mdi:cart-plus").content
        }</button>
              <button class="secondary icon-only" ${
                iconButtonMarkup(hass, "edit", "mdi:pencil").attrs
              } data-action="edit" data-id="${product.id}">${
          iconButtonMarkup(hass, "edit", "mdi:pencil").content
        }</button>
              <button class="danger icon-only" ${
                iconButtonMarkup(hass, "delete", "mdi:delete-outline").attrs
              } data-action="delete" data-id="${product.id}">${
          iconButtonMarkup(hass, "delete", "mdi:delete-outline").content
        }</button>
            </td>
          </tr>`;
      })
      .join("");

    listEl.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>${t(hass, "product_name")}</th>
            <th>${t(hass, "product_store_category")}</th>
            <th>${t(hass, "product_barcodes")}</th>
            <th>${t(hass, "product_dishes")}</th>
            <th>${t(hass, "product_tabs")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  async _refreshCategoriesForStore(storeId) {
    if (!storeId) {
      return;
    }
    try {
      const { categories } = await callWS(
        this._hass,
        "meals_and_groceries/categories/list",
        { subentry_id: storeId }
      );
      this._categoriesByStore[storeId] = categories;
    } catch (err) {
      this._error = err?.message || String(err);
    }
  }

  async _openForm(productId) {
    this._editingProductId = productId;
    this._formOpen = true;
    // Re-fetch the catalog so the form never resurrects references that were
    // cleaned up server-side (e.g. after a group was deleted elsewhere).
    await this._loadProducts();
    const product = productId
      ? this._products.find((p) => p.id === productId)
      : null;
    this._formBarcodes = product ? [...product.barcodes] : [];
    this._formGroupIds = product ? [...(product.group_ids || [])] : [];
    this._formStoreId =
      product?.store_subentry_id || this._stores[0]?.subentry_id || "";
    this._formCategoryId = product?.category_id || "";
    this._formNameValue = product?.name || "";
    // Categories/groups may have changed since the initial bulk load (e.g.
    // edited on their config pages), so always fetch fresh lists right
    // before showing the form.
    await this._refreshCategoriesForStore(this._formStoreId);
    try {
      await this._loadLinks();
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._formDishIds = productId
      ? this._dishesUsing(productId).map((d) => d.id)
      : [];
    this._renderForm();
  }

  /**
   * Called by the root panel's unknown-barcode inbox. If a form (add or
   * edit) is already open, the barcode is just appended there instead of
   * discarding in-progress edits by opening a fresh add-product form.
   */
  async openWithBarcode(barcode) {
    if (!this._formOpen) {
      await this._openForm(null);
    }
    if (!this._formBarcodes.includes(barcode)) {
      this._formBarcodes.push(barcode);
      this._renderChips();
    }
  }

  _closeForm() {
    this._editingProductId = null;
    this._formOpen = false;
    this.shadowRoot.getElementById("form-container").innerHTML = "";
  }

  _renderForm() {
    const hass = this._hass;
    const container = this.shadowRoot.getElementById("form-container");
    const isEdit = this._editingProductId !== null;
    const categories = this._categoriesByStore[this._formStoreId] || [];

    container.innerHTML = `
      <div class="overlay" id="overlay">
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
          <select id="f-store">
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
          <label>${t(hass, "product_groups")}</label>
          <div id="group-chips" class="chips"></div>
          <mag-search-picker id="f-group-add"></mag-search-picker>
        </div>
        <div class="form-row">
          <label>${t(hass, "product_dishes")}</label>
          <div id="dish-chips" class="chips"></div>
          <mag-search-picker id="f-dish-add"></mag-search-picker>
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

    this._renderChips();
    this._renderGroupChips();
    this._renderDishChips();

    container.querySelector("#f-dish-add").addEventListener("pick", (event) => {
      const dishId = event.detail.id;
      if (dishId && !this._formDishIds.includes(dishId)) {
        this._formDishIds.push(dishId);
        this._renderDishChips();
      }
    });
    container.querySelector("#dish-chips").addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-dish]");
      if (!button) {
        return;
      }
      this._formDishIds = this._formDishIds.filter(
        (id) => id !== button.dataset.removeDish
      );
      this._renderDishChips();
    });
    container.querySelector("#f-group-add").addEventListener("pick", (event) => {
      const groupId = event.detail.id;
      if (groupId && !this._formGroupIds.includes(groupId)) {
        this._formGroupIds.push(groupId);
        this._renderGroupChips();
      }
    });
    container.querySelector("#group-chips").addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-group]");
      if (!button) {
        return;
      }
      this._formGroupIds = this._formGroupIds.filter(
        (id) => id !== button.dataset.removeGroup
      );
      this._renderGroupChips();
    });

    container.querySelector("#overlay").addEventListener("click", (event) => {
      if (event.target.id === "overlay") {
        this._closeForm();
      }
    });
    container.querySelector("#f-name").addEventListener("input", (event) => {
      this._formNameValue = event.target.value;
    });
    container.querySelector("#f-store").addEventListener("change", async (event) => {
      this._formStoreId = event.target.value;
      this._formCategoryId = "";
      await this._refreshCategoriesForStore(this._formStoreId);
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

  _renderGroupChips() {
    const hass = this._hass;
    const chipsEl = this.shadowRoot.getElementById("group-chips");
    const selectEl = this.shadowRoot.getElementById("f-group-add");
    if (!chipsEl || !selectEl) {
      return;
    }
    chipsEl.innerHTML = this._formGroupIds
      .map((groupId) => {
        const name = this._groups.find((g) => g.id === groupId)?.name || "?";
        return `
        <span class="chip">
          ${_escape(name)}
          <button data-remove-group="${_escapeAttr(groupId)}" title="${t(
          hass,
          "delete"
        )}">×</button>
        </span>`;
      })
      .join("");

    // Groups belong to a tab — offer them grouped by tab, in tab order.
    selectEl.placeholder = t(hass, "add_group");
    selectEl.items = this._tabs.flatMap((tab) =>
      (tab.group_ids || [])
        .map((groupId) => this._groups.find((g) => g.id === groupId))
        .filter((group) => group && !this._formGroupIds.includes(group.id))
        .map((group) => ({ id: group.id, label: group.name, group: tab.name }))
    );
  }

  _renderDishChips() {
    const hass = this._hass;
    const chipsEl = this.shadowRoot.getElementById("dish-chips");
    const selectEl = this.shadowRoot.getElementById("f-dish-add");
    if (!chipsEl || !selectEl) {
      return;
    }
    chipsEl.innerHTML = this._formDishIds
      .map((dishId) => {
        const name = this._dishes.find((d) => d.id === dishId)?.name || "?";
        return `
        <span class="chip">
          ${_escape(name)}
          <button data-remove-dish="${_escapeAttr(dishId)}" title="${t(
          hass,
          "delete"
        )}">×</button>
        </span>`;
      })
      .join("");

    selectEl.placeholder = t(hass, "add_dish_link");
    selectEl.items = this._dishes
      .filter((dish) => !this._formDishIds.includes(dish.id))
      .map((dish) => ({ id: dish.id, label: dish.name }));
  }

  /**
   * Dish links live on the dishes (ingredients), not on the product — apply
   * the form's dish selection by updating every dish whose membership changed.
   */
  async _saveDishLinks(productId) {
    for (const dish of this._dishes) {
      const ingredients = dish.ingredients || [];
      const linked = ingredients.includes(productId);
      const wanted = this._formDishIds.includes(dish.id);
      if (linked === wanted) {
        continue;
      }
      await callWS(this._hass, "meals_and_groceries/dishes/update", {
        dish_id: dish.id,
        name: dish.name,
        kind: dish.kind,
        notes: dish.notes ?? null,
        ingredients: wanted
          ? [...ingredients, productId]
          : ingredients.filter((id) => id !== productId),
      });
    }
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
      let productId = this._editingProductId;
      if (productId) {
        await callWS(hass, "meals_and_groceries/products/update", {
          product_id: this._editingProductId,
          name,
          store_subentry_id: this._formStoreId,
          category_id: this._formCategoryId || null,
          barcodes: this._formBarcodes,
          group_ids: this._formGroupIds,
        });
      } else {
        const { product } = await callWS(hass, "meals_and_groceries/products/add", {
          name,
          store_subentry_id: this._formStoreId,
          category_id: this._formCategoryId || null,
          barcodes: this._formBarcodes,
          group_ids: this._formGroupIds,
        });
        productId = product.id;
      }
      await this._saveDishLinks(productId);
      this._closeForm();
      await this._loadLinks();
      await this._loadProducts();
    } catch (err) {
      window.alert(`${t(hass, "error_prefix")}: ${err?.message || err}`);
    }
  }

  async _addToList(productId) {
    const product = this._products.find((p) => p.id === productId);
    const store = this._stores.find(
      (s) => s.subentry_id === product?.store_subentry_id
    );
    if (!product || !store?.todo_entity_id) {
      return;
    }
    try {
      await this._hass.callService("todo", "add_item", {
        entity_id: store.todo_entity_id,
        item: product.name,
      });
    } catch (err) {
      window.alert(`${t(this._hass, "error_prefix")}: ${err?.message || err}`);
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

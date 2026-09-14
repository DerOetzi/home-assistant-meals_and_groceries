import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";
import {
  PRODUCT_TILE_CSS,
  renderProductTileHtml,
  resolveTileState,
  toggleProductTile,
} from "../cards/product-tile.js";
import { subscribeTodoItems } from "../cards/todo-subscribe.js";
import { setIconButton } from "../cards/icon-button.js";

// Daily-use shopping view for one store: only the items currently on the
// list are shown — catalog products grouped by category (walking route),
// non-catalog items under "Sonstiges". Tapping an item removes it
// (check-off = remove). Live-synced across sessions via the shared todo
// subscription.
class MealsAndGroceriesShoppingListView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._stores = [];
    this._products = [];
    this._categoriesByStore = {};
    this._selectedStoreId = "";
    this._items = [];
    this._unsub = null;
    this._error = null;
    this._selectSubscribed = false;
    // Deep link (/meals-and-groceries/shoppinglist/todo.edeka) may arrive
    // before the stores are loaded — remembered until _loadAll can map it.
    this._pendingTodoEntityId = "";
    this._ignoreNextSelectedReplay = false;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._buildShell();
    }
  }

  disconnectedCallback() {
    this._unsubscribe();
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
      this._subscribeSelectedList();
    } else {
      // Chip badges are fed by the todo entities' states — keep them live.
      this._renderStoreChips();
    }
  }

  get hass() {
    return this._hass;
  }

  // The select_shopping_list service (e.g. a zone-based automation) pushes
  // the list to show; the server also replays the current selection right
  // after subscribing.
  _subscribeSelectedList() {
    if (this._selectSubscribed || !this._hass?.connection) {
      return;
    }
    this._selectSubscribed = true;
    this._hass.connection.subscribeMessage(
      (message) => {
        const storeId = message?.subentry_id;
        if (!storeId || storeId === this._selectedStoreId) {
          return;
        }
        // A deep link is an explicit request from this session — don't let
        // the replayed server-side selection overwrite it.
        if (this._ignoreNextSelectedReplay) {
          this._ignoreNextSelectedReplay = false;
          return;
        }
        if (this._stores.length) {
          this._selectStore(storeId);
        } else {
          // Stores not loaded yet — _loadAll picks this up as the default.
          this._selectedStoreId = storeId;
        }
      },
      { type: "meals_and_groceries/selected_list/subscribe" }
    );
  }

  refresh() {
    if (this._hass) {
      this._loadAll();
    }
  }

  // Deep-link entry point: select a list by its todo entity id
  // (e.g. "todo.edeka"). Applied immediately when the stores are known,
  // otherwise picked up by _loadAll.
  selectList(todoEntityId) {
    if (!todoEntityId) {
      return;
    }
    this._ignoreNextSelectedReplay = true;
    const store = this._stores.find(
      (s) => s.todo_entity_id === todoEntityId
    );
    if (store) {
      this._pendingTodoEntityId = "";
      if (store.subentry_id !== this._selectedStoreId) {
        this._selectStore(store.subentry_id);
      }
      return;
    }
    this._pendingTodoEntityId = todoEntityId;
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
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
        button.icon-only {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          padding: 0;
          flex-shrink: 0;
        }
        .store-chips {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .store-chip {
          flex: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 18px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, inherit);
          cursor: pointer;
          font: inherit;
          white-space: nowrap;
        }
        .store-chip.active {
          background: var(--primary-color, #03a9f4);
          border-color: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
        }
        .store-chip .badge {
          display: inline-block;
          min-width: 18px;
          padding: 0 5px;
          border-radius: 9px;
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
          font-size: 11px;
          line-height: 18px;
          text-align: center;
        }
        .store-chip.active .badge {
          background: var(--text-primary-color, #fff);
          color: var(--primary-color, #03a9f4);
        }
        .add-row { display: flex; gap: 8px; margin-bottom: 16px; }
        .add-row input { flex: 1; }
        #error { color: var(--error-color, #db4437); }
        .category-heading {
          margin: 16px 0 8px;
          font-size: 13px;
          font-weight: 500;
          color: var(--secondary-text-color, inherit);
          text-transform: uppercase;
        }
        .tiles {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
        }
        ${PRODUCT_TILE_CSS}
      </style>
      <div class="store-chips" id="store-chips"></div>
      <div class="add-row">
        <input id="add-input" type="text" />
        <button id="add-btn" class="icon-only"></button>
      </div>
      <div id="error"></div>
      <div id="content"></div>
    `;

    this.shadowRoot
      .getElementById("store-chips")
      .addEventListener("click", (event) => {
        const chip = event.target.closest("[data-store-id]");
        if (chip && chip.dataset.storeId !== this._selectedStoreId) {
          // A user-initiated switch is a real navigation step.
          this._selectStore(chip.dataset.storeId, false);
        }
      });
    const addInput = this.shadowRoot.getElementById("add-input");
    addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._addFreeText();
      }
    });
    this.shadowRoot
      .getElementById("add-btn")
      .addEventListener("click", () => this._addFreeText());
    this.shadowRoot.getElementById("content").addEventListener("click", (event) => {
      const tile = event.target.closest("[data-product-id]");
      if (tile) {
        this._toggleProduct(tile.dataset.productId);
        return;
      }
      const other = event.target.closest("[data-item-uid]");
      if (other) {
        this._removeItem(other.dataset.itemUid);
      }
    });
  }

  async _loadAll() {
    try {
      const [{ stores }, { products }] = await Promise.all([
        callWS(this._hass, "meals_and_groceries/stores/list"),
        callWS(this._hass, "meals_and_groceries/products/list"),
      ]);
      this._stores = stores;
      this._products = products;
      this._error = null;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._applyLabels();
    if (this._pendingTodoEntityId) {
      const linked = this._stores.find(
        (s) => s.todo_entity_id === this._pendingTodoEntityId
      );
      this._pendingTodoEntityId = "";
      if (linked) {
        this._selectedStoreId = linked.subentry_id;
      }
    }
    this._renderStoreChips();
    const storeId =
      this._selectedStoreId || this._stores[0]?.subentry_id || "";
    if (storeId) {
      await this._selectStore(storeId);
    } else {
      this._renderContent();
    }
  }

  _applyLabels() {
    const hass = this._hass;
    this.shadowRoot.getElementById("add-input").placeholder = t(
      hass,
      "shoppinglist_add_placeholder"
    );
    setIconButton(
      this.shadowRoot.getElementById("add-btn"),
      hass,
      "shoppinglist_add_button",
      "mdi:plus"
    );
  }

  _renderStoreChips() {
    const chipsEl = this.shadowRoot?.getElementById("store-chips");
    if (!chipsEl) {
      return;
    }
    chipsEl.innerHTML = this._stores
      .map((store) => {
        const count = Number(
          this._hass?.states[store.todo_entity_id]?.state
        );
        const badge =
          count > 0 ? `<span class="badge">${count}</span>` : "";
        return `
          <button
            class="store-chip ${
              store.subentry_id === this._selectedStoreId ? "active" : ""
            }"
            data-store-id="${store.subentry_id}"
          >${_escape(store.title)}${badge}</button>`;
      })
      .join("");
  }

  // `replaceUrl` distinguishes "this is where we already were" (deep link,
  // default selection, server push — rewrite the address bar in place) from
  // a user switching lists, which earns its own history entry.
  async _selectStore(storeId, replaceUrl = true) {
    this._selectedStoreId = storeId;
    this._renderStoreChips();
    this._notifyListSelected(replaceUrl);
    if (!this._categoriesByStore[storeId]) {
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
    this._resubscribe();
    this._renderContent();
  }

  get selectedTodoEntityId() {
    return this._store()?.todo_entity_id || "";
  }

  _notifyListSelected(replace) {
    const todoEntityId = this.selectedTodoEntityId;
    if (!todoEntityId) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("mag-list-selected", {
        bubbles: true,
        composed: true,
        detail: { todoEntityId, replace },
      })
    );
  }

  _store() {
    return this._stores.find((s) => s.subentry_id === this._selectedStoreId);
  }

  _resubscribe() {
    this._unsubscribe();
    const store = this._store();
    if (!store?.todo_entity_id) {
      return;
    }
    this._items = [];
    this._unsub = subscribeTodoItems(
      this._hass,
      store.todo_entity_id,
      (items) => {
        this._items = items || [];
        this._renderContent();
      }
    );
  }

  _unsubscribe() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  }

  _renderContent() {
    const hass = this._hass;
    const errorEl = this.shadowRoot.getElementById("error");
    errorEl.textContent = this._error
      ? `${t(hass, "error_prefix")}: ${this._error}`
      : "";

    const contentEl = this.shadowRoot.getElementById("content");
    const storeId = this._selectedStoreId;
    if (!storeId) {
      contentEl.innerHTML = `<p><em>${t(hass, "no_stores")}</em></p>`;
      return;
    }

    // Only items currently on the list are shown — tapping removes them.
    const storeProducts = this._products.filter(
      (p) =>
        p.store_subentry_id === storeId &&
        resolveTileState(this._items, p.name).isOn
    );
    const categories = [...(this._categoriesByStore[storeId] || [])].sort(
      (a, b) => a.sort_index - b.sort_index
    );

    const sections = [];
    const renderTiles = (products) =>
      products
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((product) =>
          renderProductTileHtml({
            id: product.id,
            name: product.name,
            subtitle: null,
            isOn: true,
          })
        )
        .join("");

    for (const category of categories) {
      const products = storeProducts.filter((p) => p.category_id === category.id);
      if (products.length === 0) {
        continue;
      }
      sections.push(`
        <div class="category-heading">${_escape(category.name)}</div>
        <div class="tiles">${renderTiles(products)}</div>`);
    }
    const uncategorized = storeProducts.filter(
      (p) => !p.category_id || !categories.some((c) => c.id === p.category_id)
    );
    if (uncategorized.length > 0) {
      sections.push(`
        <div class="category-heading">${t(hass, "product_no_category")}</div>
        <div class="tiles">${renderTiles(uncategorized)}</div>`);
    }

    // Open items that match no catalog product of this store.
    const catalogNames = new Set(
      storeProducts.map((p) => p.name.toLowerCase())
    );
    const otherItems = this._items.filter(
      (item) =>
        item.status === "needs_action" &&
        !catalogNames.has((item.summary || "").toLowerCase())
    );
    if (otherItems.length > 0) {
      sections.push(`
        <div class="category-heading">${t(hass, "shoppinglist_other_items")}</div>
        <div class="tiles">${otherItems
          .map((item) =>
            renderProductTileHtml({
              itemUid: item.uid,
              name: item.summary || "",
              subtitle: null,
              isOn: true,
            })
          )
          .join("")}</div>`);
    }

    if (sections.length === 0) {
      contentEl.innerHTML = `<p><em>${t(hass, "shoppinglist_empty")}</em></p>`;
      return;
    }
    contentEl.innerHTML = sections.join("");
  }

  async _toggleProduct(productId) {
    const product = this._products.find((p) => p.id === productId);
    const store = this._store();
    if (!product || !store?.todo_entity_id) {
      return;
    }
    const { isOn, currentItemUid } = resolveTileState(this._items, product.name);
    try {
      await toggleProductTile(this._hass, {
        todoEntityId: store.todo_entity_id,
        productName: product.name,
        isOn,
        currentItemUid,
      });
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderContent();
    }
  }

  async _removeItem(uid) {
    const store = this._store();
    if (!store?.todo_entity_id || !uid) {
      return;
    }
    try {
      await this._hass.callService("todo", "remove_item", {
        entity_id: store.todo_entity_id,
        item: uid,
      });
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderContent();
    }
  }

  async _addFreeText() {
    const input = this.shadowRoot.getElementById("add-input");
    const value = input.value.trim();
    const store = this._store();
    if (!value || !store?.todo_entity_id) {
      return;
    }
    try {
      await this._hass.callService("todo", "add_item", {
        entity_id: store.todo_entity_id,
        item: value,
      });
      input.value = "";
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderContent();
    }
  }
}

function _escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

if (!customElements.get("mag-shopping-list-view")) {
  customElements.define(
    "mag-shopping-list-view",
    MealsAndGroceriesShoppingListView
  );
}

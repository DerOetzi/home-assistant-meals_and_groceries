import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";
import {
  PRODUCT_TILE_CSS,
  renderProductTileHtml,
  resolveTileState,
  toggleProductTile,
} from "../cards/product-tile.js";
import { createMultiStoreSubscriptions } from "../cards/multi-store-subscribe.js";

// Generic daily-use view for one configured Tab entity: one section per
// referenced group (in the tab's configured order), tiles for the group's
// products across all stores, live-synced per store via shared todo
// subscriptions. The panel instantiates one element per configured tab and
// assigns the resolved Tab object via the `tab` property.
class MealsAndGroceriesGroupTabView extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._tab = null;
    this._stores = [];
    this._products = [];
    this._groups = [];
    this._itemsByStore = new Map();
    this._subs = null;
    this._error = null;
    this._loaded = false;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._buildShell();
    }
  }

  disconnectedCallback() {
    if (this._subs) {
      this._subs.closeAll();
      this._subs = null;
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

  set tab(tab) {
    this._tab = tab;
    if (this._loaded) {
      this._resubscribe();
      this._render();
    }
  }

  get tab() {
    return this._tab;
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
        #error { color: var(--error-color, #db4437); }
        .group-heading {
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
      <div id="error"></div>
      <div id="content"></div>
    `;

    this.shadowRoot.getElementById("content").addEventListener("click", (event) => {
      const tile = event.target.closest("[data-product-id]");
      if (tile) {
        this._toggleProduct(tile.dataset.productId);
      }
    });
  }

  async _loadAll() {
    try {
      const [{ stores }, { products }, { groups }] = await Promise.all([
        callWS(this._hass, "meals_and_groceries/stores/list"),
        callWS(this._hass, "meals_and_groceries/products/list"),
        callWS(this._hass, "meals_and_groceries/groups/list"),
      ]);
      this._stores = stores;
      this._products = products;
      this._groups = groups;
      this._error = null;
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._loaded = true;
    this._resubscribe();
    this._render();
  }

  _tabProducts() {
    const groupIds = this._tab?.group_ids || [];
    return this._products.filter((p) =>
      (p.group_ids || []).some((id) => groupIds.includes(id))
    );
  }

  _resubscribe() {
    if (!this._loaded || !this._hass) {
      return;
    }
    const storeIds = [
      ...new Set(this._tabProducts().map((p) => p.store_subentry_id)),
    ];
    if (!this._subs) {
      this._subs = createMultiStoreSubscriptions(
        this._hass,
        this._stores,
        (storeId, items) => {
          this._itemsByStore.set(storeId, items || []);
          this._render();
        }
      );
    }
    this._subs.update(storeIds);
  }

  _render() {
    const hass = this._hass;
    if (!this.shadowRoot || !hass) {
      return;
    }
    const errorEl = this.shadowRoot.getElementById("error");
    errorEl.textContent = this._error
      ? `${t(hass, "error_prefix")}: ${this._error}`
      : "";

    const contentEl = this.shadowRoot.getElementById("content");
    const groupIds = this._tab?.group_ids || [];
    const sections = [];

    for (const groupId of groupIds) {
      const group = this._groups.find((g) => g.id === groupId);
      if (!group) {
        continue; // orphaned reference to a deleted group
      }
      const products = this._products
        .filter((p) => (p.group_ids || []).includes(groupId))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (products.length === 0) {
        continue;
      }
      const tiles = products
        .map((product) => {
          const items = this._itemsByStore.get(product.store_subentry_id) || [];
          const { isOn } = resolveTileState(items, product.name);
          return renderProductTileHtml({
            id: product.id,
            name: product.name,
            subtitle: null,
            isOn,
          });
        })
        .join("");
      sections.push(`
        <div class="group-heading">${_escape(group.name)}</div>
        <div class="tiles">${tiles}</div>`);
    }

    contentEl.innerHTML = sections.length
      ? sections.join("")
      : `<p><em>${t(hass, "no_products")}</em></p>`;
  }

  async _toggleProduct(productId) {
    const product = this._products.find((p) => p.id === productId);
    const store = this._stores.find(
      (s) => s.subentry_id === product?.store_subentry_id
    );
    if (!product || !store?.todo_entity_id) {
      return;
    }
    const items = this._itemsByStore.get(store.subentry_id) || [];
    const { isOn, currentItemUid } = resolveTileState(items, product.name);
    try {
      await toggleProductTile(this._hass, {
        todoEntityId: store.todo_entity_id,
        productName: product.name,
        isOn,
        currentItemUid,
      });
    } catch (err) {
      this._error = err?.message || String(err);
      this._render();
    }
  }
}

function _escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

if (!customElements.get("mag-group-tab-view")) {
  customElements.define("mag-group-tab-view", MealsAndGroceriesGroupTabView);
}

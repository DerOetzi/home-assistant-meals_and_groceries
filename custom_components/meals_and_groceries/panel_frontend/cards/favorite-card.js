import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";
import { subscribeTodoItems } from "./todo-subscribe.js";
import {
  PRODUCT_TILE_CSS,
  renderProductTileHtml,
  resolveTileState,
  toggleProductTile,
} from "./product-tile.js";
import "./favorite-card-editor.js";

class MealsAndGroceriesFavoriteCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("meals-and-groceries-favorite-card-editor");
  }

  static getStubConfig() {
    return { product_id: "" };
  }

  setConfig(config) {
    if (!config.product_id) {
      throw new Error("meals-and-groceries-favorite-card: product_id is required");
    }
    this._config = config;
    this._product = null;
    this._store = null;
    this._categoryName = null;
    this._isOn = false;
    this._currentItemUid = null;
    this._error = null;
    this._unsub = null;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._render();
    }
  }

  disconnectedCallback() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._load();
    }
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 1;
  }

  async _load() {
    try {
      const [{ products }, { stores }] = await Promise.all([
        callWS(this._hass, "meals_and_groceries/products/list"),
        callWS(this._hass, "meals_and_groceries/stores/list"),
      ]);
      this._product = products.find((p) => p.id === this._config.product_id) || null;
      this._store =
        stores.find((s) => s.subentry_id === this._product?.store_subentry_id) || null;

      if (this._product?.category_id && this._store) {
        const { categories } = await callWS(
          this._hass,
          "meals_and_groceries/categories/list",
          { subentry_id: this._store.subentry_id }
        );
        this._categoryName =
          categories.find((c) => c.id === this._product.category_id)?.name || null;
      }

      if (this._store?.todo_entity_id) {
        this._unsub = subscribeTodoItems(
          this._hass,
          this._store.todo_entity_id,
          (items) => this._onItemsUpdate(items)
        );
      }
    } catch (err) {
      this._error = err?.message || String(err);
    }
    this._render();
  }

  _onItemsUpdate(items) {
    if (!items || !this._product) {
      return;
    }
    const { isOn, currentItemUid } = resolveTileState(items, this._product.name);
    this._isOn = isOn;
    this._currentItemUid = currentItemUid;
    this._render();
  }

  async _toggle() {
    if (!this._product || !this._store?.todo_entity_id) {
      return;
    }
    try {
      await toggleProductTile(this._hass, {
        todoEntityId: this._store.todo_entity_id,
        productName: this._product.name,
        isOn: this._isOn,
        currentItemUid: this._currentItemUid,
      });
      // The shared todo/item/subscribe push updates `_isOn`; no optimistic
      // local toggle needed.
    } catch (err) {
      console.error("Meals & Groceries favorite card: service call failed", err);
    }
  }

  _render() {
    if (!this.shadowRoot) {
      return;
    }
    const hass = this._hass;

    if (this._error) {
      this.shadowRoot.innerHTML = `<ha-card><div class="content">${t(
        hass,
        "error_prefix"
      )}: ${_escape(this._error)}</div></ha-card>`;
      return;
    }
    if (!this._product) {
      this.shadowRoot.innerHTML = `<ha-card><div class="content">${t(
        hass,
        "loading"
      )}</div></ha-card>`;
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        /* The shared tile carries the full card chrome; keep the required
           ha-card wrapper itself invisible so nothing renders doubled. */
        ha-card {
          background: none;
          box-shadow: none;
          border: none;
          border-radius: var(--ha-card-border-radius, 12px);
        }
        ${PRODUCT_TILE_CSS}
      </style>
      <ha-card>
        ${renderProductTileHtml({
          id: this._product.id,
          name: this._product.name,
          subtitle: this._categoryName,
          isOn: this._isOn,
        })}
      </ha-card>
    `;
    this.shadowRoot
      .querySelector(".tile")
      .addEventListener("click", () => this._toggle());
  }
}

function _escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

if (!customElements.get("meals-and-groceries-favorite-card")) {
  customElements.define(
    "meals-and-groceries-favorite-card",
    MealsAndGroceriesFavoriteCard
  );
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "meals-and-groceries-favorite-card",
  name: "Meals & Groceries Favorite",
  description: "Toggle a catalog product on/off a Meals & Groceries shopping list.",
});

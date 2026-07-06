import { t } from "../translations.js";
import { callWS } from "../ha-ws.js";
import { subscribeTodoItems } from "./todo-subscribe.js";
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
    const needle = this._product.name.toLowerCase();
    const match = items.find(
      (item) =>
        item.status === "needs_action" && (item.summary || "").toLowerCase() === needle
    );
    this._isOn = !!match;
    this._currentItemUid = match?.uid || null;
    this._render();
  }

  async _toggle() {
    if (!this._product || !this._store?.todo_entity_id) {
      return;
    }
    try {
      if (this._isOn) {
        // remove_item expects the item's UID, unlike add_item which takes
        // the summary text — using the name here would silently no-op.
        if (!this._currentItemUid) {
          return;
        }
        await this._hass.callService("todo", "remove_item", {
          entity_id: this._store.todo_entity_id,
          item: this._currentItemUid,
        });
      } else {
        await this._hass.callService("todo", "add_item", {
          entity_id: this._store.todo_entity_id,
          item: this._product.name,
        });
      }
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
        ha-card {
          cursor: pointer;
          padding: 12px 16px;
          transition: background-color 0.15s ease, color 0.15s ease, filter 0.1s ease;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, inherit);
          box-shadow: var(--ha-card-box-shadow, none);
          border-radius: var(--ha-card-border-radius, 12px);
        }
        ha-card:active { filter: brightness(0.95); }
        ha-card.on {
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
        }
        ha-card.on:active { filter: brightness(1.1); }
        .row { display: flex; align-items: center; gap: 12px; }
        .icon { flex: none; color: inherit; opacity: 0.85; }
        .text { flex: 1; min-width: 0; }
        .title {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .subtitle {
          font-size: 12px;
          opacity: 0.8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .check { flex: none; color: inherit; }
      </style>
      <ha-card class="${this._isOn ? "on" : ""}">
        <div class="row">
          <ha-icon
            class="icon"
            icon="${this._isOn ? "mdi:cart-check" : "mdi:cart-outline"}"
          ></ha-icon>
          <div class="text">
            <div class="title">${_escape(this._product.name)}</div>
            ${
              this._categoryName
                ? `<div class="subtitle">${_escape(this._categoryName)}</div>`
                : ""
            }
          </div>
          ${
            this._isOn
              ? `<ha-icon class="check" icon="mdi:check-circle"></ha-icon>`
              : ""
          }
        </div>
      </ha-card>
    `;
    this.shadowRoot
      .querySelector("ha-card")
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

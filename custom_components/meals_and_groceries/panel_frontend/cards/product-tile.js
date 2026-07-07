// Shared product-tile look & toggle logic. Used by the favorite Lovelace
// card, the meal-plan ingredients overlay, the shopping-list tab and the
// dynamic group tabs — all render the same tappable tile bound to one
// catalog product and its shopping list.

export const PRODUCT_TILE_CSS = `
  .tile {
    cursor: pointer;
    padding: 12px 16px;
    transition: background-color 0.15s ease, color 0.15s ease, filter 0.1s ease;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, inherit);
    box-shadow: var(--ha-card-box-shadow, none);
    border-radius: var(--ha-card-border-radius, 12px);
  }
  .tile:active { filter: brightness(0.95); }
  .tile.on {
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
  }
  .tile.on:active { filter: brightness(1.1); }
  .tile .row { display: flex; align-items: center; gap: 12px; }
  .tile .icon { flex: none; color: inherit; opacity: 0.85; }
  .tile .text { flex: 1; min-width: 0; }
  .tile .title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tile .subtitle {
    font-size: 12px;
    opacity: 0.8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tile .check { flex: none; color: inherit; }
`;

export function renderProductTileHtml({ id, name, subtitle, isOn }) {
  return `
    <div class="tile ${isOn ? "on" : ""}" data-product-id="${escapeHtml(id)}">
      <div class="row">
        <ha-icon
          class="icon"
          icon="${isOn ? "mdi:cart-check" : "mdi:cart-outline"}"
        ></ha-icon>
        <div class="text">
          <div class="title">${escapeHtml(name)}</div>
          ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
        </div>
        ${isOn ? `<ha-icon class="check" icon="mdi:check-circle"></ha-icon>` : ""}
      </div>
    </div>
  `;
}

// items: current todo items of the product's list (from todo/item/subscribe).
export function resolveTileState(items, productName) {
  const needle = (productName || "").toLowerCase();
  const match = (items || []).find(
    (item) =>
      item.status === "needs_action" && (item.summary || "").toLowerCase() === needle
  );
  return { isOn: !!match, currentItemUid: match?.uid || null };
}

export async function toggleProductTile(
  hass,
  { todoEntityId, productName, isOn, currentItemUid }
) {
  if (!todoEntityId) {
    return;
  }
  if (isOn) {
    // remove_item expects the item's UID, unlike add_item which takes the
    // summary text — using the name here would silently no-op.
    if (!currentItemUid) {
      return;
    }
    await hass.callService("todo", "remove_item", {
      entity_id: todoEntityId,
      item: currentItemUid,
    });
  } else {
    await hass.callService("todo", "add_item", {
      entity_id: todoEntityId,
      item: productName,
    });
  }
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

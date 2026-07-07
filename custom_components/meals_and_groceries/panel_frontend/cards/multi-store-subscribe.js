import { subscribeTodoItems } from "./todo-subscribe.js";

// Keeps one shared todo subscription per involved shopping list open at a
// time. Callers hand in the currently needed store ids; new ones are opened,
// obsolete ones closed. Used by views whose products span multiple stores
// (ingredients overlay, dynamic group tabs).
//
// stores: array from meals_and_groceries/stores/list (needs todo_entity_id).
// onUpdate(storeId, items) fires on every push of that store's list.
// Returns { update(storeIds), closeAll() }.
export function createMultiStoreSubscriptions(hass, stores, onUpdate) {
  const unsubs = new Map(); // storeId -> unsub fn

  function update(storeIds) {
    const wanted = new Set(storeIds);
    for (const [storeId, unsub] of unsubs) {
      if (!wanted.has(storeId)) {
        unsub();
        unsubs.delete(storeId);
      }
    }
    for (const storeId of wanted) {
      if (unsubs.has(storeId)) {
        continue;
      }
      const store = stores.find((s) => s.subentry_id === storeId);
      if (!store?.todo_entity_id) {
        continue;
      }
      unsubs.set(
        storeId,
        subscribeTodoItems(hass, store.todo_entity_id, (items) =>
          onUpdate(storeId, items)
        )
      );
    }
  }

  function closeAll() {
    for (const unsub of unsubs.values()) {
      unsub();
    }
    unsubs.clear();
  }

  return { update, closeAll };
}

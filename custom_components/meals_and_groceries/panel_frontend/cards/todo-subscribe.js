// Shared subscription manager for the native `todo/item/subscribe` websocket
// command. Multiple favorite cards often point at the same shopping list;
// opening one subscription per card causes a subscription storm on load.
// This opens a single subscription per (connection, entity) pair and
// multicasts updates to every subscriber, closing it once the last one
// detaches. Adapted from the same pattern in ha-shopping-list-card.

const _subs = new WeakMap(); // connection -> Map<entityId, SubRecord>

export function subscribeTodoItems(hass, entityId, listener) {
  const conn = hass.connection;
  let perConn = _subs.get(conn);
  if (!perConn) {
    perConn = new Map();
    _subs.set(conn, perConn);
  }

  let rec = perConn.get(entityId);
  if (!rec) {
    rec = { listeners: new Set(), lastItems: null, unsub: null, unsubPromise: null };
    perConn.set(entityId, rec);
    rec.unsubPromise = conn
      .subscribeMessage(
        (msg) => {
          rec.lastItems = msg?.items || [];
          for (const l of rec.listeners) {
            try {
              l(rec.lastItems);
            } catch (err) {
              console.error("Meals & Groceries todo subscription listener error", err);
            }
          }
        },
        { type: "todo/item/subscribe", entity_id: entityId }
      );
    rec.unsubPromise
      .then((unsub) => {
        rec.unsub = unsub;
      })
      .catch((err) => {
        console.error("Meals & Groceries todo subscription failed", err);
        perConn.delete(entityId);
        for (const l of rec.listeners) {
          try {
            l(null, err);
          } catch (_err) {
            // ignore listener errors during failure notification
          }
        }
      });
  }

  rec.listeners.add(listener);
  if (rec.lastItems) {
    queueMicrotask(() => {
      if (rec.listeners.has(listener)) {
        listener(rec.lastItems);
      }
    });
  }

  return () => {
    rec.listeners.delete(listener);
    if (rec.listeners.size === 0) {
      perConn.delete(entityId);
      if (rec.unsub) {
        try {
          rec.unsub();
        } catch (_err) {
          // ignore
        }
      } else if (rec.unsubPromise) {
        rec.unsubPromise
          .then((u) => {
            try {
              u();
            } catch (_err) {
              // ignore
            }
          })
          .catch(() => {});
      }
    }
  };
}

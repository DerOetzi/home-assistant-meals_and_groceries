export function callWS(hass, type, payload = {}) {
  return hass.callWS({ type, ...payload });
}

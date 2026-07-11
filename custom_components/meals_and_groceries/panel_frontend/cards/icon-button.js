import { t } from "../translations.js";

// Icon-only buttons across the config pages still need a text label for
// screen-reader users (and as a mouse-hover tooltip) — aria-label/title
// carry that, while the visible content is just the icon.

// For statically-built buttons updated imperatively (e.g. in _applyLabels).
export function setIconButton(el, hass, key, icon) {
  const label = t(hass, key);
  el.innerHTML = `<ha-icon icon="${icon}"></ha-icon>`;
  el.setAttribute("aria-label", label);
  el.title = label;
}

// For buttons rendered as part of a template-string row/list.
export function iconButtonMarkup(hass, key, icon) {
  const label = t(hass, key).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return {
    attrs: `aria-label="${label}" title="${label}"`,
    content: `<ha-icon icon="${icon}"></ha-icon>`,
  };
}

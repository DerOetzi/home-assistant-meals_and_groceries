export const TRANSLATIONS = {
  en: {
    tab_categories: "Categories",
    tab_products: "Products",
    tab_dishes: "Dishes",
    tab_mealplan: "Meal plan",
    loading: "Loading…",
    stores_label: "Shopping lists",
    no_stores:
      'No shopping lists yet. Add one via Settings → Devices & Services → Meals & Groceries → "Add sub-entry".',
    view_placeholder: "This view is not built yet — coming in a later phase.",
    error_prefix: "Error",
  },
  de: {
    tab_categories: "Kategorien",
    tab_products: "Produkte",
    tab_dishes: "Gerichte",
    tab_mealplan: "Wochenplan",
    loading: "Lädt…",
    stores_label: "Einkaufslisten",
    no_stores:
      'Noch keine Einkaufsliste. Lege eine an über Einstellungen → Geräte & Dienste → Meals & Groceries → "Untereintrag hinzufügen".',
    view_placeholder: "Diese Ansicht ist noch nicht gebaut — folgt in einer späteren Phase.",
    error_prefix: "Fehler",
  },
};

export function t(hass, key) {
  const lang = (hass?.locale?.language || hass?.language || "en").split("-")[0];
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return dict[key] ?? TRANSLATIONS.en[key] ?? key;
}

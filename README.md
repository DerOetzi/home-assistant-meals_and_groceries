# Meals & Groceries

Home-Assistant-Integration für Einkaufs- und Essensplanung: mehrere Einkaufslisten/Läden mit sortierbaren Produktkategorien, Produktverwaltung mit Barcodes, Gerichte/Restaurants und Wochenessensplan. Ersetzt eine bisherige Node-RED-Lösung.

> **Status:** In aktiver Entwicklung, Phase 1 (Kern: Einkaufslisten als eigene `todo`-Entities). Barcode-Scan, Wochenplan und das Verwaltungs-Panel folgen in weiteren Phasen.

## Installation

### HACS (empfohlen)

1. HACS öffnen → Integrationen → Benutzerdefiniertes Repository hinzufügen
2. URL: `https://github.com/DerOetzi/home-assistant-meals_and_groceries`
3. Kategorie: Integration
4. Herunterladen und Home Assistant neu starten

### Manuell

1. Den Ordner `custom_components/meals_and_groceries/` in den `custom_components/`-Ordner deiner HA-Installation kopieren
2. Home Assistant neu starten

## Einrichtung

Jede Einkaufsliste ist ein eigener Helfer, genau wie bei den nativen "To-do-Liste"-Helfern:

1. **Einstellungen → Geräte & Dienste → Helfer → Helfer hinzufügen**
2. "Meals & Groceries" auswählen
3. Namen der Liste eingeben (z.B. "Edeka") und bestätigen

Für jede weitere Einkaufsliste diesen Schritt wiederholen.

## Entwicklung

```bash
pip install homeassistant

python -m script.hassfest
```

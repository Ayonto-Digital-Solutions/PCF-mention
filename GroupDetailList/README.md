# Group Detail List (PCF)

Ein Power Apps Component Framework (PCF) Dataset-Component für modellgesteuerte Apps: Es zeigt
eine Dataverse-Ansicht als Liste, die sich nach einer beliebigen Spalte gruppieren, sortieren und
auswählen lässt.

Version 2.0.0 ist eine vollständige Neuimplementierung — siehe [Was sich geändert hat](#was-sich-geändert-hat).

## Überblick

| | |
|---|---|
| Component | `Ayonto.GroupDetailListControl` |
| Typ | `virtual` (React), Dataset |
| Plattform-Bibliotheken | React 16.14.0, Fluent UI v9 (9.46.2) |
| Unterstützte Apps | modellgesteuerte Apps |
| Bundle | 10 KiB (Production-Build) |

## Entwickeln

```bash
npm install
npm test                              # 47 Tests
npm run lint
npm run typecheck
npm run build -- --buildMode production
npm start watch                       # Test-Harness mit Beispieldaten
```

Deployment wie beim Mention-Control (`pac pcf push` bzw. `pac solution init` + `dotnet build`) —
siehe [../Mention/README.md](../Mention/README.md#in-eine-umgebung-deployen).

## Konfiguration

| Eigenschaft | Pflicht | Bedeutung |
|---|---|---|
| `listDataSet` | ja | Die anzuzeigende Ansicht. Command-Bar, Ansichtsauswahl und Schnellsuche sind aktiviert. |
| `pageSize` | nein | Datensätze pro Seite. Standard 50. |
| `enableGrouping` | ja | `Ja` (Standard) zeigt die Gruppierungsauswahl über der Liste, `Nein` blendet sie aus. |

## Verhalten

**Gruppieren.** Die Auswahl einer Spalte sortiert das Dataset serverseitig nach dieser Spalte und
fasst anschließend aufeinanderfolgende Zeilen mit gleichem Wert zu Gruppen zusammen. Ohne die
serverseitige Sortierung würde derselbe Wert über Seitengrenzen hinweg in mehreren Gruppen landen.

**Sortieren.** Ein Klick auf eine Spaltenüberschrift setzt die Sortierung des Datasets und lädt
neu — es wird also die gesamte Ansicht sortiert, nicht nur die geladene Seite.

**Auswählen.** Die Auswahl gehört der Komponente und wird über `setSelectedRecordIds` an das
Dataset gemeldet, damit Befehle in der Command-Bar dieselbe Menge sehen. Datensätze, die beim
Blättern die geladene Seite verlassen, fallen aus der Auswahl heraus.

**Öffnen.** Ein Klick auf die Primärspalte oder ein Doppelklick auf die Zeile öffnet den
Datensatz über `openDatasetItem` — das respektiert einen eventuell vorhandenen
`Mscrm.OpenRecordItem`-Befehl. Ein Lookup-Feld öffnet den *referenzierten* Datensatz,
E-Mail-Spalten werden zu `mailto:`, Telefonspalten zu `tel:`.

**Blättern.** Vor/Zurück laden die jeweilige Seite über die Paging-API des Datasets.

## Was sich geändert hat

| Alt (1.0, August 2020) | Neu (2.0) |
|---|---|
| `pcf-scripts` 1.3.6, webpack 4 | `pcf-scripts` 1.51.x, webpack 5, TypeScript 5.8 |
| `office-ui-fabric-react` v7 `DetailsList`, gebündelt (2689 KiB) | Fluent UI v9 als Plattform-Bibliothek (10 KiB) |
| `control-type="standard"`, `ReactDOM.render` in `updateView` | `control-type="virtual"`, `ComponentFramework.ReactControl` |
| `setPageSize(5000)` und Schleife über alle Seiten | Seitenweise über die Paging-API, Standard 50 |
| Clientseitiges Sortieren der geladenen Zeilen | Serverseitig über `dataset.sorting` + `refresh()` |
| `(context.mode as any).rowSpan` | Entfällt; Höhe über CSS |
| Alle `Device.*`-Features als `required` deklariert | Keine `feature-usage` — es wird keine gebraucht |
| Feste englische Texte im Code | `resx` für 1033 (en) und 1031 (de) |
| Keine Tests | 47 Tests |

Behobene Fehler aus 1.0:

* `onItemInvoked={this._onItemInvoked}` wurde ungebunden übergeben — der Doppelklick auf eine Zeile
  lief in `this.state` von `undefined`.
* `_totalColumnWidth` rief `reduce` ohne Startwert auf und warf bei einer Ansicht ohne Spalten.
* `componentWillReceiveProps` ist seit React 16.9 abgekündigt und in React 18 entfernt.
* Telefonnummern verlinkten auf `skype:` — Skype for Business ist abgeschaltet.
* Lookup-Spalten öffneten den Zeilen-Datensatz statt des referenzierten.
* `setKey="parentcustomerid"` war ein Überbleibsel aus einem konkreten Einsatzfall.

### Breaking Changes

Der eindeutige Name ist von `xyz.GroupDetailListControl` auf `Ayonto.GroupDetailListControl`
gewechselt. Ein Wechsel von `standard` auf `virtual` ist laut Dokumentation keine Umstellung an
Ort und Stelle, und neue Pflichteigenschaften darf ein Component in einer neueren Version nicht
ergänzen — beides erzwingt einen neuen Namen. Bestehende Formulare müssen neu konfiguriert werden.

## Grenzen

* Nur modellgesteuerte Apps: virtuelle React-Components werden in Power Pages nicht unterstützt.
* Gruppiert wird über die geladene Seite. Eine Gruppe, die über eine Seitengrenze reicht, erscheint
  auf beiden Seiten mit ihrem jeweiligen Anteil.
* Gruppen sind nicht ein-/ausklappbar.

## Aufbau

```
GroupDetailList/
├─ GroupDetailListControl/
│  ├─ index.ts                        ReactControl, Dataset-Anbindung
│  ├─ ControlManifest.Input.xml
│  ├─ components/GroupDetailList.tsx  Toolbar, Auswahl-/Gruppierungszustand, Fußzeile
│  ├─ components/RecordTable.tsx      Tabelle, Gruppenköpfe, Zellentypen
│  ├─ utils/dataset.ts                Reine Abbildung Dataset → Grid
│  ├─ utils/format.ts                 Platzhalter in lokalisierten Texten
│  └─ strings/                        resx für 1033 und 1031
└─ tests/
```

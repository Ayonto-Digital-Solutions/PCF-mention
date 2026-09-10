# PCF-Controls

Zwei Power Apps Component Framework (PCF) Code-Components für modellgesteuerte Apps.

| Ordner | Component | Zweck |
|---|---|---|
| [`Mention/`](Mention) | `Ayonto.MentionControl` | `@`-Erwähnung von Dataverse-Benutzern in einer Textspalte, mit E-Mail-Benachrichtigung |
| [`GroupDetailList/`](GroupDetailList) | `Ayonto.GroupDetailListControl` | Dataverse-Ansicht als gruppierbare, sortierbare Liste |

Beide sind virtuelle React-Components auf Fluent UI v9. React und Fluent kommen als
[Plattform-Bibliotheken](https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries)
von der Plattform und landen nicht im Bundle.

## Stand

Beide Components stammten ursprünglich vom August 2020 und liefen auf `pcf-scripts` 1.3.6,
webpack 4, TypeScript 3.9 und `office-ui-fabric-react` v7. Sie sind vollständig neu geschrieben
gegen die heute dokumentierten Anforderungen. Was im Einzelnen nicht mehr galt, steht in der
jeweiligen README unter „Was sich geändert hat".

| | Mention | GroupDetailList |
|---|---|---|
| Bundle vorher | 2417 KiB | 2689 KiB |
| Bundle jetzt | 14 KiB | 10 KiB |
| Tests | 69 | 47 |

## Voraussetzungen

* Node.js ≥ 20 — `pcf-scripts` 1.51.x setzt das voraus
* [Microsoft Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction) (`pac`)
* .NET SDK oder Build Tools für Visual Studio 2022, nur zum Paketieren der Solution

## Entwickeln

Jedes Component ist ein eigenes npm-Projekt:

```bash
cd Mention          # oder GroupDetailList
npm install
npm test
npm run lint
npm run typecheck
npm run build -- --buildMode production
npm start watch     # lokaler Test-Harness
```

CI führt für beide Components und für Node 20 und 22 `lint`, `typecheck`, `test` und einen
Production-Build aus (siehe [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Deployen

```bash
pac auth create --url https://<org>.crm4.dynamics.com
cd Mention
pac pcf push --publisher-prefix <prefix>
```

Für ein Solution-Paket siehe [Mention/README.md](Mention/README.md#in-eine-umgebung-deployen).
Fertige `.zip`-Dateien liegen bewusst nicht im Repository: die früheren waren an eine fremde
Umgebung und einen Platzhalter-Publisher gebunden und ließen sich aus dem Quellstand nicht
reproduzieren.

## Lizenz

[MIT](LICENSE)

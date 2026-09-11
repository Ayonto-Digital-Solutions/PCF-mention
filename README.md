# PCF-Controls

Zwei Power Apps Component Framework (PCF) Code-Components für modellgesteuerte Apps.

| Ordner | Component | Zweck |
|---|---|---|
| [`Mention/`](Mention) | `Ayonto.MentionControl` | `@`-Erwähnung von Dataverse-Benutzern in einer Textspalte, benachrichtigt über eine Tabellenzeile und einen Flow |
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
| Bundle jetzt | 25 KiB | 14 KiB |
| Tests | 159 | 85 |

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

## Release

Ein Tag `vX.Y.Z` — oder ein Start des Workflows von Hand mit der Version als Eingabe, der das
Tag dann selbst setzt — prüft beide Components mit denselben vier Schritten wie die CI — ein Tag löst
`ci.yml` nicht aus, und aus einem Stand, der die Prüfung nicht besteht, darf kein Release
entstehen —, baut sie, erzeugt daraus über die Power Platform CLI eine Dataverse-Solution und
hängt sie an das GitHub-Release
([`.github/workflows/release.yml`](.github/workflows/release.yml)):

* `AyontoPcfControls_X.Y.Z.zip` — unmanaged, für Entwicklungsumgebungen
* `AyontoPcfControls_X.Y.Z_managed.zip` — managed, für Test und Produktion

Beide enthalten `Ayonto.MentionControl`, `Ayonto.GroupDetailListControl` und die Tabelle
`ayonto_mention`, in die Erwähnungen geschrieben werden, Publisher `ayonto`.
Die Solution wird bewusst im Workflow gebaut und nicht im Repository gehalten: sie ist ein
Build-Ergebnis, und der Workflow hat die .NET-Toolchain, die `pac` dafür braucht.

Der Workflow schreibt dabei die Version in beide `ControlManifest.Input.xml` und in die
`Solution.xml`: Dataverse übernimmt eine geänderte Komponente nur, wenn deren eigene Version
steigt. Im Repository bleiben die Manifeste auf ihrem Stand.

Lokal geht dasselbe mit:

```bash
cp -r solution AyontoPcfControls && cd AyontoPcfControls
pac solution add-reference --path ../Mention
pac solution add-reference --path ../GroupDetailList
dotnet build -c Release          # managed;  -c Debug erzeugt unmanaged
```

Das Solution-Projekt liegt unter [`solution/`](solution/) im Repository statt aus
`pac solution init` zu entstehen: Die mitgelieferte Tabelle braucht einen `RootComponent`-Eintrag
in `Solution.xml`, und den ergänzt der Build nicht von selbst. `.github/scripts/check-solution.py`
prüft bei jedem Pull Request, dass Tabellenordner und Eintrag zusammenpassen — sonst packt die
Lösung stillschweigend ohne die Tabelle.

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

## SendGrid notification provider

Die Lösung liefert den Benachrichtigungsweg mit: Tabelle, Cloud-Flow, beide Connection References
und beide Environment Variables sind Bestandteil des Pakets. Wer sie importiert, muss nichts
nachbauen — nur zuweisen, was in keine Lösung gehört.

| mitgeliefert | von der Zielumgebung zu stellen |
|---|---|
| Tabelle `ayonto_mention` samt Ansicht | Verbindung Dataverse |
| Flow *Ayonto – Send Mention Notification* | Verbindung SendGrid (trägt den API-Key) |
| Connection References für beide Connectoren | Wert der Absenderadresse |
| Environment Variables für Absender, Umgebungs-URL und App-ID | verifizierter Absender bei SendGrid |

Der Flow löst auf **neue** Zeilen mit `ayonto_deliverystatus = New` aus, verschickt über SendGrid
und schreibt `Sent` oder `Failed` in dieselbe Zeile zurück. Dass er nur auf neue Zeilen hört, ist
die Bedingung dafür: die Rückschreibung ändert die Zeile, die ihn ausgelöst hat.

Die Komponente hat je Kanal — E-Mail und Teams — einen eigenen Schalter, Betreff, Text und
Linkbeschriftung, und schreibt je eingeschaltetem Kanal eine Zeile. Der Flow bedient davon den
**E-Mail-Zweig**; weitere Kanäle ergänzt man im Schalter `Kanal`, statt sie mitgeliefert zu
bekommen. Zwei Gründe: eine Aktion für einen Connector, den die Zielumgebung nicht freigegeben
hat, blockiert den Import der ganzen Lösung — und wie eine Chat-Nachricht aussieht, ist eine
Hausentscheidung.

Jede Benachrichtigung trägt einen Link auf den Datensatz, in dem erwähnt wurde, und dafür ist
nichts einzutragen: der Flow liest die ausgelöste Zeile zurück und nimmt die Umgebungsadresse aus
deren `@odata.id`. Den Link selbst nimmt er aus `ayonto_recordurl`, wenn die Komponente einen
geschrieben hat, und baut ihn sonst aus Tabelle und Zeilen-ID. Kennt auch die Zeile keinen
Datensatz, entfällt der Absatz, statt einen toten Link zu zeigen.

Der API-Key steht ausschließlich in der SendGrid-Verbindung — nicht im Flow, nicht in einer
Environment Variable, nicht in der Lösung, und damit auch in keiner Kopie davon. Eine
Teams-Aktion enthält der Flow bewusst nicht: ein Connector, den die Zielumgebung nicht lizenziert
oder freigegeben hat, blockiert den Import der ganzen Lösung. Wie man einen zweiten Kanal
trotzdem ergänzt, steht im Einrichtungsdokument.

Einrichtung, Umbau eines vorhandenen Flows und alle Ausdrücke zum Kopieren:
**[solution/README.md](solution/README.md)**.

## Abhängigkeiten und Sicherheit

`npm audit` meldet in beiden Komponenten Befunde. Der Stand, geprüft am 10. September 2026:

| | |
|---|---|
| `npm audit` | 11 (4 hoch, 7 mittel) — je Komponente dieselben |
| `npm audit --omit=dev` | **0** |

**Nichts davon steckt im ausgelieferten Bundle.** Beide Components sind
`control-type="virtual"` und beziehen React und Fluent als Plattform-Bibliothek; webpack behandelt
sie als Externals. Was übrig bleibt, ist der eigene Quellcode — 25 KiB bzw. 15 KiB, ohne eine
einzige fremde Bibliothek. Alle Befunde liegen in Build- und Testwerkzeug: `pcf-scripts`,
`pcf-start`, `vitest`.

**Die verbleibenden 11 lassen sich hier nicht beheben.** `pcf-scripts` und `pcf-start` 1.51.1 —
die aktuellen Versionen — pinnen `applicationinsights@^2` und `browser-sync@^3`, und die
Korrekturen liegen jeweils in der nächsten Hauptversion. `npm audit` behauptet bei neun Befunden
„fix available via `npm audit fix`"; das trifft nicht zu, der Dry-Run ändert nichts. Es braucht ein
Release von Microsoft. Was behebbar war, ist behoben: `happy-dom` 15 → 20 hat den einzigen
kritischen Befund (VM-Context-Escape) ausgeräumt. Der letzte behebbare — Pfad-Traversierung in
`@vitest/mocker`, mittel — hängt an `vitest` 3 → 4; npm 10.9.7 bricht beim Auflösen mit
`Cannot read properties of null (reading 'edgesOut')` ab, und die Umgehung würde `vite` als
zusätzliche Abhängigkeit und ein Lockfile mit `--legacy-peer-deps` erfordern. Das ist für eine
Lücke, die nur greift, wenn jemand die Testdateien dieses Repositories kontrolliert, der
schlechtere Tausch. Bleibt offen, bis npm oder vitest nachziehen.

## Lizenz

[MIT](LICENSE)

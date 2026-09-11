# Mention Control (PCF)

Ein Power Apps Component Framework (PCF) Code-Component für modellgesteuerte Apps: Man tippt `@`
in einer Textspalte, wählt eine Dataverse-Benutzerin oder einen Dataverse-Benutzer aus der
Vorschlagsliste und die erwähnte Person wird benachrichtigt: Das Component schreibt eine Zeile in
die Tabelle `ayonto_mention`, ein Cloud-Flow verschickt sie.

Version 2.0.0 ist eine vollständige Neuimplementierung. Der Stand von 2020 lief auf
Tooling und APIs, die es so nicht mehr gibt — siehe [Was sich geändert hat](#was-sich-geändert-hat).

## Überblick

| | |
|---|---|
| Component | `Ayonto.MentionControl` |
| Typ | `virtual` (React) |
| Plattform-Bibliotheken | React 16.14.0, Fluent UI v9 (9.46.2) |
| Unterstützte Apps | modellgesteuerte Apps |
| Bundle | 25 KiB (Production-Build) |

React und Fluent werden von der Plattform bereitgestellt und nicht mitgebündelt
([platform libraries](https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries)).

## Voraussetzungen

* Node.js ≥ 20 (`pcf-scripts` 1.51.x setzt das voraus)
* [Microsoft Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction) (`pac`)
* .NET SDK oder die Build Tools für Visual Studio 2022 — nur nötig, um die Solution zu paketieren

## Entwickeln

```bash
npm install
npm test                              # 159 Tests
npm run lint
npm run typecheck
npm run build                         # Debug-Build nach out/controls
npm run build -- --buildMode production
npm start watch                       # Test-Harness mit Hot Reload
```

Der Test-Harness hat keine Dataverse-Verbindung. Die Benutzersuche und das Schreiben der
Erwähnungszeile brauchen `context.webAPI` und laufen deshalb nur in einer echten Umgebung.

### In eine Umgebung deployen

Für die innere Entwicklungsschleife:

```bash
pac auth create --url https://<org>.crm4.dynamics.com
pac pcf push --publisher-prefix <prefix>
```

Für ein Solution-Paket (ALM), im Wurzelverzeichnis des Repositories — dieselben Schritte, die
[`release.yml`](../.github/workflows/release.yml) ausführt:

```bash
cp -r solution AyontoPcfControls && cd AyontoPcfControls
pac solution add-reference --path ../Mention
pac solution add-reference --path ../GroupDetailList
dotnet build -c Release          # managed;  -c Debug erzeugt unmanaged
```

Das Solution-Projekt liegt fertig unter [`solution/`](../solution) — es enthält die Tabelle
`ayonto_mention`. `pac solution init` legt stattdessen ein leeres Projekt an: das paketiert und
importiert anstandslos, nur ohne Tabelle, und dann scheitert jede Erwähnung erst zur Laufzeit.

Das Ergebnis liegt in `AyontoPcfControls/bin/Release`. Fertige `.zip`-Dateien liegen bewusst
**nicht** mehr im Repository: sie waren an eine fremde Umgebung und einen Platzhalter-Publisher
(`xyz`) gebunden und lassen sich aus diesem Quellstand nicht reproduzieren.

## Konfiguration

Das Component wird auf einer Textspalte im Formular-Designer registriert.

| Eigenschaft | Pflicht | Bedeutung |
|---|---|---|
| `field` | ja | Die gebundene Textspalte. `SingleLine.Text`, `SingleLine.TextArea` oder `Multiple`. |
| `entityId` | für den Datensatzbezug | **An die Primärschlüsselspalte der Tabelle binden** (z. B. `accountid`). |
| `entityName` | für den Datensatzbezug | Logischer Tabellenname, z. B. `account`. Als statischer Wert setzbar oder an `entitylogicalname` gebunden. |
| `sendEmail` | ja | `Ja` (Standard) schreibt je erwähnter Person eine Zeile für den Kanal `Email`, `Nein` nicht. |
| `emailSubject` | nein | Betreff der E-Mail. |
| `emailContent` | nein | Text der E-Mail. |
| `emailLinkText` | nein | Beschriftung des Links auf den Datensatz. Standard „Datensatz öffnen". |
| `sendTeams` | nein | `Ja` schreibt zusätzlich eine Zeile für den Kanal `Teams`. Standard `Nein`. |
| `teamsSubject` | nein | Betreff der Chat-Nachricht. Leer = der E-Mail-Betreff. |
| `teamsContent` | nein | Text der Chat-Nachricht. Leer = der E-Mail-Text. |
| `teamsLinkText` | nein | Beschriftung des Links in der Chat-Nachricht. Leer = die der E-Mail. |
| `senderUserId` | nein | GUID des absendenden Benutzers. Ohne Angabe der angemeldete Benutzer. |
| `orgUrl` | nein | Umgebungs-URL, z. B. `https://contoso.crm4.dynamics.com`. Ohne sie baut der Flow den Link selbst. |
| `mentionTable` | nein | Andere Tabelle für die Erwähnungen. Leer = die mitgelieferte `ayonto_mention`. |
| `appId` | nein | ID der modellgesteuerten App, in der der Link geöffnet werden soll. |

**Den Datensatz muss man konfigurieren.** Ein Code-Component hat keinen Formularkontext, deshalb
ist der dokumentierte Weg, ihm den Datensatz als Eigenschaft zu übergeben: `entityId` an die
Primärschlüsselspalte binden, `entityName` auf den logischen Tabellennamen setzen. So steht es in
der [FAQ zum Component Framework][faq], und der Formular-Designer bietet die Primärschlüsselspalte
dafür an.

Zusätzlich liest das Component `context.mode.contextInfo`, falls die beiden Eigenschaften leer
sind. Das steht in **keiner** offiziellen Referenz — weder in der
[Context-Dokumentation][context] noch in den Typen von `@types/powerapps-component-framework`
1.3.18, weshalb es im Code einen Cast braucht. Es ist ein Notnagel für Hosts, die es trotzdem
melden, keine unterstützte Konfiguration: Wer sich darauf verlässt, hat keine Zusage, dass es in
der nächsten Version noch da ist. Was im Panel steht, gewinnt ohnehin.

Ohne Datensatzbezug funktioniert das Component weiter, die Benachrichtigung wird dann nur nicht mit
dem Datensatz verknüpft. `orgUrl` ist dagegen kein Muss mehr: bleibt es leer, liest der
mitgelieferte Flow die Umgebungsadresse aus der Zeile selbst — siehe
[solution/README.md](../solution/README.md#der-link-auf-den-datensatz).

**Jeder Kanal hat seine eigene Formulierung**, weil eine Chat-Nachricht woanders gelesen wird als
eine Mail. Was ein Kanal nicht für sich sagt, übernimmt er von der E-Mail; ist auch dort nichts
gesetzt, greift die Vorgabe des Components. Eine URL steht in keiner dieser Einstellungen — den
Link baut das Component beziehungsweise der Flow.

[faq]: https://learn.microsoft.com/power-apps/developer/component-framework/faq#how-can-i-access-the-record-id-or-table-name
[context]: https://learn.microsoft.com/power-apps/developer/component-framework/reference/context

## Wie die Benachrichtigung funktioniert

1. Eine Person wird aus der Vorschlagsliste gewählt; `@Vorname Nachname` wird in den Text geschrieben.
2. Nach der Karenzzeit legt das Component über `context.webAPI.createRecord` eine Zeile **je
   erwähnter Person und je eingeschaltetem Kanal** in der Tabelle **`ayonto_mention`** an — mit
   Empfänger, Absender, Kanal, Betreff, Text, Linkbeschriftung, dem Datensatz und einem fertigen
   Link darauf. Wer per Mail und per Chat benachrichtigt wird, bekommt zwei Zeilen: eine
   Statusspalte kann nicht gleichzeitig „die Mail kam an" und „die Chat-Nachricht nicht" bedeuten.
3. Ein Cloud-Flow, der auf neue Zeilen dieser Tabelle auslöst, verschickt die Benachrichtigung —
   per E-Mail, Teams oder was die Organisation sonst nutzt — und schreibt `ayonto_deliverystatus`
   auf `Sent` oder `Failed` zurück. Ein solcher Flow kommt mit der Lösung; einrichten, umbauen und
   alle Ausdrücke zum Kopieren stehen in [solution/README.md](../solution/README.md).

Benachrichtigt wird die Person, die in der Vorschlagsliste gewählt wurde — nicht der Name, der
dabei in den Text geschrieben wird. Das Component merkt sich zu jeder eingefügten Erwähnung deren
Benutzer-ID und führt sie beim Tippen mit.

**Entdoppelt wird über die Person, nicht über das Vorkommen im Text.** Wer im selben Text dreimal
erwähnt wird, bekommt eine Zeile, nicht drei; eine der drei Erwähnungen zu löschen ändert nichts.
Eine zweite Zeile entsteht erst, wenn kein Vorkommen dieser Person mehr im Text steht und sie
danach erneut gewählt wird. Das gilt, **solange das Formular geöffnet ist** — die Entdopplung lebt
im Component, nicht in der Tabelle. Wer den Datensatz neu lädt und dieselbe Person noch einmal
erwähnt, erzeugt eine zweite Zeile; ein Flow, der doppelte Benachrichtigungen ausschließen muss,
prüft das selbst.

Zwei gleichnamige Personen sind zwei verschiedene Empfänger, auch wenn im Text zweimal dasselbe
steht: Wer eine der beiden Erwähnungen löscht, verhindert genau deren Zeile, die des Namensvetters
bleibt. Welche der beiden gelöscht wurde, liest das Component an der Änderung ab — der Text danach
sieht in beiden Fällen gleich aus.

Dataverse wird bewusst **nicht** gebeten zu senden. Eine Umgebung, deren Postfächer nicht auf
serverseitige Synchronisierung eingerichtet sind, würde nur Entwürfe ansammeln, und die meisten
Organisationen versenden ohnehin über einen Flow mit ihrem eigenen Absender, ihren Vorlagen und
ihrem BCC.

Die Tabelle kommt mit der Lösung: `solution/src/Entities/ayonto_Mention/Entity.xml` beschreibt
sie samt ihrer Ansicht, der Import legt sie an. Die Ansicht steht bewusst **in** dieser Datei,
unter `<SavedQueries>` — ein Ordner `SavedQueries/` daneben wird von SolutionPackager nicht
gelesen: er paketiert kommentarlos und liefert eine Tabelle ohne Ansicht aus. Genau das ist in
2.2.0 passiert, weshalb `check-solution.py` einen solchen Ordner jetzt zurückweist und
`check-package.py` das fertige Paket dagegenhält. Wer sie woanders haben will, trägt den logischen Namen in die Eigenschaft
`mentionTable` ein — die Spaltennamen leiten sich dann vom Präfix dieser Tabelle ab, es braucht
also eine Tabelle mit denselben Spalten hinter dem Präfix.

Was in einer Zeile steht:

| Spalte | Inhalt |
|---|---|
| `ayonto_name` | `@Anna Berger · Contoso AG` — was in Ansichten lesbar ist |
| `ayonto_userid`, `ayonto_username`, `ayonto_useremail` | die erwähnte Person |
| `ayonto_mentionedbyid` | wer erwähnt hat |
| `ayonto_recordtable`, `ayonto_recordid`, `ayonto_recordname` | der Datensatz |
| `ayonto_recordurl` | fertiger Deep-Link, sofern `orgUrl` gesetzt ist |
| `ayonto_channel` | `Email` oder `Teams` — welchen Weg diese Zeile meint |
| `ayonto_subject`, `ayonto_message`, `ayonto_linktext` | Betreff, Text und Linkbeschriftung dieses Kanals |
| `ayonto_deliverystatus` | `New`, bis der Flow zurückschreibt |
| `ayonto_deliverydetail` | Fehlertext des Flows |

### Klickbare Erwähnungen

Solange das Feld nicht den Fokus hat, liegt über der Textfläche eine Ansicht, in der jede
Erwähnung ein Link auf die erwähnte Person ist (`context.navigation.openForm`). Sobald jemand
hineinklickt oder mit Tab hineinspringt, ist es wieder ein gewöhnliches Textfeld.

Verlinkt wird nur, was das Component auflösen kann: die Erwähnungen, die dieser Datensatz in der
Tabelle hat, plus die, die gerade gesetzt wurden. Der Text allein kann nicht sagen, ob
`@Anna Berger` eine Person oder ein Satz ist, und ein Link auf den falschen Datensatz wäre
schlimmer als keiner. Aus demselben Grund bleibt ein Name ohne Link, wenn dieser Datensatz ihn für
zwei verschiedene Personen führt — außer für die Erwähnung, die gerade gesetzt wurde, denn zu der
ist die Person bekannt.

### Was die Umgebung dafür braucht

* Der **Anwender** braucht Leserecht auf `systemuser` — sonst findet die Vorschlagsliste niemanden
  — und **Anlegen** auf `ayonto_mention`. Ohne das Anlegerecht scheitert die Erwähnung sichtbar im
  Component statt still.
* Der **Flow** muss existieren: ohne ihn sammeln sich Zeilen mit `ayonto_deliverystatus = New`,
  und niemand wird benachrichtigt. Die Tabelle ist dann ein vollständiges Protokoll dessen, was
  hätte rausgehen sollen.
* Die Vorschlagsliste prüft **kein Postfach**. Sie zeigt aktivierte, interaktive Benutzer; ob
  deren Adresse gepflegt ist, entscheidet sich im Flow.

### Wann Erwähnen nicht verfügbar ist

Das Component blendet die Vorschlagsliste aus und sagt im UI warum, wenn:

* **keine Verbindung besteht** (`context.client.isOffline()` bzw. `isNetworkAvailable()`) — die
  Benutzersuche braucht Dataverse;
* **der Datensatz noch nie gespeichert wurde** und Benachrichtigungen aktiv sind. Ohne
  Datensatz-ID führt der Link in der Benachrichtigung ins Leere, und die Erwähnung selbst ist noch
  nicht gespeichert. Das greift nur, wenn `entityName` gebunden ist — sind beide
  Datensatz-Eigenschaften leer, kann das Component den Fall nicht erkennen und benachrichtigt
  weiter. Das ist fast immer ein Konfigurationsfehler und keine Absicht: Es bedeutet, dass der
  Hinweis ausbleibt, der genau darauf hinweisen würde.

Getippt werden darf in beiden Fällen weiter; nur die Auswahlliste bleibt zu.

### Wen die Suche vorschlägt

Vorgeschlagen werden aktivierte Benutzer mit Postfach. Deaktivierte Benutzer, Anwendungsbenutzer
(`applicationid`) sowie Support- und nicht-interaktive Konten (`accessmode` 3 und 4) filtert schon
die Abfrage heraus — würde erst die geladene Seite bereinigt, bliebe die Liste kurz oder leer,
sobald genug solcher Konten alphabetisch vorne stehen. Weist eine Umgebung diese Filter zurück,
wird die Abfrage einmal ohne sie wiederholt und clientseitig gefiltert; die Suche fällt also nicht
aus, die Liste kann dann nur kürzer ausfallen.

Liefert die Suche mehr Treffer, als die Liste zeigt, weist ein Hinweis am Listenende darauf hin,
dass die Suche eingegrenzt werden muss — statt stillschweigend abzuschneiden.

## Was sich geändert hat

Der Stand von 2020 war nicht mehr lauffähig bzw. nicht mehr regelkonform:

| Alt (1.0, August 2020) | Neu (2.0) |
|---|---|
| `pcf-scripts` 1.3.6 (Juli 2020), webpack 4, TypeScript 3.9 | `pcf-scripts` 1.51.x, webpack 5, TypeScript 5.8 |
| `office-ui-fabric-react` v7, komplett gebündelt (2417 KiB) | Fluent UI v9 als Plattform-Bibliothek (25 KiB) |
| `control-type="standard"`, `ReactDOM.render` in `updateView` | `control-type="virtual"`, `ComponentFramework.ReactControl` |
| `Xrm.Page.data.entity.getId()` / `getEntityName()` | gebundene `entityId` / `entityName`; `context.mode.contextInfo` nur als undokumentierter Notnagel |
| `Xrm.Page.context.getClientUrl()` / `getUserId()` | `orgUrl`-Eigenschaft bzw. `context.userSettings.userId` |
| `Xrm.WebApi.online.retrieveMultipleRecords` / `.execute` | `context.webAPI` + `<uses-feature name="WebAPI">`; benachrichtigt wird über eine Tabellenzeile und einen Flow |
| `Xrm.Utility.alertDialog` | Inline-Hinweis im Component |
| Alle Benutzer beim Rendern laden | Serverseitige Suche pro `@`-Eingabe, entprellt |
| `contentEditable` mit manueller Caret-Verwaltung | `<textarea>` mit ARIA-Combobox-Semantik und Tastaturbedienung |
| Keine Lokalisierung | `resx` für 1033 (en) und 1031 (de) |
| Keine Tests | 159 Tests über Control, Editor, Suche, Benachrichtigung und Terminierung |

Behobene Fehler aus 1.0:

* `_retrieveSystemUsers()` gab immer ein leeres Array zurück — die Liste wurde vor dem Ende des
  asynchronen Aufrufs geliefert. Die Vorschlagsliste war dadurch dauerhaft leer.
* Der Empfänger wurde als `partyid_account@odata.bind` auf `/systemusers(...)` gebunden — falsche
  Navigationseigenschaft für einen Systembenutzer.
* Jede Auswahl löste erneut eine E-Mail aus, auch an dieselbe Person.
* Der Datensatz-Link enthielt `forceUCI=1` für den abgekündigten Legacy-Webclient.
* Betreff und Text wurden ohne Escaping in den HTML-Body geschrieben.

### Breaking Changes

Der eindeutige Name ist von `xyz.MentionControl` auf `Ayonto.MentionControl` gewechselt, und die
Eigenschaft `emailFromUserGuid` heißt jetzt `senderUserId`. Ein Upgrade an Ort und Stelle ist nicht
möglich: Ein Code-Component kann in einer neueren Version keine Pflichteigenschaften ergänzen und
keine bestehenden entfernen — dafür ist laut
[FAQ](https://learn.microsoft.com/power-apps/developer/component-framework/faq#cannot-addremove-properties-from-code-component-once-it-is-imported)
ein neuer Component-Name erforderlich. Bestehende Formulare müssen also neu konfiguriert werden.

## Grenzen

* Nur modellgesteuerte Apps. `context.webAPI` steht in Canvas-Apps nicht zur Verfügung, und
  virtuelle React-Components werden in Power Pages nicht unterstützt.
* Erwähnungen werden als Klartext `@Vorname Nachname` gespeichert, nicht als Referenz. Wer
  benachrichtigt wird, steht deshalb nur so lange fest, wie das Feld offen ist; nach dem Neuladen
  lässt sich ein Name, den sich zwei Personen teilen, nicht mehr auflösen und bleibt ohne Link.
* Zwei gleichnamige Erwähnungen, die **unmittelbar nebeneinander** stehen, sind der eine Fall, den
  nichts entscheiden kann: Es ist dieselbe Änderung, ob man die erste oder die zweite löscht. Dann
  gilt die spätere als die gelöschte.
* Die Benachrichtigung wird beim **ersten** Einfügen einer Erwähnung dieser Person ausgelöst, nicht
  beim Speichern des Datensatzes und nicht bei jedem weiteren Vorkommen. Ein Code-Component erfährt
  nichts vom Speichervorgang des Formulars — auch nicht davon, dass er abgebrochen wurde: Ein
  Formular, das innerhalb der Karenzzeit verworfen wird, schickt die Benachrichtigung trotzdem.
  Nur die Erwähnung aus dem Text zu löschen verhindert sie.

## Aufbau

```
Mention/
├─ MentionControl/
│  ├─ index.ts                          ReactControl-Lebenszyklus, Verdrahtung
│  ├─ ControlManifest.Input.xml
│  ├─ components/MentionEditor.tsx      Textarea, @-Erkennung, Tastatur, Link-Overlay
│  ├─ components/SuggestionList.tsx     Vorschlagsliste (role="listbox")
│  ├─ services/UserSearchService.ts     Benutzersuche über context.webAPI
│  ├─ services/MentionLogService.ts     Erwähnungszeile schreiben, Erwähnungen lesen
│  ├─ services/NotificationScheduler.ts Karenzzeit und Entdopplung
│  ├─ utils/mentionText.ts              Reine Funktionen, vollständig getestet
│  ├─ utils/availability.ts             Wann Erwähnen verfügbar ist
│  ├─ utils/format.ts                   Platzhalter in lokalisierten Texten
│  └─ strings/                          resx für 1033 und 1031
└─ tests/
   ├─ MentionControl.test.ts            Wert, Verfügbarkeit, Datensatzbezug, Identität
   ├─ mentionText.test.ts               Reine Funktionen
   ├─ availability.test.ts              Wahrheitstabelle der Verfügbarkeit
   ├─ NotificationScheduler.test.ts     Karenzzeit, Rücknahme, Entdopplung
   ├─ format.test.ts                    Platzhalter-Ersetzung
   ├─ UserSearchService.test.ts         OData-Abfrage und Filterung
   ├─ MentionLogService.test.ts         Zeileninhalt, Spaltenpräfix, Rücklesen
   └─ MentionEditor.test.tsx            Editor-Verhalten
```

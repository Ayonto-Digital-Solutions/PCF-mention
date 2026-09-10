# Mention Control (PCF)

Ein Power Apps Component Framework (PCF) Code-Component für modellgesteuerte Apps: Man tippt `@`
in einer Textspalte, wählt eine Dataverse-Benutzerin oder einen Dataverse-Benutzer aus der
Vorschlagsliste und die erwähnte Person wird per E-Mail benachrichtigt.

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
npm test                              # 158 Tests
npm run lint
npm run typecheck
npm run build                         # Debug-Build nach out/controls
npm run build -- --buildMode production
npm start watch                       # Test-Harness mit Hot Reload
```

Der Test-Harness hat keine Dataverse-Verbindung. Die Benutzersuche und der E-Mail-Versand
brauchen `context.webAPI` und laufen deshalb nur in einer echten Umgebung.

### In eine Umgebung deployen

Für die innere Entwicklungsschleife:

```bash
pac auth create --url https://<org>.crm4.dynamics.com
pac pcf push --publisher-prefix <prefix>
```

Für ein Solution-Paket (ALM):

```bash
mkdir Solutions && cd Solutions
pac solution init --publisher-name <name> --publisher-prefix <prefix>
pac solution add-reference --path ..
dotnet build -c Release          # managed;  -c Debug erzeugt unmanaged
```

Das Ergebnis liegt in `Solutions/bin/Release`. Fertige `.zip`-Dateien liegen bewusst **nicht**
mehr im Repository: sie waren an eine fremde Umgebung und einen Platzhalter-Publisher (`xyz`)
gebunden und lassen sich aus diesem Quellstand nicht reproduzieren.

## Konfiguration

Das Component wird auf einer Textspalte im Formular-Designer registriert.

| Eigenschaft | Pflicht | Bedeutung |
|---|---|---|
| `field` | ja | Die gebundene Textspalte. `SingleLine.Text`, `SingleLine.TextArea` oder `Multiple`. |
| `entityId` | nein | An die Primärschlüsselspalte der Tabelle binden (z. B. `accountid`). |
| `entityName` | nein | Logischer Tabellenname, z. B. `account`. Als statischer Wert setzbar. |
| `sendEmail` | ja | `Ja` (Standard) schreibt für jede Erwähnung eine Zeile in die Benachrichtigungstabelle, `Nein` schreibt nur den Text. |
| `senderUserId` | nein | GUID des absendenden Benutzers. Ohne Angabe der angemeldete Benutzer. |
| `emailSubject` | nein | Betreff der Benachrichtigung. |
| `emailContent` | nein | Text der Benachrichtigung. Der Datensatz-Link wird angehängt. |
| `orgUrl` | nein | Umgebungs-URL, z. B. `https://contoso.crm4.dynamics.com`. Nötig für den Link auf den Datensatz. |
| `mentionTable` | nein | Andere Tabelle für die Erwähnungen. Leer = die mitgelieferte `ayonto_mention`. |
| `appId` | nein | ID der modellgesteuerten App, in der der Link geöffnet werden soll. |

**Den Datensatz muss man in der Regel nicht konfigurieren.** In modellgesteuerten Apps meldet der
Host den Datensatz selbst (`context.mode.contextInfo`), und das Component nimmt ihn von dort. Die
beiden Eigenschaften bleiben als Übersteuerung: Wo sie gesetzt sind, gewinnen sie — nützlich für
Hosts, die nichts melden, und für einen bewusst abweichenden Bezug. Der Formular-Designer bietet
für eine Texteigenschaft ohnehin keine Primärschlüsselspalte an, weshalb die Eigenschaften allein
kein gangbarer Weg waren.

Ohne Datensatzbezug — weder vom Host noch konfiguriert — funktioniert das Component weiter, die
Benachrichtigung wird dann nur nicht mit dem Datensatz verknüpft. Ohne `orgUrl` enthält sie keinen
Deep-Link.

## Wie die Benachrichtigung funktioniert

1. Eine Person wird aus der Vorschlagsliste gewählt; `@Vorname Nachname` wird in den Text geschrieben.
2. Nach der Karenzzeit legt das Component über `context.webAPI.createRecord` eine Zeile in der
   Tabelle **`ayonto_mention`** an — mit Empfänger, Absender, Betreff, Text, dem Datensatz und
   einem fertigen Link darauf.
3. Ein Cloud-Flow, der auf neue Zeilen dieser Tabelle auslöst, verschickt die Benachrichtigung —
   per E-Mail, Teams oder was die Organisation sonst nutzt — und schreibt `ayonto_deliverystatus`
   auf `Sent` oder `Failed` zurück.

Dataverse wird bewusst **nicht** gebeten zu senden. Eine Umgebung, deren Postfächer nicht auf
serverseitige Synchronisierung eingerichtet sind, würde nur Entwürfe ansammeln, und die meisten
Organisationen versenden ohnehin über einen Flow mit ihrem eigenen Absender, ihren Vorlagen und
ihrem BCC.

Die Tabelle kommt mit der Lösung: `solution/src/Entities/ayonto_Mention` beschreibt sie, der
Import legt sie an. Wer sie woanders haben will, trägt den logischen Namen in die Eigenschaft
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
| `ayonto_subject`, `ayonto_message` | Betreff und Text aus der Konfiguration |
| `ayonto_deliverystatus` | `New`, bis der Flow zurückschreibt |
| `ayonto_deliverydetail` | Fehlertext des Flows |

### Klickbare Erwähnungen

Solange das Feld nicht den Fokus hat, liegt über der Textfläche eine Ansicht, in der jede
Erwähnung ein Link auf die erwähnte Person ist (`context.navigation.openForm`). Sobald jemand
hineinklickt oder mit Tab hineinspringt, ist es wieder ein gewöhnliches Textfeld.

Verlinkt wird nur, was das Component auflösen kann: die Erwähnungen, die dieser Datensatz in der
Tabelle hat, plus die, die gerade gesetzt wurden. Der Text allein kann nicht sagen, ob
`@Anna Berger` eine Person oder ein Satz ist, und ein Link auf den falschen Datensatz wäre
schlimmer als keiner.

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
  Datensatz-ID zeigt die Mail ins Leere, und die Erwähnung selbst ist noch nicht gespeichert.
  Das greift nur, wenn `entityName` gebunden ist — sind beide Datensatz-Eigenschaften leer, ist
  das eine bewusste Konfiguration ohne Datensatzbezug und Benachrichtigungen laufen weiter.

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
| `Xrm.Page.data.entity.getId()` / `getEntityName()` | `context.mode.contextInfo`, mit `entityId` / `entityName` als Übersteuerung |
| `Xrm.Page.context.getClientUrl()` / `getUserId()` | `orgUrl`-Eigenschaft bzw. `context.userSettings.userId` |
| `Xrm.WebApi.online.retrieveMultipleRecords` / `.execute` | `context.webAPI` + `<uses-feature name="WebAPI">`; benachrichtigt wird über eine Tabellenzeile und einen Flow |
| `Xrm.Utility.alertDialog` | Inline-Hinweis im Component |
| Alle Benutzer beim Rendern laden | Serverseitige Suche pro `@`-Eingabe, entprellt |
| `contentEditable` mit manueller Caret-Verwaltung | `<textarea>` mit ARIA-Combobox-Semantik und Tastaturbedienung |
| Keine Lokalisierung | `resx` für 1033 (en) und 1031 (de) |
| Keine Tests | 158 Tests über Control, Editor, Suche, Benachrichtigung und Terminierung |

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
* Erwähnungen werden als Klartext `@Vorname Nachname` gespeichert, nicht als Referenz. Zwei Personen
  mit identischem vollständigen Namen sind im Text nicht unterscheidbar.
* Die Benachrichtigung wird beim Einfügen der Erwähnung ausgelöst, nicht beim Speichern des
  Datensatzes. Ein Code-Component erfährt nichts vom Speichervorgang des Formulars.

## Aufbau

```
Mention/
├─ MentionControl/
│  ├─ index.ts                          ReactControl-Lebenszyklus, Verdrahtung
│  ├─ ControlManifest.Input.xml
│  ├─ components/MentionEditor.tsx      Textarea, @-Erkennung, Tastatursteuerung
│  ├─ components/SuggestionList.tsx     Vorschlagsliste (role="listbox")
│  ├─ services/UserSearchService.ts     Benutzersuche über context.webAPI
│  ├─ services/EmailNotificationService.ts  E-Mail anlegen und senden
│  ├─ services/NotificationScheduler.ts Karenzzeit und Entdopplung
│  ├─ utils/mentionText.ts              Reine Funktionen, vollständig getestet
│  ├─ utils/availability.ts             Wann Erwähnen verfügbar ist
│  ├─ utils/format.ts                   Platzhalter in lokalisierten Texten
│  └─ strings/                          resx für 1033 und 1031
└─ tests/
   ├─ MentionControl.test.ts            Wertabgleich und Verfügbarkeit am Control
   ├─ mentionText.test.ts               Reine Funktionen
   ├─ availability.test.ts              Wahrheitstabelle der Verfügbarkeit
   ├─ NotificationScheduler.test.ts     Karenzzeit, Rücknahme, Entdopplung
   ├─ format.test.ts                    Platzhalter-Ersetzung
   ├─ UserSearchService.test.ts         OData-Abfrage und Filterung
   ├─ EmailNotificationService.test.ts  Payload, Verknüpfung, Versand
   └─ MentionEditor.test.tsx            Editor-Verhalten
```

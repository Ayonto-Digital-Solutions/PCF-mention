# Benachrichtigungs-Flow bauen

Die Lösung bringt die Tabelle `ayonto_mention` samt Ansicht und die beiden Code-Components mit —
**mehr nicht**. Der Import fragt nach keiner einzigen Verbindung, weil nichts darin eine braucht.

Den Flow, der aus einer Zeile eine Benachrichtigung macht, gibt es **auf zwei Wegen**:

* **Fertig importieren** — `AyontoMentionFlow_<version>.zip` liegt dem Release als eigenes,
  **optionales** Paket bei. Ein Import, eine Frage nach der Dataverse-Verbindung, fertig.
  Siehe [Der fertige Flow als Zusatzpaket](#der-fertige-flow-als-zusatzpaket).
* **Selbst bauen** — diese Anleitung, Schritt für Schritt. Das dauert länger, und danach wissen
  Sie, was der Flow tut und wo Sie ihn anfassen.

Getrennt sind die beiden, weil ein Flow eine Verbindung mitbringt, die beim Import belegt werden
muss. Wer die Benachrichtigung gar nicht braucht, soll darüber nicht stolpern — deshalb fragt die
Hauptlösung nach nichts, und die Frage stellt nur, wer das Zusatzpaket bewusst dazunimmt. Wie eine
Benachrichtigung aussieht, ist ohnehin eine Hausentscheidung.

**Der Standardweg ist Dataverse selbst**: der Flow legt eine E-Mail-Aktivität an und löst die
Aktion `SendEmail` aus. Kein externer Connector, kein API-Schlüssel, nichts, was die Umgebung
verlässt. Wo die Voraussetzung fehlt — serverseitige Synchronisierung mit einem freigegebenen
Postfach — tritt ein Mail-Connector an die Stelle der beiden Dataverse-Aktionen; das steht in
[external-mail-provider.md](external-mail-provider.md), deutsch und englisch.

Die fertige Definition liegt unter
[`../solution-flow/src/Workflows/`](../solution-flow/src/Workflows) — dieselbe Datei, die ins
Zusatzpaket gepackt wird. Sie wird bei jedem Bau gegen die Tabelle geprüft: Spaltennamen,
Ausdrücke und die Verbindung, an die sie gebunden ist.

> Die Schritte hier sind gegen einen **deutschsprachigen Designer** geschrieben und in einer echten
> Umgebung durchgelaufen. Platzhalter stehen in spitzen Klammern: `<zieltabelle>` ist der logische
> Name der Tabelle, auf deren Formular die Komponente sitzt.

## Der fertige Flow als Zusatzpaket

`AyontoMentionFlow_<version>.zip` enthält **nur** den Flow und die eine Dataverse-Verbindung, die
er benutzt. Keine Tabelle, kein Code-Component, keine Umgebungsvariable — das bringt die
Hauptlösung mit, und die wird **zuerst** importiert.

**So nehmen Sie es:**

1. `AyontoPcfControls_<version>_managed.zip` importieren (oder die unmanaged Fassung). Fragt nach
   nichts.
2. `AyontoMentionFlow_<version>.zip` importieren. Der Import fragt jetzt nach **einer** Verbindung:
   *Microsoft Dataverse*. Eine bestehende auswählen oder eine neue anlegen.
3. Den Flow **einschalten**. Er kommt bewusst ausgeschaltet an — siehe unten.
4. Die Komponente auf dem Formular konfigurieren, wie im Abschnitt
   [Schritt 1 — Die Komponente am Formular](#schritt-1--die-komponente-am-formular) beschrieben. Der Flow
   liest Betreff, Text und Linkbeschriftung aus der Zeile, nicht aus sich selbst.

**Das Paket ist unmanaged, und das mit Absicht.** Eine managed Lösung ließe sich nicht mehr
ändern — und Ändern ist der Zweck: Betreff und Wortlaut sind das eine, der Versandweg das andere.
Wer statt der beiden Dataverse-Aktionen einen Mail-Connector einsetzen will, tauscht sie im
importierten Flow aus; wie, steht in
[external-mail-provider.md](external-mail-provider.md).

**Der Flow kommt ausgeschaltet an.** Ein Flow, der sich beim Import selbst einschaltet, verschickt
Benachrichtigungen, bevor jemand den Wortlaut gesehen hat. Einschalten ist ein Klick; ein zu früh
verschicktes „Sie wurden erwähnt" nimmt niemand zurück.

**Unter welchem Konto er läuft:** unter dem der Verbindung, die Sie beim Import angeben. Das ist
dieselbe Frage wie beim selbst gebauten Flow und mit denselben Folgen — der Abschnitt
[Unter welchem Konto der Flow läuft](#unter-welchem-konto-der-flow-läuft) gilt unverändert.

**Wer selbst baut, überspringt dieses Paket** und liest ab hier weiter. Beide Wege enden beim
selben Flow; der Rest dieser Anleitung beschreibt ihn Aktion für Aktion, also auch dann, wenn Sie
den fertigen importiert haben und wissen wollen, was darin passiert.

## So liest sich die Anleitung

Jedes Feld trägt eine Marke, die sagt, **wie** der Wert hineinkommt:

| Marke | Bedeutung |
|---|---|
| **Klartext** | direkt ins Feld tippen, keine Formel |
| **fx** | ins Feld klicken → Panel *Dynamischer Inhalt* → Reiter *Ausdruck* → einfügen → **OK** |
| **Dynamisch** | ins Feld klicken → Panel *Dynamischer Inhalt* → Eintrag aus der Liste wählen |
| **Auswahl** | Auswahlliste oder Schalter |

**Das `@` gehört nicht ins fx-Feld.** Im Reiter *Ausdruck* wird die Formel **ohne** führendes `@`
eingegeben — der Designer setzt es selbst. Alle Ausdrücke unten sind bereits so geschrieben.

**Connector-Aktionen lassen sich nicht über die Zwischenablage einfügen.** Kopierte Dataverse-,
Mail- oder Chat-Aktionen tragen ein leeres `allConnectionData`; der Designer kann daraus die
Verbindung nicht auflösen und verwirft den Knoten kommentarlos. Nur *Verfassen*, *Bedingung*,
*Variable* und *Array filtern* lassen sich zuverlässig einfügen — alles mit Connector wird von
Hand angelegt.

## Wie die Benachrichtigung läuft

```
Mention-Component
  └─ legt je erwähnter Person und je eingeschaltetem Kanal eine Zeile an   (Status = New)
       └─ Ihr Flow löst auf neue Zeilen dieses Kanals aus
            1  Mention abrufen           Zeile nach ID abrufen
            2  Record_Link               Verfassen
            3  Link_Text                 Verfassen
            4  Mail_Body                 Verfassen
            5  Versand                   Bereich
                 ├─ E-Mail anlegen       Zeile hinzufügen → emails
                 └─ E-Mail senden        gebundene Aktion SendEmail
            6  Als_gesendet_vermerken    nach Versand: erfolgreich
            7  Fehler_ermitteln          nach Versand: fehlgeschlagen, Timeout
            8  Als_fehlgeschlagen_…      nach Fehler_ermitteln: erfolgreich
```

Die Zeile ist das Bindeglied. Das Component kennt keinen Versandweg und keinen Connector; es
schreibt, wer was in welchem Datensatz erwähnt hat und über welchen Kanal es hinaus soll.

**Eine Zeile je Kanal — und ein Flow je Kanal.** Der Trigger filtert auf `ayonto_channel`, statt
im Flow zu verzweigen. Ein zweiter Kanal ist damit ein zweiter Flow derselben Form mit dem anderen
Filter: weniger zu bauen, weniger, was schiefgehen kann, und `ayonto_deliverystatus` bedeutet je
Zeile genau eine Sache. Eine Spalte kann nicht gleichzeitig „die Mail kam an" und „die
Chat-Nachricht nicht" heißen.

## Was mitgeliefert wird und was Sie bauen

| | Hauptlösung | Zusatzpaket | selbst zu stellen |
|---|---|---|---|
| Tabelle `ayonto_mention` samt Ansicht | ✔ | | |
| Code-Components Mention und GroupDetailList | ✔ | | |
| Benachrichtigungs-Flow | | ✔ (ausgeschaltet) | oder von Hand, siehe unten |
| Verbindung zu Dataverse | | wird beim Import erfragt | oder beim Anlegen des Flows |
| Serverseitige Synchronisierung, freigegebenes Postfach | | | ✔ |

Die **Hauptlösung** fragt beim Import nach nichts. Das **Zusatzpaket** stellt genau eine Frage:
welche Dataverse-Verbindung der Flow benutzen soll. Wer es nicht importiert, bekommt sie nie zu
sehen.

**Ein externer Dienst ist nirgends dabei.** Beide Code-Components deklarieren
`<external-service-usage enabled="false" />` und sprechen ausschließlich mit der
Dataverse-Web-API ihrer eigenen Umgebung.

## Unter welchem Konto der Flow läuft

Ein Code-Component läuft in der Browsersitzung des angemeldeten Benutzers und spricht über
`context.webAPI` mit dessen eigenen Rechten. Ein Flow hat keine Sitzung — er läuft im Hintergrund,
auch wenn niemand angemeldet ist — und braucht deshalb eine eigene Identität.

**Nehmen Sie ein Dienstkonto**, kein persönliches. Sonst steht der Versand still, sobald diese
Person das Unternehmen verlässt. Das Konto braucht Lese- und Schreibrechte auf `ayonto_mention`
sowie das Anlegen und Senden von E-Mail-Aktivitäten.

### Absender und Verbindungskonto sind zweierlei

Der Flow setzt als Absender die Person, die erwähnt hat — nicht das Konto, unter dem er läuft. Im
Namen eines anderen zu senden verlangt in Dataverse das Recht **„Send Email as Another User"**
([`prvSendAsUser`](https://learn.microsoft.com/power-platform/admin/miscellaneous-privileges)).
Ohne das schlägt `SendEmail` fehl, und die Zeile steht mit dem Grund auf `Failed`.

Zwei Wege, beide in Ordnung:

* dem Dienstkonto das Recht geben — dann kommt die Benachrichtigung von der erwähnenden Person,
  was Empfänger meist erwarten
* im Schritt *E-Mail anlegen* statt `ayonto_mentionedbyid` die ID des Dienstkontos oder einer
  Warteschlange eintragen — dann sendet es in eigenem Namen und braucht keine Delegierung, dafür
  steht in jeder Mail derselbe Absender

## Schritt 1 — Die Komponente am Formular

Die Eigenschaften heißen im Formular-Designer anders als im Manifest. Jede hat oben einen Schalter
**An Tabellenspalte binden** und darunter ein Feld **Statischer Wert** — entweder das eine oder das
andere.

| Im Designer | intern | Einstellung |
|---|---|---|
| **Text column** | `field` | die gebundene Textspalte |
| **Record id** | `entityId` | **An Tabellenspalte binden**, Primärschlüsselspalte wählen |
| **Table name** | `entityName` | Haken **aus**, statischer Wert `<zieltabelle>` |
| **Send e-mail** | `sendEmail` | **Yes** |
| **Send Teams message** | `sendTeams` | **No**, solange kein zweiter Flow existiert |
| **Subject** | `emailSubject` | statischer Wert, z. B. `Sie wurden erwähnt` |
| **Link label (e-mail)** | `emailLinkText` | statischer Wert, z. B. `Datensatz öffnen` |
| **Sender**, **Message** | `senderUserId`, `emailContent` | leer lassen |
| **Org url**, **App id** | `orgUrl`, `appId` | leer lassen — der Link entsteht im Flow |

**Die Tabelle oben nennt die englischen Beschriftungen** — die sehen Sie, solange die Umgebung
nicht auf Deutsch eingerichtet ist. Warum, steht weiter unten unter
[Warum der Designer englisch spricht](#warum-der-designer-englisch-spricht); dort steht auch, was
zu tun ist, damit die deutschen erscheinen.

### Warum der Designer englisch spricht

Im Paket liegt zu jedem Code-Component eine englische **und** eine deutsche Sprachdatei
(`…1033.resx` und `…1031.resx`). Welche davon jemand zu sehen bekommt, entscheidet nicht das
Paket, sondern die Umgebung: Die Plattform wählt die Sprachdatei nach der **Spracheinstellung des
Benutzers**, und zwar aus den Sprachen, die **in der Organisation verfügbar** sind
([RESX-Webressourcen](https://learn.microsoft.com/power-apps/developer/model-driven-apps/resx-web-resources)).
Ist Deutsch in der Umgebung nicht bereitgestellt, bleibt es bei der Basissprache — hier Englisch.

Damit die deutschen Beschriftungen erscheinen:

1. **Sprache in der Umgebung ergänzen**, im Power Platform Admin Center unter *Einstellungen →
   Produkt → Sprachen*. Das dauert laut Microsoft eine Stunde oder länger.
2. **Danach erst die Lösung importieren.** Die Reihenfolge ist nicht beliebig: „To display the
   translated labels for the languages imported into an environment from a solution, the language
   must be added in the environment *before* you import the solution"
   ([Regions- und Spracheinstellungen](https://learn.microsoft.com/power-platform/admin/enable-languages)).
   Wer die Lösung schon drin hat, importiert sie nach dem Ergänzen der Sprache noch einmal.
3. **Persönliche Sprache des Benutzers** auf Deutsch stellen — sie, nicht die Sprache des Browsers,
   entscheidet.

Ein Schlüssel, den die deutsche Datei nicht führt, fällt übrigens **nicht** auf Englisch zurück,
sondern kommt leer zurück. Deshalb hält `check-guide.py` bei jedem Bau beide Dateien gegeneinander:
Zu jedem englischen Text muss ein deutscher dastehen, sonst bricht der Lauf ab.

### Die zwei Fallen, die am meisten Zeit kosten

**Falle 1: die richtige Spalte bei *Record id*.** In der Spaltenauswahl stehen oft zwei verlockend
ähnliche Einträge — eine lesbare Nummernspalte und der Primärschlüssel. Gebraucht wird der
**Primärschlüssel** (die GUID, logischer Name typischerweise `<zieltabelle>id`). Der Anzeigename
des Primärschlüssels ist häufig der Tabellenname, während eine ganz andere Spalte „ID" heißt. Wer
nach „ID" sucht, greift zuverlässig daneben — prüfen Sie den **logischen Namen**, nicht die
Beschriftung.

**Falle 2: binden und statisch werden verwechselt.** *Record id* wird **gebunden**, *Table name*
**statisch** gesetzt. Trägt man bei *Record id* den Spaltennamen als statischen Text ein, steht in
der Mention-Zeile wörtlich der Spaltenname statt einer GUID — und der Flow scheitert später an
`Bad Request - Error in query syntax`, weil Dataverse einen Datensatz mit dieser „ID" sucht.

Formular danach **veröffentlichen**. Ohne `entityId` und `entityName` bleiben `ayonto_recordid` und
`ayonto_recordtable` leer, und kein Flow kann daraus einen Link bauen.

## Schritt 2 — Den Flow anlegen

In einer **nicht verwalteten Lösung**: *Neu → Automatisierung → Cloud Flow → Automatisiert*. Nicht
unter *Meine Flows* — nur in einer Lösung bekommt der Flow eine Verbindungsreferenz statt einer
fest verdrahteten Verbindung, und nur so lässt er sich in eine andere Umgebung mitnehmen.

Jede Aktion nach dem Anlegen sofort über **…-Menü → Umbenennen** auf den genannten Namen setzen.
Die Namen stehen in späteren Ausdrücken — ein vom Designer angehängtes `_1` bricht sie.

### Trigger

Aktion: **Wenn eine Zeile hinzugefügt, geändert oder gelöscht wird** (Microsoft Dataverse)

| Feld | Wert | Art |
|---|---|---|
| Änderungstyp | **Hinzugefügt** — und nur das | Auswahl |
| Tabellenname | **Mentions** | Auswahl |
| Bereich | **Organisation** | Auswahl |
| Zeile filtern | siehe unten | Klartext |

```
ayonto_deliverystatus eq 'New' and ayonto_channel eq 'Email'
```

**Zwei Gründe für genau diesen Filter.** *Hinzugefügt*: die Statusrückschreibung ändert dieselbe
Zeile — stünde „Geändert" mit im Trigger, löste sie den Flow erneut aus, eine Schleife, die erst
die Dataverse-Drosselung beendet. *`ayonto_channel`*: die Komponente schreibt eine Zeile je
aktivem Kanal; ohne diesen Teil käme die Mail zweimal, sobald ein zweiter Kanal eingeschaltet wird.

## Schritt 3 — Die Aktionen

### 1 · Mention_abrufen

*Microsoft Dataverse → **Zeile nach ID abrufen***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Mentions** | Auswahl |
| Zeilen-ID | Ausdruck unten | fx |

```
triggerOutputs()?['body/ayonto_mentionid']
```

**Wozu diese Aktion.** Eine abgerufene Zeile trägt ihre eigene OData-Adresse. Daraus holt der
nächste Schritt den Host der Umgebung — in der Entwicklungsumgebung entstehen deren Links, in der
Produktion deren, ohne dass irgendwo eine URL gepflegt wird.

### 2 · Record_Link

*Datenübertragung → **Verfassen***

```
if(
  not(empty(triggerOutputs()?['body/ayonto_recordurl'])),
  triggerOutputs()?['body/ayonto_recordurl'],
  if(
    or(empty(triggerOutputs()?['body/ayonto_recordtable']),
       empty(triggerOutputs()?['body/ayonto_recordid'])),
    '',
    concat(
      'https://',
      uriHost(outputs('Mention_abrufen')?['body/@odata.id']),
      '/main.aspx?pagetype=entityrecord&etn=',
      triggerOutputs()?['body/ayonto_recordtable'],
      '&id=',
      triggerOutputs()?['body/ayonto_recordid']
    )
  )
)
```

Nimmt `ayonto_recordurl`, falls die Komponente ihn liefert, und baut ihn sonst selbst. Ohne
Datensatzbezug bewusst ein Leerstring statt einer kaputten URL.

**Soll der Link in einer bestimmten App öffnen**, ergänzen Sie `'appid=<ID der App>&'` direkt
hinter `'/main.aspx?'`. Ohne App-ID öffnet Dataverse die Standard-App des Benutzers — ein gültiger
Link. Die App-ID lässt sich nicht ableiten: ein Datensatz kann in mehreren Apps vorkommen, und
welche gemeint ist, weiß die Plattform nicht. Wer sie je Umgebung anders braucht, legt sich dafür
eine eigene Umgebungsvariable an und liest sie mit `parameters('<Anzeigename> (<schemaname>)')`.

### 3 · Link_Text

*Datenübertragung → **Verfassen***

```
if(
  not(empty(triggerOutputs()?['body/ayonto_linktext'])),
  triggerOutputs()?['body/ayonto_linktext'],
  if(
    not(empty(triggerOutputs()?['body/ayonto_recordname'])),
    triggerOutputs()?['body/ayonto_recordname'],
    'Datensatz öffnen'
  )
)
```

**Warum die Kaskade.** `ayonto_recordname` füllt die Komponente nur aus einer undokumentierten
Host-Schnittstelle — darauf kann man sich nicht verlassen. Deshalb zuerst die Beschriftung aus der
Formularkonfiguration, dann der Zeilenname, zuletzt ein neutraler Text. Der Link selbst hängt an
keiner dieser Stufen.

<details>
<summary><b>Optional: eine sprechende Bezeichnung aus dem Zieldatensatz holen</b></summary>

Soll im Linktext die Nummer und der Titel des erwähnten Datensatzes stehen, schieben Sie zwischen
Schritt 2 und 3 diese drei Aktionen ein:

1. *Variable → **Variable initialisieren*** — Name `Bezeichnung`, Typ **Zeichenfolge**, Wert leer.
2. *Steuerung → **Bedingung***, benannt `Ist_Zieltabelle`, zwei Zeilen mit **Und**:

   | Zeile | links (fx) | Operator | rechts |
   |---|---|---|---|
   | 1 | `triggerOutputs()?['body/ayonto_recordtable']` | ist gleich | `<zieltabelle>` (Klartext) |
   | 2 | `coalesce(triggerOutputs()?['body/ayonto_recordid'], '')` | ist nicht gleich | leer lassen |

   Die zweite Zeile ist nicht optional: ohne sie läuft der Abruf auf einer Zeile ohne
   Datensatzbezug in einen Fehler und reißt den ganzen Lauf mit — keine Mail, keine
   Statusrückschreibung.

3. Im Zweig **Wenn ja**: *Zeile nach ID abrufen* auf `<zieltabelle>` mit der Zeilen-ID
   `triggerOutputs()?['body/ayonto_recordid']` und, unter *Erweiterte Optionen*, **Spalten
   auswählen** auf die beiden gewünschten Spalten begrenzen. Darunter *Variable festlegen* auf
   `Bezeichnung`:

   ```
   concat(
     outputs('Zieldatensatz_abrufen')?['body/<nummernspalte>'],
     ' - ',
     outputs('Zieldatensatz_abrufen')?['body/<titelspalte>']
   )
   ```

   Der Zweig *Wenn nein* bleibt leer.

In `Link_Text` kommt die Variable dann als erste Stufe der Kaskade davor:
`if(not(empty(variables('Bezeichnung'))), variables('Bezeichnung'), …)`.
</details>

### 4 · Mail_Body

*Datenübertragung → **Verfassen***

```
concat(
  '<p>', coalesce(triggerOutputs()?['body/ayonto_message'], ''), '</p>',
  if(empty(outputs('Record_Link')),
     '<p>Zu dieser Erwähnung ist kein Datensatz hinterlegt.</p>',
     concat(
       '<p><a href="', outputs('Record_Link'), '">', outputs('Link_Text'), '</a></p>'
     )
  )
)
```

Ohne Link steht dort ein sichtbarer Hinweis statt eines toten Buttons. Logo, Hausfarben oder eine
zusätzlich ausgeschriebene URL — manche Mail-Clients entschärfen Schaltflächen aus externen
Nachrichten — ergänzen Sie hier nach Ihren Vorgaben.

### 5 · Versand

*Steuerung → **Bereich*** — Name exakt `Versand`. In den Bereich kommen **nur** die beiden
Versandaktionen.

**5a · E-Mail anlegen** — *Microsoft Dataverse → **Zeile hinzufügen***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **E-Mails** | Auswahl |
| Betreff | `coalesce(triggerOutputs()?['body/ayonto_subject'], 'Sie wurden erwähnt')` | fx |
| Beschreibung | `outputs('Mail_Body')` | fx |
| `email_activity_parties` | siehe unten | fx |

```json
[
  { "partyid_systemuser@odata.bind": "/systemusers(<Absender>)",  "participationtypemask": 1 },
  { "partyid_systemuser@odata.bind": "/systemusers(<Empfänger>)", "participationtypemask": 2 }
]
```

`1` ist der Absender, `2` der Empfänger im An-Feld — so führt es die
[ActivityParty-Dokumentation](https://learn.microsoft.com/power-apps/developer/data-platform/activityparty-entity).
Die beiden Werte im Flow:

```
concat('/systemusers(', triggerOutputs()?['body/ayonto_mentionedbyid'], ')')
concat('/systemusers(', triggerOutputs()?['body/ayonto_userid'], ')')
```

Hier stehen **Benutzer-IDs**, keine Mailadressen: eine Aktivitätspartei verweist auf einen
Systembenutzer. Die Zeile trägt beides — `ayonto_userid` für diesen Weg, `ayonto_useremail` für
einen Connector.

**5b · E-Mail senden** — *Microsoft Dataverse → **Eine gebundene Aktion ausführen***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **E-Mails** | Auswahl |
| Zeilen-ID | `outputs('E_Mail_anlegen')?['body/activityid']` | fx |
| Aktionsname | `SendEmail` | Auswahl |
| `IssueSend` | **Ja** | Auswahl |

*Ausführen nach*: bei `E_Mail_anlegen` nur **ist erfolgreich**.

### 6 · Als_gesendet_vermerken

*Microsoft Dataverse → **Zeile aktualisieren*** — unterhalb des Bereichs

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Mentions** | Auswahl |
| Zeilen-ID | `triggerOutputs()?['body/ayonto_mentionid']` | fx |
| Delivery Status | `Sent` | Klartext |

*Ausführen nach*: **…-Menü → Ausführen nach konfigurieren** → bei `Versand` nur **ist erfolgreich**.

### 7 · Fehler_ermitteln

*Datenübertragung → **Array filtern***

| Feld | Wert | Art |
|---|---|---|
| Von | `result('Versand')` | fx |
| Bedingung links | `item()?['status']` | fx |
| Operator | **ist nicht gleich** | Auswahl |
| Bedingung rechts | `Succeeded` | Klartext |

*Ausführen nach*: bei `Versand` **ist fehlgeschlagen** und **Zeitüberschreitung**, **ist
erfolgreich** abwählen.

**Wozu der Umweg.** Im Bereich stehen zwei Aktionen. `first(result('Versand'))` griffe womöglich
die erfolgreiche heraus, deren `error` leer ist — und in der Zeile stünde `Failed` ohne Grund.

### 8 · Als_fehlgeschlagen_vermerken

*Microsoft Dataverse → **Zeile aktualisieren***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Mentions** | Auswahl |
| Zeilen-ID | wie in Schritt 6 | fx |
| Delivery Status | `Failed` | Klartext |
| Delivery Detail | Ausdruck unten | fx |

```
substring(
  string(first(body('Fehler_ermitteln'))?['error']),
  0,
  min(480, length(string(first(body('Fehler_ermitteln'))?['error'])))
)
```

*Ausführen nach*: bei `Fehler_ermitteln` nur **ist erfolgreich**.

**Zwei Details daran sind nicht kosmetisch.** Nur `?['error']`, nie das ganze Ergebnisobjekt — das
enthält auch die *Inputs* der Aktion, also Empfänger und Nachrichtentext, die dann in einer Spalte
stünden, die jeder Leseberechtigte sieht. Und der Schnitt auf 480 Zeichen, weil die Spalte 500
fasst: ein zu langes Update schlägt fehl, und die Zeile bleibt auf `New` stehen, als wäre nie etwas
passiert.

## Ein zweiter Kanal

Ein zweiter Flow derselben Form, mit `ayonto_channel eq 'Teams'` im Trigger-Filter und einer
Chat-Aktion statt der beiden Dataverse-Aktionen im Bereich `Versand`. Erst dann `sendTeams` an der
Komponente auf **Yes** setzen — vorher entstehen Zeilen, die niemand abholt.

Nachrichtentext dafür:

```
concat(
  '<p><b>Sie wurden erwähnt</b></p>',
  '<p>', coalesce(triggerOutputs()?['body/ayonto_message'], ''), '</p>',
  if(empty(outputs('Record_Link')), '',
     concat('<p><a href="', outputs('Record_Link'), '">', outputs('Link_Text'), '</a></p>'))
)
```

Als Empfänger dient `ayonto_useremail`. Chat-Connectoren lösen eine Person über ihre Mailadresse
auf — und in manchen Organisationen weicht die Mailadresse vom Anmeldenamen ab. Kommt die Mail an
und die Chat-Nachricht nicht, ist das die erste Stelle zum Nachsehen.

## Testen

1. **Speichern**, dann in der Lösung **Einschalten**.
2. **Trockentest:** Tabelle *Mention* → *Daten* → *Neue Zeile*: User Email = eigene Adresse,
   User Id = eigene Benutzer-ID, Message = Text, Delivery Status = `New`, Channel = `Email`,
   Record Table = `<zieltabelle>`, Record Id = GUID eines echten Datensatzes.
3. Laufhistorie: **Record_Link** zeigt eine vollständige URL, **Link_Text** die erwartete
   Beschriftung.
4. Mail öffnen, Link klicken — der Datensatz muss sich öffnen.
5. Zeile erneut öffnen: Delivery Status steht auf `Sent`.
6. **Echttest:** im Formular `@` tippen und eine Person wählen. Die Komponente wartet **fünf
   Sekunden**, bevor sie schreibt.
7. In der erzeugten Zeile prüfen, dass **Record Id**, **Record Table** und **Channel** gefüllt sind.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| `Bad Request - Error in query syntax` beim Abruf des Zieldatensatzes | in der Mention-Zeile steht in *Record Id* keine GUID — *Record id* ist statisch gesetzt oder an die falsche Spalte gebunden |
| Fehler bleibt nach der Korrektur | alte Mention-Zeilen tragen den kaputten Wert weiter — eine **neue** Erwähnung erzeugen |
| Ausdruck steht als Text im Feld | im fx-Feld ein `@` mit eingegeben — das setzt der Designer selbst |
| „Ungültiger Verweis auf Aktion Versand" | Bereich löschen, neu anlegen, exakt wieder `Versand` nennen |
| Ausdruck findet eine Aktion nicht | der Designer hat beim Anlegen `_1` angehängt — umbenennen |
| Flow läuft nicht an | Filter passt nicht — `ayonto_channel` in der Zeile prüfen; Flow ist aus |
| Flow grün, keine Mail | Spaltenname falsch geschrieben — Dataverse liefert `null` statt eines Fehlers |
| Mail kommt, aber ohne Link | `ayonto_recordid` leer → `entityId` nicht gebunden oder Formular nicht veröffentlicht |
| Link öffnet die falsche App | keine App-ID im Ausdruck — Dataverse nimmt die Standard-App |
| Link zeigt in die falsche Umgebung | `orgUrl` an der Komponente doch gesetzt |
| Linktext nur der Ersatztext | die optionale Bedingung greift nicht — `ayonto_recordtable` in Kleinschreibung prüfen |
| HTML kommt als Klartext an | beim Anlegen der E-Mail landete der Body nicht in *Beschreibung* |
| `SendEmail` scheitert mit einem Rechtefehler | das Verbindungskonto darf nicht im Namen eines anderen senden — siehe [Absender und Verbindungskonto](#absender-und-verbindungskonto-sind-zweierlei) |
| E-Mail bleibt Entwurf | Postfach nicht freigegeben oder nicht für den Versand aktiviert |
| Zeile bleibt auf `New` | „Ausführen nach" falsch gesetzt, oder der Detailtext war länger als die Spalte |
| Empfänger bekommt alles doppelt | zwei Flows auf denselben Kanal, oder `sendTeams` an ohne zweiten Flow |
| Vorschlagsliste im Formular leer | Anwender ohne Leserecht auf `systemuser` |
| Erwähnung scheitert im Formular | Anwender ohne Anlegerecht auf `ayonto_mention` |

## Was beim ersten Aufbau wirklich schiefging

Fünf Punkte, die einen echten Aufbau aufgehalten haben. Sie stehen hier, damit der nächste
Durchlauf sie nicht wiederholt.

| Stolperstein | Symptom | Lösung |
|---|---|---|
| *Record id* als statischer Text gesetzt | `Bad Request - Error in query syntax`; in den Eingaben steht der Spaltenname als Zeilen-ID | an die Tabellenspalte binden |
| falsche Spalte gebunden — die lesbare Nummer statt des Primärschlüssels | gleicher Fehler, nur mit der Nummer statt der GUID | Primärschlüssel am logischen Namen erkennen, nicht an der Beschriftung |
| Connector-Aktionen über die Zwischenablage eingefügt | der Designer verwirft den Knoten kommentarlos | alles mit Connector von Hand anlegen |
| *Fehler_ermitteln* hing am Erfolgs-Schritt | bei einem Versandfehler bleibt die Zeile auf `New`, ohne Detail | „Ausführen nach" auf `Versand`: ist fehlgeschlagen, Zeitüberschreitung |
| Filterbedingung invertiert: `ist gleich Succeeded` | Delivery Detail bleibt leer, obwohl der Versand scheiterte | Operator auf **ist nicht gleich** |

**Der Kern in einem Satz.** Dataverse antwortet auf einen falschen, aber syntaktisch gültigen Wert
mit `null` oder einem Bad Request — nie mit einem Hinweis, wo der Wert herkam. Wenn eine Aktion
scheitert, lohnt der Blick in **Eingaben** in der Laufhistorie fast immer mehr als der Blick in die
Aktion selbst.

## Was in den Einstellungen der Komponente steht

Jeder Kanal hat seinen eigenen Schalter und seine eigene Formulierung, weil eine Chat-Nachricht
woanders gelesen wird als eine Mail und selten denselben Wortlaut will.

| Einstellung | E-Mail | Teams |
|---|---|---|
| Ein / Aus | `sendEmail` | `sendTeams` |
| Betreff | `emailSubject` | `teamsSubject` |
| Text | `emailContent` | `teamsContent` |
| Text für den Link | `emailLinkText` | `teamsLinkText` |

Was ein Kanal nicht für sich sagt, übernimmt er von der E-Mail — denselben Text zweimal einzutragen
ist der häufigere Fall. Bleibt auch dort etwas leer, greift die Vorgabe der Komponente. Der Link
selbst wird immer gebaut; in keiner Einstellung steht eine URL.

## Spalten der Tabelle

| Spalte | Typ | Länge | Inhalt |
|---|---|---|---|
| `ayonto_mentionid` | Primärschlüssel |  | Zeilen-ID, für die Rückschreibung |
| `ayonto_name` | Text | 200 | Anzeigename der Zeile |
| `ayonto_userid` | Text | 64 | erwähnte Person (Systembenutzer-ID) |
| `ayonto_username` | Text | 200 | erwähnte Person, Anzeigename |
| `ayonto_useremail` | Text | 200 | **Empfänger** für einen Connector |
| `ayonto_mentionedbyid` | Text | 64 | wer erwähnt hat |
| `ayonto_recordtable` | Text | 128 | Tabelle des Datensatzes |
| `ayonto_recordid` | Text | 64 | ID des Datensatzes |
| `ayonto_recordname` | Text | 400 | Anzeigename des Datensatzes |
| `ayonto_recordurl` | Text | 500 | fertiger Deep-Link, sofern die Komponente ihn kennt |
| `ayonto_channel` | Text | 32 | **`Email` oder `Teams`** — welchen Weg diese Zeile meint |
| `ayonto_subject` | Text | 200 | Betreff |
| `ayonto_message` | Mehrzeilig | 2000 | Nachrichtentext |
| `ayonto_linktext` | Text | 100 | Beschriftung des Links |
| `ayonto_deliverystatus` | Text | 64 | `New`, `Sent`, `Failed` |
| `ayonto_deliverydetail` | Text | 500 | Fehlertext des Flows |

Der Plural-Name der Tabelle ist `ayonto_mentions`. Aktionen wie *Zeile aktualisieren* wollen diesen
Namen, der Trigger dagegen den logischen Namen `ayonto_mention` — eine Verwechslung, die sich im
Designer nicht zeigt und erst zur Laufzeit auffällt.

## Managed oder unmanaged importieren

Der Release baut beides. Für die mitgelieferte Lösung — Tabelle und Components — ist **managed** der
übliche Weg: daran ist nichts anzupassen. Der Flow entsteht ohnehin in einer eigenen, nicht
verwalteten Lösung Ihrer Umgebung und bleibt dort jederzeit bearbeitbar.

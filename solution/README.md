# Benachrichtigungs-Flow bauen

Die Lösung bringt die Tabelle `ayonto_mention` samt Ansicht und die beiden Code-Components mit —
**mehr nicht**. Der Import fragt nach keiner einzigen Verbindung, weil nichts darin eine braucht.

Den Flow, der aus einer Zeile eine Benachrichtigung macht, bauen Sie selbst. Das ist Absicht:

* Ein Flow bringt eine Verbindung mit, und die muss beim Import belegt werden. Wer die
  Benachrichtigung gar nicht braucht, soll darüber nicht stolpern.
* Wie eine Benachrichtigung aussieht und über welchen Weg sie hinausgeht, ist eine
  Hausentscheidung. Ein mitgelieferter Flow wäre eine Vorgabe, die man erst wieder loswerden muss.

**Der Standardweg ist Dataverse selbst**: der Flow legt eine E-Mail-Aktivität an und löst die
Aktion `SendEmail` aus. Kein externer Connector, kein API-Schlüssel, nichts, was die Umgebung
verlässt. Diese Anleitung beschreibt genau das, Schritt für Schritt, mit allen Ausdrücken zum
Kopieren.

Wo die Voraussetzung fehlt — serverseitige Synchronisierung mit einem freigegebenen Postfach —
tritt ein Connector an die Stelle der beiden Dataverse-Aktionen. Das steht in
[external-mail-provider.md](external-mail-provider.md), deutsch und englisch, ohne einen
bestimmten Anbieter zu nennen.

Die fertige Definition zum Nachschlagen liegt unter
[`examples/mention-notification-flow.json`](examples/mention-notification-flow.json). Sie wird
beim Bauen gegen die Tabelle geprüft, gehört aber nicht zur Lösung und wird nicht mitgeliefert.

## Wie die Benachrichtigung läuft

```
Mention-Component
  └─ legt je erwähnter Person und je eingeschaltetem Kanal eine Zeile an   (Status = New)
       └─ Ihr Flow löst auf neue Zeilen aus
            ├─ Zeile lesen, Umgebungsadresse und Datensatzlink ermitteln
            └─ Schalter auf ayonto_channel
                 ├─ Email → Versand (Scope)
                 │            ├─ E-Mail-Aktivität anlegen (Absender + Empfänger als Party)
                 │            └─ Dataverse-Aktion SendEmail auslösen
                 │            ├─ erfolgreich    → Status = Sent
                 │            └─ fehlgeschlagen → Status = Failed + Grund
                 └─ sonst  → Status = Failed, „kein Zweig für diesen Kanal"
```

Die Zeile ist das Bindeglied. Das Component kennt keinen Versandweg und keinen Connector; es
schreibt, wer was in welchem Datensatz erwähnt hat und über welchen Kanal es hinaus soll, und der
Flow entscheidet, was daraus wird.

**Eine Zeile je Kanal.** Wer per Mail *und* per Chat benachrichtigt wird, bekommt zwei Zeilen.
Das ist kein Umweg, sondern der Grund, warum `ayonto_deliverystatus` etwas aussagt: eine Spalte
kann nicht gleichzeitig „die Mail kam an" und „die Chat-Nachricht nicht" bedeuten.

## Was mitgeliefert wird und was Sie bauen

| | mitgeliefert | selbst zu bauen oder zu stellen |
|---|---|---|
| Tabelle `ayonto_mention` samt Ansicht | ✔ | |
| Code-Components Mention und GroupDetailList | ✔ | |
| Benachrichtigungs-Flow | als Anleitung | Flow anlegen, siehe unten |
| Connection Reference Dataverse | | beim Anlegen des Flows |
| Serverseitige Synchronisierung, freigegebenes Postfach | | ✔ |

**Ein externer Dienst ist nirgends dabei.** Beide Code-Components deklarieren
`<external-service-usage enabled="false" />` und sprechen ausschließlich mit der
Dataverse-Web-API ihrer eigenen Umgebung.

## Unter welchem Konto der Flow läuft

Der Import der Lösung fragt nach nichts. Sobald Sie aber den Flow anlegen, verlangt er eine
Dataverse-Verbindung — und das ist kein Zufall: ein Code-Component läuft in der Browsersitzung des
angemeldeten Benutzers und spricht über `context.webAPI` mit dessen eigenen Rechten. Ein Flow hat
keine Sitzung. Er läuft im Hintergrund, auch wenn niemand angemeldet ist, und braucht deshalb eine
eigene Identität.

Er benutzt sie für vier Dinge, alle innerhalb der Umgebung: auf neue Zeilen horchen, die
ausgelöste Zeile zurücklesen, die E-Mail anlegen und senden, den Status zurückschreiben.

**Nehmen Sie dafür ein Dienstkonto**, kein persönliches. Sonst steht der Versand still, sobald
diese Person das Unternehmen verlässt. Das Konto braucht Lese- und Schreibrechte auf
`ayonto_mention` sowie das Anlegen und Senden von E-Mail-Aktivitäten.

### Absender und Verbindungskonto sind zweierlei

Der Flow setzt als Absender die Person, die erwähnt hat — nicht das Konto, unter dem er läuft. Im
Namen eines anderen zu senden verlangt in Dataverse das Recht **„Send Email as Another User"**
([`prvSendAsUser`](https://learn.microsoft.com/power-platform/admin/miscellaneous-privileges)).
Ohne das schlägt `SendEmail` fehl, und die Zeile steht mit dem Grund auf `Failed`.

Zwei Wege, beide in Ordnung:

* dem Dienstkonto das Recht geben — dann kommt die Benachrichtigung von der erwähnenden Person,
  was Empfänger meist erwarten
* im Compose `Absender bestimmen` statt `ayonto_mentionedbyid` die ID des Dienstkontos oder einer
  Warteschlange eintragen — dann sendet es in eigenem Namen und braucht keine Delegierung, dafür
  steht in jeder Mail derselbe Absender

## Was in den Einstellungen der Komponente steht

Jeder Kanal hat seinen eigenen Schalter und seine eigene Formulierung, weil eine Chat-Nachricht
woanders gelesen wird als eine Mail und selten denselben Wortlaut will.

| Einstellung | E-Mail | Teams |
|---|---|---|
| Ein / Aus | `sendEmail` | `sendTeams` |
| Betreff | `emailSubject` | `teamsSubject` |
| Text | `emailContent` | `teamsContent` |
| Text für den Link | `emailLinkText` | `teamsLinkText` |

Was ein Kanal nicht für sich sagt, übernimmt er von der E-Mail — denselben Text zweimal
einzutragen ist der häufigere Fall. Bleibt auch dort etwas leer, greift die Vorgabe der
Komponente. Der Link selbst wird immer dynamisch gebaut, in keiner Einstellung steht eine URL.

`sendTeams` steht ab Werk auf **Nein**: der mitgelieferte Flow bedient den Kanal nicht (siehe
unten), und Zeilen, die niemand abholt, sollen nicht ungefragt entstehen.

## Den Flow anlegen

Sechs Schritte. Wer bereits einen Benachrichtigungs-Flow hat, baut ihn nach derselben Reihenfolge
um — Schritt 5 ist dann der einzige zusätzliche.

### 1. In einer Lösung anlegen

Nicht unter *Meine Flows*, sondern innerhalb einer **nicht verwalteten Lösung**: *Neu →
Automatisierung → Cloud Flow → Automatisiert*. Nur dort bekommt der Flow eine Connection Reference
statt einer fest verdrahteten Verbindung, und nur so lässt er sich später in eine andere Umgebung
mitnehmen.

### 2. Trigger

Baustein *Wenn eine Zeile hinzugefügt, geändert oder gelöscht wird* (Dataverse):

| Feld | Wert |
|---|---|
| Änderungstyp | **Hinzugefügt** — und nur das |
| Tabellenname | Mention |
| Bereich | Organisation |
| Zeile filtern | `ayonto_deliverystatus eq 'New'` |

Der Änderungstyp ist keine Geschmacksfrage. Die Statusrückschreibung aus Schritt 4 ändert dieselbe
Zeile; stünde „Geändert" mit im Trigger, löste sie den Flow erneut aus — eine Schleife, die erst
die Dataverse-Drosselung beendet. Der Zeilenfilter ist die zweite Sperre und spart zusätzlich
Läufe, weil er serverseitig filtert.

### 3. Versand

Die Versandaktion in einen **Bereich (Scope)** namens `Versand` legen. Der Scope ist die
Voraussetzung für Schritt 4: er bündelt Erfolg und Fehler an einer Stelle.

Wer mehr als einen Kanal bedient, setzt davor einen **Schalter** auf
`@if(empty(triggerOutputs()?['body/ayonto_channel']), 'Email', triggerOutputs()?['body/ayonto_channel'])`
und legt Scope und Rückschreibung in den jeweiligen Fall. Der `if(empty(…))` sorgt dafür, dass
eine von Hand angelegte Zeile ohne Kanal weiterhin als E-Mail behandelt wird.

In den Scope kommen zwei Dataverse-Aktionen:

**Zeile hinzufügen** auf Tabelle *E-Mails* (`emails`):

| Feld | Wert |
|---|---|
| Betreff | `@{coalesce(triggerOutputs()?['body/ayonto_subject'], 'Sie wurden erwähnt')}` |
| Beschreibung | der HTML-Ausdruck weiter unten |
| `email_activity_parties` | Absender und Empfänger, siehe [Ausdrücke](#ausdrücke-zum-kopieren) |

**Eine gebundene Aktion ausführen** danach: Tabelle *E-Mails*, Zeilen-ID
`@{outputs('E_Mail_anlegen')?['body/activityid']}`, Aktionsname `SendEmail`, Parameter
`IssueSend` = `true`.

Empfänger und Absender sind hier **Benutzer-IDs**, keine Mailadressen: eine Aktivitätspartei
verweist auf einen Systembenutzer. Die Zeile trägt beides — `ayonto_userid` für diesen Weg,
`ayonto_useremail` für einen Connector.

Für einen externen Versanddienst statt dieser beiden Aktionen siehe
[external-mail-provider.md](external-mail-provider.md).

### 4. Statusrückschreibung

Zwei Aktionen *Zeile aktualisieren* auf Tabelle **Mention**, Zeilen-ID
`@{triggerOutputs()?['body/ayonto_mentionid']}`:

| Aktion | Ausführen nach | setzt |
|---|---|---|
| Als gesendet vermerken | `Versand` → **erfolgreich** | `ayonto_deliverystatus` = `Sent` |
| Als fehlgeschlagen vermerken | `Versand` → **fehlgeschlagen**, **Timeout** | `ayonto_deliverystatus` = `Failed`, `ayonto_deliverydetail` = Fehlertext |

Ohne diese beiden Aktionen bleibt jede Zeile für immer auf `New`. Man sieht dann weder, dass
etwas verschickt wurde, noch dass etwas schiefging.

### 5. Nur beim Umbau: Reste des alten Flows entfernen

Was auf Spalten des alten Prozesses zugreift, muss weg — Dataverse beantwortet eine Spalte, die es
nicht gibt, mit `null` statt mit einem Fehler. Der Flow läuft dann grün und verschickt nichts, und
niemand erfährt davon. Insbesondere:

* Variablen und Compose-Schritte, die einen Link zusammenbauen. Der Deep-Link steht fertig in
  `ayonto_recordurl`, sonst baut ihn Schritt 2.
* Anzeigetexte, die Felder des alten Prozesses lesen.
* Fest eingetragene Absenderadressen und BCC-Einträge.

### 6. Einschalten und testen

Flow **einschalten** — ein neu angelegter Flow ist an, ein importierter zunächst aus. Dann eine
Zeile in `ayonto_mention` von Hand anlegen: `ayonto_userid` auf die eigene Benutzer-ID,
`ayonto_useremail` auf die eigene Adresse, `ayonto_message` mit Text, `ayonto_channel` auf
`Email`, `ayonto_deliverystatus` auf `New`. Kommt die Mail und steht die Zeile danach auf `Sent`,
ist der Flow fertig.

## Weitere Kanäle und andere Versandwege

Die Anleitung oben beschreibt den E-Mail-Zweig über Dataverse. Zwei Erweiterungen sind vorgesehen,
beide im selben Schalter:

**Ein zweiter Kanal**, etwa eine Chat-Nachricht — siehe unten. Der Schalter auf `ayonto_channel`
ist genau dafür da; die Komponente schreibt je eingeschaltetem Kanal eine eigene Zeile.

**Ein externer Versanddienst** statt Dataverse, wo die serverseitige Synchronisierung fehlt. Der
Umbau steht in [external-mail-provider.md](external-mail-provider.md) — deutsch und englisch, ohne
einen bestimmten Anbieter zu nennen.

### Den Teams-Zweig ergänzen

Im Schalter **Kanal** einen Fall `Teams` hinzufügen, mit demselben Aufbau wie der E-Mail-Fall:

1. Ein **Bereich (Scope)**, zum Beispiel `Versand_Teams`, mit der Aktion *Nachricht in einem Chat
   oder Kanal veröffentlichen*.
   * Empfänger: `@{triggerOutputs()?['body/ayonto_useremail']}`
   * Nachricht: siehe unten
2. *Zeile aktualisieren* nach `Versand_Teams` → **erfolgreich**: `ayonto_deliverystatus` = `Sent`
3. *Zeile aktualisieren* nach `Versand_Teams` → **fehlgeschlagen**, **Timeout**:
   `ayonto_deliverystatus` = `Failed`, Detail wie beim E-Mail-Zweig, nur mit `result('Versand_Teams')`

Der Scope braucht einen eigenen Namen, weil `result('…')` einen Bereich beim Namen nennt und zwei
gleichnamige nicht unterscheidbar wären.

Nachrichtentext:

```
<p><b>@{coalesce(triggerOutputs()?['body/ayonto_subject'], 'Sie wurden erwähnt')}</b></p>
<p>@{triggerOutputs()?['body/ayonto_message']}</p>
@{if(empty(triggerOutputs()?['body/ayonto_recordname']), '',
     concat('<p><b>Datensatz:</b> ', triggerOutputs()?['body/ayonto_recordname'], '</p>'))}
@{if(empty(outputs('Datensatzlink')), '',
     concat('<p><a href="', outputs('Datensatzlink'), '">',
            if(empty(triggerOutputs()?['body/ayonto_linktext']), 'Datensatz öffnen',
               triggerOutputs()?['body/ayonto_linktext']), '</a></p>'))}
```

Chat-Connectoren lösen eine Person über ihre Mailadresse auf: weicht die Dataverse-Adresse eines
Benutzers von seinem Anmeldenamen ab, wird er nicht gefunden — die erste Stelle zum Nachsehen,
wenn die Mail ankommt und die Nachricht nicht.

Solange der Zweig fehlt, landen Teams-Zeilen im Standardfall des Schalters und werden als `Failed`
mit dem Grund „kein Zweig für diesen Kanal" vermerkt. Sie verschwinden also nicht stillschweigend.

### Managed oder unmanaged importieren

Der Release baut beides. Für die mitgelieferte Lösung — Tabelle und Components — ist **managed**
der übliche Weg: daran ist nichts anzupassen. Der Flow entsteht ohnehin in einer eigenen,
nicht verwalteten Lösung Ihrer Umgebung und bleibt dort jederzeit bearbeitbar.

## Der Link auf den Datensatz

Wer eine Benachrichtigung bekommt, soll den Datensatz mit einem Klick öffnen können — sonst muss
der Empfänger ihn suchen, und genau das kostet die Benachrichtigung ihren Zweck. Der Link steht
deshalb in jeder Nachricht.

**Eintragen muss man dafür nichts.** Der Flow ermittelt die Umgebungsadresse selbst: er liest die
ausgelöste Zeile einmal zurück und nimmt den Host aus deren `@odata.id` — das ist die absolute
Adresse dieser Zeile, und nichts anderes in einem Flow nennt die Umgebung.

```
concat('https://', uriHost(outputs('Datensatz_lesen')?['body/@odata.id']))
```

Für den Link selbst gilt die Reihenfolge: **`ayonto_recordurl` aus der Zeile**, sonst selbst
gebaut aus Umgebungsadresse, `ayonto_recordtable` und `ayonto_recordid`. Die Spalte ist der
genauere Weg, weil das Component weiß, auf welchem Datensatz es sitzt; gebaut wird nur, wenn sie
leer ist. Ist auch Tabelle oder Zeilen-ID leer, entfällt der Absatz mit dem Link — ein toter Link
ist schlechter als keiner.

### Was sich nicht ableiten lässt

**Die App-ID.** Ein Datensatz kann in mehreren modellgesteuerten Apps vorkommen; welche davon die
Mail öffnen soll, weiß die Plattform nicht. Ohne App-ID ist der Link gültig und öffnet die
Standard-App des Benutzers. Wer eine bestimmte App will, ergänzt ihre ID im Compose
`Datensatzlink` — oder legt sich dafür eine eigene Environment Variable an.

**Die Umgebungsadresse auf dem Component.** Ein Code-Component darf das `window`-Objekt
[nicht lesen](https://learn.microsoft.com/power-apps/developer/component-framework/faq#can-i-access-window-object-from-the-component),
und die
[Context-Referenz](https://learn.microsoft.com/power-apps/developer/component-framework/reference/context)
führt keine Eigenschaft, die sie nennt. Damit `ayonto_recordurl` gefüllt wird, braucht die
Komponente also `orgUrl` — aber eben nur dafür. Bleibt die Eigenschaft leer, baut der Flow den
Link, und die Benachrichtigung trägt ihn trotzdem.

### Was die Komponente für den genaueren Weg braucht

| Eigenschaft | Wert |
|---|---|
| `entityId` | an die Primärschlüsselspalte der Tabelle gebunden |
| `entityName` | logischer Name der Tabelle, statisch |
| `orgUrl` | Basis-URL der Umgebung — optional, der Flow kommt auch ohne aus |
| `appId` | optional, damit der Link in der richtigen App öffnet |

`orgUrl` und `appId` sind beides Bequemlichkeiten: ohne sie baut der Flow den Link selbst, nur
eben ohne App-ID. Wird die App über einen anderen Host erreicht als die Web-API, tragen Sie den
im Compose `Umgebungsadresse` fest ein statt ihn abzuleiten.

## Ausdrücke zum Kopieren

**Zeilenfilter im Trigger**

```
ayonto_deliverystatus eq 'New'
```

**Betreff**

```
@coalesce(triggerOutputs()?['body/ayonto_subject'], 'Sie wurden erwähnt')
```

`trigger()` statt `triggerOutputs()` ist hier ein beliebter Fehler: das liefert den Lauf, nicht die
Zeile, der Ausdruck ist immer leer und es greift stillschweigend immer der Ersatztext.

**Umgebungsadresse** (Compose)

```
@concat('https://', uriHost(outputs('Datensatz_lesen')?['body/@odata.id']))
```

`Datensatz_lesen` ist eine Dataverse-Aktion *Zeile abrufen* auf `ayonto_mentions` mit der
Zeilen-ID aus dem Trigger. Sie kostet einen Lesezugriff je Benachrichtigung und erspart das
Eintragen der Umgebungsadresse in jeder Umgebung.

**Datensatzlink** (Compose, nimmt die Spalte und baut nur ersatzweise selbst)

```
@if(not(empty(triggerOutputs()?['body/ayonto_recordurl'])),
    triggerOutputs()?['body/ayonto_recordurl'],
    if(or(empty(outputs('Umgebungsadresse')),
          or(empty(triggerOutputs()?['body/ayonto_recordtable']),
             empty(triggerOutputs()?['body/ayonto_recordid']))),
       '',
       concat(outputs('Umgebungsadresse'), '/main.aspx?pagetype=entityrecord&etn=',
              triggerOutputs()?['body/ayonto_recordtable'],
              '&id=', triggerOutputs()?['body/ayonto_recordid'])))
```

Soll der Link in einer bestimmten App öffnen, ergänzen Sie `appid=<ID der App>&` direkt hinter
`main.aspx?`. Ohne App-ID öffnet Dataverse die Standard-App des Benutzers — ein gültiger Link.

**Absender und Empfänger als Aktivitätsparteien**

```json
[
  { "partyid_systemuser@odata.bind": "/systemusers(<Absender>)",  "participationtypemask": 1 },
  { "partyid_systemuser@odata.bind": "/systemusers(<Empfänger>)", "participationtypemask": 2 }
]
```

`1` ist der Absender, `2` der Empfänger im An-Feld — so führt es die
[ActivityParty-Dokumentation](https://learn.microsoft.com/power-apps/developer/data-platform/activityparty-entity).
Im Flow stehen dort Ausdrücke:

```
@concat('/systemusers(', outputs('Absender_bestimmen'), ')')
@concat('/systemusers(', triggerOutputs()?['body/ayonto_userid'], ')')
```

**Absender bestimmen** (Compose)

```
@triggerOutputs()?['body/ayonto_mentionedbyid']
```

Leer gelassen kommt die Mail also von der Person, die erwähnt hat. Deren Postfach muss dafür
freigegeben und für den Versand aktiviert sein — sonst entsteht ein Entwurf und `SendEmail`
schlägt fehl. Wo das nicht für alle gilt, trägt man eine Warteschlange oder ein Dienstkonto in die
Environment Variable ein.

**Fehlertext für `ayonto_deliverydetail`**

Im Scope stehen zwei Aktionen, also muss die fehlgeschlagene herausgesucht werden statt geraten.
Dafür im Fehlerzweig **vor** der Rückschreibung eine Aktion *Array filtern*: Von
`@result('Versand')`, Bedingung `@item()?['status']` **ist nicht gleich** `Succeeded`. Dann liest
der Detailtext:

```
@substring(
  string(first(body('Fehler_ermitteln'))?['error']), 0,
  min(480, length(string(first(body('Fehler_ermitteln'))?['error'])))
)
```

Ohne diesen Filter griffe `first(result('Versand'))` womöglich die erfolgreiche Aktion heraus,
deren `error` leer ist — und in der Zeile stünde `Failed` ohne Grund.

Zwei Details daran sind nicht kosmetisch. Nur `?['error']`, nie das ganze `result()` — das enthält
auch die *Inputs* der Aktion, also Empfänger und Nachrichtentext, die dann in einer Spalte
stünden, die jeder Leseberechtigte sieht. Und der Schnitt auf 480 Zeichen, weil die Spalte 500
fasst: ein zu langes Update schlägt fehl, und dann bleibt die Zeile auf `New` stehen, als wäre nie
etwas passiert.

## Spalten der Tabelle

| Spalte | Typ | Länge | Inhalt |
|---|---|---|---|
| `ayonto_mentionid` | Primärschlüssel |  | Zeilen-ID, für die Rückschreibung |
| `ayonto_name` | Text | 200 | Anzeigename der Zeile |
| `ayonto_userid` | Text | 64 | erwähnte Person (Systembenutzer-ID) |
| `ayonto_username` | Text | 200 | erwähnte Person, Anzeigename |
| `ayonto_useremail` | Text | 200 | **Empfänger** |
| `ayonto_mentionedbyid` | Text | 64 | wer erwähnt hat |
| `ayonto_recordtable` | Text | 128 | Tabelle des Datensatzes |
| `ayonto_recordid` | Text | 64 | ID des Datensatzes |
| `ayonto_recordname` | Text | 400 | Anzeigename des Datensatzes |
| `ayonto_recordurl` | Text | 500 | fertiger Deep-Link |
| `ayonto_channel` | Text | 32 | **`Email` oder `Teams`** — welchen Weg diese Zeile meint |
| `ayonto_subject` | Text | 200 | Betreff |
| `ayonto_message` | Mehrzeilig | 2000 | Nachrichtentext |
| `ayonto_linktext` | Text | 100 | Beschriftung des Links auf den Datensatz |
| `ayonto_deliverystatus` | Text | 64 | `New`, `Sent`, `Failed` |
| `ayonto_deliverydetail` | Text | 500 | Fehlertext des Flows |

Der Plural-Name der Tabelle ist `ayonto_mentions`. Aktionen wie *Zeile aktualisieren* wollen
diesen Namen, der Trigger dagegen den logischen Namen `ayonto_mention` — eine Verwechslung, die
sich im Designer nicht zeigt und erst zur Laufzeit auffällt.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| `SendEmail` scheitert mit einem Rechtefehler | das Verbindungskonto darf nicht im Namen eines anderen senden — siehe [Absender und Verbindungskonto](#absender-und-verbindungskonto-sind-zweierlei) |
| Flow läuft nicht an | Änderungstyp oder Zeilenfilter passen nicht; Flow ist aus |
| Flow grün, keine Mail | Spaltenname falsch geschrieben — Dataverse liefert `null` statt eines Fehlers |
| Betreff immer der Ersatztext | `trigger()` statt `triggerOutputs()` |
| `SendEmail` schlägt fehl, E-Mail bleibt Entwurf | Postfach des Absenders ist nicht freigegeben oder nicht für den Versand aktiviert |
| Anlegen der E-Mail schlägt fehl | `ayonto_userid` oder der Absender ist leer — eine Aktivitätspartei braucht eine Benutzer-ID |
| Zeile bleibt auf `New` | Rückschreibung fehlt, oder der Detailtext war länger als die Spalte |
| kein Link in der Mail | `ayonto_recordtable` oder `ayonto_recordid` ist leer — die Komponente kennt den Datensatz nicht |
| Link öffnet die falsche App | App-ID fehlt — Dataverse nimmt dann die Standard-App |
| Flow läuft endlos | Trigger steht auf „Hinzugefügt oder Geändert" |
| Status `Failed`, Detail „kein Zweig für diesen Kanal" | die Komponente schickt einen Kanal, für den der Schalter keinen Fall hat |
| zwei Benachrichtigungen je Erwähnung | beide Kanäle sind eingeschaltet — je Kanal eine Zeile, so gewollt |

Die ersten drei Zeilen dieser Tabelle prüft `check-solution.py` beim Bauen: es hält jede Spalte,
die ein Flow liest, gegen die Spalten, die die Tabellen tatsächlich deklarieren, und weist
`trigger()?['body/…']` zurück. Ein Tippfehler in einem logischen Namen fällt damit im Pull Request
auf statt im Betrieb.

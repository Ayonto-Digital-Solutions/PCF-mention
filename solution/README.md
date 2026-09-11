# Benachrichtigungs-Flow einrichten

Die Lösung bringt eine Tabelle `ayonto_mention`, einen Cloud-Flow, der daraus E-Mails macht, eine
Connection Reference und drei Environment Variables mit.

**Versendet wird über Dataverse selbst.** Der Flow legt eine E-Mail-Aktivität an und löst die
Dataverse-Aktion `SendEmail` aus — kein externer Connector, keine Schlüssel, nichts, was die
Umgebung verlässt. Die einzige Verbindung, nach der der Import fragt, ist Dataverse: Ihr eigener
Tenant.

Wo die Voraussetzung dafür fehlt — serverseitige Synchronisierung mit einem freigegebenen
Postfach — tritt ein Connector an die Stelle der beiden Dataverse-Aktionen. Das ist in
[external-mail-provider.md](external-mail-provider.md) beschrieben, deutsch und englisch, ohne
einen bestimmten Anbieter zu nennen.

Dieses Dokument beschreibt beides: den mitgelieferten Flow konfigurieren, und einen vorhandenen
Flow auf diese Tabelle umbauen. Alle Ausdrücke stehen so da, dass man sie direkt in den Designer
kopieren kann.

## Wie die Benachrichtigung läuft

```
Mention-Component
  └─ legt je erwähnter Person und je eingeschaltetem Kanal eine Zeile an   (Status = New)
       └─ Flow löst auf neue Zeilen aus
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

## Was mitgeliefert wird und was die Umgebung stellt

| | mitgeliefert | von der Administration zu stellen |
|---|---|---|
| Tabelle `ayonto_mention` samt Ansicht | ✔ | |
| Flow *Ayonto – Send Mention Notification* | ✔ (E-Mail-Zweig) | einschalten; weitere Kanäle selbst ergänzen |
| Connection Reference Dataverse | ✔ | Verbindung zuweisen |
| Environment Variable Absender (Benutzer/Warteschlange) | ✔ (ohne Wert) | optional, leer = die erwähnende Person |
| Environment Variable Umgebungs-URL | ✔ (ohne Wert) | nur als Übersteuerung, normalerweise leer |
| Environment Variable App-ID | ✔ (ohne Wert) | optional, damit der Link in der richtigen App öffnet |
| Serverseitige Synchronisierung, freigegebenes Postfach | | ✔ |

**Ein externer Dienst ist nicht dabei.** Kein API-Schlüssel, keine Verbindung zu einem Dritten,
keine Domain außerhalb Ihrer Umgebung. Auch die beiden Code-Components deklarieren
`<external-service-usage enabled="false" />` und sprechen ausschließlich mit der
Dataverse-Web-API ihrer eigenen Umgebung.

## Unter welchem Konto der Flow läuft

Der Import fragt nach einer Dataverse-Verbindung. Frühere Versionen taten das nicht, weil sie nur
die Code-Components und die Tabelle enthielten: ein Code-Component läuft in der Browsersitzung des
angemeldeten Benutzers und spricht über `context.webAPI` mit dessen eigenen Rechten. Ein Flow hat
keine Sitzung — er läuft im Hintergrund, auch wenn niemand angemeldet ist — und braucht deshalb
eine eigene Identität.

Er benutzt sie für vier Dinge, alle innerhalb der Umgebung: auf neue Zeilen horchen, die
ausgelöste Zeile zurücklesen, die E-Mail anlegen und senden, den Status zurückschreiben.

**Nehmen Sie dafür ein Dienstkonto**, kein persönliches. Sonst steht der Versand still, sobald
diese Person das Unternehmen verlässt. Das Konto braucht Lese- und Schreibrechte auf
`ayonto_mention` sowie das Anlegen und Senden von E-Mail-Aktivitäten.

### Absender und Verbindungskonto sind zweierlei

Der Flow setzt als Absender standardmäßig die Person, die erwähnt hat — nicht das Konto, unter dem
er läuft. Im Namen eines anderen zu senden verlangt in Dataverse das Recht **„Send Email as
Another User"** ([`prvSendAsUser`](https://learn.microsoft.com/power-platform/admin/miscellaneous-privileges)).
Ohne das schlägt `SendEmail` fehl, und die Zeile steht mit dem Grund auf `Failed`.

Zwei Wege, beide in Ordnung:

* dem Dienstkonto das Recht geben — dann kommt die Benachrichtigung von der erwähnenden Person,
  was Empfänger meist erwarten
* `ayonto_MentionSenderUser` auf genau dieses Konto setzen — dann sendet es in eigenem Namen und
  braucht keine Delegierung, dafür steht in jeder Mail derselbe Absender

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

## Weg A — den mitgelieferten Flow verwenden

1. Lösung importieren. Der Import fragt nach **einer** Verbindung — Dataverse. Das ist kein
   Zugriff von außen: der Dialog belegt den Platzhalter, den die Lösung mitbringt, mit einer
   Verbindung in Ihrer Umgebung.
2. **Environment Variables** sind alle drei optional. Absender leer lassen heißt: die Mail kommt
   von der Person, die erwähnt hat. Die Umgebungsadresse muss **nicht** eingetragen werden, die
   App-ID nur, wenn der Link in einer bestimmten App öffnen soll — siehe
   [Der Link auf den Datensatz](#der-link-auf-den-datensatz).
3. Flow **einschalten**. Ein importierter Flow ist zunächst aus.
4. Test: eine Zeile in `ayonto_mention` von Hand anlegen, `ayonto_useremail` auf die eigene
   Adresse, `ayonto_message` mit Text, `ayonto_deliverystatus` = `New`.

## Weg B — einen vorhandenen Flow umbauen

Wer bereits einen Benachrichtigungs-Flow hat, braucht den mitgelieferten nicht. Der Umbau in der
Reihenfolge, in der er am wenigsten weh tut:

### 1. Den Flow in einer Lösung öffnen

Nicht unter *Meine Flows*, sondern innerhalb einer nicht verwalteten Lösung. Nur dort bekommt er
Connection References statt fest verdrahteter Verbindungen, und nur so lässt er sich später
weitergeben.

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

### 5. Reste des alten Flows entfernen

Was auf Spalten des alten Prozesses zugreift, muss weg — Dataverse beantwortet eine Spalte, die es
nicht gibt, mit `null` statt mit einem Fehler. Der Flow läuft dann grün und verschickt nichts, und
niemand erfährt davon. Insbesondere:

* Variablen und Compose-Schritte, die einen Link zusammenbauen. Der Deep-Link steht fertig in
  `ayonto_recordurl` — das Component setzt ihn samt App-ID, sofern `orgUrl` konfiguriert ist.
* Anzeigetexte, die Felder des alten Prozesses lesen.
* Fest eingetragene Absenderadressen und BCC-Einträge.

### 6. Einschalten und testen

Wie in Weg A, Schritt 3 und 4.

## Was der Flow bewusst offen lässt

Der mitgelieferte Flow übernimmt den Großteil: Trigger, Kanalschalter, Umgebungsadresse,
Datensatzlink, Versand über Dataverse, Statusrückschreibung. Zwei Dinge übernimmt er bewusst
nicht.

**Den zweiten Kanal.** Eine Aktion für einen Connector, den die Zielumgebung nicht lizenziert oder
freigegeben hat, blockiert den Import der ganzen Lösung — und wie eine Chat-Nachricht in einer
Organisation aussieht, ist eine Hausentscheidung. Ein mitgelieferter Zweig wäre eine Vorgabe, die
man erst wieder loswerden muss.

**Den Versand über einen externen Dienst.** Aus demselben Grund, und weil damit ein API-Schlüssel
ins Spiel käme. Wo der Dataverse-Versand nicht in Frage kommt, steht der Umbau in
[external-mail-provider.md](external-mail-provider.md) — deutsch und englisch, ohne einen
bestimmten Anbieter zu nennen.

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

Der Release baut beides. Wer den Flow anpassen will — und der Teams-Zweig ist genau das —,
importiert die **unmanaged** Lösung: darin ist der Flow direkt bearbeitbar. Eine managed Lösung
bekommt für jede Änderung eine unmanaged Ebene darüber, die bei jedem Update wieder gegen die
neue Version geprüft werden will. Für eine Lösung, die ausdrücklich nur den Großteil vorgibt,
ist das der umständlichere Weg.

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
Standard-App des Benutzers. Wer eine bestimmte App will, trägt ihre ID in die Environment Variable
`ayonto_MentionAppId` ein — einmal pro Umgebung.

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

Die Environment Variable `ayonto_MentionEnvironmentUrl` ist eine reine Übersteuerung, für den Fall
dass die App über einen anderen Host erreicht wird als die Web-API. Leer lassen ist der Normalfall.

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

**Umgebungsadresse** (Compose; leitet sie aus der Zeile ab, die Variable übersteuert nur)

```
@if(empty(parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)')),
    concat('https://', uriHost(outputs('Datensatz_lesen')?['body/@odata.id'])),
    if(endsWith(parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)'), '/'),
       substring(parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)'), 0,
                 sub(length(parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)')), 1)),
       parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)')))
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
       concat(outputs('Umgebungsadresse'), '/main.aspx?',
              if(empty(parameters('Ayonto Mention App Id (ayonto_MentionAppId)')), '',
                 concat('appid=', parameters('Ayonto Mention App Id (ayonto_MentionAppId)'), '&')),
              'pagetype=entityrecord&etn=', triggerOutputs()?['body/ayonto_recordtable'],
              '&id=', triggerOutputs()?['body/ayonto_recordid'])))
```

**Nachrichtentext (HTML)**

```
@concat(
  '<p>', coalesce(triggerOutputs()?['body/ayonto_message'], ''), '</p>',
  if(empty(triggerOutputs()?['body/ayonto_recordname']), '',
     concat('<p>Datensatz: ', triggerOutputs()?['body/ayonto_recordname'], '</p>')),
  if(empty(outputs('Datensatzlink')), '',
     concat('<p><a href="', outputs('Datensatzlink'), '">',
            if(empty(triggerOutputs()?['body/ayonto_linktext']), 'Datensatz öffnen',
               triggerOutputs()?['body/ayonto_linktext']), '</a></p>'))
)
```

Die beiden `if(empty(…))` sind der Grund, warum die Mail auch dann lesbar bleibt, wenn weder
Spalte noch Environment Variable einen Link hergeben: statt eines toten Links fehlt der Absatz.

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
@if(empty(parameters('Ayonto Mention Sender User (ayonto_MentionSenderUser)')),
    triggerOutputs()?['body/ayonto_mentionedbyid'],
    parameters('Ayonto Mention Sender User (ayonto_MentionSenderUser)'))
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

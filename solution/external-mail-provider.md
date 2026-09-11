# Versand über einen externen Dienst · Sending through an external provider

**[Deutsch](#deutsch)** · **[English](#english)**

Der in [README.md](README.md) beschriebene Flow versendet über Dataverse selbst. Dieses Dokument
beschreibt, wie man stattdessen einen externen E-Mail-Dienst anbindet — ohne einen bestimmten Anbieter zu nennen, weil
das Vorgehen bei allen gleich ist.

---

## Deutsch

### Wann man das braucht

Der Dataverse-Versand setzt voraus, dass die Umgebung **serverseitige Synchronisierung** nutzt und
das sendende Postfach **genehmigt und für den Versand aktiviert** ist. Ist das nicht der Fall,
entstehen nur Entwürfe und nichts geht hinaus. Dann — oder wenn aus anderen Gründen ein eigener
Versanddienst gewünscht ist — tritt ein Connector an die Stelle der beiden Dataverse-Aktionen.

### Was gleich bleibt

Alles außer dem Versand selbst:

* die Tabelle `ayonto_mention` und was die Komponente hineinschreibt
* die Einstellungen an der Komponente — Schalter, Betreff, Text und Linkbeschriftung je Kanal
* der Trigger, der Datensatzlink und die Statusrückschreibung
* der Schalter auf `ayonto_channel`

**An der Komponente ist nichts zu ändern.** Sie kennt keinen Versandweg; sie schreibt eine Zeile.

### Was in den Flow kommt

**1. Eine Connection Reference für den Connector.** In der Lösung anlegen
(*Neu → Mehr → Verbindungsverweis*), Connector auswählen, Verbindung zuweisen. Der API-Schlüssel
oder das Kennwort lebt ausschließlich in dieser Verbindung — nicht im Flow, nicht in einer
Environment Variable, nicht in der Lösung.

**2. Environment Variables für den Absender**, falls der Dienst eine Absenderadresse verlangt.
Zwei Textvariablen genügen: Adresse und Anzeigename. Damit muss beim nächsten Environment niemand
in den Flow hinein.

**3. Die Versandaktion**, im Bereich `Versand` **anstelle** von `E-Mail anlegen` und
`E-Mail senden`. Jeder Mail-Connector hat dieselben vier bis fünf Eingaben; so werden sie belegt:

| Eingabe des Connectors | Wert |
|---|---|
| Von / Absenderadresse | Environment Variable |
| Von-Name | Environment Variable |
| An / Empfänger | `@{triggerOutputs()?['body/ayonto_useremail']}` |
| Betreff | `@{coalesce(triggerOutputs()?['body/ayonto_subject'], 'Sie wurden erwähnt')}` |
| Inhalt / Text | der Ausdruck unten |
| HTML | ja |

Inhalt:

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

Beachten Sie, dass der Empfänger hier die **Mailadresse** ist (`ayonto_useremail`), während der
Dataverse-Versand die **Benutzer-ID** braucht (`ayonto_userid`). Beides steht in der Zeile.

### Was gleich bleiben muss

Der Bereich heißt weiterhin `Versand`, und die beiden Rückschreibungen hängen daran. Enthält der
Bereich **nur noch eine** Aktion, kann die Aktion *Array filtern* im Fehlerzweig entfallen und der
Detailtext direkt `first(result('Versand'))?['error']` lesen. Bei mehreren Aktionen muss sie
bleiben — sonst greift `first(…)` womöglich die erfolgreiche heraus, deren Fehler leer ist, und in
der Zeile steht `Failed` ohne Grund.

Zwei Dinge am Detailtext sind nicht kosmetisch: nur `?['error']` übernehmen, nie das ganze
`result()` — das trägt auch die *Inputs* der Aktion, also Empfänger und Nachrichtentext. Und auf
480 Zeichen schneiden, weil die Spalte 500 fasst und ein zu langes Update fehlschlägt.

### Testen

Eine Zeile in `ayonto_mention` von Hand anlegen: `ayonto_useremail` auf die eigene Adresse,
`ayonto_message` mit Text, `ayonto_channel` auf `Email`, `ayonto_deliverystatus` auf `New`. Kommt
die Mail und steht die Zeile danach auf `Sent`, ist der Umbau fertig.

---

## English

### When you need this

Sending through Dataverse requires the environment to use **server-side synchronisation** with a
mailbox that is **approved and enabled for sending**. Without that, mails pile up as drafts and
nothing leaves. In that case — or when a different provider is wanted for other reasons — a
connector takes the place of the two Dataverse actions.

### What stays the same

Everything but the sending itself:

* the `ayonto_mention` table and what the component writes into it
* the component's settings — switch, subject, text and link label per channel
* the trigger, the record link and the status write-back
* the switch on `ayonto_channel`

**Nothing changes on the component.** It knows no delivery path; it writes a row.

### What goes into the flow

**1. A connection reference for the connector.** Create it in the solution
(*New → More → Connection reference*), pick the connector, assign a connection. The API key or
password lives in that connection only — not in the flow, not in an environment variable, not in
the solution.

**2. Environment variables for the sender**, if the service requires a sender address. Two text
variables are enough: address and display name. Then nobody has to open the flow in the next
environment.

**3. The sending action**, inside the `Versand` scope **in place of** `E-Mail anlegen` and
`E-Mail senden`. Every mail connector takes the same four or five inputs:

| Connector input | Value |
|---|---|
| From / sender address | environment variable |
| From name | environment variable |
| To / recipient | `@{triggerOutputs()?['body/ayonto_useremail']}` |
| Subject | `@{coalesce(triggerOutputs()?['body/ayonto_subject'], 'You were mentioned')}` |
| Body / text | the expression below |
| Is HTML | yes |

Body:

```
@concat(
  '<p>', coalesce(triggerOutputs()?['body/ayonto_message'], ''), '</p>',
  if(empty(triggerOutputs()?['body/ayonto_recordname']), '',
     concat('<p>Record: ', triggerOutputs()?['body/ayonto_recordname'], '</p>')),
  if(empty(outputs('Datensatzlink')), '',
     concat('<p><a href="', outputs('Datensatzlink'), '">',
            if(empty(triggerOutputs()?['body/ayonto_linktext']), 'Open record',
               triggerOutputs()?['body/ayonto_linktext']), '</a></p>'))
)
```

Note that the recipient here is the **mail address** (`ayonto_useremail`), whereas the Dataverse
path needs the **user id** (`ayonto_userid`). The row carries both.

### What has to stay as it is

The scope keeps the name `Versand`, and both write-backs hang off it. If the scope then holds
**only one** action, the *Filter array* step in the failure branch can go and the detail text can
read `first(result('Versand'))?['error']` directly. With more than one action it has to stay —
otherwise `first(…)` may pick the one that succeeded, whose error is empty, and the row reads
`Failed` with no reason.

Two details of that text are not cosmetic: take only `?['error']`, never the whole `result()` —
that also carries the action's *inputs*, meaning recipient and message body. And cut it to 480
characters, because the column holds 500 and an over-long update fails.

### Testing

Create a row in `ayonto_mention` by hand: `ayonto_useremail` your own address, `ayonto_message`
some text, `ayonto_channel` set to `Email`, `ayonto_deliverystatus` to `New`. If the mail arrives
and the row then reads `Sent`, the rebuild is done.

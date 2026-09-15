# In-App-Benachrichtigung zusätzlich zur Mail

Der in [README.md](README.md) beschriebene Flow verschickt eine E-Mail. Dieses Dokument beschreibt,
wie derselbe Flow zusätzlich eine **Benachrichtigung in der Glocke** einer modellgesteuerten App
zustellt — mit formatiertem Text und einem klickbaren Link auf den Datensatz.

**An der Komponente ist nichts zu ändern.** Sie schreibt eine Zeile; welche Wege der Flow daraus
macht, ist seine Sache.

## Was das ist und was nicht

* **Keine Push-Benachrichtigung.** In-App-Benachrichtigungen erscheinen nur, solange die App
  geöffnet ist. Für Mobilgeräte ist der Power-Apps-Notification-Connector zuständig.
* **Kein Echtzeitkanal.** Die App holt Benachrichtigungen beim Start und bei jeder
  Seitennavigation ab, frühestens eine Minute nach dem letzten Abruf. Wer auf derselben Seite
  stehen bleibt, sieht nichts nachkommen.
* **Ein Empfänger je Benachrichtigung.** Kein Teamversand.

## Was vorher stimmen muss

**1. Das Feature in der App einschalten.** Ohne diesen Schalter läuft der Flow fehlerfrei durch und
trotzdem erscheint keine Glocke. Die Einstellung liegt **in der App**, nicht in der Umgebung — bei
mehreren Apps je App:

Lösung öffnen → App über das **Edit**-Splitmenü im modernen App-Designer öffnen →
**Settings → Features** → **In-app notifications** einschalten → **Save** → App **veröffentlichen**.

**2. Rechte.** Zusätzlich zu den Tabellenrechten braucht das Konto, unter dem der Flow läuft, das
Privileg **Send In-App Notification** (`prvSendAppNotification`). Es ist standardmäßig der Rolle
**Environment Maker** zugewiesen und liegt im Rollen-Editor unter *Sonstige Berechtigungen*.

| Zweck | Benötigt |
|---|---|
| Benachrichtigungen empfangen | Lesen auf der Benachrichtigungstabelle; Erstellen, Lesen, Schreiben und Anfügen auf der App-Benutzereinstellung; Lesen und AppendTo auf der Einstellungsdefinition |
| An andere senden | Erstellen auf der Benachrichtigungstabelle mit Zugriffsebene Lokal, Übergeordnet oder Organisation — je nach Geschäftseinheit des Empfängers |
| `SendAppNotification` ausführen | zusätzlich **Send In-App Notification** |

Das Privileg gilt nur für die **Nachricht**. Wer die Benachrichtigung stattdessen als Zeile in der
Tabelle anlegt, braucht es nicht — dieser Weg führt hier aber nicht zum Ziel, siehe unten.

> **Der Flow läuft unter dem Konto seiner Verbindung.** In Umgebungen mit mehreren
> Geschäftseinheiten muss dessen Zugriffsebene die Empfänger erreichen, sonst scheitert der Versand
> lautlos für einen Teil von ihnen. Dieselbe Frage wie beim Mailversand — siehe
> [Unter welchem Konto der Flow läuft](README.md#unter-welchem-konto-der-flow-läuft).

## Warum es ohne OverrideContent keinen Link gibt

`Title` und `Body` unterstützen **weder Markdown noch HTML**. Was dort an Formatierung steht, kommt
beim Empfänger als Klartext an. Formatierung und Links entstehen ausschließlich über
`OverrideContent`, das beide Felder mit einem begrenzten Markdown-Satz überschreibt:

| Stil | Markdown |
|---|---|
| Fett | `**Fett**` |
| Kursiv | `_Kursiv_` |
| Aufzählung | `- Punkt 1\r- Punkt 2` |
| Nummeriert | `1. Eins\r2. Zwei` |
| Link | `[Titel](url)` |
| Zeilenumbruch | `\n\n\n\n` |

**Der Weg über eine Tabellenzeile führt nicht zum Ziel.** Die Benachrichtigungstabelle hat keine
Spalte `OverrideContent` — die Eigenschaft existiert nur als Parameter der Nachricht. Schreibbar
sind dort `Title`, `Body`, `Data`, `IconType`, `ToastType`, `Priority`, `TTLInSeconds`, `OwnerId`
und einige Systemspalten, mehr nicht. Über den Datensatzweg ist also kein Link erreichbar.

## Was in den Flow kommt

Drei Aktionen, hinter `Als_gesendet_vermerken`:

```
… → Versand → Als_gesendet_vermerken → Body_Kurz → Texte_escapen → Glocke_senden
```

**Warum dahinter und nicht in den `Versand`-Bereich.** `ayonto_deliverystatus` sagt aus, ob die
**Mail** rausging. Läge der Glockenversand im selben Bereich, machte ein Fehler dort aus einer
zugestellten Mail eine fehlgeschlagene Zeile. Dahinter bleibt die Statusspalte ehrlich; ein
gescheiterter Glockenversand ist im Ausführungsverlauf zu sehen.

### 1 · Body_Kurz

*Datenübertragung → **Verfassen***

```
if(
  greater(length(triggerOutputs()?['body/ayonto_message']), 500),
  concat(substring(triggerOutputs()?['body/ayonto_message'], 0, 497), '...'),
  triggerOutputs()?['body/ayonto_message']
)
```

**Wozu.** `ayonto_message` fasst **2000** Zeichen, `Body` an der Benachrichtigung nur **500**. Ohne
diese Kürzung scheitert jede längere Erwähnung. Der Betreff passt: `ayonto_subject` fasst 200
Zeichen, `Title` nimmt 256.

### 2 · Texte escapen

Der Wert von `OverrideContent` wird als JSON zusammengesetzt. Ein Anführungszeichen, ein Backslash
oder ein Zeilenumbruch im Text zerlegt das JSON und führt zu einem nichtssagenden `400`. Je ein
**Verfassen**:

**`Msg_Escaped`**

```
replace(replace(replace(replace(outputs('Body_Kurz'), '\', '\\'), '"', '\"'), decodeUriComponent('%0D'), ''), decodeUriComponent('%0A'), ' ')
```

**`Subject_Escaped`**

```
replace(replace(triggerOutputs()?['body/ayonto_subject'], '\', '\\'), '"', '\"')
```

**`LinkText_Escaped`**

```
replace(replace(replace(replace(outputs('Link_Text'), '\', '\\'), '"', '\"'), '[', '('), ']', ')')
```

Beim Linktext werden zusätzlich eckige Klammern ersetzt — sie würden sonst die Markdown-Linksyntax
zerreißen.

> **Zur Syntax.** In Power-Automate-Ausdrücken sind Backslash und Anführungszeichen innerhalb
> einfacher Anführungszeichen **keine** Sonderzeichen. `'\'` ist ein echter Backslash, `'\"'` ist
> Backslash plus Anführungszeichen. Genau so eingeben.

### 3 · Glocke_senden

*Microsoft Dataverse → **Eine ungebundene Aktion ausführen***, Aktionsname `SendAppNotification`,
danach **Erweiterte Parameter → Alle anzeigen**.

| Parameter | Wert | Art |
|---|---|---|
| `item/Recipient` | Ausdruck unten | fx |
| `item/Title` | `triggerOutputs()?['body/ayonto_subject']` | fx |
| `item/Body` | `outputs('Body_Kurz')` | fx |
| `item/IconType` | `100000004` | Klartext |
| `item/ToastType` | `200000000` | Klartext |
| `item/Priority` | `200000000` | Klartext |
| `item/Expiry` | `604800` | Klartext |
| `item/OverrideContent` | Ausdruck unten | fx |
| `item/Actions` | Ausdruck unten | fx |

**`item/Recipient`**

```
concat('/systemusers(', triggerOutputs()?['body/ayonto_userid'], ')')
```

Die Nachricht erwartet eine OData-Referenz auf den Systembenutzer; eine E-Mail-Adresse wird **nicht**
angenommen. Die Komponente schreibt die Benutzer-ID bereits in `ayonto_userid`, deshalb entfällt
hier das Nachschlagen über die Adresse.

`Title` und `Body` gehen als einfache Zeichenketten durch und brauchen **kein** Escaping. Escaped
wird nur, was innerhalb von `OverrideContent` landet.

**`item/OverrideContent`**

```
json(concat('{"@odata.type":"#Microsoft.Dynamics.CRM.expando","title":"', outputs('Subject_Escaped'), '","body":"', outputs('Msg_Escaped'), if(empty(outputs('Record_Link')), '', concat('\n\n\n\n[', outputs('LinkText_Escaped'), '](', outputs('Record_Link'), ')')), '"}'))
```

**`item/Actions`**

```
if(empty(outputs('Record_Link')), null, json(concat('{"@odata.type":"Microsoft.Dynamics.CRM.expando","actions@odata.type":"#Collection(Microsoft.Dynamics.CRM.expando)","actions":[{"title":"Datensatz oeffnen","data":{"@odata.type":"#Microsoft.Dynamics.CRM.expando","type":"url","url":"', outputs('Record_Link'), '","navigationTarget":"newWindow"}}]}')))
```

Beide prüfen auf einen leeren `Record_Link`. Ohne diese Prüfung entstünde bei einer Erwähnung ohne
Datensatzbezug ungültiges JSON beziehungsweise eine Schaltfläche mit leerer Adresse.

> **Aktionsnamen im Ausdruck.** Der Designer ersetzt Leerzeichen im Aktionsnamen durch Unterstriche.
> Eine Aktion namens `Body Kurz` heißt im Ausdruck `outputs('Body_Kurz')`.

## Der json()-Kniff

**Das ist die Stelle, an der die meiste Zeit verloren geht.**

`OverrideContent` und `Actions` sind vom Typ `expando`, erwarten also verschachtelte **Objekte**.
Das Eingabefeld im Designer übergibt seinen Inhalt aber als **Zeichenkette**. Dataverse versucht
daraufhin, den JSON-Anfang als URL-Segment aufzulösen:

```
0x80060888
URL was not parsed due to an ODataUnrecognizedPathException.
Resource not found for the segment '{"@odata.type":"' provided in the URL.
```

`json()` um den zusammengesetzten String macht daraus ein echtes Objekt, bevor der Connector es
verpackt:

```
falsch   concat('{"@odata.type": … }')
richtig  json(concat('{"@odata.type": … }'))
```

Das gilt für **jede** ungebundene Dataverse-Aktion mit verschachtelten Parametern, nicht nur für
diese.

## Welche Links eine Aktionsschaltfläche öffnet

Aus Sicherheitsgründen öffnet eine Aktion vom Typ `url` **nur** diese Formen:

| Form | Beispiel |
|---|---|
| HTTPS | `https://<umgebung>/main.aspx?pagetype=entityrecord&etn=<tabelle>&id=<guid>` |
| HTTP | `http://<server>/seite` |
| Mail | `mailto:…` |
| Telefon | `tel:…` |
| Deeplink der mobilen App | `dynamicsxrm://…` |
| Pfad **mit führendem** `/` | `/main.aspx?pagetype=entityrecord&etn=<tabelle>&id=<guid>` |
| Abfrage **mit führendem** `?` | `?pagetype=entityrecord&etn=<tabelle>&id=<guid>` |

Alles andere wird blockiert — und zwar **still**: Die Benachrichtigung erscheint, die Schaltfläche
ist da, der Klick tut nichts. Blockiert sind unter anderem ein Pfad **ohne** führenden Schrägstrich
(`main.aspx?…`), `javascript:` und `data:` sowie protokollrelative Adressen (`//host/seite`).

**Für diesen Flow ist das erledigt**: `Record_Link` liefert eine vollständige `https`-Adresse oder
einen Leerstring, und beide Ausdrücke oben fangen den Leerstring ab. Wer den Ausdruck auf einen
relativen Pfad umstellt, muss den führenden Schrägstrich mitnehmen.

## Parameterreferenz

**IconType** — `100000000` Info (Standard) · `100000001` Success · `100000002` Failure ·
`100000003` Warning · `100000004` Mention · `100000005` Custom (verlangt `iconUrl` in
`OverrideContent`)

**ToastType** — `200000000` Timed: erscheint kurz (Standard vier Sekunden), danach nur im Center ·
`200000001` Hidden: nur im Center, kein Einblenden

**Priority** — `200000000` Normal (Standard) · `200000001` High: erscheint oben im Center. Sortiert
wird absteigend nach Priorität und Erstellungsdatum.

**Aktionstypen** — `url` öffnet eine Adresse · `sidepane` öffnet einen Seitenbereich ·
`teamsChat` startet einen Teams-Chat. Bei `url` steuert `navigationTarget`, wo geöffnet wird:
`inline` (Standard), `dialog`, `newWindow`. Bei absoluten Adressen empfiehlt sich `newWindow`.

## Grenzen

| Grenze | Wert |
|---|---|
| Empfänger je Benachrichtigung | 1 — kein Teamversand |
| `Title` | 256 Zeichen (`ayonto_subject` fasst 200 — passt) |
| `Body` | 500 Zeichen (`ayonto_message` fasst 2000 — **kürzen**, siehe `Body_Kurz`) |
| `Data` | 5000 Zeichen |
| Standardablauf | 14 Tage, per Administrator überschreibbar; `Expiry` setzt es je Nachricht |
| Abruf | App-Start und Seitennavigation, frühestens 60 Sekunden nach dem letzten Abruf |

Die Benachrichtigungstabelle belegt Datenbankspeicher der Organisation. Bei hohem Aufkommen die
Ablaufzeit bewusst setzen, statt den Standard laufen zu lassen.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| `400`, `ODataUnrecognizedPathException` | `json()` fehlt um `OverrideContent` oder `Actions` |
| `400`, JSON-Parserfehler | Sonderzeichen im Text — die Escape-Schritte fehlen oder greifen nicht |
| `400`, Längenfehler auf `Body` | `Body_Kurz` fehlt, und die Erwähnung ist länger als 500 Zeichen |
| `403` oder Privilegfehler | **Send In-App Notification** fehlt im Kontext der Verbindung |
| Flow grün, keine Glocke | Feature in der App nicht eingeschaltet oder App nicht veröffentlicht |
| Nur beim Absender sichtbar | Zugriffsebene auf der Benachrichtigungstabelle reicht für die Geschäftseinheit des Empfängers nicht |
| Markdown als Klartext sichtbar | Formatierung steht in `Title`/`Body` statt in `OverrideContent` |
| Schaltfläche da, Klick tut nichts | Adressform nicht erlaubt — siehe oben, meist ein fehlender führender Schrägstrich |
| Erfolg, aber kein Link | `Record_Link` war leer: die Erwähnung hat keinen Datensatzbezug |
| Kommt verzögert | Normales Abrufverhalten, kein Fehler |

**Bei einem `400`:** In den **Eingaben** der Aktion den erzeugten Wert ansehen und den JSON-Teil in
einen Validator kopieren — ein gebrochenes Anführungszeichen ist dort sofort sichtbar. Zum
Eingrenzen `Actions` leeren und nur mit `OverrideContent` testen.

**Testreihenfolge:** erst nur `Recipient` und `Title` — das prüft Rechte und Empfängerformat. Dann
`OverrideContent` dazu — das prüft den `json()`-Kniff. Zuletzt `Actions`. Nach jedem Schritt in der
App **einmal navigieren oder neu laden**, sonst wird nichts abgerufen.

## Quellen

* [Send in-app notifications within model-driven apps](https://learn.microsoft.com/power-apps/developer/model-driven-apps/clientapi/send-in-app-notifications)
  — Parameter, Enum-Werte, Markdown-Satz, erlaubte Adressformen, Rechte, Abrufverhalten
* [Notification (appnotification) table/entity reference](https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/appnotification)
  — Spaltenliste und Längen

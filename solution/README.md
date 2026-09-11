# Benachrichtigungs-Flow einrichten

Die Lösung bringt eine Tabelle `ayonto_mention`, einen Cloud-Flow, der daraus E-Mails macht, zwei
Connection References und zwei Environment Variables mit. Was sie **nicht** mitbringen kann, sind
die Verbindungen selbst und die Absenderadresse — die gehören in die Zielumgebung und werden dort
einmalig gesetzt.

Dieses Dokument beschreibt beides: den mitgelieferten Flow konfigurieren, und einen vorhandenen
Flow auf diese Tabelle umbauen. Alle Ausdrücke stehen so da, dass man sie direkt in den Designer
kopieren kann.

## Wie die Benachrichtigung läuft

```
Mention-Component
  └─ legt eine Zeile je erwähnter Person in ayonto_mention an   (ayonto_deliverystatus = New)
       └─ Flow löst auf neue Zeilen aus
            ├─ Datensatzlink ermitteln
            ├─ Versand (Scope)
            │    └─ E-Mail über den Mail-Connector
            ├─ erfolgreich   → ayonto_deliverystatus = Sent
            └─ fehlgeschlagen → ayonto_deliverystatus = Failed, ayonto_deliverydetail = Grund
```

Die Zeile ist das Bindeglied. Das Component kennt keinen Versandweg und keinen Connector; es
schreibt, wer was in welchem Datensatz erwähnt hat, und der Flow entscheidet, was daraus wird.

## Was mitgeliefert wird und was die Umgebung stellt

| | mitgeliefert | von der Administration zu stellen |
|---|---|---|
| Tabelle `ayonto_mention` samt Ansicht | ✔ | |
| Flow *Ayonto – Send Mention Notification* | ✔ | einschalten |
| Connection Reference Dataverse | ✔ | Verbindung zuweisen |
| Connection Reference Mail-Connector | ✔ | Verbindung zuweisen (API-Key) |
| Environment Variable Absenderadresse | ✔ (ohne Wert) | Wert setzen |
| Environment Variable Absendername | ✔ (Vorgabewert) | bei Bedarf ändern |
| Environment Variable Umgebungs-URL | ✔ (ohne Wert) | setzen, falls die Komponente keinen Link schreibt |
| Environment Variable App-ID | ✔ (ohne Wert) | optional |
| Verifizierter Absender beim Mail-Dienst | | ✔ |

Der API-Key des Mail-Dienstes lebt **ausschließlich in der Verbindung**. Nicht im Flow, nicht in
einer Environment Variable, nicht in der Lösung — sonst stünde er im Export und damit in jeder
Kopie der Lösung.

## Weg A — den mitgelieferten Flow verwenden

1. Lösung importieren. Der Import fragt nach den beiden Verbindungen; wo noch keine existiert,
   legt man sie im Dialog an.
2. **Environment Variables** setzen: Absenderadresse (Pflicht, ohne Vorgabe) und Absendername.
   Die Adresse muss beim Mail-Dienst als *Verified Sender* eingetragen sein, sonst weist er den
   Versand mit 403 ab — der häufigste Fehler beim ersten Lauf, und er sieht aus wie ein
   Verbindungsproblem. Zur Umgebungs-URL und zur App-ID siehe den Abschnitt
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

| Feld | Wert |
|---|---|
| Von | Environment Variable Absenderadresse |
| Von-Name | Environment Variable Absendername |
| An | `ayonto_useremail` aus dem Trigger |
| Betreff | siehe unten |
| Text | siehe unten |
| Ist HTML | Ja |

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

## Der Link auf den Datensatz

Wer eine Benachrichtigung bekommt, soll den Datensatz mit einem Klick öffnen können — sonst muss
der Empfänger ihn suchen, und genau das kostet die Benachrichtigung ihren Zweck. Der Link steht
deshalb in jeder Nachricht, sowohl in der Mail als auch im optionalen zweiten Kanal.

Er kommt aus einer von zwei Quellen, und der Flow nimmt die erste, die etwas liefert:

1. **`ayonto_recordurl` aus der Zeile.** Das Component schreibt den fertigen Deep-Link hinein —
   samt App-ID, wenn eine konfiguriert ist. Das ist der Normalfall und der genauere Weg, weil das
   Component weiß, auf welchem Datensatz es sitzt.
2. **Aus Umgebungs-URL, Tabelle und Zeilen-ID zusammengesetzt.** Greift, wenn die Spalte leer ist,
   und braucht die Environment Variable mit der Umgebungs-URL.

Warum es Quelle 2 überhaupt gibt: ein Code-Component darf das `window`-Objekt nicht lesen, die
Umgebungs-URL lässt sich zur Laufzeit also nicht ermitteln, sondern muss auf dem Component als
Eigenschaft `orgUrl` konfiguriert werden
([FAQ](https://learn.microsoft.com/power-apps/developer/component-framework/faq#can-i-access-window-object-from-the-component)).
Wird das vergessen, bleibt `ayonto_recordurl` leer — und ohne Ersatz stünde in der Mail dann kein
Link. Die Environment Variable ist die zweite Chance: einmal pro Umgebung gesetzt, gilt sie für
jede Benachrichtigung, egal wie die Komponente auf dem einzelnen Formular konfiguriert ist.

Liefert keine der beiden Quellen etwas, entfällt der Absatz mit dem Link — ein toter Link ist
schlechter als keiner.

**Damit Quelle 1 funktioniert**, braucht die Komponente auf dem Formular:

| Eigenschaft | Wert |
|---|---|
| `entityId` | an die Primärschlüsselspalte der Tabelle gebunden |
| `entityName` | logischer Name der Tabelle, statisch |
| `orgUrl` | Basis-URL der Umgebung, z. B. `https://contoso.crm4.dynamics.com` |
| `appId` | optional, damit der Link in der richtigen App öffnet |

**Damit Quelle 2 funktioniert**, genügen die beiden Environment Variables — Umgebungs-URL
zwingend, App-ID optional. Ein abschließender Schrägstrich in der URL stört nicht, der Flow
schneidet ihn ab.

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

**Umgebungsadresse** (Compose, schneidet einen abschließenden Schrägstrich ab)

```
@if(endsWith(parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)'), '/'),
    substring(parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)'), 0,
              sub(length(parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)')), 1)),
    parameters('Ayonto Mention Environment Url (ayonto_MentionEnvironmentUrl)'))
```

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
     concat('<p><a href="', outputs('Datensatzlink'), '">Datensatz öffnen</a></p>'))
)
```

Die beiden `if(empty(…))` sind der Grund, warum die Mail auch dann lesbar bleibt, wenn weder
Spalte noch Environment Variable einen Link hergeben: statt eines toten Links fehlt der Absatz.

**Fehlertext für `ayonto_deliverydetail`**

```
@substring(
  string(first(result('Versand'))?['error']), 0,
  min(480, length(string(first(result('Versand'))?['error'])))
)
```

Zwei Details daran sind nicht kosmetisch. Nur `?['error']`, nie das ganze `result()` — das enthält
auch die *Inputs* der Aktion, also Empfängeradresse und Nachrichtentext, die dann in einer Spalte
stünden, die jeder Leseberechtigte sieht. Und der Schnitt auf 480 Zeichen, weil die Spalte 500
fasst: ein zu langes Update schlägt fehl, und dann bleibt die Zeile auf `New` stehen, als wäre nie
etwas passiert.

Der Ausdruck gilt für einen Scope mit **einer** Aktion. Stehen mehrere Aktionen parallel darin,
siehe den nächsten Abschnitt.

## Optional: ein zweiter Kanal neben der E-Mail

Manche Organisationen wollen die Benachrichtigung zusätzlich als Chat-Nachricht. Der mitgelieferte
Flow tut das bewusst nicht: eine Aktion für einen Connector, den die Zielumgebung nicht lizenziert
oder freigegeben hat, blockiert den Import der ganzen Lösung. Wer den Kanal braucht, ergänzt ihn
im eigenen Environment.

Nachrichtentext dafür:

```
<p><b>Sie wurden erwähnt</b></p>
<p>@{triggerOutputs()?['body/ayonto_message']}</p>
@{if(empty(triggerOutputs()?['body/ayonto_recordname']), '',
     concat('<p><b>Datensatz:</b> ', triggerOutputs()?['body/ayonto_recordname'], '</p>'))}
@{if(empty(outputs('Datensatzlink')), '',
     concat('<p><a href="', outputs('Datensatzlink'), '">Datensatz öffnen</a></p>'))}
```

Als Empfänger dient `ayonto_useremail`. Chat-Connectoren lösen eine Person über ihre Mailadresse
auf: weicht die Dataverse-Adresse eines Benutzers von seinem Anmeldenamen ab, wird er nicht
gefunden — die erste Stelle zum Nachsehen, wenn die Mail ankommt und die Nachricht nicht.

**Wo die Aktion steht, ist eine Entscheidung.** `ayonto_deliverystatus` hat einen Wert für die
ganze Zeile, also muss feststehen, wofür er steht:

*Empfohlen — neben dem Scope:* Die Chat-Aktion bekommt *Ausführen nach* = nichts, läuft also
parallel direkt am Trigger. Im Scope `Versand` steht weiterhin nur die Mail. Der Status bedeutet
dann genau eine Sache, und der Fehlerausdruck oben bleibt eindeutig. Ein Fehler im zweiten Kanal
steht dafür nur in der Laufhistorie.

*Wenn auch der zweite Kanal zählen soll:* beide Aktionen parallel **in** den Scope, und im
Fehlerzweig vor dem Update eine Aktion *Array filtern* einsetzen — Von `@result('Versand')`,
Bedingung `@item()?['status']` **ist nicht gleich** `Succeeded`. Der Detailtext liest dann:

```
@substring(
  string(first(body('Array_filtern'))?['error']), 0,
  min(480, length(string(first(body('Array_filtern'))?['error'])))
)
```

Ohne diesen Filter wäre `first(result('Versand'))` bei zwei parallelen Aktionen ein Zufallstreffer
— womöglich die erfolgreiche, deren `error` leer ist, und man stünde mit `Failed` und leerem
Detail da.

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
| `ayonto_subject` | Text | 200 | Betreff |
| `ayonto_message` | Mehrzeilig | 2000 | Nachrichtentext |
| `ayonto_deliverystatus` | Text | 64 | `New`, `Sent`, `Failed` |
| `ayonto_deliverydetail` | Text | 500 | Fehlertext des Flows |

Der Plural-Name der Tabelle ist `ayonto_mentions`. Aktionen wie *Zeile aktualisieren* wollen
diesen Namen, der Trigger dagegen den logischen Namen `ayonto_mention` — eine Verwechslung, die
sich im Designer nicht zeigt und erst zur Laufzeit auffällt.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| Flow läuft nicht an | Änderungstyp oder Zeilenfilter passen nicht; Flow ist aus |
| Flow grün, keine Mail | Spaltenname falsch geschrieben — Dataverse liefert `null` statt eines Fehlers |
| Betreff immer der Ersatztext | `trigger()` statt `triggerOutputs()` |
| Mail-Dienst lehnt mit 403 ab | Absenderadresse ist kein verifizierter Absender |
| Zeile bleibt auf `New` | Rückschreibung fehlt, oder der Detailtext war länger als die Spalte |
| kein Link in der Mail | weder `orgUrl` auf dem Component noch die Umgebungs-URL als Variable gesetzt |
| Link öffnet die falsche App | App-ID fehlt — Dataverse nimmt dann die Standard-App |
| Flow läuft endlos | Trigger steht auf „Hinzugefügt oder Geändert" |

Die ersten drei Zeilen dieser Tabelle prüft `check-solution.py` beim Bauen: es hält jede Spalte,
die ein Flow liest, gegen die Spalten, die die Tabellen tatsächlich deklarieren, und weist
`trigger()?['body/…']` zurück. Ein Tippfehler in einem logischen Namen fällt damit im Pull Request
auf statt im Betrieb.

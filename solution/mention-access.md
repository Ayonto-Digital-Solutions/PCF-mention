# Zugriff für Erwähnte

Wer per `@` erwähnt wird, den Datensatz aber nicht lesen darf, bekommt Lesezugriff —
**ausschließlich Lesen**. Prüfen und vergeben macht ein Flow in Ihrer Umgebung, so wie die
Benachrichtigung aus [README.md](README.md). Das Component prüft dafür keine Rechte und ruft nichts
zusätzlich auf: Es markiert je erwähnter Person genau eine Zeile in `ayonto_mention` mit
`ayonto_accessstatus = New`, und der Flow schreibt zurück, was daraus wurde.

Die Lösung bringt den allgemeinen Teil mit: die beiden Spalten `ayonto_accessstatus` und
`ayonto_accessdetail`, den Schalter `grantAccess` am Component, diese Anleitung und die fertige
Definition unter
[`examples/mention-access-flow.json`](examples/mention-access-flow.json). Sie wird beim Bauen gegen
die Tabelle geprüft, gehört aber nicht zur Lösung. **Alles Tabellenspezifische bleibt in Ihrer
Zielanwendung**: die Leserolle, die Rechte auf die Zieltabellen und was nach der Freigabe noch
passieren muss.

> **Diese Anleitung ist noch nicht in einer echten Umgebung durchgelaufen.** Anders als die
> Benachrichtigung in [README.md](README.md). Die Schritte sind gegen einen deutschsprachigen
> Designer geschrieben, und der Bau prüft das Beispiel gegen die Tabelle — Spaltennamen, Namen der
> Aktionen in Ausdrücken. Ob der Designer `RetrievePrincipalAccess` (Schritt 3) und `GrantAccess`
> mit dynamisch gebildetem Ziel (Schritt 6) so annimmt, wie es hier steht, ist **nicht erprobt**.
> Beide Stellen sind unten noch einmal markiert.

Platzhalter stehen in spitzen Klammern: `<zieltabelle>` ist der logische Name der Tabelle, auf
deren Formular die Komponente sitzt, `<leserolle>` der Name der Sicherheitsrolle, die Ihre
Zielanwendung dafür mitbringt.

## So liest sich die Anleitung

Dieselben Marken wie in [README.md](README.md#so-liest-sich-die-anleitung):

| Marke | Bedeutung |
|---|---|
| **Klartext** | direkt ins Feld tippen, keine Formel |
| **fx** | ins Feld klicken → Panel *Dynamischer Inhalt* → Reiter *Ausdruck* → einfügen → **OK** |
| **Dynamisch** | ins Feld klicken → Panel *Dynamischer Inhalt* → Eintrag aus der Liste wählen |
| **Auswahl** | Auswahlliste oder Schalter |

Es gelten auch die beiden Hinweise dort: **kein `@` ins fx-Feld**, und **Connector-Aktionen von Hand
anlegen**, nicht über die Zwischenablage.

## Wie der Zugriff läuft

```
Mention-Component  (grantAccess = Yes)
  └─ markiert je erwähnter Person genau eine Zeile             (Access Status = New)
       └─ Ihr Flow löst auf Zeilen mit Access Status = New aus
            1  Mention_abrufen           Zeile nach ID abrufen
               Nicht_mehr_offen          Bedingung → Beenden
            2  Leserolle                 Verfassen: Tabelle → Rolle
               Rollenname                Verfassen
               Ohne_Leserolle            Bedingung → Skipped, Beenden
               Zugriff                   Bereich
            3    Ziel                    Verfassen
                 Zugriff_pruefen         RetrievePrincipalAccess
            4    Hat_Lesezugriff         Verfassen
            5    Benutzer_abrufen        Zeile nach ID abrufen → Benutzer
                 Rolle_suchen            Zeilen auflisten → Sicherheitsrollen
                 Rolle_id                Verfassen
                 Rolle_fehlt             Bedingung
                   └─ Rolle_zuweisen     Zeilen verknüpfen
            6    Freigabe_noetig         Bedingung
                   └─ Freigabe           ungebundene Aktion GrantAccess
            7    Ergebnis_vermerken      Exists oder Granted
               Anschluss_Schritte        Bereich — Platz für Ihre Zielanwendung
               Fehler_ermitteln          nach Zugriff: fehlgeschlagen, Timeout
               Fehlertext                Verfassen
               Als_fehlgeschlagen_…      Failed
```

**Welche Zeile die Markierung trägt.** Das Component schreibt wie bisher eine Zeile je
eingeschaltetem Kanal. Mit `grantAccess = Yes` trägt davon genau **eine** `New` in *Access Status*:
die des ersten eingeschalteten Kanals, in der Reihenfolge `Email`, `Teams`. Die übrigen Zeilen
derselben Person bleiben ohne Zugriffsstatus. Ist gar kein Kanal eingeschaltet, schreibt das
Component für die Person eine eigene Zeile mit dem Kanal **`Access`** — ohne *Delivery Status*,
ohne Betreff und Text. Die Benachrichtigungs-Flows filtern auf Kanal und Zustellstatus und lassen
sie liegen.

**Ohne Datensatz keine Markierung.** Es gelten dieselben Voraussetzungen wie für den Link in einer
Benachrichtigung: Ohne Datensatz-ID und Tabellenname schreibt das Component keinen Zugriffsstatus.
Auf einem Datensatz, der noch nie gespeichert wurde, sagt es wie bisher, dass erst gespeichert
werden muss.

| Access Status | Bedeutung | geschrieben von |
|---|---|---|
| leer | kein Zugriff angefordert — `grantAccess` ist aus, oder es ist eine weitere Kanalzeile | — |
| `New` | Zugriff ist zu prüfen | Component, oder Ihre Zielanwendung zum Neuprüfen |
| `Exists` | die Person durfte den Datensatz schon lesen | Flow |
| `Granted` | Leserolle zugewiesen, soweit nötig, und Datensatz zum Lesen freigegeben | Flow |
| `Skipped` | für diese Tabelle ist keine Leserolle hinterlegt | Flow |
| `Failed` | ein Schritt ist gescheitert, der Grund steht in *Access Detail* | Flow |

## Was mitgeliefert wird und was Sie bauen

| | mitgeliefert | selbst zu bauen oder zu stellen |
|---|---|---|
| Spalten *Access Status* und *Access Detail* | ✔ | |
| Schalter `grantAccess` am Component | ✔ | |
| Zugriffs-Flow | als Anleitung | Flow anlegen, siehe unten |
| Leserolle mit Rechten auf die Zieltabellen | | ✔ |
| Anschluss-Schritte der Zielanwendung | | ✔ |
| Verbindung zu Dataverse | | beim Anlegen des Flows |

## Voraussetzungen

**Eine eigene Leserolle der Zielanwendung.** Eine Sicherheitsrolle mit **nur Lese-Rechten** auf die
Zieltabellen, Ebene **Benutzer**, und bei *Vererbung von Mitgliedsberechtigungen* die Einstellung
**Direct User (Basic) access level and Team privileges** — so wirkt die Rolle auch dann wie bei
direkter Zuweisung, wenn die Zielanwendung sie einem Team gibt. Die Rolle ist kein Beiwerk: Eine
Freigabe gibt Zugriff auf genau einen Datensatz, aber sie ersetzt nicht das Grundrecht, die Tabelle
überhaupt zu lesen. **Ohne dieses Grundrecht wirkt eine Freigabe nicht.** Ebene *Benutzer* reicht,
weil die Person damit nur ihre eigenen und die ihr freigegebenen Datensätze sieht — nicht mehr.

Sicherheitsrollen werden aus der Stamm-Business-Unit in jede untergeordnete übernommen, unter
demselben Namen. Deshalb sucht der Flow die Rolle per Name in der Business Unit der Person.

Damit die Person den Datensatz in der App öffnen kann, muss die Leserolle außerdem der
**modellgesteuerten App** zugeordnet sein: Apps werden über Sicherheitsrollen geteilt.

**Ein Verbindungskonto, das Rollen zuweisen und Datensätze freigeben darf** — in der Regel ein
Systemadministrator. Dataverse lässt nur Rollen zuweisen, deren Rechte das zuweisende Konto selbst
hat, und Freigeben verlangt das Recht *Freigeben* auf der Zieltabelle. Dazu Lesen und Schreiben auf
`ayonto_mention`. Nehmen Sie ein **Dienstkonto**, kein persönliches — die Gründe stehen unter
[Unter welchem Konto der Flow läuft](README.md#unter-welchem-konto-der-flow-läuft).

## Schritt 1 — Die Komponente am Formular

Die Komponente ist eingerichtet wie in [README.md](README.md#schritt-1--die-komponente-am-formular)
beschrieben — vor allem **Record id** gebunden und **Table name** statisch gesetzt, sonst trägt keine
Zeile einen Zugriffsstatus. Dazu eine Einstellung:

| Im Designer | intern | Einstellung |
|---|---|---|
| **Grant read access** | `grantAccess` | **Yes** |
| **Send e-mail**, **Send Teams message** | `sendEmail`, `sendTeams` | nach Bedarf — auch beide **No** |

Mit deutscher Sprachdatei heißt die Einstellung **Lesezugriff vergeben**. Warum der Designer
sonst englisch spricht, steht unter
[Warum der Designer englisch spricht](README.md#warum-der-designer-englisch-spricht).

**Erst den Flow einschalten, dann `grantAccess` auf Yes setzen.** Der Flow arbeitet nur Zeilen ab,
die entstehen oder sich ändern, während er läuft. Was vorher markiert wurde, bleibt auf `New`
liegen, bis jemand es neu setzt.

## Schritt 2 — Den Flow anlegen

In einer **nicht verwalteten Lösung**: *Neu → Automatisierung → Cloud Flow → Automatisiert* — aus
demselben Grund wie in [README.md](README.md#schritt-2--den-flow-anlegen).

Jede Aktion nach dem Anlegen sofort über **…-Menü → Umbenennen** auf den genannten Namen setzen.
Die Namen stehen in späteren Ausdrücken — ein vom Designer angehängtes `_1` bricht sie.

### Trigger

Aktion: **Wenn eine Zeile hinzugefügt, geändert oder gelöscht wird** (Microsoft Dataverse)

| Feld | Wert | Art |
|---|---|---|
| Änderungstyp | **Hinzugefügt oder geändert** | Auswahl |
| Tabellenname | **Mentions** | Auswahl |
| Bereich | **Organisation** | Auswahl |
| Spalten auswählen | `ayonto_accessstatus` | Klartext |
| Zeile filtern | `ayonto_accessstatus eq 'New'` | Klartext |

Dann am Trigger **…-Menü → Einstellungen**: *Parallelitätssteuerung* **Ein**, *Grad der
Parallelität* **1**.

**Warum jede dieser Einstellungen.** *Geändert*: Ihre Zielanwendung kann eine Zeile wieder auf
`New` setzen, und der Flow prüft dann neu (siehe [Verhalten](#verhalten)). *Spalten auswählen*: Nur
eine Änderung am Zugriffsstatus löst aus — das Zurückschreiben des Zustellstatus durch den
Benachrichtigungs-Flow nicht. *Zeile filtern*: Der Flow schreibt selbst `Exists`, `Granted`,
`Skipped` oder `Failed` in dieselbe Spalte; ohne den Filter löste jede dieser Rückschreibungen ihn
erneut aus. *Parallelität 1*: Zwei Läufe für dieselbe Person dürfen nicht gleichzeitig dieselbe Rolle
zuweisen — die zweite Zuweisung scheitert. Die Läufe warten stattdessen in einer Reihe.

## Schritt 3 — Die Aktionen

Nach Schritt 1 liest der Flow jeden Wert aus `Mention_abrufen`, nicht aus dem Trigger: Ein Lauf, der
in der Reihe gewartet hat, soll mit dem Stand der Zeile arbeiten, nicht mit dem beim Auslösen.

### 1 · Mention_abrufen

*Microsoft Dataverse → **Zeile nach ID abrufen***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Mentions** | Auswahl |
| Zeilen-ID | `triggerOutputs()?['body/ayonto_mentionid']` | fx |

**Nicht_mehr_offen** — *Steuerung → **Bedingung***

| links (fx) | Operator | rechts |
|---|---|---|
| `outputs('Mention_abrufen')?['body/ayonto_accessstatus']` | ist nicht gleich | `New` (Klartext) |

Im Zweig **Wenn ja**: *Steuerung → **Beenden***, benannt `Erledigt_beenden`, Status **Erfolgreich**
(Auswahl). Der Zweig *Wenn nein* bleibt leer.

**Wozu der zweite Blick.** Der Trigger kann dieselbe Änderung mehr als einmal melden, und ein Lauf,
der gewartet hat, findet die Zeile womöglich schon erledigt vor. Steht sie nicht mehr auf `New`,
gibt es nichts zu tun. Kommt eine zweite Zeile derselben Person doch mit `New` an — etwa weil Ihre
Zielanwendung zum Neuprüfen mehrere zurücksetzt —, fängt Schritt 3 sie ab: Die Person darf dann
bereits lesen, und die Zeile geht auf `Exists`.

### 2 · Leserolle

*Datenübertragung → **Verfassen*** — Eingaben (Klartext):

```json
{
  "<zieltabelle>": "<leserolle>"
}
```

Links der logische Name der Tabelle, klein geschrieben wie in `ayonto_recordtable`, rechts der Name
der Rolle, genau wie er unter *Sicherheitsrollen* steht. Für jede weitere Tabelle eine weitere
Zeile. Eine Tabelle, die hier fehlt, wird übersprungen.

**Rollenname** — *Datenübertragung → **Verfassen***

```
coalesce(
  outputs('Leserolle')?[coalesce(outputs('Mention_abrufen')?['body/ayonto_recordtable'], '')],
  ''
)
```

**Ohne_Leserolle** — *Steuerung → **Bedingung***

| links (fx) | Operator | rechts |
|---|---|---|
| `empty(outputs('Rollenname'))` | ist gleich | `true` (fx) |

Im Zweig **Wenn ja** zwei Aktionen:

1. **Als_uebersprungen_vermerken** — *Microsoft Dataverse → **Zeile aktualisieren***

   | Feld | Wert | Art |
   |---|---|---|
   | Tabellenname | **Mentions** | Auswahl |
   | Zeilen-ID | `outputs('Mention_abrufen')?['body/ayonto_mentionid']` | fx |
   | Access Status | `Skipped` | Klartext |
   | Access Detail | `concat('keine Leserolle für ', outputs('Mention_abrufen')?['body/ayonto_recordtable'])` | fx |

2. **Uebersprungen_beenden** — *Steuerung → **Beenden***, Status **Erfolgreich**.

Der Zweig *Wenn nein* bleibt leer.

### Der Bereich Zugriff

*Steuerung → **Bereich*** — Name exakt `Zugriff`, unterhalb von `Ohne_Leserolle`. In den Bereich
kommen die Schritte 3 bis 7, **untereinander auf der ersten Ebene**, jede nach der vorigen.

**Warum die Leseaktionen nicht in die Bedingungen wandern.** Den Fehlertext holt am Ende
`result('Zugriff')`, und das liefert „only from the first-level actions in the scoped action"
([`result()`](https://learn.microsoft.com/azure/logic-apps/workflow-definition-language-functions-reference#result)).
Scheitert eine Aktion **innerhalb** einer Bedingung, sieht der Fehlerweg nur die Bedingung mit einer
allgemeinen Meldung, nicht den Grund. Deshalb steht in den beiden Bedingungen unten jeweils nur die
eine Aktion, die nicht immer laufen darf.

### 3 · Zugriff_pruefen

**Ziel** — *Datenübertragung → **Verfassen*** (fx)

```
addProperty(
  addProperty(
    json('{}'),
    '@odata.type',
    concat('Microsoft.Dynamics.CRM.', outputs('Mention_abrufen')?['body/ayonto_recordtable'])
  ),
  concat(outputs('Mention_abrufen')?['body/ayonto_recordtable'], 'id'),
  outputs('Mention_abrufen')?['body/ayonto_recordid']
)
```

Ein Verweis auf den Datensatz, in dem erwähnt wurde: der Typ aus `ayonto_recordtable`, der Schlüssel
`<tabelle>id`. Prüfung und Freigabe nehmen beide dieses Ziel. Zu Tabellen, deren Primärschlüssel
anders heißt, siehe [Schritt 6](#6--freigabe).

**Zugriff_pruefen** fragt Dataverse, welche Rechte die erwähnte Person auf genau diesen Datensatz
hat ([`RetrievePrincipalAccess`](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/reference/retrieveprincipalaccess)).

> **Nicht erprobt.** Dieser Schritt ist noch nicht in einer echten Umgebung gelaufen.
> `RetrievePrincipalAccess` ist in der Web-API eine **Funktion**, keine Aktion — ob der Designer sie
> unter den gebundenen Aktionen anbietet, ist genau das, was offen ist. Bietet er sie nicht an,
> nehmen Sie den zweiten Weg.

**Erster Weg** — *Microsoft Dataverse → **Eine gebundene Aktion ausführen***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Benutzer** | Auswahl |
| Zeilen-ID | `outputs('Mention_abrufen')?['body/ayonto_userid']` | fx |
| Aktionsname | `RetrievePrincipalAccess` | Auswahl |
| `Target` | `outputs('Ziel')` | fx |

**Zweiter Weg** — *HTTP mit Microsoft Entra ID (vorautorisiert) → **HTTP-Anforderung aufrufen***,
falls der erste Weg die Funktion nicht anbietet. Die Verbindung bekommt als Basis-Ressourcen-URL und
als Ressourcen-URI jeweils `<org>`, die Adresse der Umgebung, so wie sie im Browser steht — etwa
`https://contoso.crm4.dynamics.com`.

| Feld | Wert | Art |
|---|---|---|
| Methode | **GET** | Auswahl |
| URL der Anforderung | Ausdruck unten | fx |

```
concat(
  '<org>/api/data/v9.2/systemusers(',
  outputs('Mention_abrufen')?['body/ayonto_userid'],
  ')/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@t)?@t={''@odata.id'':''<entitysetname>(',
  outputs('Mention_abrufen')?['body/ayonto_recordid'],
  ')''}'
)
```

`<entitysetname>` ist der Plural-Name der Zieltabelle — derselbe Name, den Aktionen wie *Zeile
aktualisieren* wollen, so wie `ayonto_mentions` für die Mention-Tabelle. Bei mehreren Zieltabellen
lässt er sich wie die Leserolle aus einer Zuordnung lesen. Die Aktion heißt auch auf diesem Weg
`Zugriff_pruefen`; beide Wege liefern `AccessRights` im Body, Schritt 4 bleibt gleich. Wer diesen
Weg nimmt, braucht `Ziel` nur noch für die Freigabe.

### 4 · Hat_Lesezugriff

*Datenübertragung → **Verfassen*** (fx)

```
contains(string(coalesce(body('Zugriff_pruefen')?['AccessRights'], '')), 'ReadAccess')
```

`AccessRights` ist eine Liste von Namen, durch Komma getrennt, etwa `ReadAccess, WriteAccess`.
Steht `ReadAccess` darin, darf die Person schon lesen: Die Zeile geht in Schritt 7 auf `Exists`, und
weder Rolle noch Freigabe werden angefasst.

### 5 · Rolle_zuweisen

**Benutzer_abrufen** — *Microsoft Dataverse → **Zeile nach ID abrufen***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Benutzer** | Auswahl |
| Zeilen-ID | `outputs('Mention_abrufen')?['body/ayonto_userid']` | fx |
| Spalten auswählen | `_businessunitid_value` | Klartext |
| Abfrage erweitern | `systemuserroles_association($select=roleid)` | Klartext |

Holt die Business Unit der Person und die Rollen, die sie schon hat.

**Rolle_suchen** — *Microsoft Dataverse → **Zeilen auflisten***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Sicherheitsrollen** | Auswahl |
| Spalten auswählen | `roleid` | Klartext |
| Zeilen filtern | Ausdruck unten | fx |
| Zeilenanzahl | `1` | Klartext |

```
concat(
  'name eq ''', outputs('Rollenname'),
  ''' and _businessunitid_value eq ', outputs('Benutzer_abrufen')?['body/_businessunitid_value']
)
```

**Rolle_id** — *Datenübertragung → **Verfassen*** (fx)

```
first(body('Rolle_suchen')?['value'])['roleid']
```

Vor `['roleid']` steht **bewusst kein `?`**. Findet `Rolle_suchen` die Rolle in der Business Unit
nicht, scheitert diese Aktion mit ihrem Namen in der Meldung, statt eine leere ID an die Zuweisung
weiterzureichen. Das gilt auch, wenn die Person schon lesen darf: Ein Tippfehler in `Leserolle` soll
beim ersten Lauf auffallen, nicht erst bei dem, der die Rolle braucht.

**Rolle_fehlt** — *Steuerung → **Bedingung***, zwei Zeilen mit **Und**

| Zeile | links (fx) | Operator | rechts |
|---|---|---|---|
| 1 | `outputs('Hat_Lesezugriff')` | ist gleich | `false` (fx) |
| 2 | `contains(string(outputs('Benutzer_abrufen')?['body/systemuserroles_association']), outputs('Rolle_id'))` | ist gleich | `false` (fx) |

Im Zweig **Wenn ja**: **Rolle_zuweisen** — *Microsoft Dataverse → **Zeilen verknüpfen***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Benutzer** | Auswahl |
| Zeilen-ID | `outputs('Mention_abrufen')?['body/ayonto_userid']` | fx |
| Beziehung | `systemuserroles_association` | Auswahl |
| Verknüpfen mit | Ausdruck unten | fx |

```
concat(
  'https://', uriHost(outputs('Mention_abrufen')?['body/@odata.id']),
  '/api/data/v9.2/roles(', outputs('Rolle_id'), ')'
)
```

Die Adresse der Umgebung kommt wie beim Link in der Benachrichtigung aus der abgerufenen Zeile —
nirgends steht eine URL. Der Zweig *Wenn nein* bleibt leer: Hat die Person die Rolle schon, gibt es
nichts zuzuweisen.

### 6 · Freigabe

**Freigabe_noetig** — *Steuerung → **Bedingung***

| links (fx) | Operator | rechts |
|---|---|---|
| `outputs('Hat_Lesezugriff')` | ist gleich | `false` (fx) |

Im Zweig **Wenn ja**: **Freigabe** — *Microsoft Dataverse → **Eine ungebundene Aktion ausführen***

| Feld | Wert | Art |
|---|---|---|
| Aktionsname | `GrantAccess` | Auswahl |
| `Target` | `outputs('Ziel')` | fx |
| `PrincipalAccess` | Ausdruck unten | fx |

```
json(concat(
  '{"Principal":{"@odata.type":"Microsoft.Dynamics.CRM.systemuser","systemuserid":"',
  outputs('Mention_abrufen')?['body/ayonto_userid'],
  '"},"AccessMask":"ReadAccess"}'
))
```

`AccessMask` ist `ReadAccess` und sonst nichts — der Flow gibt nie Schreib- oder andere Rechte
([`GrantAccess`](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/reference/grantaccess)).
Zeigt der Designer `PrincipalAccess` in zwei Feldern, kommt `ReadAccess` in *AccessMask* und in
*Principal* nur der Verweis auf die Person:

```
json(concat(
  '{"@odata.type":"Microsoft.Dynamics.CRM.systemuser","systemuserid":"',
  outputs('Mention_abrufen')?['body/ayonto_userid'],
  '"}'
))
```

> **Nicht erprobt.** `GrantAccess` mit einem Ziel, das zur Laufzeit aus `ayonto_recordtable` und
> `ayonto_recordid` gebildet wird, ist noch nicht in einer echten Umgebung gelaufen. Ob der Designer
> das Feld *Target* als Ausdruck annimmt oder einen festen Tabellentyp erwartet, ist offen.

**Tabellen mit abweichendem Primärschlüssel brauchen den Schlüssel von Hand.** `Ziel` nimmt
`<tabelle>id` an. Das gilt für eigene Tabellen und die meisten Standardtabellen, aber nicht für
alle — Aktivitätstabellen etwa heißen mit dem Schlüssel `activityid`. Für eine solche Tabelle steht
in `Ziel` statt `concat(…, 'id')` der Name des Schlüssels in Anführungszeichen, oder er kommt wie
die Leserolle aus einer Zuordnung.

### 7 · Ergebnis_vermerken

*Microsoft Dataverse → **Zeile aktualisieren*** — als letzte Aktion im Bereich `Zugriff`

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Mentions** | Auswahl |
| Zeilen-ID | `outputs('Mention_abrufen')?['body/ayonto_mentionid']` | fx |
| Access Status | `if(outputs('Hat_Lesezugriff'), 'Exists', 'Granted')` | fx |

### Anschluss_Schritte

*Steuerung → **Bereich*** — Name `Anschluss_Schritte`, unterhalb des Bereichs `Zugriff`.

*Ausführen nach*: **…-Menü → Ausführen nach konfigurieren** → bei `Zugriff` nur **ist erfolgreich**.

> **Hier ist der Platz für Ihre Zielanwendung.** Der Bereich läuft nach `Exists` wie nach
> `Granted`; welches von beiden, sagt `outputs('Hat_Lesezugriff')`. Hierher gehört, was in Ihrer
> Zielanwendung auf einen neuen Leser folgen muss — zum Beispiel Dateirechte neu berechnen oder
> Kind-Datensätze freigeben, mit einer weiteren `GrantAccess`-Aktion wie in Schritt 6. Die Lösung
> liefert den Bereich leer aus.

Was hier scheitert, steht in der Laufhistorie, nicht in der Zeile: Die bleibt auf `Exists` bzw.
`Granted`, denn der Lesezugriff selbst steht.

### Fehler_ermitteln

*Datenübertragung → **Array filtern***

| Feld | Wert | Art |
|---|---|---|
| Von | `result('Zugriff')` | fx |
| Bedingung links | `item()?['status']` | fx |
| Operator | **ist gleich** | Auswahl |
| Bedingung rechts | `Failed` | Klartext |

*Ausführen nach*: bei `Zugriff` **ist fehlgeschlagen** und **Zeitüberschreitung**, **ist
erfolgreich** abwählen.

**Warum hier „ist gleich `Failed`" steht und nicht wie in README.md „ist nicht gleich `Succeeded`".**
Der Bereich hat mehr als zwei Aktionen. Nach einem Fehler stehen die folgenden auf *Skipped*, und
deren `error` ist leer.

**Fehlertext** — *Datenübertragung → **Verfassen*** (fx)

```
concat(
  coalesce(first(body('Fehler_ermitteln'))?['name'], ''),
  ': ',
  string(first(body('Fehler_ermitteln'))?['error'])
)
```

Der Name der Aktion steht vorn, damit *Access Detail* sagt, wo es scheiterte — bei einer Bedingung
ist das der einzige Hinweis.

### Als_fehlgeschlagen_vermerken

*Microsoft Dataverse → **Zeile aktualisieren***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Mentions** | Auswahl |
| Zeilen-ID | wie in Schritt 7 | fx |
| Access Status | `Failed` | Klartext |
| Access Detail | Ausdruck unten | fx |

```
substring(outputs('Fehlertext'), 0, min(480, length(outputs('Fehlertext'))))
```

Nach dem Muster aus [README.md](README.md), Schritt 8, und aus denselben Gründen: nur
`?['error']`, nie das ganze Ergebnisobjekt — das enthält auch die Eingaben der Aktion, die dann
jeder Leseberechtigte in der Zeile sähe. Und gekürzt: `ayonto_accessdetail` fasst **500** Zeichen.
Ein zu langes Update schlägt fehl, und die Zeile bliebe auf `New`.

## Verhalten

**Lesen bleibt.** Wird die Erwähnung später aus dem Text entfernt, nimmt nichts die Freigabe oder
die Rolle zurück. Das Component erfährt von einem gespeicherten Text nichts mehr, und der Flow wird
dafür nicht ausgelöst. Wer erwähnt war, kann den Datensatz weiter lesen.

**Neu prüfen, wenn Ihre Zielanwendung Freigaben entzieht.** Nimmt die Zielanwendung einer Person
andere Freigaben am Datensatz weg, setzt sie bei Erwähnten danach `ayonto_accessstatus` **einer**
ihrer Zeilen wieder auf `New` — zum Beispiel mit *Zeilen auflisten* auf **Mentions**, gefiltert auf
`ayonto_recordid eq '<datensatz-id>' and ayonto_userid eq '<benutzer-id>'`, Zeilenanzahl `1`, und
*Zeile aktualisieren* mit Access Status `New`. Der Flow prüft dann neu und vergibt, was fehlt. Die
Benachrichtigungs-Flows reagieren darauf nicht: Sie lösen nur beim Anlegen aus.

**Eine neue Erwähnung prüft neu.** Wer im selben Datensatz später wieder erwähnt wird, bekommt eine
neue markierte Zeile. Darf die Person schon lesen, endet der Lauf mit `Exists`.

**Ohne `grantAccess = Yes` ändert sich nichts.** Bestehende Zeilen bleiben, wie sie sind; ihr
*Access Status* ist leer, und der Trigger-Filter lässt sie liegen.

## Testen

1. **Speichern**, dann in der Lösung **Einschalten**.
2. **Trockentest:** Tabelle *Mention* → *Daten* → *Neue Zeile*: User Id = Benutzer-ID einer
   Testperson, die den Datensatz nicht lesen darf, Record Table = `<zieltabelle>`, Record Id =
   GUID dieses Datensatzes, Channel = `Access`, Access Status = `New`. Ohne Delivery Status holt
   kein Benachrichtigungs-Flow die Zeile ab.
3. Laufhistorie: **Zugriff_pruefen** liefert `AccessRights` ohne `ReadAccess`, **Rolle_zuweisen**
   läuft beim ersten Mal, **Freigabe** ist erfolgreich.
4. Zeile erneut öffnen: Access Status steht auf `Granted`.
5. Als Testperson anmelden und den Datensatz öffnen — lesen ja, bearbeiten nein.
6. Dieselbe Zeile wieder auf `New` setzen: Der Lauf endet mit `Exists`, `Rolle_zuweisen` und
   `Freigabe` sind übersprungen.
7. Eine Zeile mit einer Tabelle, die in `Leserolle` fehlt: Access Status `Skipped`, Access Detail
   „keine Leserolle für …".
8. **Echttest:** im Formular `@` tippen und eine Person wählen. Die Komponente wartet **fünf
   Sekunden**, bevor sie schreibt. Genau eine Zeile dieser Person trägt Access Status `New`.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| Flow läuft nicht an | Access Status der Zeile ist nicht `New` — `grantAccess` aus, oder *Record id* bzw. *Table name* leer; Filter oder *Spalten auswählen* falsch geschrieben; Flow ist aus |
| Keine Zeile trägt `New` | das Formular ist nicht veröffentlicht, oder der Datensatz wurde nie gespeichert |
| `RetrievePrincipalAccess` steht nicht in der Liste der Aktionen | den zweiten Weg in Schritt 3 nehmen |
| Access Detail nennt `Zugriff_pruefen` | `Ziel` passt nicht zur Tabelle — Tabellenname oder Schlüssel; auf dem zweiten Weg auch der Plural-Name |
| Access Detail nennt `Rolle_id` | die Leserolle steht in der Business Unit der Person nicht — Name in `Leserolle` gegen *Sicherheitsrollen* prüfen |
| Access Detail nennt `Rolle_fehlt` oder `Freigabe_noetig`, aber keinen Grund | gescheitert ist die Aktion **in** der Bedingung; `result()` reicht nicht hinein — Laufhistorie öffnen |
| `Rolle_zuweisen` scheitert mit einem Rechtefehler | das Verbindungskonto hat nicht alle Rechte der Rolle, die es zuweisen soll |
| `Freigabe` scheitert mit einem Rechtefehler | dem Verbindungskonto fehlt *Freigeben* auf der Zieltabelle |
| `Freigabe` findet den Datensatz nicht | abweichender Primärschlüssel — siehe Schritt 6 |
| Status `Granted`, die Person sieht den Datensatz trotzdem nicht | die Leserolle hat kein Lese-Recht auf die Tabelle, oder sie ist der App nicht zugeordnet |
| Status `Skipped` mit „keine Leserolle für …" | Tabelle fehlt in `Leserolle`, oder dort nicht klein geschrieben |
| Zweite Rollenzuweisung derselben Person scheitert | *Grad der Parallelität* steht nicht auf 1 |
| Zeile bleibt auf `New` | „Ausführen nach" an `Fehler_ermitteln` falsch gesetzt, oder der Flow war beim Markieren aus |
| Benachrichtigungs-Flow verschickt eine Zeile mit Kanal `Access` | dessen Filter prüft `ayonto_channel` nicht — siehe [README.md](README.md#trigger) |

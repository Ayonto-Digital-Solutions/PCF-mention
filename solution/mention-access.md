# Zugriff für Erwähnte

Wer per `@` erwähnt wird, den Datensatz aber nicht lesen darf, bekommt Lesezugriff —
**ausschließlich Lesen**. Prüfen und vergeben macht ein Flow in Ihrer Umgebung, so wie die
Benachrichtigung aus [README.md](README.md). Das Component prüft dafür keine Rechte und ruft nichts
zusätzlich auf: Es markiert je erwähnter Person genau eine Zeile in `ayonto_mention` mit
`ayonto_accessstatus = New`, und der Flow schreibt zurück, was daraus wurde. Weitergegeben wird nur,
was die erwähnende Person **selbst lesen darf** — siehe
[Wer Zugriff auslösen kann](#wer-zugriff-auslösen-kann).

Die Lösung bringt den allgemeinen Teil mit: die beiden Spalten `ayonto_accessstatus` und
`ayonto_accessdetail`, den Schalter `grantAccess` am Component, diese Anleitung und die fertige
Definition unter
[`examples/mention-access-flow.json`](examples/mention-access-flow.json). Sie wird beim Bauen gegen
die Tabelle geprüft, gehört aber nicht zur Lösung. **Alles Tabellenspezifische bleibt in Ihrer
Zielanwendung**: die Leserolle, die Rechte auf die Zieltabellen und was nach der Freigabe noch
passieren muss.

> **Diese Anleitung ist erst in Teilen in einer echten Umgebung gelaufen** — anders als die
> Benachrichtigung in [README.md](README.md). Die Schritte sind gegen einen deutschsprachigen
> Designer geschrieben, und der Bau prüft das Beispiel gegen die Tabelle — Spaltennamen, Namen der
> Aktionen in Ausdrücken.
>
> * **Erprobt** in einer Entwicklungsumgebung:
>   * Schritt 3: `Ziel` in der Form unten; beide Prüfungen über HTTP — `InvokeHttp`, GET, `@t` mit
>     `uriComponent()` —, der Body kommt als JSON, `body('…')['AccessRights']` ist lesbar.
>   * Schritt 5: *Zeile nach ID abrufen* liefert `@odata.id` als `<org>/api/data/v9.1/<set>(<id>)`,
>     und `uriHost()` ergibt daraus die Umgebung; `Benutzer_abrufen` mit
>     `systemuserroles_association($select=roleid)` liefert die Rollen der Person; `Rolle_suchen`
>     und `Rolle_id` finden die Leserolle in ihrer Business Unit.
> * **Belegt nicht möglich:** `RetrievePrincipalAccess` über den Dataverse-Connector, und `Ziel` mit
>   `addProperty()` — beides in Schritt 3.
> * **Nicht erprobt:** *Zeilen verknüpfen* zum Zuweisen der Rolle (Schritt 5) und `GrantAccess` mit
>   dem Ziel aus `Ziel` (Schritt 6). Beide Stellen sind unten markiert.

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
               Datensatz_id_ungueltig    Bedingung → Skipped, Beenden
               Zugriff                   Bereich
            3    Ziel                    Verfassen
                 Absender_pruefen        HTTP: RetrievePrincipalAccess für den Ersteller
                 Absender_darf_nicht_…   Bedingung → Skipped, Beenden
                 Zugriff_pruefen         HTTP: RetrievePrincipalAccess für die Person
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
| `Skipped` | für diese Tabelle ist keine Leserolle hinterlegt, die Datensatz-ID ist ungültig, oder wer die Zeile angelegt hat, darf den Datensatz selbst nicht lesen | Flow |
| `Failed` | ein Schritt ist gescheitert, der Grund steht in *Access Detail* | Flow |

## Wer Zugriff auslösen kann

Der Flow läuft unter einem Konto, das Rollen zuweisen und jeden Datensatz freigeben darf. Die Zeile,
nach der er sich richtet, legt dagegen jeder Anwender an, der erwähnen kann — dafür braucht er das
Anlegerecht auf `ayonto_mention`, und anlegen lässt sich eine Zeile auch ohne Formular, direkt über
die Web-API. Glaubte der Flow der Zeile einfach, könnte jeder sich selbst oder anderen Lesezugriff
auf beliebige Datensätze der zugeordneten Tabellen verschaffen.

Deshalb prüft der Flow **vor allem anderen**, ob der **Ersteller der Zeile** den Datensatz selbst
lesen darf (Schritt 3, `Absender_pruefen`). Den Ersteller setzt Dataverse selbst
(`_createdby_value`); `ayonto_mentionedbyid` dagegen schreibt das Component, und genauso gut jeder
andere, der die Zeile anlegt — darauf verlässt sich der Flow nicht. Darf der Ersteller nicht lesen,
geht die Zeile auf `Skipped`, und es wird nichts zugewiesen und nichts freigegeben.

**Was das bedeutet:** Wer einen Datensatz lesen darf, kann ihn durch eine Erwähnung anderen zum
Lesen geben — auch ohne das Recht *Freigeben*. Das ist der Zweck der Funktion. Soll nur
weitergeben dürfen, wer auch freigeben darf, prüft `Absender_darf_nicht_lesen` statt auf
`ReadAccess` auf `ShareAccess`.

**Auch Tabelle und Datensatz-ID stehen in der Zeile**, und auch ihnen glaubt der Flow nicht
einfach. `ayonto_recordtable` muss genau ein Eintrag der Zuordnung in `Leserolle` sein, sonst geht
die Zeile auf `Skipped`. `ayonto_recordid` muss aussehen wie eine GUID: genau 36 Zeichen, kein `"`
und kein `=` ([Die Datensatz-ID prüfen](#die-datensatz-id-prüfen)). Der Grund: `Ziel` entsteht als
Text. Eine ID mit `"` könnte das Objekt umbauen, eine mit `=` die Prüfung über einen alternativen
Schlüssel auf einen anderen Datensatz lenken als die Freigabe. Beides ginge nur mit einem Wert, der
länger ist als eine GUID.

Die Prüfung hält nur, solange Anwender **fremde** Zeilen nicht ändern können. Das Component braucht
auf `ayonto_mention` Anlegen und Lesen, sonst nichts; geben Sie Schreiben höchstens auf Ebene
*Benutzer*.

## Was mitgeliefert wird und was Sie bauen

| | mitgeliefert | selbst zu bauen oder zu stellen |
|---|---|---|
| Spalten *Access Status* und *Access Detail* | ✔ | |
| Schalter `grantAccess` am Component | ✔ | |
| Zugriffs-Flow | als Anleitung | Flow anlegen, siehe unten |
| Leserolle mit Rechten auf die Zieltabellen | | ✔ |
| Anschluss-Schritte der Zielanwendung | | ✔ |
| Verbindung zu Dataverse | | beim Anlegen des Flows |
| Verbindung *HTTP mit Microsoft Entra ID (vorautorisiert)* | | beim Anlegen des Flows |

## Voraussetzungen

**Eine eigene Leserolle der Zielanwendung.** Eine Sicherheitsrolle mit **nur Lese-Rechten** auf die
Zieltabellen, Ebene **Benutzer**, und bei *Vererbung von Mitgliedsberechtigungen* die Einstellung
**Direct User (Basic) access level and Team privileges** — so wirkt die Rolle auch dann wie bei
direkter Zuweisung, wenn die Zielanwendung sie einem Team gibt. Die Rolle ist kein Beiwerk: Eine
Freigabe gibt Zugriff auf genau einen Datensatz, aber sie ersetzt nicht das Grundrecht, die Tabelle
überhaupt zu lesen. **Ohne dieses Grundrecht wirkt eine Freigabe nicht.** Ebene *Benutzer* reicht,
weil die Person damit nur ihre eigenen und die ihr freigegebenen Datensätze sieht — nicht mehr.

**Zwei Rechte gibt Dataverse einer neuen Rolle ungefragt mit.** Eine neu angelegte Sicherheitsrolle
bekommt zusätzlich `prvCreateSharePointData` und `prvWriteSharePointData`. Für eine reine Leserolle
nehmen Sie beide wieder heraus, etwa mit der an die Rolle gebundenen Aktion
[`RemovePrivilegeRole`](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/reference/removeprivilegerole),
einmal je Recht:

```
POST <org>/api/data/v9.2/roles(<roleid>)/Microsoft.Dynamics.CRM.RemovePrivilegeRole
```

```json
{ "Privilege": { "@odata.type": "Microsoft.Dynamics.CRM.privilege", "privilegeid": "<privilegeid>" } }
```

Die `privilegeid` steht in der Tabelle der Rechte (`privileges`) unter dem Namen des Rechts.

Sicherheitsrollen werden aus der Stamm-Business-Unit in jede untergeordnete übernommen, unter
demselben Namen. Deshalb sucht der Flow die Rolle per Name in der Business Unit der Person.

Damit die Person den Datensatz in der App öffnen kann, muss die Leserolle außerdem der
**modellgesteuerten App** zugeordnet sein: Apps werden über Sicherheitsrollen geteilt.

**Ein Verbindungskonto, das Rollen zuweisen und Datensätze freigeben darf** — in der Regel ein
Systemadministrator. Dataverse lässt nur Rollen zuweisen, deren Rechte das zuweisende Konto selbst
hat, und Freigeben verlangt das Recht *Freigeben* auf der Zieltabelle. Dazu Lesen und Schreiben auf
`ayonto_mention`. Nehmen Sie ein **Dienstkonto**, kein persönliches — die Gründe stehen unter
[Unter welchem Konto der Flow läuft](README.md#unter-welchem-konto-der-flow-läuft).

**HTTP mit Microsoft Entra ID in derselben Datengruppe wie Dataverse.** Die Prüfung in Schritt 3
läuft über diesen Connector. Trennt die DLP-Richtlinie der Umgebung ihn von Dataverse, lässt sich der
Flow nicht einschalten.

**Höchstens 100 Aufrufe je 60 Sekunden je Verbindung.** Über diesen Connector macht der Flow zwei je
Erwähnung, `Absender_pruefen` und `Zugriff_pruefen` — gut 50 Erwähnungen je Minute. Darüber drosselt
der Connector; was nach den Wiederholungen der Aktion noch scheitert, steht als `Failed` in der Zeile.

**Anwender: Anlegen und Lesen auf `ayonto_mention`, Schreiben höchstens auf Ebene Benutzer** — siehe
[Wer Zugriff auslösen kann](#wer-zugriff-auslösen-kann).

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

### Die Datensatz-ID prüfen

**Datensatz_id_ungueltig** — *Steuerung → **Bedingung***, unterhalb von `Ohne_Leserolle`, drei Zeilen
mit **Oder**

| Zeile | links (fx) | Operator | rechts |
|---|---|---|---|
| 1 | `length(coalesce(outputs('Mention_abrufen')?['body/ayonto_recordid'], ''))` | ist nicht gleich | `36` (fx) |
| 2 | `coalesce(outputs('Mention_abrufen')?['body/ayonto_recordid'], '')` | enthält | `"` (Klartext) |
| 3 | `coalesce(outputs('Mention_abrufen')?['body/ayonto_recordid'], '')` | enthält | `=` (Klartext) |

Im Zweig **Wenn ja** zwei Aktionen:

1. **Als_ungueltig_vermerken** — *Microsoft Dataverse → **Zeile aktualisieren***: Tabellenname,
   Zeilen-ID und Access Status (`Skipped`) wie bei `Als_uebersprungen_vermerken`, Access Detail
   `ungültige Datensatz-ID` (Klartext).
2. **Ungueltig_beenden** — *Steuerung → **Beenden***, Status **Erfolgreich**.

Der Zweig *Wenn nein* bleibt leer.

Eine GUID hat 36 Zeichen, und das Component schreibt sie immer so. Alles andere stammt von einer
Zeile, die von Hand oder über die Web-API angelegt wurde, und erreicht weder `Ziel` noch die
Prüfung. Warum, steht unter [Wer Zugriff auslösen kann](#wer-zugriff-auslösen-kann). Hier steht
`coalesce` mit Absicht: Eine leere ID macht die Bedingung nur strenger, sie geht dann auf
`Skipped`.

### Der Bereich Zugriff

*Steuerung → **Bereich*** — Name exakt `Zugriff`, unterhalb von `Datensatz_id_ungueltig`. In den Bereich
kommen die Schritte 3 bis 7, **untereinander auf der ersten Ebene**, jede nach der vorigen.

**Warum die Leseaktionen nicht in die Bedingungen wandern.** Den Fehlertext holt am Ende
`result('Zugriff')`, und das liefert „only from the first-level actions in the scoped action"
([`result()`](https://learn.microsoft.com/azure/logic-apps/workflow-definition-language-functions-reference#result)).
Scheitert eine Aktion **innerhalb** einer Bedingung, sieht der Fehlerweg nur die Bedingung mit einer
allgemeinen Meldung, nicht den Grund. Deshalb stehen in den Bedingungen unten nur die Aktionen, die
nicht immer laufen dürfen.

### 3 · Zugriff_pruefen

**Ziel** — *Datenübertragung → **Verfassen*** (fx)

```
json(concat(
  '{"@odata.type":"Microsoft.Dynamics.CRM.',
  outputs('Mention_abrufen')?['body/ayonto_recordtable'],
  '","',
  outputs('Mention_abrufen')?['body/ayonto_recordtable'],
  'id":"',
  outputs('Mention_abrufen')?['body/ayonto_recordid'],
  '"}'
))
```

Ein Verweis auf den Datensatz, in dem erwähnt wurde: der Typ aus `ayonto_recordtable`, der Schlüssel
`<tabelle>id`. Die Freigabe in Schritt 6 nimmt dieses Ziel. Zu Tabellen, deren Primärschlüssel
anders heißt, siehe [Schritt 6](#6--freigabe).

**Erprobt** in genau dieser Form. **Nicht mit `addProperty()`:** Das lehnt `@odata.type` als
Eigenschaftsnamen ab — `InvalidTemplate`, „invalid characters '.'". In 2.5.0 stand der Schritt so
hier, und `Ziel` scheiterte zur Laufzeit.

**Die Prüfung läuft über HTTP, nicht über den Dataverse-Connector.**
[`RetrievePrincipalAccess`](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/reference/retrieveprincipalaccess)
ist in der Web-API eine **Funktion**, keine Aktion, und der Connector nimmt sie nicht an. In einer
Entwicklungsumgebung belegt: weder als gebundene Aktion auf **Benutzer** — ohne und mit dem Präfix
`Microsoft.Dynamics.CRM.`, beides `GetMetadataForBoundActionInput` → `BadRequest` — noch als
ungebundene (`GetMetadataForUnboundActionInput` → `NotFound`). Schon das Speichern der Definition
scheitert.

**Erprobt:** beide Prüfungen über HTTP — `InvokeHttp`, GET, `@t` mit `uriComponent()` kodiert. Der
Body kommt als JSON zurück, und `body('…')['AccessRights']` ist lesbar.

Beide Prüfungen sind dieselbe Aktion — *HTTP mit Microsoft Entra ID (vorautorisiert) → **HTTP-Anforderung
aufrufen*** — und unterscheiden sich nur darin, für wen sie fragen. Die Verbindung bekommt als
Basis-Ressourcen-URL und als Ressourcen-URI jeweils `<org>`, die Adresse der Umgebung, so wie sie im
Browser steht — etwa `https://contoso.crm4.dynamics.com` —, und meldet sich mit demselben Dienstkonto
an wie die Dataverse-Verbindung.

| Feld | Wert | Art |
|---|---|---|
| Methode | **GET** | Auswahl |
| URL der Anforderung | Ausdruck unten | fx |

**Absender_pruefen** fragt für den **Ersteller der Zeile**:

```
concat(
  '<org>/api/data/v9.2/systemusers(',
  outputs('Mention_abrufen')?['body/_createdby_value'],
  ')/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@t)?@t=',
  uriComponent(concat(
    '{''@odata.id'':''<entitysetname>(',
    outputs('Mention_abrufen')?['body/ayonto_recordid'],
    ')''}'
  ))
)
```

Warum der Ersteller und nicht `ayonto_mentionedbyid`, steht unter
[Wer Zugriff auslösen kann](#wer-zugriff-auslösen-kann).

`<entitysetname>` ist der Plural-Name der Zieltabelle — derselbe Name, den Aktionen wie *Zeile
aktualisieren* wollen, so wie `ayonto_mentions` für die Mention-Tabelle. Bei mehreren Zieltabellen
lässt er sich wie die Leserolle aus einer Zuordnung lesen.

**Der Wert hinter `@t=` ist mit `uriComponent()` kodiert**, denn er enthält Klammern,
Anführungszeichen und Doppelpunkte. In dieser Form läuft die Anfrage über den Connector.

**Absender_darf_nicht_lesen** — *Steuerung → **Bedingung***

| links (fx) | Operator | rechts |
|---|---|---|
| `contains(body('Absender_pruefen')['AccessRights'], 'ReadAccess')` | ist gleich | `false` (fx) |

Im Zweig **Wenn ja** zwei Aktionen:

1. **Als_abgelehnt_vermerken** — *Microsoft Dataverse → **Zeile aktualisieren***: Tabellenname,
   Zeilen-ID und Access Status (`Skipped`) wie bei `Als_uebersprungen_vermerken`, Access Detail
   `erwähnende Person darf den Datensatz selbst nicht lesen` (Klartext).
2. **Abgelehnt_beenden** — *Steuerung → **Beenden***, Status **Erfolgreich**.

*Beenden* hält den ganzen Lauf an, auch aus dem Bereich heraus: Es wird nichts zugewiesen, nichts
freigegeben, und auch `Anschluss_Schritte` laufen nicht. Der Zweig *Wenn nein* bleibt leer.

`AccessRights` steht hier **bewusst ohne `?` und ohne `coalesce`**, genau wie in Schritt 4 und aus
demselben Grund wie bei `Rolle_id`. Kommt ein Body ohne `AccessRights` zurück, scheitert die
Bedingung sichtbar mit ihrem Namen, statt still „darf nicht lesen" zu ergeben — sonst ginge jede
Erwähnung auf `Skipped`.

In dieser Bedingung stehen **zwei** Aktionen. Scheitert `Als_abgelehnt_vermerken`, sieht der
Fehlerweg nur die Bedingung (siehe [Der Bereich Zugriff](#der-bereich-zugriff)), und die Zeile geht
auf `Failed` statt auf `Skipped`. Zugewiesen oder freigegeben wird auch dann nichts: Alles danach
läuft nur, wenn die Bedingung erfolgreich war.

**Zugriff_pruefen** stellt dieselbe Anfrage für die **erwähnte Person**:

```
concat(
  '<org>/api/data/v9.2/systemusers(',
  outputs('Mention_abrufen')?['body/ayonto_userid'],
  ')/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@t)?@t=',
  uriComponent(concat(
    '{''@odata.id'':''<entitysetname>(',
    outputs('Mention_abrufen')?['body/ayonto_recordid'],
    ')''}'
  ))
)
```

Beide liefern `AccessRights` im Body.

### 4 · Hat_Lesezugriff

*Datenübertragung → **Verfassen*** (fx)

```
contains(body('Zugriff_pruefen')['AccessRights'], 'ReadAccess')
```

`AccessRights` ist eine Liste von Namen, durch Komma getrennt, etwa `ReadAccess, WriteAccess`.
**Erprobt:** So liest der Ausdruck sie aus dem JSON-Body. Steht `ReadAccess` darin, darf die Person
schon lesen: Die Zeile geht in Schritt 7 auf `Exists`, und
weder Rolle noch Freigabe werden angefasst.

**Bewusst ohne `?`, ohne `coalesce` und ohne `string()`.** Jedes davon machte aus einem
unerwarteten Body still ein „darf nicht lesen": Die Person bekäme Rolle und Freigabe, obwohl sie
womöglich längst lesen darf. So scheitert `Hat_Lesezugriff` sichtbar, wie `Rolle_id`.

### 5 · Rolle_zuweisen

**Benutzer_abrufen** — *Microsoft Dataverse → **Zeile nach ID abrufen***

| Feld | Wert | Art |
|---|---|---|
| Tabellenname | **Benutzer** | Auswahl |
| Zeilen-ID | `outputs('Mention_abrufen')?['body/ayonto_userid']` | fx |
| Spalten auswählen | `_businessunitid_value` | Klartext |
| Abfrage erweitern | `systemuserroles_association($select=roleid)` | Klartext |

Holt die Business Unit der Person und die Rollen, die sie schon hat. **Erprobt:** Mit diesem
*Abfrage erweitern* liefert die Aktion die Rollen der Person unter `systemuserroles_association`.

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

**Erprobt:** `Rolle_suchen` findet die Rolle in der Business Unit der Person, und `Rolle_id` liefert
ihre ID.

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
nirgends steht eine URL. **Erprobt:** `Mention_abrufen` liefert `@odata.id` als
`<org>/api/data/v9.1/<set>(<id>)`, und `uriHost()` ergibt daraus die Umgebung. Der Zweig *Wenn nein*
bleibt leer: Hat die Person die Rolle schon, gibt es nichts zuzuweisen.

> **Nicht erprobt.** *Zeilen verknüpfen* zum Zuweisen der Rolle ist noch nicht in einer echten
> Umgebung gelaufen.

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

> **Nicht erprobt.** `GrantAccess` mit dem Ziel aus `Ziel` ist noch nicht in einer echten Umgebung
> gelaufen. `Ziel` selbst ist erprobt (Schritt 3); offen ist, ob der Designer das Feld *Target* als
> Ausdruck annimmt oder einen festen Tabellentyp erwartet.

**Tabellen mit abweichendem Primärschlüssel brauchen den Schlüssel von Hand.** `Ziel` nimmt
`<tabelle>id` an. Das gilt für eigene Tabellen und die meisten Standardtabellen, aber nicht für
alle — Aktivitätstabellen etwa heißen mit dem Schlüssel `activityid`. Für eine solche Tabelle steht
in `Ziel` an Stelle der zweiten Tabellenangabe samt `'id":"'` der Schlüssel als Text, etwa
`'activityid":"'`, oder er kommt wie die Leserolle aus einer Zuordnung.

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
*Zeile aktualisieren* mit Access Status `New`. Der Flow prüft dann neu und vergibt, was fehlt —
und prüft dabei auch wieder, ob der ursprüngliche Ersteller der Zeile den Datensatz lesen darf. Die
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
   kein Benachrichtigungs-Flow die Zeile ab. Anlegen muss die Zeile jemand, der den Datensatz selbst
   lesen darf — sonst greift [Wer Zugriff auslösen kann](#wer-zugriff-auslösen-kann).
3. Laufhistorie: **Zugriff_pruefen** liefert `AccessRights` ohne `ReadAccess`, **Rolle_zuweisen**
   läuft beim ersten Mal, **Freigabe** ist erfolgreich.
4. Zeile erneut öffnen: Access Status steht auf `Granted`.
5. Als Testperson anmelden und den Datensatz öffnen — lesen ja, bearbeiten nein.
6. Dieselbe Zeile wieder auf `New` setzen: Der Lauf endet mit `Exists`, `Rolle_zuweisen` und
   `Freigabe` sind übersprungen.
7. Eine Zeile mit einer Tabelle, die in `Leserolle` fehlt: Access Status `Skipped`, Access Detail
   „keine Leserolle für …". Ebenso eine Zeile, deren Record Id keine GUID ist, etwa `123`: Access
   Status `Skipped`, Access Detail „ungültige Datensatz-ID".
8. **Gegenprobe:** Als Testperson selbst eine Zeile wie in Punkt 2 anlegen, mit der eigenen
   Benutzer-ID — etwa über *Daten* in der Tabelle, sofern die Testperson die Tabelle sieht. Access
   Status geht auf `Skipped`, Access Detail „erwähnende Person darf den Datensatz selbst nicht
   lesen", und die Testperson hat danach weder Rolle noch Freigabe.
9. **Echttest:** im Formular `@` tippen und eine Person wählen. Die Komponente wartet **fünf
   Sekunden**, bevor sie schreibt. Genau eine Zeile dieser Person trägt Access Status `New`.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| Flow läuft nicht an | Access Status der Zeile ist nicht `New` — `grantAccess` aus, oder *Record id* bzw. *Table name* leer; Filter oder *Spalten auswählen* falsch geschrieben; Flow ist aus |
| Keine Zeile trägt `New` | das Formular ist nicht veröffentlicht, oder der Datensatz wurde nie gespeichert |
| Speichern scheitert mit `GetMetadataForBoundActionInput` (`BadRequest`) oder `GetMetadataForUnboundActionInput` (`NotFound`) | `RetrievePrincipalAccess` steckt in einer Dataverse-Aktion — das nimmt der Connector nicht an; den HTTP-Weg aus Schritt 3 nehmen |
| Access Detail nennt `Zugriff_pruefen` | die URL passt nicht — `<entitysetname>` falsch geschrieben, oder die HTTP-Verbindung zeigt auf eine andere Umgebung |
| Access Detail nennt `Rolle_id` | die Leserolle steht in der Business Unit der Person nicht — Name in `Leserolle` gegen *Sicherheitsrollen* prüfen |
| Access Detail nennt `Absender_darf_nicht_lesen`, `Rolle_fehlt` oder `Freigabe_noetig`, aber keinen Grund | gescheitert ist eine Aktion **in** der Bedingung — bei `Absender_darf_nicht_lesen` `Als_abgelehnt_vermerken`; `result()` reicht nicht hinein — Laufhistorie öffnen |
| Access Detail nennt `Hat_Lesezugriff` oder `Absender_darf_nicht_lesen` mit „property 'AccessRights'" | die HTTP-Antwort trägt kein `AccessRights` — Body in der Laufhistorie ansehen; meist eine Fehlermeldung von Dataverse statt einer Antwort |
| `Ziel` scheitert mit `InvalidTemplate`, „invalid characters '.'" | `Ziel` steht noch mit `addProperty()` wie in 2.5.0 — durch die Form aus Schritt 3 ersetzen |
| Die Leserolle erlaubt mehr als Lesen: SharePoint-Daten anlegen und schreiben | Dataverse hat beim Anlegen der Rolle zwei Rechte ergänzt — siehe [Voraussetzungen](#voraussetzungen) |
| Flow lässt sich nicht einschalten, Hinweis auf eine Richtlinie | DLP trennt *HTTP mit Microsoft Entra ID* von Dataverse — beide müssen in derselben Datengruppe liegen |
| `Absender_pruefen` oder `Zugriff_pruefen` scheitert mit `429` | mehr als 100 Aufrufe je 60 Sekunden auf der Verbindung — Erwähnungen in kurzer Folge; die Zeilen später wieder auf `New` setzen |
| `Rolle_zuweisen` scheitert mit einem Rechtefehler | das Verbindungskonto hat nicht alle Rechte der Rolle, die es zuweisen soll |
| `Freigabe` scheitert mit einem Rechtefehler | dem Verbindungskonto fehlt *Freigeben* auf der Zieltabelle |
| `Freigabe` findet den Datensatz nicht | `Ziel` passt nicht zur Tabelle — Tabellenname, oder abweichender Primärschlüssel, siehe Schritt 6 |
| Status `Granted`, die Person sieht den Datensatz trotzdem nicht | die Leserolle hat kein Lese-Recht auf die Tabelle, oder sie ist der App nicht zugeordnet |
| Status `Skipped` mit „keine Leserolle für …" | Tabelle fehlt in `Leserolle`, oder dort nicht klein geschrieben |
| Status `Skipped` mit „ungültige Datensatz-ID" | `ayonto_recordid` ist keine GUID — *Record id* an die falsche Spalte gebunden, oder die Zeile wurde von Hand angelegt |
| Status `Skipped` mit „erwähnende Person darf …" | wer die Zeile angelegt hat, darf den Datensatz nicht lesen — so gewollt; beim Neuprüfen zählt der ursprüngliche Ersteller |
| Access Detail nennt `Absender_pruefen` | wie bei `Zugriff_pruefen` |
| Zweite Rollenzuweisung derselben Person scheitert | *Grad der Parallelität* steht nicht auf 1 |
| Zeile bleibt auf `New` | „Ausführen nach" an `Fehler_ermitteln` falsch gesetzt, oder der Flow war beim Markieren aus |
| Benachrichtigungs-Flow verschickt eine Zeile mit Kanal `Access` | dessen Filter prüft `ayonto_channel` nicht — siehe [README.md](README.md#trigger) |

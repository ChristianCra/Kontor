# Kontor

Rechnungen, Belege und Buchhaltung für Selbstständige und kleine Unternehmen in Deutschland. Funktional orientiert an SevDesk: Das Verhalten wurde aus der öffentlichen SevDesk-API und mit [REA](https://github.com/morluto/rea) abgeleitet, Code, Name und Design sind eigenständig.

## Stand (Etappe 1 bis 5)

- Kontakte (Organisation/Person, Rechnungsadresse, Steuer- und Bankdaten, Besteuerungsart, Kundennummernkreis)
- Artikel mit Einheiten, Preisen und Steuersätzen
- Rechnungen: Entwurf mit Positionseditor, Live-Summen je Steuersatz, Abschließen mit Nummernkreis (`RE-{YYYY}-{NNNN}`), PDF, als versendet markieren, Zahlungen und Teilzahlungen, Festschreiben (GoBD), Storno per Stornorechnung, Zurücksetzen auf Entwurf
- Angebote mit optionalen Positionen, Auftragsbestätigungen und Lieferscheinen; Status angenommen/abgelehnt; Rechnung aus Angebot oder Auftrag
- Gutschriften (Rechnungskorrekturen) zu Rechnungen, inklusive Erstattung
- Mahnwesen: Zahlungserinnerung und Mahnstufen mit Mahngebühr; mit Zahlungseingang werden Mahnungen erledigt
- E-Rechnung: XRechnung 3.0 im CII-Format als XML-Download und als `factur-x.xml` im PDF eingebettet; Pflichtangaben des Verkäufers werden beim Abschließen geprüft
- Belege (Ein- und Ausgaben) mit Datei-Upload und Vorschau, Dublettenprüfung per SHA-256, Buchungskonten nach SKR03/SKR04, Steuerregeln (Vorsteuerabzug, ohne Vorsteuer, innergemeinschaftlicher Erwerb, Reverse Charge), netto oder brutto erfasst
- Bank und Kasse: Zahlungskonten mit Saldo, Import von CSV (gängige deutsche Banken) und camt.053 mit Dublettenschutz, Zuordnungsvorschläge mit Score (Betrag, Nummer im Verwendungszweck, Name), manuelle Zuordnung, Teilzahlungen, „ohne Beleg buchen“, Privat-Markierung und Privat-Regeln
- Übersicht mit offenen und überfälligen Forderungen sowie Zahlungseingängen
- Kleinunternehmer, EU- und Drittlandsrechnungen mit passenden Pflichthinweisen

- Buchhaltung: einheitliches Journal aus Rechnungen, Gutschriften, Belegen und Bankbuchungen, wahlweise Ist- oder Soll-Versteuerung
- UStVA-Vorbereitung: Kennzahlen 81, 86, 41, 45, 89, 93, 46/47, 66, 61, 67 und 83 je Monat oder Quartal, Bemessungsgrundlagen auf volle Euro abgerundet, Werte zum Abtippen ins ELSTER-Formular
- EÜR: Einnahmen und Ausgaben nach Zuflussprinzip, gruppiert nach Kontenbereich, Bewirtung 70/30 aufgeteilt
- DATEV-Export: Buchungsstapel EXTF 700 als CSV (Latin-1) mit Debitoren und Kreditoren, BU-Schlüsseln, Prüfung des Zeitraums und optionalem Festschreiben der exportierten Belege
- Einstellungen für Kontenrahmen (SKR03/SKR04), Versteuerungsart, Voranmeldungszeitraum, Berater- und Mandantennummer

- Anmeldung mit E-Mail und Passwort (scrypt), Ersteinrichtung beim ersten Start, Benutzerverwaltung, Passwortwechsel meldet andere Sitzungen ab; alle Seiten, Downloads und Server-Actions sind geschützt
- E-Mail-Versand von Rechnungen, Gutschriften, Mahnungen und Angeboten mit PDF (und XRechnung-XML), bearbeitbare Vorlagen mit Platzhaltern, Versandprotokoll; ohne SMTP-Server Testmodus mit `.eml`-Dateien in `storage/outbox`
- Anlagenverzeichnis: Anlagegüter aus Belegen mit Anlagekonto werden automatisch übernommen oder manuell erfasst; lineare AfA monatsgenau, digitale Wirtschaftsgüter (1 Jahr), GWG bis 800 € sofort, Sammelposten über 5 Jahre, Abgang mit Restbuchwert
- EÜR nach Zeilen und Kennzahlen der Anlage EÜR (Vordruck 2025), inklusive AfA; AfA-Buchungen auch im DATEV-Export

- Claude und Automatisierung: MCP-Server unter `/api/mcp` (als Connector in Claude eintragbar, Anmeldung per OAuth mit PKCE), REST-API unter `/api/v1` mit API-Schlüsseln und Rechten (Lesen, Entwürfe, Buchen), Freigabe-Liste für vorgeschlagene Buchungen und Zuordnungen, Änderungsprotokoll mit Hash-Kette für alle Änderungen durch Benutzer und API

Nicht enthalten: direkte ELSTER-Übermittlung (dafür ist die ERiC-Bibliothek mit eigener Hersteller-ID nötig). Die UStVA- und EÜR-Werte lassen sich je Kennzahl kopieren und in „Mein ELSTER“ eintragen.

## Installation

Kontor ist eine Node.js-Anwendung mit SQLite-Datenbank. Datenbank und hochgeladene Belege liegen als Dateien auf dem Server. Deshalb braucht Kontor einen Rechner oder Server mit dauerhaftem Speicher. Serverless-Plattformen wie Vercel oder Netlify eignen sich nicht.

Voraussetzungen: Node.js 20 oder neuer (empfohlen 22 oder 24 LTS) und Git.

### Auf dem eigenen Rechner

```bash
git clone https://github.com/ChristianCra/Kontor.git
cd Kontor
npm install
cp .env.example .env
```

In `.env` einen zufälligen `AUTH_SECRET` eintragen, zum Beispiel die Ausgabe von `openssl rand -base64 32`. Danach:

```bash
npx prisma migrate deploy   # legt die Datenbank prisma/dev.db an (leer, ohne Beispieldaten)
npm run build
npm start                   # http://localhost:3000
```

Beim ersten Aufruf legt man das erste Benutzerkonto an. Anschließend unter „Einstellungen“ die Firmendaten, den Kontenrahmen, die Versteuerungsart und die DATEV-Nummern eintragen und unter „Bank“ die Zahlungskonten anlegen.

Wer Beispieldaten zum Ausprobieren möchte, ruft zusätzlich `npx prisma db seed` auf.

### Mit Docker (empfohlen für Server und NAS)

Auf dem Rechner wird nur Docker mit Compose gebraucht, kein Node.js:

```bash
git clone https://github.com/ChristianCra/Kontor.git
cd Kontor
docker compose up -d --build
```

Kontor läuft danach unter http://localhost:3000. Den Port ändert man mit `KONTOR_PORT=8080 docker compose up -d`. Beim Start legt der Container die Datenbank an bzw. spielt neue Migrationen ein. Ohne `AUTH_SECRET` erzeugt er beim ersten Start selbst einen Schlüssel und legt ihn im Datenvolume ab.

Datenbank, Belege und der Schlüssel liegen im Docker-Volume `kontor-data` (im Container unter `/data`). Für den E-Mail-Versand legt man neben `docker-compose.yml` eine Datei `.env` an:

```bash
SMTP_URL=smtps://benutzer:passwort@smtp.example.com:465
MAIL_FROM="Muster Design GmbH <rechnung@example.com>"
```

Aktualisieren: `git pull && docker compose up -d --build`

Sichern, zum Beispiel nachts per Cron. Damit die Datenbank in einem stimmigen Zustand gesichert wird, hält man Kontor dafür kurz an:

```bash
docker compose stop
docker run --rm -v kontor_kontor-data:/data -v "$PWD":/backup busybox tar czf /backup/kontor-$(date +%F).tar.gz -C /data .
docker compose start
```

Der Volume-Name setzt sich aus dem Ordnernamen und `kontor-data` zusammen, `docker volume ls` zeigt ihn an. Für den Zugriff aus dem Internet gehört auch hier ein Reverse Proxy mit HTTPS davor, wie unten beschrieben.

### Mit fertigem Image (ohne Build auf dem Server)

Bei jedem Stand auf `main` baut GitHub Actions das Image und veröffentlicht es als `ghcr.io/christiancra/kontor:latest`. Für verwaltete Docker-Umgebungen, die nur fertige Images starten, gibt es [`deploy/docker-compose.yml`](deploy/docker-compose.yml): Diese Datei übernehmen und einen Reverse Proxy mit HTTPS davorsetzen (siehe unten). Port 3000 ist dort bewusst nur auf `127.0.0.1` freigegeben, damit Kontor nicht unverschlüsselt über `http://<Server-IP>:3000` erreichbar ist. Aktualisieren heißt dort nur, das Image neu zu ziehen (`docker compose pull && docker compose up -d`).

### Hinter einem vorhandenen Caddy

Belegt auf dem Server schon ein anderer Caddy die Ports 80 und 443, läuft Kontor einfach daneben und dieser Caddy leitet die Kontor-Domain weiter:

1. Kontor mit [`deploy/docker-compose.yml`](deploy/docker-compose.yml) starten. Dabei entsteht das Docker-Netzwerk `web-proxy`, in dem Kontor unter dem Namen `kontor` erreichbar ist.
2. Den vorhandenen Caddy in dieses Netzwerk hängen. In seiner Compose-Datei:

   ```yaml
   services:
     caddy:
       networks: [default, web-proxy]
   networks:
     web-proxy:
       external: true
   ```

   Oder einmalig ohne Änderung der Datei: `docker network connect web-proxy <caddy-container>` (gilt nur bis zum Neuanlegen des Containers).
3. Den Block aus [`deploy/caddy/Caddyfile.kontor`](deploy/caddy/Caddyfile.kontor) an dessen Caddyfile anhängen und Caddy neu laden (`docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile`). Die übrigen Seiten dieses Caddy laufen dabei ohne Unterbrechung weiter; das Zertifikat holt Caddy selbst, sobald der DNS-Eintrag auf den Server zeigt.

### Ohne Docker auf einem Server (z. B. ein kleiner VPS)

1. Schritte wie oben ausführen, `PORT` nach Bedarf setzen (`PORT=3000 npm start`).
2. Den Prozess dauerhaft laufen lassen, zum Beispiel mit einer systemd-Unit:

   ```ini
   [Unit]
   Description=Kontor
   After=network.target

   [Service]
   WorkingDirectory=/opt/kontor
   ExecStart=/usr/bin/npm start
   Environment=PORT=3000
   Restart=always
   User=kontor

   [Install]
   WantedBy=multi-user.target
   ```

3. Einen Reverse Proxy mit HTTPS davorsetzen, zum Beispiel Caddy mit der Zeile `kontor.example.de { reverse_proxy localhost:3000 }`. Ohne HTTPS sollte Kontor nicht im Internet erreichbar sein, denn Passwörter und Finanzdaten würden sonst unverschlüsselt übertragen.
4. Für den echten E-Mail-Versand `SMTP_URL` und `MAIL_FROM` in `.env` setzen. Ohne SMTP-Zugang landen E-Mails nur als Datei in `storage/outbox`.
5. Regelmäßig `prisma/dev.db` und den Ordner `storage/` sichern. Dort liegen alle Buchhaltungsdaten und Belege, die nach GoBD zehn Jahre aufbewahrt werden müssen.

### Aktualisieren (ohne Docker)

```bash
git pull
npm install
npx prisma migrate deploy
npm run build
# danach den Dienst neu starten, z. B. sudo systemctl restart kontor
```

## Claude und API

Unter Einstellungen → API und Claude stehen die Adressen und die API-Schlüssel.

**Als Connector in Claude:** In Claude unter Einstellungen → Connectors einen eigenen Connector mit der Adresse `https://deine-domain/api/mcp` anlegen. Claude leitet zur Anmeldung an Kontor weiter; dort wählt man die Rechte und bestätigt. Der Zugang erscheint danach in der Schlüsselliste und lässt sich dort widerrufen. Kontor muss dafür über https öffentlich erreichbar sein. Hinter einem Proxy, der die Adresse nicht korrekt weiterreicht, setzt man `PUBLIC_URL=https://deine-domain`.

**Mit Claude Code oder eigenen Skripten:** Einen Schlüssel anlegen und als Header `Authorization: Bearer kontor_…` mitschicken, zum Beispiel `claude mcp add --transport http kontor https://deine-domain/api/mcp --header "Authorization: Bearer kontor_…"`.

**Rechte:**

| Recht | Erlaubt |
|---|---|
| Lesen | Belege, Umsätze, offene Posten, Kontakte, UStVA, EÜR, Überblick „was braucht Aufmerksamkeit“ |
| Entwürfe | Belegentwürfe mit Datei anlegen; Buchen, Zuordnen und Privat-Markieren werden zur Freigabe vorgelegt |
| Buchen | Belege buchen und Umsätze zuordnen ohne Freigabe |

Festschreiben, E-Mail-Versand und Löschen gehen nur in der Oberfläche. Vorgeschlagene Schritte erscheinen unter **Freigaben** mit Begründung des Agenten; erst nach „Freigeben“ führt Kontor sie aus. Unter **Protokoll** steht jede Änderung mit Akteur (Benutzer oder Schlüssel); jede Zeile enthält den Hash der vorigen, nachträgliche Änderungen an der Datenbank fallen dadurch auf.

**REST-Endpunkte** (Beträge in Euro, Datum `JJJJ-MM-TT`):

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/v1/attention` | Offene Umsätze, Entwürfe, überfällige Rechnungen, offene Freigaben, nächste UStVA-Frist |
| GET | `/api/v1/accounting-types` | Buchungskonten mit ID |
| GET | `/api/v1/contacts?search=` | Kontakte suchen |
| GET | `/api/v1/open-items` | Offene Rechnungen und Belege |
| GET/POST | `/api/v1/vouchers` | Belege auflisten bzw. Entwurf anlegen (JSON oder multipart mit `data` und `file`) |
| GET | `/api/v1/vouchers/:id` | Ein Beleg |
| POST | `/api/v1/vouchers/:id/file` | Datei anhängen (multipart, Feld `file`) |
| POST | `/api/v1/vouchers/:id/book` | Buchen bzw. zur Freigabe vorlegen |
| GET | `/api/v1/transactions?status=100` | Bankumsätze mit Zuordnungsvorschlägen |
| POST | `/api/v1/transactions/:id/link` | Zuordnen (`kind`: invoice, credit, voucher, income; `id`) |
| POST | `/api/v1/transactions/:id/private` | Als privat markieren |
| GET | `/api/v1/approvals?status=pending` | Freigaben |
| GET | `/api/v1/reports/ustva?year=&period=QUARTER&index=` | UStVA-Werte |
| GET | `/api/v1/reports/euer?year=` | EÜR |

## Entwicklung

Voraussetzungen: Node.js 20+.

```bash
npm install
cp .env.example .env     # AUTH_SECRET setzen, optional SMTP_URL und MAIL_FROM
npx prisma migrate dev   # legt die SQLite-Datenbank an und spielt Beispieldaten ein
npm run dev              # http://localhost:3000
npm test                 # Unit-Tests der Rechenlogik
```

Beim ersten Aufruf legt man das erste Benutzerkonto an. Im Produktivbetrieb ist `AUTH_SECRET` Pflicht, sonst ist keine Anmeldung möglich.

Hochgeladene Belege und E-Mails im Testmodus landen in `./storage` (anpassbar über `STORAGE_DIR`).

Beträge werden als ganze Cent gespeichert. Die Umsatzsteuer wird je Steuersatz gruppiert und auf Gruppenebene gerundet.

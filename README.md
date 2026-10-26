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

Nicht enthalten: direkte ELSTER-Übermittlung (dafür ist die ERiC-Bibliothek mit eigener Hersteller-ID nötig). Die UStVA- und EÜR-Werte lassen sich je Kennzahl kopieren und in „Mein ELSTER“ eintragen.

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

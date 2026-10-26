# Kontor

Rechnungen, Belege und Buchhaltung für Selbstständige und kleine Unternehmen in Deutschland. Funktional orientiert an SevDesk: Das Verhalten wurde aus der öffentlichen SevDesk-API und mit [REA](https://github.com/morluto/rea) abgeleitet, Code, Name und Design sind eigenständig.

## Stand (Etappe 1 bis 3)

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

Geplant: EÜR, UStVA, DATEV-Export, E-Mail-Versand.

## Entwicklung

Voraussetzungen: Node.js 20+.

```bash
npm install
cp .env.example .env
npx prisma migrate dev   # legt die SQLite-Datenbank an und spielt Beispieldaten ein
npm run dev              # http://localhost:3000
npm test                 # Unit-Tests der Rechenlogik
```

Hochgeladene Belege landen in `./storage` (anpassbar über `STORAGE_DIR`).

Beträge werden als ganze Cent gespeichert. Die Umsatzsteuer wird je Steuersatz gruppiert und auf Gruppenebene gerundet.

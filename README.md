# vikunja-nl-datum

Nederlandse datumherkenning voor [Vikunja](https://vikunja.io). Typ een taak met een datum erin, en de deadline wordt vanzelf gezet:

| Je typt | Titel wordt | Deadline |
|---|---|---|
| Boodschappen halen voor volgende week donderdag | Boodschappen halen | donderdag volgende week, 12:00 |
| Tandarts bellen morgen | Tandarts bellen | morgen, 12:00 |
| Vergadering voorbereiden vrijdag om 14:00 | Vergadering voorbereiden | vrijdag, 14:00 |
| Cadeau kopen voor 25 december | Cadeau kopen | 25 december, 12:00 |
| Rapport afmaken over 3 dagen | Rapport afmaken | over 3 dagen, 12:00 |
| Belasting aangifte eind van de maand | Belasting aangifte | laatste dag van de maand |

Ook herkend: `vandaag`, `overmorgen`, `vanavond`, `dit weekend`, `volgende maand`, `maandag 9 uur`, `31-12`, `31-12-2026`, `voor 3 december 2026`. (Zonder "voor" of "op" ervoor laat de proxy "3 december 2026" aan Vikunja zelf over, zie *Beperkingen*.)

**Meer vormen:** `komende vrijdag`, `aanstaande vrijdag`, `a.s. vrijdag`, `vrijdag volgende week`, `volgend weekend`, `donderdagavond`, `zaterdagochtend`, `vrijdagmiddag`, `over een week`, `binnen 3 dagen`, `begin volgende maand`, `eind volgende maand`, `eind van het jaar`, `begin volgend jaar`, `eind van de week` (vrijdag).

**Wordt bewust niet als datum gezien:** herhaling (`Elke maandag vergadering`, `Wekelijks ...`, `Dagelijks om 9 uur`), want dat is geen eenmalige deadline; datums in het verleden (`vorige week vrijdag`, `gisteren`); getal-streepje-getal na woorden als hoofdstuk, pagina, score en uitslag (`Lees hoofdstuk 2-3`); en een tijdsbereik als `18-20 uur`.

**Tijden:** `om 14:00`, `14u`, `14u30`, `om 17.30`, `half 3` (14:30), `kwart over 2`, `kwart voor 3`, `tien voor half 3`, `over een half uur`, `over een kwartier`, `over 2 uur`, `om 2 uur 's middags`, `om 9 uur 's avonds`.

Twee keuzes bij tijden die je kunt tegenkomen:
- **Zonder dagdeel** rekent hij uren van 1 tot en met 7 als middag of avond: `om 2 uur` en `half 3` zijn 14:00 en 14:30. Uren van 8 tot en met 11 blijven ochtend (`om 9 uur` is 9:00). Wil je de nacht, schrijf dan `'s nachts` erbij.
- **`morgenochtend` en `vanochtend`** zijn 9:00, geen 6:00.

Vikunja's eigen *Quick Add Magic* werkt alleen in het Engels. Dit project vult dat aan. De Engelse variant blijft gewoon werken.

Er zijn twee onderdelen, die dezelfde regels (`src/parse.js`) gebruiken:

| | Wat | Voordeel | Nadeel |
|---|---|---|---|
| **Webpagina** ([`frontend/`](frontend/README.md)) | Eigen Vikunja-image met markering in het invoerveld, zoals in Todoist | Je ziet tijdens het typen wat er herkend wordt, en kunt erop klikken om het te negeren. Een kant-en-klaar image staat bij de [releases](../../releases) | Het is een aangepaste Vikunja-build: bij elke nieuwe Vikunja-versie moet een nieuw image komen |
| **Proxy** (deze map) | Doorgeef-proxy voor Vikunja zonder eigen build | Werkt voor elke client (web, mobiel, API) en overleeft updates | Geen markering; de titel verandert pas bij opslaan |

Samen gebruiken kan ook.

## Hoe de proxy werkt

```
browser  ──►  nl-datum (deze proxy)  ──►  Vikunja
```

De proxy geeft vrijwel alles ongewijzigd door. Alleen het verzoek *taak aanmaken* (`PUT /api/v1/projects/{id}/tasks`) wordt onderweg aangepast: staat er een Nederlandse datum in de titel en is er nog geen deadline, dan wordt de deadline gezet en de datum uit de titel gehaald. Omdat dit gebeurt vóór Vikunja de taak opslaat, toont de webpagina meteen het goede resultaat. Herladen is niet nodig. De webapp, de mobiele app en de API gebruiken dezelfde URL en werken dus allemaal.

Gaat er iets mis bij het herschrijven (kapotte JSON, onbekende vorm), dan wordt het oorspronkelijke verzoek ongewijzigd doorgestuurd. De proxy laat een taak nooit mislukken.

## Installeren

### De webpagina-variant (aanrader)

Gebruik het kant-en-klare image uit de [releases](../../releases) in plaats van het standaard Vikunja-image. Kies de versie die je nu draait, maak eerst een back-up van je database, en zet in je compose-bestand:

```yaml
image: ghcr.io/<eigenaar>/vikunja-nl:v2.8.0      # was: vikunja/vikunja:v2.8.0
```

Dan `docker compose pull && docker compose up -d`. Zelf bouwen, een andere Vikunja-versie en de uitleg per onderdeel staan in [`frontend/README.md`](frontend/README.md).

### De proxy

Je hebt Docker of Node.js 22+ nodig. Er moet een route zijn van de browser naar de proxy, en van de proxy naar Vikunja.

#### Met Docker

Zie [`docker-compose.example.yml`](docker-compose.example.yml). In het kort: bouw het image uit deze map, laat het draaien naast Vikunja met `VIKUNJA_URL=http://vikunja:3456`, en laat het verkeer dat nu naar Vikunja gaat via de proxy lopen. Dat is óf de gepubliceerde poort, óf het doel van je reverse proxy (nginx, Caddy, Traefik): wijs dat naar `nl-datum:3457` in plaats van `vikunja:3456`.

#### Zonder Docker

```bash
npm ci --omit=dev
VIKUNJA_URL=http://localhost:3456 PORT=3457 npm start
```

Open daarna Vikunja via poort 3457 in plaats van 3456.

#### Controleren

1. `GET /__nl-datum/health` op de proxy moet `{"status":"ok", ...}` geven.
2. Maak in Vikunja een taak "Test donderdag". Het resultaat moet "Test" zijn met een deadline.
3. In de logs van de proxy staat bij elke aanpassing een regel `taak aangepast: ...`.

## Instellingen

Omgevingsvariabelen, zie [`.env.example`](.env.example).

| Variabele | Standaard | Betekenis |
|---|---|---|
| `VIKUNJA_URL` | `http://vikunja:3456` | Waar Vikunja draait (alleen `http://`) |
| `PORT` | `3457` | Poort van de proxy |
| `HOST` | `0.0.0.0` | Adres waarop de proxy luistert |
| `TZ` | `Europe/Amsterdam` | Tijdzone voor "donderdag", "morgen", "vanavond" |
| `DEFAULT_TIME` | `12:00` | Tijdstip voor datums zonder tijd. Is dat vandaag al voorbij, dan wordt het 23:59. |

## Als de herkenning iets verkeerd doet

- Begin de titel met `~`, dan wordt er niets herkend en verdwijnt de `~` zelf uit de titel: `~Mei bellen over de factuur` blijft `Mei bellen over de factuur`.
- Zet een `~` vlak voor één datum, dan wordt alleen die genegeerd: `Boodschappen halen ~donderdag` blijft `Boodschappen halen donderdag`. De andere datums in de titel blijven werken. In de webpagina-variant zet een klik op de markering deze `~` voor je.

Onder water is de herkenning terughoudend. Dit blijft ongemoeid:

- losse afkortingen en gewone woorden: `Zo snel mogelijk`, `Ma bellen`, `Vrij nemen`, `Mei bellen`, `Nu of nooit`
- titels met twee datums (`Maandag of dinsdag bellen`): te onduidelijk
- datums in het verleden (`Notities van vorige week`)
- titels die alleen uit een datum bestaan (`Donderdag`)
- taken die al een deadline hebben

## Beperkingen

- Alleen bij het **aanmaken** van een taak. Pas je later de titel aan, dan gebeurt er niets.
- Taken die binnenkomen via CalDAV (`/dav`) of op een andere route dan hierboven lopen niet door de herkenning.
- De herkenning neemt alleen over als er echt Nederlands in staat (een Nederlands woord, een datum met streepjes zoals `31-12`, of een voorzetsel als "voor" of "op" ervoor). Zo blijft Engelse invoer ongemoeid. Gevolg: "Cadeau kopen voor 25 december" wordt herkend, maar "Cadeau kopen 25 december" laat de proxy aan Vikunja zelf over (december is in beide talen hetzelfde). De webpagina van Vikunja doet dat laatste wel. Datums met schuine strepen of punten (`06/08/2021`) volgen Vikunja's Engelse volgorde (maand/dag); typ met streepjes voor dag-maand.
- "volgende vrijdag" wordt, net als in het Engels ("next friday"), gelezen als vrijdag **volgende week**. Wil je de eerstvolgende vrijdag, schrijf dan alleen "vrijdag".
- Valt de proxy uit, dan is Vikunja onbereikbaar voor wie via de proxy komt. Gebruik `restart: unless-stopped` (zoals in het voorbeeld), en wijs bij problemen tijdelijk terug naar Vikunja zelf.

## Ontwikkelen

```bash
npm ci
npm test
```

`npm test` draait alles met de tijdzone Europe/Amsterdam (via `scripts/run-tests.mjs`; op een computer in een andere tijdzone zou het anders rond middernacht en bij zomer-/wintertijd misgaan). De tests zijn:

- `test/parse.test.js`: de basis van de datumherkenning, met een vaste "nu" (woensdag 11 november 2026).
- `test/uitgebreid.test.js` (met de gevallen in `test/data/`): ruim 330 gevallen voor weekdagen, relatieve datums, maandnamen, tijden, titels schoonmaken, valse treffers, `~`, jaarwisseling, schrikkeljaar, zomer-/wintertijd en de proxy-functie `herschrijfTaak`.
- `test/eigenschappen.test.js`: eigenschappen die voor 4000 gegenereerde zinnen en 5000 willekeurige tekenreeksen moeten kloppen (nooit een fout, titel netjes, onderwerp blijft behouden, markering en omzetting eens, tweede omzetting verandert niets).
- `test/proxy.test.js`: de proxy tegen een nagebootste Vikunja (wat wel en niet herschreven wordt, headers, cookies, grote uploads, onbereikbare Vikunja).
- `test/bundle.test.js`: de gebundelde code voor de webpagina loopt niet achter op `src/parse.js` en doet precies hetzelfde.

Na een wijziging in `src/parse.js` draai je `npm run bundle:frontend`. Met `npm run check:vikunja-english -- <pad naar Vikunja's quickAddMagic.test.ts>` controleer je dat Vikunja's Engelse invoer ongemoeid blijft (zie `frontend/README.md`).

**Status van de proxy:** getest met die automatische tests. Controleer na installatie met een testtaak, zoals hierboven beschreven. Het Dockerfile en het compose-voorbeeld in deze map worden niet automatisch getest.

## Licentie

De map [`frontend/`](frontend/) is afgeleid van Vikunja en valt onder de AGPL-3.0, zie [`frontend/LICENSE`](frontend/LICENSE). Voor de rest van deze repository is nog geen licentie gekozen.

## Technisch

- Datumherkenning: [chrono-node](https://github.com/wanasit/chrono) (Nederlandse variant), aangevuld met eigen patronen in `src/parse.js`.
- De proxy gebruikt alleen ingebouwde Node-modules (`node:http`).

# Nederlandse datums in Vikunja's webpagina

Vikunja's invoerveld voor nieuwe taken kent alleen Engelse datumwoorden. Dit onderdeel maakt er een eigen Vikunja-image van die ook Nederlands begrijpt, met markering zoals in Todoist:

- **Tijdens het typen** wordt de herkende tekst gemarkeerd, met eronder de datum die erachter zit: `📅 do 19 nov, 12:00`.
- **Klik op de gemarkeerde tekst** en die tekst telt niet meer als datum.
- **Bij opslaan** wordt de datum uit de titel gehaald en de deadline gezet.

```
Boodschappen halen voor [volgende week donderdag]      📅 do 19 nov, 12:00
```

De regels zijn dezelfde als die van de proxy in de hoofdmap (`src/parse.js`), zodat de markering en het resultaat nooit uit elkaar lopen.

## Bouwen

Je hebt `git` en `docker` nodig op de plek waar je bouwt (je server kan dat zijn).

```bash
cd frontend
./build.sh --tag v2.8.0
```

Dit haalt Vikunja op in die versie, voegt onze bestanden toe, past een kleine patch toe en bouwt met Vikunja's eigen Dockerfile het image `vikunja-nl:v2.8.0`. Dat duurt een paar minuten, want het programma wordt daarbij ook zelf gebouwd. De pagina zit namelijk ingebakken in het Vikunja-programma en kan niet los worden vervangen.

| Optie | Betekenis |
|---|---|
| `--tag v2.8.0` | Vikunja-versie. **Kies de versie die je nu draait**, dan krijg je geen onverwachte upgrade. |
| `--image naam:tag` | Eigen naam voor het image (standaard `vikunja-nl:<versie>`) |
| `--check` | Voer eerst Vikunja's typecontrole en tests uit (Node 24+ en pnpm nodig). Aanrader bij een nieuwe versie. |
| `--no-docker` | Alleen de aangepaste broncode klaarzetten in `.build/`, niet bouwen |

## Zonder zelf te bouwen: image van GitHub

De workflow `.github/workflows/build-image.yml` doet hetzelfde als `build.sh`, maar dan op GitHub zelf. Het voert daarbij altijd Vikunja's typecontrole en tests uit, en publiceert het image naar `ghcr.io/<eigenaar>/vikunja-nl:<versie>`.

- **Proefbouw:** Actions > *Vikunja-image bouwen* > *Run workflow*. Kies de Vikunja-versie. Zonder vinkje bij *publiceren* wordt er alleen gebouwd en getest.
- **Release maken:** push een tag in de vorm `v2.8.0-nl.1` (Vikunja-versie, `-nl.`, ons eigen nummer). Dan wordt er gebouwd, getest, gepubliceerd en een GitHub-release met uitleg aangemaakt.

```bash
git tag v2.8.0-nl.1 && git push origin v2.8.0-nl.1
```

Daarna gebruik je op je server `image: ghcr.io/<eigenaar>/vikunja-nl:v2.8.0` (zie hieronder). Is het pakket privé, log dan eenmalig in met `docker login ghcr.io` en een token met de rechten `read:packages`. Of zet het pakket op openbaar in de pakketinstellingen op GitHub. Bedenk daarbij dat je dan een aangepaste AGPL-software openbaar verspreidt.

## Gebruiken

Vervang in je compose-bestand het image door je eigen:

```yaml
services:
  vikunja:
    image: vikunja-nl:v2.8.0     # was: vikunja/vikunja
```

Start Vikunja daarna opnieuw. Je gegevens en instellingen blijven hetzelfde. **Maak wel eerst een back-up van je database** als je ook van Vikunja-versie wisselt: een nieuwere versie kan de database aanpassen.

### In het invoerveld

| | |
|---|---|
| Tekst die gemarkeerd is | wordt de deadline en verdwijnt uit de titel |
| Klik op de markering | er komt een `~` voor die tekst; die tekst telt dan niet meer als datum |
| `~` vlak voor een datum typen | hetzelfde, met het toetsenbord |
| `~` vooraan de titel | geen enkele herkenning voor deze titel |
| Hele titel tussen aanhalingstekens | geen enkele herkenning (zoals bij Vikunja zelf) |
| Meerdere regels | elke regel is een eigen taak met een eigen herkenning |

De `~` verdwijnt bij het opslaan uit de titel. Wil je de herkenning toch weer aan, verwijder dan de `~`.

**Verschil met Todoist:** daar verdwijnt de markering zonder dat er iets in de tekst komt. Een gewoon invoerveld kan geen onzichtbare uitsluiting onthouden, dus hier blijft de `~` zichtbaar tot je de taak opslaat.

De Engelse woorden ("tomorrow", "next monday") blijven werken. Als er een Nederlandse datum in de titel staat gaat die voor, en slaat Vikunja de Engelse herkenning voor die titel over. Anders zou "voor 25 december" door de Engelse herkenning worden opgepakt (december is in beide talen hetzelfde) en bleef er een los woord "voor" in de titel staan.

Voor datums zonder tijd gebruikt hij de standaardtijd uit je Vikunja-instellingen, en anders 12:00.

## Samen met de proxy

De proxy in de hoofdmap is niet meer nodig voor de webpagina, maar blijft nuttig voor clients die dit invoerveld niet gebruiken (mobiele app, API). Staan beide aan, dan geeft dat geen dubbel werk: de webpagina stuurt de deadline al mee, en de proxy laat taken met een deadline met rust.

## Een nieuwe Vikunja-versie

```bash
./build.sh --tag v2.9.0 --check
```

Past de patch niet meer, dan zijn de twee bestanden die we aanpassen veranderd in die versie. Je moet dan twee kleine dingen met de hand doen (de bestanden zelf, de toegevoegde onderdelen, hoeven niet te veranderen):

1. `frontend/src/modules/quickAddMagic/quickAddMagic.ts`, in `parseTaskText`: roep `parseNlTitle(result.text, now)` aan vóór `parseDate`. Geeft die iets terug (niet `null`), neem dan `title` en `due` over in `result.text` en `result.date`. Anders ga je verder met `parseDate` zoals voorheen.
2. `frontend/src/components/tasks/AddTask.vue`: importeer `NlDateHighlight` en zet `<NlDateHighlight :textarea="newTaskInput" :text="newTaskTitle" />` direct onder het blok `add-task__field`.

Maak daarna met `git diff` in de bronmap een nieuwe `patches/nl-datum.patch`.

## De regels aanpassen

De herkenning staat in `src/parse.js` in de hoofdmap. Na een wijziging:

```bash
npm run bundle:frontend   # maakt files/nlDatum.generated.js opnieuw
npm test                  # controleert o.a. dat die bundel niet achterloopt
./build.sh --tag <versie>
```

## Wat er in deze map staat

| Bestand | Wat |
|---|---|
| `files/NlDateHighlight.vue` | de laag die de herkende tekst markeert, de datum toont en een klik afhandelt |
| `files/nlDatum.ts` | koppelstuk naar Vikunja (standaardtijd uit je instellingen) |
| `files/nlDatum.generated.js` | de regels, gebundeld voor de browser (gegenereerd, niet met de hand aanpassen) |
| `files/nlDatum.test.ts` | tests voor Vikunja's eigen testprogramma (vitest) |
| `patches/nl-datum.patch` | de twee kleine wijzigingen in bestaande Vikunja-bestanden |
| `build.sh` | haalt Vikunja op, past alles toe en bouwt het image |

## Status

- **Getest:** de regels zelf (68 tests in de hoofdmap), en dat de bundel voor de browser precies hetzelfde doet. Ook is gecontroleerd dat het bouwscript op een verse kopie van Vikunja v2.8.0 de bestanden toevoegt en de patch toepast.
- **Nog niet getest:** de Vue-onderdelen en de TypeScript-koppeling zijn niet gebouwd, niet door Vikunja's typecontrole gehaald en niet in een browser bekeken. Draai daarom bij de eerste bouw `./build.sh --check`, en controleer de markering in de browser. De uitlijning van de markering over het invoerveld is het eerste waar ik op zou letten.
- Het Docker-bouwen zelf is niet uitgeprobeerd, en de GitHub-workflow is nog niet gedraaid. Een geslaagde proefbouw van de workflow bewijst zowel de typecontrole en tests als het bouwen.

## Licentie

Vikunja is AGPL-3.0, en deze aanpassingen zijn daarvan afgeleid. De map valt daarom onder dezelfde licentie, zie [`LICENSE`](LICENSE). Vooral artikel 13 is relevant als anderen dan jij je aangepaste Vikunja gebruiken.

// Bundelt src/parse.js (+ chrono-node) tot één los bestand voor de Vikunja-webpagina.
// Zo gebruiken de proxy en de webpagina precies dezelfde regels, en hoeft er niets
// aan Vikunja's package.json of lockfile te veranderen.
//
//   npm run bundle:frontend      (na elke wijziging in src/parse.js)
//
// De test in test/bundle.test.js controleert dat het bestand niet achterloopt.

import { build } from 'esbuild'
import { statSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const UIT = 'frontend/files/nlDatum.generated.js'

export async function bundel() {
  const resultaat = await build({
    entryPoints: ['src/parse.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
    outfile: UIT,
    banner: {
      js: '/* eslint-disable */\n// GEGENEREERD door scripts/bundle-frontend.mjs uit src/parse.js (+ chrono-node, MIT). Niet met de hand aanpassen.\n',
    },
  })
  return resultaat.outputFiles[0].text
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(UIT, await bundel())
  console.log(`${UIT}: ${(statSync(UIT).size / 1024).toFixed(0)} kB`)
}

// Draait alle tests met de tijdzone al ingesteld bij het STARTEN van Node.
//
// Waarom: de tests rekenen met Amsterdamse tijd (zomer-/wintertijd, "morgen" rond middernacht).
// Een tijdzone die pas tijdens een testbestand wordt gezet (process.env.TZ = ...) werkt niet op
// elke computer: op een Linux-machine zonder TZ-instelling (zoals GitHub) bleven de datums in UTC
// terwijl ze later in Amsterdamse tijd werden gelezen. Via de omgeving van het kindproces staat de
// tijdzone vanaf het begin goed, op elk besturingssysteem.

import { spawnSync } from 'node:child_process'

const resultaat = spawnSync(process.execPath, ['--test', 'test/*.test.js', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, TZ: 'Europe/Amsterdam' },
})

process.exit(resultaat.status ?? 1)

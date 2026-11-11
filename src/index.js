// Startpunt. Instellingen via omgevingsvariabelen (zie .env.example).

process.env.TZ ||= 'Europe/Amsterdam' // ook als TZ leeg is meegegeven

const { createProxy } = await import('./proxy.js')

const upstream = process.env.VIKUNJA_URL ?? 'http://vikunja:3456'
const port = Number(process.env.PORT ?? 3457)
const host = process.env.HOST ?? '0.0.0.0'
const defaultTime = process.env.DEFAULT_TIME ?? '12:00'

try {
  const u = new URL(upstream)
  if (u.protocol !== 'http:') throw new Error('alleen http:// wordt ondersteund (de proxy staat naast Vikunja, niet erbuiten)')
} catch (err) {
  console.error(`Ongeldige VIKUNJA_URL "${upstream}": ${err.message}`)
  process.exit(1)
}

const stempel = () => new Date().toISOString()
const server = createProxy({ upstream, defaultTime, log: (msg) => console.log(`${stempel()} ${msg}`) })

server.listen(port, host, () => {
  console.log(`${stempel()} Nederlandse datum-proxy luistert op ${host}:${port}, doorgeven aan ${upstream} (tijdzone ${process.env.TZ}, standaardtijd ${defaultTime})`)
})

for (const signaal of ['SIGTERM', 'SIGINT']) {
  process.on(signaal, () => {
    console.log(`${stempel()} ${signaal} ontvangen, afsluiten`)
    server.close(() => process.exit(0))
    server.closeAllConnections()
  })
}

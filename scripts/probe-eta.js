// Read-only study of bus arrival estimates (`trajetos` mode with sondar=eta).
// Follows live Carris Metropolitana buses to a stop a few stops ahead, asks
// the stop's arrivals every 20 s, and compares, against when the bus really
// got there (its position at or past the stop): the service's estimate as it
// comes, and the one corrected by the bus's position (`withBusPositions`).
// Publishes nothing. Run by build-transit.yml after the app's code is compiled.
const path = require('path');

module.exports = async function studyEta(pasta) {
  const transit = require(path.join(pasta, 'services/transit.js'));
  const vehicles = require(path.join(pasta, 'services/vehicles.js'));
  const busEta = require(path.join(pasta, 'services/busEta.js'));
  const hora = (u) => new Date(u * 1000).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
  const SAMPLE_S = 20;
  const RUN_S = 16 * 60;
  const TARGETS = 14;

  const lista = await vehicles.liveVehicles({ cm: true });
  console.log(`\n=== ETA study: ${lista.length} live buses at ${hora(Date.now() / 1000)} ===`);
  const followed = [];
  for (const v of lista) {
    if (followed.length >= TARGETS) break;
    if (!v.tripId || v.speedKmh < 3) continue;
    try {
      const trip = await transit.vehicleTrip(v);
      const p = transit.vehicleProgress(trip, v);
      const k = p.nextIndex + 2 + (followed.length % 4);
      if (k >= trip.stops.length) continue;
      followed.push({ v, trip, target: k, stop: trip.stops[k], samples: [], arrivedAt: null });
    } catch {}
  }
  console.log(`following ${followed.length} buses`);
  const bare = (id) => id.replace(/^(\[[^\]]*\])+/, '');
  const t0 = Date.now() / 1000;
  while (Date.now() / 1000 - t0 < RUN_S && followed.some((f) => f.arrivedAt === null)) {
    let buses = [];
    try { buses = await vehicles.metropolitanaVehiclesRecent(15000); } catch {}
    const now = Date.now() / 1000;
    for (const f of followed) {
      if (f.arrivedAt !== null) continue;
      const bus = buses.find((b) => b.tripId && bare(b.tripId) === bare(f.v.tripId));
      if (bus) {
        const p = transit.vehicleProgress(f.trip, bus);
        if ((p.atIndex >= 0 && p.atIndex >= f.target) || p.nextIndex > f.target) {
          f.arrivedAt = bus.reportedAt;
          continue;
        }
      }
      try {
        const raw = await transit.arrivalsAt(f.stop.id, 20);
        const mine = raw.find((a) => a.tripId && bare(a.tripId) === bare(f.v.tripId));
        if (!mine) continue;
        const checked = await busEta.withBusPositions(f.stop.id, [mine]);
        f.samples.push({ at: now, api: mine.unix, ours: checked[0].unix, away: checked[0].stopsAway });
      } catch {}
    }
    await new Promise((r) => setTimeout(r, SAMPLE_S * 1000));
  }

  const rows = { api: [], ours: [] };
  for (const f of followed) {
    if (f.arrivedAt === null || f.samples.length === 0) {
      console.log(`  ${f.v.line} → ${f.stop.name}: not seen arriving (${f.samples.length} samples)`);
      continue;
    }
    console.log(`  ${f.v.line} → ${f.stop.name}: arrived ${hora(f.arrivedAt)}`);
    for (const s of f.samples) {
      const left = f.arrivedAt - s.at;
      if (left < 0) continue;
      rows.api.push({ left, err: s.api - f.arrivedAt });
      rows.ours.push({ left, err: s.ours - f.arrivedAt });
      console.log(`    at ${hora(s.at)} (real ${Math.round(left / 60 * 10) / 10} min): api ${Math.round((s.api - s.at) / 6) / 10} min, ours ${Math.round((s.ours - s.at) / 6) / 10} min, ${s.away ?? '?'} stops`);
    }
  }
  const summary = (name, list) => {
    if (list.length === 0) return console.log(`  ${name}: no samples`);
    const abs = list.map((r) => Math.abs(r.err)).sort((a, b) => a - b);
    const early = list.filter((r) => r.err < -60).length;
    const late = list.filter((r) => r.err > 60).length;
    const mean = list.reduce((s, r) => s + r.err, 0) / list.length;
    console.log(`  ${name}: n=${list.length} median |err| ${Math.round(abs[Math.floor(abs.length / 2)])} s, mean err ${Math.round(mean)} s, too early >1 min ${early}, too late >1 min ${late}`);
  };
  console.log('\n=== Summary (err = predicted − real; negative = promised too soon) ===');
  summary('service', rows.api);
  summary('corrected', rows.ours);
};

// Runs the app's trip planning (`planBusTrips`, in src/services/transit.ts)
// against the real Carris Metropolitana API.
//
// It exists because the environment where the code is written cannot reach the
// API, and simulations with made-up data let through what only real data shows.
// It runs in the timetables workflow, mode `trajetos`: the code is compiled to
// JavaScript and this file calls it with pairs of real places.
const Module = require('module');
const path = require('path');

const original = Module._load;
Module._load = function (pedido, ...resto) {
  // The only Expo module in the way: the phone's language.
  if (pedido === 'expo-localization') {
    return { getLocales: () => [{ languageCode: 'pt', languageTag: 'pt-PT' }] };
  }
  return original.call(this, pedido, ...resto);
};

const pasta = process.argv[2];
const transit = require(path.join(pasta, 'services/transit.js'));
const geo = require(path.join(pasta, 'utils/geometry.js'));

const PARES = [
  ['Almada centro → Cacilhas', [38.6790, -9.1569], [38.6876, -9.1487]],
  ['Almada centro → Costa da Caparica', [38.6790, -9.1569], [38.6413, -9.2358]],
  ['Seixal → Barreiro', [38.6406, -9.1015], [38.6630, -9.0726]],
  ['Oeiras → Cascais', [38.6913, -9.3100], [38.6979, -9.4215]],
  ['Amadora → Sintra', [38.7538, -9.2308], [38.8003, -9.3808]],
  ['Almada Pragal → Damaia (needs a change)', [38.6655, -9.1765], [38.7465, -9.2155]],
  ['Seixal → Montijo (needs a change)', [38.6406, -9.1015], [38.7066, -8.9738]],
];

const hora = (u) => new Date(u * 1000).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });

(async () => {
  for (const [nome, [la, lo], [lb, lob]] of PARES) {
    const origem = { latitude: la, longitude: lo };
    const destino = { latitude: lb, longitude: lob };
    console.log(`\n=== ${nome} ===`);
    try {
      const perto = await transit.nearbyStops(origem, 3);
      console.log('  stops near the origin:', (perto || []).map((p) => `${p.id} ${p.name} (${Math.round(p.meters)} m)`).join(' | '));
      if (perto && perto[0]) {
        const horas = await transit.arrivalsAt(perto[0].id);
        console.log(`  next at ${perto[0].id}:`, horas.map((h) => `${h.line}@${h.time}${h.live ? '*' : ''}`).join(' '));
        // The line journey a tap shows (`lineJourney`): stops ahead, times, where to get off.
        if (horas[0]) {
          try {
            const j = await transit.lineJourney(horas[0], perto[0].id, destino);
            console.log(`  journey of ${j.line} → ${j.headsign} (colour ${j.colour}, alight ${j.alightIndex}):`,
              j.stops.map((s) => `${s.time ?? '--:--'} ${s.name}`).join(' | '));
          } catch (erro) {
            console.log('  journey ERRO:', erro && erro.message);
          }
        }
      }
      const t0 = Date.now();
      const trajetos = await transit.planBusTrips(origem, destino);
      console.log(`  planBusTrips (${Date.now() - t0} ms):`, trajetos === null ? 'null (no stops)' : `${trajetos.length} trips`);
      for (const t of trajetos || []) {
        const via = t.change
          ? ` | change at ${t.change.at.name} ${hora(t.change.arrivesAt)}${t.change.boardAt.id !== t.change.at.id ? ` → ${t.change.boardAt.name} (${Math.round(t.change.walkMeters)} m)` : ''} → ${t.change.line} ${t.change.headsign} ${hora(t.change.departsAt)}`
          : '';
        console.log(`    ${t.line} ${t.headsign}: ${t.from.name} ${hora(t.departsAt)}${via} → ${t.to.name} ${hora(t.arrivesAt)} (${t.stops} stops${t.live ? ', live' : ''})`);
      }
      // The stops a started trip rides through (`carrisRide`, for the guide).
      const comRef = (trajetos || []).find((t) => t.ride && t.ride.source === 'carris');
      if (comRef) {
        try {
          const ate = comRef.change ? comRef.change.arrivesAt : comRef.arrivesAt;
          const r = await transit.carrisRide(comRef.ride, comRef.departsAt, ate);
          console.log(`  ride of ${comRef.line} (${r.length} stops):`,
            r.map((s) => `${s.name}@${s.unix ? hora(s.unix) : '?'}`).join(' > '));
          if (r.length >= 2) {
            const shape = await transit.carrisRideShape(comRef.ride, r[0].coordinates, r[r.length - 1].coordinates);
            const ends = shape.length ? `starts ${Math.round(geo.distanceMeters(shape[0], r[0].coordinates))} m, ends ${Math.round(geo.distanceMeters(shape[shape.length - 1], r[r.length - 1].coordinates))} m from the stops` : '';
            console.log(`  shape of the ride: ${shape.length} points ${ends}`);
          }
        } catch (erro) {
          console.log('  ride ERRO:', erro && erro.message);
        }
      }
    } catch (erro) {
      console.log('  ERRO:', erro && erro.message, erro && erro.status);
    }
  }
})();

// Diagnosis: why a pattern's trips do not match between a departure stop and
// an arrival stop. For each pattern common to both it shows how many arrivals
// each end has, the stop_sequence values and the first and last times — which
// is what matching by order needs to agree.
async function diagnostico() {
  const axios = require('axios');
  const get = async (id) => {
    try {
      const r = await axios.get(`https://api.carrismetropolitana.pt/v2/arrivals/by_stop/${id}`, { timeout: 30000 });
      return Array.isArray(r.data) ? r.data : [];
    } catch (e) {
      return [];
    }
  };
  const hora = (u) => new Date(u * 1000).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
  const pares = [
    ['Almada → Cacilhas', [38.6790, -9.1569], [38.6876, -9.1487]],
    ['Seixal → Barreiro', [38.6406, -9.1015], [38.6630, -9.0726]],
  ];
  for (const [nome, [la, lo], [lb, lob]] of pares) {
    console.log(`\n### Diagnosis ${nome}`);
    const saidas = (await transit.nearbyStops({ latitude: la, longitude: lo }, 3)) || [];
    const chegadas = (await transit.nearbyStops({ latitude: lb, longitude: lob }, 3)) || [];
    const porParagem = new Map();
    for (const s of [...saidas, ...chegadas]) porParagem.set(s.id, await get(s.id));
    const resumo = (lista, padrao) => {
      const d = lista.filter((p) => p.pattern_id === padrao);
      const seqs = [...new Set(d.map((p) => p.stop_sequence))];
      const horas = d.map((p) => p.scheduled_arrival_unix).filter((u) => typeof u === 'number').sort((a, b) => a - b);
      return `${d.length} passagens, seq ${seqs.join('/')}, ${horas.length ? hora(horas[0]) + '…' + hora(horas[horas.length - 1]) : '—'}`;
    };
    let comuns = 0;
    for (const s of saidas) {
      for (const c of chegadas) {
        const pa = new Set(porParagem.get(s.id).map((p) => p.pattern_id));
        const pc = new Set(porParagem.get(c.id).map((p) => p.pattern_id));
        for (const padrao of pa) {
          if (!pc.has(padrao)) continue;
          comuns += 1;
          if (comuns > 8) continue;
          console.log(`  ${padrao}: partida ${s.id} [${resumo(porParagem.get(s.id), padrao)}] | chegada ${c.id} [${resumo(porParagem.get(c.id), padrao)}]`);
        }
      }
    }
    console.log(`  patterns common to a departure and an arrival: ${comuns}`);
    const a = porParagem.get(saidas[0] && saidas[0].id) || [];
    if (a[0]) console.log('  exemplo de passagem:', JSON.stringify(a.find((p) => p.trip_id) || a[0]));
  }
}

setTimeout(() => {}, 0);
process.on('beforeExit', (() => {
  let feito = false;
  return () => {
    if (!feito) {
      feito = true;
      diagnostico();
    }
  };
})());

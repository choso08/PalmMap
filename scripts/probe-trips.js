// Corre o planeamento de trajetos da aplicação (`planBusTrips`, em
// src/services/transit.ts) contra a API verdadeira da Carris Metropolitana.
//
// Existe porque o ambiente onde o código é escrito não chega à API, e as
// simulações com dados inventados deixaram passar o que só os dados reais
// mostram. Corre no workflow dos horários, modo `trajetos`: o código é
// compilado para JavaScript e este ficheiro chama-o com pares de sítios reais.
const Module = require('module');
const path = require('path');

const original = Module._load;
Module._load = function (pedido, ...resto) {
  // O único módulo do Expo no caminho: a língua do telemóvel.
  if (pedido === 'expo-localization') {
    return { getLocales: () => [{ languageCode: 'pt', languageTag: 'pt-PT' }] };
  }
  return original.call(this, pedido, ...resto);
};

const pasta = process.argv[2];
const transit = require(path.join(pasta, 'services/transit.js'));

const PARES = [
  ['Almada centro → Cacilhas', [38.6790, -9.1569], [38.6876, -9.1487]],
  ['Almada centro → Costa da Caparica', [38.6790, -9.1569], [38.6413, -9.2358]],
  ['Seixal → Barreiro', [38.6406, -9.1015], [38.6630, -9.0726]],
  ['Oeiras → Cascais', [38.6913, -9.3100], [38.6979, -9.4215]],
  ['Amadora → Sintra', [38.7538, -9.2308], [38.8003, -9.3808]],
];

const hora = (u) => new Date(u * 1000).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });

(async () => {
  for (const [nome, [la, lo], [lb, lob]] of PARES) {
    const origem = { latitude: la, longitude: lo };
    const destino = { latitude: lb, longitude: lob };
    console.log(`\n=== ${nome} ===`);
    try {
      const perto = await transit.nearbyStops(origem, 3);
      console.log('  paragens perto da origem:', (perto || []).map((p) => `${p.id} ${p.name} (${Math.round(p.meters)} m)`).join(' | '));
      if (perto && perto[0]) {
        const horas = await transit.arrivalsAt(perto[0].id);
        console.log(`  próximas em ${perto[0].id}:`, horas.map((h) => `${h.line}@${h.time}${h.live ? '*' : ''}`).join(' '));
      }
      const t0 = Date.now();
      const trajetos = await transit.planBusTrips(origem, destino);
      console.log(`  planBusTrips (${Date.now() - t0} ms):`, trajetos === null ? 'null (sem paragens)' : `${trajetos.length} trajetos`);
      for (const t of trajetos || []) {
        console.log(`    ${t.line} ${t.headsign}: ${t.from.name} ${hora(t.departsAt)} → ${t.to.name} ${hora(t.arrivesAt)} (${t.stops} paragens${t.live ? ', tempo real' : ''})`);
      }
    } catch (erro) {
      console.log('  ERRO:', erro && erro.message, erro && erro.status);
    }
  }
})();

// Diagnóstico: porque é que as viagens de um padrão não emparelham entre uma
// paragem de partida e uma de chegada. Mostra, para cada padrão comum às duas,
// quantas passagens há em cada ponta, as stop_sequence e a primeira e a última
// hora — que é o que o emparelhamento pela ordem precisa que bata.
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
    console.log(`\n### Diagnóstico ${nome}`);
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
    console.log(`  padrões comuns a uma partida e uma chegada: ${comuns}`);
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

# PalmMap

Uma aplicação de mapas para Android, feita **só com serviços abertos e gratuitos**. Sem
Google Maps, sem chaves de API, sem contas.

É um projeto pessoal: nasceu para ser usado por uma pessoa, não para servir milhares. Isso
é uma decisão, não uma limitação — significa que as soluções simples chegam, e que os
serviços públicos mantidos por voluntários dão de sobra, desde que se seja bem-educado com
eles.

## Instalar

Vá às [Releases](../../releases) e descarregue o `PalmMap.apk` mais recente. Abra-o no
telemóvel e instale.

É a aplicação completa: instala por cima da anterior sem perder definições, favoritos nem
mapas já descarregados. Só precisa de autorizar a instalação de aplicações fora da Play
Store, no navegador ou no gestor de ficheiros que abrir o ficheiro.

> Em telemóveis Xiaomi/POCO costuma aparecer um aviso extra de segurança. Se a instalação
> for bloqueada, desligue a verificação automática de aplicações nas definições de
> segurança.

O APK é compilado só para **arm64-v8a**, que é o processador de qualquer telemóvel Android
atual.

## O que faz

**Mapa** — desenhado, imagem de satélite ou rede de transportes públicos, em tema claro ou
escuro conforme o telemóvel.

**Pesquisa** — moradas e negócios, com os últimos destinos e os sítios guardados à mão.

**Percursos** — de carro, a pé, de bicicleta ou de autocarro. Com caminhos alternativos,
paragens pelo caminho, e a opção de evitar portagens.

**Navegação** — segue a posição, anuncia as manobras em voz alta, recalcula se sair do
caminho, avisa de radares, mantém o ecrã aceso e poupa bateria nas retas longas.

**Transportes públicos** — as paragens perto de si com as horas a que passa o próximo
autocarro, em tempo real. E trajetos de autocarro de um ponto ao outro. Na Área
Metropolitana de Lisboa.

**Mapas offline** — países inteiros guardados no telemóvel, que funcionam sem rede nenhuma,
a qualquer zoom e em sítios onde nunca esteve.

**Fita métrica** — distâncias e áreas medidas em cima do mapa, como no Google Earth.

## Mapas sem rede

Nas definições, em "Mapas de países", escolhe-se um país e ele descarrega. A partir daí
esse país funciona em modo de avião: o GPS não precisa de Internet, e o mapa passa a vir do
ficheiro em vez de vir da rede.

Portugal continental são 325 MB; São Tomé e Príncipe são 2 MB. A diferença para os mapas
normais é que estes trazem **geometria** em vez de imagens — é por isso que um país inteiro
cabe num ficheiro só.

| Já publicados |
| --- |
| Portugal continental, Madeira, Açores, São Tomé e Príncipe, Cabo Verde, Guiné-Bissau, Espanha, Itália, Alemanha, Reino Unido, Irlanda, Países Baixos, Bélgica, Luxemburgo, Suíça, Áustria |

O catálogo tem 90 regiões do mundo todo; geram-se a pedido, com o workflow "Gerar mapa
offline".

## O que isto não faz, e porquê

Vale a pena dizer com todas as letras, porque em quase todos os casos não é falta de
trabalho — é falta de dados abertos.

**Trânsito.** Não há. É o que separa mesmo o Google Maps de tudo o resto, e os dados dele e
do Waze vêm dos telemóveis dos próprios utilizadores, aos milhões. A TomTom e a HERE vendem
os deles. Não há aqui uma solução engenhosa por encontrar.

**Preço das portagens.** Em Portugal não existe fonte aberta com os valores. A aplicação
evita-as se lhe pedir, mas não lhe diz quanto custam.

**Radares móveis.** Não existem em mapa nenhum — mudam de sítio todos os dias. Os fixos, os
de semáforo e o controlo de velocidade média são avisados, a partir do OpenStreetMap. É uma
ajuda, não é uma garantia.

**Horários fora de Lisboa.** Só a Área Metropolitana de Lisboa tem uma fonte aberta com
horários em tempo real. No resto do país cada operador guarda os seus.

**Comboio, metro e barco.** Aparecem as estações no mapa, mas ainda não os horários. O
Fertagus e a CP publicam-nos em GTFS estático, que é um caminho por percorrer; o Metro Sul
do Tejo não publica nada.

**Satélite ao pormenor fora de Portugal.** O Sentinel-2 vê a Terra a 10 metros por pixel, e
é o melhor que há de graça e à escala mundial. Em Portugal há as ortofotos do Estado, que
vêem a menos de um metro.

## Como está feito

| Para quê | Escolha |
| --- | --- |
| Base | React Native 0.86 + Expo SDK 57, em TypeScript |
| Mapa | [MapLibre](https://maplibre.org/) — livre, sem qualquer ligação ao Google |
| Mapa (tiles) | [OpenStreetMap](https://www.openstreetmap.org/), [CARTO](https://carto.com/) no tema escuro |
| Satélite | [Sentinel-2 cloudless da EOX](https://s2maps.eu/), e as [ortofotos da DGT](https://www.dgterritorio.gov.pt/) em Portugal |
| Transportes (mapa) | [ÖPNVKarte](https://www.öpnvkarte.de/), do memomaps.de |
| Pesquisa | [Nominatim](https://nominatim.org/) |
| Negócios e radares | [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) |
| Percursos | [OSRM](https://project-osrm.org/) nos servidores da [FOSSGIS](https://routing.openstreetmap.de/) |
| Horários | [API aberta da Carris Metropolitana](https://github.com/carrismetropolitana/api) |
| Mapas offline | [Protomaps](https://protomaps.com/) (PMTiles), recortados do mapa mundial |

Não há servidores próprios. O APK compila-se num workflow do GitHub Actions, e os mapas
offline geram-se noutro — nenhum dos dois precisa de computador nem de conta paga.

## Créditos

Os dados do mapa são de quem contribui para o **OpenStreetMap**, sob licença
[ODbL](https://www.openstreetmap.org/copyright). A imagem de satélite é **Sentinel-2
cloudless da EOX IT Services GmbH**, com dados Copernicus Sentinel modificados. As
ortofotos de Portugal são da **Direção-Geral do Território**. O mapa dos transportes é
**memomaps.de**, sob CC-BY-SA. Os percursos são calculados pelo **OSRM** em servidores da
**FOSSGIS**. Os horários dos autocarros vêm da **Carris Metropolitana**.

Nada disto cobra nada a este projeto. Se algum destes serviços lhe for útil, considere
contribuir para eles.

## Desenvolvimento

```bash
npm install
npx expo start
```

O MapLibre traz código nativo, por isso **o Expo Go não serve** — é preciso uma
*development build*:

```bash
npx expo run:android        # com o Android Studio instalado
```

Antes de dar trabalho por terminado:

```bash
npx tsc --noEmit
```

O [`CLAUDE.md`](CLAUDE.md) explica o porquê de cada decisão do projeto, incluindo os erros
já cometidos e o que se aprendeu com eles. Se vai mexer no código, comece por aí.

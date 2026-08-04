# CLAUDE.md — PalmMap

Guia para o Claude Code e outros assistentes de IA que trabalhem neste repositório.
Está escrito em português de Portugal e em linguagem simples, para poder ser lido tanto
por uma pessoa como por um assistente.

## Onde é que isto vai — ler primeiro

Se estás a pegar neste projeto agora, esta secção diz-te em que ponto ele está. O resto do
ficheiro explica o porquê de cada coisa.

**O que está feito e confirmado no telemóvel:** a aplicação de mapas funciona. Mapa,
pesquisa, negócios, percursos, navegação, definições, favoritos, satélite. E o **mapa
offline também** — Portugal e São Tomé foram vistos a desenhar em modo de avião, com os
nomes dos sítios, o que era a maior incógnita do projeto e deixou de o ser.

**Três coisas a saber antes de mexer:**

1. **A última compilação é a APK 11, versão 6.5.0.** O autor pediu: **compilar só quando
   ele disser.** Não lançar o workflow sem pedido.
2. **Os mapas estão publicados na etiqueta `mapas`**: Portugal continental, Madeira,
   Açores, São Tomé e Príncipe, Cabo Verde, Guiné-Bissau, Espanha, França (por gerar),
   Itália, Alemanha, Reino Unido, Irlanda, Países Baixos, Bélgica, Luxemburgo, Suíça e
   Áustria. **A França falhou** por passar os 2 GB que o GitHub aceita — para a ter, baixar
   o `maxzoom` dela para 12 em `map-regions.json` e correr o workflow outra vez.
3. **Ao mexer no mapa offline, testar sempre com os dados desligados.** Se o mapa guardado
   não abrir, a aplicação recua sozinha para os tiles da Internet e parece que está tudo
   bem — uma avaria passa despercebida com rede.

**O que fica por confirmar no telemóvel:** o ecrã aceso durante a navegação e os anúncios
de voz depois do filtro das manobras.

## Objetivo do projeto

O **PalmMap** é uma aplicação de mapas para telemóvel, pensada como alternativa ao Google
Maps, construída apenas com serviços abertos e gratuitos.

**É um projeto de uso pessoal** — para o autor e, quando muito, mais algumas pessoas. Não
se destina a servir milhares de utilizadores. Isto é importante: significa que as soluções
simples e gratuitas chegam perfeitamente, e que não vale a pena complicar com
infraestrutura própria. Sempre que houver dúvida entre "o mais simples" e "o mais
escalável", escolhe o mais simples.

A regra central do projeto: **nada de Google Maps, nada de chaves de API pagas.** Todos os
dados vêm de fontes abertas.

Houve a ideia de **funcionar no Android Auto** (o ecrã do carro), mas essa parte está
**pausada por decisão do autor** — ver a secção "Android Auto (pausado)" mais abaixo. Não
começar trabalho nessa direção sem o autor voltar a pedir.

## Estado atual — o que já existe

**A aplicação foi confirmada a funcionar num telemóvel Android real.** O que está feito:

- Projeto Expo (SDK 57) com TypeScript.
- Mapa com MapLibre: tiles do OpenStreetMap em modo claro, do CARTO em modo escuro, e
  imagem de satélite Sentinel-2 (EOX), com botão para trocar.
- Pesquisa de moradas e negócios pelo Nominatim, com as regras de utilização cumpridas.
- Negócios pela Overpass: botões por categoria e pinos automáticos na área visível.
- Toque longo no mapa larga um pino em qualquer ponto, com a morada obtida por pesquisa
  inversa no Nominatim, e permite traçar o percurso até lá.
- Cálculo de percurso pelo OSRM, com distância, tempo estimado e lista de instruções.
- Navegação em tempo real: segue a posição, mostra a manobra seguinte com a distância,
  lê-a em voz alta e recalcula o percurso se se sair dele.
- Localização por GPS, com a aplicação a continuar utilizável se a pessoa recusar.
- Tema claro/escuro seguido automaticamente a partir das definições do telemóvel.
- Ecrã de definições com sete opções — ver "Definições".
- Sítios guardados (favoritos), no telemóvel — aparecem na pesquisa e funcionam sem rede.
- Cache do mapa com tamanho ajustável e botão para apagar.
- Mapa offline: São Tomé e Príncipe vem dentro da aplicação e os outros países
  descarregam-se a pedido — **escrito mas ainda não visto a funcionar**, ver a secção
  própria.

**Confirmado no telemóvel:** o mapa, a pesquisa, os botões de categoria e as margens do
ecrã. **Por confirmar:** a navegação em tempo real, a voz, os percursos a pé e de
bicicleta, os resultados da Overpass, o tema escuro e a imagem de satélite. Compila e os
tipos estão verificados, mas não foi tudo experimentado — não digas que "funciona" sem ter
sido visto a funcionar.

Também não foi possível testar as consultas à Overpass contra o serviço real, porque o
ambiente de desenvolvimento usado bloqueia o acesso. Se os negócios não aparecerem, é o
primeiro sítio onde procurar.

O `eas.json` já está escrito, com três perfis de compilação (`development`, `preview` e
`production`) — ver "Instalar no telemóvel". Há também dois workflows do GitHub Actions:
um que compila o APK e o publica numa Release, e outro que gera os mapas offline. Nenhum
precisa de computador nem de conta Expo.

**Ressalva sobre a navegação:** o motor é simples de propósito. A posição é encaixada no
ponto mais próximo da linha do percurso, em vez de projetada sobre o troço — com o
`overview=full` do OSRM os pontos vêm de poucos em poucos metros, por isso a diferença não
se nota. Não há indicações de faixa de rodagem nem estimativa com trânsito.

O documento original do projeto tinha sido guardado como um PDF chamado `CLAUDE.md`. Foi
convertido para este ficheiro Markdown e o PDF passou para `docs/project-brief-original.pdf`.

## Pequeno glossário

Termos que aparecem ao longo do ficheiro, explicados de forma direta:

| Termo | O que é |
| --- | --- |
| **OpenStreetMap (OSM)** | Um mapa mundial feito de forma colaborativa e livre, o equivalente aberto ao mapa do Google. |
| **Tiles** | Os quadradinhos que, juntos, formam o mapa que se vê no ecrã. Podem ser imagens já desenhadas ou geometria por desenhar. |
| **Nominatim** | Serviço que transforma uma morada escrita ("Rua Augusta, Lisboa") em coordenadas de latitude e longitude. É o motor de pesquisa do OpenStreetMap. |
| **OSRM** | Serviço que calcula o caminho entre dois pontos e devolve o percurso e a distância. |
| **Overpass** | Serviço que permite perguntar ao OpenStreetMap "que restaurantes há aqui à volta?". É o que está por trás dos negócios. |
| **Expo** | Conjunto de ferramentas que simplifica muito criar e testar aplicações em React Native. |
| **APK** | O ficheiro que se instala diretamente num telemóvel Android, sem passar pela Play Store. |
| **API** | A forma como um programa pede informação a um serviço na Internet. |
| **PMTiles** | Um mapa inteiro dentro de um único ficheiro. Serve para guardar países no telemóvel sem descarregar milhares de imagens. |
| **Tiles vetoriais** | Tiles que trazem a geometria (esta linha é uma estrada, este polígono é água) em vez da imagem pronta. Ocupam muito menos, mas é preciso dizer-lhes as cores. |
| **Estilo** | O ficheiro que diz como desenhar os tiles vetoriais: que cor tem a água, que espessura tem cada estrada, que tamanho tem cada nome. |
| **Glifos** | Os tipos de letra, num formato que o mapa consegue usar para escrever os nomes das ruas. |

## Tecnologias

| Para quê | Escolha |
| --- | --- |
| Base da aplicação | React Native 0.86 + Expo SDK 57 |
| Linguagem | TypeScript |
| Componente do mapa | `@maplibre/maplibre-react-native` — ver "Decisão importante" |
| Localização (GPS) | `expo-location` |
| Guardar no telemóvel | `@react-native-async-storage/async-storage` e `expo-file-system` |
| Ficheiros dentro do APK | `expo-asset` |
| Voz | `expo-speech` |
| Ecrã aceso a conduzir | `expo-keep-awake` |
| Pedidos à Internet | `axios` |
| Mapa (tiles) | OpenStreetMap |
| Pesquisa de moradas | Nominatim (`https://nominatim.openstreetmap.org`) |
| Cálculo de percursos | OSRM (`https://router.project-osrm.org`) |
| Mapas offline | Protomaps (PMTiles), recortados do mapa mundial |

A plataforma alvo é o **Android**. Nada impede o iOS, mas as permissões e a criação do
ficheiro de instalação descritas aqui são específicas do Android.

## Decisão importante: qual o componente do mapa — decidida

**O projeto usa o MapLibre** (`@maplibre/maplibre-react-native`). Fica aqui o porquê, para
não se voltar atrás sem se perceber o que está em causa.

O documento original indicava a biblioteca `react-native-maps`. **O problema:** no Android,
essa biblioteca funciona por cima do Google Maps e, na prática, costuma exigir uma chave do
Google para sequer arrancar — mesmo quando só queremos desenhar os tiles do OpenStreetMap
por cima. Ou seja, entra em conflito direto com o objetivo do projeto.

O MapLibre é uma biblioteca de mapas completamente livre, sem qualquer ligação ao Google. O
documento original já a referia como uma das opções possíveis.

Como argumento adicional: se um dia se retomar o Android Auto, o MapLibre também tem uma
biblioteca nativa para Android, o que permitiria ao telemóvel e ao carro partilharem o
mesmo motor de mapa e a mesma fonte de tiles. Não é a razão principal, mas é mais um ponto
a favor.

## ⚠️ O Expo Go não serve para este projeto

O MapLibre traz código nativo que **não vem incluído na aplicação Expo Go**. Ou seja,
`npx expo start` sozinho, com o Expo Go instalado no telemóvel, mostra a barra de pesquisa
mas não consegue desenhar o mapa.

É preciso uma **development build** — uma versão da aplicação compilada com o código nativo
lá dentro. Faz-se uma vez, e depois é como o Expo Go: muda-se o código e recarrega.

```bash
# Opção A: compilar no próprio computador (exige o Android Studio instalado)
npx expo run:android

# Opção B: compilar na nuvem, com a Expo (exige conta Expo, gratuita)
npx eas-cli build -p android --profile development
```

Isto não é sinal de que algo está mal configurado — é simplesmente como funciona qualquer
biblioteca com código nativo. O projeto continua em Expo "gerido": não há pasta `android/`
no repositório, é o Expo que a gera quando compila.

## Comandos

### Desenvolvimento

```bash
npm install                 # Instalar as dependências
npx expo start              # Arrancar o servidor de desenvolvimento
npx expo run:android        # Compilar e correr num emulador ou telemóvel Android
```

### Verificar erros de tipos

```bash
npx tsc --noEmit
```

**Correr sempre isto antes de dar trabalho por terminado.** É a única verificação
automática que o projeto tem, e como grande parte do código não pode ser experimentada no
ambiente de desenvolvimento (ver a seguir), é o que apanha os erros antes de irem parar ao
telemóvel.

Não está definida nenhuma ferramenta de testes nem de formatação automática. Para um
projeto pessoal deste tamanho, não é preciso — mas se acrescentares alguma, documenta-a
aqui.

### O que não dá para testar aqui

O ambiente de desenvolvimento não tem acesso livre à Internet. Estes serviços estão
bloqueados e **não vale a pena tentar**:

- `overpass-api.de` — os negócios nunca podem ser testados aqui
- `router.project-osrm.org` — os percursos também não
- `build.protomaps.com` — o mapa mundial só se recorta no GitHub Actions
- `api.expo.dev`, `dl.google.com` — compilar localmente não é possível

Tudo o que precise destes serviços vai para um workflow do GitHub Actions. É por isso que
os dois workflows existem: não é gosto por automatização, é a única forma.

## Instalar no telemóvel

Não é preciso Android Studio nem publicar na Play Store: o workflow do GitHub compila o APK
e publica-o numa Release. Basta ir ao separador "Actions", escolher o workflow de compilar
o APK e carregar em "Run workflow".

**O autor pediu que só se compile quando ele disser.** Não lançar o workflow por iniciativa
própria, mesmo depois de mudanças grandes.

Em alternativa, com uma conta Expo (gratuita), os perfis de compilação estão em `eas.json`:

| Perfil | Para quê |
| --- | --- |
| `preview` | A aplicação a sério, autónoma. Instala-se e usa-se. Para mudar o código, compila-se de novo. |
| `development` | Instala-se uma vez e depois liga-se ao computador com `npx expo start`. O código recarrega sem compilar outra vez. É o que se usa enquanto se está a desenvolver. |

O APK é compilado só para **arm64-v8a**, o processador de qualquer telemóvel Android
atual. Incluir as quatro arquiteturas triplicava o tamanho sem proveito nenhum, e um
ficheiro enorme é mais fácil de chegar truncado — que é o que dá o erro "ocorreu um
problema ao analisar o pacote" ao instalar.

Cada compilação recebe um `versionCode` próprio, tirado do número da execução do workflow.
Sem isso, o Android recusa-se a instalar por cima de uma versão com o mesmo número.

O workflow verifica o APK antes de o publicar: integridade do arquivo, identificação
(pacote, `minSdk`, arquiteturas) e esquemas de assinatura. Assim um ficheiro estragado é
apanhado na compilação e não só no telemóvel.

```bash
# Com a conta Expo, em alternativa ao workflow
npx eas-cli login
npx eas-cli build -p android --profile preview
```

Notas para instalar em Android:

- É preciso autorizar a instalação de aplicações fora da Play Store, no navegador ou no
  gestor de ficheiros que abrir o APK.
- Em telemóveis Xiaomi/POCO (HyperOS ou MIUI) costuma aparecer um aviso extra de segurança.
  Se a instalação for bloqueada, desligar a verificação automática de aplicações nas
  definições de segurança.
- A aplicação precisa de Internet para os tiles do mapa e para o Nominatim e o OSRM. Sem
  rede, só funcionam as zonas já vistas e os favoritos — e, quando essa parte estiver
  pronta, os países descarregados.

(Isto serve para a aplicação de telemóvel. Para o ecrã do carro o APK não chegaria — foi
uma das razões para o Android Auto ficar pausado.)

## Estrutura do projeto

```text
/
├── assets/
│   ├── (ícones e imagem de arranque, gerados por script)
│   ├── mapas/saotome.pmtiles   # O mapa que viaja dentro da aplicação
│   └── glifos/*.pbf            # Tipos de letra com que o mapa escreve
├── scripts/
│   └── generate-icons.py   # Desenha o logo e escreve os ficheiros de assets/
├── docs/
│   └── project-brief-original.pdf
├── src/
│   ├── components/         # Peças de interface
│   │   ├── MapView.tsx     # Mapa, pinos dos negócios, percurso e destino
│   │   ├── SearchBar.tsx   # Barra de pesquisa (Nominatim e favoritos)
│   │   ├── CategoryBar.tsx # Botões "Restaurantes", "Farmácias", …
│   │   ├── PlaceSheet.tsx  # Ficha de um negócio, com horário e telefone
│   │   ├── RoutePanel.tsx  # Painel inferior com a distância e o tempo estimado
│   │   ├── StepsList.tsx   # Lista das instruções do percurso
│   │   ├── Reveal.tsx      # Faz um painel aparecer e sair a desvanecer
  │   ├── NavigationPanel.tsx # Ecrã de navegação, com a manobra seguinte
│   │   ├── OfflineMaps.tsx # Lista de países para descarregar, com o tamanho
│   │   └── SettingsSheet.tsx # Ecrã de definições
│   ├── services/           # Ligação aos serviços externos
│   │   ├── config.ts       # Endereços, User-Agent e limites — tudo num sítio só
│   │   ├── rateLimit.ts    # Fila que espaça os pedidos, partilhada pelos serviços
│   │   ├── favourites.ts   # Sítios guardados no telemóvel
│   │   ├── location.ts     # Gere o GPS do telemóvel
│   │   ├── nominatim.ts    # Pesquisa por nome
│   │   ├── overpass.ts     # Negócios por categoria e por área do mapa
│   │   ├── osrm.ts         # Cálculo de percursos e instruções
│   │   ├── offlineMap.ts   # Instala, descarrega e apaga os mapas de países
│   │   ├── vectorStyle.ts  # Como se desenha um mapa guardado: cores e espessuras
│   │   └── tiles.ts        # Estilos do mapa (claro/escuro/satélite) e cache
│   ├── types/              # Definições de tipos do TypeScript
│   │   ├── geo.ts          # Tipos usados pela aplicação (Coordinates, Place, Route)
│   │   ├── nominatim.ts    # Formato exato da resposta do Nominatim
│   │   ├── overpass.ts     # Formato exato da resposta da Overpass
│   │   └── osrm.ts         # Formato exato da resposta do OSRM
│   ├── utils/
│   │   ├── format.ts       # Distâncias e durações em texto legível
│   │   ├── geometry.ts     # Distâncias no mapa e posição ao longo do percurso
│   │   ├── voice.ts        # Leitura das instruções em voz alta
│   │   ├── categories.ts   # Categorias de negócios e tradução das etiquetas OSM
│   │   └── maneuvers.ts    # Traduz as manobras do OSRM para português
│   ├── theme.ts            # Cores em versão clara e escura
│   └── settings.tsx        # Definições guardadas e o gancho useTheme()
├── App.tsx                 # Ponto de entrada: junta tudo e guarda o estado
├── AGENTS.md               # Aponta para este ficheiro
├── app.json                # Configuração do Expo e permissões do Android
├── eas.json                # Perfis de compilação para gerar o APK
├── map-regions.json        # Que países se recortam para offline, e com que detalhe
├── metro.config.js         # Faz o empacotador reconhecer .pmtiles e .pbf
├── .github/workflows/
│   ├── build-apk.yml       # Compila o APK e publica-o numa Release
│   └── build-map.yml       # Recorta os mapas dos países e publica-os numa Release
├── package.json
└── tsconfig.json
```

Repara na separação dentro de `src/types/`: `nominatim.ts` e `osrm.ts` descrevem o que os
serviços devolvem exatamente, tal como está na documentação deles; `geo.ts` descreve o que
a aplicação usa. Os serviços fazem a tradução de um para o outro. Assim, se um dia se
trocar o OSRM por outro serviço, só muda a tradução — o resto da aplicação não dá por nada.

**Regra prática:** todos os pedidos à Internet ficam dentro de `src/services/`. Os
componentes do ecrã nunca chamam o `axios` diretamente — pedem as coisas aos serviços.
Assim, as regras de boa utilização das APIs (mais abaixo) ficam todas concentradas num
único sítio, em vez de espalhadas pelo código.

## Orientações de arquitetura

### 1. O mapa

- **Nunca usar uma chave de API do Google.** É a regra central do projeto.
- O estilo do mapa está definido em `src/services/tiles.ts`, com os tiles a virem de
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Nota: usa-se o endereço direto, sem os
  subdomínios `a.`/`b.`/`c.` que o documento original indicava — essa forma antiga está
  desaconselhada pelo próprio OpenStreetMap.
- O `User-Agent` dos pedidos de tiles é registado no arranque, em `App.tsx`, através do
  `TransformRequestManager` do MapLibre. É uma exigência das regras de utilização — é
  dizer-lhes quem somos em vez de aparecer como anónimo.
- A atribuição ao OpenStreetMap fica visível no mapa (`attribution` no componente `Map`).
  É exigida pela licença dos dados, não é opcional.

### 2. Permissões de localização (Android)

- O ficheiro `app.json` declara as permissões de GPS `ACCESS_FINE_LOCATION` e
  `ACCESS_COARSE_LOCATION`, em nome completo (`android.permission.…`). O plugin do
  `expo-location` acrescenta as mesmas — escrevê-las na mesma grafia evita ficarem
  duplicadas na aplicação final.
- A permissão pede-se **durante a utilização**, através do `expo-location`
  (`Location.requestForegroundPermissionsAsync()`), em `src/services/location.ts`.
- Se a pessoa recusar, a aplicação não rebenta: `getCurrentPosition()` devolve `null` e o
  ecrã continua a dar para ver o mapa e pesquisar moradas, apenas sem a posição atual.
  Ao mexer aqui, manter este comportamento.

### 3. O logo

- O logo é um pin de mapa branco com uma palmeira recortada lá dentro, sobre azul — junta
  o "Map" e o "Palm" do nome.
- Os ficheiros em `assets/` **não se editam à mão**: são desenhados por
  `scripts/generate-icons.py`. Para mudar cores ou proporções, mexe-se no script e
  corre-se outra vez (`pip install Pillow && python3 scripts/generate-icons.py`).
- O Android usa o ícone adaptativo (fundo e frente separados) e corta-o num círculo, por
  isso o pin fica recolhido em relação às bordas. Ao mexer, confirmar que nada fica
  cortado.

### 4. Definições

- As definições vivem em `src/settings.tsx`: um contexto que envolve toda a aplicação,
  guardado no telemóvel com o `AsyncStorage`.
- São sete:

  | Definição | O que faz |
  | --- | --- |
  | `appearance` | Aspeto: automático, claro ou escuro |
  | `travelMode` | Meio de transporte: carro, a pé ou bicicleta |
  | `timeAdjustment` | Correção do tempo estimado: 1×, 1,25×, 1,5× ou 2× |
  | `cacheSize` | Tamanho do mapa guardado: 100 MB, 250 MB, 500 MB ou 1 GB |
  | `showPlacesOnMap` | Marcar os negócios sozinho, à medida que se navega |
  | `voiceGuidance` | Ler as instruções em voz alta durante a navegação |
  | `mapType` | Mapa desenhado ou imagem de satélite |

- Ao acrescentar uma definição nova: juntar ao tipo `Settings`, dar-lhe um valor em
  `DEFAULT_SETTINGS` e mostrá-la no `SettingsSheet`. Os valores guardados são fundidos com
  os de origem ao arrancar, por isso versões antigas não rebentam.
- **Ressalva do meio de transporte:** o endereço do OSRM aceita os três perfis, mas o
  servidor público de demonstração pode ter só o de carro instalado e devolver na mesma o
  percurso de carro. Não foi possível confirmar — o ecrã de definições avisa disso.

### 5. O tempo estimado e o piso das estradas

O OSRM calcula o tempo a partir do tipo de estrada e da etiqueta `surface` do
OpenStreetMap. O perfil de carro limita a velocidade conforme o piso — `surface=unpaved`
fica travado a 40 km/h, e a terra batida a menos ainda.

**O problema é maior do que parece.** Mesmo com a etiqueta preenchida, os 40 km/h que o
OSRM assume para piso não alcatroado são rápidos de mais para as estradas de terra de São
Tomé, onde na prática se anda a 20. Confirmou-se que essas estradas já aparecem marcadas
como não alcatroadas no OpenStreetMap — o tracejado no mapa é isso mesmo — e ainda assim o
tempo vem cerca de 60% abaixo do real. Ou seja, melhorar os dados **não chega**.

Há duas formas de corrigir, e não se excluem:

1. **A correção manual nas definições** (`timeAdjustment`), que multiplica o tempo por
   1, 1,25, 1,5 ou 2. É grosseira — aplica-se a todos os percursos por igual — mas é a
   única que resolve o caso de São Tomé, onde nem os dados certos bastam.
2. **Preencher a etiqueta no OpenStreetMap** onde faltar (`surface=ground`, `unpaved`…).
   Ajuda noutros sítios e vale para toda a gente, mas não substitui a correção manual em
   estradas muito más.

O fator é aplicado **onde o tempo é mostrado** (`useTimeFactor()`), e não dentro do
serviço: o `Route` continua a guardar o que o OSRM respondeu, sem retoques.

### 6. Imagem de satélite

- A fonte é o **Sentinel-2 cloudless da EOX**: um mosaico do satélite Sentinel-2, do
  programa Copernicus, com as nuvens removidas. É livre, sem chaves de API, com licença
  Creative Commons e gratuito para uso não comercial — encaixa nas regras do projeto.
- **A atribuição é obrigatória** e está no `attribution` do estilo. Não a tirar.
- **O detalhe tem um limite físico:** o Sentinel-2 vê a Terra a 10 metros por pixel, o que
  corresponde ao zoom 14. Daí o `maxzoom: 14` — acima disso o MapLibre amplia o que tem,
  em vez de pedir tiles que não trazem mais nada. Vê-se a costa, a floresta, as roças e os
  terrenos abertos; não se veem casas uma a uma. **Satélite ao pormenor é produto pago em
  todo o lado**; não há alternativa livre, por isso não vale a pena procurar.
- A imagem de satélite **não traz nomes nem estradas desenhadas** — é só fotografia. O
  percurso e os pinos continuam a aparecer, porque são camadas nossas. Um modo híbrido a
  sério (satélite com as ruas por cima) só é possível com o mapa vetorial.

### 7. Offline — o que é permitido e o que não é

Esta secção é sobre a regra. A parte prática dos países está na secção seguinte.

**Descarregar uma área de tiles do OpenStreetMap para usar sem rede é proibido** pelas
regras deles. Está lá escrito com todas as letras: funcionalidades do tipo "descarregar
esta cidade para uso offline" dependem de ir buscar tiles à frente, e isso é considerado
descarregamento em massa. Quem o faz é bloqueado sem aviso.

Por isso **não se usa o `OfflineManager.createPack()`** com os tiles do OpenStreetMap nem
do CARTO. Não é uma limitação técnica — é uma regra que este projeto respeita.

A distinção que interessa, e que se deve manter sempre que se mexer nisto:

> **Guardar o que a pessoa viu é cache, e é legítimo. Ir buscar à frente o que ela ainda
> não viu é descarregamento em massa, e não se faz.**

O que se faz, e é legítimo:

- **Teto de zoom nos tiles.** O estilo pede tiles até ao nível 17 (`MAX_TILE_ZOOM`); acima
  disso o MapLibre amplia os que já tem. Isto resolve metade do problema do offline: os
  níveis mais aproximados deixam de precisar de tiles próprios, e passam a funcionar a
  partir dos que já estão guardados. De caminho, tira cerca de dezasseis vezes o peso posto
  no servidor do OpenStreetMap, porque cada nível a mais quadruplica o número de tiles.
- **Cache do que já se viu.** O MapLibre guarda os tiles que a pessoa chegou mesmo a ver.
  O tamanho é uma definição (100 MB a 1 GB), aplicada por `setMapCacheSize()`, e há um
  botão para apagar. **Não há como definir validade** — a API do MapLibre só aceita
  tamanho, não tempo. Na prática é o tamanho que manda: quando enche, esquece primeiro o
  que há mais tempo não se vê. Se alguém pedir "guardar durante um mês", é isto que se
  explica.
- **Mapas de países em PMTiles.** É a via legítima para ter mesmo um país inteiro sem
  rede — ver a secção seguinte.
- **Favoritos guardados no telemóvel.** Ficam no `AsyncStorage`, por isso estão sempre
  disponíveis. A pesquisa mostra-os enquanto não se escreve nada.

**A limitação da cache:** só tem os níveis de zoom por onde se passou. Percorrer a ilha
afastado não guarda o que é preciso para navegar aproximado. O teto de zoom acima reduz
isto a um só nível útil (o 17), mas não o elimina — quem quiser uma zona utilizável sem
rede tem de a ter visto ao zoom a que a vai usar. É precisamente esta limitação que os
mapas de países vêm resolver.

### 8. Mapas de países (PMTiles)

#### A ideia

Em vez de milhares de imagens, um país inteiro cabe num **único ficheiro** com a geometria
do mapa. O Protomaps publica o planeta inteiro em PMTiles, todos os dias, **precisamente
para ser recortado assim** — por isso não há aqui nenhum problema de regras, ao contrário
dos tiles do OpenStreetMap. O `pmtiles extract` lê só os pedaços de que precisa: são
dezenas de pedidos, não milhares.

A diferença de tamanho é enorme, porque é geometria em vez de imagens: São Tomé e Príncipe
inteiro ocupa **2 MB**, quando em tiles de imagem daria uns 240 MB.

#### São Tomé vem dentro da aplicação

Com 2 MB, o país inteiro cabe no APK. **Está lá desde o primeiro arranque**: não é preciso
descarregar nada, não é preciso rede nenhuma, e não há passo nenhum a dar. Foi isto que o
autor pediu — o mapa "já lá", não um mapa que se vai buscar.

Os outros países são grandes de mais para isso (só Portugal continental são 325 MB) e
continuam a descarregar-se a pedido. Os dois caminhos acabam na mesma pasta com um ficheiro
de identificação ao lado, e a partir daí **o resto do código não sabe de onde vieram**.

Dentro do APK os ficheiros não têm um caminho que o MapLibre consiga abrir, por isso são
copiados uma vez para a pasta da aplicação, no primeiro arranque
(`installBundledAssets()`). São 2,4 MB com os tipos de letra e só acontece uma vez.

#### As peças

- **`assets/mapas/saotome.pmtiles`** — o mapa que viaja dentro da aplicação. Ao substituí-lo,
  atualizar o `bytes` da constante `BUNDLED`, que está escrito à mão de propósito: sem rede
  não há manifesto para consultar.
- **`assets/glifos/*.pbf`** — os tipos de letra, em Noto Sans normal e médio. Dois blocos
  de 256 caracteres cada, que é quanto o português precisa. Vieram do
  `protomaps/basemaps-assets`, com licença SIL Open Font.
- **`metro.config.js`** — sem ele, o empacotador não reconhece `.pmtiles` nem `.pbf` e a
  compilação falha.
- **`src/services/vectorStyle.ts`** — o estilo: as cores, as espessuras e os zooms. Ver
  abaixo.
- **`src/services/offlineMap.ts`** — instala o que vem incluído, descarrega o resto, e diz
  que região cobre uma dada posição (`regionAt`).
- **`src/components/OfflineMaps.tsx`** — a lista nas definições. São Tomé aparece como
  "vem com a aplicação" e não se pode apagar.
- **`map-regions.json`** — o **catálogo**: 90 regiões, do mundo todo. Estar aqui não quer
  dizer que já esteja gerado; a lista que a aplicação mostra é a do `mapas.json` da
  Release, ou seja só o que já foi gerado.
- **`.github/workflows/build-map.yml`** — gera as regiões que se lhe indicar. **Acrescenta,
  não substitui:** cada corrida junta-se ao que já lá está, senão gerar França apagava
  Portugal. Cada região é enviada e apagada do disco logo a seguir, porque o servidor tem
  uns 20 GB e há países que dão mais de 1 GB cada.

#### Como se liga sozinho

Não há definição nenhuma para isto, de propósito. Quando o centro do mapa entra num país
cujo mapa está guardado, passa-se a usar o ficheiro; quando sai, voltam os tiles da
Internet. A comparação é pelo `id` da região, para o estilo só ser trocado quando muda
mesmo de país — trocar de estilo recarrega o mapa, e fazê-lo a cada arrastar do dedo seria
insuportável.

A imagem de satélite manda sempre: é a única coisa que não tem substituto guardado.

#### Ao longe o país não chega — e isso já esteve à vista

Um país guardado **não traz o mundo**. O `pmtiles extract` guarda os tiles que tocam nas
fronteiras dele, a todos os níveis — por isso ao zoom 1 só lá está o quarto do planeta onde
o país cai, e ao zoom 3 uns quantos quadrados à volta. Afastar o mapa para lá disso deixava
o ecrã maior do que aquilo que o ficheiro tem: via-se o Atlântico desenhado e o resto do
ecrã liso, em bege. Não era avaria nenhuma — era o ficheiro a acabar.

Havia ainda um segundo efeito, pior de aturar: a essa distância o ecrã toca em vários países
guardados ao mesmo tempo, e a região escolhida mudava a cada arrastar do dedo. Como trocar
de região troca o estilo, e trocar o estilo recarrega o mapa, dava um salto atrás do outro.

Duas coisas resolvem isto, e convém não desfazer nenhuma:

- **Os tiles da Internet vão por cima do mapa guardado**, com um teto de zoom calculado a
  partir do tamanho do país (`regionMinZoom`, em `vectorStyle.ts`). Acima desse zoom o país
  chega para encher o ecrã e a camada desaparece; abaixo, tapa-o por completo e vê-se o
  mundo como sempre. **Sem rede não aparecem** e o que fica à vista é o país outra vez —
  que é o melhor possível nessa situação. Portugal dá zoom 6, São Tomé 7, a Madeira 8.
- **Abaixo do zoom `OFFLINE_SWITCH_MIN_ZOOM` (5) deixa de se mudar de país.** Ao longe a
  escolha não muda nada do que se vê, só faz o mapa recarregar.

De caminho, os estilos de imagem passaram a ter uma camada de fundo com a cor do mapa. Um
tile que falta deixava ver o vazio, que o MapLibre desenha a preto — era daí o "fica tudo
preto" ao afastar sem rede.

**Se o mapa guardado não abrir, a aplicação recua para os tiles da Internet**
(`onDidFailLoadingMap`). É o que evita um ecrã em branco — mas também é o que faz uma
avaria passar despercebida, daí o aviso lá em cima sobre testar com os dados desligados.

Tamanhos reais já medidos (zoom 14):

| País | Tamanho |
| --- | --- |
| São Tomé e Príncipe | 2,0 MB |
| Madeira | 5,1 MB |
| Cabo Verde | 8,4 MB |
| Açores | 11,7 MB |
| Guiné-Bissau | 23,8 MB |
| Portugal continental | 324,6 MB |

**O planeta inteiro ao detalhe de Portugal são cerca de 120 GB**, e o GitHub não aceita
ficheiros acima de 2 GB numa Release. Por isso o catálogo existe mas não se gera de uma
vez: escolhe-se o país e corre-se o workflow. O zoom de cada região sai do tamanho — 14 dá
as ruas todas e cada nível abaixo corta o ficheiro para cerca de metade. Se um país passar
os 2 GB, o workflow avisa e salta-o, para se baixar o `maxzoom` dessa entrada.

#### O estilo, e a avaria difícil de encontrar

Com tiles de imagem o mapa vinha pronto. Com geometria somos nós que dizemos que a água é
azul, que uma autoestrada é mais grossa do que um caminho e a partir de que zoom aparece
cada coisa. São 25 camadas, em versão clara e escura.

**As camadas e os valores dos filtros não foram adivinhados:** saíram da leitura do próprio
ficheiro de São Tomé. É o esquema **Protomaps Basemap v4.15.1**, com `earth`, `landcover`,
`landuse`, `water`, `roads`, `buildings`, `boundaries` e `places`. A camada `pois` existe no
ficheiro e não se usa de propósito — os negócios já são pinos nossos, vindos da Overpass.

**A avaria a temer:** se um nome de camada ou um valor de filtro deixar de bater certo, essa
camada desaparece do ecrã **sem dar erro nenhum**. Ao mudar de versão do mapa, confirmar os
nomes antes de assumir que está tudo bem.

Duas verificações que se podem correr sem telemóvel, e que se devem repetir depois de mexer
no estilo:

```bash
# 1. O estilo respeita a especificação do MapLibre?
npx tsc src/services/vectorStyle.ts --ignoreConfig --outDir /tmp/vs \
  --module commonjs --target es2020 --skipLibCheck --esModuleInterop
node -e "const {buildVectorStyle}=require('/tmp/vs/vectorStyle.js');
const {validateStyleMin}=require('@maplibre/maplibre-gl-style-spec');
console.log(validateStyleMin(buildVectorStyle('pmtiles://x','y/{fontstack}/{range}.pbf',false)))"
```

A segunda é comparar as camadas que o estilo pede com as que o ficheiro tem mesmo. O
`@maplibre/maplibre-gl-style-spec` já vem instalado como dependência do MapLibre, não é
preciso instalar nada.

#### O risco que fica, dito com franqueza

**Não está confirmado que o MapLibre em React Native leia um ficheiro PMTiles guardado no
telemóvel.** O suporte a `pmtiles://` existe na biblioteca nativa de Android (aqui na versão
13.2.0) e funciona com ficheiros na Internet; com um ficheiro local nunca foi experimentado
neste projeto, e não há forma de o experimentar no ambiente de desenvolvimento.

Se falhar, a primeira coisa a tentar é a outra forma de escrever o mesmo endereço:
`pmtiles:///caminho/absoluto`, sem o `file://` pelo meio — há bibliotecas que só aceitam uma
das duas. Está anotado em `localStyleSource()`. Se nenhuma funcionar, o caminho passa a ser
servir o ficheiro por um servidor local dentro da aplicação.

### 9. A posição, e usar a aplicação sem rede nenhuma

O GPS **não precisa de Internet**. Recebe dos satélites e funciona em modo de
voo, desde que a localização do telemóvel esteja ligada e haja céu à vista. O que precisa
de rede é o resto: os tiles, a pesquisa e os percursos. Com um país descarregado, a
aplicação continua a mostrar onde se está e o mapa à volta — num avião, num barco ou no
meio da serra.

Duas coisas no código servem precisamente para isso, e não se devem desfazer sem perceber:

- **`Accuracy.High` e não `Balanced`.** O `Balanced` do Android responde a partir das redes
  Wi-Fi e das antenas de telemóvel à volta. É rápido numa cidade e **completamente inútil
  sem rede** — que é exatamente quando mais faz falta.
- **A primeira posição sem rede demora.** O telemóvel costuma pedir à Internet uma ajuda
  com a lista de satélites à vista (é o chamado A-GPS); sem ela tem de a ouvir do próprio
  sinal, o que leva de trinta segundos a dois minutos. Por isso devolve-se primeiro a
  última posição conhecida, para haver logo alguma coisa no ecrã, e o seguimento contínuo
  corrige-a quando o GPS apanha sinal.

Fora da navegação a posição é seguida devagar (`watchPositionIdle`, dez em dez segundos ou
cinquenta metros), para o ponto azul acompanhar quem anda. Durante a navegação essa
subscrição desliga-se e passa a valer a do motor de navegação, a cada segundo — ter as duas
ligadas era gastar bateria a dobrar.

**Armadilha:** o cálculo do percurso **não pode depender da posição em estado**. Se
depender, cada leitura do GPS manda um pedido novo ao OSRM enquanto houver um destino
escolhido. Por isso a posição é lida de uma `ref` e o efeito depende de `hasLocation` — um
booleano que só muda na primeira leitura.

### 10. Navegação em tempo real

- Enquanto se navega, **o cálculo do percurso normal fica desligado**. A posição muda a
  cada segundo e, sem isso, faria um pedido por segundo ao OSRM. Quem recalcula é o motor
  de navegação, e só ao fim de `OFF_ROUTE_STRIKES` leituras seguidas fora do percurso —
  uma leitura isolada costuma ser apenas imprecisão do GPS.
- O GPS só é seguido durante a navegação, e a subscrição é sempre cancelada ao sair. Se
  ficar ligada, gasta bateria com o telemóvel no bolso.
- As contas de distância estão em `src/utils/geometry.ts`. Os índices das manobras ao
  longo da linha calculam-se uma vez por percurso, porque durante a navegação é preciso
  responder a cada segundo.
- A voz é opcional (definições) e usa `expo-speech` em `pt-PT`. Falhar a falar nunca deve
  interromper a navegação.
- **O ecrã fica aceso enquanto se navega** (`expo-keep-awake`, com o nome em
  `KEEP_AWAKE_TAG`). Sem isto o telemóvel bloqueava ao fim de meio minuto — a pessoa não
  lhe está a tocar, está a conduzir. Liga-se ao entrar em navegação e **desliga-se sempre
  ao sair**: o Android conta os pedidos por nome, e um que fique por levantar deixava o
  ecrã aceso para sempre. Fora da navegação não se mexe nisto.
- **O que continua por resolver:** com a aplicação em segundo plano ou o ecrã apagado à
  força, o Android acaba por travar a atualização da posição. Resolver isso a sério obriga
  a um serviço em primeiro plano com notificação permanente, que é bastante mais trabalho.
  Com o ecrã aceso o caso deixa de aparecer no uso normal.

### 11. Margens do ecrã (câmara, barras do sistema)

O Expo desenha a aplicação **de extremo a extremo**: o mapa passa por baixo da barra de
estado, da câmara ao centro e da barra de navegação. Quem tem de se afastar são os
elementos por cima do mapa.

- Usar sempre `useSafeAreaInsets()` do `react-native-safe-area-context`. O
  `SafeAreaProvider` envolve a aplicação toda, no `App.tsx`.
- **Nunca usar o `SafeAreaView` do `react-native`.** Só funciona no iOS — no Android não
  faz absolutamente nada, e foi assim que a barra de pesquisa foi parar por baixo da
  câmara.
- Os ecrãs em `Modal` levam `statusBarTranslucent` e `navigationBarTranslucent`, para
  desenharem sempre de extremo a extremo e a margem ser sempre a nossa.

### 12. Tema claro e escuro

- As cores estão todas em `src/theme.ts`, em duas paletas. Nenhum componente deve escrever
  uma cor à mão — pede-se ao tema com `useTheme()`, importado de `src/settings.tsx`.
- Qual das paletas se usa sai das definições: em "automático" segue o telemóvel, senão
  segue o que a pessoa escolheu.
- Os estilos passam a ser uma função do tema: `makeStyles(theme)` no fim do ficheiro, com
  `useMemo` no componente. Continua tudo num `StyleSheet.create`, só que dentro da função.
- O `app.json` tem `userInterfaceStyle` a `"automatic"` — é isso que faz a aplicação seguir
  a definição do telemóvel. Sem o `expo-system-ui` instalado, isto não funciona no Android.
- O mapa também muda: tiles do OpenStreetMap em claro, do CARTO em escuro (ver
  `src/services/tiles.ts`). Há ainda a imagem de satélite, que é igual nos dois temas. O
  OpenStreetMap não tem versão escura dos seus tiles, por isso é preciso outra fonte — o
  CARTO é gratuito para uso não comercial, com atribuição, e continua sem chaves de API.

### 13. Estado da aplicação

A informação principal vive em `App.tsx`, com `useState`:

- `userLocation` — a posição atual do telemóvel (ou `null` se não houver permissão)
- `destination` — o destino escolhido na pesquisa
- `route` — o percurso calculado: os pontos da linha, a distância e a duração

O percurso desenha-se no mapa como uma linha, a partir de `route.coordinates`.

Chega perfeitamente o estado normal do React e, se um dia for preciso partilhar informação
entre ecrãs, o Context. Não é preciso nenhuma biblioteca de gestão de estado para um
projeto deste tamanho.

## Android Auto (pausado)

> **Estado: pausado.** O autor decidiu pôr esta parte de lado depois de ver o que envolve.
> Não começar a trabalhar no Android Auto, não instalar bibliotecas por causa dele e não
> correr `expo prebuild` só para o preparar. A secção fica aqui como registo da pesquisa
> já feita, para não ser preciso repeti-la se um dia se retomar.

A ideia era poder usar o PalmMap no ecrã do carro. É possível, mas as regras são bastante
mais apertadas do que no telemóvel — em resumo, o que se apurou:

### O que é preciso saber

**1. A parte do carro não pode ser feita em React Native.**
As aplicações de Android Auto usam uma biblioteca própria da Google, a *Android for Cars
App Library*, escrita em Kotlin/Java. O ecrã do carro **não mostra o ecrã da aplicação** —
a aplicação fornece "modelos" (listas, painel de navegação, mapa) e é o carro que os
desenha, com regras rígidas para não distrair o condutor. Consequência prática: a parte do
Android Auto é um módulo nativo separado, à parte do código React Native. Só o mapa em si
(via MapLibre nativo) e a lógica de ligação ao Nominatim/OSRM é que se reaproveitam em
espírito — o código terá de ser reescrito em Kotlin, mas é pouco código.

**2. Obriga a sair do Expo "gerido".**
Para acrescentar código nativo é preciso correr `npx expo prebuild`, que gera a pasta
`android/` para poder ser editada à mão. Não é dramático, mas é uma mudança de forma de
trabalhar. **Vale a pena contar com isto desde o início.**

**3. A grande armadilha: não dá para instalar por APK no carro.**
O Android Auto tem uma opção de programador chamada "Unknown sources" que permite usar
aplicações instaladas fora da Play Store. **Essa opção não se aplica a aplicações de
navegação.** Está escrito na documentação da Google: a opção serve para apps de música,
mensagens e apps de "estacionado", mas *não* para apps feitas com a Android for Cars App
Library. Ou seja, o plano de gerar um APK e instalar no telemóvel — que funciona lindamente
para a aplicação de telemóvel — **não chega para ter o PalmMap no carro**.

**4. Para funcionar num carro a sério, é preciso a Play Store.**
Isso implica conta de programador Google Play (pagamento único de cerca de 25 dólares) e,
para apps de navegação, **uma revisão manual adicional feita pela Google**, com exigências
sérias: navegação passo-a-passo real, indicações de faixa de rodagem, enviar a próxima
manobra para o painel de instrumentos do carro, modo de demonstração de condução, regras de
distração do condutor, etc. É um nível de exigência pensado para o Waze e o Sygic, não para
um projeto pessoal.

Nota: a documentação da Google é contraditória quanto a saber se os canais de teste interno
da Play Store contornam esta revisão. Se se chegar a esse ponto, é algo a testar na prática
em vez de assumir.

**5. O que dá para fazer já, de graça: o Desktop Head Unit (DHU).**
É um simulador de ecrã de carro que corre no computador e vem com o Android Studio. Permite
desenvolver e experimentar toda a experiência de Android Auto sem carro, sem Play Store e
sem revisão nenhuma. Para um projeto pessoal, é aqui que a parte do Android Auto se
constrói e se testa.

### Porque foi pausado

Somando tudo: código nativo em Kotlin à parte do resto, saída do Expo gerido, e —
sobretudo — a impossibilidade de instalar por APK no carro, com a Play Store e a revisão
manual da Google como única via. Para um projeto pessoal, o esforço não compensa o
resultado.

Há ainda o salto de dimensão: o que está descrito no resto deste ficheiro é mostrar o mapa,
pesquisar uma morada e desenhar o percurso. O Android Auto exige navegação passo-a-passo
com manobras, recálculo e voz — é outro projeto por cima deste.

### Se um dia se retomar

Nada do que se faz agora fica pelo caminho. O `expo prebuild` pode correr-se em qualquer
altura, por isso **não vale a pena complicar o arranque por causa disto** — a aplicação de
telemóvel constrói-se em Expo gerido, que é mais simples. A ordem seria:

1. Ter a aplicação de telemóvel a funcionar (é o trabalho atual).
2. Correr `npx expo prebuild` para poder acrescentar código nativo.
3. Escrever o módulo de Android Auto em Kotlin e testá-lo no DHU, que é gratuito.
4. A questão da Play Store só no fim, e só se o passo 3 correr bem.

## Regras de utilização dos serviços externos

Isto não são preferências de estilo — são as condições de utilização dos serviços. Se não
forem cumpridas, os pedidos da aplicação acabam por ser bloqueados.

A boa notícia: como o PalmMap é para uso pessoal, o volume de pedidos é minúsculo e os
serviços públicos gratuitos chegam bem. **Não é preciso montar servidores próprios.** Só é
preciso ser bem-educado com serviços que são mantidos por voluntários.

Todas estas regras já estão cumpridas no código. O que se segue explica onde, para não
serem desfeitas sem se perceber o que se está a desligar.

### Nominatim — pesquisa de moradas

- No máximo **1 pedido por segundo**. É um limite rígido do serviço público.
  *No código:* `src/services/nominatim.ts` tem uma fila que espera o tempo necessário entre
  pedidos, mesmo que a aplicação peça várias coisas ao mesmo tempo.
- É **obrigatório** enviar um `User-Agent` que identifique a aplicação. Pedidos sem isso
  são recusados. *No código:* `USER_AGENT`, em `src/services/config.ts`.
- **Não fazer um pedido a cada tecla escrita.** O serviço público proíbe expressamente a
  pesquisa "à medida que se escreve". *No código:* a `SearchBar` espera
  `SEARCH_DEBOUNCE_MS` (1 segundo) depois de a pessoa parar de escrever, e só pesquisa a
  partir de 3 letras. **Não reduzir este valor.**
- Guardar em memória os resultados já obtidos, para nunca repetir a mesma pesquisa duas
  vezes. *No código:* o `Map` de cache em `src/services/nominatim.ts`.
- A pesquisa inversa (coordenadas → morada), usada pelo pino largado no mapa, passa pela
  mesma fila e pela mesma cache. Se falhar, o pino fica na mesma, só sem morada — o
  percurso não depende dela.

### Overpass — negócios e pontos de interesse

É o serviço mais pesado dos três: cada consulta faz o servidor percorrer os dados do
OpenStreetMap. Convém ser especialmente cuidadoso.

- Intervalo mínimo de 2 segundos entre pedidos. *No código:* `OVERPASS_MIN_INTERVAL_MS`,
  aplicado pela fila partilhada em `src/services/rateLimit.ts`.
- Os botões de categoria procuram **na área visível do mapa**, não à volta do GPS. Ao
  olhar para outra zona, procurar à volta do GPS punha os resultados fora do ecrã e
  parecia que o botão não fazia nada. *No código:* `searchCategoryInBounds`, com aviso a
  pedir para aproximar abaixo do zoom `CATEGORY_MIN_ZOOM` (12) — mais afastado, a área
  seriam dezenas de quilómetros.
- Os pinos automáticos no mapa são o maior risco de abuso — sem travões, seria um pedido
  por cada arrastar do dedo. *No código:* só se pede a partir do zoom `MAP_PINS_MIN_ZOOM`
  (15), e só `MAP_PINS_DEBOUNCE_MS` (1,2 s) depois de o mapa parar. **Não desligar isto.**
- Guardar em memória as consultas já feitas. *No código:* o `Map` de cache em
  `src/services/overpass.ts`, com as coordenadas arredondadas para o GPS a oscilar não
  gerar pedidos novos.
- Limitar o número de resultados por consulta (`MAP_PINS_LIMIT`).

### OSRM — cálculo de percursos

- Usar **`https://`** e não `http://`. O documento original indicava o endereço com
  `http://`, mas o Android bloqueia ligações não seguras desde a versão 9, por isso os
  pedidos falhariam.
- O servidor público é oficialmente destinado a demonstrações e desenvolvimento, sem
  garantias de funcionamento. Para uso pessoal serve muito bem; convém apenas contar com a
  possibilidade de estar em baixo de vez em quando e mostrar uma mensagem de erro decente
  quando isso acontecer.
- O percurso é pedido com `steps=true`, que traz as manobras uma a uma. A tradução para
  português está em `src/utils/maneuvers.ts`.

### Protomaps — mapas offline

- O planeta em PMTiles é publicado **para ser usado assim**, incluindo recortado. Não há
  limite de pedidos a respeitar nem User-Agent obrigatório.
- As compilações são diárias e ficam num endereço com a data. A de hoje pode ainda não
  estar pronta à hora a que o workflow corre — por isso ele recua até dez dias à procura de
  uma que exista.
- Os dados continuam a ser do OpenStreetMap, por isso **a atribuição mantém-se obrigatória**
  quando o mapa vetorial for desenhado.

O endereço base, o `User-Agent`, o intervalo entre pedidos e o tempo de espera da pesquisa
estão todos em `src/services/config.ts` — é aí que se mexe, não espalhado pelo código.

## Estilo de código

- TypeScript limpo, com tipos bem definidos para **todas** as respostas das APIs (Nominatim
  e OSRM). Nada de `any` nos dados que vêm da Internet — os tipos ficam em `src/types/`.
- Componentes em forma de função, com Hooks (`useState`, `useEffect`, `useCallback`).
- Os estilos ficam agrupados no fim de cada ficheiro de componente, numa função
  `makeStyles(theme)` que devolve um `StyleSheet.create`. Nunca escrever cores à mão.
- Ícones: `@expo/vector-icons`, família `MaterialCommunityIcons`. Antes de usar um nome
  novo, confirmar que existe — a lista está em
  `node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/`.
- Comentários e nomes de variáveis: o código em inglês, como é hábito; os comentários podem
  ser em português.
- Ao instalar um pacote do Expo, tirar a versão de
  `node_modules/expo/bundledNativeModules.json` em vez de usar a mais recente do npm. As
  versões do npm não acompanham o SDK e instalam coisas incompatíveis.

## Trabalhar com o Git

- O branch principal é o `main`. O desenvolvimento desta tarefa acontece no branch
  `claude/claude-md-documentation-k64ki9`.
- **O repositório é público.** Foi uma decisão pensada e não é por descuido: os mapas dos
  países são descarregados de uma Release por um endereço sem autenticação, e num
  repositório privado isso dá erro. A alternativa seria meter uma credencial dentro do
  APK, o que não se faz. Se um dia se quiser voltar a fechar o repositório, é preciso mudar
  primeiro a forma de distribuir os mapas.
- **Nunca guardar chaves de API nem ficheiros `.env` no repositório.** Vale sempre, e
  agora com mais razão.
- O `.gitignore` vem do Expo e já cobre `node_modules/`, `.expo/`, as pastas `android/` e
  `ios/` geradas na compilação, e os ficheiros de assinatura (`*.jks`, `*.p12`).
- O `package-lock.json` fica no repositório — é o que garante que uma instalação futura usa
  exatamente as mesmas versões.
- **Não abrir um Pull Request sem ser explicitamente pedido.**
- **Não lançar compilações sem ser pedido.** O autor pediu isto expressamente.

## O que se aprendeu por tentativa e erro

Erros já cometidos neste projeto, para não se repetirem.

- **O `SafeAreaView` do `react-native` não faz nada no Android.** Foi assim que a barra de
  pesquisa foi parar por baixo da câmara do telemóvel. Usar sempre o
  `react-native-safe-area-context`.
- **"Ocorreu um problema ao analisar o pacote"** ao instalar o APK não era ficheiro
  truncado — a primeira suspeita estava errada. As causas reais eram o `versionCode`
  repetido e o tamanho de incluir quatro arquiteturas.
- **O tempo errado nas estradas de terra não é falta de dados.** As estradas já estão
  marcadas como não alcatroadas; é o OSRM que assume 40 km/h onde se anda a 20. Verificar
  antes de propor "melhorar os dados no OpenStreetMap".
- **Os filtros de categoria devem procurar na área visível, não à volta do GPS.** Com o
  mapa noutra zona, os resultados vinham fora do ecrã e parecia que o botão estava avariado.
- **Uma camada de texto precisa de glifos.** Uma tentativa de mostrar os nomes dos negócios
  no mapa falhou por o estilo não ter servidor de tipos de letra. Foi por isso que os
  glifos passaram a ir dentro do APK.
- **Ler o ficheiro antes de escrever o estilo.** As camadas e os valores dos filtros do
  mapa vetorial saíram de decifrar o próprio `.pmtiles`, não da documentação. Um filtro
  errado não dá erro — dá uma camada invisível, que é muito pior de encontrar.
- **O `gh release create` precisa de `-R`** quando o workflow não faz checkout do
  repositório, senão procura-o na pasta atual e falha.
- **Uma linha sem pontos não é GeoJSON válido, e leva a fonte inteira atrás.** Ao dividir
  o percurso em "já andado" e "falta", a primeira metade começa vazia — e o MapLibre
  deitava fora a fonte toda, **sem dar erro nenhum**: o percurso desaparecia por completo
  do mapa. Daí as duas metades irem hoje em fontes separadas, cada uma só desenhada a
  partir de dois pontos. Ao mexer aqui, garantir sempre o mínimo de dois.
- **Um serviço WMS pode ter mais do que uma camada, e a errada não dá erro.** As ortofotos
  da Direção-Geral do Território publicam `-CorVerdadeira` e `-FalsaCor`. Pedir só
  `ortoSat2023` devolvia a segunda: imagem nítida, bem posicionada, e **todo o campo a
  vermelho vivo**, porque é infravermelho. Ao usar um WMS, ler os nomes das camadas em vez
  de assumir que o nome do serviço chega.
- **Confirmar as APIs do MapLibre v11 antes de as usar.** Vários nomes mudaram em relação
  à documentação mais espalhada pela Internet (`fitBounds`, `attribution`), e as
  funcionalidades de uma fonte vêm em `event.features`, não em `event.nativeEvent.features`.

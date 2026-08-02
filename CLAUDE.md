# CLAUDE.md — PalmMap

Guia para o Claude Code e outros assistentes de IA que trabalhem neste repositório.
Está escrito em português de Portugal e em linguagem simples, para poder ser lido tanto
por uma pessoa como por um assistente.

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

**A v1 foi confirmada a funcionar num telemóvel Android real.** O que está feito:

- Projeto Expo (SDK 57) com TypeScript.
- Mapa com MapLibre: tiles do OpenStreetMap em modo claro, do CARTO em modo escuro.
- Pesquisa de moradas e negócios pelo Nominatim, com as regras de utilização cumpridas.
- Negócios pela Overpass: botões por categoria e pinos automáticos na área visível.
- Toque longo no mapa larga um pino em qualquer ponto, com a morada obtida por pesquisa
  inversa no Nominatim, e permite traçar o percurso até lá.
- Cálculo de percurso pelo OSRM, com distância, tempo estimado e lista de instruções.
- Navegação em tempo real: segue a posição, mostra a manobra seguinte com a distância,
  lê-a em voz alta e recalcula o percurso se se sair dele.
- Localização por GPS, com a aplicação a continuar utilizável se a pessoa recusar.
- Tema claro/escuro seguido automaticamente a partir das definições do telemóvel.
- Ecrã de definições: aspeto, transporte, correção do tempo, pinos automáticos e voz.

**Confirmado no telemóvel:** o mapa, a pesquisa, os botões de categoria e as margens do
ecrã. **Por confirmar:** a navegação em tempo real, a voz, os percursos a pé e de
bicicleta, e os resultados da Overpass. Compila e os tipos estão verificados, mas não foi
experimentado — não digas que "funciona" sem ter sido visto a funcionar.

Também não foi possível testar as consultas à Overpass contra o serviço real, porque o
ambiente de desenvolvimento usado bloqueia o acesso. Se os negócios não aparecerem, é o
primeiro sítio onde procurar.

O `eas.json` já está escrito, com três perfis de compilação (`development`, `preview` e
`production`) — ver "Instalar no telemóvel". Há também um workflow do GitHub Actions
(`.github/workflows/build-apk.yml`) que compila o APK e o publica numa Release, sem ser
preciso computador nem conta Expo.

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
| **Tiles** | Os quadradinhos de imagem que, juntos, formam o mapa que se vê no ecrã. |
| **Nominatim** | Serviço que transforma uma morada escrita ("Rua Augusta, Lisboa") em coordenadas de latitude e longitude. É o motor de pesquisa do OpenStreetMap. |
| **OSRM** | Serviço que calcula o caminho entre dois pontos e devolve o percurso e a distância. |
| **Overpass** | Serviço que permite perguntar ao OpenStreetMap "que restaurantes há aqui à volta?". É o que está por trás dos negócios. |
| **Expo** | Conjunto de ferramentas que simplifica muito criar e testar aplicações em React Native. |
| **APK** | O ficheiro que se instala diretamente num telemóvel Android, sem passar pela Play Store. |
| **API** | A forma como um programa pede informação a um serviço na Internet. |

## Tecnologias

| Para quê | Escolha |
| --- | --- |
| Base da aplicação | React Native 0.86 + Expo SDK 57 |
| Linguagem | TypeScript |
| Componente do mapa | `@maplibre/maplibre-react-native` — ver "Decisão importante" |
| Localização (GPS) | `expo-location` |
| Pedidos à Internet | `axios` |
| Mapa (tiles) | OpenStreetMap |
| Pesquisa de moradas | Nominatim (`https://nominatim.openstreetmap.org`) |
| Cálculo de percursos | OSRM (`https://router.project-osrm.org`) |

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

Não está definida nenhuma ferramenta de testes nem de formatação automática. Para um
projeto pessoal deste tamanho, não é preciso — mas se acrescentares alguma, documenta-a
aqui.

## Instalar no telemóvel

Não é preciso Android Studio nem publicar na Play Store: o EAS compila na nuvem e devolve
um APK para instalar diretamente. Só é preciso uma conta Expo, que é gratuita.

Os perfis de compilação estão em `eas.json`. Há dois que interessam:

| Perfil | Para quê |
| --- | --- |
| `preview` | A aplicação a sério, autónoma. Instala-se e usa-se. Para mudar o código, compila-se de novo. |
| `development` | Instala-se uma vez e depois liga-se ao computador com `npx expo start`. O código recarrega sem compilar outra vez. É o que se usa enquanto se está a desenvolver. |

O APK é compilado só para **arm64-v8a**, o processador de qualquer telemóvel Android
atual. Incluir as quatro arquiteturas triplicava o tamanho sem proveito nenhum, e um
ficheiro enorme é mais fácil de chegar truncado — que é o que dá o erro "ocorreu um
problema ao analisar o pacote" ao instalar.

O workflow verifica o APK antes de o publicar: integridade do arquivo, identificação
(pacote, `minSdk`, arquiteturas) e esquemas de assinatura. Assim um ficheiro estragado é
apanhado na compilação e não só no telemóvel.

```bash
# Entrar na conta Expo (só na primeira vez)
npx eas-cli login

# Gerar o APK. Na primeira vez pergunta se pode ligar o projeto à conta — dizer que sim.
npx eas-cli build -p android --profile preview
```

No fim aparece um endereço e um QR code. Abrir no telemóvel, descarregar o APK e instalar.

Notas para instalar em Android:

- É preciso autorizar a instalação de aplicações fora da Play Store, no navegador ou no
  gestor de ficheiros que abrir o APK.
- Em telemóveis Xiaomi/POCO (HyperOS ou MIUI) costuma aparecer um aviso extra de segurança.
  Se a instalação for bloqueada, desligar a verificação automática de aplicações nas
  definições de segurança.
- A aplicação precisa de Internet para os tiles do mapa e para o Nominatim e o OSRM. Não
  funciona offline.

Em alternativa, compilar no próprio computador (exige o Android Studio instalado):

```bash
npx expo run:android                    # versão de desenvolvimento
npx expo run:android --variant release  # versão final
```

(Isto serve para a aplicação de telemóvel. Para o ecrã do carro o APK não chegaria — foi
uma das razões para o Android Auto ficar pausado.)

## Estrutura do projeto

```text
/
├── assets/                 # Ícones e imagem de arranque (gerados por script)
├── scripts/
│   └── generate-icons.py   # Desenha o logo e escreve os ficheiros de assets/
├── docs/
│   └── project-brief-original.pdf
├── src/
│   ├── components/         # Peças de interface
│   │   ├── MapView.tsx     # Mapa, pinos dos negócios, percurso e destino
│   │   ├── SearchBar.tsx   # Barra de pesquisa (usa o Nominatim)
│   │   ├── CategoryBar.tsx # Botões "Restaurantes", "Farmácias", …
│   │   ├── PlaceSheet.tsx  # Ficha de um negócio, com horário e telefone
│   │   ├── RoutePanel.tsx  # Painel inferior com a distância e o tempo estimado
│   │   ├── StepsList.tsx   # Lista das instruções do percurso
│   │   ├── NavigationPanel.tsx # Ecrã de navegação, com a manobra seguinte
│   │   └── SettingsSheet.tsx # Ecrã de definições
│   ├── services/           # Ligação aos serviços externos
│   │   ├── config.ts       # Endereços, User-Agent e limites — tudo num sítio só
│   │   ├── rateLimit.ts    # Fila que espaça os pedidos, partilhada pelos serviços
│   │   ├── location.ts     # Gere o GPS do telemóvel
│   │   ├── nominatim.ts    # Pesquisa por nome
│   │   ├── overpass.ts     # Negócios por categoria e por área do mapa
│   │   ├── osrm.ts         # Cálculo de percursos e instruções
│   │   └── tiles.ts        # Estilos do mapa (claro/escuro) e User-Agent dos tiles
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
├── .github/workflows/
│   └── build-apk.yml       # Compila o APK no GitHub e publica-o numa Release
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
- São cinco: **aspeto** (automático/claro/escuro), **meio de transporte**
  (carro/a pé/bicicleta), **correção do tempo estimado**, **mostrar negócios no mapa** e
  **ler instruções em voz alta**.
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

**O problema:** onde a etiqueta `surface` não está preenchida, o OSRM assume piso bom e
fica optimista de mais. Numa estrada de terra batida o tempo real pode ser o dobro. Foi o
que aconteceu em São Tomé, onde grande parte das estradas não tem a etiqueta.

Há duas formas de corrigir, e não se excluem:

1. **Preencher a etiqueta no OpenStreetMap** (`surface=ground`, `unpaved`, `compacted`…).
   É a correção certa: passa a valer para o OSRM e para toda a gente, e não é preciso
   mexer na aplicação. Exige conta no OpenStreetMap e conhecimento local.
2. **A correção manual nas definições** (`timeAdjustment`), que multiplica o tempo por
   1, 1,25, 1,5 ou 2. É grosseira — aplica-se a todos os percursos por igual — mas
   funciona já e sem depender de dados que podem nunca ser preenchidos.

O fator é aplicado **onde o tempo é mostrado** (`useTimeFactor()`), e não dentro do
serviço: o `Route` continua a guardar o que o OSRM respondeu, sem retoques.

### 6. Navegação em tempo real

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

### 7. Margens do ecrã (câmara, barras do sistema)

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

### 8. Tema claro e escuro

- As cores estão todas em `src/theme.ts`, em duas paletas. Nenhum componente deve escrever
  uma cor à mão — pede-se ao tema com `useTheme()`, importado de `src/settings.tsx`.
- Qual das paletas se usa sai das definições: em "automático" segue o telemóvel, senão
  segue o que a pessoa escolheu.
- Os estilos passam a ser uma função do tema: `makeStyles(theme)` no fim do ficheiro, com
  `useMemo` no componente. Continua tudo num `StyleSheet.create`, só que dentro da função.
- O `app.json` tem `userInterfaceStyle` a `"automatic"` — é isso que faz a aplicação seguir
  a definição do telemóvel. Sem o `expo-system-ui` instalado, isto não funciona no Android.
- O mapa também muda: tiles do OpenStreetMap em claro, do CARTO em escuro (ver
  `src/services/tiles.ts`). O OpenStreetMap não tem versão escura dos seus tiles, por isso
  é preciso outra fonte — o CARTO é gratuito para uso não comercial, com atribuição, e
  continua sem chaves de API.

### 9. Estado da aplicação

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

## Trabalhar com o Git

- O desenvolvimento desta tarefa acontece no branch `claude/claude-md-documentation-k64ki9`.
  O branch principal é o `main`.
- Nunca guardar chaves de API nem ficheiros `.env` no repositório.
- O `.gitignore` vem do Expo e já cobre `node_modules/`, `.expo/`, as pastas `android/` e
  `ios/` geradas na compilação, e os ficheiros de assinatura (`*.jks`, `*.p12`).
- O `package-lock.json` fica no repositório — é o que garante que uma instalação futura usa
  exatamente as mesmas versões.
- Não abrir um Pull Request sem ser explicitamente pedido.

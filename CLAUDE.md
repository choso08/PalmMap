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

## ⚠️ Estado atual do repositório — ler primeiro

**Este repositório ainda não tem código nenhum.** Neste momento tem apenas:

```text
/
├── CLAUDE.md                        # este ficheiro
└── docs/
    └── project-brief-original.pdf   # o documento original do projeto (PDF)
```

Não existe `package.json`, não existe pasta `src/`, não existe `App.tsx`, não existe
projeto Expo criado. Tudo o que está descrito mais abaixo é o que **se pretende construir**,
não o que já existe.

Na prática, isto quer dizer:

- Não digas que um ficheiro ou um comando funciona sem o teres criado e experimentado.
- A primeira tarefa a fazer aqui é criar a base do projeto (ver "Arrancar do zero").
- Antes de seguires qualquer convenção deste ficheiro, confirma se o ficheiro em causa já
  existe mesmo.
- Se criares a base do projeto, **atualiza este ficheiro** para deixar de dizer que o
  repositório está vazio.

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
| **Expo** | Conjunto de ferramentas que simplifica muito criar e testar aplicações em React Native. |
| **APK** | O ficheiro que se instala diretamente num telemóvel Android, sem passar pela Play Store. |
| **API** | A forma como um programa pede informação a um serviço na Internet. |

## Tecnologias

| Para quê | Escolha |
| --- | --- |
| Base da aplicação | React Native + Expo (usar a versão atual do Expo) |
| Linguagem | TypeScript |
| Componente do mapa | Ver "Decisão importante" mais abaixo — recomenda-se MapLibre |
| Localização (GPS) | `expo-location` |
| Pedidos à Internet | `axios` |
| Mapa (tiles) | OpenStreetMap |
| Pesquisa de moradas | Nominatim (`https://nominatim.openstreetmap.org`) |
| Cálculo de percursos | OSRM (`https://router.project-osrm.org`) |

A plataforma alvo é o **Android**. Nada impede o iOS, mas as permissões e a criação do
ficheiro de instalação descritas aqui são específicas do Android.

## Decisão importante: qual o componente do mapa

Esta é a decisão que mais afeta o resto do projeto, por isso vem antes de tudo o resto.

O documento original indicava a biblioteca `react-native-maps`. **O problema:** no Android,
essa biblioteca funciona por cima do Google Maps e, na prática, costuma exigir uma chave do
Google para sequer arrancar — mesmo quando só queremos desenhar os tiles do OpenStreetMap
por cima. Ou seja, entra em conflito direto com o objetivo do projeto.

**Recomendação: usar MapLibre** — `@maplibre/maplibre-react-native` no telemóvel. É uma
biblioteca de mapas completamente livre, sem qualquer ligação ao Google. O documento
original já a referia como uma das opções possíveis.

Esta recomendação sustenta-se sozinha, só pela regra de não depender do Google. Como
argumento adicional: se um dia se retomar o Android Auto, o MapLibre também tem uma
biblioteca nativa para Android, o que permitiria ao telemóvel e ao carro partilharem o
mesmo motor de mapa e a mesma fonte de tiles. Não é a razão principal, mas é mais um ponto
a favor.

## Arrancar do zero

Como ainda não existe nada, o projeto tem de ser criado antes de qualquer outro comando
deste ficheiro funcionar. Em traços gerais:

```bash
# Criar a aplicação Expo com TypeScript nesta pasta
npx create-expo-app@latest . --template blank-typescript

# Instalar o que é preciso
npx expo install expo-location
npm install axios
```

A biblioteca do mapa instala-se depois, consoante a decisão acima.

Confirmar que a aplicação arranca (`npx expo start`) antes de acrescentar funcionalidades.
Guardar o ficheiro de dependências (`package-lock.json`) no repositório.

## Comandos

Estes são os comandos previstos **depois** de o projeto estar criado. Neste momento
nenhum deles funciona, porque ainda não há projeto.

### Desenvolvimento

```bash
npm install                 # Instalar as dependências
npx expo start              # Arrancar o servidor de desenvolvimento
npx expo run:android        # Correr num emulador ou telemóvel Android
```

### Gerar o ficheiro de instalação (APK)

Para uso pessoal, o mais prático é gerar um APK e instalá-lo diretamente no telemóvel. Não
é preciso publicar na Play Store nem pagar nada.

(Isto serve para a aplicação de telemóvel. Para o ecrã do carro o APK não chegaria — foi
uma das razões para o Android Auto ficar pausado.)

```bash
# Configurar o EAS (o serviço de compilação da Expo)
npx eas-cli build:configure

# Gerar um APK instalável diretamente no Android
npx eas-cli build -p android --profile preview

# Em alternativa, compilar no próprio computador (exige o Android Studio instalado)
npx expo run:android --variant release
```

### Verificar erros de tipos

```bash
npx tsc --noEmit
```

Não está definida nenhuma ferramenta de testes nem de formatação automática. Para um
projeto pessoal deste tamanho, não é preciso — mas se acrescentares alguma, documenta-a
aqui.

## Estrutura pretendida do projeto

```text
/
├── assets/                 # Ícones, imagem de arranque, imagens fixas
├── src/
│   ├── components/         # Peças de interface reutilizáveis
│   │   ├── MapView.tsx     # Desenha o mapa com os tiles do OpenStreetMap
│   │   ├── SearchBar.tsx   # Barra de pesquisa de moradas (usa o Nominatim)
│   │   └── RoutePanel.tsx  # Painel inferior com a informação do percurso e distância
│   ├── services/           # Ligação aos serviços externos
│   │   ├── location.ts     # Gere o GPS do telemóvel
│   │   ├── nominatim.ts    # Pesquisa de locais
│   │   └── osrm.ts         # Cálculo de percursos
│   ├── types/              # Definições de tipos do TypeScript
│   └── utils/              # Funções auxiliares (formatar textos, calcular distâncias)
├── App.tsx                 # Ponto de entrada da aplicação
├── app.json                # Configuração do Expo e permissões do Android
├── package.json
└── tsconfig.json
```

**Regra prática:** todos os pedidos à Internet ficam dentro de `src/services/`. Os
componentes do ecrã nunca chamam o `axios` diretamente — pedem as coisas aos serviços.
Assim, as regras de boa utilização das APIs (mais abaixo) ficam todas concentradas num
único sítio, em vez de espalhadas pelo código.

## Orientações de arquitetura

### 1. O mapa

- **Nunca usar uma chave de API do Google.** É a regra central do projeto.
- Os tiles vêm do OpenStreetMap:
  `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Enviar sempre um `User-Agent` próprio e identificável nos pedidos ao OpenStreetMap e ao
  Nominatim. É uma exigência das regras de utilização destes serviços — basicamente, é
  dizer-lhes quem somos em vez de aparecer como anónimo.
- Se, apesar da recomendação acima, o projeto ficar mesmo com o `react-native-maps`: usar o
  componente `<UrlTile />` para os tiles e definir `mapType="none"` no mapa, para o mapa de
  base não aparecer por baixo dos tiles do OpenStreetMap.

### 2. Permissões de localização (Android)

- O ficheiro `app.json` tem de declarar as permissões de GPS:
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`
- Pedir a permissão **durante a utilização** da aplicação, através do `expo-location`
  (`Location.requestForegroundPermissionsAsync()`).
- Se a pessoa recusar, a aplicação não deve rebentar nem ficar inutilizável: deve continuar
  a dar para ver o mapa e pesquisar moradas, apenas sem mostrar a posição atual.

### 3. Estado da aplicação

A informação principal, guardada ao nível do ecrã do mapa:

- `userLocation` — a posição atual do telemóvel
- `destination` — o destino escolhido ou pesquisado
- `routeCoordinates` — os pontos que formam o percurso

O percurso desenha-se no mapa como uma linha (`Polyline`) a partir de `routeCoordinates`.

Chega perfeitamente usar o estado normal do React (`useState`) e, se for preciso partilhar
informação entre ecrãs, o Context. Não é preciso nenhuma biblioteca de gestão de estado
para um projeto deste tamanho.

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

### Nominatim — pesquisa de moradas

- No máximo **1 pedido por segundo**. É um limite rígido do serviço público.
- É **obrigatório** enviar um `User-Agent` que identifique a aplicação. Pedidos sem isso
  são recusados.
- **Não fazer um pedido a cada tecla escrita.** O serviço público proíbe expressamente a
  pesquisa "à medida que se escreve". A solução é simples: esperar que a pessoa pare de
  escrever cerca de 1 segundo, ou só pesquisar quando carregar em Enter.
- Guardar em memória os resultados já obtidos, para nunca repetir a mesma pesquisa duas
  vezes.

### OSRM — cálculo de percursos

- Usar **`https://`** e não `http://`. O documento original indicava o endereço com
  `http://`, mas o Android bloqueia ligações não seguras desde a versão 9, por isso os
  pedidos falhariam.
- O servidor público é oficialmente destinado a demonstrações e desenvolvimento, sem
  garantias de funcionamento. Para uso pessoal serve muito bem; convém apenas contar com a
  possibilidade de estar em baixo de vez em quando e mostrar uma mensagem de erro decente
  quando isso acontecer.
- Nota para o futuro: se um dia se quiser navegação passo-a-passo, o OSRM já devolve as
  manobras — basta pedir o percurso com `steps=true`. Não é preciso agora.

O endereço base, o `User-Agent`, o intervalo entre pedidos e a memória de resultados devem
estar todos definidos em `src/services/`, num único sítio.

## Estilo de código

- TypeScript limpo, com tipos bem definidos para **todas** as respostas das APIs (Nominatim
  e OSRM). Nada de `any` nos dados que vêm da Internet — os tipos ficam em `src/types/`.
- Componentes em forma de função, com Hooks (`useState`, `useEffect`, `useCallback`).
- Os estilos ficam agrupados num `StyleSheet.create` no fim de cada ficheiro de componente.
- Comentários e nomes de variáveis: o código em inglês, como é hábito; os comentários podem
  ser em português.

## Trabalhar com o Git

- O desenvolvimento desta tarefa acontece no branch `claude/claude-md-documentation-k64ki9`.
  O branch principal é o `main`.
- Nunca guardar chaves de API nem ficheiros `.env` no repositório.
- Criar um `.gitignore` logo no arranque (o do Expo já cobre `node_modules/`, `.expo/` e os
  ficheiros gerados na compilação).
- Não abrir um Pull Request sem ser explicitamente pedido.

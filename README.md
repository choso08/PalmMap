# PalmMap

A maps app for Android, built **only with open and free services**. No Google Maps, no API
keys, no accounts.

It is a personal project: made to be used by one person, not to serve thousands. That is a
choice, not a limitation — it means simple solutions are enough, and the public services run
by volunteers are plenty, as long as one is polite to them.

## Install

Go to [Releases](../../releases) and download the latest `PalmMap.apk`. Open it on the phone
and install.

It is the full app: it installs over the previous one without losing settings, saved places
or downloaded maps. You only need to allow installing apps from outside the Play Store, in
the browser or file manager that opens the file.

> Xiaomi/POCO phones usually show an extra security warning. If the install is blocked,
> turn off automatic app scanning in the security settings.

The APK is built only for **arm64-v8a**, the processor of every current Android phone.

## What it does

**Map** — drawn, satellite imagery or the public transport network, in light or dark theme
following the phone. It opens where you are; a double tap on the GPS button makes the map
follow you.

**Search** — addresses and businesses, by typing or by voice, with recent destinations and
saved places at hand.

**Updates itself** — tells you when there is a new version and installs it from Settings,
with no trip to GitHub to download the file by hand.

**Routes** — by car, on foot, by bike or by bus. With alternative routes, stops along the
way, and the option to avoid tolls.

**Navigation** — follows your position, reads the manoeuvres aloud, shows the lanes,
recalculates when you leave the route, warns about speed cameras and the road's speed
limit, shows your speed, keeps the screen on and saves battery on long straight roads.

**Public transport** — buses moving on the map, live, with the line number. The stops near
you with the time of the next bus, in real time, and the train and metro stations with
their timetables. Trips from one point to another with both. In the Lisbon Metropolitan
Area.

**Offline maps** — whole countries stored on the phone, working with no network at all, at
any zoom and in places you have never been. And the same for train timetables.

**Measuring tape** — distances and areas measured on the map, as in Google Earth.

**Portuguese and English** — follows the phone's language, and can be changed by hand in
Settings. The navigation voice, the search and even the decimal separator follow.

## Maps without a network

In Settings, under "Country maps", pick a country and it downloads. From then on that
country works in airplane mode: the GPS needs no Internet, and the map comes from the file
instead of the network.

Mainland Portugal is 325 MB; São Tomé and Príncipe is 2 MB. The difference from normal maps
is that these carry **geometry** instead of images — that is why a whole country fits in one
file.

| Already published |
| --- |
| Mainland Portugal, Madeira, Azores, São Tomé and Príncipe, Cape Verde, Guinea-Bissau, Spain, Italy, Germany, United Kingdom, Ireland, Netherlands, Belgium, Luxembourg, Switzerland, Austria |

The catalogue has 90 regions from all over the world; they are generated on request, with
the "Build offline maps" workflow. **Want another country?** [Open an issue](../../issues/new?title=Map%20request%3A%20)
saying which, or use "Missing a country? Ask on GitHub" at the end of the country list in
the app.

## What it does not do, and why

Worth saying plainly, because in almost every case it is not a lack of work — it is a lack
of open data.

**Live traffic.** There is none. It is what really sets Google Maps apart from everything
else, and its data and Waze's come from their own users' phones, by the million. TomTom and
HERE sell theirs. There is no clever solution waiting to be found here.

**Reports from people** (accidents, police, roadworks). Same reason: they come from millions
of phones sending to a company's server.

**Toll prices.** Portugal has no open source with the amounts. The app avoids tolls if asked,
but does not tell you what they cost.

**Mobile speed cameras.** They are on no map — they move every day. Fixed ones, red-light
cameras and average-speed checks are announced, from OpenStreetMap. It is a help, not a
guarantee.

**Timetables outside Lisbon.** Only the Lisbon Metropolitan Area has an open source with
real-time times. In the rest of the country each operator keeps its own.

**Real time for trains and the metro.** For these there is the timetable — CP, Metro de
Lisboa and Metro Sul do Tejo download in Settings and then work offline — but not the
delay. Only Carris Metropolitana buses publish real time, and they are the only ones that
get a green dot here.

**Fertagus, Tagus ferries and Carris de Lisboa.** No open timetable could be found. Their
stations show on the map, without times.

**Detailed satellite imagery outside Portugal.** Sentinel-2 sees the Earth at 10 metres per
pixel, and it is the best there is for free worldwide. In Portugal there are the state's
orthophotos, which see at under a metre.

## How it is built

| What for | Choice |
| --- | --- |
| Base | React Native 0.86 + Expo SDK 57, in TypeScript |
| Map | [MapLibre](https://maplibre.org/) — free, with no tie to Google |
| Map tiles | [OpenStreetMap](https://www.openstreetmap.org/) (inverted on the phone for the dark theme), business pins from [OpenFreeMap](https://openfreemap.org/) |
| Satellite | [EOX Sentinel-2 cloudless](https://s2maps.eu/), and the [DGT orthophotos](https://www.dgterritorio.gov.pt/) in Portugal |
| Transport map | [ÖPNVKarte](https://www.öpnvkarte.de/), from memomaps.de |
| Search | [Nominatim](https://nominatim.org/), with [Photon](https://photon.komoot.io/) as a fallback |
| Businesses, cameras and speed limits | [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) |
| Routes | [OSRM](https://project-osrm.org/) on the [FOSSGIS](https://routing.openstreetmap.de/) servers |
| Timetables | [Carris Metropolitana open API](https://github.com/carrismetropolitana/api), and static GTFS from the other operators |
| Offline maps | [Protomaps](https://protomaps.com/) (PMTiles), cut from the world map |

There are no servers of our own. The APK is built in a GitHub Actions workflow, and the
offline maps are generated in another — neither needs a computer or a paid account.

## Credits

The map data comes from the **OpenStreetMap** contributors, under the
[ODbL](https://www.openstreetmap.org/copyright). The satellite imagery is **Sentinel-2
cloudless by EOX IT Services GmbH**, with modified Copernicus Sentinel data. The Portuguese
orthophotos are from the **Direção-Geral do Território**. The transport map is
**memomaps.de**, under CC-BY-SA. Routes are calculated by **OSRM** on **FOSSGIS** servers.
Bus times come from **Carris Metropolitana**.

None of this charges this project anything. If any of these services is useful to you,
consider contributing to them.

## Development

```bash
npm install
npx expo start
```

MapLibre ships native code, so **Expo Go will not do** — you need a *development build*:

```bash
npx expo run:android        # with Android Studio installed
```

Before calling work done:

```bash
npx tsc --noEmit
```

[`CLAUDE.md`](CLAUDE.md) explains the reason behind every decision in the project,
including the mistakes already made and what was learnt from them. If you are going to
touch the code, start there. (It is still in Portuguese; the translation is under way.)

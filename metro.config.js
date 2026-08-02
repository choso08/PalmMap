// Configuração do empacotador do Expo.
//
// O `.pmtiles` é o mapa de um país inteiro e os `.pbf` são os tipos de letra do
// mapa. Nenhuma das duas extensões vem reconhecida de origem — sem isto, o
// empacotador tentava lê-las como código e a compilação falhava.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('pmtiles', 'pbf');

module.exports = config;

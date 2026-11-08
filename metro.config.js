// Configuration for Expo's bundler.
//
// The `.pmtiles` file is a whole country's map and the `.pbf` files are the
// map's fonts. Neither extension is recognised out of the box — without this,
// the bundler tried to read them as code and the build failed.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('pmtiles', 'pbf');

module.exports = config;

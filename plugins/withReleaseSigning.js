// Signs the release APK with PalmMap's own key instead of React Native's
// public debug key (`debug.keystore`, which everyone has: anyone could sign an
// APK that Android accepts as an update of PalmMap). Author's decision,
// November 2026.
//
// The key never enters the repository. The build workflow writes it from the
// repository's secrets to a temporary file and hands its path and passwords in
// the environment; Gradle reads them when it signs. Without
// `PALMMAP_KEYSTORE` (a build on someone's computer) nothing changes and the
// release stays debug-signed — the workflow refuses that case itself.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            storeFile file(System.getenv('PALMMAP_KEYSTORE'))
            storePassword System.getenv('PALMMAP_KEYSTORE_PASSWORD')
            keyAlias System.getenv('PALMMAP_KEY_ALIAS')
            keyPassword System.getenv('PALMMAP_KEY_PASSWORD')
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!process.env.PALMMAP_KEYSTORE) {
      return mod;
    }
    let gradle = mod.modResults.contents;
    if (gradle.includes("System.getenv('PALMMAP_KEYSTORE')")) {
      return mod;
    }
    // 1. A `release` signing config beside the template's `debug` one.
    if (!/signingConfigs\s*\{/.test(gradle)) {
      throw new Error('withReleaseSigning: no signingConfigs block in app/build.gradle');
    }
    gradle = gradle.replace(/signingConfigs\s*\{/, (m) => m + RELEASE_CONFIG);
    // 2. The release build type uses it. The template's release block says
    //    `signingConfig signingConfigs.debug`; only that one is changed.
    const buildTypes = gradle.search(/buildTypes\s*\{/);
    const release = gradle.indexOf('release {', buildTypes);
    const line = gradle.indexOf('signingConfig signingConfigs.debug', release);
    if (buildTypes < 0 || release < 0 || line < 0) {
      throw new Error('withReleaseSigning: release build type not found in app/build.gradle');
    }
    gradle =
      gradle.slice(0, line) +
      'signingConfig signingConfigs.release' +
      gradle.slice(line + 'signingConfig signingConfigs.debug'.length);
    mod.modResults.contents = gradle;
    return mod;
  });
};

// Lets old Androids reach the DGT's orthophoto server.
//
// `ortos.dgterritorio.gov.pt` sends a certificate chain that ends on "HARICA TLS
// RSA Root CA 2021" (probed, `sondar: tls_chains`). Android only trusts the roots
// it shipped with, and Android 11 and older never got that one: on a Galaxy A20e
// (Android 11) every orthophoto request failed the TLS handshake, silently, and
// "High" satellite showed Sentinel-2 stretched — while a recent phone was sharp.
//
// The fix is Android's own mechanism (network security config): that one root,
// the public certificate in `assets/certs/` (`.crt`: `*.pem` is gitignored for keys) (SHA-256 D9:5D:0E:8E:…:CB:7B:1D, the
// same as in Mozilla's and Debian's stores), is added **for that host only**,
// next to the system's roots. Everything else keeps the system's roots alone.
//
// Cleartext stays off in release, as Android's default; the debug variant gets
// its own copy that allows it, because a development build talks to Metro over
// plain http and a network security config replaces the debug manifest's
// `usesCleartextTraffic`.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const CERT = 'harica_tls_rsa_root_2021';
const HOSTS = ['ortos.dgterritorio.gov.pt'];

function configXml(cleartext) {
  const domains = HOSTS.map((h) => `      <domain includeSubdomains="false">${h}</domain>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="${cleartext}">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config>
${domains}
    <trust-anchors>
      <certificates src="system" />
      <certificates src="@raw/${CERT}" />
    </trust-anchors>
  </domain-config>
</network-security-config>
`;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

module.exports = function withExtraTrust(config) {
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const root = mod.modRequest.projectRoot;
      const app = path.join(mod.modRequest.platformProjectRoot, 'app', 'src');
      fs.mkdirSync(path.join(app, 'main', 'res', 'raw'), { recursive: true });
      fs.copyFileSync(
        path.join(root, 'assets', 'certs', `${CERT}.crt`),
        path.join(app, 'main', 'res', 'raw', `${CERT}.crt`),
      );
      write(path.join(app, 'main', 'res', 'xml', 'network_security_config.xml'), configXml(false));
      write(path.join(app, 'debug', 'res', 'xml', 'network_security_config.xml'), configXml(true));
      return mod;
    },
  ]);
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return mod;
  });
};

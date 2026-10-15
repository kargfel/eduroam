/**
 * ch2.test.js – Unit-Tests für Kapitel 2 „Die Konfiguration“ (src/logic/ch2Config.js).
 *
 * Prüft die reine Kapitel-Logik Ch2Logic: validateConfig (Vertrag: { ok, field, code,
 * message, hint }) mit Prüfreihenfolge wie bei einer echten PEAP-Anmeldung, Domain-
 * Abgleich (Suffix wie Android), Tastatur-Troll (EN-Layout, y↔z), Autokorrektur,
 * Auswahllisten, Merkblatt-/Netzwerkdaten aus CAMPUS, Verbindungsablauf (über RNG),
 * Mitleids-Tipps und das Frust-Budget laut Briefing (vernünftig 8–12 %, schludrig 25–35 %).
 *
 * Aufruf: node --test "tests/unit/ch2.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { CONFIG, CAMPUS, Ch2Logic } = loadScripts(
  [...CORE_LOGIC_FILES, 'src/logic/ch2Config.js'],
  ['CONFIG', 'CAMPUS', 'Ch2Logic']
);

/** Echter RNG aus src/core/rng.js – null, solange der Kern noch fehlt. */
const REAL_RNG = vm.runInThisContext(
  "typeof RNG !== 'undefined' && RNG && typeof RNG.int === 'function' ? RNG : null"
);

const { STATUS, CODES } = Ch2Logic;
const PASSWORD = CAMPUS.defaultPassword;

/** Korrekte Konfiguration (wie ein perfekter Spieler). */
const solution = () => Ch2Logic.getSolution(CAMPUS, PASSWORD);

/** Lösung mit überschriebenen Feldern prüfen. */
const check = (overrides = {}, options = { expectedPassword: PASSWORD }) =>
  Ch2Logic.validateConfig({ ...solution(), ...overrides }, CAMPUS, options);

/** Deterministischer Ersatz-RNG (LCG) mit der RNG-Schnittstelle. */
function makeFakeRng(seed = 1) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => [...items],
  };
}

// ---------------------------------------------------------------------------
// Grundgerüst
// ---------------------------------------------------------------------------

test('Ch2Logic ist eingefroren und bietet validateConfig laut Vertrag', () => {
  assert.equal(typeof Ch2Logic.validateConfig, 'function');
  assert.ok(Object.isFrozen(Ch2Logic), 'Ch2Logic muss eingefroren sein');
  assert.ok(Object.isFrozen(Ch2Logic.STATUS));
  assert.ok(Object.isFrozen(Ch2Logic.CODES));
  for (const field of ['eapMethod', 'phase2', 'caCert', 'ocsp', 'domain', 'identity', 'anonymousIdentity', 'password']) {
    assert.ok(Ch2Logic.FIELDS.includes(field), `Feld ${field} fehlt in FIELDS`);
    assert.equal(typeof Ch2Logic.FIELD_LABELS[field], 'string', `Label für ${field} fehlt`);
  }
});

test('Lösung: ok, Code OK, Status „Verbunden, kein Internet“, anonyme Identität korrekt', () => {
  const result = check();
  assert.equal(result.ok, true);
  assert.equal(result.code, CODES.OK);
  assert.equal(result.field, null);
  assert.equal(result.hint, null);
  assert.equal(result.message, STATUS.CONNECTED_NO_INTERNET);
  assert.equal(result.message, 'Verbunden, kein Internet');
  assert.equal(result.isAnonymousIdentityCorrect, true);

  const config = solution();
  assert.equal(config.eapMethod, CAMPUS.wifi.eapMethod);
  assert.equal(config.phase2, CAMPUS.wifi.phase2);
  assert.equal(config.caCert, CAMPUS.wifi.caCertOption);
  assert.equal(config.ocsp, CAMPUS.wifi.ocsp);
  assert.equal(config.domain, CAMPUS.wifi.domain);
  assert.equal(config.identity, CAMPUS.identity);
  assert.equal(config.anonymousIdentity, CAMPUS.anonymousIdentity);
  assert.equal(config.password, PASSWORD);
});

test('validateConfig verändert die Eingabe nicht und verträgt eingefrorene Objekte', () => {
  const config = Object.freeze({ ...solution(), identity: `  ${CAMPUS.identity} ` });
  const before = JSON.stringify(config);
  const result = Ch2Logic.validateConfig(config, CAMPUS, { expectedPassword: PASSWORD });
  assert.equal(result.ok, true, 'Leerzeichen am Rand der Identität sind egal');
  assert.equal(JSON.stringify(config), before);
});

test('ohne expectedPassword gilt CAMPUS.defaultPassword; expectedPassword hat Vorrang', () => {
  const own = 'Spätzle#2026-WWI26A';
  assert.equal(Ch2Logic.validateConfig(solution(), CAMPUS).ok, true);
  const withOwn = Ch2Logic.validateConfig({ ...solution(), password: own }, CAMPUS, { expectedPassword: own });
  assert.equal(withOwn.ok, true);
  const oldOne = Ch2Logic.validateConfig(solution(), CAMPUS, { expectedPassword: own });
  assert.equal(oldOne.code, CODES.PASSWORD);
});

// ---------------------------------------------------------------------------
// Pflichtfelder → „Gespeichert“
// ---------------------------------------------------------------------------

test('fehlende Pflichtfelder → nur „Gespeichert“ mit betroffenem Feld', () => {
  const cases = [
    [{ caCert: null }, CODES.CA_MISSING, 'caCert'],
    [{ caCert: '' }, CODES.CA_MISSING, 'caCert'],
    [{ domain: '' }, CODES.DOMAIN_MISSING, 'domain'],
    [{ domain: '   ' }, CODES.DOMAIN_MISSING, 'domain'],
    [{ identity: '' }, CODES.IDENTITY_MISSING, 'identity'],
    [{ password: '' }, CODES.PASSWORD_MISSING, 'password'],
  ];
  for (const [overrides, code, field] of cases) {
    const result = check(overrides);
    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.equal(result.code, code, JSON.stringify(overrides));
    assert.equal(result.field, field);
    assert.equal(result.message, STATUS.SAVED);
    assert.equal(result.message, 'Gespeichert');
  }
});

test('Feldfehler ersetzen die Beschriftung: nennen das Feld, kurz genug; Auth-Probleme ohne Feldfehler', () => {
  const cases = [
    [{ caCert: null }, 'caCert'],
    [{ domain: '' }, 'domain'],
    [{ identity: '' }, 'identity'],
    [{ password: '' }, 'password'],
  ];
  for (const [overrides, field] of cases) {
    const result = check(overrides);
    const message = Ch2Logic.getFieldError(result.code);
    assert.equal(result.field, field);
    assert.ok(message && message.includes(Ch2Logic.FIELD_LABELS[field]), `${result.code}: „${message}“`);
    assert.ok(message.length <= 32, `„${message}“ passt in die Beschriftungszeile`);
  }
  for (const overrides of [{ password: 'x' }, { identity: CAMPUS.username }, { domain: CAMPUS.realm }]) {
    assert.equal(Ch2Logic.getFieldError(check(overrides).code), null, 'Authentifizierungsprobleme bleiben vage');
  }
});

test('„Nicht validieren“ gibt es seit Android 11 nicht mehr → CA_NOT_ALLOWED', () => {
  const result = check({ caCert: Ch2Logic.OPTION.CA_NO_VALIDATE });
  assert.equal(result.code, CODES.CA_NOT_ALLOWED);
  assert.equal(result.field, 'caCert');
  assert.equal(result.message, STATUS.SAVED);
  assert.match(result.hint, /Android 11/);
});

test('„Zertifikate installieren“ ist keine Auswahl → wie fehlendes CA-Zertifikat', () => {
  assert.equal(check({ caCert: Ch2Logic.OPTION.CA_INSTALL }).code, CODES.CA_MISSING);
});

test('veraltete Root-CA aus dem Merkblatt → Authentifizierungsproblem (CA_OUTDATED)', () => {
  const result = check({ caCert: CAMPUS.certificate.outdatedRootCA });
  assert.equal(result.code, CODES.CA_OUTDATED);
  assert.equal(result.field, 'caCert');
  assert.equal(result.message, STATUS.AUTH_PROBLEM);
  assert.ok(result.hint.includes(CAMPUS.wifi.caCertOption));
});

// ---------------------------------------------------------------------------
// Domain (Android vergleicht mit dem Server-Zertifikat, Suffix-Abgleich)
// ---------------------------------------------------------------------------

test('Domain: Servername, Suffix, Großschreibung und Leerzeichen werden akzeptiert', () => {
  const server = CAMPUS.certificate.serverName;
  const parentDomain = server.split('.').slice(1).join('.'); // dhbw-stuttgart.de
  for (const domain of [server, server.toUpperCase(), ` ${server} `, `${server}.`, parentDomain]) {
    assert.equal(check({ domain }).ok, true, `Domain „${domain}“ sollte passen`);
  }
  assert.equal(Ch2Logic.matchesDomain(parentDomain, server), true);
});

test('Domain: Realm, fremde Domains, Tippfehler und zu kurze Angaben → DOMAIN_MISMATCH', () => {
  const server = CAMPUS.certificate.serverName;
  const wrong = [
    CAMPUS.realm,                       // lehre.dhbw-stuttgart.de (der Klassiker)
    'dhbw.de',
    'de',                               // nur TLD: viel zu unspezifisch
    `evil-${server}`,                   // kein Suffix an einer Punkt-Grenze
    `${server}.evil.example`,
    `https://${server}`,
    server.replace('stuttgart', 'stutgart'),
  ];
  for (const domain of wrong) {
    const result = check({ domain });
    assert.equal(result.code, CODES.DOMAIN_MISMATCH, `Domain „${domain}“`);
    assert.equal(result.field, 'domain');
    assert.equal(result.message, STATUS.DOMAIN_MISMATCH);
    assert.equal(result.message, 'Domain stimmt nicht überein');
    assert.ok(result.hint.includes(server), 'Hinweis nennt den Servernamen');
  }
});

// ---------------------------------------------------------------------------
// EAP, Phase 2, OCSP
// ---------------------------------------------------------------------------

test('EAP-Methode und Phase 2 müssen stimmen → Authentifizierungsproblem', () => {
  for (const eapMethod of ['TTLS', 'TLS', 'PWD', 'SIM']) {
    const result = check({ eapMethod });
    assert.equal(result.code, CODES.EAP_METHOD, eapMethod);
    assert.equal(result.field, 'eapMethod');
    assert.equal(result.message, STATUS.AUTH_PROBLEM);
  }
  for (const phase2 of [Ch2Logic.OPTION.PHASE2_NONE, 'GTC']) {
    const result = check({ phase2 });
    assert.equal(result.code, CODES.PHASE2, phase2);
    assert.equal(result.field, 'phase2');
    assert.equal(result.message, STATUS.AUTH_PROBLEM);
  }
});

test('Online-Zertifikatstatus: „Nicht bestätigen“ und „anfordern“ ok, „erforderlich“ scheitert', () => {
  assert.equal(check({ ocsp: CAMPUS.wifi.ocsp }).ok, true);
  assert.equal(check({ ocsp: Ch2Logic.OPTION.OCSP_REQUEST }).ok, true);
  const result = check({ ocsp: Ch2Logic.OPTION.OCSP_REQUIRE });
  assert.equal(result.code, CODES.OCSP_REQUIRED);
  assert.equal(result.field, 'ocsp');
  assert.equal(result.message, STATUS.AUTH_PROBLEM);
});

// ---------------------------------------------------------------------------
// Identität und anonyme Identität
// ---------------------------------------------------------------------------

test('Identität: ohne Realm (Merkblatt 2014), falscher Realm, falsche Kennung', () => {
  const noRealm = check({ identity: CAMPUS.username });
  assert.equal(noRealm.code, CODES.IDENTITY_NO_REALM);
  assert.equal(noRealm.field, 'identity');
  assert.equal(noRealm.message, STATUS.AUTH_PROBLEM);
  assert.ok(noRealm.hint.includes(CAMPUS.identity), 'Hinweis nennt die vollständige Identität');

  const autocorrected = check({ identity: `${CAMPUS.username}@lehrer.dhbw-stuttgart.de` });
  assert.equal(autocorrected.code, CODES.IDENTITY_REALM);
  assert.ok(autocorrected.hint.includes(CAMPUS.realm));

  const exampleUser = check({ identity: `${Ch2Logic.MERKBLATT_EXAMPLE_USERNAME}@${CAMPUS.realm}` });
  assert.equal(exampleUser.code, CODES.IDENTITY_USER);
  assert.ok(exampleUser.hint.includes(CAMPUS.username), 'Hinweis nennt die eigene Kennung');
});

test('Identität/Domain mit EN-Tastatur getippt („-“ → „/“) → eigener Hinweis zur Tastatur', () => {
  const { EN } = Ch2Logic.KEYBOARD;
  const identity = check({ identity: Ch2Logic.applyLayout(CAMPUS.identity, EN) });
  assert.equal(identity.code, CODES.IDENTITY_LAYOUT);
  assert.equal(identity.field, 'identity');
  assert.equal(identity.message, STATUS.AUTH_PROBLEM, 'Systemmeldung bleibt vage');
  assert.match(identity.hint, /English/);
  assert.ok(identity.hint.includes(CAMPUS.identity));

  const server = CAMPUS.certificate.serverName;
  for (const domain of [server, server.split('.').slice(1).join('.')]) {
    const result = check({ domain: Ch2Logic.applyLayout(domain, EN) });
    assert.equal(result.code, CODES.DOMAIN_LAYOUT, domain);
    assert.equal(result.message, STATUS.DOMAIN_MISMATCH);
    assert.match(result.hint, /English/);
    assert.ok(result.hint.includes(server));
  }
  assert.equal(Ch2Logic.getGroup(CODES.IDENTITY_LAYOUT), Ch2Logic.getGroup(CODES.IDENTITY_REALM));
  assert.equal(Ch2Logic.getGroup(CODES.DOMAIN_LAYOUT), Ch2Logic.getGroup(CODES.DOMAIN_MISMATCH));
});

test('Identität: Groß-/Kleinschreibung ist egal', () => {
  assert.equal(check({ identity: CAMPUS.identity.toUpperCase() }).ok, true);
});

test('splitIdentity trennt am letzten @ und kennt „kein Realm“', () => {
  assert.deepEqual(Ch2Logic.splitIdentity(' Wwi26042@Lehre.DHBW-Stuttgart.de '), {
    user: 'wwi26042',
    realm: 'lehre.dhbw-stuttgart.de',
  });
  assert.deepEqual(Ch2Logic.splitIdentity('wwi26042'), { user: 'wwi26042', realm: null });
  assert.deepEqual(Ch2Logic.splitIdentity('a@b@c.de'), { user: 'a@b', realm: 'c.de' });
});

test('anonyme Identität: leer ok (ohne Erfolg), korrekt → Erfolg, falscher Realm → ANON_REALM', () => {
  const empty = check({ anonymousIdentity: '' });
  assert.equal(empty.ok, true, 'leer ist erlaubt (Android nimmt dann die Identität)');
  assert.equal(empty.isAnonymousIdentityCorrect, false);
  assert.ok(empty.notes.length > 0, 'Hinweis auf Klartext-Kennung');

  const upper = check({ anonymousIdentity: CAMPUS.anonymousIdentity.toUpperCase() });
  assert.equal(upper.ok, true);
  assert.equal(upper.isAnonymousIdentityCorrect, true);

  const ownName = check({ anonymousIdentity: CAMPUS.identity });
  assert.equal(ownName.ok, true, 'funktioniert, ist aber nicht anonym');
  assert.equal(ownName.isAnonymousIdentityCorrect, false);

  for (const anonymousIdentity of ['anonymous', 'anonymous@dhbw-stuttgart.de', 'anonymous@hb.dhbw-stuttgart.de']) {
    const result = check({ anonymousIdentity });
    assert.equal(result.code, CODES.ANON_REALM, anonymousIdentity);
    assert.equal(result.field, 'anonymousIdentity');
    assert.equal(result.message, STATUS.AUTH_PROBLEM);
    assert.ok(result.hint.includes(CAMPUS.anonymousIdentity));
  }
});

// ---------------------------------------------------------------------------
// Passwort
// ---------------------------------------------------------------------------

test('Passwort: falsch → PASSWORD, y/z vertauscht (EN-Tastatur) → PASSWORD_LAYOUT', () => {
  const wrong = check({ password: 'Brezel2025!Kehrwoche' });
  assert.equal(wrong.code, CODES.PASSWORD);
  assert.equal(wrong.field, 'password');
  assert.equal(wrong.message, STATUS.AUTH_PROBLEM);

  const swapped = check({ password: 'Breyel2026!Kehrwoche' });
  assert.equal(swapped.code, CODES.PASSWORD_LAYOUT);
  assert.equal(swapped.message, STATUS.AUTH_PROBLEM);
  assert.match(swapped.hint, /English|EN/);

  assert.equal(check({ password: PASSWORD.toLowerCase() }).code, CODES.PASSWORD, 'Groß-/Kleinschreibung zählt');
});

// ---------------------------------------------------------------------------
// Reihenfolge, Hinweise, Vagheit
// ---------------------------------------------------------------------------

test('Prüfreihenfolge: Pflichtfelder → EAP → Routing (Realm) → Zertifikat → innere Anmeldung', () => {
  const all = {
    eapMethod: 'TTLS',
    phase2: 'GTC',
    caCert: null,
    domain: 'dhbw.de',
    identity: CAMPUS.username,
    anonymousIdentity: 'anonymous',
    password: 'falsch',
  };
  const order = [];
  let config = { ...solution(), ...all };
  const fixes = {
    [CODES.CA_MISSING]: { caCert: CAMPUS.wifi.caCertOption },
    [CODES.EAP_METHOD]: { eapMethod: CAMPUS.wifi.eapMethod },
    [CODES.ANON_REALM]: { anonymousIdentity: CAMPUS.anonymousIdentity },
    [CODES.IDENTITY_NO_REALM]: { identity: CAMPUS.identity },
    [CODES.DOMAIN_MISMATCH]: { domain: CAMPUS.wifi.domain },
    [CODES.PHASE2]: { phase2: CAMPUS.wifi.phase2 },
    [CODES.PASSWORD]: { password: PASSWORD },
  };
  for (let guard = 0; guard < 10; guard++) {
    const result = Ch2Logic.validateConfig(config, CAMPUS, { expectedPassword: PASSWORD });
    if (result.ok) break;
    order.push(result.code);
    assert.ok(fixes[result.code], `unerwarteter Code ${result.code}`);
    config = { ...config, ...fixes[result.code] };
  }
  assert.deepEqual(order, [
    CODES.CA_MISSING,
    CODES.EAP_METHOD,
    CODES.ANON_REALM,
    CODES.IDENTITY_NO_REALM,
    CODES.DOMAIN_MISMATCH,
    CODES.PHASE2,
    CODES.PASSWORD,
  ]);
});

test('jeder Fehler-Code liefert einen klaren Hinweis und gehört zu einer Tipp-Gruppe', () => {
  const failing = Object.values(CODES).filter((code) => code !== CODES.OK);
  for (const code of failing) {
    const hint = Ch2Logic.getHint(code, CAMPUS);
    assert.equal(typeof hint, 'string', `Hinweis für ${code}`);
    assert.ok(hint.length >= 20 && hint.length <= 190, `Hinweis für ${code} hat ${hint.length} Zeichen`);
    assert.equal(typeof Ch2Logic.getGroup(code), 'string', `Gruppe für ${code}`);
  }
  assert.equal(Ch2Logic.getGroup(CODES.DOMAIN_MISSING), Ch2Logic.getGroup(CODES.DOMAIN_MISMATCH));
  assert.equal(Ch2Logic.getGroup(CODES.PASSWORD), Ch2Logic.getGroup(CODES.PASSWORD_LAYOUT));
  assert.notEqual(Ch2Logic.getGroup(CODES.PASSWORD), Ch2Logic.getGroup(CODES.IDENTITY_REALM));
});

test('Systemmeldungen sind absichtlich vage: nur drei Android-Zustände', () => {
  const vague = new Set([STATUS.SAVED, STATUS.AUTH_PROBLEM, STATUS.DOMAIN_MISMATCH]);
  const configs = [
    { caCert: null }, { domain: '' }, { identity: '' }, { password: '' },
    { eapMethod: 'TLS' }, { phase2: 'GTC' }, { ocsp: Ch2Logic.OPTION.OCSP_REQUIRE },
    { identity: CAMPUS.username }, { anonymousIdentity: 'anonymous' }, { password: 'x' },
    { domain: CAMPUS.realm }, { caCert: CAMPUS.certificate.outdatedRootCA },
  ];
  for (const overrides of configs) {
    const result = check(overrides);
    assert.ok(vague.has(result.message), `${result.code}: „${result.message}“`);
    assert.ok(!result.message.includes(CAMPUS.realm), 'Systemmeldung verrät nichts');
  }
});

// ---------------------------------------------------------------------------
// Tastatur-Troll und Autokorrektur
// ---------------------------------------------------------------------------

test('mapKey: EN-Layout vertauscht y/z (auch groß) und Umlaut-Tasten; DE ändert nichts', () => {
  const { DE, EN } = Ch2Logic.KEYBOARD;
  assert.equal(Ch2Logic.mapKey('z', EN), 'y');
  assert.equal(Ch2Logic.mapKey('y', EN), 'z');
  assert.equal(Ch2Logic.mapKey('Z', EN), 'Y');
  assert.equal(Ch2Logic.mapKey('Y', EN), 'Z');
  assert.equal(Ch2Logic.mapKey('ä', EN), "'");
  assert.equal(Ch2Logic.mapKey('ö', EN), ';');
  assert.equal(Ch2Logic.mapKey('ü', EN), '[');
  assert.equal(Ch2Logic.mapKey('ß', EN), '-');
  assert.equal(Ch2Logic.mapKey('-', EN), '/');
  for (const char of ['a', '@', '.', '1', '!', 'W']) assert.equal(Ch2Logic.mapKey(char, EN), char);
  for (const char of ['z', 'y', 'ä', '-']) assert.equal(Ch2Logic.mapKey(char, DE), char);
  assert.equal(Ch2Logic.applyLayout('Brezel-Spätzle', EN), "Breyel/Sp'tyle");
});

test('isLayoutMixup erkennt EN-Layout, aber keine normalen Tippfehler', () => {
  assert.equal(Ch2Logic.isLayoutMixup('Breyel2026!Kehrwoche', PASSWORD), true);
  assert.equal(Ch2Logic.isLayoutMixup('Brezel2026!Kehrwoche', PASSWORD), false, 'identisch ist kein Mixup');
  assert.equal(Ch2Logic.isLayoutMixup('Brezel2025!Kehrwoche', PASSWORD), false);
  assert.equal(Ch2Logic.isLayoutMixup('Breyel2026!Kehrwoch', PASSWORD), false, 'andere Länge');
  assert.equal(Ch2Logic.isLayoutMixup('', PASSWORD), false);
});

test('autocorrect: „@lehre.“ wird zu „@lehrer.“ – nur beim Punkt direkt hinter dem Wort', () => {
  const realmWord = CAMPUS.realm.split('.')[0];
  assert.equal(realmWord, 'lehre', 'Voraussetzung: Realm beginnt mit „lehre“');
  assert.equal(Ch2Logic.autocorrect('.', `${CAMPUS.username}@lehre`), 'r.');
  assert.equal(Ch2Logic.autocorrect('.', 'anonymous@Lehre'), 'r.', 'auch bei Großschreibung');
  assert.equal(Ch2Logic.autocorrect('.', `${CAMPUS.username}@lehrer`), null);
  assert.equal(Ch2Logic.autocorrect('x', `${CAMPUS.username}@lehre`), null);
  assert.equal(Ch2Logic.autocorrect('.', 'lehre'), null, 'nur direkt nach dem @');
  assert.equal(Ch2Logic.autocorrect('.', `${CAMPUS.username}@lehre.dhbw-stuttgart`), null);
});

// ---------------------------------------------------------------------------
// Daten für die Szene
// ---------------------------------------------------------------------------

test('getOptions: richtige Werte wählbar, „Nicht validieren“ und alte Root-CA gesperrt mit Hinweis', () => {
  const options = Ch2Logic.getOptions(CAMPUS);
  const find = (list, value) => list.find((option) => option.value === value);
  assert.ok(find(options.eapMethod, CAMPUS.wifi.eapMethod) && !find(options.eapMethod, CAMPUS.wifi.eapMethod).disabled);
  assert.ok(find(options.phase2, CAMPUS.wifi.phase2) && !find(options.phase2, CAMPUS.wifi.phase2).disabled);
  assert.ok(find(options.caCert, CAMPUS.wifi.caCertOption) && !find(options.caCert, CAMPUS.wifi.caCertOption).disabled);
  assert.ok(find(options.ocsp, CAMPUS.wifi.ocsp) && !find(options.ocsp, CAMPUS.wifi.ocsp).disabled);

  const noValidate = find(options.caCert, Ch2Logic.OPTION.CA_NO_VALIDATE);
  assert.ok(noValidate && noValidate.disabled === true && /Android 11/.test(noValidate.hint));
  const outdated = find(options.caCert, CAMPUS.certificate.outdatedRootCA);
  assert.ok(outdated && outdated.disabled === true && outdated.hint.length > 10);
  const install = find(options.caCert, Ch2Logic.OPTION.CA_INSTALL);
  assert.ok(install && install.disabled === true && /Internet/.test(install.hint), 'Catch-22-Hinweis');

  for (const list of Object.values(options)) {
    for (const option of list) {
      assert.equal(typeof option.label, 'string');
      assert.ok('value' in option);
    }
  }
});

test('getDefaultConfig: Android-Startwerte, noch nicht verbindungsfähig', () => {
  const config = Ch2Logic.getDefaultConfig(CAMPUS);
  assert.equal(config.eapMethod, 'PEAP');
  assert.equal(config.phase2, Ch2Logic.OPTION.PHASE2_NONE);
  assert.equal(config.caCert, null);
  assert.equal(config.ocsp, CAMPUS.wifi.ocsp);
  assert.equal(config.domain, '');
  assert.equal(config.identity, '');
  assert.equal(config.anonymousIdentity, '');
  assert.equal(config.password, '');
  assert.equal(Ch2Logic.validateConfig(config, CAMPUS).ok, false);
});

test('getNetworks: eduroam zuerst und gespeichert, Gast-WLAN aus CAMPUS, alle mit Pegel und Reaktion', () => {
  const networks = Ch2Logic.getNetworks(CAMPUS);
  assert.ok(networks.length >= 5 && networks.length <= 7, `${networks.length} Netze`);
  assert.equal(networks[0].ssid, CAMPUS.wifi.ssid);
  assert.equal(networks[0].id, 'eduroam');
  assert.equal(networks[0].isSaved, true);
  assert.ok(networks.some((net) => net.ssid === CAMPUS.wifi.guestSsid));
  assert.ok(networks.some((net) => net.ssid === 'FRITZ!Box 7590 XY'));
  assert.ok(networks.some((net) => /Kevin/.test(net.ssid)));
  const ids = new Set();
  for (const net of networks) {
    assert.ok(Number.isInteger(net.level) && net.level >= 0 && net.level <= 4, `${net.ssid}: Pegel`);
    assert.equal(typeof net.isSecured, 'boolean');
    ids.add(net.id);
    if (net.id !== 'eduroam') {
      assert.ok(net.reaction && typeof net.reaction.text === 'string' && net.reaction.text.length > 10, `${net.ssid}: Reaktion`);
    }
  }
  assert.equal(ids.size, networks.length, 'IDs eindeutig');
});

test('getOldProfile: altes Profil vom Schnupperstudium, sichtbar falsche Identität', () => {
  const profile = Ch2Logic.getOldProfile(CAMPUS);
  assert.equal(profile.ssid, CAMPUS.wifi.ssid);
  assert.ok(!profile.identity.endsWith(CAMPUS.realm), 'fremder Realm');
  assert.ok(Array.isArray(profile.rows) && profile.rows.length >= 3);
  for (const row of profile.rows) assert.ok(row.label && row.value);
});

test('getMerkblatt: veraltete Angaben (Root-CA, Kennung ohne Realm) und Servername aus CAMPUS', () => {
  const sheet = Ch2Logic.getMerkblatt(CAMPUS);
  const all = [...sheet.steps, ...sheet.technical];
  const text = all.map((line) => line.text).join('\n');
  assert.ok(text.includes(CAMPUS.certificate.outdatedRootCA));
  assert.ok(text.includes(CAMPUS.certificate.serverName));
  assert.ok(text.includes(CAMPUS.wifi.eapMethod) && text.includes(CAMPUS.wifi.phase2));
  assert.ok(text.includes('Nicht validieren'));
  assert.match(sheet.date, /2014/);
  const identityStep = sheet.steps.find((line) => line.id === 'identity');
  assert.ok(identityStep && identityStep.isOutdated, 'Identität ist veraltet markiert');
  assert.ok(!identityStep.text.includes('@'), 'Merkblatt-Kennung ohne Realm');
  const ids = new Set(all.map((line) => line.id));
  for (const note of [...sheet.annotations, ...sheet.corrections]) {
    assert.ok(ids.has(note.anchor), `Anker ${note.anchor} existiert`);
    assert.ok(note.text.length > 3);
  }
  assert.ok(sheet.annotations.some((note) => note.text.includes(CAMPUS.realm)), 'Randnotiz mit Realm');
  assert.ok(sheet.corrections.some((note) => note.text.includes(CAMPUS.anonymousIdentity)));
});

test('getCredentialNote: Post-it mit Kennung und Passwort aus den Credentials', () => {
  const note = Ch2Logic.getCredentialNote({ username: CAMPUS.username, password: 'Geheim#1', isDefault: false });
  const text = note.lines.join('\n');
  assert.ok(text.includes(CAMPUS.username));
  assert.ok(text.includes('Geheim#1'));
  assert.equal(typeof note.title, 'string');
});

// ---------------------------------------------------------------------------
// Verbindungsablauf, Mitleids-Tipps, Balance
// ---------------------------------------------------------------------------

test('getConnectionPlan: Speichern kurz, Fehlversuch ohne IP-Schritt, Erfolg mit IP-Schritt', () => {
  const rng = makeFakeRng(7);
  const saved = Ch2Logic.getConnectionPlan(check({ caCert: null }), rng);
  assert.equal(saved.finalStatus, STATUS.SAVED);
  assert.equal(saved.steps.length, 1);
  assert.equal(saved.steps[0].status, STATUS.SAVING);

  const failed = Ch2Logic.getConnectionPlan(check({ password: 'x' }), rng);
  assert.equal(failed.finalStatus, STATUS.AUTH_PROBLEM);
  assert.deepEqual(failed.steps.map((step) => step.status), [STATUS.CONNECTING, STATUS.AUTHENTICATING]);

  const success = Ch2Logic.getConnectionPlan(check(), rng);
  assert.equal(success.finalStatus, STATUS.CONNECTED_NO_INTERNET);
  assert.deepEqual(success.steps.map((step) => step.status), [STATUS.CONNECTING, STATUS.AUTHENTICATING, STATUS.OBTAINING_IP]);

  for (const plan of [saved, failed, success]) {
    const total = plan.steps.reduce((sum, step) => sum + step.ms, 0);
    for (const step of plan.steps) assert.ok(Number.isInteger(step.ms) && step.ms >= 250, `${step.status}: ${step.ms} ms`);
    assert.ok(total <= 3600, `Wartezeit ${total} ms ist zu lang`);
  }

  const old = Ch2Logic.getConnectionPlan(Ch2Logic.OLD_PROFILE_RESULT, rng);
  assert.equal(old.finalStatus, STATUS.AUTH_PROBLEM);
});

test('getConnectionPlan ist deterministisch mit gleichem RNG-Zustand und läuft auch ohne RNG', () => {
  const a = Ch2Logic.getConnectionPlan(check(), makeFakeRng(42));
  const b = Ch2Logic.getConnectionPlan(check(), makeFakeRng(42));
  assert.deepEqual(a, b);
  const fallback = Ch2Logic.getConnectionPlan(check(), null);
  assert.equal(fallback.steps.length, 3);
});

test('mit echtem RNG (src/core/rng.js): gleicher Seed → gleicher Ablauf', { skip: !REAL_RNG && 'RNG noch nicht verfügbar' }, () => {
  REAL_RNG.seed(7);
  const a = Ch2Logic.getConnectionPlan(check());
  REAL_RNG.seed(7);
  const b = Ch2Logic.getConnectionPlan(check());
  assert.deepEqual(a, b, 'ohne rng-Parameter wird der globale RNG genutzt');
});

test('createFailTracker: Mitleids-Tipp nach 2 Fehlern derselben Gruppe bzw. ab 4 Fehlern insgesamt', () => {
  const tracker = Ch2Logic.createFailTracker();
  let info = tracker.record(CODES.DOMAIN_MISSING);
  assert.equal(info.groupCount, 1);
  assert.equal(info.shouldShowTip, false);
  info = tracker.record(CODES.DOMAIN_MISMATCH);
  assert.equal(info.groupCount, 2, 'gleiche Gruppe „Zertifikat“');
  assert.equal(info.shouldShowTip, true);

  const other = Ch2Logic.createFailTracker();
  assert.equal(other.record(CODES.PASSWORD).shouldShowTip, false);
  assert.equal(other.record(CODES.IDENTITY_REALM).shouldShowTip, false);
  assert.equal(other.record(CODES.EAP_METHOD).shouldShowTip, false);
  const fourth = other.record(CODES.ANON_REALM);
  assert.equal(fourth.total, 4);
  assert.equal(fourth.shouldShowTip, true, 'Sicherheitsnetz ab dem 4. Fehler');
  assert.equal(other.getTotal(), 4);
  assert.equal(other.getCount(Ch2Logic.getGroup(CODES.PASSWORD)), 1);
});

test('getPenalty: „Gespeichert“ klein, Authentifizierungsproblem mittel + Zeit + Stempel (max. 2)', () => {
  const saved = Ch2Logic.getPenalty(check({ caCert: null }));
  assert.equal(saved.frustration, CONFIG.FRUSTRATION.SMALL);
  assert.equal(saved.minutes, 0);
  assert.equal(saved.stamp, null);

  const auth = Ch2Logic.getPenalty(check({ password: 'x' }), { stampsShown: 0 });
  assert.equal(auth.frustration, CONFIG.FRUSTRATION.MEDIUM);
  assert.equal(auth.minutes, CONFIG.PENALTY_MINUTES.SMALL);
  assert.equal(auth.stamp, 'ABGELEHNT');
  assert.equal(Ch2Logic.getPenalty(check({ password: 'x' }), { stampsShown: 2 }).stamp, null, 'Stempel sparsam');

  const domain = Ch2Logic.getPenalty(check({ domain: CAMPUS.realm }));
  assert.equal(domain.frustration, CONFIG.FRUSTRATION.SMALL);
  assert.equal(domain.stamp, null);

  const old = Ch2Logic.getPenalty(Ch2Logic.OLD_PROFILE_RESULT);
  assert.equal(old.frustration, CONFIG.FRUSTRATION.TINY);
  assert.equal(old.stamp, null);
  for (const penalty of [saved, auth, domain, old]) assert.ok(penalty.reason.length > 3);
});

test('Frust-Budget laut Briefing: vernünftig 8–12 %, schludrig 25–35 %', () => {
  const sum = (results) => {
    let stampsShown = 0;
    let total = Ch2Logic.BALANCE.OLD_PROFILE_FIRST_CONTACT; // Handy probiert das alte Profil
    for (const result of results) {
      const penalty = Ch2Logic.getPenalty(result, { stampsShown });
      if (penalty.stamp) stampsShown += 1;
      total += penalty.frustration;
    }
    return total - CONFIG.FRUSTRATION.SMALL; // succeed() baut etwas Frust ab
  };
  // Vernünftig: Domain vergessen, einmal von der EN-Tastatur erwischt
  const reasonable = sum([check({ domain: '' }), check({ password: 'Breyel2026!Kehrwoche' })]);
  assert.ok(reasonable >= 8 && reasonable <= 12, `vernünftig: ${reasonable} %`);
  // Schludrig: altes Profil zweimal probiert, Merkblatt blind abgetippt, Realm als Domain …
  const sloppy = sum([
    Ch2Logic.OLD_PROFILE_RESULT,
    Ch2Logic.OLD_PROFILE_RESULT,
    check({ caCert: null }),
    check({ domain: '' }),
    check({ identity: CAMPUS.username }),
    check({ domain: CAMPUS.realm }),
    check({ password: 'Breyel2026!Kehrwoche' }),
  ]);
  assert.ok(sloppy >= 25 && sloppy <= 35, `schludrig: ${sloppy} %`);
});

test('OBJECTIVES und TEXTS sind deutsch, kurz und vollständig', () => {
  for (const [key, text] of Object.entries(Ch2Logic.OBJECTIVES)) {
    assert.equal(typeof text, 'string', key);
    // HUD: ca. 312 px für „Aufgabe: …“ → höchstens 38 Zeichen, sonst wird gekürzt
    assert.ok(text.length > 5 && text.length <= 38, `Aufgabe ${key} hat ${text.length} Zeichen`);
  }
  for (const key of ['KEYBOARD_SWITCHED', 'AUTOCORRECT', 'OLD_PROFILE_REMOVED', 'CONNECTED', 'NO_REAL_CREDENTIALS']) {
    assert.equal(typeof Ch2Logic.TEXTS[key], 'string', `TEXTS.${key}`);
  }
  assert.ok(Ch2Logic.TEXTS.NO_REAL_CREDENTIALS.includes('keine echten Zugangsdaten'));
});

/**
 * ============================================================================
 * StreamHub — Node.js Test-Runner (tests/run-tests.js)
 * ============================================================================
 * Führt Unit-Tests für die JS-Module aus.
 * Starten mit: npm test  ODER  node tests/run-tests.js
 *
 * Testgruppen:
 *   1. Syntaxcheck aller JS-Dateien im js/-Ordner
 *   2. getVideoProgressKey           (storage.js)
 *   3. saveVideoProgress / getVideoProgress Roundtrip  (storage.js)
 *   4. removeHistoryItem / removeMultipleHistoryItems  (storage.js)
 *   5. filterKidsSafe                (utils.js, läuft config.js-Regexe)
 *   6. saveVideoProgress Trimming auf max. 50 Einträge (storage.js)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── ANSI-Farben ───────────────────────────────────────────────────────────────
const C = {
    reset : '\x1b[0m',
    green : '\x1b[32m',
    red   : '\x1b[31m',
    yellow: '\x1b[33m',
    cyan  : '\x1b[36m',
    bold  : '\x1b[1m',
};

// ── Test-Ergebnis-Tracking ────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;

function ok(name)              { passed++; console.log(`  ${C.green}✔${C.reset} ${name}`); }
function fail(name, reason)    { failed++; console.log(`  ${C.red}✘${C.reset} ${name}`); if (reason) console.log(`      ${C.red}→ ${reason}${C.reset}`); }
function skip(name, reason)    { skipped++; console.log(`  ${C.yellow}─${C.reset} ${name} ${C.yellow}(übersprungen: ${reason})${C.reset}`); }
function section(title)        { console.log(`\n${C.bold}${C.cyan}▸ ${title}${C.reset}`); }
function assert(cond, name, msg) { cond ? ok(name) : fail(name, msg || 'Bedingung false'); }

/** Hilfsfunktion: Liefert einen einfachen in-memory localStorage-Mock. */
function createLsMock() {
    const store = Object.create(null);
    return {
        getItem(k)      { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem(k, v)   { store[k] = String(v); },
        removeItem(k)   { delete store[k]; },
        clear()         { for (const k of Object.keys(store)) delete store[k]; },
        key(i)          { return Object.keys(store)[i] || null; },
        get length()    { return Object.keys(store).length; },
    };
}

const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// 1. SYNTAXCHECK — alle JS-Dateien im js/-Ordner
// ============================================================================
section('Syntaxcheck JS-Module');

const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
for (const file of jsFiles) {
    const fp = path.join(ROOT, 'js', file);
    try   { execSync(`node --check "${fp}"`, { stdio: 'pipe' }); ok(`Syntaxcheck: js/${file}`); }
    catch (e) { fail(`Syntaxcheck: js/${file}`, e.stderr ? e.stderr.toString().split('\n')[0] : e.message); }
}

// ============================================================================
// Sandbox-Aufbau
// ============================================================================
// Strategie: Alle benötigten Module in EINEM new Function()-Aufruf zusammenladen,
// damit const-Bindungen aus config.js für utils.js und storage.js sichtbar sind.
// Globale Stubs (localStorage, getActiveProfile, …) werden als Parameter übergeben.

const lsMock     = createLsMock();
let storageApi   = null;   // { getVideoProgressKey, … }
let utilsApi     = null;   // { filterKidsSafe, … }
let sandboxState = { getActiveProfile: null };   // zur Laufzeit änderbar

try {
    const configSrc  = fs.readFileSync(path.join(ROOT, 'js/config.js'),  'utf8');
    const storageSrc = fs.readFileSync(path.join(ROOT, 'js/storage.js'), 'utf8');
    const utilsSrc   = fs.readFileSync(path.join(ROOT, 'js/utils.js'),   'utf8');

    // Alle drei Module in einer Funktion — teilen denselben Scope (const-sichtbar)
    const combined = `
        "use strict";

        // ── Stubs (werden als Parameter übergeben) ──────────────────────────
        // localStorage, console, getProfileKey usw. kommen als Params rein.

        ${configSrc}

        ${storageSrc}

        ${utilsSrc}

        // ── Exporte zurück an Node.js ───────────────────────────────────────
        _out.getVideoProgressKey        = getVideoProgressKey;
        _out.getHistoryItemKey          = getHistoryItemKey;
        _out.getRecentlyWatched         = getRecentlyWatched;
        _out.saveRecentlyWatched        = saveRecentlyWatched;
        _out.removeHistoryItem          = removeHistoryItem;
        _out.removeMultipleHistoryItems = removeMultipleHistoryItems;
        _out.saveVideoProgress          = saveVideoProgress;
        _out.getVideoProgress           = getVideoProgress;
        _out.filterKidsSafe             = filterKidsSafe;
        _out.bindSafeTap                = typeof bindSafeTap !== 'undefined' ? bindSafeTap : null;
    `;

    // Dynamisches getActiveProfile: wir übergeben ein Wrapper-Objekt, damit
    // wir den Rückgabewert zur Laufzeit tauschen können ohne neu zu kompilieren.
    const out = {};
    const params = {
        localStorage: lsMock,
        console,
        _out: out,
        // getActiveProfile über Wrapper – utils.js liest es per typeof-Check
        getActiveProfile: (...a) => typeof sandboxState.getActiveProfile === 'function'
            ? sandboxState.getActiveProfile(...a)
            : null,
        // Profil-Schlüssel: immer Profil "default"
        getProfileKey: (key) => `profile_default_${key}`,
        // DOM-Stubs (werden von storage.js / utils.js nur optional genutzt)
        window: { scrollY: 0, scrollX: 0 },
        document: {
            getElementById: () => null,
            createElement: (tag) => ({
                tagName: tag.toUpperCase(), className: '', innerHTML: '', style: {},
                appendChild() {}, querySelector: () => null, addEventListener() {},
            }),
        },
        searchInput: null,
        performSearch: () => {},
        hideSearchHistoryDropdown: () => {},
    };

    new Function(...Object.keys(params), combined)(...Object.values(params));

    storageApi = out;
    utilsApi   = out;
    ok('Sandbox-Aufbau (config + storage + utils)');
} catch (e) {
    fail('Sandbox-Aufbau', e.message);
}

// ============================================================================
// 2. getVideoProgressKey — Prioritäten und Fallbacks
// ============================================================================
section('getVideoProgressKey (storage.js)');

if (!storageApi || !storageApi.getVideoProgressKey) {
    skip('getVideoProgressKey-Tests', 'Funktion nicht geladen');
} else {
    const gpk = storageApi.getVideoProgressKey;

    assert(gpk(null) === '',
        'null → leerer String');

    // Leeres Objekt: kein _uid, id, url, titel → JSON.stringify({}) = '{}', nicht leer
    const emptyKey = gpk({});
    assert(typeof emptyKey === 'string',
        'leeres Objekt → liefert einen String (kein Crash)');

    assert(gpk({ _uid: 'uid-abc', id: '123', url_video_hd: 'http://x.com/v.mp4' }) === 'uid-abc',
        '_uid hat höchste Priorität');

    assert(gpk({ id: '42', url_video_hd: 'http://x.com/v.mp4' }) === 'id_42',
        'id → "id_<val>" wenn kein _uid');

    assert(gpk({ url_video_hd: 'http://x.com/v.mp4' }) === 'http://x.com/v.mp4',
        'url_video_hd als URL-Fallback');

    assert(gpk({ url_video_low: 'http://x.com/low.mp4' }) === 'http://x.com/low.mp4',
        'url_video_low als Fallback');

    const tKey = gpk({ title: 'Test Video', channel: 'ARD', timestamp: '2024-01-01' });
    assert(typeof tKey === 'string' && tKey.includes('Test Video'),
        'Titel+Channel als letzter Fallback enthält Titel');
}

// ============================================================================
// 3. saveVideoProgress / getVideoProgress — Roundtrip
// ============================================================================
section('saveVideoProgress / getVideoProgress Roundtrip (storage.js)');

if (!storageApi || !storageApi.saveVideoProgress) {
    skip('Progress-Roundtrip', 'Funktionen nicht geladen');
} else {
    const { saveVideoProgress, getVideoProgress } = storageApi;
    const url = 'http://test.example.com/video.mp4';

    assert(getVideoProgress(url) === null,
        'getVideoProgress → null für unbekannte URL');

    saveVideoProgress(url, 60, 120);
    const p1 = getVideoProgress(url);
    assert(p1 !== null,                 'Eintrag nach saveVideoProgress vorhanden');
    assert(p1.currentTime === 60,       'currentTime == 60');
    assert(p1.duration   === 120,       'duration == 120');
    assert(p1.percent    === 50,        'percent == 50 (50 %)');
    assert(typeof p1.timestamp === 'number', 'timestamp ist Zahl');

    saveVideoProgress(url, 102, 120);
    const p2 = getVideoProgress(url);
    assert(p2.currentTime === 102, 'Update: currentTime aktualisiert');
    assert(p2.percent     === 85,  'Update: percent == 85 (gesehen-Schwelle)');

    saveVideoProgress('http://other.com/x.mp4', 10, 100);
    assert(getVideoProgress(url) !== null,
        'Zweiter URL-Eintrag überschreibt ersten nicht');
    assert(getVideoProgress('http://other.com/x.mp4').currentTime === 10,
        'Zweiter Eintrag korrekt gespeichert');
}

// ============================================================================
// 4. removeHistoryItem / removeMultipleHistoryItems
// ============================================================================
section('History: removeHistoryItem & removeMultipleHistoryItems (storage.js)');

if (!storageApi || !storageApi.removeHistoryItem) {
    skip('History-Löschfunktionen', 'Funktionen nicht geladen');
} else {
    const { saveRecentlyWatched, getRecentlyWatched, removeHistoryItem, removeMultipleHistoryItems } = storageApi;

    const item1 = { _uid: 'uid-1', title: 'Video A', watchedAt: Date.now() };
    const item2 = { _uid: 'uid-2', title: 'Video B', watchedAt: Date.now() };
    const item3 = { _uid: 'uid-3', title: 'Video C', watchedAt: Date.now() };
    saveRecentlyWatched([item1, item2, item3]);

    assert(getRecentlyWatched().length === 3, 'Seed: 3 Einträge gespeichert');

    removeHistoryItem(item2);
    const after1 = getRecentlyWatched();
    assert(after1.length === 2,                         'Einzellöschung: 2 übrig');
    assert(!after1.some(e => e._uid === 'uid-2'),       'uid-2 gelöscht');
    assert(after1.some(e => e._uid === 'uid-1'),        'uid-1 noch vorhanden');
    assert(after1.some(e => e._uid === 'uid-3'),        'uid-3 noch vorhanden');

    removeHistoryItem('uid-3');
    assert(getRecentlyWatched().length === 1,           'Key-basiertes Löschen: 1 übrig');

    saveRecentlyWatched([item1, item2, item3]);
    const { updated, removedCount } = removeMultipleHistoryItems(['uid-1', 'uid-3']);
    assert(removedCount === 2,                          'removeMultiple: 2 gelöscht');
    assert(updated.length === 1,                        'removeMultiple: 1 übrig');
    assert(updated[0]._uid === 'uid-2',                 'removeMultiple: uid-2 erhalten');

    saveRecentlyWatched([item1, item2]);
    const { removedCount: rc0 } = removeMultipleHistoryItems([]);
    assert(rc0 === 0,                                   'Leere Auswahl löscht nichts');
}

// ============================================================================
// 5. filterKidsSafe — Kindersicherung (utils.js + config.js-Regexe)
// ============================================================================
section('filterKidsSafe (utils.js)');

if (!utilsApi || !utilsApi.filterKidsSafe) {
    skip('filterKidsSafe', 'Funktion nicht geladen');
} else {
    const fks = utilsApi.filterKidsSafe;

    // Kein aktives Profil → alles durchlassen
    sandboxState.getActiveProfile = null;
    assert(fks([{ title: 'Thriller' }]).length === 1,
        'Kein Profil: alles durchgelassen');

    // Erwachsenen-Profil → kein Filter
    sandboxState.getActiveProfile = () => ({ name: 'Max', isKids: false });
    assert(fks([{ title: 'Tatort' }, { title: 'SpongeBob' }]).length === 2,
        'Erwachsenenprofil: kein Filter aktiv');

    // Kinderprofil → blockiere "thriller", "horror" (beide in _KIDS_BLOCKED_KEYWORDS)
    sandboxState.getActiveProfile = () => ({ name: 'Kind', isKids: true });
    const kidsItems = [
        { title: 'SpongeBob',     topic: 'Kinder', description: '' },
        { title: 'Thriller-Nacht', topic: '',       description: '' },   // ← geblockt
        { title: 'Horror-Film',    topic: '',       description: '' },   // ← geblockt
        { title: 'Pumuckl',        topic: 'Kinder', description: '' },
    ];
    const result = fks(kidsItems);
    assert(result.length === 2,
        'Kinderprofil: Thriller & Horror geblockt (2 safe Items übrig)');
    assert(result.every(i => !i.title.includes('Thriller') && !i.title.includes('Horror')),
        'Kinderprofil: nur sichere Items in Ergebnis');

    // Null / leeres Array — kein Crash
    assert(Array.isArray(fks(null)), 'null → leeres Array (kein Crash)');
    assert(Array.isArray(fks([])  ), 'Leeres Array → leeres Array');
}

// ============================================================================
// 6. saveVideoProgress: interne Begrenzung auf max. 50 Einträge
// ============================================================================
section('saveVideoProgress: Trimming auf 50 Einträge');

if (!storageApi || !storageApi.saveVideoProgress) {
    skip('Progress-Trimming', 'Funktionen nicht geladen');
} else {
    lsMock.clear();   // Frischer Speicher für diesen Test
    const { saveVideoProgress, getVideoProgress } = storageApi;

    for (let i = 0; i < 60; i++) {
        saveVideoProgress(`http://example.com/video${i}.mp4`, i, 120);
    }

    assert(getVideoProgress('http://example.com/video59.mp4') !== null,
        'Neuester Eintrag (video59) nach Trimming noch vorhanden');
    assert(getVideoProgress('http://example.com/video0.mp4') === null,
        'Ältester Eintrag (video0) durch Trimming entfernt');
}

// ============================================================================
// ERGEBNIS-ZUSAMMENFASSUNG
// ============================================================================
console.log('\n' + '─'.repeat(50));
console.log(`${C.bold}Ergebnis: ${C.green}${passed} bestanden${C.reset}  ${failed > 0 ? C.red : ''}${failed} fehlgeschlagen${C.reset}  ${C.yellow}${skipped} übersprungen${C.reset}`);
console.log('─'.repeat(50));

if (failed > 0) {
    console.log(`\n${C.red}${C.bold}Tests fehlgeschlagen! Bitte Fehler beheben.${C.reset}\n`);
    process.exit(1);
} else {
    console.log(`\n${C.green}${C.bold}Alle Tests bestanden ✔${C.reset}\n`);
    process.exit(0);
}

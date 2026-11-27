/**
 * ============================================================================
 * StreamHub — Konfiguration & Konstanten (js/config.js)
 * ============================================================================
 * Zentrale Konstanten, API-Endpunkte, Sender-Farben, Live-TV-Senderliste,
 * Filter-Blacklists sowie die App-Versionsnummer.
 */

const APP_VERSION = '3.0.7';

/** Endpunkt der öffentlichen MediathekViewWeb-Such-API */
const API_URL = 'https://mediathekviewweb.de/api/query';

/** Basis-URLs für optionale TMDB-Metadaten (Key kommt aus den Einstellungen) */
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Anzahl Einträge pro Seite in der Ergebnisliste */
const resultsPerPage = 20;

/** Unterstützte Karten-Breiten für Pinch-to-Zoom & Ctrl+Scroll */
const GRID_SIZES = [100, 130, 160, 200, 240, 300];

/** Speicher-Schlüssel für Downloads */
const DL_STORAGE_KEY = 'streamhub_downloads';

/** Standard-Benutzerprofil (immer vorhanden, nicht löschbar) */
const DEFAULT_PROFILE = {
    id: 'default',
    name: 'Hauptprofil',
    avatar: 'fa-user',
    isKids: false,
    color: '#6366f1'
};

/** Verfügbare Avatar-Icons für Profile */
const PROFILE_AVATARS = [
    { id: 'fa-user', label: 'Benutzer' },
    { id: 'fa-user-ninja', label: 'Ninja' },
    { id: 'fa-user-astronaut', label: 'Astronaut' },
    { id: 'fa-child', label: 'Kind' },
    { id: 'fa-film', label: 'Kino' },
    { id: 'fa-tv', label: 'TV' },
    { id: 'fa-heart', label: 'Herz' },
    { id: 'fa-star', label: 'Stern' },
    { id: 'fa-cat', label: 'Katze' },
    { id: 'fa-dog', label: 'Hund' },
    { id: 'fa-gamepad', label: 'Gamer' },
    { id: 'fa-crown', label: 'Krone' }
];

/** Farbverläufe für Fallback-Thumbnails je nach Sender */
const senderColors = {
    'ARD': ['#001d8f', '#0041c7'],
    'ZDF': ['#ff6600', '#ff8c42'],
    '3sat': ['#00877d', '#00bfaf'],
    'ARTE': ['#ff7f00', '#ffb84d'],
    'BR': ['#c50e1f', '#e94b3c'],
    'HR': ['#e3000f', '#ff4d5a'],
    'MDR': ['#003e7e', '#0066cc'],
    'NDR': ['#0e4194', '#1a5bb8'],
    'RBB': ['#e30613', '#ff3a47'],
    'SR': ['#00549f', '#0077cc'],
    'SWR': ['#c4122f', '#e63946'],
    'WDR': ['#1f3d7a', '#2d5ba8'],
    'KiKA': ['#059669', '#10b981'],
    'DEFAULT': ['#374151', '#4b5563']
};

/** Blacklist für Einzelsendungen/Nachrichten, die nicht als Serie gruppiert werden sollen */
const SERIES_BLACKLIST = [
    // Nachrichtensendungen
    'tagesschau', 'tagesthemen', 'heute', 'heute journal', 'heuteplus',
    'morgenmagazin', 'mittagsmagazin', 'ard-morgenmagazin', 'zdf-morgenmagazin',
    'aktuelle stunde', 'rundschau', 'abendschau', 'schleswig-holstein magazin',
    'nordmagazin', 'hallo niedersachsen', 'buten un binnen', 'hessenschau',
    'swr aktuell', 'landesschau', 'baden-württemberg', 'rheinland-pfalz',
    'bayerisches fernsehen', 'rundschau magazin', 'nachrichten', 'news',

    // Politmagazine und Talkshows
    'brennpunkt', 'extra', 'spezial', 'live', 'interview', 'presseclub',
    'anne will', 'maischberger', 'markus lanz', 'hart aber fair', 'maybrit illner',
    'phoenix runde', 'pressekonferenz', 'sondersendung',

    // Sport
    'sportschau', 'sportstudio', 'sport aktuell', 'bundesliga', 'champions league',
    'fußball', 'olympia', 'sport live',

    // Wetter
    'wetter', 'wettervorhersage', 'wetterbericht',

    // Krimis (oft Einzelfilme, nicht Serien)
    'tatort', 'polizeiruf', 'spielfilm', 'film',

    // Hörfassungen
    'hörfassung', 'hörfassung mit audiodeskription', 'audiodeskription',

    // Gottesdienste und Spezialformate
    'gottesdienst', 'wort zum sonntag', 'sendeschluss',

    // Generische Magazin-/Doku-Rubriken (keine zusammenhängenden Serien)
    'kulturzeit', 'kulturjournal', 'kultur und pop', 'popkultur',
    'wissenschaft', 'wissen', 'geschichte', 'dokumentation', 'doku',
    'dokumentarfilm', 'reportage', 'die reportage', 'magazin', 'panorama',
    'monitor', 'kontraste', 'frontal', 'fakt', 'plusminus', 'wiso',
    'zdfzeit', 'themenabend', 'arte journal', 'kurzfilm'
];

/** Wörter für den Kinderfilter, die exakte Wortgrenzen brauchen (verhindert z. B. Blockieren von "Wissenschaft") */
const _KIDS_EXACT_BOUNDARY_KEYWORDS = new Set([
    'sex', 'blut', 'krieg', 'haft', 'jva', 'rente', 'ab 16', 'ab 18', 'fsk 16', 'fsk 18', 'steuern'
]);

/** Schlagwörter, die im Kinderprofil ausgefiltert werden */
const _KIDS_BLOCKED_KEYWORDS = [
    // Sexualität / Erwachsenenthemen
    'kinderwunsch', 'embryo', 'embryonentransfer', 'abtreibung', 'schwangerschaft',
    'erotik', 'erotisch', 'sex', 'sexual', 'nackt', 'nacktheit', 'porno', 'bordell',
    'prostitut', 'stripper', 'affäre', 'fsk 16', 'fsk 18', 'ab 16', 'ab 18',

    // Krimi / Mord / Horror / Thriller
    'tatort', 'polizeiruf', 'krimi', 'mord', 'mörder', 'tötung', 'leiche', 'blut',
    'horror', 'thriller', 'true crime', 'verbrechen', 'serienmörder', 'forensik',
    'obduktion', 'pathologie', 'erdrosselt', 'erstochen', 'erschossen', 'ermordet',

    // Gewalt / Krieg / Terror
    'krieg', 'waffen', 'attentat', 'massaker', 'gewalt', 'hinrichtung', 'folter',
    'terror', 'terrorist', 'amok', 'geisel', 'schießerei', 'bombe', 'anschlag',
    'luftangriff', 'raketen', 'frontlinie', 'soldaten', 'ukraine-krieg', 'nahost-konflikt',
    'hamas', 'israel-gaza', 'putin', 'taliban',

    // Drogen / Missbrauch / Suizid
    'drogen', 'sucht', 'süchtig', 'alkohol', 'kokain', 'heroin', 'cannabis',
    'missbrauch', 'vergewaltigung', 'trauma', 'suizid', 'selbstmord', 'sterbehilfe',
    'psychiatrie', 'psychose', 'geschlossene anstalt',

    // Gefängnis / Gericht
    'gefängnis', 'haft', 'strafvollzug', 'justizvollzugsanstalt', 'jva', 'anklagebank',

    // Erwachsenen-Politik / Wirtschaft
    'bundestagswahl', 'parteitag', 'wahlkampf', 'inflation', 'insolvenz', 'finanzkrise',
    'steuern', 'steuerhinterziehung', 'börsencrash', 'rente', 'altersarmut'
];

/** Vorkompilierte RegEx-Muster für schnelle Kinderfilterung */
const _KIDS_BLOCKED_REGEXES = _KIDS_BLOCKED_KEYWORDS.map(kw => {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (_KIDS_EXACT_BOUNDARY_KEYWORDS.has(kw)) {
        return new RegExp(`(?:^|[^a-z0-9äöüß])${esc}(?:$|[^a-z0-9äöüß])`, 'i');
    }
    return new RegExp(`(?:^|[^a-z0-9äöüß])${esc}`, 'i');
});

/** Öffentlich-rechtliche Live-TV HLS-Streams */
const liveChannels = [
    // ARD-Familie
    { name: 'Das Erste HD',   channel: 'ARD', url: 'https://daserste-live.ard-mcdn.de/daserste/live/hls/de/master.m3u8' },
    { name: 'tagesschau24',   channel: 'ARD', url: 'https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8' },
    { name: 'ONE HD',         channel: 'ARD', url: 'https://one-live.ard-mcdn.de/one/live/hls/de/master.m3u8' },
    { name: 'Phoenix HD',     channel: 'ARD', url: 'https://zdf-hls-19.akamaized.net/hls/live/2016502/de/veryhigh/master.m3u8' },
    { name: 'ARD alpha',      channel: 'ARD', url: 'https://mcdn.br.de/br/fs/ard_alpha/hls/de/master.m3u8' },
    { name: 'KiKA HD',        channel: 'KiKA', url: 'https://kika-lh.akamaihd.net/i/kika_de@449767/master.m3u8' },
    // ZDF-Familie
    { name: 'ZDF HD',         channel: 'ZDF', url: 'https://zdf-hls-15.akamaized.net/hls/live/2016498/de/veryhigh/master.m3u8' },
    { name: 'ZDFneo',         channel: 'ZDF', url: 'https://zdf-hls-16.akamaized.net/hls/live/2016499/de/veryhigh/master.m3u8' },
    { name: 'ZDFinfo',        channel: 'ZDF', url: 'https://zdf-hls-17.akamaized.net/hls/live/2016500/de/veryhigh/master.m3u8' },
    { name: '3sat HD',        channel: '3sat', url: 'https://zdf-hls-18.akamaized.net/hls/live/2016501/dach/veryhigh/master.m3u8' },
    // Internationale & Auslandssender
    { name: 'ARTE Deutsch',   channel: 'ARTE', url: 'https://artesimulcast.akamaized.net/hls/live/2030993/artelive_de/master.m3u8' },
    { name: 'ARTE Français',  channel: 'ARTE', url: 'https://artesimulcast.akamaized.net/hls/live/2030994/artelive_fr/master.m3u8' },
    { name: 'DW Deutsch',     channel: 'DW',  url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8' },
    { name: 'DW English',     channel: 'DW',  url: 'https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8' },
    // Dritte Programme
    { name: 'BR Fernsehen',   channel: 'BR',  url: 'https://mcdn.br.de/br/fs/bfs_sued/hls/de/master.m3u8' },
    { name: 'hr-fernsehen',   channel: 'HR',  url: 'https://hrhls.akamaized.net/hls/live/2024525/hrhls/master.m3u8' },
    { name: 'MDR Sachsen',    channel: 'MDR', url: 'https://mdrtvsnhls.akamaized.net/hls/live/2016928/mdrtvsn/master.m3u8' },
    { name: 'NDR Fernsehen',  channel: 'NDR', url: 'https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_nds/master.m3u8' },
    { name: 'Radio Bremen TV',channel: 'RB',  url: 'https://rbhls.akamaized.net/hls/live/2022791/rbhls/master.m3u8' },
    { name: 'rbb Fernsehen',  channel: 'RBB', url: 'https://rbb-hls-berlin.akamaized.net/hls/live/2017824/rbb_berlin/master.m3u8' },
    { name: 'SR Fernsehen',   channel: 'SR',  url: 'https://srfs.akamaized.net/hls/live/689649/srfsgeo/index.m3u8' },
    { name: 'SWR BW HD',      channel: 'SWR', url: 'https://swrbwd-hls.akamaized.net/hls/live/2018672/swrbwd/master.m3u8' },
    { name: 'WDR HD',         channel: 'WDR', url: 'https://wdrfs247.akamaized.net/hls/live/681509/wdr_msl4_fs247/master.m3u8' }
];

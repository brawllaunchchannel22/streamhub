/**
 * ============================================================================
 * StreamHub — Globaler App-Zustand (js/state.js)
 * ============================================================================
 * Hält DOM-Referenzen und laufenden App-Zustand (Suchergebnisse, aktuelle Seite,
 * Player-Instanz, Thumbnail-Warteschlange, Verlaufs-Auswahlmodus, etc.).
 */

// ── DOM-Elemente (werden in js/main.js -> init() gefüllt) ─────────────────────
let searchInput, videoGrid, loadingState, emptyState, sectionTitle, resultsCount, loadMore;
let videoModal, videoPlayer, closeModal, hamburgerMenu, closeHamburger, hamburgerSidebar;
let filterToggle, filterSidebar, closeFilter, applyFilter, resetFilter, sidebarBackdrop;
let recentlyWatched, recentGrid, clearHistory, showAllHistory;

/** Aktuelle hls.js Instanz für Live-Streams und HLS-VODs */
let hlsInstance = null;

// ── Such-, Ergebnis- und Seiten-Zustand ───────────────────────────────────────
let currentResults = [];
let originalResults = [];
let displayedResults = [];
let currentDisplayItems = [];
let currentOffset = 0;
let currentPage = 'home';
let previousPage = 'home';
let currentQuery = '';
let currentCategory = '';
let currentSort = 'relevanz';
let _searchInProgress = false;

// ── Thumbnail- & Lokal-Video-Zustand ──────────────────────────────────────────
let thumbnailCache = {};
let useRealThumbnails = true;
let thumbIdCounter = 0;
let localFolders = [];
let localVideos = [];
let webLocalVideos = [];

// Lokale Video-Thumbnail-Queue
let thumbnailQueue = [];
let isProcessingThumbnails = false;
const MAX_CONCURRENT_THUMBNAILS = 2;
let activeThumbnails = 0;

// Echte Stream-Thumbnail-Queue
const realThumbQueue = [];
let realThumbBusy = false;
const MAX_REAL_THUMBS = 6;
let activeRealThumbs = 0;

// ── Profil-Editor-Zustand ─────────────────────────────────────────────────────
let editingProfileId = null;
let selectedAvatarIcon = 'fa-user';

// ── TMDB-Schlüssel & Cache ────────────────────────────────────────────────────
let TMDB_API_KEY = (typeof localStorage !== 'undefined' ? localStorage.getItem('tmdbApiKey') : '') || '';
const tmdbSeriesCache = new Map();

// ── Timer, Downloads, Grid-Zoom & Verlaufs-Mehrfachauswahl ────────────────────
let _progressSaveTimer = 0;
const _activeXHR = {};
let _gridSizeIdx = typeof localStorage !== 'undefined'
    ? parseInt(localStorage.getItem('streamhubGridSize') || '3', 10)
    : 3;

/** Zustand für die Verlaufs-Mehrfachauswahl (Einzel-/Bulk-Löschen) */
const historySelectionState = {
    active: false,
    selectedKeys: new Set(),
    currentFilterQuery: ''
};

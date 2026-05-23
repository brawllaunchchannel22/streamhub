// StreamHub v2.4.0 - SIMPLE & STABLE VERSION
console.log('StreamHub starting...');

// API Configuration
const API_URL = 'https://mediathekviewweb.de/api/query';

// DOM Elements - Get them safely
let searchInput, videoGrid, loadingState, emptyState, sectionTitle, resultsCount, loadMore;
let videoModal, videoPlayer, closeModal, hamburgerMenu, closeHamburger, hamburgerSidebar;
let filterToggle, filterSidebar, closeFilter, applyFilter, resetFilter;
let recentlyWatched, recentGrid, clearHistory, showAllHistory;
let hlsInstance = null;

// State
let currentResults = [];
let originalResults = [];
let displayedResults = [];
let currentOffset = 0;
const resultsPerPage = 20;
let thumbnailCache = {};
let currentPage = 'home';
let currentQuery = '';
let currentCategory = '';
let useRealThumbnails = true; // always on
let thumbIdCounter = 0; // global unique ID for thumbnail elements
let localFolders = [];
let localVideos = [];

// Sender Colors
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
    'DEFAULT': ['#374151', '#4b5563']
};

// Wait for DOM then initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready, initializing...');
    init();
});

function init() {
    try {
        // Get DOM elements
        searchInput = document.getElementById('searchInput');
        videoGrid = document.getElementById('videoGrid');
        loadingState = document.getElementById('loadingState');
        emptyState = document.getElementById('emptyState');
        sectionTitle = document.getElementById('sectionTitle');
        resultsCount = document.getElementById('resultsCount');
        loadMore = document.getElementById('loadMore');
        videoModal = document.getElementById('videoModal');
        videoPlayer = document.getElementById('videoPlayer');
        closeModal = document.getElementById('closeModal');
        hamburgerMenu = document.getElementById('hamburgerMenu');
        closeHamburger = document.getElementById('closeHamburger');
        hamburgerSidebar = document.getElementById('hamburgerSidebar');
        filterToggle = document.getElementById('filterToggle');
        filterSidebar = document.getElementById('filterSidebar');
        closeFilter = document.getElementById('closeFilter');
        applyFilter = document.getElementById('applyFilter');
        resetFilter = document.getElementById('resetFilter');
        recentlyWatched = document.getElementById('recentlyWatched');
        recentGrid = document.getElementById('recentGrid');
        clearHistory = document.getElementById('clearHistory');
        showAllHistory = document.getElementById('showAllHistory');
        
        console.log('DOM elements loaded');
        
        // Load settings and data
        console.log('Loading settings...');
        loadSettings();
        loadLocalFolders();
        
        // Attach event listeners
        attachEventListeners();
        
        // Load recently watched
        loadRecentlyWatched();
        
        // Load default content
        console.log('Loading default content...');
        loadDefaultContent();
        
    } catch (error) {
        console.error('Init error:', error);
    }
}

function attachEventListeners() {
    // Search
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                performSearch(searchInput.value.trim());
            }
        });
    }
    
    // Navigation categories
    document.querySelectorAll('.nav-categories a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-categories a').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
            
            const category = e.target.dataset.category;
            const page = e.target.dataset.page;
            
            console.log('Nav clicked:', { category, page });
            
            // Clear search input when clicking on navigation tabs
            if (searchInput) {
                searchInput.value = '';
            }
            
            if (page === 'live') {
                navigateToPage('live');
            } else if (category === 'home') {
                navigateToPage('home');
            } else {
                // Category search
                const mainVideoSection = document.getElementById('mainVideoSection');
                const livePage = document.getElementById('livePage');
                const localPage = document.getElementById('localPage');
                const settingsPage = document.getElementById('settingsPage');
                const historyPage = document.getElementById('historyPage');
                const recentlyWatched = document.getElementById('recentlyWatched');
                
                if (mainVideoSection) mainVideoSection.style.display = 'block';
                if (livePage) livePage.style.display = 'none';
                if (localPage) localPage.style.display = 'none';
                if (settingsPage) settingsPage.style.display = 'none';
                if (historyPage) historyPage.style.display = 'none';
                if (recentlyWatched) recentlyWatched.style.display = 'none';
                
                performSearch(category);
            }
        });
    });
    
    // Filter
    if (filterToggle) {
        filterToggle.addEventListener('click', () => {
            if (filterSidebar) filterSidebar.classList.add('active');
        });
    }
    
    if (closeFilter) {
        closeFilter.addEventListener('click', () => {
            if (filterSidebar) filterSidebar.classList.remove('active');
        });
    }
    
    if (applyFilter) {
        applyFilter.addEventListener('click', () => {
            applyFilters();
            if (filterSidebar) filterSidebar.classList.remove('active');
        });
    }
    
    if (resetFilter) {
        resetFilter.addEventListener('click', () => {
            console.log('Resetting filters...');
            document.getElementById('channelFilter').value = '';
            const genreFilter = document.getElementById('genreFilter');
            if (genreFilter) genreFilter.value = '';
            document.getElementById('durationFilter').value = '0';
            document.getElementById('sortFilter').value = 'date';
            applyFilters();
        });
    }
    
    // Load More
    if (loadMore) {
        loadMore.addEventListener('click', () => {
            displayMoreResults();
        });
    }
    
    // Hamburger menu
    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', () => {
            if (hamburgerSidebar) hamburgerSidebar.classList.add('active');
        });
    }
    
    if (closeHamburger) {
        closeHamburger.addEventListener('click', () => {
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
        });
    }
    
    // Hamburger navigation
    document.querySelectorAll('.hamburger-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            navigateToPage(page);
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
        });
    });
    
    // Recently watched
    if (showAllHistory) {
        showAllHistory.addEventListener('click', () => {
            navigateToPage('history');
        });
    }
    
    if (clearHistory) {
        clearHistory.addEventListener('click', () => {
            if (confirm('Verlauf wirklich löschen?')) {
                localStorage.removeItem('recentlyWatched');
                if (recentlyWatched) recentlyWatched.style.display = 'none';
                const historyPage = document.getElementById('historyPage');
                const historyGrid = document.getElementById('historyGrid');
                if (historyPage) historyPage.style.display = 'none';
                if (historyGrid) historyGrid.innerHTML = '';
            }
        });
    }
    
    // Search history
    const searchHistory = document.getElementById('searchHistory');
    if (searchHistory) {
        searchHistory.addEventListener('input', (e) => {
            filterHistoryPage(e.target.value);
        });
    }
    
    // Video modal
    if (closeModal) {
        closeModal.addEventListener('click', closeVideoModal);
    }
    
    if (videoModal) {
        const backdrop = videoModal.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', closeVideoModal);
        }
    }
    
    // Video controls
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (videoPlayer && videoPlayer.requestFullscreen) {
                videoPlayer.requestFullscreen();
            }
        });
    }
    
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const url = videoPlayer.src;
            const title = document.getElementById('videoTitle')?.textContent || 'video';
            
            if (!url) {
                alert('Keine Video-URL verfügbar');
                return;
            }
            
            // Use IPC if available
            if (window.electronAPI) {
                try {
                    const result = await window.electronAPI.downloadVideo(url, title);
                    
                    if (result.success) {
                        alert(`Video gespeichert:\n${result.path}`);
                    } else {
                        alert(`Download fehlgeschlagen: ${result.message}`);
                    }
                } catch (err) {
                    window.open(url, '_blank');
                }
            } else {
                window.open(url, '_blank');
            }
        });
    }
    
    // Share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareVideo);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (videoModal && videoModal.classList.contains('active')) {
                closeVideoModal();
            }
            if (hamburgerSidebar && hamburgerSidebar.classList.contains('active')) {
                hamburgerSidebar.classList.remove('active');
            }
            if (filterSidebar && filterSidebar.classList.contains('active')) {
                filterSidebar.classList.remove('active');
            }
            const infoModal = document.getElementById('infoModal');
            if (infoModal && infoModal.classList.contains('active')) {
                infoModal.classList.remove('active');
            }
        }
    });
    
    // Footer links
    const aboutLink = document.getElementById('aboutLink');
    const faqLink = document.getElementById('faqLink');
    const imprintLink = document.getElementById('imprintLink');
    const privacyLink = document.getElementById('privacyLink');
    const termsLink = document.getElementById('termsLink');
    
    if (aboutLink) aboutLink.addEventListener('click', (e) => { e.preventDefault(); showInfoModal('about'); });
    if (faqLink) faqLink.addEventListener('click', (e) => { e.preventDefault(); showInfoModal('faq'); });
    if (imprintLink) imprintLink.addEventListener('click', (e) => { e.preventDefault(); showInfoModal('imprint'); });
    if (privacyLink) privacyLink.addEventListener('click', (e) => { e.preventDefault(); showInfoModal('privacy'); });
    if (termsLink) termsLink.addEventListener('click', (e) => { e.preventDefault(); showInfoModal('terms'); });
    
    const closeInfoModal = document.getElementById('closeInfoModal');
    if (closeInfoModal) {
        closeInfoModal.addEventListener('click', () => {
            const infoModal = document.getElementById('infoModal');
            if (infoModal) infoModal.classList.remove('active');
        });
    }
    
    // Local videos buttons
    const addLocalFolder = document.getElementById('addLocalFolder');
    if (addLocalFolder) {
        addLocalFolder.addEventListener('click', () => {
            console.log('Add local folder clicked');
            addLocalFolderDialog();
        });
    }
    
    const scanLocalFolders = document.getElementById('scanLocalFolders');
    if (scanLocalFolders) {
        scanLocalFolders.addEventListener('click', () => {
            console.log('Scan local folders clicked');
            scanLocalVideos();
        });
    }
    
    const manageLocalFolders = document.getElementById('manageLocalFolders');
    if (manageLocalFolders) {
        manageLocalFolders.addEventListener('click', () => {
            console.log('Manage local folders clicked');
            navigateToPage('local');
        });
    }
    
    // Settings
    const settingRealThumbnails = document.getElementById('settingRealThumbnails');
    if (settingRealThumbnails) {
        settingRealThumbnails.addEventListener('change', (e) => {
            console.log('Settings: real thumbnails =', e.target.checked);
            useRealThumbnails = e.target.checked;
            saveSettings();
            const realThumbnailsToggle = document.getElementById('realThumbnailsToggle');
            if (realThumbnailsToggle) realThumbnailsToggle.checked = useRealThumbnails;
        });
    }
    
    const realThumbnailsToggle = document.getElementById('realThumbnailsToggle');
    if (realThumbnailsToggle) {
        realThumbnailsToggle.addEventListener('change', (e) => {
            console.log('Filter: real thumbnails =', e.target.checked);
            useRealThumbnails = e.target.checked;
            saveSettings();
            const settingRealThumbnails = document.getElementById('settingRealThumbnails');
            if (settingRealThumbnails) settingRealThumbnails.checked = useRealThumbnails;
        });
    }
    
    const clearCache = document.getElementById('clearCache');
    if (clearCache) {
        clearCache.addEventListener('click', () => {
            console.log('Clear cache clicked');
            if (confirm('Cache wirklich leeren?')) {
                thumbnailCache = {};
                localStorage.removeItem('thumbnailCache');
                alert('Cache wurde geleert!');
            }
        });
    }
    
    // Hamburger menu navigation
    document.querySelectorAll('.hamburger-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            console.log('Hamburger navigation to:', page);
            navigateToPage(page);
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
        });
    });
    
    console.log('All event listeners attached');
}

// Load Default Content
async function loadDefaultContent() {
    try {
        console.log('loadDefaultContent() called');
        currentPage = 'home';
        if (sectionTitle) {
            sectionTitle.innerHTML = '<i class="fas fa-fire"></i> Für dich empfohlen';
        }
        
        // Load recommendations (mix of popular categories)
        await loadRecommendations();
        
    } catch (error) {
        console.error('loadDefaultContent error:', error);
    }
}

// Load Recommendations
async function loadRecommendations() {
    try {
        console.log('Loading recommendations...');
        currentCategory = ''; // Clear category for recommendations
        showLoading(true);
        
        // Mix of different genres for recommendations
        const categories = ['Dokumentation', 'Spielfilm', 'Tatort', 'Reportage'];
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        
        const payload = {
            queries: [
                { fields: ["title", "topic", "description"], query: randomCategory }
            ],
            sortBy: "timestamp",
            sortOrder: "desc",
            future: true,
            offset: 0,
            size: 50
        };
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        currentResults = data.result?.results || [];
        originalResults = [...currentResults]; // Save before shuffle
        
        // Shuffle results for variety
        currentResults = currentResults.sort(() => Math.random() - 0.5);
        
        console.log('Found', currentResults.length, 'recommendations');
        
        if (currentResults.length === 0) {
            showEmpty(true);
        } else {
            displayResults();
        }
        
    } catch (error) {
        console.error('Recommendations error:', error);
        // Fallback to Tatort if recommendations fail
        await performSearch('Tatort');
    } finally {
        showLoading(false);
    }
}

// Perform Search
async function performSearch(query) {
    try {
        console.log('Searching for:', query);
        currentQuery = query;
        currentCategory = query; // Set category for series detection
        currentOffset = 0;
        displayedResults = [];
        
        // Hide verlauf when searching
        if (recentlyWatched && query !== 'Tatort') {
            recentlyWatched.style.display = 'none';
        }
        
        if (searchInput) searchInput.value = query;
        if (sectionTitle) sectionTitle.innerHTML = `<i class="fas fa-search"></i> ${query}`;
        
        showLoading(true);
        
        const payload = {
            queries: [
                { fields: ["title", "topic", "description"], query: query }
            ],
            sortBy: "timestamp",
            sortOrder: "desc",
            future: true,
            offset: 0,
            size: 200 // More results
        };
        
        console.log('Fetching from API...');
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Data received:', data);
        
        currentResults = data.result?.results || [];
        originalResults = [...currentResults]; // Save original
        console.log('Found', currentResults.length, 'videos');
        
        if (currentResults.length === 0) {
            showEmpty(true);
        } else {
            displayResults();
        }
        
    } catch (error) {
        console.error('Search error:', error);
        showEmpty(true);
        if (emptyState) {
            emptyState.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Fehler beim Laden</h3>
                <p>${error.message}</p>
            `;
        }
    } finally {
        showLoading(false);
    }
}

// Display Results
function displayResults() {
    try {
        console.log('Displaying results...');
        
        if (!videoGrid) {
            console.error('videoGrid not found!');
            return;
        }
        
        const toDisplay = currentResults.slice(0, resultsPerPage);
        displayedResults = toDisplay;
        
        videoGrid.innerHTML = '';
        showEmpty(false);
        
        // ALWAYS try to group by series - intelligent grouping will filter out non-series
        console.log('Attempting series grouping for', toDisplay.length, 'items');
        displaySeriesGrouped(toDisplay);
        
        // Update results count
        if (resultsCount) {
            resultsCount.textContent = `${currentResults.length} Ergebnisse`;
        }
        
        // Show/hide load more button
        const loadMoreContainer = document.querySelector('.load-more-container');
        if (loadMoreContainer) {
            if (currentResults.length > resultsPerPage) {
                loadMoreContainer.style.display = 'block';
            } else {
                loadMoreContainer.style.display = 'none';
            }
        }
        
        console.log('Results displayed!');
        
    } catch (error) {
        console.error('displayResults error:', error);
    }
}

// Check if results are likely series episodes
// ============================================================================
// NEUE SERIEN-GRUPPIERUNGS-FUNKTIONEN
// Nach den 5 Regeln optimiert für deutsche Mediatheken
// ============================================================================

// REGEL 3: Erweiterte Blacklist für Nachrichtenformate und Einzelsendungen
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
    
    // Hörfassungen (Audiodeskription - nervt!)
    'hörfassung', 'hörfassung mit audiodeskription', 'audiodeskription',
    
    // Gottesdienste und Spezialformate
    'gottesdienst', 'wort zum sonntag', 'sendeschluss'
];

// REGEL 2: Smarter Parser für Staffel/Folge-Erkennung
class EpisodeParser {
    constructor(title, description = '') {
        this.title = title.toLowerCase();
        this.description = description.toLowerCase();
        this.combined = `${this.title} ${this.description}`.trim();
    }

    // Parst Staffel und Folge aus verschiedenen deutschen Formaten
    parse() {
        let season = null;
        let episode = null;
        let confidence = 0; // Wie sicher ist die Erkennung (0-100)

        // Pattern 1: S01E01, S1E1 (sehr sicher)
        const sxex = this.combined.match(/\bs(\d{1,2})e(\d{1,3})\b/i);
        if (sxex) {
            season = parseInt(sxex[1], 10);
            episode = parseInt(sxex[2], 10);
            confidence = 100;
            return { season, episode, confidence, pattern: 'S01E01' };
        }

        // Pattern 2: Staffel X, Folge Y / Staffel X, Episode Y
        const staffelFolge = this.combined.match(/staffel[\s:]?(\d{1,2})[\s,]+(?:folge|episode)[\s:]?(\d{1,3})/i);
        if (staffelFolge) {
            season = parseInt(staffelFolge[1], 10);
            episode = parseInt(staffelFolge[2], 10);
            confidence = 95;
            return { season, episode, confidence, pattern: 'Staffel X, Folge Y' };
        }

        // Pattern 3: Folge X / Episode X (ohne Staffel)
        const folge = this.combined.match(/(?:folge|episode)[\s:]?(\d{1,3})/i);
        if (folge) {
            season = 1; // Default auf Staffel 1
            episode = parseInt(folge[1], 10);
            confidence = 80;
            return { season, episode, confidence, pattern: 'Folge X' };
        }

        // Pattern 4: Teil X
        const teil = this.combined.match(/teil[\s:]?(\d{1,3})/i);
        if (teil) {
            season = 1;
            episode = parseInt(teil[1], 10);
            confidence = 75;
            return { season, episode, confidence, pattern: 'Teil X' };
        }

        // Pattern 5: (X/Y) oder X/Y - z.B. "(1/4)" oder "1/4"
        const fraction = this.combined.match(/\(?(\d{1,3})\/(\d{1,3})\)?/);
        if (fraction) {
            season = 1;
            episode = parseInt(fraction[1], 10);
            confidence = 70;
            return { season, episode, confidence, pattern: 'X/Y', total: parseInt(fraction[2], 10) };
        }

        // Pattern 6: Führende Nummer mit Trennzeichen: "01 - ", "1. ", "(1) "
        const leadingNumber = this.title.match(/^(?:\()?(\d{1,3})(?:\)|\.|\s*-)\s+/);
        if (leadingNumber) {
            season = 1;
            episode = parseInt(leadingNumber[1], 10);
            confidence = 60;
            return { season, episode, confidence, pattern: 'Leading Number' };
        }

        // Pattern 7: Nummer irgendwo im Titel (niedrigste Priorität)
        const anyNumber = this.title.match(/\b(\d{1,3})\b/);
        if (anyNumber) {
            const num = parseInt(anyNumber[1], 10);
            // Nur wenn die Nummer plausibel ist (1-200)
            if (num > 0 && num <= 200) {
                season = 1;
                episode = num;
                confidence = 40;
                return { season, episode, confidence, pattern: 'Any Number' };
            }
        }

        // Keine Episode erkannt
        return { season: null, episode: null, confidence: 0, pattern: 'none' };
    }

    // Prüft, ob das Video eine Serie ist (hat Episode-Pattern)
    isSeries() {
        const parsed = this.parse();
        return parsed.confidence >= 40; // Mindestens 40% Konfidenz
    }
}

// REGEL 1: Topic ist der Primärschlüssel
function normalizeTopicKey(topic) {
    if (!topic || topic.trim() === '') return null;
    
    return topic
        .trim()
        .toLowerCase()
        // Entferne Artikel am Anfang
        .replace(/^(die|der|das|ein|eine)\s+/i, '')
        // Normalisiere Umlaute
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .trim();
}

// Prüft, ob ein Topic auf der Blacklist ist
function isBlacklisted(topic) {
    if (!topic) return false;
    
    const topicLower = topic.toLowerCase();
    
    return SERIES_BLACKLIST.some(keyword => {
        return topicLower.includes(keyword) || keyword.includes(topicLower);
    });
}

// REGEL 1: isSeriesContext - Topic-basierte Prüfung
function isSeriesContext(items) {
    if (items.length < 3) return false;
    
    console.log('[isSeriesContext] Prüfe', items.length, 'Items');
    
    // Gruppiere nach Topic (normalisiert)
    const topicGroups = new Map();
    
    items.forEach(item => {
        const normalizedTopic = normalizeTopicKey(item.topic);
        
        // FILTER: Hörfassungen überspringen
        const titleLower = (item.title || '').toLowerCase();
        const topicLower = (item.topic || '').toLowerCase();
        const descLower = (item.description || '').toLowerCase();
        
        if (titleLower.includes('hörfassung') || 
            titleLower.includes('audiodeskription') ||
            topicLower.includes('hörfassung') ||
            topicLower.includes('audiodeskription') ||
            descLower.includes('hörfassung') ||
            descLower.includes('audiodeskription')) {
            return; // Skip Hörfassungen komplett
        }
        
        // Skip wenn kein Topic oder blacklisted
        if (!normalizedTopic) return;
        if (isBlacklisted(item.topic)) {
            console.log('[isSeriesContext] Blacklisted:', item.topic);
            return;
        }
        
        // Prüfe ob es eine Episode ist
        const parser = new EpisodeParser(item.title, item.description);
        if (!parser.isSeries()) {
            console.log('[isSeriesContext] Keine Episode:', item.title);
            return;
        }
        
        // Zähle diese Topic-Gruppe
        if (!topicGroups.has(normalizedTopic)) {
            topicGroups.set(normalizedTopic, {
                count: 0,
                originalTopic: item.topic,
                items: []
            });
        }
        
        const group = topicGroups.get(normalizedTopic);
        group.count++;
        group.items.push(item);
    });
    
    // Logge die Topic-Gruppen
    topicGroups.forEach((group, key) => {
        console.log(`[isSeriesContext] Topic: "${group.originalTopic}" (${key}) → ${group.count} Episoden`);
    });
    
    // Wenn mindestens eine Topic-Gruppe 3+ Episoden hat → Series Context
    for (const group of topicGroups.values()) {
        if (group.count >= 3) {
            console.log('[isSeriesContext] ✓ Serie erkannt:', group.originalTopic);
            return true;
        }
    }
    
    console.log('[isSeriesContext] ✗ Keine Serie erkannt');
    return false;
}

// REGEL 1 + 2 + 3: displaySeriesGrouped - Topic-basierte Gruppierung
function displaySeriesGrouped(items) {
    console.log('[displaySeriesGrouped] Starte Gruppierung für', items.length, 'Items');
    
    // Map: normalisierter Topic → { originalTopic, episodes }
    const seriesMap = new Map();
    const standaloneVideos = [];
    
    items.forEach((item, idx) => {
        const normalizedTopic = normalizeTopicKey(item.topic);
        
        // FILTER: Hörfassungen komplett rauswerfen (Topic ODER Title)
        const titleLower = (item.title || '').toLowerCase();
        const topicLower = (item.topic || '').toLowerCase();
        const descLower = (item.description || '').toLowerCase();
        
        if (titleLower.includes('hörfassung') || 
            titleLower.includes('audiodeskription') ||
            topicLower.includes('hörfassung') ||
            topicLower.includes('audiodeskription') ||
            descLower.includes('hörfassung') ||
            descLower.includes('audiodeskription')) {
            console.log(`[${idx}] Hörfassung → ÜBERSPRUNGEN:`, item.title);
            return; // Komplett überspringen, nicht mal als Standalone
        }
        
        // Kein Topic → Standalone
        if (!normalizedTopic) {
            console.log(`[${idx}] Kein Topic → Standalone:`, item.title);
            standaloneVideos.push(item);
            return;
        }
        
        // Blacklisted → Standalone
        if (isBlacklisted(item.topic)) {
            console.log(`[${idx}] Blacklisted → Standalone:`, item.topic);
            standaloneVideos.push(item);
            return;
        }
        
        // Prüfe ob Episode
        const parser = new EpisodeParser(item.title, item.description);
        const parseResult = parser.parse();
        
        if (parseResult.confidence < 40) {
            // Keine Episode erkannt → Standalone
            console.log(`[${idx}] Keine Episode (confidence ${parseResult.confidence}) → Standalone:`, item.title);
            standaloneVideos.push(item);
            return;
        }
        
        // Episode erkannt → zur Serie hinzufügen
        console.log(`[${idx}] Episode erkannt (${parseResult.pattern}, confidence ${parseResult.confidence}):`, item.title);
        console.log(`     → Topic: "${item.topic}" (normalized: "${normalizedTopic}")`);
        console.log(`     → S${parseResult.season}E${parseResult.episode}`);
        
        if (!seriesMap.has(normalizedTopic)) {
            seriesMap.set(normalizedTopic, {
                originalTopic: item.topic,
                episodes: []
            });
        }
        
        seriesMap.get(normalizedTopic).episodes.push({
            ...item,
            parsedSeason: parseResult.season,
            parsedEpisode: parseResult.episode,
            parseConfidence: parseResult.confidence,
            parsePattern: parseResult.pattern
        });
    });
    
    console.log('\n[displaySeriesGrouped] Gruppierungs-Ergebnis:');
    console.log(`  - ${seriesMap.size} Serie(n) gefunden`);
    console.log(`  - ${standaloneVideos.length} Standalone-Videos`);
    
    // Zeige Series Cards (nur wenn 2+ Episoden)
    seriesMap.forEach((seriesData, normalizedTopic) => {
        const episodeCount = seriesData.episodes.length;
        console.log(`  - Serie "${seriesData.originalTopic}": ${episodeCount} Episoden`);
        
        if (episodeCount >= 2) {
            // WICHTIG: Sortiere Episoden BEVOR sie an createSeriesCard übergeben werden!
            seriesData.episodes.sort((a, b) => {
                // Wenn beide eine parsedEpisode haben: sortiere nach Staffel+Episode
                if (a.parsedSeason && b.parsedSeason) {
                    // Erst nach Staffel sortieren
                    if (a.parsedSeason !== b.parsedSeason) {
                        return a.parsedSeason - b.parsedSeason;
                    }
                }
                
                // Dann nach Episode sortieren (falls vorhanden)
                if (a.parsedEpisode && b.parsedEpisode) {
                    if (a.parsedEpisode !== b.parsedEpisode) {
                        return a.parsedEpisode - b.parsedEpisode;
                    }
                }
                
                // REGEL 4: Fallback auf Datum (neueste zuerst)
                return b.timestamp - a.timestamp;
            });
            
            console.log(`    → Episoden sortiert: ${seriesData.episodes.map(e => `S${e.parsedSeason}E${e.parsedEpisode}`).join(', ')}`);
            
            const seriesCard = createSeriesCard(seriesData.originalTopic, seriesData.episodes);
            videoGrid.appendChild(seriesCard);
        } else {
            // Nur 1 Episode → als Standalone anzeigen
            console.log(`    → Nur 1 Episode, zeige als Standalone`);
            standaloneVideos.push(...seriesData.episodes);
        }
    });
    
    // Zeige Standalone-Videos
    console.log(`\n[displaySeriesGrouped] Zeige ${standaloneVideos.length} Standalone-Videos`);
    standaloneVideos.forEach((item, idx) => {
        const card = createVideoCard(item, idx);
        videoGrid.appendChild(card);
    });
}

// REGEL 4 + 5: openSeriesDetail - Sortierung und TMDB-Integration
async function openSeriesDetail(seriesName, episodes) {
    console.log('[openSeriesDetail] Öffne Serie:', seriesName, 'mit', episodes.length, 'Episoden');
    
    // Verstecke aktuelle Seite
    const mainPage = document.querySelector('.content-section:not([style*="display: none"])');
    if (mainPage) {
        mainPage.style.display = 'none';
    }
    
    // Zeige Detail-Seite
    const detailPage = document.getElementById('seriesDetailPage');
    detailPage.style.display = 'block';
    
    // Setze Titel
    document.getElementById('seriesDetailTitle').innerHTML = `<i class="fas fa-tv"></i> ${seriesName}`;
    
    // REGEL 5: TMDB-Abfrage mit sauberem Topic (nicht mit Episode-Titel!)
    let tmdbSeries = null;
    let tmdbDetails = null;
    
    try {
        console.log('[openSeriesDetail] TMDB-Suche für:', seriesName);
        tmdbSeries = await searchTMDBSeries(seriesName);
        
        if (tmdbSeries && tmdbSeries.id) {
            console.log('[openSeriesDetail] ✓ TMDB Serie gefunden:', tmdbSeries.name, '(ID:', tmdbSeries.id + ')');
            tmdbDetails = await getTMDBSeriesDetails(tmdbSeries.id);
        } else {
            console.log('[openSeriesDetail] ✗ TMDB Serie nicht gefunden');
        }
    } catch (e) {
        console.error('[openSeriesDetail] TMDB-Fehler:', e);
    }
    
    // Parse Episoden (falls noch nicht geparsed)
    const parsedEpisodes = episodes.map(ep => {
        // Wenn schon geparsed (von displaySeriesGrouped), verwende diese Daten
        if (ep.parsedSeason !== undefined && ep.parsedEpisode !== undefined) {
            return ep;
        }
        
        // Sonst: Parse jetzt
        const parser = new EpisodeParser(ep.title, ep.description);
        const parseResult = parser.parse();
        
        return {
            ...ep,
            parsedSeason: parseResult.season || 1,
            parsedEpisode: parseResult.episode || 0,
            parseConfidence: parseResult.confidence,
            parsePattern: parseResult.pattern
        };
    });
    
    // REGEL 4: Gruppiere nach Staffel
    const seasonMap = new Map();
    parsedEpisodes.forEach(ep => {
        const season = ep.parsedSeason || 1;
        if (!seasonMap.has(season)) {
            seasonMap.set(season, []);
        }
        seasonMap.get(season).push(ep);
    });
    
    // REGEL 4: Sortiere Staffeln und Episoden
    const sortedSeasons = Array.from(seasonMap.keys()).sort((a, b) => a - b);
    
    sortedSeasons.forEach(season => {
        const eps = seasonMap.get(season);
        
        // Sortiere Episoden innerhalb der Staffel
        eps.sort((a, b) => {
            // Konvertiere zu Zahlen und behandle undefined/null/0
            const episodeA = parseInt(a.parsedEpisode, 10) || 0;
            const episodeB = parseInt(b.parsedEpisode, 10) || 0;
            
            // Wenn beide Episoden eine gültige Nummer haben (>0): sortiere nach Nummer
            if (episodeA > 0 && episodeB > 0) {
                return episodeA - episodeB;
            }
            
            // REGEL 4: Fallback auf Datum (timestamp), neueste zuerst
            // (Bei Serien wie "Tatort" ohne klare Episodennummern)
            const timestampA = parseInt(a.timestamp, 10) || 0;
            const timestampB = parseInt(b.timestamp, 10) || 0;
            return timestampB - timestampA;
        });
        
        console.log(`[openSeriesDetail] Staffel ${season}: ${eps.length} Episoden sortiert`);
        // Debug: Zeige die sortierten Episodennummern
        console.log(`  → Sortierte Reihenfolge: ${eps.map(e => `E${e.parsedEpisode || '?'}`).join(', ')}`);
    });
    
    // Zeige Serien-Info
    const seriesInfo = document.getElementById('seriesInfo');
    const firstEpisode = episodes[0];
    
    // Verwende TMDB-Beschreibung wenn verfügbar
    let bestDescription = firstEpisode.description || firstEpisode.topic || 'Keine Beschreibung verfügbar';
    
    if (tmdbDetails && tmdbDetails.overview) {
        bestDescription = tmdbDetails.overview;
        console.log('[openSeriesDetail] ✓ Verwende TMDB-Beschreibung');
    } else {
        // Finde beste Beschreibung aus Episoden (ohne Episode-spezifische Begriffe)
        episodes.forEach(ep => {
            if (ep.description && ep.description.length > bestDescription.length) {
                const descLower = ep.description.toLowerCase();
                // Vermeide Episode-spezifische Beschreibungen
                if (!descLower.includes('folge') && 
                    !descLower.includes('episode') && 
                    !descLower.includes('teil') &&
                    !descLower.match(/\bs\d+e\d+/)) {
                    bestDescription = ep.description;
                }
            }
        });
    }
    
    const totalSeasons = sortedSeasons.length;
    
    // Generiere Poster-ID
    const posterId = `series_poster_${btoa(seriesName).substring(0, 16)}`;
    
    // REGEL 5: TMDB-Poster wenn verfügbar
    let posterHTML = `<i class="fas fa-tv" style="opacity: 0.3;"></i>`;
    let posterStyle = '';
    
    if (tmdbDetails && tmdbDetails.poster_path) {
        const posterURL = getTMDBPosterURL(tmdbDetails.poster_path);
        posterStyle = `style="background-image: url(${posterURL}); background-size: cover; background-position: center;"`;
        posterHTML = '';
        console.log('[openSeriesDetail] ✓ Verwende TMDB-Poster');
    }
    
    // Baue Serien-Info HTML
    seriesInfo.innerHTML = `
        <div class="series-info-poster" id="${posterId}" ${posterStyle}>
            ${posterHTML}
        </div>
        <div class="series-info-details">
            <h3>${seriesName}</h3>
            <div class="series-info-meta">
                <span><i class="fas fa-tv"></i> ${firstEpisode.channel}</span>
                <span><i class="fas fa-layer-group"></i> ${totalSeasons} ${totalSeasons === 1 ? 'Staffel' : 'Staffeln'}</span>
                <span><i class="fas fa-list"></i> ${episodes.length} Folgen</span>
                ${tmdbDetails && tmdbDetails.first_air_date ? `<span><i class="fas fa-calendar"></i> ${tmdbDetails.first_air_date.split('-')[0]}</span>` : ''}
            </div>
            <div class="series-info-description">
                ${bestDescription.length > 400 ? bestDescription.substring(0, 400) + '...' : bestDescription}
            </div>
        </div>
    `;
    
    // Lade Video-Thumbnail falls kein TMDB-Poster vorhanden (deaktiviert für bessere Performance)
    // CSS Fallback Gradient wird verwendet
    
    // Zeige Episoden gruppiert nach Staffel
    const episodesGrid = document.getElementById('seriesEpisodesGrid');
    episodesGrid.innerHTML = '';
    
    sortedSeasons.forEach(seasonNum => {
        const seasonEpisodes = seasonMap.get(seasonNum);
        
        // Staffel-Header
        const seasonHeader = document.createElement('div');
        seasonHeader.style.cssText = 'grid-column: 1/-1; margin: 2rem 0 1rem 0; padding: 1rem; background: var(--surface); border-radius: 8px; border: 1px solid var(--border-color);';
        seasonHeader.innerHTML = `
            <h3 style="margin: 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-layer-group"></i>
                Staffel ${seasonNum}
                <span style="color: var(--text-secondary); font-size: 0.9rem; font-weight: normal;">(${seasonEpisodes.length} Folgen)</span>
            </h3>
        `;
        episodesGrid.appendChild(seasonHeader);
        
        // Episoden der Staffel
        seasonEpisodes.forEach((episode, idx) => {
            const card = createVideoCard(episode, idx);
            episodesGrid.appendChild(card);
        });
    });
    
    // Setup Back-Button
    const backBtn = document.getElementById('backFromSeries');
    backBtn.onclick = () => {
        detailPage.style.display = 'none';
        if (mainPage) {
            mainPage.style.display = 'block';
        }
    };
    
    console.log('[openSeriesDetail] ✓ Detail-Seite geladen');
}

// ============================================================================
// ENDE DER NEUEN FUNKTIONEN
// ============================================================================

// Get Channel Gradient helper
function getChannelGradient(channel) {
    const colors = senderColors[channel] || senderColors['DEFAULT'] || ['#374151', '#1f2937'];
    return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
}

// Create series card
function createSeriesCard(seriesName, episodes) {
    const card = document.createElement('div');
    card.className = 'series-card';

    const firstEpisode = episodes[0];
    const gradient = getChannelGradient(firstEpisode.channel);
    const thumbnailId = `thumb-${++thumbIdCounter}`;

    card.innerHTML = `
        <div class="series-card-thumbnail" id="${thumbnailId}" style="background: ${gradient};">
            <span class="sender-logo thumb-overlay-logo">${firstEpisode.channel}</span>
            <div class="duration-badge">${episodes.length} Folgen</div>
        </div>
        <div class="series-card-content">
            <h3 class="series-card-title">${seriesName}</h3>
            <div class="series-card-meta">
                <span class="channel-badge">${firstEpisode.channel}</span>
                <span>${episodes.length} Folgen</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => openSeriesDetail(seriesName, episodes));

    // Queue real thumbnail capture
    const videoUrl = firstEpisode.url_video_low || firstEpisode.url_video;
    if (videoUrl) {
        const ck = simpleHash('series_' + videoUrl);
        setTimeout(() => {
            const el = document.getElementById(thumbnailId);
            if (el) queueRealThumbnail(videoUrl, ck, el, gradient);
        }, 120);
    }

    return card;
}

// Create Video Card
function createVideoCard(item, index) {
    const card = document.createElement('div');
    card.className = 'video-card';

    const duration = Math.round(item.duration / 60);
    const durationText = duration > 0 ? `${duration} Min` : 'Live';

    const gradient = getChannelGradient(item.channel);
    const thumbnailId = `thumb-${++thumbIdCounter}`;

    const date = new Date(item.timestamp * 1000);
    const dateText = formatDate(date);

    card.innerHTML = `
        <div class="video-thumbnail" id="${thumbnailId}" style="background: ${gradient};">
            <span class="sender-logo thumb-overlay-logo">${item.channel}</span>
            <span class="duration-badge">${durationText}</span>
        </div>
        <div class="video-card-content">
            <h3 class="video-card-title">${item.title}</h3>
            <div class="video-card-meta">
                <span class="channel-badge">${item.channel}</span>
                <span class="video-date">${dateText}</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => playVideo(item));

    // Queue real thumbnail with stagger so cards don't all fire at once
    const videoUrl = item.url_video_low || item.url_video;
    if (videoUrl) {
        const ck = simpleHash('vod_' + videoUrl);
        const stagger = index * 80;
        setTimeout(() => {
            const el = document.getElementById(thumbnailId);
            if (el) queueRealThumbnail(videoUrl, ck, el, gradient);
        }, 150 + stagger);
    }

    return card;
}

// Real thumbnails are always loaded via queueRealThumbnail / captureVideoFrame.

// Show/Hide States
function showLoading(show) {
    if (loadingState) loadingState.style.display = show ? 'flex' : 'none';
    if (show && videoGrid) videoGrid.innerHTML = '';
    if (show && emptyState) emptyState.style.display = 'none';
}

function showEmpty(show) {
    if (emptyState) emptyState.style.display = show ? 'block' : 'none';
    if (show && videoGrid) videoGrid.innerHTML = '';
}

// Play Video
function playVideo(item) {
    try {
        const videoUrl = item.url_video_hd || item.url_video || item.url_video_low;
        
        if (!videoUrl) {
            alert('Video-URL nicht verfügbar');
            return;
        }
        
        // Set video info
        const titleEl = document.getElementById('videoTitle');
        const channelEl = document.getElementById('videoChannel');
        const durationEl = document.getElementById('videoDuration');
        const dateEl = document.getElementById('videoDate');
        const descEl = document.getElementById('videoDescription');
        
        if (titleEl) titleEl.textContent = item.title;
        if (channelEl) channelEl.textContent = item.channel;
        if (durationEl) durationEl.textContent = `${Math.round(item.duration / 60)} Min`;
        if (dateEl) dateEl.textContent = formatDate(new Date(item.timestamp * 1000));
        
        // Full description with "Mehr" button
        const description = item.description || item.topic || 'Keine Beschreibung';
        if (descEl) {
            if (description.length > 200) {
                const short = description.substring(0, 200) + '...';
                const descId = 'descText_' + Date.now();
                descEl.innerHTML = `
                    <span id="${descId}">${short}</span> 
                    <button class="more-btn" data-desc-id="${descId}" data-full="${encodeURIComponent(description)}" data-short="${encodeURIComponent(short)}" onclick="window.toggleModalDesc(this)">
                        Mehr anzeigen
                    </button>
                `;
            } else {
                descEl.textContent = description;
            }
        }
        
        // Store current video URL for share button
        window.currentVideoUrl = videoUrl;
        window.currentVideoTitle = item.title;
        
        // Setup quality selector
        const qualitySelector = document.getElementById('qualitySelector');
        if (qualitySelector) {
            qualitySelector.innerHTML = '';
            
            const qualities = [];
            if (item.url_video_hd) qualities.push({ label: 'HD', url: item.url_video_hd });
            if (item.url_video) qualities.push({ label: 'Normal', url: item.url_video });
            if (item.url_video_low) qualities.push({ label: 'Niedrig', url: item.url_video_low });
            
            qualities.forEach((q, idx) => {
                const option = document.createElement('option');
                option.value = q.url;
                option.textContent = q.label;
                if (idx === 0) option.selected = true;
                qualitySelector.appendChild(option);
            });
            
            qualitySelector.onchange = (e) => {
                const currentTime = videoPlayer.currentTime;
                loadVideoSource(e.target.value, currentTime);
            };
        }
        
        // Setup subtitle selector
        const subtitleSelector = document.getElementById('subtitleSelector');
        const subtitleSelectorContainer = document.getElementById('subtitleSelectorContainer');
        const subtitleTrack = document.getElementById('subtitleTrack');
        
        // Always clear and reset subtitle track first
        if (subtitleTrack) {
            subtitleTrack.src = '';
            // Disable all text tracks
            if (videoPlayer.textTracks) {
                Array.from(videoPlayer.textTracks).forEach(track => {
                    track.mode = 'disabled';
                });
            }
        }
        
        if (subtitleSelector && subtitleSelectorContainer) {
            subtitleSelector.innerHTML = '<option value="off" selected>Aus</option>';
            
            // Check if subtitles available
            if (item.url_subtitle) {
                console.log('Subtitles available:', item.url_subtitle);
                
                // Show subtitle selector
                subtitleSelectorContainer.style.display = 'flex';
                
                const option = document.createElement('option');
                option.value = item.url_subtitle;
                option.textContent = 'Deutsch';
                subtitleSelector.appendChild(option);
                
                // Set subtitle track src (but don't enable yet)
                if (subtitleTrack) {
                    subtitleTrack.src = item.url_subtitle;
                }
                
                subtitleSelector.disabled = false;
            } else {
                // Hide subtitle selector completely if no subtitles
                subtitleSelectorContainer.style.display = 'none';
            }
            
            // Handle subtitle selection change
            subtitleSelector.onchange = (e) => {
                console.log('Subtitle changed to:', e.target.value);
                
                if (!subtitleTrack) return;
                
                // Wait for track to be loaded
                const enableSubtitle = () => {
                    if (videoPlayer.textTracks && videoPlayer.textTracks.length > 0) {
                        const track = videoPlayer.textTracks[0];
                        
                        if (e.target.value === 'off') {
                            track.mode = 'disabled';
                            console.log('Subtitles disabled');
                        } else {
                            subtitleTrack.src = e.target.value;
                            track.mode = 'showing';
                            console.log('Subtitles enabled');
                        }
                    }
                };
                
                // Try immediately and with delay
                enableSubtitle();
                setTimeout(enableSubtitle, 100);
                setTimeout(enableSubtitle, 500);
            };
        }
        
        // Load video
        loadVideoSource(videoUrl);
        
        // Show modal
        if (videoModal) videoModal.classList.add('active');
        
        // Save to recently watched
        saveToRecentlyWatched(item);
        
    } catch (error) {
        console.error('Play video error:', error);
        alert('Fehler beim Abspielen: ' + error.message);
    }
}

function loadVideoSource(videoUrl, resumeTime = 0) {
    try {
        if (videoUrl.includes('.m3u8') && typeof Hls !== 'undefined') {
            if (Hls.isSupported()) {
                if (hlsInstance) hlsInstance.destroy();
                hlsInstance = new Hls();
                hlsInstance.loadSource(videoUrl);
                hlsInstance.attachMedia(videoPlayer);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (resumeTime > 0) videoPlayer.currentTime = resumeTime;
                    videoPlayer.play();
                });
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                videoPlayer.src = videoUrl;
                if (resumeTime > 0) videoPlayer.currentTime = resumeTime;
                videoPlayer.play();
            }
        } else {
            videoPlayer.src = videoUrl;
            if (resumeTime > 0) videoPlayer.currentTime = resumeTime;
            videoPlayer.play();
        }
    } catch (error) {
        console.error('Load video error:', error);
    }
}

function closeVideoModal() {
    try {
        if (videoModal) videoModal.classList.remove('active');
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.src = '';
        }
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
    } catch (error) {
        console.error('Close modal error:', error);
    }
}

// Apply Filters
function applyFilters() {
    console.log('Applying filters...');
    
    const channel = document.getElementById('channelFilter')?.value;
    const genre = document.getElementById('genreFilter')?.value;
    const minDuration = parseInt(document.getElementById('durationFilter')?.value || '0');
    const sortBy = document.getElementById('sortFilter')?.value;
    
    console.log('Filter values:', { channel, genre, minDuration, sortBy });
    console.log('Original results length:', originalResults.length);
    console.log('Current results length:', currentResults.length);
    
    // Filter from original results (or current if original is empty)
    let filtered = [...(originalResults.length > 0 ? originalResults : currentResults)];
    
    console.log('Starting with', filtered.length, 'results');
    
    // Channel filter
    if (channel) {
        filtered = filtered.filter(item => item.channel === channel);
        console.log('After channel filter:', filtered.length);
    }
    
    // Genre filter
    if (genre) {
        filtered = filtered.filter(item => {
            const title = (item.title || '').toLowerCase();
            const topic = (item.topic || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            const searchGenre = genre.toLowerCase();
            return title.includes(searchGenre) || topic.includes(searchGenre) || description.includes(searchGenre);
        });
        console.log('After genre filter:', filtered.length);
    }
    
    // Duration filter (convert to minutes)
    if (minDuration > 0) {
        filtered = filtered.filter(item => {
            const durationMinutes = Math.round(item.duration / 60);
            return durationMinutes >= minDuration;
        });
        console.log('After duration filter:', filtered.length, '(min duration:', minDuration, 'min)');
    }
    
    // Sorting
    if (sortBy === 'duration') {
        filtered.sort((a, b) => b.duration - a.duration);
    } else if (sortBy === 'title') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'episode') {
        // Sort by episode number
        filtered.sort((a, b) => {
            const extractEpisode = (title) => {
                console.log('Extracting from:', title);
                
                // S02E03 pattern
                const sxex = title.match(/S(\d+)E(\d+)/i);
                if (sxex) {
                    const val = parseInt(sxex[1]) * 1000 + parseInt(sxex[2]);
                    console.log('  → S*E* pattern:', val);
                    return val;
                }
                
                // Staffel X Folge Y
                const staffelFolge = title.match(/Staffel\s*(\d+).*?Folge\s*(\d+)/i);
                if (staffelFolge) {
                    const val = parseInt(staffelFolge[1]) * 1000 + parseInt(staffelFolge[2]);
                    console.log('  → Staffel/Folge:', val);
                    return val;
                }
                
                // Just Folge/Episode number
                const folge = title.match(/(?:Folge|Episode|Ep\.?)\s*(\d+)/i);
                if (folge) {
                    const val = parseInt(folge[1]);
                    console.log('  → Folge number:', val);
                    return val;
                }
                
                // "1. Title", "2. Title"
                const dotNumber = title.match(/^(\d+)\.\s/);
                if (dotNumber) {
                    const val = parseInt(dotNumber[1]);
                    console.log('  → Dot number:', val);
                    return val;
                }
                
                // "(1)", "(2)"
                const parenNumber = title.match(/\((\d+)\)/);
                if (parenNumber) {
                    const val = parseInt(parenNumber[1]);
                    console.log('  → Paren number:', val);
                    return val;
                }
                
                // "1 - Title", "01 - Title"
                const dashNumber = title.match(/^(\d{1,3})\s*-\s/);
                if (dashNumber) {
                    const val = parseInt(dashNumber[1]);
                    console.log('  → Dash number:', val);
                    return val;
                }
                
                // Just Staffel
                const staffel = title.match(/Staffel\s*(\d+)/i);
                if (staffel) {
                    const val = parseInt(staffel[1]) * 1000;
                    console.log('  → Staffel only:', val);
                    return val;
                }
                
                // Any number in title as last resort
                const anyNumber = title.match(/\d+/);
                if (anyNumber) {
                    const val = parseInt(anyNumber[0]);
                    console.log('  → Any number:', val);
                    return val;
                }
                
                console.log('  → No number found: 0');
                return 0;
            };
            const aEp = extractEpisode(a.title);
            const bEp = extractEpisode(b.title);
            if (aEp !== bEp) return aEp - bEp;
            return a.title.localeCompare(b.title);
        });
        console.log('Sorted by episode number');
    } else if (sortBy === 'date') {
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    console.log('After sorting:', sortBy);
    
    currentResults = filtered;
    currentOffset = 0;
    displayedResults = [];
    
    if (videoGrid) videoGrid.innerHTML = '';
    
    if (filtered.length === 0) {
        console.log('No results after filter');
        showEmpty(true);
        if (emptyState) {
            emptyState.innerHTML = `
                <i class="fas fa-filter"></i>
                <h3>Keine Ergebnisse</h3>
                <p>Keine Videos mit diesen Filtern gefunden. Versuche andere Filter.</p>
            `;
        }
    } else {
        showEmpty(false);
        displayResults();
    }
    
    // Close filter sidebar
    if (filterSidebar) filterSidebar.classList.remove('active');
    
    console.log('Filters applied! Results:', filtered.length);
}

// Display More Results
function displayMoreResults() {
    currentOffset += resultsPerPage;
    const toDisplay = currentResults.slice(currentOffset, currentOffset + resultsPerPage);
    
    toDisplay.forEach((item, index) => {
        const card = createVideoCard(item, currentOffset + index);
        if (videoGrid) videoGrid.appendChild(card);
    });
    
    displayedResults = currentResults.slice(0, currentOffset + resultsPerPage);
    
    if (currentOffset + resultsPerPage >= currentResults.length) {
        const loadMoreContainer = document.querySelector('.load-more-container');
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    }
}

// Page Navigation
function navigateToPage(page) {
    currentPage = page;
    
    const mainVideoSection = document.getElementById('mainVideoSection');
    const historyPage = document.getElementById('historyPage');
    const recentlyWatched = document.getElementById('recentlyWatched');
    
    if (page === 'home') {
        if (mainVideoSection) mainVideoSection.style.display = 'block';
        if (historyPage) historyPage.style.display = 'none';
        if (recentlyWatched) recentlyWatched.style.display = 'block'; // Show on home
        loadDefaultContent();
        loadRecentlyWatched();
    } else if (page === 'history') {
        if (mainVideoSection) mainVideoSection.style.display = 'none';
        if (historyPage) historyPage.style.display = 'block';
        if (recentlyWatched) recentlyWatched.style.display = 'none'; // Hide on history page
        loadFullHistoryPage();
    }
}

// Load Full History Page
function loadFullHistoryPage() {
    const recent = JSON.parse(localStorage.getItem('recentlyWatched') || '[]');
    const historyGrid = document.getElementById('historyGrid');
    
    if (!historyGrid) return;
    
    if (recent.length === 0) {
        historyGrid.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><h3>Kein Verlauf</h3><p>Du hast noch keine Videos angesehen</p></div>';
        return;
    }
    
    historyGrid.innerHTML = '';
    recent.forEach((item, index) => {
        const card = createVideoCard(item, index);
        historyGrid.appendChild(card);
    });
}

// Filter History Page
function filterHistoryPage(query) {
    const recent = JSON.parse(localStorage.getItem('recentlyWatched') || '[]');
    const historyGrid = document.getElementById('historyGrid');
    
    if (!historyGrid) return;
    
    if (!query) {
        loadFullHistoryPage();
        return;
    }
    
    const filtered = recent.filter(item => 
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.channel.toLowerCase().includes(query.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(query.toLowerCase()))
    );
    
    historyGrid.innerHTML = '';
    
    if (filtered.length === 0) {
        historyGrid.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h3>Keine Ergebnisse</h3><p>Keine Videos im Verlauf gefunden</p></div>';
        return;
    }
    
    filtered.forEach((item, index) => {
        const card = createVideoCard(item, index);
        historyGrid.appendChild(card);
    });
}

// Recently Watched Functions
function loadRecentlyWatched() {
    const recent = JSON.parse(localStorage.getItem('recentlyWatched') || '[]');
    
    if (!recentlyWatched || !recentGrid) return;
    
    if (recent.length === 0) {
        recentlyWatched.style.display = 'none';
        return;
    }
    
    recentlyWatched.style.display = 'block';
    recentGrid.innerHTML = '';
    
    // Show full row (10 videos) on home page
    recent.slice(0, 10).forEach((item, index) => {
        const card = createVideoCard(item, index);
        recentGrid.appendChild(card);
    });
}

function saveToRecentlyWatched(item) {
    let recent = JSON.parse(localStorage.getItem('recentlyWatched') || '[]');
    
    // Better duplicate detection: title + channel + timestamp
    const key = `${item.title}_${item.channel}_${item.timestamp}`;
    recent = recent.filter(r => {
        const rKey = `${r.title}_${r.channel}_${r.timestamp}`;
        return rKey !== key;
    });
    
    recent.unshift({
        id: item.id,
        title: item.title,
        channel: item.channel,
        duration: item.duration,
        timestamp: item.timestamp,
        topic: item.topic,
        description: item.description || item.topic,
        url_video: item.url_video,
        url_video_hd: item.url_video_hd,
        url_video_low: item.url_video_low,
        watchedAt: Date.now()
    });
    recent = recent.slice(0, 50); // Keep more history
    localStorage.setItem('recentlyWatched', JSON.stringify(recent));
    loadRecentlyWatched();
}

// Toggle Description in Modal
function toggleDescription(fullDesc, shortDesc) {
    const descText = document.getElementById('descText');
    const btn = document.querySelector('#videoDescription .more-btn');
    
    if (btn && btn.textContent === 'Mehr anzeigen') {
        if (descText) descText.textContent = fullDesc;
        btn.textContent = 'Weniger anzeigen';
    } else {
        if (descText) descText.textContent = shortDesc;
        if (btn) btn.textContent = 'Mehr anzeigen';
    }
}

// Share Video
async function shareVideo() {
    const url = window.currentVideoUrl || videoPlayer.src;
    const title = window.currentVideoTitle || document.getElementById('videoTitle')?.textContent || 'Video';
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: title,
                text: `Schau dir "${title}" an!`,
                url: url
            });
        } catch (err) {
            if (err.name !== 'AbortError') {
                copyToClipboard(url);
            }
        }
    } else {
        copyToClipboard(url);
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Link in Zwischenablage kopiert!');
        });
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('Link in Zwischenablage kopiert!');
    }
}

// Format Date
function formatDate(date) {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Heute';
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    if (diffDays < 30) return `vor ${Math.floor(diffDays / 7)} Wochen`;
    
    return date.toLocaleDateString('de-DE');
}

// Info Modal
function showInfoModal(type) {
    const modal = document.getElementById('infoModal');
    const body = document.getElementById('infoModalBody');
    
    if (!modal || !body) return;
    
    const content = {
        about: `
            <h2>Über StreamHub</h2>
            <p>StreamHub ist eine moderne Desktop-Anwendung für deutsche öffentlich-rechtliche Mediatheken.</p>
            <h3>Features</h3>
            <ul>
                <li>✅ Tausende Videos durchsuchen</li>
                <li>✅ Generierte Thumbnails mit Sender-Branding</li>
                <li>✅ Filter nach Sender und Dauer</li>
                <li>✅ Zuletzt angesehen Funktion</li>
                <li>✅ HD-Qualität wo verfügbar</li>
                <li>✅ Keine Registrierung erforderlich</li>
            </ul>
            <p style="margin-top: 1rem;"><strong>Version:</strong> 3.0.0 (2026)</p>
        `,
        faq: `
            <h2>Häufig gestellte Fragen</h2>
            
            <h3>Woher kommen die Videos?</h3>
            <p>Von den offiziellen Mediatheken der öffentlich-rechtlichen Sender (ARD, ZDF, etc.)</p>
            
            <h3>Sind die Thumbnails echt?</h3>
            <p>Die Thumbnails werden automatisch generiert mit Sender-Branding für beste Performance.</p>
            
            <h3>Ist StreamHub kostenlos?</h3>
            <p>Ja, komplett kostenlos und Open Source.</p>
            
            <h3>Brauche ich einen Account?</h3>
            <p>Nein, keine Registrierung nötig.</p>
            
            <h3>Werden meine Daten gespeichert?</h3>
            <p>Nur lokal auf deinem Gerät (Verlauf). Keine Cloud, keine Server.</p>
        `,
        imprint: `
            <h2>Impressum</h2>
            <p>StreamHub ist ein Open-Source Projekt.</p>
            <p>Diese App ist eine inoffizielle Drittanbieter-Anwendung und steht in keiner Verbindung zu den öffentlich-rechtlichen Sendern.</p>
            <p><strong>Hinweis:</strong> Alle Videos und Inhalte sind Eigentum der jeweiligen Sender.</p>
        `,
        privacy: `
            <h2>Datenschutzerklärung</h2>
            
            <h3>Datenerfassung</h3>
            <p>Diese App speichert:</p>
            <ul>
                <li>✅ <strong>LocalStorage</strong>: Verlauf (nur lokal, nicht auf Server)</li>
                <li>✅ <strong>Keine Cookies</strong></li>
                <li>✅ <strong>Keine Tracking-Tools</strong></li>
                <li>✅ <strong>Keine Accounts</strong></li>
            </ul>
            
            <h3>Externe Dienste</h3>
            <ul>
                <li>📺 <strong>Videos</strong>: Von Sender-Servern geladen</li>
                <li>🔌 <strong>CDN</strong>: Font Awesome, HLS.js</li>
            </ul>
        `,
        terms: `
            <h2>Nutzungsbedingungen</h2>
            
            <h3>1. Nutzung</h3>
            <p>Diese App ist:</p>
            <ul>
                <li>✅ Kostenlos</li>
                <li>✅ Open Source</li>
                <li>✅ Ohne Garantie ("as-is")</li>
            </ul>
            
            <h3>2. Haftungsausschluss</h3>
            <ul>
                <li>⚠️ <strong>Inoffizielle App</strong> - Keine Verbindung zu den Sendern</li>
                <li>⚠️ <strong>Keine Garantie</strong> für Verfügbarkeit</li>
                <li>⚠️ <strong>Video-Inhalte</strong> gehören den Sendern</li>
            </ul>
            
            <h3>3. Urheberrecht</h3>
            <p>Alle Videos sind urheberrechtlich geschützt und gehören den jeweiligen öffentlich-rechtlichen Sendern.</p>
        `
    };
    
    body.innerHTML = content[type] || '<p>Inhalt nicht gefunden</p>';
    modal.classList.add('active');
}

console.log('Renderer.js loaded successfully!');

// ===== LIVE TV CHANNELS =====
const liveChannels = [
    // ── ARD-Familie ──────────────────────────────────────────────────────────
    { name: 'Das Erste HD', channel: 'ARD', url: 'https://daserste-live.ard-mcdn.de/daserste/live/hls/de/master.m3u8' },
    { name: 'tagesschau24', channel: 'ARD', url: 'https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8' },
    { name: 'Phoenix HD',   channel: 'ARD', url: 'https://zdf-hls-19.akamaized.net/hls/live/2016502/de/veryhigh/master.m3u8' },
    { name: 'ARD alpha',    channel: 'ARD', url: 'https://mcdn.br.de/br/fs/ard_alpha/hls/de/master.m3u8' },
    // ── ZDF-Familie ──────────────────────────────────────────────────────────
    { name: 'ZDF HD',    channel: 'ZDF', url: 'https://zdf-hls-15.akamaized.net/hls/live/2016498/de/veryhigh/master.m3u8' },
    { name: 'ZDFneo',    channel: 'ZDF', url: 'https://zdf-hls-16.akamaized.net/hls/live/2016499/de/veryhigh/master.m3u8' },
    { name: 'ZDFinfo',   channel: 'ZDF', url: 'https://zdf-hls-17.akamaized.net/hls/live/2016500/de/veryhigh/master.m3u8' },
    { name: '3sat HD',   channel: '3sat', url: 'https://zdf-hls-18.akamaized.net/hls/live/2016501/dach/veryhigh/master.m3u8' },
    // ── Internationale ───────────────────────────────────────────────────────
    { name: 'ARTE', channel: 'ARTE', url: 'https://artesimulcast.akamaized.net/hls/live/2030993/artelive_de/master.m3u8' },
    // ── Dritte Programme ─────────────────────────────────────────────────────
    { name: 'BR Fernsehen', channel: 'BR',  url: 'https://mcdn.br.de/br/fs/bfs_sued/hls/de/master.m3u8' },
    { name: 'hr-fernsehen', channel: 'HR',  url: 'https://hrhls.akamaized.net/hls/live/2024525/hrhls/master.m3u8' },
    { name: 'MDR Sachsen',  channel: 'MDR', url: 'https://mdrtvsnhls.akamaized.net/hls/live/2016928/mdrtvsn/master.m3u8' },
    { name: 'NDR Fernsehen',channel: 'NDR', url: 'https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_nds/master.m3u8' },
    { name: 'rbb Fernsehen',channel: 'RBB', url: 'https://rbb-hls-berlin.akamaized.net/hls/live/2017824/rbb_berlin/master.m3u8' },
    { name: 'SR Fernsehen', channel: 'SR',  url: 'https://srfs.akamaized.net/hls/live/689649/srfsgeo/index.m3u8' },
    { name: 'SWR BW HD',    channel: 'SWR', url: 'https://swrbwd-hls.akamaized.net/hls/live/2018672/swrbwd/master.m3u8' },
    { name: 'WDR HD',       channel: 'WDR', url: 'https://wdrfs247.akamaized.net/hls/live/681509/wdr_msl4_fs247/master.m3u8' },
];

function loadLiveChannels() {
    console.log('Loading live channels...');
    const grid = document.getElementById('liveChannelsGrid');
    if (!grid) {
        console.error('liveChannelsGrid not found!');
        return;
    }
    
    grid.innerHTML = '';
    
    liveChannels.forEach(channel => {
        const card = document.createElement('div');
        card.className = 'live-channel-card';
        
        const colors = senderColors[channel.channel] || senderColors.DEFAULT;
        
        const liveThumbId = `thumb-${++thumbIdCounter}`;
        const liveGradient = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
        card.innerHTML = `
            <div class="live-channel-thumbnail" id="${liveThumbId}" style="background: ${liveGradient}">
                <div class="live-badge">
                    <i class="fas fa-circle"></i> LIVE
                </div>
                <i class="fas fa-broadcast-tower live-tower-icon" style="font-size: 3rem; opacity: 0.3;"></i>
            </div>
            <div class="live-channel-info">
                <h3>${channel.name}</h3>
                <span class="channel-badge" style="background: ${colors[0]}">${channel.channel}</span>
            </div>
        `;

        // Queue live stream thumbnail capture (staggered to avoid hammering)
        const liveCk = simpleHash('live_' + channel.name);
        const liveIdx = liveChannels.indexOf(channel);
        setTimeout(() => {
            const el = document.getElementById(liveThumbId);
            if (el) queueRealThumbnail(channel.url, liveCk, el, liveGradient);
        }, 400 + liveIdx * 600);
        
        card.addEventListener('click', () => {
            console.log('Playing channel:', channel.name);
            playLiveChannel(channel);
        });
        
        grid.appendChild(card);
    });
    
    console.log('Live channels loaded!');
}

function playLiveChannel(channel) {
    try {
        console.log('playLiveChannel:', channel.name);
        
        if (!videoModal || !videoPlayer) {
            console.error('Modal/Player not found!');
            return;
        }
        
        videoModal.classList.add('active');
        
        const videoTitle = document.getElementById('videoTitle');
        const videoChannel = document.getElementById('videoChannel');
        const videoDescription = document.getElementById('videoDescription');
        
        if (videoTitle) videoTitle.textContent = channel.name + ' - Live';
        if (videoChannel) {
            const colors = senderColors[channel.channel] || senderColors.DEFAULT;
            videoChannel.textContent = channel.channel;
            videoChannel.style.background = colors[0];
        }
        if (videoDescription) videoDescription.textContent = 'Live-Stream';
        
        // Load HLS stream
        if (channel.url.includes('.m3u8') && typeof Hls !== 'undefined') {
            if (Hls.isSupported()) {
                if (hlsInstance) hlsInstance.destroy();
                hlsInstance = new Hls();
                hlsInstance.loadSource(channel.url);
                hlsInstance.attachMedia(videoPlayer);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    videoPlayer.play();
                });
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                videoPlayer.src = channel.url;
                videoPlayer.play();
            }
        } else {
            videoPlayer.src = channel.url;
            videoPlayer.play();
        }
        
        console.log('Live channel playing!');
    } catch (error) {
        console.error('playLiveChannel error:', error);
        alert('Fehler beim Laden des Live-Streams: ' + error.message);
    }
}

// ===== LOKALE VIDEOS =====

function loadLocalFolders() {
    console.log('Loading local folders...');
    localFolders = JSON.parse(localStorage.getItem('localFolders') || '[]');
    console.log('Local folders:', localFolders);
}

function saveLocalFolders() {
    localStorage.setItem('localFolders', JSON.stringify(localFolders));
    console.log('Local folders saved');
}

async function addLocalFolderDialog() {
    console.log('addLocalFolderDialog called');
    if (window.electronAPI && window.electronAPI.selectFolder) {
        console.log('ElectronAPI available, selecting folder...');
        const folderPath = await window.electronAPI.selectFolder();
        console.log('Selected folder:', folderPath);
        if (folderPath) {
            if (!localFolders.includes(folderPath)) {
                localFolders.push(folderPath);
                saveLocalFolders();
                await scanLocalVideos();
            }
        }
    } else {
        console.error('ElectronAPI not available');
        alert('Diese Funktion benötigt die Desktop-Version (Electron)');
    }
}

async function scanLocalVideos() {
    console.log('Scanning local videos...');
    localVideos = [];
    
    if (window.electronAPI && window.electronAPI.scanVideos) {
        for (const folder of localFolders) {
            try {
                console.log('Scanning folder:', folder);
                const videos = await window.electronAPI.scanVideos(folder);
                console.log('Found videos:', videos.length);
                localVideos.push(...videos);
            } catch (e) {
                console.error('Scan error:', e);
            }
        }
    }
    
    loadLocalVideosPage();
}

function loadLocalVideosPage() {
    console.log('Loading local videos page...');
    const container = document.getElementById('localFoldersContainer');
    const grid = document.getElementById('localFoldersGrid');
    
    if (!container || !grid) {
        console.error('Local video elements not found!');
        return;
    }
    
    // Show folders as cards
    if (localFolders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>Keine lokalen Ordner</h3>
                <p>Füge einen Ordner hinzu, um lokale Videos anzuzeigen</p>
            </div>
        `;
        grid.innerHTML = '';
        container.style.display = 'block';
        return;
    }
    
    container.style.display = 'none';
    
    // Group videos by folder
    const videosByFolder = {};
    localVideos.forEach(video => {
        const folder = video.path.substring(0, video.path.lastIndexOf('/') || video.path.lastIndexOf('\\'));
        if (!videosByFolder[folder]) {
            videosByFolder[folder] = [];
        }
        videosByFolder[folder].push(video);
    });
    
    // Create folder cards
    grid.innerHTML = '';
    
    console.log('Creating folder cards for', localFolders.length, 'folders');
    console.log('Videos by folder:', videosByFolder);
    
    localFolders.forEach(folder => {
        const videos = videosByFolder[folder] || [];
        const folderName = folder.split('/').pop() || folder.split('\\').pop() || folder;
        
        console.log(`Folder "${folderName}":`, videos.length, 'videos');
        
        const card = document.createElement('div');
        card.className = 'folder-card';
        
        // Get first video thumbnail for preview (if available)
        const previewVideo = videos[0];
        let thumbnailHtml = `<i class="fas fa-folder"></i>`;
        
        // Show warning if no videos found
        const videoCountClass = videos.length === 0 ? 'style="background: #dc2626;"' : '';
        const videoCountText = videos.length === 0 ? '⚠ Keine Videos' : `${videos.length} Videos`;
        
        card.innerHTML = `
            <div class="folder-card-thumbnail">
                ${thumbnailHtml}
                <div class="duration-badge" ${videoCountClass}>${videoCountText}</div>
            </div>
            <div class="folder-card-content">
                <h3 class="folder-card-title">${folderName}</h3>
                <div class="folder-card-meta">
                    <span class="folder-card-path">${folder}</span>
                    <button class="folder-action-btn" onclick="event.stopPropagation(); removeLocalFolder('${folder.replace(/'/g, "\\'")}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Only allow clicking if there are videos
        if (videos.length > 0) {
            card.addEventListener('click', () => openFolderDetail(folder, videos));
        } else {
            card.style.opacity = '0.6';
            card.style.cursor = 'not-allowed';
        }
        
        grid.appendChild(card);
    });
    
    console.log('Local videos page loaded as folder cards!');
}

// Open folder detail page
function openFolderDetail(folderPath, videos) {
    console.log('Opening folder detail:', folderPath);
    
    // Hide local page, show detail page
    document.getElementById('localPage').style.display = 'none';
    document.getElementById('localFolderDetailPage').style.display = 'block';
    
    // Set title
    const folderName = folderPath.split('/').pop() || folderPath.split('\\').pop() || folderPath;
    document.getElementById('folderDetailTitle').innerHTML = `<i class="fas fa-folder-open"></i> ${folderName}`;
    
    // Store current folder for sorting
    window.currentFolderVideos = videos;
    window.currentFolderPath = folderPath;
    
    // Initial render
    renderFolderVideos(videos);
    
    // Setup sorting
    const sortSelect = document.getElementById('localSortBy');
    if (sortSelect) {
        sortSelect.value = 'name';
        sortSelect.onchange = () => {
            const sortedVideos = sortFolderVideos(window.currentFolderVideos, sortSelect.value);
            renderFolderVideos(sortedVideos);
        };
    }
}

// Sort folder videos
function sortFolderVideos(videos, sortBy) {
    const sorted = [...videos];
    
    switch(sortBy) {
        case 'name':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'size':
            sorted.sort((a, b) => b.size - a.size);
            break;
        case 'date':
            sorted.sort((a, b) => (b.modified || 0) - (a.modified || 0));
            break;
    }
    
    return sorted;
}

// Render folder videos in detail view
function renderFolderVideos(videos) {
    const grid = document.getElementById('folderDetailGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    videos.forEach((video, idx) => {
        const card = document.createElement('div');
        card.className = 'video-card';
        const thumbId = `detail_thumb_${idx}`;
        
        // Format size
        const sizeM = (video.size / (1024 * 1024)).toFixed(1);
        
        card.innerHTML = `
            <div class="video-thumbnail local-video-thumbnail" id="${thumbId}">
                <i class="fas fa-file-video" style="font-size: 3rem;"></i>
                <div class="duration-badge">${video.ext}</div>
            </div>
            <div class="video-card-content">
                <h3 class="video-card-title">${video.name}</h3>
                <div class="video-card-meta">
                    <span class="channel-badge" style="background: #374151">
                        <i class="fas fa-hdd"></i> ${sizeM} MB
                    </span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => playLocalVideo(video));
        grid.appendChild(card);
        
        // Queue thumbnail generation
        const thumbEl = document.getElementById(thumbId);
        if (thumbEl) {
            queueThumbnailGeneration(video.path, thumbEl);
        }
    });
}

// Back to folders button
document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('backToLocalFolders');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('localFolderDetailPage').style.display = 'none';
            document.getElementById('localPage').style.display = 'block';
        });
    }
});

// Toggle folder collapse

// Thumbnail generation queue to prevent lag
let thumbnailQueue = [];
let isProcessingThumbnails = false;
const MAX_CONCURRENT_THUMBNAILS = 2;
let activeThumbnails = 0;

async function processThumbnailQueue() {
    if (isProcessingThumbnails || thumbnailQueue.length === 0 || activeThumbnails >= MAX_CONCURRENT_THUMBNAILS) {
        return;
    }
    
    isProcessingThumbnails = true;
    
    while (thumbnailQueue.length > 0 && activeThumbnails < MAX_CONCURRENT_THUMBNAILS) {
        const item = thumbnailQueue.shift();
        activeThumbnails++;
        generateLocalThumbnail(item.videoPath, item.thumbnailElement).finally(() => {
            activeThumbnails--;
            processThumbnailQueue();
        });
    }
    
    isProcessingThumbnails = false;
}

function queueThumbnailGeneration(videoPath, thumbnailElement) {
    thumbnailQueue.push({ videoPath, thumbnailElement });
    processThumbnailQueue();
}

// Generate thumbnail from local video
async function generateLocalThumbnail(videoPath, thumbnailElement) {
    return new Promise((resolve) => {
        try {
            const cachedThumb = localStorage.getItem(`local_thumb_${videoPath}`);
            if (cachedThumb) {
                thumbnailElement.style.backgroundImage = `url(${cachedThumb})`;
                thumbnailElement.innerHTML = '';
                resolve();
                return;
            }
            
            const video = document.createElement('video');
            video.muted = true;
            video.preload = 'metadata';
            video.src = `file://${videoPath}`;
            
            let cleaned = false;
            const cleanup = () => {
                if (!cleaned) {
                    cleaned = true;
                    video.src = '';
                    video.load();
                    video.remove();
                }
            };
            
            const timeout = setTimeout(() => {
                console.log('Thumbnail generation timeout for:', videoPath);
                cleanup();
                resolve();
            }, 10000);
            
            video.addEventListener('loadeddata', () => {
                video.currentTime = Math.min(5, video.duration * 0.1);
            });
            
            video.addEventListener('seeked', () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 320;
                    canvas.height = 180;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, 320, 180);
                    const thumbnail = canvas.toDataURL('image/jpeg', 0.6);
                    
                    thumbnailElement.style.backgroundImage = `url(${thumbnail})`;
                    thumbnailElement.innerHTML = '';
                    
                    // Cache it
                    try {
                        localStorage.setItem(`local_thumb_${videoPath}`, thumbnail);
                    } catch (e) {
                        console.warn('Could not cache thumbnail - storage full?');
                    }
                } catch (e) {
                    console.error('Local thumbnail error:', e);
                }
                
                clearTimeout(timeout);
                cleanup();
                resolve();
            });
            
            video.addEventListener('error', () => {
                console.log('Could not generate thumbnail for:', videoPath);
                clearTimeout(timeout);
                cleanup();
                resolve();
            });
        } catch (e) {
            console.error('Generate thumbnail error:', e);
            resolve();
        }
    });
}

window.removeLocalFolder = function(path) {
    console.log('Removing folder:', path);
    localFolders = localFolders.filter(f => f !== path);
    saveLocalFolders();
    loadLocalVideosPage();
};

function playLocalVideo(video) {
    try {
        console.log('Playing local video:', video.name);
        if (!videoModal || !videoPlayer) return;
        
        videoModal.classList.add('active');
        
        const videoTitle = document.getElementById('videoTitle');
        const videoChannel = document.getElementById('videoChannel');
        const videoDescription = document.getElementById('videoDescription');
        
        if (videoTitle) videoTitle.textContent = video.name;
        if (videoChannel) {
            videoChannel.textContent = 'Lokal';
            videoChannel.style.background = '#374151';
        }
        if (videoDescription) videoDescription.textContent = video.path;
        
        videoPlayer.src = `file://${video.path}`;
        videoPlayer.play();
    } catch (error) {
        console.error('Play local video error:', error);
        alert('Fehler beim Laden: ' + error.message);
    }
}

// ===== SETTINGS =====
function loadSettings() {
    console.log('Loading settings...');
    useRealThumbnails = localStorage.getItem('useRealThumbnails') === 'true';
    const settingRealThumbnails = document.getElementById('settingRealThumbnails');
    const realThumbnailsToggle = document.getElementById('realThumbnailsToggle');
    if (settingRealThumbnails) settingRealThumbnails.checked = useRealThumbnails;
    if (realThumbnailsToggle) realThumbnailsToggle.checked = useRealThumbnails;

    // TMDB key
    const savedKey = localStorage.getItem('tmdbApiKey') || '';
    TMDB_API_KEY = savedKey;
    const tmdbInput = document.getElementById('settingTmdbKey');
    if (tmdbInput) {
        tmdbInput.value = savedKey;
        // Show a masked placeholder if key is set
        tmdbInput.placeholder = savedKey ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (gespeichert)' : 'Key von themoviedb.org eingeben...';
    }

    // Save TMDB key button
    const saveBtn = document.getElementById('saveTmdbKey');
    if (saveBtn && !saveBtn._bound) {
        saveBtn._bound = true;
        saveBtn.addEventListener('click', () => {
            const key = (tmdbInput ? tmdbInput.value : '').trim();
            TMDB_API_KEY = key;
            localStorage.setItem('tmdbApiKey', key);
            tmdbSeriesCache.clear();
            saveBtn.innerHTML = '<i class="fas fa-check"></i> Gespeichert!';
            saveBtn.style.background = 'var(--success)';
            setTimeout(() => {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Speichern';
                saveBtn.style.background = '';
                if (tmdbInput) tmdbInput.placeholder = key ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (gespeichert)' : 'Key von themoviedb.org eingeben...';
            }, 2000);
        });
    }

    console.log('Settings loaded:', { useRealThumbnails, tmdbKeySet: !!TMDB_API_KEY });
}

function saveSettings() {
    localStorage.setItem('useRealThumbnails', useRealThumbnails);
    console.log('Settings saved:', { useRealThumbnails });
}

// ===== NAVIGATION =====
window.navigateToPage = function(page) {
    console.log('navigateToPage:', page);
    
    const mainVideoSection = document.getElementById('mainVideoSection');
    const historyPage = document.getElementById('historyPage');
    const recentlyWatched = document.getElementById('recentlyWatched');
    const livePage = document.getElementById('livePage');
    const localPage = document.getElementById('localPage');
    const settingsPage = document.getElementById('settingsPage');
    const seriesDetailPage = document.getElementById('seriesDetailPage');
    const localFolderDetailPage = document.getElementById('localFolderDetailPage');
    
    // Hide all pages including detail pages
    if (mainVideoSection) mainVideoSection.style.display = 'none';
    if (historyPage) historyPage.style.display = 'none';
    if (recentlyWatched) recentlyWatched.style.display = 'none';
    if (livePage) livePage.style.display = 'none';
    if (localPage) localPage.style.display = 'none';
    if (settingsPage) settingsPage.style.display = 'none';
    if (seriesDetailPage) seriesDetailPage.style.display = 'none';
    if (localFolderDetailPage) localFolderDetailPage.style.display = 'none';
    
    // Show requested
    if (page === 'home') {
        if (mainVideoSection) mainVideoSection.style.display = 'block';
        if (recentlyWatched) recentlyWatched.style.display = 'block';
        loadDefaultContent();
        loadRecentlyWatched();
    } else if (page === 'history') {
        if (historyPage) historyPage.style.display = 'block';
        loadFullHistoryPage();
    } else if (page === 'live') {
        if (livePage) livePage.style.display = 'block';
        loadLiveChannels();
    } else if (page === 'local') {
        if (localPage) localPage.style.display = 'block';
        loadLocalVideosPage();
    } else if (page === 'settings') {
        if (settingsPage) settingsPage.style.display = 'block';
        loadSettings();
    }
    
    console.log('Page navigated to:', page);
};

// ===== TOGGLE DESCRIPTION =====
window.toggleModalDesc = function(btn) {
    const descId = btn.dataset.descId;
    const fullDesc = decodeURIComponent(btn.dataset.full);
    const shortDesc = decodeURIComponent(btn.dataset.short);
    const descText = document.getElementById(descId);
    
    if (btn.textContent.includes('Mehr')) {
        if (descText) descText.textContent = fullDesc;
        btn.textContent = 'Weniger anzeigen';
    } else {
        if (descText) descText.textContent = shortDesc;
        btn.textContent = 'Mehr anzeigen';
    }
};

console.log('All features loaded!');

// ===== REAL THUMBNAIL CAPTURE SYSTEM =====

/** djb2-style hash — no crypto needed in renderer */
function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < Math.min(str.length, 300); i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
        h = h >>> 0;
    }
    return h.toString(36);
}

/**
 * Capture a single JPEG frame from videoUrl.
 * Supports plain MP4/WebM and HLS (.m3u8) via hls.js.
 * Returns a data-URL string or null on failure.
 */
async function captureVideoFrame(videoUrl) {
    return new Promise((resolve) => {
        let resolved = false;
        let hlsCap = null;

        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'metadata';
        video.playsInline = true;
        // Hidden but with actual dimensions so drawImage works
        video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:320px;height:180px;visibility:hidden;pointer-events:none;';
        document.body.appendChild(video);

        const done = (result) => {
            if (resolved) return;
            resolved = true;
            try {
                if (hlsCap) { hlsCap.destroy(); hlsCap = null; }
                video.pause();
                video.removeAttribute('src');
                video.load();
                video.remove();
            } catch (_) {}
            resolve(result);
        };

        const timeout = setTimeout(() => done(null), 16000);

        const captureFrame = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 180;
                canvas.getContext('2d').drawImage(video, 0, 0, 320, 180);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
                clearTimeout(timeout);
                done(dataUrl);
            } catch (e) {
                clearTimeout(timeout);
                done(null);
            }
        };

        video.addEventListener('seeked', captureFrame, { once: true });
        video.addEventListener('loadeddata', () => {
            try {
                const t = Math.min(5, (video.duration || 10) * 0.08);
                video.currentTime = t > 0.5 ? t : 3;
            } catch (e) { done(null); }
        }, { once: true });
        video.addEventListener('error', () => { clearTimeout(timeout); done(null); }, { once: true });

        if (videoUrl && videoUrl.includes('.m3u8')) {
            // HLS stream — use hls.js
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                hlsCap = new Hls({ maxBufferLength: 8, maxMaxBufferLength: 15, enableWorker: false });
                hlsCap.loadSource(videoUrl);
                hlsCap.attachMedia(video);
                hlsCap.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play()
                        .then(() => setTimeout(() => { video.pause(); captureFrame(); }, 2800))
                        .catch(() => done(null));
                });
                hlsCap.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { clearTimeout(timeout); done(null); } });
            } else {
                done(null);
            }
        } else {
            video.src = videoUrl;
        }
    });
}

// ── Thumbnail queue ────────────────────────────────────────────────────────────
const realThumbQueue = [];
let realThumbBusy = false;
const MAX_REAL_THUMBS = 3;
let activeRealThumbs = 0;

function queueRealThumbnail(videoUrl, cacheKey, element, fallbackGradient) {
    if (!videoUrl || !element) return;
    realThumbQueue.push({ videoUrl, cacheKey, element, fallbackGradient });
    drainThumbQueue();
}

async function drainThumbQueue() {
    if (realThumbBusy) return;
    realThumbBusy = true;
    while (realThumbQueue.length > 0 && activeRealThumbs < MAX_REAL_THUMBS) {
        const item = realThumbQueue.shift();
        activeRealThumbs++;
        loadRealThumbnail(item.videoUrl, item.cacheKey, item.element, item.fallbackGradient)
            .finally(() => { activeRealThumbs--; drainThumbQueue(); });
    }
    realThumbBusy = false;
}

/** Apply a captured frame to the thumbnail element with a smooth fade */
function applyThumbDataUrl(element, dataUrl) {
    if (!element || !element.isConnected) return;
    element.style.transition = 'background-image 0.3s ease';
    element.style.backgroundImage = `url(${dataUrl})`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    // Fade out overlay text
    const logo = element.querySelector('.thumb-overlay-logo');
    if (logo) { logo.style.transition = 'opacity 0.4s'; logo.style.opacity = '0'; }
    const tower = element.querySelector('.live-tower-icon');
    if (tower) { tower.style.transition = 'opacity 0.4s'; tower.style.opacity = '0'; }
}

/** Load real thumbnail: disk cache → localStorage → live capture */
async function loadRealThumbnail(videoUrl, cacheKey, element, fallbackGradient) {
    if (!videoUrl || !element) return;
    try {
        // 1. Electron disk cache (primary — no size limit)
        if (window.electronAPI && window.electronAPI.getCachedThumbnail) {
            const cached = await window.electronAPI.getCachedThumbnail(cacheKey);
            if (cached) { applyThumbDataUrl(element, cached); return; }
        }
        // 2. localStorage (secondary, 5 MB limit)
        try {
            const lsCached = localStorage.getItem('t_' + cacheKey);
            if (lsCached) {
                applyThumbDataUrl(element, lsCached);
                if (window.electronAPI && window.electronAPI.setCachedThumbnail) {
                    window.electronAPI.setCachedThumbnail(cacheKey, lsCached).catch(() => {});
                    localStorage.removeItem('t_' + cacheKey);
                }
                return;
            }
        } catch (_) {}
        // 3. Capture new frame
        const frame = await captureVideoFrame(videoUrl);
        if (frame) {
            applyThumbDataUrl(element, frame);
            if (window.electronAPI && window.electronAPI.setCachedThumbnail) {
                window.electronAPI.setCachedThumbnail(cacheKey, frame).catch(() => {});
            } else {
                try { localStorage.setItem('t_' + cacheKey, frame); } catch (_) {}
            }
        }
    } catch (e) {
        console.warn('[Thumb] Error loading thumbnail:', e.message);
    }
}

console.log('Real thumbnail capture system loaded!');

// ===== TMDB API INTEGRATION =====
// TMDB API key — loaded from localStorage; users set it in Settings
// Get a free key at https://www.themoviedb.org/settings/api
let TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Cache for TMDB series data
const tmdbSeriesCache = new Map();

// Search for a series on TMDB
async function searchTMDBSeries(seriesName) {
    // Check if API key is configured
    if (TMDB_API_KEY === 'YOUR_API_KEY_HERE') {
        console.log('TMDB API key not configured');
        return null;
    }
    
    // Check cache
    const cacheKey = `search_${seriesName.toLowerCase()}`;
    if (tmdbSeriesCache.has(cacheKey)) {
        return tmdbSeriesCache.get(cacheKey);
    }
    
    try {
        const url = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&language=de-DE&query=${encodeURIComponent(seriesName)}`;
        console.log('Searching TMDB for:', seriesName);
        
        const response = await fetch(url);
        if (!response.ok) {
            console.error('TMDB search failed:', response.status);
            return null;
        }
        
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const series = data.results[0]; // Take first result
            console.log('Found TMDB series:', series.name, 'ID:', series.id);
            
            // Cache the result
            tmdbSeriesCache.set(cacheKey, series);
            return series;
        }
        
        return null;
    } catch (error) {
        console.error('TMDB search error:', error);
        return null;
    }
}

// Get detailed series information from TMDB
async function getTMDBSeriesDetails(seriesId) {
    // Check if API key is configured
    if (TMDB_API_KEY === 'YOUR_API_KEY_HERE') {
        return null;
    }
    
    // Check cache
    const cacheKey = `details_${seriesId}`;
    if (tmdbSeriesCache.has(cacheKey)) {
        return tmdbSeriesCache.get(cacheKey);
    }
    
    try {
        const url = `${TMDB_BASE_URL}/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=de-DE`;
        console.log('Fetching TMDB details for ID:', seriesId);
        
        const response = await fetch(url);
        if (!response.ok) {
            console.error('TMDB details failed:', response.status);
            return null;
        }
        
        const data = await response.json();
        console.log('Got TMDB details:', data.name);
        
        // Cache the result
        tmdbSeriesCache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error('TMDB details error:', error);
        return null;
    }
}

// Get TMDB poster URL
function getTMDBPosterURL(posterPath, size = 'w500') {
    if (!posterPath) return null;
    return `${TMDB_IMAGE_BASE}/${size}${posterPath}`;
}

// Get TMDB backdrop URL
function getTMDBBackdropURL(backdropPath, size = 'w1280') {
    if (!backdropPath) return null;
    return `${TMDB_IMAGE_BASE}/${size}${backdropPath}`;
}

console.log('TMDB API integration loaded (configure API key to enable)!');

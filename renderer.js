// StreamHub v2.4.0 - SIMPLE & STABLE VERSION
console.log('StreamHub starting...');

// API Configuration
const API_URL = 'https://mediathekviewweb.de/api/query';

// DOM Elements - Get them safely
let searchInput, videoGrid, loadingState, emptyState, sectionTitle, resultsCount, loadMore;
let videoModal, videoPlayer, closeModal, hamburgerMenu, closeHamburger, hamburgerSidebar;
let filterToggle, filterSidebar, closeFilter, applyFilter, resetFilter, sidebarBackdrop;
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

// Global state for grouped display items
let currentDisplayItems = [];
let previousPage = 'home';

// --- Suchverlauf (Search History) Helpers ---
function getSearchHistory() {
    try {
        return JSON.parse(localStorage.getItem('streamhubSearchHistory') || '[]');
    } catch (e) {
        return [];
    }
}

function saveSearchQuery(query) {
    if (!query || !query.trim()) return;
    const cleanQuery = query.trim();
    try {
        let history = getSearchHistory();
        history = history.filter(item => item.toLowerCase() !== cleanQuery.toLowerCase());
        history.unshift(cleanQuery);
        if (history.length > 10) {
            history = history.slice(0, 10);
        }
        localStorage.setItem('streamhubSearchHistory', JSON.stringify(history));
    } catch (e) {
        console.error('Error saving search query:', e);
    }
}

function removeSearchQuery(query) {
    try {
        let history = getSearchHistory();
        history = history.filter(item => item.toLowerCase() !== query.toLowerCase());
        localStorage.setItem('streamhubSearchHistory', JSON.stringify(history));
    } catch (e) {
        console.error('Error removing search query:', e);
    }
}

function showSearchHistoryDropdown() {
    const dropdown = document.getElementById('searchHistoryDropdown');
    if (!dropdown) return;
    
    const history = getSearchHistory();
    if (history.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = '';
    history.forEach(query => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <i class="fas fa-history"></i>
            <span class="history-text" style="flex: 1;">${query}</span>
            <button class="delete-history-btn" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" title="Löschen">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Handle click on text to search
        item.querySelector('.history-text').addEventListener('click', () => {
            if (searchInput) searchInput.value = query;
            performSearch(query);
            hideSearchHistoryDropdown();
        });
        
        // Handle click on delete button
        item.querySelector('.delete-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeSearchQuery(query);
            showSearchHistoryDropdown(); // Refresh dropdown
        });
        
        dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
}

function hideSearchHistoryDropdown() {
    const dropdown = document.getElementById('searchHistoryDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

// --- Wiedergabefortschritt (Playback Progress) Helpers ---
function getVideoProgressKey(item) {
    if (!item) return '';
    if (item.title && item.channel && item.timestamp) {
        try {
            return `${item.channel}_${item.timestamp}_${btoa(unescape(encodeURIComponent(item.title))).substring(0, 32)}`;
        } catch (e) {
            return `${item.channel}_${item.timestamp}_${item.title.replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)}`;
        }
    }
    return item.url_video || item.url_video_low || item.url_video_hd || '';
}

function saveVideoProgress(url, currentTime, duration) {
    try {
        const progressMap = JSON.parse(localStorage.getItem('videoProgressMap') || '{}');
        progressMap[url] = {
            currentTime: currentTime,
            duration: duration,
            percent: Math.round((currentTime / duration) * 100),
            timestamp: Date.now()
        };
        const keys = Object.keys(progressMap);
        if (keys.length > 100) {
            const sorted = keys.sort((a, b) => progressMap[a].timestamp - progressMap[b].timestamp);
            delete progressMap[sorted[0]];
        }
        localStorage.setItem('videoProgressMap', JSON.stringify(progressMap));
    } catch (e) {
        console.error('Error saving progress:', e);
    }
}

function getVideoProgress(url) {
    try {
        const progressMap = JSON.parse(localStorage.getItem('videoProgressMap') || '{}');
        return progressMap[url] || null;
    } catch (e) {
        return null;
    }
}

function removeVideoProgress(url) {
    try {
        const progressMap = JSON.parse(localStorage.getItem('videoProgressMap') || '{}');
        if (progressMap[url]) {
            delete progressMap[url];
            localStorage.setItem('videoProgressMap', JSON.stringify(progressMap));
        }
    } catch (e) {}
}

// --- Watchlist Helpers ---
function getWatchlist() {
    try {
        return JSON.parse(localStorage.getItem('streamhubWatchlist') || '[]');
    } catch (e) {
        return [];
    }
}

function isInWatchlist(item) {
    const key = getVideoProgressKey(item);
    return getWatchlist().some(i => getVideoProgressKey(i) === key);
}

function toggleWatchlist(item, btnEl) {
    try {
        let list = getWatchlist();
        const key = getVideoProgressKey(item);
        const idx = list.findIndex(i => getVideoProgressKey(i) === key);
        const adding = idx === -1;
        if (adding) {
            list.unshift({ ...item, watchlistedAt: Date.now() });
        } else {
            list.splice(idx, 1);
        }
        localStorage.setItem('streamhubWatchlist', JSON.stringify(list));
        if (btnEl) {
            btnEl.classList.toggle('watchlist-active', adding);
            btnEl.title = adding ? 'Von Merkliste entfernen' : 'Zur Merkliste hinzufügen';
            // Bounce animation
            btnEl.classList.remove('watchlist-bounce');
            void btnEl.offsetWidth;
            btnEl.classList.add('watchlist-bounce');
        }
        // Haptic
        if (window._haptic) adding ? window._haptic.heavy() : window._haptic.tick();
    } catch (e) {
        console.error('toggleWatchlist error:', e);
    }
}

function loadWatchlistPage() {
    const grid = document.getElementById('watchlistGrid');
    const empty = document.getElementById('watchlistEmpty');
    if (!grid) return;
    const list = getWatchlist();
    grid.innerHTML = '';
    if (list.length === 0) {
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.forEach((item, index) => {
        const card = createVideoCard(item, index);
        grid.appendChild(card);
    });
}

function clearWatchlist() {
    if (confirm('Merkliste wirklich leeren?')) {
        localStorage.removeItem('streamhubWatchlist');
        loadWatchlistPage();
    }
}

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
        // Apply theme early
        const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
        applyTheme(savedTheme);

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
        // Spacebar on the video element: stop native handling AND stop propagation
        // so the document-level handler below doesn't double-fire.
        if (videoPlayer) {
            videoPlayer.addEventListener('keydown', (e) => {
                if (e.code === 'Space' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.repeat) return;
                    if (videoPlayer.paused) {
                        videoPlayer.play().catch(err => console.warn('Play failed:', err));
                    } else {
                        videoPlayer.pause();
                    }
                }
            }, true); // useCapture = true to run before native shadow DOM controls
        }
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
        sidebarBackdrop = document.getElementById('sidebarBackdrop');
        
        console.log('DOM elements loaded');
        
        // Apply Android Native Theme colors if available (Material You Dynamic Color) and system theme is selected
        const currentTheme = localStorage.getItem('selectedTheme') || 'dark';
        if (currentTheme === 'system' && window.AndroidNativeTheme && typeof window.AndroidNativeTheme.getSystemColors === 'function') {
            try {
                const colorsJson = window.AndroidNativeTheme.getSystemColors();
                const colors = JSON.parse(colorsJson);
                console.log('Retrieved Android Native Theme colors:', colors);
                if (colors.primary) {
                    document.documentElement.style.setProperty('--primary-color', colors.primary);
                }
                if (colors.primaryHover) {
                    document.documentElement.style.setProperty('--primary-hover', colors.primaryHover);
                }
                if (colors.background) {
                    document.documentElement.style.setProperty('--background', colors.background);
                    document.body.style.backgroundColor = colors.background;
                }
                if (colors.surface) {
                    const hexToRgb = (hex) => {
                        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
                        hex = hex.replace(shorthandRegex, function(m, r, g, b) { return r + r + g + g + b + b; });
                        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) : '24,24,27';
                    };
                    const rgbVal = hexToRgb(colors.surface);
                    document.documentElement.style.setProperty('--surface', `rgba(${rgbVal}, 0.65)`);
                    document.documentElement.style.setProperty('--surface-glass', `rgba(${rgbVal}, 0.45)`);
                }
                if (colors.surfaceLight) {
                    const hexToRgb = (hex) => {
                        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
                        hex = hex.replace(shorthandRegex, function(m, r, g, b) { return r + r + g + g + b + b; });
                        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) : '39,39,42';
                    };
                    const rgbValLight = hexToRgb(colors.surfaceLight);
                    document.documentElement.style.setProperty('--surface-light', `rgba(${rgbValLight}, 0.8)`);
                }
                // Map accent2/accent3 to M3 secondary/tertiary containers
                if (colors.accent2) {
                    const hexToRgb = (hex) => {
                        hex = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (m, r, g, b) => r+r+g+g+b+b);
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}` : '168,85,247';
                    };
                    document.documentElement.style.setProperty('--m3-secondary-container', `rgba(${hexToRgb(colors.accent2)}, 0.12)`);
                }
                if (colors.accent3) {
                    const hexToRgb = (hex) => {
                        hex = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (m, r, g, b) => r+r+g+g+b+b);
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}` : '236,72,153';
                    };
                    document.documentElement.style.setProperty('--m3-tertiary-container', `rgba(${hexToRgb(colors.accent3)}, 0.10)`);
                }
                // Update primary container to match dynamic primary
                if (colors.primary) {
                    const hexToRgb = (hex) => {
                        hex = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (m, r, g, b) => r+r+g+g+b+b);
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}` : '99,102,241';
                    };
                    document.documentElement.style.setProperty('--m3-primary-container', `rgba(${hexToRgb(colors.primary)}, 0.15)`);
                    document.documentElement.style.setProperty('--m3-primary-container-hover', `rgba(${hexToRgb(colors.primary)}, 0.22)`);
                    document.documentElement.style.setProperty('--m3-on-primary-container', colors.primary);
                    // Update gradient to use dynamic colors
                    if (colors.accent3) {
                        document.documentElement.style.setProperty('--primary-gradient',
                            `linear-gradient(135deg, ${colors.primary}, ${colors.accent2 || colors.primary}, ${colors.accent3})`);
                    }
                }
            } catch (error) {
                console.error('Error applying dynamic colors:', error);
            }
        }

        // ─── M3 Haptic Vibration Helper ─────────────────────────────────────────
        // Provides tactile feedback for interactive elements
        window._haptic = {
            tick: () => {
                try {
                    if (window.AndroidNativeTheme && window.AndroidNativeTheme.hapticTick) {
                        AndroidNativeTheme.hapticTick();
                    } else if (navigator.vibrate) {
                        navigator.vibrate(5);
                    }
                } catch(e) {}
            },
            heavy: () => {
                try {
                    if (window.AndroidNativeTheme && window.AndroidNativeTheme.hapticHeavy) {
                        AndroidNativeTheme.hapticHeavy();
                    } else if (navigator.vibrate) {
                        navigator.vibrate(15);
                    }
                } catch(e) {}
            }
        };

        // Attach haptic tick to all interactive elements (delegated)
        document.addEventListener('touchstart', (e) => {
            const el = e.target.closest('.hamburger-item, .video-card, .action-btn, .btn-primary, .btn-secondary, .btn-back, .icon-btn, .close-btn, .nav-categories a, #loadMore, .filter-section select, a[href], button');
            if (el && window._haptic && typeof window._haptic.tick === 'function') window._haptic.tick();
        }, { passive: true });

        if (videoPlayer) {
            videoPlayer.addEventListener('play', () => {
                document.title = '[PLAYING] StreamHub';
            });
            videoPlayer.addEventListener('pause', () => {
                document.title = 'StreamHub';
            });
            videoPlayer.addEventListener('ended', () => {
                document.title = 'StreamHub';
                // Remove progress when finished
                if (window.currentPlayingVideo) {
                    const key = getVideoProgressKey(window.currentPlayingVideo);
                    if (key) removeVideoProgress(key);
                }
            });
            videoPlayer.addEventListener('emptied', () => {
                document.title = 'StreamHub';
            });
            videoPlayer.addEventListener('timeupdate', () => {
                if (window.currentPlayingVideo && videoPlayer.duration) {
                    const currentTime = videoPlayer.currentTime;
                    const duration = videoPlayer.duration;
                    const key = getVideoProgressKey(window.currentPlayingVideo);
                    
                    // Save progress if we are between 5 seconds and 15 seconds before the end
                    if (key && currentTime > 5 && currentTime < duration - 15) {
                        saveVideoProgress(key, currentTime, duration);
                    } else if (key && currentTime >= duration - 15) {
                        removeVideoProgress(key);
                    }
                }
            });

            videoPlayer.addEventListener('leavepictureinpicture', () => {
                const videoModal = document.getElementById('videoModal');
                if (videoModal && videoModal.classList.contains('active')) {
                    const container = videoPlayer.closest('.video-player-container') || videoPlayer.parentElement;
                    if (container && container.requestFullscreen) {
                        container.requestFullscreen().catch(e => console.warn('requestFullscreen from PiP:', e));
                    }
                }
            });
        }
        
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
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                performSearch(searchInput.value.trim());
            }
        });

        searchInput.addEventListener('focus', showSearchHistoryDropdown);

        searchInput.addEventListener('input', () => {
            if (!searchInput.value.trim()) {
                showSearchHistoryDropdown();
            } else {
                hideSearchHistoryDropdown();
            }
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('searchHistoryDropdown');
            if (dropdown && searchInput && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                hideSearchHistoryDropdown();
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
            
            if (page === 'live') {
                navigateToPage('live');
            } else if (category === 'home') {
                if (searchInput) searchInput.value = '';
                navigateToPage('home');
            } else {
                // Category search — show home layout first WITHOUT loading default content, then search
                const sections = [
                    'mainVideoSection', 'historyPage', 'recentlyWatched', 'livePage',
                    'localPage', 'localFolderDetailPage', 'seriesDetailPage',
                    'settingsPage', 'watchlistPage', 'statsPage', 'abosPage', 'downloadsPage'
                ];
                sections.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
                const mainVideoSection = document.getElementById('mainVideoSection');
                if (mainVideoSection) mainVideoSection.style.display = 'block';
                currentPage = 'home';
                previousPage = currentPage;
                if (searchInput) searchInput.value = category;
                performSearch(category);
            }
        });
    });

    // Search icon click triggers search
    const searchIcon = document.querySelector('.search-box .fa-search');
    if (searchIcon) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener('click', () => {
            const val = searchInput ? searchInput.value.trim() : '';
            if (val) performSearch(val);
        });
    }

    // Logo click listener to return to start
    const logoEl = document.querySelector('.logo');
    if (logoEl) {
        logoEl.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            document.querySelectorAll('.nav-categories a').forEach(l => l.classList.remove('active'));
            const startTab = document.querySelector('.nav-categories a[data-category="home"]');
            if (startTab) startTab.classList.add('active');
            navigateToPage('home');
        });
    }
    
    
    // Filter
    if (filterToggle) {
        filterToggle.addEventListener('click', () => {
            if (filterSidebar) {
                filterSidebar.classList.add('active');
                if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
                if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
                syncNativeBackHandler();
            }
        });
    }
    
    if (closeFilter) {
        closeFilter.addEventListener('click', () => {
            if (filterSidebar) filterSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    }
    
    if (applyFilter) {
        applyFilter.addEventListener('click', () => {
            applyFilters();
            if (filterSidebar) filterSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
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

    // Quick Subscribe from filter sidebar
    const quickSubscribeBtn = document.getElementById('quickSubscribeBtn');
    if (quickSubscribeBtn) {
        quickSubscribeBtn.addEventListener('click', () => {
            const channelInput = document.getElementById('channelFilter');
            const searchInput = document.getElementById('searchInput');
            const term = (channelInput && channelInput.value.trim()) || (searchInput && searchInput.value.trim()) || '';
            if (!term) {
                showNotification('Bitte zuerst einen Kanal oder Suchbegriff eingeben.', 'warning');
                return;
            }
            // Use addAbo (the Abonnements system)
            addAbo(term);
            // Close filter sidebar
            if (filterSidebar) filterSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    }

    // Sidebar Backdrop Click
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => {
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (filterSidebar) filterSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
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
            if (hamburgerSidebar) {
                hamburgerSidebar.classList.add('active');
                if (filterSidebar) filterSidebar.classList.remove('active');
                if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
                syncNativeBackHandler();
            }
        });
    }
    
    if (closeHamburger) {
        closeHamburger.addEventListener('click', () => {
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    }
    
    // Hamburger navigation
    document.querySelectorAll('.hamburger-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            navigateToPage(page);
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
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
        // Only intercept Spacebar — redirect to play/pause instead of triggering the button.
        // Enter should still activate the button normally.
        fullscreenBtn.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                if (videoPlayer) {
                    videoPlayer.paused
                        ? videoPlayer.play().catch(() => {})
                        : videoPlayer.pause();
                }
                // Immediately blur so the button doesn't stay focused
                fullscreenBtn.blur();
            }
        });

        fullscreenBtn.addEventListener('click', () => {
            if (videoPlayer) {
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(e => console.warn('exitFullscreen:', e));
                } else {
                    const container = videoPlayer.closest('.video-player-container') || videoPlayer.parentElement;
                    if (container && container.requestFullscreen) {
                        container.requestFullscreen().catch(e => console.warn('requestFullscreen:', e));
                    } else if (videoPlayer.requestFullscreen) {
                        videoPlayer.requestFullscreen().catch(e => console.warn('requestFullscreen:', e));
                    }
                }
            }
            fullscreenBtn.blur();
        });

        // Update button icon whenever fullscreen state changes
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i> Vollbild';
            } else {
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Vollbild';
                fullscreenBtn.blur();
            }
        });
    }

    
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            const title = document.getElementById('videoTitle')?.textContent || 'video';
            const qualitySelector = document.getElementById('qualitySelector');
            if (!qualitySelector) return;
            const options = Array.from(qualitySelector.options);
            if (options.length <= 1) {
                const url = qualitySelector.value || videoPlayer.src;
                if (!url) {
                    showNotification('Keine Video-URL verfügbar.', 'warning');
                    return;
                }
                startDownload(url, title);
                showNotification(`⬇️ Download gestartet: „${title}"`, 'success', {
                    text: 'Zu Downloads',
                    callback: () => navigateToPage('downloads')
                });
                return;
            }

            // If there are multiple qualities, show a beautiful quality picker popover/dropdown!
            const existingMenu = document.getElementById('downloadQualityMenu');
            if (existingMenu) {
                existingMenu.remove();
                return;
            }

            const menu = document.createElement('div');
            menu.id = 'downloadQualityMenu';
            menu.style.cssText = `
                position: absolute;
                bottom: ${downloadBtn.offsetHeight + 10}px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(18, 18, 24, 0.98);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 6px;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                gap: 4px;
                z-index: 10000;
                min-width: 150px;
            `;

            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.style.cssText = `
                    background: transparent;
                    border: none;
                    color: #f8fafc;
                    padding: 8px 12px;
                    text-align: left;
                    font-size: 0.85rem;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: background 0.2s;
                `;
                btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.08)';
                btn.onmouseout = () => btn.style.background = 'transparent';
                btn.innerHTML = `<span>${opt.textContent}</span> <i class="fas fa-download" style="opacity: 0.6; font-size: 0.8rem;"></i>`;
                btn.addEventListener('click', () => {
                    startDownload(opt.value, title);
                    showNotification(`⬇️ Download gestartet (${opt.textContent}): „${title}"`, 'success', {
                        text: 'Zu Downloads',
                        callback: () => navigateToPage('downloads')
                    });
                    menu.remove();
                });
                menu.appendChild(btn);
            });

            const parent = downloadBtn.parentElement;
            if (parent) {
                const originalPos = parent.style.position;
                parent.style.position = 'relative';
                parent.appendChild(menu);

                const closeHandler = (event) => {
                    if (!menu.contains(event.target) && event.target !== downloadBtn) {
                        menu.remove();
                        document.removeEventListener('click', closeHandler);
                        parent.style.position = originalPos;
                    }
                };
                setTimeout(() => document.addEventListener('click', closeHandler), 10);
            }
        });
    }
    
    // Share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareVideo);
    }

    // PiP Button
    const pipBtn = document.getElementById('pipBtn');
    if (pipBtn) {
        pipBtn.addEventListener('click', async () => {
            try {
                if (videoPlayer) {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                    } else {
                        await videoPlayer.requestPictureInPicture();
                    }
                }
            } catch (error) {
                console.error('PiP Error:', error);
            }
        });
    }

    // Trailer Buttons
    const trailerBtn = document.getElementById('trailerBtn');
    const closeTrailerBtn = document.getElementById('closeTrailerBtn');
    const trailerPlayerContainer = document.getElementById('trailerPlayerContainer');
    const trailerPlayer = document.getElementById('trailerPlayer');
    
    if (trailerBtn) {
        trailerBtn.addEventListener('click', async () => {
            console.log('[TrailerBtn Click] currentPlayingVideo:', window.currentPlayingVideo);
            if (!window.currentPlayingVideo) return;
            // Pause main video
            if (videoPlayer) videoPlayer.pause();
            
            // Show loading state
            trailerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suche...';
            trailerBtn.disabled = true;
            
            try {
                let trailerUrl = await fetchTrailerUrl(window.currentPlayingVideo.title, window.currentPlayingVideo.channel);
                
                // If TMDB didn't find an embeddable video, search YouTube programmatically using the Electron main process
                if (!trailerUrl || trailerUrl === 'youtube_search') {
                    console.log('[TrailerBtn Click] TMDB fallback or no match. Searching YouTube directly...');
                    const cleanTitle = _cleanTitleForTmdb(window.currentPlayingVideo.title) || window.currentPlayingVideo.title.trim();
                    const query = `${cleanTitle} Trailer Deutsch`;
                    if (window.electronAPI && window.electronAPI.searchYoutubeTrailer) {
                        const directUrl = await window.electronAPI.searchYoutubeTrailer(query);
                        if (directUrl) {
                            trailerUrl = directUrl;
                        }
                    }
                }

                if (trailerUrl && trailerUrl !== 'youtube_search') {
                    if (trailerPlayer) trailerPlayer.src = trailerUrl;
                    if (trailerPlayerContainer) trailerPlayerContainer.style.display = 'block';
                } else {
                    // Ultimate fallback: open YouTube search in the real system browser
                    const cleanTitle = _cleanTitleForTmdb(window.currentPlayingVideo.title) || window.currentPlayingVideo.title.trim();
                    const query = encodeURIComponent(cleanTitle + ' Trailer Deutsch');
                    const ytUrl = `https://www.youtube.com/results?search_query=${query}`;
                    if (window.electronAPI && window.electronAPI.openExternal) {
                        window.electronAPI.openExternal(ytUrl);
                    } else {
                        window.open(ytUrl, '_blank');
                    }
                }
            } catch (e) {
                console.error(e);
                alert('Fehler beim Laden des Trailers.');
            } finally {
                trailerBtn.innerHTML = '<i class="fas fa-film"></i> Trailer';
                trailerBtn.disabled = false;
            }
        });
    }
    
    if (closeTrailerBtn) {
        closeTrailerBtn.addEventListener('click', () => {
            if (trailerPlayerContainer) trailerPlayerContainer.style.display = 'none';
            if (trailerPlayer) trailerPlayer.src = '';
            // Resume main video
            if (videoPlayer && videoPlayer.paused && typeof videoPlayer.play === 'function') {
                videoPlayer.play().catch(e => console.warn('Could not resume video:', e));
            }
        });
    }

    // ─── Back Action Handler ────────────────────────────────────────────────────
    // Exposed as window._handleBackAction so MainActivity.java can call it via
    // evaluateJavascript when the native OnBackPressedCallback fires.
    window._handleBackAction = function handleBackAction() {
        const videoModal      = document.getElementById('videoModal');
        const hamburgerSidebar = document.getElementById('hamburgerSidebar');
        const filterSidebar   = document.getElementById('filterSidebar');
        const sidebarBackdrop = document.getElementById('sidebarBackdrop');
        const infoModal       = document.getElementById('infoModal');

        if (videoModal && videoModal.classList.contains('active')) {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(e => console.warn('exitFullscreen on back:', e));
            } else {
                closeVideoModal();
            }
            syncNativeBackHandler();
            return true;
        }
        if (hamburgerSidebar && hamburgerSidebar.classList.contains('active')) {
            hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
            return true;
        }
        if (filterSidebar && filterSidebar.classList.contains('active')) {
            filterSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
            return true;
        }
        if (infoModal && infoModal.classList.contains('active')) {
            infoModal.classList.remove('active');
            syncNativeBackHandler();
            return true;
        }

        const historyPage   = document.getElementById('historyPage');
        const livePage      = document.getElementById('livePage');
        const localPage     = document.getElementById('localPage');
        const settingsPage  = document.getElementById('settingsPage');
        const watchlistPage = document.getElementById('watchlistPage');
        const statsPage     = document.getElementById('statsPage');
        const abosPage      = document.getElementById('abosPage');
        if (
            (historyPage   && historyPage.style.display   === 'block') ||
            (livePage      && livePage.style.display      === 'block') ||
            (localPage     && localPage.style.display     === 'block') ||
            (settingsPage  && settingsPage.style.display  === 'block') ||
            (watchlistPage && watchlistPage.style.display === 'block') ||
            (statsPage     && statsPage.style.display     === 'block')  ||
            (abosPage      && abosPage.style.display      === 'block')
        ) {
            navigateToPage('home');
            syncNativeBackHandler();
            return true;
        }

        return false;
    };

    // Keyboard Escape key and Spacebar (desktop / emulator)
    // Using capturing phase (true) to intercept spacebar/escape before focused buttons can act on them.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window._handleBackAction();
        }
        
        // Spacebar play/pause helper
        if (e.code === 'Space' || e.key === ' ') {
            const active = document.activeElement;
            // Ignore if user is typing in form inputs
            if (active && (
                active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.tagName === 'SELECT' ||
                active.isContentEditable
            )) {
                return;
            }

            const videoModal = document.getElementById('videoModal');
            const trailerContainer = document.getElementById('trailerPlayerContainer');
            // Only intercept when video modal is open AND the trailer overlay is NOT shown
            if (videoModal && videoModal.classList.contains('active') &&
                (!trailerContainer || trailerContainer.style.display === 'none')) {

                e.preventDefault();
                e.stopPropagation();

                // Ignore if the spacebar is being held down (key repeat)
                if (e.repeat) {
                    return;
                }

                // Blur any focused button or element to clear focus styles
                if (active && active !== document.body) {
                    active.blur();
                }

                if (videoPlayer) {
                    if (videoPlayer.paused) {
                        videoPlayer.play().catch(err => console.warn('Play failed:', err));
                    } else {
                        videoPlayer.pause();
                    }
                }
            }
        }
    }, true);

    // Blur any button/select shortly after being clicked to prevent focus styling "sticking"
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, select, input[type="button"], input[type="submit"]');
        if (btn) {
            setTimeout(() => {
                if (document.activeElement === btn) {
                    btn.blur();
                }
            }, 50);
        }
    }, true);

    // ─── Native Back Handler Sync ───────────────────────────────────────────────
    // Controls the native Android OnBackPressedCallback in MainActivity.java.
    // When ENABLED  → Java intercepts back → forwards to _handleBackAction()
    // When DISABLED → Android handles back natively → Predictive Back Preview!
    function syncNativeBackHandler() {
        if (!window.AndroidNativeTheme) return;          // not on Android
        try {
            const videoModal      = document.getElementById('videoModal');
            const hamburgerSidebar = document.getElementById('hamburgerSidebar');
            const filterSidebar   = document.getElementById('filterSidebar');
            const infoModal       = document.getElementById('infoModal');
            const historyPage     = document.getElementById('historyPage');
            const livePage        = document.getElementById('livePage');
            const localPage       = document.getElementById('localPage');
            const settingsPage    = document.getElementById('settingsPage');
            const watchlistPage   = document.getElementById('watchlistPage');
            const statsPage       = document.getElementById('statsPage');

            const needsHandler = Boolean(
                (videoModal      && videoModal.classList.contains('active'))      ||
                (hamburgerSidebar && hamburgerSidebar.classList.contains('active')) ||
                (filterSidebar   && filterSidebar.classList.contains('active'))   ||
                (infoModal       && infoModal.classList.contains('active'))       ||
                (historyPage     && historyPage.style.display     === 'block')    ||
                (livePage        && livePage.style.display        === 'block')    ||
                (localPage       && localPage.style.display       === 'block')    ||
                (settingsPage    && settingsPage.style.display    === 'block')    ||
                (watchlistPage   && watchlistPage.style.display   === 'block')    ||
                (statsPage       && statsPage.style.display       === 'block')
            );

            AndroidNativeTheme.setBackHandlerEnabled(needsHandler);
        } catch(e) { console.warn('syncNativeBackHandler error:', e); }
    }

    // Also expose as global so navigateToPage etc. can call it
    window._syncNativeBackHandler = syncNativeBackHandler;

    // MutationObserver: auto-sync whenever modals or pages change
    const _backObserver = new MutationObserver(() => syncNativeBackHandler());
    [
        document.getElementById('videoModal'),
        document.getElementById('hamburgerSidebar'),
        document.getElementById('filterSidebar'),
        document.getElementById('infoModal')
    ].forEach(el => {
        if (el) _backObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    [
        document.getElementById('historyPage'),
        document.getElementById('livePage'),
        document.getElementById('localPage'),
        document.getElementById('settingsPage'),
        document.getElementById('watchlistPage')
    ].forEach(el => {
        if (el) _backObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
    });

    // Initial sync after page load
    setTimeout(syncNativeBackHandler, 800);
    
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
    
    // Watchlist clear button
    const clearWatchlistBtn = document.getElementById('clearWatchlistBtn');
    if (clearWatchlistBtn) {
        clearWatchlistBtn.addEventListener('click', clearWatchlist);
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
        // Fallback: show a variety of content
        const fallbacks = ['Dokumentation', 'Spielfilm', 'Reportage', 'Nachrichten'];
        const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        await performSearch(fallback);
    } finally {
        showLoading(false);
    }
}

// Perform Search
async function performSearch(query) {
    try {
        console.log('Searching for:', query);
        
        // Save to search query history (skip generic category/recommendation searches)
        if (query && query !== 'Tatort' && query !== 'Dokumentation' && query !== 'Spielfilm' && query !== 'Nachrichten' && query !== 'Sport' && query !== 'Kinder' && query !== 'Reportage') {
            saveSearchQuery(query);
        }
        hideSearchHistoryDropdown();
        
        currentQuery = query;
        currentCategory = query; // Set category for series detection
        currentOffset = 0;
        displayedResults = [];
        
        // Hide recently watched when actively searching
        if (recentlyWatched) {
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
        
        // Reset currentOffset
        currentOffset = 0;
        
        // Group the ENTIRE currentResults list (up to 200 items)
        const grouped = groupAllResults(currentResults);
        currentDisplayItems = grouped;
        
        const toDisplay = currentDisplayItems.slice(0, resultsPerPage);
        displayedResults = toDisplay;
        
        videoGrid.innerHTML = '';
        showEmpty(false);
        
        // Render grouped display items (series cards or standalones)
        renderDisplayItems(toDisplay);
        
        // Update results count
        if (resultsCount) {
            resultsCount.textContent = `${currentResults.length} Ergebnisse`;
        }
        
        // Show/hide load more button
        const loadMoreContainer = document.querySelector('.load-more-container');
        if (loadMoreContainer) {
            if (currentDisplayItems.length > resultsPerPage) {
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
// Group all results by series (topic-based)
function groupAllResults(items) {
    const seriesMap = new Map();
    const standaloneVideos = [];
    
    items.forEach((item) => {
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
            return; // Skip Hörfassungen komplett
        }
        
        // Kein Topic -> Standalone
        if (!normalizedTopic) {
            standaloneVideos.push(item);
            return;
        }
        
        // Blacklisted -> Standalone
        if (isBlacklisted(item.topic)) {
            standaloneVideos.push(item);
            return;
        }
        
        // Prüfe ob Episode
        const parser = new EpisodeParser(item.title, item.description);
        const parseResult = parser.parse();
        
        if (parseResult.confidence < 40) {
            // Keine Episode erkannt -> Standalone
            standaloneVideos.push(item);
            return;
        }
        
        // For Emma's Chatroom specifically: force parsedSeason to be 1 as requested by the user
        let parsedSeason = parseResult.season;
        if (normalizedTopic === 'emmas chatroom') {
            parsedSeason = 1;
        }
        
        if (!seriesMap.has(normalizedTopic)) {
            seriesMap.set(normalizedTopic, {
                originalTopic: item.topic,
                episodes: []
            });
        }
        
        seriesMap.get(normalizedTopic).episodes.push({
            ...item,
            parsedSeason: parsedSeason,
            parsedEpisode: parseResult.episode,
            parseConfidence: parseResult.confidence,
            parsePattern: parseResult.pattern
        });
    });
    
    const displayList = [];
    
    // Process series (groups with 2+ episodes)
    seriesMap.forEach((seriesData, normalizedTopic) => {
        const episodeCount = seriesData.episodes.length;
        
        if (episodeCount >= 2) {
            // Sort episodes: Season first, then Episode, then Timestamp
            seriesData.episodes.sort((a, b) => {
                if (a.parsedSeason && b.parsedSeason) {
                    if (a.parsedSeason !== b.parsedSeason) {
                        return a.parsedSeason - b.parsedSeason;
                    }
                }
                if (a.parsedEpisode && b.parsedEpisode) {
                    if (a.parsedEpisode !== b.parsedEpisode) {
                        return a.parsedEpisode - b.parsedEpisode;
                    }
                }
                return b.timestamp - a.timestamp;
            });
            
            displayList.push({
                type: 'series',
                title: seriesData.originalTopic,
                episodes: seriesData.episodes
            });
        } else {
            // Only 1 episode -> standalone
            standaloneVideos.push(...seriesData.episodes);
        }
    });
    
    // Sort standalone videos by timestamp desc (default search order)
    standaloneVideos.sort((a, b) => b.timestamp - a.timestamp);
    
    // Add standalones to display list
    standaloneVideos.forEach(item => {
        displayList.push({
            type: 'video',
            data: item
        });
    });
    
    return displayList;
}

// Render display items
function renderDisplayItems(items) {
    items.forEach((item, index) => {
        if (item.type === 'series') {
            const seriesCard = createSeriesCard(item.title, item.episodes);
            if (videoGrid) videoGrid.appendChild(seriesCard);
        } else {
            const card = createVideoCard(item.data, currentOffset + index);
            if (videoGrid) videoGrid.appendChild(card);
        }
    });
}

// REGEL 4 + 5: openSeriesDetail - Sortierung und TMDB-Integration
async function openSeriesDetail(seriesName, episodes) {
    console.log('[openSeriesDetail] Öffne Serie:', seriesName, 'mit', episodes.length, 'Episoden');
    
    // Navigate to seriesDetail using unified navigateToPage
    navigateToPage('seriesDetail');
    
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
    
    // Set TMDB backdrop as background of series-info-container if available
    if (tmdbDetails && tmdbDetails.backdrop_path) {
        const backdropURL = getTMDBBackdropURL(tmdbDetails.backdrop_path);
        seriesInfo.style.backgroundImage = `linear-gradient(to right, rgba(9, 9, 11, 0.95) 30%, rgba(9, 9, 11, 0.45) 100%), url(${backdropURL})`;
        seriesInfo.style.backgroundSize = 'cover';
        seriesInfo.style.backgroundPosition = 'center';
    } else {
        seriesInfo.style.backgroundImage = '';
        seriesInfo.style.backgroundSize = '';
        seriesInfo.style.backgroundPosition = '';
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
                ${tmdbDetails && tmdbDetails.vote_average ? `<span><i class="fas fa-star" style="color:#eab308;"></i> ${tmdbDetails.vote_average.toFixed(1)}/10</span>` : ''}
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
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            try {
                window._haptic?.tick?.();
                navigateToPage(previousPage || 'home');
            } catch (err) {
                console.error('Back button error:', err);
            }
        });
    }
    
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

    const progressKey = getVideoProgressKey(item);
    const progress = progressKey ? getVideoProgress(progressKey) : null;
    let progressHTML = '';
    if (progress && progress.percent > 0) {
        progressHTML = `
            <div class="video-progress-bar-container" style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: rgba(255, 255, 255, 0.25); z-index: 10; overflow: hidden; border-radius: 0 0 16px 16px;">
                <div class="video-progress-bar-fill" style="width: ${progress.percent}%; height: 100%; background: var(--primary-color); border-radius: inherit;"></div>
            </div>
        `;
    }

    const inWL = isInWatchlist(item);
    card.innerHTML = `
        <div class="video-thumbnail" id="${thumbnailId}" style="background: ${gradient};">
            <span class="sender-logo thumb-overlay-logo">${item.channel}</span>
            <span class="duration-badge">${durationText}</span>
            <button class="watchlist-btn${inWL ? ' watchlist-active' : ''}" title="${inWL ? 'Von Merkliste entfernen' : 'Zur Merkliste hinzufügen'}" aria-label="Merkliste">
                <i class="fas fa-heart"></i>
            </button>
            ${progressHTML}
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

    const wlBtn = card.querySelector('.watchlist-btn');
    if (wlBtn) {
        wlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleWatchlist(item, wlBtn);
        });
    }

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

        const ratingEl = document.getElementById('videoRating');
        // Build user star-rating widget
        if (ratingEl) {
            const ratingKey = 'rating_' + (item.id || encodeURIComponent(item.title || ''));
            const savedRating = parseInt(localStorage.getItem(ratingKey) || '0', 10);
            ratingEl.style.display = 'inline-flex';
            ratingEl.style.alignItems = 'center';
            ratingEl.style.gap = '2px';
            ratingEl.style.cursor = 'pointer';
            ratingEl.title = 'Bewertung abgeben';
            const renderStars = (current) => {
                ratingEl.innerHTML = '';
                for (let i = 1; i <= 5; i++) {
                    const star = document.createElement('i');
                    star.className = i <= current ? 'fas fa-star' : 'far fa-star';
                    star.style.cssText = `color:${i <= current ? '#eab308' : '#64748b'}; font-size:1rem; transition:color 0.15s;`;
                    star.dataset.val = i;
                    star.addEventListener('mouseenter', () => renderStars(i));
                    star.addEventListener('mouseleave', () => renderStars(parseInt(localStorage.getItem(ratingKey) || '0', 10)));
                    star.addEventListener('click', () => {
                        localStorage.setItem(ratingKey, i);
                        renderStars(i);
                    });
                    ratingEl.appendChild(star);
                }
                // Label
                const lbl = document.createElement('span');
                lbl.style.cssText = 'font-size:0.75rem; color:#94a3b8; margin-left:4px;';
                lbl.textContent = current > 0 ? current + '/5' : 'Bewerten';
                ratingEl.appendChild(lbl);
            };
            renderStars(savedRating);
        }

        // Fetch TMDb rating if API key is set (shows alongside user rating)
        const apiKey = localStorage.getItem('tmdbApiKey') || '';
        if (apiKey && apiKey !== 'YOUR_API_KEY_HERE' && item.title && !item.isLocal) {
            const cleanTitle = _cleanTitleForTmdb(item.title) || item.title.trim();
            fetch(`${TMDB_BASE_URL}/search/multi?api_key=${apiKey}&language=de-DE&query=${encodeURIComponent(cleanTitle)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.results && data.results.length > 0) {
                        const match = data.results.find(r => r.vote_average > 0);
                        if (match && ratingEl) {
                            // Append TMDb badge after stars
                            const tmdbBadge = document.createElement('span');
                            tmdbBadge.style.cssText = 'font-size:0.75rem; color:#94a3b8; margin-left:8px; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px;';
                            tmdbBadge.innerHTML = `<i class="fas fa-film" style="margin-right:3px;"></i>${match.vote_average.toFixed(1)}/10`;
                            ratingEl.appendChild(tmdbBadge);
                        }
                    }
                })
                .catch(err => console.warn('TMDb live rating fetch error:', err));
        }
        
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

        // Show/hide trailer button
        const trailerBtn = document.getElementById('trailerBtn');
        if (trailerBtn) {
            if (item.title && !item.isLocal) {
                trailerBtn.style.display = 'inline-flex';
            } else {
                trailerBtn.style.display = 'none';
            }
        }
        
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
        
        // Store currently playing video info
        window.currentPlayingVideo = item;

        // Check for saved progress
        let resumeTime = 0;
        const progressKey = getVideoProgressKey(item);
        const progress = progressKey ? getVideoProgress(progressKey) : null;
        if (progress && progress.currentTime > 5) {
            resumeTime = progress.currentTime;
            console.log(`Resuming video at ${resumeTime}s`);
            
            // Show a temporary toast in the video player indicating we resumed
            setTimeout(() => {
                const toast = document.createElement('div');
                toast.className = 'resume-toast';
                toast.style.cssText = 'position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(9, 9, 11, 0.85); color: #f8fafc; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: 500; border: 1px solid var(--primary-color); z-index: 10000; pointer-events: none; opacity: 1; transition: opacity 0.5s ease;';
                
                const min = Math.floor(resumeTime / 60);
                const sec = Math.floor(resumeTime % 60).toString().padStart(2, '0');
                toast.textContent = `Wiedergabe bei ${min}:${sec} fortgesetzt`;
                
                const container = document.querySelector('.video-player-container');
                if (container) {
                    container.appendChild(toast);
                    setTimeout(() => {
                        toast.style.opacity = '0';
                        setTimeout(() => toast.remove(), 500);
                    }, 2500);
                }
            }, 800);
        }

        // Load video
        loadVideoSource(videoUrl, resumeTime);
        
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
        if (resumeTime > 0) {
            let seeked = false;
            const performSeek = () => {
                if (seeked) return;
                try {
                    videoPlayer.currentTime = resumeTime;
                    seeked = true;
                    console.log(`[Resume] Seeked videoPlayer to ${resumeTime}s`);
                } catch (err) {
                    console.warn('[Resume] Seek failed, will retry:', err);
                }
            };
            
            // Listen to multiple indicators that seeking is possible
            videoPlayer.addEventListener('loadedmetadata', performSeek, { once: true });
            videoPlayer.addEventListener('canplay', performSeek, { once: true });
            
            // Check on play start and force-seek if it was reset (very common in HLS stream starts)
            const onPlaying = () => {
                if (!seeked) {
                    performSeek();
                } else {
                    if (Math.abs(videoPlayer.currentTime - resumeTime) > 3) {
                        console.log(`[Resume] Correcting currentTime to ${resumeTime}s`);
                        try { videoPlayer.currentTime = resumeTime; } catch (_) {}
                    }
                }
                videoPlayer.removeEventListener('playing', onPlaying);
            };
            videoPlayer.addEventListener('playing', onPlaying);
            
            // If media state is already ready
            if (videoPlayer.readyState >= 1) {
                performSeek();
            }
        }

        if (videoUrl.includes('.m3u8') && typeof Hls !== 'undefined') {
            if (Hls.isSupported()) {
                if (hlsInstance) hlsInstance.destroy();
                hlsInstance = new Hls();
                hlsInstance.loadSource(videoUrl);
                hlsInstance.attachMedia(videoPlayer);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    videoPlayer.play();
                });
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                videoPlayer.src = videoUrl;
                videoPlayer.play();
            }
        } else {
            videoPlayer.src = videoUrl;
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
        
        // Stop and hide trailer
        const trailerPlayerContainer = document.getElementById('trailerPlayerContainer');
        const trailerPlayer = document.getElementById('trailerPlayer');
        if (trailerPlayerContainer) trailerPlayerContainer.style.display = 'none';
        if (trailerPlayer) trailerPlayer.src = '';
        
        // Reset focus to body so that lingering focus is cleared
        document.body.focus();
        
        syncNativeBackHandler();
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
    const toDisplay = currentDisplayItems.slice(currentOffset, currentOffset + resultsPerPage);
    
    renderDisplayItems(toDisplay);
    
    displayedResults = currentDisplayItems.slice(0, currentOffset + resultsPerPage);
    
    if (currentOffset + resultsPerPage >= currentDisplayItems.length) {
        const loadMoreContainer = document.querySelector('.load-more-container');
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    }
}

// Page Navigation
function navigateToPage(page) {
    if (page !== currentPage) {
        previousPage = currentPage;
        // Close video player modal when navigating away
        if (typeof closeVideoModal === 'function') {
            closeVideoModal();
        }
    }
    currentPage = page;
    console.log('navigateToPage to:', page);

    const sections = [
        'mainVideoSection',
        'historyPage',
        'recentlyWatched',
        'livePage',
        'localPage',
        'localFolderDetailPage',
        'seriesDetailPage',
        'settingsPage',
        'watchlistPage',
        'statsPage',
        'abosPage',
        'downloadsPage'
    ];

    // Hide all sections first
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show the requested page sections
    if (page === 'home') {
        const mainVideoSection = document.getElementById('mainVideoSection');
        const recentlyWatched = document.getElementById('recentlyWatched');
        if (mainVideoSection) mainVideoSection.style.display = 'block';
        if (recentlyWatched) recentlyWatched.style.display = 'block';
        loadDefaultContent();
        loadRecentlyWatched();
    } else if (page === 'history') {
        const historyPage = document.getElementById('historyPage');
        if (historyPage) historyPage.style.display = 'block';
        loadFullHistoryPage();
    } else if (page === 'live') {
        const livePage = document.getElementById('livePage');
        if (livePage) livePage.style.display = 'block';
        loadLiveChannels();
        loadEPG();
    } else if (page === 'local') {
        const localPage = document.getElementById('localPage');
        if (localPage) localPage.style.display = 'block';
        loadLocalVideosPage();
    } else if (page === 'settings') {
        const settingsPage = document.getElementById('settingsPage');
        if (settingsPage) settingsPage.style.display = 'block';
        loadSettings();
    } else if (page === 'seriesDetail') {
        const seriesDetailPage = document.getElementById('seriesDetailPage');
        if (seriesDetailPage) seriesDetailPage.style.display = 'block';
    } else if (page === 'localFolderDetail') {
        const localFolderDetailPage = document.getElementById('localFolderDetailPage');
        if (localFolderDetailPage) localFolderDetailPage.style.display = 'block';
    } else if (page === 'watchlist') {
        const watchlistPage = document.getElementById('watchlistPage');
        if (watchlistPage) watchlistPage.style.display = 'block';
        loadWatchlistPage();
    } else if (page === 'stats') {
        const statsPage = document.getElementById('statsPage');
        if (statsPage) statsPage.style.display = 'block';
        loadStatsPage();
    } else if (page === 'abos') {
        const abosPage = document.getElementById('abosPage');
        if (abosPage) abosPage.style.display = 'block';
        initAbosPage();
        loadAbosPage();
    } else if (page === 'downloads') {
        const downloadsPage = document.getElementById('downloadsPage');
        if (downloadsPage) downloadsPage.style.display = 'block';
        initDownloadsPage();
        renderDownloadsPage();
    }

    // Update active nav links / hamburger items
    document.querySelectorAll('.hamburger-item[data-page]').forEach(el => {
        el.classList.toggle('active-page', el.dataset.page === page);
    });

    // Update main navbar category links active state
    document.querySelectorAll('.nav-categories a').forEach(link => {
        const cat = link.dataset.category;
        const pg = link.dataset.page;
        if (pg === page || (page === 'home' && cat === 'home')) {
            document.querySelectorAll('.nav-categories a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        }
    });

    // Sync native back handler so predictive back works correctly
    if (window._syncNativeBackHandler) window._syncNativeBackHandler();
}

window.navigateToPage = navigateToPage;

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
        backBtn.addEventListener('click', (e) => {
            try {
                window._haptic?.tick?.();
                const detailPage = document.getElementById('localFolderDetailPage');
                const localPage = document.getElementById('localPage');
                if (detailPage) {
                    detailPage.style.display = 'none';
                }
                if (localPage) {
                    localPage.style.display = 'block';
                    localPage.scrollTop = 0;
                }
            } catch (err) {
                console.error('Back button error:', err);
            }
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

    // Theme setting
    const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
    const settingTheme = document.getElementById('settingTheme');
    if (settingTheme) {
        settingTheme.value = savedTheme;
        if (!settingTheme._bound) {
            settingTheme._bound = true;
            settingTheme.addEventListener('change', (e) => {
                const theme = e.target.value;
                console.log('Theme changed to:', theme);
                localStorage.setItem('selectedTheme', theme);
                applyTheme(theme);
            });
        }
    }

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

    console.log('Settings loaded:', { useRealThumbnails, tmdbKeySet: !!TMDB_API_KEY, theme: savedTheme });
}

function saveSettings() {
    localStorage.setItem('useRealThumbnails', useRealThumbnails);
    console.log('Settings saved:', { useRealThumbnails });
}

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
        video.preload = 'auto'; // Request enough data to play immediately
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

        const timeout = setTimeout(() => done(null), 12000); // 12s max timeout

        const captureFrame = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 180;
                canvas.getContext('2d').drawImage(video, 0, 0, 320, 180);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                clearTimeout(timeout);
                done(dataUrl);
            } catch (e) {
                clearTimeout(timeout);
                done(null);
            }
        };

        let captured = false;
        const doCapture = () => {
            if (captured) return;
            captured = true;
            video.pause();
            captureFrame();
        };

        // For both HLS and direct video, capturing on timeupdate is extremely fast
        video.addEventListener('timeupdate', () => {
            if (video.currentTime > 0.1) {
                doCapture();
            }
        });

        video.addEventListener('error', () => { clearTimeout(timeout); done(null); }, { once: true });

        if (videoUrl && videoUrl.includes('.m3u8')) {
            // HLS stream — use optimized hls.js settings
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                hlsCap = new Hls({
                    maxBufferLength: 1,
                    maxMaxBufferLength: 2,
                    maxBufferSize: 500 * 1024, // 500KB buffer to keep it light
                    enableAudio: false,
                    enableWorker: true,
                    capLevelToPlayerSize: true,
                    lowLatencyMode: true
                });
                hlsCap.loadSource(videoUrl);
                hlsCap.attachMedia(video);
                hlsCap.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(() => {
                        // Fallback: wait a bit then capture whatever is loaded
                        setTimeout(doCapture, 1000);
                    });
                });
                hlsCap.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { clearTimeout(timeout); done(null); } });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = videoUrl;
                video.play().catch(() => setTimeout(doCapture, 1000));
            } else {
                done(null);
            }
        } else {
            // Standard MP4 stream — just play and capture on timeupdate (no network seeks!)
            video.src = videoUrl;
            video.addEventListener('loadeddata', () => {
                video.play().catch(() => {
                    // Fallback if autoplay is blocked or fails
                    setTimeout(doCapture, 1000);
                });
            }, { once: true });
        }
    });
}

// ── Thumbnail queue ────────────────────────────────────────────────────────────
const realThumbQueue = [];
let realThumbBusy = false;
const MAX_REAL_THUMBS = 6;
let activeRealThumbs = 0;

async function queueRealThumbnail(videoUrl, cacheKey, element, fallbackGradient) {
    if (!videoUrl || !element) return;
    
    // 1. Check disk cache immediately to avoid entering queue
    if (window.electronAPI && window.electronAPI.getCachedThumbnail) {
        try {
            const cached = await window.electronAPI.getCachedThumbnail(cacheKey);
            if (cached) {
                applyThumbDataUrl(element, cached);
                return;
            }
        } catch (_) {}
    }
    
    // 2. Check localStorage cache immediately
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
    
    // 3. Queue for generation
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
    TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || TMDB_API_KEY || '';
    if (!TMDB_API_KEY || TMDB_API_KEY === 'YOUR_API_KEY_HERE') {
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
    TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || TMDB_API_KEY || '';
    if (!TMDB_API_KEY || TMDB_API_KEY === 'YOUR_API_KEY_HERE') {
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

// ===== THEME WECHSLER =====
function applyTheme(theme) {
    if (theme === 'system' || !theme) {
        document.documentElement.removeAttribute('data-theme');
        // Re-apply Android Native Theme colors if available
        if (window.AndroidNativeTheme && typeof window.AndroidNativeTheme.getSystemColors === 'function') {
            try {
                const colorsJson = window.AndroidNativeTheme.getSystemColors();
                const colors = JSON.parse(colorsJson);
                if (colors.primary) document.documentElement.style.setProperty('--primary-color', colors.primary);
                if (colors.primaryHover) document.documentElement.style.setProperty('--primary-hover', colors.primaryHover);
                if (colors.background) {
                    document.documentElement.style.setProperty('--background', colors.background);
                    document.body.style.backgroundColor = colors.background;
                }
                if (colors.surface) {
                    const hexToRgb = (hex) => {
                        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
                        hex = hex.replace(shorthandRegex, function(m, r, g, b) { return r + r + g + g + b + b; });
                        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) : '24,24,27';
                    };
                    const rgbVal = hexToRgb(colors.surface);
                    document.documentElement.style.setProperty('--surface', `rgba(${rgbVal}, 0.65)`);
                    document.documentElement.style.setProperty('--surface-glass', `rgba(${rgbVal}, 0.45)`);
                }
            } catch(e) {}
        }
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        // Remove overrides so theme CSS takes full control
        document.documentElement.style.removeProperty('--primary-color');
        document.documentElement.style.removeProperty('--primary-hover');
        document.documentElement.style.removeProperty('--background');
        document.documentElement.style.removeProperty('--surface');
        document.documentElement.style.removeProperty('--surface-glass');
        document.body.style.backgroundColor = '';
    }
}

// ===== STATISTIKEN =====
function loadStatsPage() {
    const recent = JSON.parse(localStorage.getItem('recentlyWatched') || '[]');
    const progressMap = JSON.parse(localStorage.getItem('videoProgressMap') || '{}');
    
    // 1. Wiedergabezeit
    let totalSeconds = 0;
    Object.values(progressMap).forEach(prog => {
        if (prog && typeof prog.currentTime === 'number') {
            totalSeconds += prog.currentTime;
        }
    });
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    let watchTimeStr = '';
    if (hours > 0) {
        watchTimeStr = `${hours} Std. ${mins} Min.`;
    } else {
        watchTimeStr = `${mins} Min.`;
    }
    document.getElementById('statsWatchTime').textContent = totalSeconds > 0 ? watchTimeStr : '0 Min.';
    
    // 2. Angesehene Videos
    document.getElementById('statsVideoCount').textContent = recent.length;
    
    // 3. Aktivitäts-Streak
    let streak = 0;
    if (recent.length > 0) {
        const days = new Set();
        recent.forEach(item => {
            if (item.watchedAt) {
                const dateStr = new Date(item.watchedAt).toDateString();
                days.add(dateStr);
            }
        });
        
        let checkDate = new Date();
        while (true) {
            const checkStr = checkDate.toDateString();
            if (days.has(checkStr)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                if (streak === 0) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    const yesterdayStr = checkDate.toDateString();
                    if (days.has(yesterdayStr)) {
                        checkDate.setDate(checkDate.getDate() - 1);
                        streak = 1;
                        continue;
                    }
                }
                break;
            }
        }
    }
    document.getElementById('statsStreak').textContent = `${streak} ${streak === 1 ? 'Tag' : 'Tage'}`;
    
    // 4. Lieblingssender & Top Charts
    const channels = {};
    const topics = {};
    recent.forEach(item => {
        if (item.channel) {
            channels[item.channel] = (channels[item.channel] || 0) + 1;
        }
        if (item.topic) {
            topics[item.topic] = (topics[item.topic] || 0) + 1;
        }
    });
    
    let favChannel = '-';
    let maxChanVal = 0;
    Object.entries(channels).forEach(([chan, count]) => {
        if (count > maxChanVal) {
            maxChanVal = count;
            favChannel = chan;
        }
    });
    document.getElementById('statsFavChannel').textContent = favChannel;
    
    // Chart Top Sender
    const topChannelsContainer = document.getElementById('statsTopChannels');
    topChannelsContainer.innerHTML = '';
    const sortedChannels = Object.entries(channels).sort((a,b) => b[1] - a[1]).slice(0, 5);
    if (sortedChannels.length === 0) {
        topChannelsContainer.innerHTML = '<div class="empty-stats-msg">Noch keine Daten vorhanden</div>';
    } else {
        const maxVal = sortedChannels[0][1];
        sortedChannels.forEach(([chan, count]) => {
            const pct = Math.round((count / maxVal) * 100);
            const row = document.createElement('div');
            row.className = 'chart-bar-row';
            row.innerHTML = `
                <div class="chart-bar-label">${chan}</div>
                <div class="chart-bar-wrapper">
                    <div class="chart-bar-fill" style="width: ${pct}%;"></div>
                </div>
                <div class="chart-bar-value">${count}x</div>
            `;
            topChannelsContainer.appendChild(row);
        });
    }
    
    // Chart Top Themen
    const topTopicsContainer = document.getElementById('statsTopTopics');
    topTopicsContainer.innerHTML = '';
    const sortedTopics = Object.entries(topics).sort((a,b) => b[1] - a[1]).slice(0, 5);
    if (sortedTopics.length === 0) {
        topTopicsContainer.innerHTML = '<div class="empty-stats-msg">Noch keine Daten vorhanden</div>';
    } else {
        const maxVal = sortedTopics[0][1];
        sortedTopics.forEach(([topic, count]) => {
            const pct = Math.round((count / maxVal) * 100);
            const row = document.createElement('div');
            row.className = 'chart-bar-row';
            row.innerHTML = `
                <div class="chart-bar-label">${topic}</div>
                <div class="chart-bar-wrapper">
                    <div class="chart-bar-fill theme-secondary" style="width: ${pct}%;"></div>
                </div>
                <div class="chart-bar-value">${count}x</div>
            `;
            topTopicsContainer.appendChild(row);
        });
    }
}

// ===== TRAILER HOOK =====

/**
 * Strips broadcast-related suffixes/noise from a Mediathek title so we can
 * look it up on TMDB more accurately.
 * e.g. "Tatort: Das schwarze Blut (HD)" → "Tatort: Das schwarze Blut"
 *      "Die Sendung mit der Maus – Folge 42 Hörfassung" → "Die Sendung mit der Maus"
 */
function _cleanTitleForTmdb(raw) {
    return raw
        // Remove quality/format tags
        .replace(/\b(HD|SD|4K|MPEG4?|UHD|HFR)\b/gi, '')
        // Remove accessibility variants
        .replace(/\b(Hörfassung|Audiodeskription|Gebärdensprache|Untertitel|Subtitles|Originalton)\b/gi, '')
        // Remove episode info like " – Folge 12", " (Teil 2)", " - Episode 3"
        .replace(/[-–]?\s*(Folge|Episode|Teil|Part|Staffel|Season|Series)\s*\d+\b[^,]*/gi, '')
        // Remove trailing date patterns like "(2024)" unless the title IS just a year
        .replace(/\(\d{4}\)/, '')
        // Remove multiple spaces
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** Compare two strings case-insensitively, returns similarity 0-1 */
function _titleSimilarity(a, b) {
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 1;
    // Starts-with check (handles subtitle after colon)
    if (a.startsWith(b) || b.startsWith(a)) return 0.9;
    // Check if query is contained
    const shorter = a.length < b.length ? a : b;
    const longer  = a.length < b.length ? b : a;
    if (longer.includes(shorter)) return 0.7;
    return 0;
}

async function fetchTrailerUrl(title, channel) {
    console.log('[fetchTrailerUrl] title input:', title, 'channel:', channel);
    
    // Always sync TMDB_API_KEY with localStorage first
    TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || TMDB_API_KEY || '';
    
    if (!TMDB_API_KEY || TMDB_API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('TMDB Key not set or default placeholder. Key:', TMDB_API_KEY);
        return 'youtube_search';
    }
    try {
        const cleanTitle = _cleanTitleForTmdb(title);
        console.log('[fetchTrailerUrl] cleanTitle:', cleanTitle);

        // Helper: pick the best-matching result from a TMDB result array.
        // Accepts result[0] unless there's a clearly unrelated result.
        function _bestMatch(results, nameKey) {
            if (!results || results.length === 0) return null;
            const scored = results.map(r => ({
                r,
                score: _titleSimilarity(cleanTitle, r[nameKey] || '')
            }));
            scored.sort((a, b) => b.score - a.score);
            // Accept any result as long as there's at least some word overlap (score > 0)
            // or fall back to the first result if the title is completely contained somewhere
            if (scored[0].score > 0) return scored[0].r;
            // Last resort: if cleanTitle words appear anywhere in the result title, accept it
            const words = cleanTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const bestByWord = results.find(r =>
                words.some(w => (r[nameKey] || '').toLowerCase().includes(w))
            );
            return bestByWord || null;
        }

        let id = null;
        let isTV = true;

        // --- TV search ---
        let url = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&language=de-DE&query=${encodeURIComponent(cleanTitle)}`;
        let response = await fetch(url);
        let data = await response.json();
        console.log('[fetchTrailerUrl] TV Search results count:', data.results ? data.results.length : 0);
        const tvMatch = _bestMatch(data.results, 'name');
        if (tvMatch) {
            id = tvMatch.id;
            console.log('[fetchTrailerUrl] TV ID found:', id, 'Name:', tvMatch.name);
        }

        if (!id) {
            // --- Movie search ---
            url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=de-DE&query=${encodeURIComponent(cleanTitle)}`;
            response = await fetch(url);
            data = await response.json();
            console.log('[fetchTrailerUrl] Movie Search results count:', data.results ? data.results.length : 0);
            const movieMatch = _bestMatch(data.results, 'title');
            if (movieMatch) {
                id = movieMatch.id;
                isTV = false;
                console.log('[fetchTrailerUrl] Movie ID found:', id, 'Title:', movieMatch.title);
            }
        }

        if (!id) {
            console.log('[fetchTrailerUrl] No match found on TMDB for:', cleanTitle);
            return 'youtube_search';
        }

        const typeStr = isTV ? 'tv' : 'movie';
        // Get Videos (German first)
        url = `${TMDB_BASE_URL}/${typeStr}/${id}/videos?api_key=${TMDB_API_KEY}&language=de-DE`;
        response = await fetch(url);
        data = await response.json();
        let videos = data.results || [];

        // Fallback to English if no German videos found
        if (videos.length === 0) {
            url = `${TMDB_BASE_URL}/${typeStr}/${id}/videos?api_key=${TMDB_API_KEY}`;
            response = await fetch(url);
            data = await response.json();
            videos = data.results || [];
        }

        // Prefer official Trailer, then Teaser
        const youtubeTrailer =
            videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
            videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
            videos.find(v => v.site === 'YouTube' && v.type === 'Teaser');

        if (youtubeTrailer) {
            console.log('[fetchTrailerUrl] Found trailer key:', youtubeTrailer.key, 'Name:', youtubeTrailer.name);
            return `https://www.youtube-nocookie.com/embed/${youtubeTrailer.key}?autoplay=1`;
        } else {
            console.log('[fetchTrailerUrl] No YouTube trailer/teaser in videos list.');
            return 'youtube_search';
        }
    } catch (e) {
        console.error('Error fetching trailer:', e);
        return 'youtube_search';
    }
}


// ============================================================
// ===== ABONNEMENTS / MERKE-SUCHE  ===========================
// ============================================================

function getAbos() {
    try { return JSON.parse(localStorage.getItem('streamhub_abos') || '[]'); }
    catch { return []; }
}

function saveAbos(abos) {
    localStorage.setItem('streamhub_abos', JSON.stringify(abos));
}

function loadAbosPage() {
    const abos = getAbos();
    const abosList = document.getElementById('abosList');
    const abosEmpty = document.getElementById('abosEmpty');
    if (!abosList) return;

    abosList.innerHTML = '';

    if (abos.length === 0) {
        if (abosEmpty) abosEmpty.style.display = 'flex';
        return;
    }
    if (abosEmpty) abosEmpty.style.display = 'none';

    abos.forEach((abo, idx) => {
        const card = document.createElement('div');
        card.className = 'abo-card';
        const date = abo.addedAt ? new Date(abo.addedAt).toLocaleDateString('de-DE') : '';
        card.innerHTML = `
            <div class="abo-card-left">
                <i class="fas fa-bell"></i>
                <div>
                    <div class="abo-term">${abo.term}</div>
                    ${date ? `<div class="abo-meta">Abonniert seit ${date}</div>` : ''}
                </div>
            </div>
            <div class="abo-actions">
                <button class="abo-search-btn" data-term="${abo.term}" title="Jetzt suchen">
                    <i class="fas fa-search"></i> Suchen
                </button>
                <button class="abo-delete-btn" data-idx="${idx}" title="Entfernen">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        card.querySelector('.abo-search-btn').addEventListener('click', (e) => {
            const term = e.currentTarget.dataset.term;
            // Navigate to home layout without triggering loadDefaultContent
            const sections = [
                'mainVideoSection', 'historyPage', 'recentlyWatched', 'livePage',
                'localPage', 'localFolderDetailPage', 'seriesDetailPage',
                'settingsPage', 'watchlistPage', 'statsPage', 'abosPage', 'downloadsPage'
            ];
            sections.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
            const mainVideoSection = document.getElementById('mainVideoSection');
            if (mainVideoSection) mainVideoSection.style.display = 'block';
            currentPage = 'home';
            const inp = document.getElementById('searchInput');
            if (inp) inp.value = term;
            performSearch(term);
        });

        card.querySelector('.abo-delete-btn').addEventListener('click', (e) => {
            const i = parseInt(e.currentTarget.dataset.idx);
            const current = getAbos();
            current.splice(i, 1);
            saveAbos(current);
            loadAbosPage();
        });

        abosList.appendChild(card);
    });
}

function addAbo(term) {
    term = term.trim();
    if (!term) return;
    const abos = getAbos();
    if (abos.some(a => a.term.toLowerCase() === term.toLowerCase())) {
        showNotification(`„${term}" ist bereits abonniert.`, 'info');
        return;
    }
    abos.push({ term, addedAt: Date.now(), lastSeen: null });
    saveAbos(abos);
    showNotification(`✅ „${term}" abonniert!`, 'success');
    loadAbosPage();
}

function initAbosPage() {
    const addBtn = document.getElementById('aboAddBtn');
    const input  = document.getElementById('aboSearchInput');
    if (!addBtn || input._aboBound) return;
    input._aboBound = true;

    const doAdd = () => {
        if (input.value.trim()) {
            addAbo(input.value);
            input.value = '';
        }
    };

    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doAdd();
    });
}

// Check all abos for new content and show notifications
async function checkAbosForNewContent() {
    const abos = getAbos();
    if (abos.length === 0) return;

    const banner = document.getElementById('aboNotifications');
    // Only run once per session
    if (window._abosChecked) return;
    window._abosChecked = true;

    const results = [];
    for (const abo of abos) {
        try {
            const url = `https://mediathekviewweb.de/api/query?queries=%5B%7B%22fields%22%3A%5B%22title%22%2C%22topic%22%5D%2C%22query%22%3A%22${encodeURIComponent(abo.term)}%22%7D%5D&sortBy=timestamp&sortOrder=desc&future=false&offset=0&size=3`;
            const res = await fetch(url);
            const data = await res.json();
            const items = data.result?.results || [];
            if (items.length === 0) continue;

            const newest = items[0];
            const newestTs = newest.timestamp || 0;
            const lastSeen = abo.lastSeen || 0;

            if (newestTs > lastSeen) {
                results.push({ term: abo.term, count: items.length, title: newest.title });
            }

            // Update lastSeen
            abo.lastSeen = newestTs;
        } catch { /* ignore network errors */ }
    }

    saveAbos(abos); // persist updated lastSeen

    if (results.length > 0 && banner) {
        banner.style.display = 'flex';
        banner.innerHTML = '';
        results.forEach(r => {
            const div = document.createElement('div');
            div.className = 'abo-notification-banner';
            div.innerHTML = `
                <i class="fas fa-bell"></i>
                <span>Neu bei <strong>"${r.term}"</strong>: ${r.count} neue Inhalte — z.B. „${r.title}"</span>
            `;
            banner.appendChild(div);
        });
    }
}

// Run abo check shortly after app starts
setTimeout(checkAbosForNewContent, 3000);


// ============================================================
// ===== EPG - Elektronischer Programmführer  =================
// ============================================================

// Simple time-based EPG: shows "now playing" approximation from a known schedule.
// Uses the open EPG API from xmltv.se for German channels where available.
async function loadEPG() {
    const epgContainer = document.getElementById('liveEpgContainer');
    if (!epgContainer) return;

    epgContainer.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;padding:0.5rem 0;"><i class="fas fa-spinner fa-spin"></i> Lade Programm...</p>';

    // Map channel names to xmltv.se IDs (German public channels)
    const epgChannelMap = [
        { name: 'Das Erste HD',  id: 'das-erste.de' },
        { name: 'ZDF HD',        id: 'zdf.de' },
        { name: 'ARD alpha',     id: 'ard-alpha.de' },
        { name: '3sat HD',       id: '3sat.de' },
        { name: 'ZDFneo',        id: 'zdfneo.de' },
        { name: 'ARTE',          id: 'arte.de' },
        { name: 'Phoenix HD',    id: 'phoenix.de' },
        { name: 'tagesschau24',  id: 'tagesschau24.de' },
    ];

    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const todayStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;

    let rows = '';
    let fetchedAny = false;

    for (const ch of epgChannelMap) {
        try {
            const res = await fetch(`https://xmltv.se/${ch.id}/${todayStr}.json`, { signal: AbortSignal.timeout(4000) });
            if (!res.ok) continue;
            const data = await res.json();
            const programmes = data.programmes || [];

            // Find current programme
            const nowMs = now.getTime();
            const current = programmes.find(p => {
                const start = new Date(p.start).getTime();
                const stop  = new Date(p.stop).getTime();
                return nowMs >= start && nowMs < stop;
            });

            const next = current ? programmes[programmes.indexOf(current) + 1] : null;

            if (!current) continue;
            fetchedAny = true;

            const startTime = new Date(current.start);
            const timeStr = `${pad(startTime.getHours())}:${pad(startTime.getMinutes())}`;

            rows += `
                <div class="epg-row">
                    <div class="epg-channel-name">${ch.name}</div>
                    <div class="epg-now">
                        <div class="epg-title">${current.title || '–'}</div>
                        <div class="epg-time"><i class="fas fa-circle" style="font-size:0.5rem;vertical-align:middle;color:#22c55e;"></i> Seit ${timeStr}</div>
                    </div>
                    <div class="epg-next">${next ? `<i class="fas fa-arrow-right" style="font-size:0.7rem;margin-right:4px;opacity:0.5;"></i>${next.title}` : ''}</div>
                </div>`;
        } catch { /* timeout/network — skip channel */ }
    }

    if (!fetchedAny) {
        epgContainer.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;padding:0.5rem 0;">Programmdaten konnten nicht geladen werden.</p>';
        return;
    }

    epgContainer.innerHTML = `
        <h3 style="font-size:0.9rem;font-weight:600;margin-bottom:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">
            <i class="fas fa-tv" style="color:var(--primary-color);margin-right:0.4rem;"></i>Jetzt im TV
        </h3>
        <div class="epg-strip">${rows}</div>
    `;
}

// ===== DOWNLOAD MANAGER =========================================

const DL_STORAGE_KEY = 'streamhub_downloads';

function getDownloads() {
    try { return JSON.parse(localStorage.getItem(DL_STORAGE_KEY) || '[]'); }
    catch { return []; }
}

function saveDownloads(list) {
    localStorage.setItem(DL_STORAGE_KEY, JSON.stringify(list));
}

function generateDlId() {
    return 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

// Active XHR map so we can abort
const _activeXHR = {};

function startDownload(url, title) {
    const id = generateDlId();
    const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'video';
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const filename = safeTitle + '.' + (ext.length <= 4 ? ext : 'mp4');

    const entry = {
        id,
        title: safeTitle,
        filename,
        url,
        status: 'active',   // active | completed | error | cancelled
        progress: 0,
        bytesLoaded: 0,
        bytesTotal: 0,
        startedAt: Date.now(),
        completedAt: null,
        error: null,
        objectUrl: null
    };

    const list = getDownloads();
    list.unshift(entry);
    saveDownloads(list);
    renderDownloadsPage();

    // If Electron IPC is available use it for real filesystem download
    if (window.electronAPI && window.electronAPI.downloadVideo) {
        window.electronAPI.downloadVideo(url, safeTitle)
            .then(result => {
                _updateDl(id, result.success
                    ? { status: 'completed', progress: 100, completedAt: Date.now() }
                    : { status: 'error', error: result.message || 'Fehler beim Download' });
            })
            .catch(err => _updateDl(id, { status: 'error', error: err.message }));
        return;
    }

    // Browser fallback: fetch with XHR for progress tracking
    const xhr = new XMLHttpRequest();
    _activeXHR[id] = xhr;
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';

    let lastLoaded = 0;
    let lastTime = Date.now();

    xhr.onprogress = (e) => {
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000; // seconds
        const speedBps = elapsed > 0 ? (e.loaded - lastLoaded) / elapsed : 0;
        lastLoaded = e.loaded;
        lastTime = now;

        const pct = e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : -1;
        _updateDl(id, {
            progress: pct >= 0 ? pct : entry.progress,
            bytesLoaded: e.loaded,
            bytesTotal: e.total,
            speed: speedBps
        });
    };

    xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
            const blob = xhr.response;
            const objectUrl = URL.createObjectURL(blob);
            // Auto-trigger browser save dialog
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            _updateDl(id, { status: 'completed', progress: 100, completedAt: Date.now(), objectUrl, speed: 0 });
            showNotification(`✅ Download abgeschlossen: „${safeTitle}"`, 'success', {
                text: 'Zu Downloads',
                callback: () => navigateToPage('downloads')
            });
        } else {
            _updateDl(id, { status: 'error', error: `HTTP ${xhr.status}`, speed: 0 });
        }
        delete _activeXHR[id];
    };

    xhr.onerror = () => {
        _updateDl(id, { status: 'error', error: 'Netzwerkfehler', speed: 0 });
        delete _activeXHR[id];
    };

    xhr.onabort = () => {
        _updateDl(id, { status: 'cancelled', error: 'Abgebrochen', speed: 0 });
        delete _activeXHR[id];
    };

    xhr.send();
}

function _updateDl(id, patch) {
    const list = getDownloads();
    const idx = list.findIndex(d => d.id === id);
    if (idx !== -1) {
        Object.assign(list[idx], patch);
        saveDownloads(list);
    }
    renderDownloadsPage();
}

function cancelDownload(id) {
    if (_activeXHR[id]) {
        _activeXHR[id].abort();
    } else {
        _updateDl(id, { status: 'cancelled', error: 'Abgebrochen' });
    }
}

function removeDownload(id) {
    const list = getDownloads().filter(d => d.id !== id);
    saveDownloads(list);
    renderDownloadsPage();
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderDownloadsPage() {
    const downloadsPage = document.getElementById('downloadsPage');
    if (!downloadsPage || downloadsPage.style.display === 'none') return;

    const all = getDownloads();
    const active = all.filter(d => d.status === 'active');
    const completed = all.filter(d => d.status !== 'active');

    // Update tab counts
    const activeCount = document.getElementById('dlActiveCount');
    const completedCount = document.getElementById('dlCompletedCount');
    if (activeCount) activeCount.textContent = active.length;
    if (completedCount) completedCount.textContent = completed.length;

    // Render active list
    const activeList = document.getElementById('dlActiveList');
    const activeEmpty = document.getElementById('dlActiveEmpty');
    if (activeList) {
        if (active.length === 0) {
            activeList.innerHTML = '';
            if (activeEmpty) activeEmpty.style.display = 'flex';
        } else {
            if (activeEmpty) activeEmpty.style.display = 'none';
            activeList.innerHTML = active.map(d => _dlCardHtml(d)).join('');
            // Wire cancel buttons
            activeList.querySelectorAll('.dl-cancel-btn').forEach(btn => {
                btn.addEventListener('click', () => cancelDownload(btn.dataset.id));
            });
        }
    }

    // Render completed list
    const completedList = document.getElementById('dlCompletedList');
    const completedEmpty = document.getElementById('dlCompletedEmpty');
    if (completedList) {
        if (completed.length === 0) {
            completedList.innerHTML = '';
            if (completedEmpty) completedEmpty.style.display = 'flex';
        } else {
            if (completedEmpty) completedEmpty.style.display = 'none';
            completedList.innerHTML = completed.map(d => _dlCardHtml(d)).join('');
            // Wire remove & re-download buttons
            completedList.querySelectorAll('.dl-remove-btn').forEach(btn => {
                btn.addEventListener('click', () => removeDownload(btn.dataset.id));
            });
            completedList.querySelectorAll('.dl-retry-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const entry = getDownloads().find(d => d.id === btn.dataset.id);
                    if (entry) startDownload(entry.url, entry.title);
                });
            });
            completedList.querySelectorAll('.dl-open-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const entry = getDownloads().find(d => d.id === btn.dataset.id);
                    if (entry && entry.objectUrl) {
                        const a = document.createElement('a');
                        a.href = entry.objectUrl;
                        a.download = entry.filename;
                        a.click();
                    }
                });
            });
        }
    }

    // Schedule re-render while there are active downloads (every 800ms)
    if (active.length > 0) {
        clearTimeout(renderDownloadsPage._timer);
        renderDownloadsPage._timer = setTimeout(renderDownloadsPage, 800);
    }
}

function _dlCardHtml(d) {
    const isActive = d.status === 'active';
    const isError = d.status === 'error' || d.status === 'cancelled';
    const isCompleted = d.status === 'completed';
    const pct = d.progress >= 0 ? d.progress : 0;
    const bytesStr = d.bytesTotal > 0
        ? `${formatBytes(d.bytesLoaded)} / ${formatBytes(d.bytesTotal)}`
        : (d.bytesLoaded > 0 ? formatBytes(d.bytesLoaded) : '');

    const speedStr = (isActive && d.speed > 0) ? `${formatBytes(d.speed)}/s` : '';
    const metaParts = [];
    if (bytesStr) metaParts.push(bytesStr);
    if (speedStr) metaParts.push(speedStr);
    const metaDetails = metaParts.join(' • ');

    const statusIcon = isCompleted
        ? '<i class="fas fa-check-circle" style="color:#22c55e"></i>'
        : isError
            ? '<i class="fas fa-exclamation-circle" style="color:#ef4444"></i>'
            : '<i class="fas fa-spinner fa-spin" style="color:var(--primary-color)"></i>';

    const statusText = isCompleted ? 'Abgeschlossen'
        : isError ? (d.error || 'Fehler')
        : pct >= 0 ? `${pct}%` : 'Lädt…';

    const actionBtns = isActive
        ? `<button class="dl-cancel-btn btn-sm btn-secondary" data-id="${d.id}" title="Abbrechen"><i class="fas fa-times"></i></button>`
        : isError
            ? `<button class="dl-retry-btn btn-sm btn-secondary" data-id="${d.id}" title="Erneut versuchen"><i class="fas fa-redo"></i></button>
               <button class="dl-remove-btn btn-sm btn-secondary" data-id="${d.id}" title="Entfernen"><i class="fas fa-trash"></i></button>`
            : `<button class="dl-open-btn btn-sm btn-secondary" data-id="${d.id}" title="Öffnen/Speichern"><i class="fas fa-folder-open"></i></button>
               <button class="dl-remove-btn btn-sm btn-secondary" data-id="${d.id}" title="Entfernen"><i class="fas fa-trash"></i></button>`;

    return `
    <div class="dl-card ${isError ? 'dl-error' : isCompleted ? 'dl-done' : ''}">
        <div class="dl-card-icon">${statusIcon}</div>
        <div class="dl-card-body">
            <div class="dl-card-title">${d.title}</div>
            <div class="dl-card-meta">
                <span class="dl-status-text">${statusText}</span>
                ${metaDetails ? `<span class="dl-bytes">${metaDetails}</span>` : ''}
            </div>
            ${isActive ? `
            <div class="dl-progress-track">
                <div class="dl-progress-bar" style="width:${pct}%"></div>
            </div>` : ''}
        </div>
        <div class="dl-card-actions">${actionBtns}</div>
    </div>`;
}

function initDownloadsPage() {
    // Tab switching
    document.querySelectorAll('.dl-tab').forEach(tab => {
        if (tab._dlTabBound) return;
        tab._dlTabBound = true;
        tab.addEventListener('click', () => {
            document.querySelectorAll('.dl-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            const activePanel = document.getElementById('dlActivePanel');
            const completedPanel = document.getElementById('dlCompletedPanel');
            if (activePanel) activePanel.style.display = target === 'active' ? 'block' : 'none';
            if (completedPanel) completedPanel.style.display = target === 'completed' ? 'block' : 'none';
        });
    });

    // Clear completed
    const clearBtn = document.getElementById('clearCompletedBtn');
    if (clearBtn && !clearBtn._dlBound) {
        clearBtn._dlBound = true;
        clearBtn.addEventListener('click', () => {
            const list = getDownloads().filter(d => d.status === 'active');
            saveDownloads(list);
            renderDownloadsPage();
        });
    }

    // Open downloads folder (Electron only)
    const openFolderBtn = document.getElementById('openDownloadFolderBtn');
    if (openFolderBtn && !openFolderBtn._dlBound) {
        openFolderBtn._dlBound = true;
        openFolderBtn.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.openDownloadsFolder) {
                window.electronAPI.openDownloadsFolder();
            } else {
                showNotification('Ordner-Öffnen ist nur in der Electron-App verfügbar.', 'info');
            }
        });
    }
}

function showNotification(message, type = 'info', action = null) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            z-index: 99999;
            max-width: 380px;
            width: calc(100vw - 48px);
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.style.cssText = `
        background: rgba(18, 18, 24, 0.95);
        color: #f8fafc;
        border-radius: 12px;
        padding: 14px 18px;
        font-family: inherit;
        font-size: 0.9rem;
        font-weight: 500;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        gap: 12px;
        transform: translateY(20px);
        opacity: 0;
        transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
    `;

    // Type styling
    let icon = 'info-circle';
    if (type === 'success') {
        icon = 'check-circle';
        toast.style.borderLeft = '4px solid #22c55e';
    } else if (type === 'warning') {
        icon = 'exclamation-triangle';
        toast.style.borderLeft = '4px solid #f59e0b';
    } else if (type === 'error') {
        icon = 'exclamation-circle';
        toast.style.borderLeft = '4px solid #ef4444';
    } else {
        toast.style.borderLeft = '4px solid var(--primary-color, #a855f7)';
    }

    let actionBtnHtml = '';
    if (action) {
        actionBtnHtml = `<button class="toast-action-btn" style="
            background: var(--primary-color, #a855f7);
            color: white;
            border: none;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            margin-left: auto;
            white-space: nowrap;
            transition: opacity 0.2s;
        " onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1">${action.text}</button>`;
    }

    toast.innerHTML = `
        <i class="fas fa-${icon}" style="font-size: 1.1rem; flex-shrink: 0; color: ${type === 'success' ? '#22c55e' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : 'var(--primary-color)'}"></i>
        <div style="flex: 1; line-height: 1.4;">${message}</div>
        ${actionBtnHtml}
        <button class="toast-close-btn" style="
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        "><i class="fas fa-times"></i></button>
    `;

    const closeBtn = toast.querySelector('.toast-close-btn');
    closeBtn.addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 350);
    });

    if (action) {
        const actBtn = toast.querySelector('.toast-action-btn');
        actBtn.addEventListener('click', () => {
            action.callback();
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 350);
        });
    }

    container.appendChild(toast);

    // Trigger animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // Auto remove
    const duration = action ? 7000 : 4000;
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 350);
        }
    }, duration);
}

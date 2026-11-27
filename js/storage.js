/**
 * ============================================================================
 * StreamHub — Datenspeicher & Listen-Verwaltung (js/storage.js)
 * ============================================================================
 * Verwaltet localStorage mit Quota-Schutz sowie profilgetrennte Listen:
 * Verlauf (inkl. Einzel-/Mehrfachlöschung), Suchverlauf, Videofortschritt,
 * Merkliste, Später ansehen, Playlists, Abonnements und Downloads.
 */

// ── localStorage Quota-Schutz ─────────────────────────────────────────────────

/** Löscht zwischengespeicherte Vorschaubilder, um Speicherplatz freizugeben */
function _clearThumbnailCache() {
    let cleared = 0;
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('t_') || k.startsWith('vod_'))) toDelete.push(k);
    }
    toDelete.forEach(k => { try { localStorage.removeItem(k); cleared++; } catch (e) {} });
    console.warn('[Storage] Cleared ' + cleared + ' thumbnail cache entries to free space');
    return cleared;
}

/** Schreibt sicher in localStorage; räumt bei vollem Speicher zuerst Cache auf */
function _safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        if (e && e.name === 'QuotaExceededError') {
            console.warn('[Storage] QuotaExceeded for ' + key + ', clearing thumbnail cache...');
            _clearThumbnailCache();
            try {
                localStorage.setItem(key, value);
            } catch (e2) {
                console.error('[Storage] Still quota exceeded after cleanup for ' + key);
            }
        } else {
            throw e;
        }
    }
}

// ── Eindeutiger Schlüssel pro Video ───────────────────────────────────────────

/** Liefert einen stabilen Identifikations-Schlüssel für ein Video-Objekt */
function getVideoProgressKey(item) {
    if (!item) return '';
    if (item._uid) return item._uid;
    if (item.id) return `id_${item.id}`;
    const url = item.url_video_hd || item.url_video || item.url_video_low || item.url_website || item.url;
    if (url && url.length > 5) return url;
    const title = item.title || '';
    const channel = item.channel || '';
    const timestamp = item.timestamp || item.date || item.duration || '';
    if (title || channel) {
        return `${channel}_${timestamp}_${title}`;
    }
    try { return JSON.stringify(item); } catch (e) { return String(Math.random()); }
}

/** Erzeugt einen eindeutigen Schlüssel für Verlaufseinträge (auch für Mehrfachauswahl) */
function getHistoryItemKey(item) {
    if (!item) return '';
    return getVideoProgressKey(item) || `${item.title || ''}_${item.channel || ''}_${item.watchedAt || ''}`;
}

// ── Verlauf (Recently Watched / History) ──────────────────────────────────────

function getRecentlyWatched() {
    try {
        return JSON.parse(localStorage.getItem(getProfileKey('recentlyWatched')) || '[]');
    } catch (e) {
        return [];
    }
}

function saveRecentlyWatched(recent) {
    try {
        _safeSetItem(getProfileKey('recentlyWatched'), JSON.stringify(recent));
    } catch (e) {
        console.error('saveRecentlyWatched error:', e);
    }
}

/**
 * Entfernt ein einzelnes Video aus dem Verlauf anhand seines Schlüssels.
 * @param {Object|string} itemOrKey - Video-Objekt oder dessen History-Key
 * @returns {Array} Aktualisierte Verlaufsliste
 */
function removeHistoryItem(itemOrKey) {
    const targetKey = typeof itemOrKey === 'string' ? itemOrKey : getHistoryItemKey(itemOrKey);
    const updated = getRecentlyWatched().filter(entry => getHistoryItemKey(entry) !== targetKey);
    saveRecentlyWatched(updated);
    return updated;
}

/**
 * Entfernt mehrere ausgewählte Videos auf einmal aus dem Verlauf.
 * @param {Iterable<string>|Set<string>} keysCollection
 * @returns {{ updated: Array, removedCount: number }}
 */
function removeMultipleHistoryItems(keysCollection) {
    const keySet = keysCollection instanceof Set ? keysCollection : new Set(keysCollection || []);
    const current = getRecentlyWatched();
    const updated = current.filter(entry => !keySet.has(getHistoryItemKey(entry)));
    saveRecentlyWatched(updated);
    return {
        updated,
        removedCount: current.length - updated.length
    };
}

// ── Suchverlauf (Search History) ──────────────────────────────────────────────

function getSearchHistory() {
    try {
        return JSON.parse(localStorage.getItem(getProfileKey('streamhubSearchHistory')) || '[]');
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
        _safeSetItem(getProfileKey('streamhubSearchHistory'), JSON.stringify(history));
    } catch (e) {
        console.error('Error saving search query:', e);
    }
}

function removeSearchQuery(query) {
    try {
        let history = getSearchHistory();
        history = history.filter(item => item.toLowerCase() !== query.toLowerCase());
        _safeSetItem(getProfileKey('streamhubSearchHistory'), JSON.stringify(history));
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

        const histTextEl = item.querySelector('.history-text');
        const onPickQuery = () => {
            if (searchInput) searchInput.value = query;
            performSearch(query);
            hideSearchHistoryDropdown();
        };
        if (typeof bindSafeTap === 'function') {
            bindSafeTap(histTextEl, onPickQuery, { stopPropagation: true });
        } else {
            histTextEl.addEventListener('click', onPickQuery);
        }

        const delHistBtn = item.querySelector('.delete-history-btn');
        const onDelQuery = () => {
            removeSearchQuery(query);
            showSearchHistoryDropdown();
        };
        if (typeof bindSafeTap === 'function') {
            bindSafeTap(delHistBtn, onDelQuery, { stopPropagation: true });
        } else {
            delHistBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onDelQuery();
            });
        }

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

// ── Wiedergabe-Fortschritt (Video Progress) ───────────────────────────────────

function saveVideoProgress(url, currentTime, duration) {
    try {
        const key = getProfileKey('videoProgressMap');
        const progressMap = JSON.parse(localStorage.getItem(key) || '{}');
        progressMap[url] = {
            currentTime,
            duration,
            percent: Math.round((currentTime / duration) * 100),
            timestamp: Date.now()
        };
        const keys = Object.keys(progressMap);
        if (keys.length > 50) {
            const sorted = keys.sort((a, b) => progressMap[a].timestamp - progressMap[b].timestamp);
            for (let i = 0; i < keys.length - 50; i++) delete progressMap[sorted[i]];
        }
        _safeSetItem(key, JSON.stringify(progressMap));
    } catch (e) {
        console.error('Error saving progress: ' + e.name);
    }
}

function getVideoProgress(url) {
    try {
        const key = getProfileKey('videoProgressMap');
        const progressMap = JSON.parse(localStorage.getItem(key) || '{}');
        return progressMap[url] || null;
    } catch (e) {
        return null;
    }
}

function removeVideoProgress(url) {
    try {
        const key = getProfileKey('videoProgressMap');
        const progressMap = JSON.parse(localStorage.getItem(key) || '{}');
        if (progressMap[url]) {
            delete progressMap[url];
            _safeSetItem(key, JSON.stringify(progressMap));
        }
    } catch (e) {}
}

// ── Merkliste (Watchlist) ─────────────────────────────────────────────────────

function getWatchlist() {
    try {
        return JSON.parse(localStorage.getItem(getProfileKey('streamhubWatchlist')) || '[]');
    } catch (e) {
        return [];
    }
}

function isInWatchlist(item) {
    const key = getVideoProgressKey(item);
    return getWatchlist().some(i => getVideoProgressKey(i) === key);
}

function toggleWatchlist(item, btnEl) {
    const now = Date.now();
    if (btnEl && btnEl._lastToggle && (now - btnEl._lastToggle) < 400) {
        return;
    }
    if (btnEl) btnEl._lastToggle = now;
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
        _safeSetItem(getProfileKey('streamhubWatchlist'), JSON.stringify(list));
        if (btnEl) {
            btnEl.classList.toggle('watchlist-active', adding);
            btnEl.title = adding ? 'Von Merkliste entfernen' : 'Zur Merkliste hinzufügen';
            btnEl.classList.remove('watchlist-bounce');
            void btnEl.offsetWidth;
            btnEl.classList.add('watchlist-bounce');
        }
        if (typeof window !== 'undefined' && window._haptic) {
            adding ? window._haptic.heavy() : window._haptic.tick();
        }
    } catch (e) {
        console.error('toggleWatchlist error: ' + e);
    }
}

// ── Später ansehen (Watch Later) ──────────────────────────────────────────────

function getWatchLater() {
    try { return JSON.parse(localStorage.getItem(getProfileKey('streamhubWatchLater')) || '[]'); }
    catch (e) { return []; }
}

function isInWatchLater(item) {
    const key = getVideoProgressKey(item);
    return getWatchLater().some(i => getVideoProgressKey(i) === key);
}

function toggleWatchLater(item, btnEl) {
    const now = Date.now();
    if (btnEl && btnEl._lastToggle && (now - btnEl._lastToggle) < 400) {
        return;
    }
    if (btnEl) btnEl._lastToggle = now;
    try {
        let list = getWatchLater();
        const key = getVideoProgressKey(item);
        const idx = list.findIndex(i => getVideoProgressKey(i) === key);
        const adding = idx === -1;
        if (adding) {
            list.unshift({ ...item, watchLaterAt: Date.now() });
            showNotification('⏰ Zu „Später ansehen" hinzugefügt', 'success');
        } else {
            list.splice(idx, 1);
            showNotification('Aus „Später ansehen" entfernt', 'info');
        }
        _safeSetItem(getProfileKey('streamhubWatchLater'), JSON.stringify(list));
        if (btnEl) {
            btnEl.classList.toggle('watchlater-active', adding);
            btnEl.title = adding ? 'Aus „Später ansehen" entfernen' : 'Zu „Später ansehen" hinzufügen';
            const icon = btnEl.querySelector('i');
            if (icon) {
                icon.className = adding ? 'fas fa-clock' : 'far fa-clock';
            }
        }
        if (typeof window !== 'undefined' && window._haptic) {
            adding ? window._haptic.heavy() : window._haptic.tick();
        }
    } catch (e) {
        console.error('toggleWatchLater error: ' + e);
    }
}

// ── Playlists ─────────────────────────────────────────────────────────────────

function getPlaylists() {
    try { return JSON.parse(localStorage.getItem(getProfileKey('streamhubPlaylists')) || '[]'); }
    catch (e) { return []; }
}

function savePlaylists(playlists) {
    _safeSetItem(getProfileKey('streamhubPlaylists'), JSON.stringify(playlists));
}

function createPlaylist(title) {
    if (!title || !title.trim()) return null;
    const playlists = getPlaylists();
    const newPl = { id: 'pl_' + Date.now(), title: title.trim(), createdAt: Date.now(), items: [] };
    playlists.push(newPl);
    savePlaylists(playlists);
    showNotification(`Playlist „${newPl.title}“ erstellt`, 'success');
    setTimeout(() => {
        if (currentPage === 'playlists' && typeof loadPlaylistsPage === 'function') loadPlaylistsPage();
    }, 0);
    return newPl;
}

function addToPlaylist(playlistId, item) {
    const playlists = getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    if (!pl.items) pl.items = pl.videos || [];
    const key = getVideoProgressKey(item);
    if (!pl.items.some(i => getVideoProgressKey(i) === key)) {
        pl.items.unshift(item);
        savePlaylists(playlists);
        showNotification(`Zu Playlist „${pl.title}“ hinzugefügt`, 'success');
        if (currentPage === 'playlists' && typeof loadPlaylistsPage === 'function') loadPlaylistsPage();
    } else {
        showNotification(`Bereits in Playlist „${pl.title}“ enthalten`, 'info');
    }
}

function showCreatePlaylistDialog(callback) {
    const modal = document.getElementById('newPlaylistModal');
    const input = document.getElementById('newPlaylistNameInput');
    const cancelBtn = document.getElementById('cancelNewPlaylistBtn');
    const confirmBtn = document.getElementById('confirmNewPlaylistBtn');
    const backdrop = document.getElementById('closeNewPlaylistBackdrop');
    if (!modal || !input) return;

    input.value = '';
    modal.style.display = 'flex';
    modal.classList.add('active');
    setTimeout(() => input.focus(), 150);

    const close = () => {
        modal.style.display = 'none';
        modal.classList.remove('active');
    };

    const submit = () => {
        input.blur();
        setTimeout(() => {
            const val = input.value.trim();
            if (val) {
                close();
                const pl = createPlaylist(val);
                if (callback && pl) callback(pl);
            }
        }, 50);
    };

    if (cancelBtn) cancelBtn.onclick = close;
    if (backdrop) backdrop.onclick = close;
    if (confirmBtn) confirmBtn.onclick = submit;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    };
}

// ── Abonnements (Abos) ────────────────────────────────────────────────────────

function getAbos() {
    try { return JSON.parse(localStorage.getItem(getProfileKey('streamhub_abos')) || '[]'); }
    catch { return []; }
}

function saveAbos(abos) {
    _safeSetItem(getProfileKey('streamhub_abos'), JSON.stringify(abos));
}

// ── Download-Manager-Speicher ─────────────────────────────────────────────────

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

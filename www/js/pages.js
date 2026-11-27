/**
 * ============================================================================
 * StreamHub — Seiten, Verlauf (Einzel-/Mehrfachlöschen) & Listen (js/pages.js)
 * ============================================================================
 * Steuert die Seiten-Navigation sowie alle Unterseiten und Listenansichten:
 *  - Suchergebnisse & Mehr-laden-Paginierung
 *  - Verlauf (inkl. Einzel-Löschbutton pro Karte & Mehrfachauswahl-Leiste)
 *  - Merkliste, Später ansehen, Playlists, Abonnements
 *  - Live TV, Lokale Videos & Ordnerdetailansicht
 *  - Statistiken, Download-Manager, Einstellungen, Themes & Info-Modal
 *
 * Abhängigkeiten: config.js, state.js, utils.js, storage.js, profiles.js,
 *                thumbnails.js, cards.js, api.js, player.js
 */

'use strict';

// ── Seiten-Navigation ─────────────────────────────────────────────────────────

/** Wechselt sauber zur angegebenen Seite und aktualisiert Nav-Status + Back-Handler */
function navigateToPage(page) {
    if (page !== currentPage) {
        previousPage = currentPage;
        // Wenn Verlaufsseite verlassen wird, Auswahlmodus beenden
        if (currentPage === 'history' && historySelectionState.active) {
            toggleHistorySelectionMode(false, { skipRender: true });
        }
        if (typeof closeVideoModal === 'function' && (!videoModal || !videoModal.classList.contains('modal-minimized'))) {
            closeVideoModal();
        }
    }
    currentPage = page;

    const sections = [
        'mainVideoSection', 'historyPage', 'recentlyWatched', 'livePage',
        'localPage', 'localFolderDetailPage', 'seriesDetailPage',
        'settingsPage', 'watchlistPage', 'watchLaterPage', 'playlistsPage',
        'playlistDetailPage', 'statsPage', 'abosPage', 'downloadsPage'
    ];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (typeof window !== 'undefined' && window.scrollTo) {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
    const mc = document.querySelector('.main-content');
    if (mc) mc.scrollTop = 0;

    if (page === 'home') {
        const mainVideoSection = document.getElementById('mainVideoSection');
        const rw = document.getElementById('recentlyWatched');
        if (mainVideoSection) mainVideoSection.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';

        if (_searchInProgress) {
            if (rw) rw.style.display = 'none';
            showLoading(true);
        } else if (searchInput && searchInput.value.trim() && currentQuery && currentResults && currentResults.length > 0) {
            if (rw) rw.style.display = 'block';
            displayResults();
            loadRecentlyWatched();
        } else {
            if (rw) rw.style.display = 'block';
            loadDefaultContent();
            loadRecentlyWatched();
        }
    } else if (page === 'history') {
        const el = document.getElementById('historyPage');
        if (el) el.style.display = 'block';
        loadFullHistoryPage();
    } else if (page === 'live') {
        const el = document.getElementById('livePage');
        if (el) el.style.display = 'block';
        loadLiveChannels();
        loadEPG();
    } else if (page === 'local') {
        const el = document.getElementById('localPage');
        if (el) el.style.display = 'block';
        loadLocalVideosPage();
    } else if (page === 'settings') {
        const el = document.getElementById('settingsPage');
        if (el) el.style.display = 'block';
        loadSettings();
    } else if (page === 'seriesDetail') {
        const el = document.getElementById('seriesDetailPage');
        if (el) el.style.display = 'block';
    } else if (page === 'localFolderDetail') {
        const el = document.getElementById('localFolderDetailPage');
        if (el) el.style.display = 'block';
    } else if (page === 'watchlist') {
        const el = document.getElementById('watchlistPage');
        if (el) el.style.display = 'block';
        loadWatchlistPage();
    } else if (page === 'watchlater') {
        const el = document.getElementById('watchLaterPage');
        if (el) el.style.display = 'block';
        loadWatchLaterPage();
    } else if (page === 'playlists') {
        const el = document.getElementById('playlistsPage');
        if (el) el.style.display = 'block';
        loadPlaylistsPage();
    } else if (page === 'playlistDetail') {
        const el = document.getElementById('playlistDetailPage');
        if (el) el.style.display = 'block';
    } else if (page === 'stats') {
        const el = document.getElementById('statsPage');
        if (el) el.style.display = 'block';
        loadStatsPage();
    } else if (page === 'abos') {
        const el = document.getElementById('abosPage');
        if (el) el.style.display = 'block';
        initAbosPage();
        loadAbosPage();
    } else if (page === 'downloads') {
        const el = document.getElementById('downloadsPage');
        if (el) el.style.display = 'block';
        initDownloadsPage();
        renderDownloadsPage();
    }

    document.querySelectorAll('.hamburger-item[data-page]').forEach(el => {
        el.classList.toggle('active-page', el.dataset.page === page);
    });

    document.querySelectorAll('.nav-categories a').forEach(link => {
        const cat = link.dataset.category;
        const pg = link.dataset.page;
        if (pg === page || (page === 'home' && cat === 'home')) {
            document.querySelectorAll('.nav-categories a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        }
    });

    if (window._syncNativeBackHandler) window._syncNativeBackHandler();
    if (typeof syncAllSelects === 'function') setTimeout(syncAllSelects, 80);
}
if (typeof window !== 'undefined') window.navigateToPage = navigateToPage;

// ── Ergebnisse & Suche ────────────────────────────────────────────────────────

/** Gruppiert Suchergebnisse und rendert die erste Seite */
function displayResults() {
    try {
        if (emptyState) emptyState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'none';
        if (!videoGrid) return;

        currentOffset = 0;
        const grouped = groupAllResults(currentResults);
        currentDisplayItems = grouped;

        const toDisplay = currentDisplayItems.slice(0, resultsPerPage);
        displayedResults = toDisplay;

        videoGrid.innerHTML = '';
        showEmpty(false);
        renderDisplayItems(toDisplay);

        if (resultsCount) resultsCount.textContent = `${currentResults.length} Ergebnisse`;

        const loadMoreContainer = document.querySelector('.load-more-container');
        if (loadMoreContainer) {
            loadMoreContainer.style.display = currentDisplayItems.length > resultsPerPage ? 'block' : 'none';
        }

        // Sortier-Buttons & Suchverlauf-Chips aktualisieren
        const sortBtns = document.getElementById('sortButtons');
        if (sortBtns) sortBtns.style.display = currentQuery ? 'flex' : 'none';
        if (typeof renderSearchChips === 'function') renderSearchChips();
    } catch (error) {
        console.error('[Pages] displayResults error:', error);
    }
}

/** Lädt den nächsten Block von Ergebnissen ins Grid nach */
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

/** Rendert Klick-Chips der letzten Suchanfragen unter der Suche */
function renderSearchChips() {
    const chipsRow = document.getElementById('searchChipsRow');
    if (!chipsRow) return;

    const history = getSearchHistory();
    if (!history.length || !currentQuery) {
        chipsRow.style.display = 'none';
        return;
    }

    const recent = history.filter(q => q !== currentQuery).slice(0, 6);
    if (!recent.length) {
        chipsRow.style.display = 'none';
        return;
    }

    chipsRow.innerHTML = `<span class="search-chip-label"><i class="fas fa-history"></i></span>` +
        recent.map(q => `<button class="search-chip" data-q="${encodeURIComponent(q)}"><i class="fas fa-clock"></i>${q}</button>`).join('');
    chipsRow.style.display = 'flex';

    chipsRow.querySelectorAll('.search-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const q = decodeURIComponent(chip.dataset.q);
            const inp = document.getElementById('searchInput');
            if (inp) {
                inp.value = q;
                inp.dispatchEvent(new Event('input'));
            }
            performSearch(q);
        });
    });
}

// ── Verlauf (Einzeln löschen + Mehrfachauswahl) ───────────────────────────────

/** Synchronisiert Leiste, Zähler und Buttons des Verlaufs-Auswahlmodus */
function _syncHistorySelectionUI(visibleKeys = []) {
    const bulkBar     = document.getElementById('historyBulkBar');
    const toggleBtn   = document.getElementById('historySelectToggleBtn');
    const countEl     = document.getElementById('historySelectedCount');
    const delSelBtn   = document.getElementById('historyDeleteSelectedBtn');
    const selAllBtn   = document.getElementById('historySelectAllBtn');
    const selectedCnt = historySelectionState.selectedKeys.size;

    if (bulkBar) {
        bulkBar.style.display = historySelectionState.active ? 'flex' : 'none';
    }
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', historySelectionState.active);
        toggleBtn.innerHTML = historySelectionState.active
            ? '<i class="fas fa-times"></i> Fertig'
            : '<i class="fas fa-check-square"></i> Auswählen';
    }
    if (countEl) {
        countEl.textContent = `${selectedCnt} ausgewählt`;
    }
    if (delSelBtn) {
        delSelBtn.disabled = selectedCnt === 0;
        delSelBtn.innerHTML = selectedCnt > 0
            ? `<i class="fas fa-trash-alt"></i> Ausgewählte löschen (${selectedCnt})`
            : `<i class="fas fa-trash-alt"></i> Ausgewählte löschen`;
    }
    if (selAllBtn && visibleKeys.length > 0) {
        const allSelected = visibleKeys.every(k => historySelectionState.selectedKeys.has(k));
        selAllBtn.innerHTML = allSelected
            ? '<i class="fas fa-square"></i> Auswahl aufheben'
            : '<i class="fas fa-check-double"></i> Alle auswählen';
    }
}

/** Schaltet den Mehrfachauswahl-Modus auf der Verlaufsseite um */
function toggleHistorySelectionMode(forceState, opts = {}) {
    historySelectionState.active = typeof forceState === 'boolean'
        ? forceState
        : !historySelectionState.active;

    if (!historySelectionState.active) {
        historySelectionState.selectedKeys.clear();
    }

    if (!opts.skipRender) {
        if (historySelectionState.currentFilterQuery) {
            filterHistoryPage(historySelectionState.currentFilterQuery);
        } else {
            loadFullHistoryPage();
        }
    } else {
        _syncHistorySelectionUI();
    }
}

/** Gibt die aktuell auf der Verlaufsseite sichtbaren Items zurück (berücksichtigt Suche) */
function _getVisibleHistoryItems() {
    const recent = getRecentlyWatched();
    const q = (historySelectionState.currentFilterQuery || '').trim().toLowerCase();
    if (!q) return recent;
    return recent.filter(item =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.channel || '').toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
    );
}

/** Bindet die Buttons der Mehrfachauswahl-Leiste genau einmal */
function _bindHistoryBulkControls() {
    const toggleBtn = document.getElementById('historySelectToggleBtn');
    const selAllBtn = document.getElementById('historySelectAllBtn');
    const cancelBtn = document.getElementById('historyCancelSelectBtn');
    const delSelBtn = document.getElementById('historyDeleteSelectedBtn');

    if (toggleBtn && !toggleBtn._histBound) {
        toggleBtn._histBound = true;
        toggleBtn.addEventListener('click', () => toggleHistorySelectionMode());
    }
    if (cancelBtn && !cancelBtn._histBound) {
        cancelBtn._histBound = true;
        cancelBtn.addEventListener('click', () => toggleHistorySelectionMode(false));
    }
    if (selAllBtn && !selAllBtn._histBound) {
        selAllBtn._histBound = true;
        selAllBtn.addEventListener('click', () => {
            const visibleKeys = _getVisibleHistoryItems().map(getHistoryItemKey);
            const allSelected = visibleKeys.length > 0 && visibleKeys.every(k => historySelectionState.selectedKeys.has(k));
            if (allSelected) {
                visibleKeys.forEach(k => historySelectionState.selectedKeys.delete(k));
            } else {
                visibleKeys.forEach(k => historySelectionState.selectedKeys.add(k));
            }
            if (historySelectionState.currentFilterQuery) {
                filterHistoryPage(historySelectionState.currentFilterQuery);
            } else {
                loadFullHistoryPage();
            }
        });
    }
    if (delSelBtn && !delSelBtn._histBound) {
        delSelBtn._histBound = true;
        delSelBtn.addEventListener('click', () => {
            const count = historySelectionState.selectedKeys.size;
            if (count === 0) return;
            _showConfirmDialog(
                'Ausgewählte Videos löschen?',
                `Möchtest du ${count} ${count === 1 ? 'Video' : 'Videos'} wirklich aus dem Verlauf entfernen?`,
                () => {
                    const { removedCount } = removeMultipleHistoryItems(historySelectionState.selectedKeys);
                    historySelectionState.selectedKeys.clear();
                    historySelectionState.active = false;
                    loadRecentlyWatched();
                    if (historySelectionState.currentFilterQuery) {
                        filterHistoryPage(historySelectionState.currentFilterQuery);
                    } else {
                        loadFullHistoryPage();
                    }
                    showNotification(`${removedCount} ${removedCount === 1 ? 'Video' : 'Videos'} aus Verlauf entfernt`, 'info');
                },
                'Löschen',
                true
            );
        });
    }
}

/**
 * Gemeinsamer Renderer für Verlaufskarten (für Komplettansicht und Verlaufssuche).
 * Baut den Einzel-Löschbutton kollisionsfrei in .video-card-meta ein und
 * aktiviert bei Bedarf die Mehrfachauswahl-Checkboxen.
 */
function _renderHistoryCards(items, historyGrid, emptyHtml) {
    _bindHistoryBulkControls();
    historyGrid.innerHTML = '';

    if (items.length === 0) {
        if (historySelectionState.active) {
            historySelectionState.active = false;
            historySelectionState.selectedKeys.clear();
        }
        _syncHistorySelectionUI([]);
        historyGrid.innerHTML = emptyHtml;
        return;
    }

    const visibleKeys = [];

    items.forEach((item, index) => {
        const card    = createVideoCard(item, index);
        const histKey = getHistoryItemKey(item);
        visibleKeys.push(histKey);
        card.dataset.historyKey = histKey;

        // Einzel-Löschbutton kollisionsfrei rechts in der Meta-Zeile einfügen
        const delBtn = document.createElement('button');
        delBtn.className = 'history-del-btn';
        delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        delBtn.title = 'Einzeln aus Verlauf entfernen';
        delBtn.setAttribute('aria-label', 'Aus Verlauf entfernen');

        const handleSingleDelete = () => {
            removeHistoryItem(histKey);
            historySelectionState.selectedKeys.delete(histKey);
            loadRecentlyWatched();
            card.style.transition = 'opacity 0.22s, transform 0.22s';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.92)';
            setTimeout(() => {
                card.remove();
                if (historyGrid.children.length === 0) {
                    if (historySelectionState.currentFilterQuery) filterHistoryPage(historySelectionState.currentFilterQuery);
                    else loadFullHistoryPage();
                } else {
                    _syncHistorySelectionUI(
                        Array.from(historyGrid.children).map(c => c.dataset.historyKey).filter(Boolean)
                    );
                }
            }, 220);
        };

        if (typeof bindSafeTap === 'function') {
            bindSafeTap(delBtn, handleSingleDelete, { stopPropagation: true });
        } else {
            delBtn.addEventListener('click', (e) => { e.stopPropagation(); handleSingleDelete(); });
        }

        const metaRow = card.querySelector('.video-card-meta');
        if (metaRow) {
            metaRow.appendChild(delBtn);
        } else {
            card.appendChild(delBtn);
        }

        // Auswahlmodus-Checkbox + Umschalt-Klick
        if (historySelectionState.active) {
            card.classList.add('history-selectable');
            const isSelected = historySelectionState.selectedKeys.has(histKey);
            card.classList.toggle('history-selected', isSelected);

            const thumb = card.querySelector('.video-thumbnail');
            if (thumb) {
                const indicator = document.createElement('div');
                indicator.className = 'history-select-indicator';
                indicator.innerHTML = isSelected ? '<i class="fas fa-check"></i>' : '';
                thumb.appendChild(indicator);
            }

            const toggleSelect = () => {
                if (historySelectionState.selectedKeys.has(histKey)) {
                    historySelectionState.selectedKeys.delete(histKey);
                    card.classList.remove('history-selected');
                    const ind = card.querySelector('.history-select-indicator');
                    if (ind) ind.innerHTML = '';
                } else {
                    historySelectionState.selectedKeys.add(histKey);
                    card.classList.add('history-selected');
                    const ind = card.querySelector('.history-select-indicator');
                    if (ind) ind.innerHTML = '<i class="fas fa-check"></i>';
                }
                _syncHistorySelectionUI(visibleKeys);
            };

            if (typeof bindSafeTap === 'function') {
                bindSafeTap(card, toggleSelect, { preventDefault: false });
            } else {
                card.addEventListener('click', toggleSelect);
            }
        }

        historyGrid.appendChild(card);
    });

    _syncHistorySelectionUI(visibleKeys);
}

/** Lädt den kompletten Videoverlauf inkl. Einzel-Löschen & Mehrfachauswahl */
function loadFullHistoryPage() {
    const historyGrid = document.getElementById('historyGrid');
    if (!historyGrid) return;
    historySelectionState.currentFilterQuery = '';
    const recent = getRecentlyWatched();
    _renderHistoryCards(
        recent,
        historyGrid,
        '<div class="empty-state"><i class="fas fa-history"></i><h3>Kein Verlauf</h3><p>Du hast noch keine Videos angesehen</p></div>'
    );
}

/** Filtert die Verlaufsseite und behält Einzel-/Mehrfachlöschung bei */
function filterHistoryPage(query) {
    const historyGrid = document.getElementById('historyGrid');
    if (!historyGrid) return;

    const cleanQ = (query || '').trim();
    historySelectionState.currentFilterQuery = cleanQ;

    if (!cleanQ) {
        loadFullHistoryPage();
        return;
    }

    const filtered = _getVisibleHistoryItems();
    _renderHistoryCards(
        filtered,
        historyGrid,
        '<div class="empty-state"><i class="fas fa-search"></i><h3>Keine Ergebnisse</h3><p>Keine Videos im Verlauf gefunden</p></div>'
    );
}

/** Zeigt die letzten 10 angesehenen Videos im Startseiten-Streifen */
function loadRecentlyWatched() {
    const recent = getRecentlyWatched();
    if (!recentlyWatched || !recentGrid) return;

    if (recent.length === 0) {
        recentlyWatched.style.display = 'none';
        return;
    }

    recentlyWatched.style.display = 'block';
    recentGrid.innerHTML = '';
    recent.slice(0, 10).forEach((item, index) => {
        recentGrid.appendChild(createVideoCard(item, index));
    });
}

/** Fügt ein Video dedupliziert an den Anfang des Verlaufs ein (max. 30 Einträge) */
function saveToRecentlyWatched(item) {
    try {
        let recent = getRecentlyWatched();
        const histKey = getHistoryItemKey(item);
        const legacyKey = `${item.title}_${item.channel}_${item.timestamp}`;
        recent = recent.filter(r =>
            getHistoryItemKey(r) !== histKey &&
            `${r.title}_${r.channel}_${r.timestamp}` !== legacyKey
        );

        const desc = item.description || item.topic || '';
        const shortDesc = desc.length > 150 ? desc.substring(0, 150) + '...' : desc;

        recent.unshift({
            id:            item.id,
            title:         item.title,
            channel:       item.channel,
            duration:      item.duration,
            timestamp:     item.timestamp,
            topic:         item.topic,
            description:   shortDesc,
            url_video:     item.url_video,
            url_video_hd:  item.url_video_hd,
            url_video_low: item.url_video_low,
            url_subtitle:  item.url_subtitle,
            watchedAt:     Date.now()
        });

        recent = recent.slice(0, 30);
        saveRecentlyWatched(recent);
        loadRecentlyWatched();
    } catch (err) {
        console.warn('[Pages] saveToRecentlyWatched error:', err);
    }
}

// ── Merkliste, Später ansehen & Playlists ─────────────────────────────────────

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
    list.forEach((item, index) => grid.appendChild(createVideoCard(item, index)));
}

function clearWatchlist() {
    _showConfirmDialog(
        'Merkliste leeren?',
        'Möchtest du die Merkliste wirklich leeren?',
        () => {
            localStorage.removeItem(getProfileKey('streamhubWatchlist'));
            loadWatchlistPage();
        },
        'Leeren',
        true
    );
}

function loadWatchLaterPage() {
    const grid = document.getElementById('watchLaterGrid');
    const empty = document.getElementById('watchLaterEmpty');
    const clearBtn = document.getElementById('clearWatchLaterBtn');
    const backBtn = document.getElementById('backFromWatchLater');
    if (!grid) return;

    const list = getWatchLater();
    grid.innerHTML = '';

    if (clearBtn) {
        clearBtn.onclick = () => {
            _showConfirmDialog(
                '„Später ansehen" leeren?',
                'Möchtest du die „Später ansehen"-Liste wirklich leeren?',
                () => {
                    localStorage.removeItem(getProfileKey('streamhubWatchLater'));
                    loadWatchLaterPage();
                },
                'Leeren',
                true
            );
        };
    }
    if (backBtn) {
        backBtn.onclick = () => navigateToPage(previousPage && previousPage !== 'watchlater' ? previousPage : 'home');
    }

    if (list.length === 0) {
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.forEach((item, index) => grid.appendChild(createVideoCard(item, index)));
}

function loadPlaylistsPage() {
    const grid = document.getElementById('playlistsGrid');
    const empty = document.getElementById('playlistsEmpty');
    const navBtn = document.getElementById('createPlaylistNavBtn');
    const backBtn = document.getElementById('backFromPlaylists');

    if (backBtn) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            navigateToPage(previousPage && previousPage !== 'playlists' ? previousPage : 'home');
        };
    }
    if (navBtn) {
        navBtn.onclick = () => showCreatePlaylistDialog(() => loadPlaylistsPage());
    }
    if (!grid) return;

    const playlists = getPlaylists();
    grid.innerHTML = '';
    if (playlists.length === 0) {
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';

    playlists.forEach(pl => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.style.cursor = 'pointer';
        const itemCount = pl.items ? pl.items.length : 0;
        card.innerHTML = `
            <div class="video-thumbnail" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;">
                <i class="fas fa-list" style="font-size:3rem;color:rgba(255,255,255,0.85);margin-bottom:8px;"></i>
                <span class="duration-badge" style="background:rgba(0,0,0,0.7);">${itemCount} Videos</span>
                <button class="watchlist-btn delete-pl-btn" title="Playlist löschen" style="background:rgba(239,68,68,0.85);opacity:1 !important;transform:scale(1) !important;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="video-card-content">
                <h3 class="video-card-title">${pl.title}</h3>
                <div class="video-card-meta">
                    <span class="channel-badge">${itemCount} ${itemCount === 1 ? 'Video' : 'Videos'}</span>
                </div>
            </div>
        `;

        const openPl = (e) => {
            if (e?.target?.closest?.('.delete-pl-btn')) return;
            openPlaylistDetail(pl);
        };
        if (typeof bindSafeTap === 'function') bindSafeTap(card, openPl, { preventDefault: false });
        else card.onclick = openPl;

        const delBtn = card.querySelector('.delete-pl-btn');
        if (delBtn) {
            const onDeletePl = () => {
                _showConfirmDialog(
                    'Playlist löschen?',
                    `Möchtest du die Playlist „${pl.title}" wirklich löschen?`,
                    () => {
                        savePlaylists(getPlaylists().filter(p => p.id !== pl.id));
                        loadPlaylistsPage();
                    },
                    'Löschen',
                    true
                );
            };
            if (typeof bindSafeTap === 'function') bindSafeTap(delBtn, onDeletePl, { stopPropagation: true });
            else delBtn.onclick = (e) => { e.stopPropagation(); onDeletePl(); };
        }
        grid.appendChild(card);
    });
}

function openPlaylistDetail(pl) {
    if (!pl) return;
    navigateToPage('playlistDetail');
    const title = document.getElementById('playlistDetailTitle');
    const grid = document.getElementById('playlistDetailGrid');
    const empty = document.getElementById('playlistDetailEmpty');
    const backBtn = document.getElementById('backFromPlaylistDetail');

    if (title) title.innerHTML = `<i class="fas fa-list" style="color:var(--primary-color);"></i> ${pl.title}`;
    if (backBtn) backBtn.onclick = () => navigateToPage('playlists');
    if (!grid) return;
    grid.innerHTML = '';

    const items = pl.items || pl.videos || [];
    if (items.length === 0) {
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';
    items.forEach((item, idx) => grid.appendChild(createVideoCard(item, idx)));
}

// ── Live TV ───────────────────────────────────────────────────────────────────

function loadLiveChannels() {
    const grid = document.getElementById('liveChannelsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const isKids = getActiveProfile().isKids;
    const channelsToRender = [...liveChannels].sort((a, b) => {
        if (isKids) {
            if (a.channel === 'KiKA') return -1;
            if (b.channel === 'KiKA') return 1;
        }
        return 0;
    });

    channelsToRender.forEach(channel => {
        const card = document.createElement('div');
        card.className = 'live-channel-card';
        const colors = senderColors[channel.channel] || senderColors.DEFAULT;
        const liveThumbId = `thumb-${++thumbIdCounter}`;
        const liveGradient = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;

        card.innerHTML = `
            <div class="live-channel-thumbnail" id="${liveThumbId}" style="background:${liveGradient}">
                <div class="live-badge"><i class="fas fa-circle"></i> LIVE</div>
                <i class="fas fa-broadcast-tower live-tower-icon" style="font-size:3rem;opacity:0.3;"></i>
            </div>
            <div class="live-channel-info">
                <h3>${channel.name}</h3>
                <span class="channel-badge" style="background:${colors[0]}">${channel.channel}</span>
            </div>
        `;

        const liveCk = simpleHash('live_' + channel.name);
        const liveIdx = liveChannels.indexOf(channel);
        setTimeout(() => {
            const el = document.getElementById(liveThumbId);
            if (el) queueRealThumbnail(channel.url, liveCk, el, liveGradient);
        }, 400 + liveIdx * 600);

        if (typeof bindSafeTap === 'function') bindSafeTap(card, () => playLiveChannel(channel), { preventDefault: false });
        else card.addEventListener('click', () => playLiveChannel(channel));
        grid.appendChild(card);
    });
}

function playLiveChannel(channel) {
    try {
        if (!videoModal || !videoPlayer) return;

        window.currentPlayingVideo = null;
        window._currentPlayingItem = null;
        if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

        const simSec = document.getElementById('similarVideosSection');
        if (simSec) simSec.style.display = 'none';

        videoPlayer.playsInline = true;
        videoPlayer.setAttribute('playsinline', '');
        const isMobileLandscape = typeof window !== 'undefined' &&
            window.innerWidth > window.innerHeight &&
            window.innerHeight <= 580;
        videoModal.classList.remove('modal-minimized');
        videoModal.classList.toggle('is-landscape-fullscreen', isMobileLandscape);
        videoModal.classList.add('active');
        try {
            if (window.AndroidNativeTheme?.updatePipAutoEnter) window.AndroidNativeTheme.updatePipAutoEnter(true);
        } catch {}
        setTimeout(() => { if (typeof window._updateAndroidPipBounds === 'function') window._updateAndroidPipBounds(); }, 250);
        if (window._syncNativeBackHandler) window._syncNativeBackHandler();

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

        if (channel.url.includes('.m3u8') && typeof Hls !== 'undefined') {
            if (Hls.isSupported()) {
                hlsInstance = new Hls();
                hlsInstance.loadSource(channel.url);
                hlsInstance.attachMedia(videoPlayer);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => videoPlayer.play().catch(() => {}));
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                videoPlayer.src = channel.url;
                videoPlayer.play().catch(() => {});
            }
        } else {
            videoPlayer.src = channel.url;
            videoPlayer.play().catch(() => {});
        }
    } catch (error) {
        console.error('[Pages] playLiveChannel error:', error);
        showNotification('Fehler beim Laden des Live-Streams: ' + error.message, 'error');
    }
}

// ── Lokale Videos & Ordner ────────────────────────────────────────────────────

function loadLocalFolders() {
    try { localFolders = JSON.parse(localStorage.getItem('localFolders') || '[]'); }
    catch { localFolders = []; }
}

function saveLocalFolders() {
    localStorage.setItem('localFolders', JSON.stringify(localFolders));
}

function selectLocalVideosWeb() {
    let input = document.getElementById('webLocalFileInput');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'webLocalFileInput';
        input.multiple = true;
        input.accept = 'video/*';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;

            files.forEach((file, idx) => {
                const objectUrl = URL.createObjectURL(file);
                webLocalVideos.push({
                    id:           'web_local_' + Date.now() + '_' + idx,
                    title:        file.name.replace(/\.[^/.]+$/, ''),
                    channel:      'Lokale Datei',
                    timestamp:    Math.floor(file.lastModified / 1000) || Math.floor(Date.now() / 1000),
                    duration:     0,
                    url_video:    objectUrl,
                    url_video_hd: objectUrl,
                    isLocal:      true,
                    size:         file.size,
                    fileName:     file.name
                });
            });
            loadLocalVideosPage();
        });
    }
    input.click();
}

async function addLocalFolderDialog() {
    if (window.electronAPI?.selectFolder) {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath && !localFolders.includes(folderPath)) {
            localFolders.push(folderPath);
            saveLocalFolders();
            await scanLocalVideos();
        }
    } else {
        selectLocalVideosWeb();
    }
}

async function scanLocalVideos() {
    localVideos = [];
    if (window.electronAPI?.scanVideos) {
        for (const folder of localFolders) {
            try {
                const videos = await window.electronAPI.scanVideos(folder);
                localVideos.push(...videos);
            } catch (e) { console.error('Scan error:', e); }
        }
    }
    loadLocalVideosPage();
}

function loadLocalVideosPage() {
    const container = document.getElementById('localFoldersContainer');
    const grid      = document.getElementById('localFoldersGrid');
    if (!container || !grid) return;

    if (localFolders.length === 0 && webLocalVideos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>Keine lokalen Videos oder Ordner</h3>
                <p>Füge Videos oder Ordner hinzu, um lokale Inhalte abzuspielen</p>
                <button class="btn-primary" style="margin-top:1rem;width:auto;padding:0.75rem 2rem;" onclick="addLocalFolderDialog()">
                    <i class="fas fa-plus"></i> Videos / Ordner auswählen
                </button>
            </div>
        `;
        grid.innerHTML = '';
        container.style.display = 'block';
        return;
    }

    container.style.display = 'none';
    const videosByFolder = {};
    localVideos.forEach(video => {
        const sepIdx = Math.max(video.path.lastIndexOf('/'), video.path.lastIndexOf('\\'));
        const folder = sepIdx >= 0 ? video.path.substring(0, sepIdx) : video.path;
        if (!videosByFolder[folder]) videosByFolder[folder] = [];
        videosByFolder[folder].push(video);
    });

    grid.innerHTML = '';
    localFolders.forEach(folder => {
        const videos     = videosByFolder[folder] || [];
        const folderName = folder.split('/').pop() || folder.split('\\').pop() || folder;
        const card       = document.createElement('div');
        card.className   = 'folder-card';

        const videoCountClass = videos.length === 0 ? 'style="background:#dc2626;"' : '';
        const videoCountText  = videos.length === 0 ? '⚠ Keine Videos' : `${videos.length} Videos`;

        card.innerHTML = `
            <div class="folder-card-thumbnail">
                <i class="fas fa-folder"></i>
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

        if (videos.length > 0) {
            card.addEventListener('click', () => openFolderDetail(folder, videos));
        } else {
            card.style.opacity = '0.6';
            card.style.cursor  = 'not-allowed';
        }
        grid.appendChild(card);
    });

    webLocalVideos.forEach((video, index) => grid.appendChild(createVideoCard(video, index)));
}

function openFolderDetail(folderPath, videos) {
    document.getElementById('localPage').style.display = 'none';
    document.getElementById('localFolderDetailPage').style.display = 'block';
    previousPage = currentPage;
    currentPage = 'localFolderDetail';
    if (window._syncNativeBackHandler) window._syncNativeBackHandler();

    const folderName = folderPath.split('/').pop() || folderPath.split('\\').pop() || folderPath;
    document.getElementById('folderDetailTitle').innerHTML = `<i class="fas fa-folder-open"></i> ${folderName}`;

    window.currentFolderVideos = videos;
    window.currentFolderPath = folderPath;
    renderFolderVideos(videos);

    const sortSelect = document.getElementById('localSortBy');
    if (sortSelect) {
        sortSelect.value = 'name';
        sortSelect.onchange = () => {
            renderFolderVideos(sortFolderVideos(window.currentFolderVideos, sortSelect.value));
        };
        if (typeof syncCustomSelect === 'function') syncCustomSelect(sortSelect);
    }
}

function sortFolderVideos(videos, sortBy) {
    const sorted = [...videos];
    if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'size') sorted.sort((a, b) => b.size - a.size);
    else if (sortBy === 'date') sorted.sort((a, b) => (b.modified || 0) - (a.modified || 0));
    return sorted;
}

function renderFolderVideos(videos) {
    const grid = document.getElementById('folderDetailGrid');
    if (!grid) return;
    grid.innerHTML = '';

    videos.forEach((video, idx) => {
        const card = document.createElement('div');
        card.className = 'video-card';
        const thumbId = `detail_thumb_${idx}`;
        const sizeM = (video.size / (1024 * 1024)).toFixed(1);

        card.innerHTML = `
            <div class="video-thumbnail local-video-thumbnail" id="${thumbId}">
                <i class="fas fa-file-video" style="font-size:3rem;"></i>
                <div class="duration-badge">${video.ext}</div>
            </div>
            <div class="video-card-content">
                <h3 class="video-card-title">${video.name}</h3>
                <div class="video-card-meta">
                    <span class="channel-badge" style="background:#374151"><i class="fas fa-hdd"></i> ${sizeM} MB</span>
                </div>
            </div>
        `;
        if (typeof bindSafeTap === 'function') bindSafeTap(card, () => playLocalVideo(video), { preventDefault: false });
        else card.addEventListener('click', () => playLocalVideo(video));
        grid.appendChild(card);

        const thumbEl = document.getElementById(thumbId);
        if (thumbEl) queueThumbnailGeneration(video.path, thumbEl, video.streamUrl);
    });
}

if (typeof window !== 'undefined') {
    window.removeLocalFolder = function(path) {
        localFolders = localFolders.filter(f => f !== path);
        saveLocalFolders();
        loadLocalVideosPage();
    };
}

function playLocalVideo(video) {
    try {
        if (!videoModal || !videoPlayer) return;
        const src = video.streamUrl || video.url_video || (video.path ? `file://${video.path}` : '');
        if (!src) {
            showNotification('Lokale Videodatei konnte nicht geöffnet werden.', 'error');
            return;
        }

        window.currentPlayingVideo = null;
        window._currentPlayingItem = null;
        if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

        const simSec = document.getElementById('similarVideosSection');
        if (simSec) simSec.style.display = 'none';

        videoPlayer.playsInline = true;
        videoModal.classList.remove('modal-minimized', 'is-landscape-fullscreen');
        videoModal.classList.add('active');
        try {
            if (window.AndroidNativeTheme?.updatePipAutoEnter) window.AndroidNativeTheme.updatePipAutoEnter(true);
        } catch {}
        setTimeout(() => { if (typeof window._updateAndroidPipBounds === 'function') window._updateAndroidPipBounds(); }, 250);
        if (window._syncNativeBackHandler) window._syncNativeBackHandler();

        const videoTitle = document.getElementById('videoTitle');
        const videoChannel = document.getElementById('videoChannel');
        const videoDescription = document.getElementById('videoDescription');

        if (videoTitle) videoTitle.textContent = video.name || video.title || 'Lokales Video';
        if (videoChannel) { videoChannel.textContent = 'Lokal'; videoChannel.style.background = '#374151'; }
        if (videoDescription) videoDescription.textContent = video.path || video.fileName || '';

        videoPlayer.src = src;
        videoPlayer.play().catch(err => console.warn('Play failed:', err));
    } catch (error) {
        console.error('[Pages] playLocalVideo error:', error);
        showNotification('Fehler beim Laden: ' + error.message, 'error');
    }
}

// ── Theme & Einstellungen ─────────────────────────────────────────────────────

/** Wendet das gewählte Farbtheme (inkl. Material You auf Android) an */
function applyTheme(theme) {
    if (theme === 'system' || !theme) {
        document.documentElement.removeAttribute('data-theme');
        if (window.AndroidNativeTheme?.getSystemColors) {
            try {
                const colors = JSON.parse(window.AndroidNativeTheme.getSystemColors());
                if (colors.primary)      document.documentElement.style.setProperty('--primary-color', colors.primary);
                if (colors.primaryHover) document.documentElement.style.setProperty('--primary-hover', colors.primaryHover);
                if (colors.background) {
                    document.documentElement.style.setProperty('--background', colors.background);
                    document.body.style.backgroundColor = colors.background;
                }
                if (colors.surface) {
                    const hexToRgb = (hex) => {
                        hex = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (m, r, g, b) => r + r + g + g + b + b);
                        const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return res ? `${parseInt(res[1], 16)},${parseInt(res[2], 16)},${parseInt(res[3], 16)}` : '24,24,27';
                    };
                    const rgb = hexToRgb(colors.surface);
                    document.documentElement.style.setProperty('--surface', `rgba(${rgb}, 0.65)`);
                    document.documentElement.style.setProperty('--surface-glass', `rgba(${rgb}, 0.45)`);
                }
            } catch {}
        }
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        ['--primary-color', '--primary-hover', '--background', '--surface', '--surface-glass'].forEach(p => {
            document.documentElement.style.removeProperty(p);
        });
        document.body.style.backgroundColor = '';
    }
}

function loadSettings() {
    useRealThumbnails = localStorage.getItem('useRealThumbnails') === 'true';
    const settingRealThumbnails = document.getElementById('settingRealThumbnails');
    const realThumbnailsToggle  = document.getElementById('realThumbnailsToggle');
    if (settingRealThumbnails) settingRealThumbnails.checked = useRealThumbnails;
    if (realThumbnailsToggle)  realThumbnailsToggle.checked  = useRealThumbnails;

    const savedTheme   = localStorage.getItem('selectedTheme') || 'dark';
    const settingTheme = document.getElementById('settingTheme');
    if (settingTheme) {
        settingTheme.value = savedTheme;
        if (!settingTheme._bound) {
            settingTheme._bound = true;
            settingTheme.addEventListener('change', (e) => {
                localStorage.setItem('selectedTheme', e.target.value);
                applyTheme(e.target.value);
            });
        }
    }

    const savedKey  = localStorage.getItem('tmdbApiKey') || '';
    TMDB_API_KEY    = savedKey;
    const tmdbInput = document.getElementById('settingTmdbKey');
    if (tmdbInput) {
        tmdbInput.value = savedKey;
        tmdbInput.placeholder = savedKey ? '•••••••• (gespeichert)' : 'Key von themoviedb.org eingeben...';
    }

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
                if (tmdbInput) tmdbInput.placeholder = key ? '•••••••• (gespeichert)' : 'Key von themoviedb.org eingeben...';
            }, 2000);
        });
    }

    const platformBadge = document.getElementById('settingsPlatformBadge');
    if (platformBadge) {
        if (window.AndroidNativeTheme) platformBadge.textContent = 'Android';
        else if (window.electronAPI)   platformBadge.textContent = 'Desktop (Linux)';
        else                           platformBadge.textContent = 'Web';
    }

    if (typeof initCustSelects === 'function') setTimeout(initCustSelects, 0);
}

function saveSettings() {
    localStorage.setItem('useRealThumbnails', useRealThumbnails);
}

// ── Statistiken & Info-Modal ──────────────────────────────────────────────────

function loadStatsPage() {
    const recent      = getRecentlyWatched();
    const progressMap = JSON.parse(localStorage.getItem(getProfileKey('videoProgressMap')) || '{}');

    let totalSeconds = 0;
    Object.values(progressMap).forEach(prog => {
        if (prog && typeof prog.currentTime === 'number') totalSeconds += prog.currentTime;
    });
    const hours = Math.floor(totalSeconds / 3600);
    const mins  = Math.floor((totalSeconds % 3600) / 60);
    const watchTimeStr = hours > 0 ? `${hours} Std. ${mins} Min.` : `${mins} Min.`;

    const wtEl = document.getElementById('statsWatchTime');
    const vcEl = document.getElementById('statsVideoCount');
    if (wtEl) wtEl.textContent = totalSeconds > 0 ? watchTimeStr : '0 Min.';
    if (vcEl) vcEl.textContent = recent.length;

    let streak = 0;
    if (recent.length > 0) {
        const days = new Set();
        recent.forEach(item => { if (item.watchedAt) days.add(new Date(item.watchedAt).toDateString()); });
        const checkDate = new Date();
        while (true) {
            if (days.has(checkDate.toDateString())) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else if (streak === 0) {
                checkDate.setDate(checkDate.getDate() - 1);
                if (days.has(checkDate.toDateString())) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    streak = 1;
                    continue;
                }
                break;
            } else {
                break;
            }
        }
    }
    const stEl = document.getElementById('statsStreak');
    if (stEl) stEl.textContent = `${streak} ${streak === 1 ? 'Tag' : 'Tage'}`;

    const channels = {};
    const topics   = {};
    recent.forEach(item => {
        if (item.channel) channels[item.channel] = (channels[item.channel] || 0) + 1;
        if (item.topic)   topics[item.topic]     = (topics[item.topic]     || 0) + 1;
    });

    let favChannel = '-';
    let maxChanVal = 0;
    Object.entries(channels).forEach(([ch, cnt]) => {
        if (cnt > maxChanVal) { maxChanVal = cnt; favChannel = ch; }
    });
    const fcEl = document.getElementById('statsFavChannel');
    if (fcEl) fcEl.textContent = favChannel;

    const renderBarChart = (containerId, entries, barClass = '') => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        if (entries.length === 0) {
            container.innerHTML = '<div class="empty-stats-msg">Noch keine Daten vorhanden</div>';
            return;
        }
        const maxVal = entries[0][1];
        entries.forEach(([label, count]) => {
            const pct = Math.round((count / maxVal) * 100);
            const row = document.createElement('div');
            row.className = 'chart-bar-row';
            row.innerHTML = `
                <div class="chart-bar-label">${label}</div>
                <div class="chart-bar-wrapper"><div class="chart-bar-fill ${barClass}" style="width:${pct}%;"></div></div>
                <div class="chart-bar-value">${count}x</div>
            `;
            container.appendChild(row);
        });
    };

    renderBarChart('statsTopChannels', Object.entries(channels).sort((a, b) => b[1] - a[1]).slice(0, 5));
    renderBarChart('statsTopTopics',   Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 5), 'theme-secondary');
}

function showInfoModal(type) {
    const modal = document.getElementById('infoModal');
    const body  = document.getElementById('infoModalBody');
    if (!modal || !body) return;

    const content = {
        about: `
            <h2>Über StreamHub</h2>
            <p>StreamHub ist eine moderne App für deutsche öffentlich-rechtliche Mediatheken — kostenlos, Open Source, ohne Account.</p>
            <h3>Features</h3>
            <ul>
                <li>✅ Tausende Videos durchsuchen &amp; filtern</li>
                <li>✅ Livestreams (HLS) mit Kanalwechsel</li>
                <li>✅ Miniplayer &amp; Picture-in-Picture (PiP)</li>
                <li>✅ Playlists &amp; Merkliste</li>
                <li>✅ Profile &amp; Datensicherung</li>
                <li>✅ Lokale Videos abspielen</li>
                <li>✅ Keine Registrierung, keine Werbung</li>
            </ul>
            <p style="margin-top:1rem;"><strong>Version:</strong> v${APP_VERSION}</p>
        `,
        faq: `
            <h2>Häufig gestellte Fragen</h2>
            <h3>Woher kommen die Videos?</h3>
            <p>Von den offiziellen Mediatheken der öffentlich-rechtlichen Sender (ARD, ZDF, etc.)</p>
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
        `,
        privacy: `
            <h2>Datenschutzerklärung</h2>
            <h3>Datenerfassung</h3>
            <ul>
                <li>✅ <strong>LocalStorage</strong>: Verlauf &amp; Listen nur lokal auf deinem Gerät</li>
                <li>✅ <strong>Keine Cookies, kein Tracking, keine Accounts</strong></li>
            </ul>
        `,
        terms: `
            <h2>Nutzungsbedingungen</h2>
            <p>StreamHub ist kostenlos und Open Source ("as-is"). Alle Video-Inhalte gehören den jeweiligen öffentlich-rechtlichen Sendern.</p>
        `
    };

    body.innerHTML = content[type] || content.about;
    modal.classList.add('active');
}

// ── Abonnements-Seite ─────────────────────────────────────────────────────────

function loadAbosPage() {
    const abos     = getAbos();
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
                <button class="abo-search-btn" data-term="${abo.term}" title="Jetzt suchen"><i class="fas fa-search"></i> Suchen</button>
                <button class="abo-delete-btn" data-idx="${idx}" title="Entfernen"><i class="fas fa-trash"></i></button>
            </div>
        `;

        card.querySelector('.abo-search-btn').addEventListener('click', (e) => {
            const term = e.currentTarget.dataset.term;
            const inp = document.getElementById('searchInput');
            if (inp) inp.value = term;
            performSearch(term);
        });

        card.querySelector('.abo-delete-btn').addEventListener('click', (e) => {
            const i = parseInt(e.currentTarget.dataset.idx, 10);
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
    if (!addBtn || !input || input._aboBound) return;
    input._aboBound = true;

    const doAdd = () => {
        if (input.value.trim()) { addAbo(input.value); input.value = ''; }
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
}

// ── Download-Manager UI ───────────────────────────────────────────────────────

function startDownload(url, title) {
    const id        = generateDlId();
    const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'video';
    const ext       = url.split('?')[0].split('.').pop().toLowerCase();
    const filename  = safeTitle + '.' + (ext.length <= 4 ? ext : 'mp4');

    const entry = {
        id, title: safeTitle, filename, url,
        status: 'active', progress: 0, bytesLoaded: 0, bytesTotal: 0,
        startedAt: Date.now(), completedAt: null, error: null, objectUrl: null
    };

    const list = getDownloads();
    list.unshift(entry);
    saveDownloads(list);
    renderDownloadsPage();

    if (window.electronAPI?.downloadVideo) {
        window.electronAPI.downloadVideo(url, safeTitle)
            .then(res => _updateDl(id, res.success
                ? { status: 'completed', progress: 100, completedAt: Date.now() }
                : { status: 'error', error: res.message || 'Fehler beim Download' }))
            .catch(err => _updateDl(id, { status: 'error', error: err.message }));
        return;
    }

    const xhr = new XMLHttpRequest();
    _activeXHR[id] = xhr;
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';

    let lastLoaded = 0;
    let lastTime   = Date.now();

    xhr.onprogress = (e) => {
        const now      = Date.now();
        const elapsed  = (now - lastTime) / 1000;
        const speedBps = elapsed > 0 ? (e.loaded - lastLoaded) / elapsed : 0;
        lastLoaded = e.loaded;
        lastTime   = now;
        const pct = e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : -1;
        _updateDl(id, { progress: pct >= 0 ? pct : entry.progress, bytesLoaded: e.loaded, bytesTotal: e.total, speed: speedBps });
    };

    xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
            const objectUrl = URL.createObjectURL(xhr.response);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            _updateDl(id, { status: 'completed', progress: 100, completedAt: Date.now(), objectUrl, speed: 0 });
            showNotification(`✅ Download abgeschlossen: „${safeTitle}"`, 'success', {
                text: 'Zu Downloads', callback: () => navigateToPage('downloads')
            });
        } else {
            _updateDl(id, { status: 'error', error: `HTTP ${xhr.status}`, speed: 0 });
        }
        delete _activeXHR[id];
    };

    xhr.onerror = () => { _updateDl(id, { status: 'error', error: 'Netzwerkfehler', speed: 0 }); delete _activeXHR[id]; };
    xhr.onabort = () => { _updateDl(id, { status: 'cancelled', error: 'Abgebrochen', speed: 0 }); delete _activeXHR[id]; };
    xhr.send();
}

function _updateDl(id, patch) {
    const list = getDownloads();
    const idx  = list.findIndex(d => d.id === id);
    if (idx !== -1) { Object.assign(list[idx], patch); saveDownloads(list); }
    renderDownloadsPage();
}

function cancelDownload(id) {
    if (_activeXHR[id]) _activeXHR[id].abort();
    else _updateDl(id, { status: 'cancelled', error: 'Abgebrochen' });
}

function removeDownload(id) {
    saveDownloads(getDownloads().filter(d => d.id !== id));
    renderDownloadsPage();
}

function renderDownloadsPage() {
    const downloadsPage = document.getElementById('downloadsPage');
    if (!downloadsPage || downloadsPage.style.display === 'none') return;

    const all       = getDownloads();
    const active    = all.filter(d => d.status === 'active');
    const completed = all.filter(d => d.status !== 'active');

    const activeCount    = document.getElementById('dlActiveCount');
    const completedCount = document.getElementById('dlCompletedCount');
    if (activeCount)    activeCount.textContent    = active.length;
    if (completedCount) completedCount.textContent = completed.length;

    const activeList  = document.getElementById('dlActiveList');
    const activeEmpty = document.getElementById('dlActiveEmpty');
    if (activeList) {
        if (active.length === 0) {
            activeList.innerHTML = '';
            if (activeEmpty) activeEmpty.style.display = 'flex';
        } else {
            if (activeEmpty) activeEmpty.style.display = 'none';
            activeList.innerHTML = active.map(d => _dlCardHtml(d)).join('');
            activeList.querySelectorAll('.dl-cancel-btn').forEach(btn => {
                btn.addEventListener('click', () => cancelDownload(btn.dataset.id));
            });
        }
    }

    const completedList  = document.getElementById('dlCompletedList');
    const completedEmpty = document.getElementById('dlCompletedEmpty');
    if (completedList) {
        if (completed.length === 0) {
            completedList.innerHTML = '';
            if (completedEmpty) completedEmpty.style.display = 'flex';
        } else {
            if (completedEmpty) completedEmpty.style.display = 'none';
            completedList.innerHTML = completed.map(d => _dlCardHtml(d)).join('');
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
                    if (entry?.objectUrl) {
                        const a = document.createElement('a');
                        a.href = entry.objectUrl;
                        a.download = entry.filename;
                        a.click();
                    }
                });
            });
        }
    }

    if (active.length > 0) {
        clearTimeout(renderDownloadsPage._timer);
        renderDownloadsPage._timer = setTimeout(renderDownloadsPage, 800);
    }
}

function _dlCardHtml(d) {
    const isActive    = d.status === 'active';
    const isError     = d.status === 'error' || d.status === 'cancelled';
    const isCompleted = d.status === 'completed';
    const pct         = d.progress >= 0 ? d.progress : 0;
    const bytesStr    = d.bytesTotal > 0
        ? `${formatBytes(d.bytesLoaded)} / ${formatBytes(d.bytesTotal)}`
        : (d.bytesLoaded > 0 ? formatBytes(d.bytesLoaded) : '');
    const speedStr    = (isActive && d.speed > 0) ? `${formatBytes(d.speed)}/s` : '';
    const metaDetails = [bytesStr, speedStr].filter(Boolean).join(' • ');

    const statusIcon = isCompleted
        ? '<i class="fas fa-check-circle" style="color:#22c55e"></i>'
        : isError
            ? '<i class="fas fa-exclamation-circle" style="color:#ef4444"></i>'
            : '<i class="fas fa-spinner fa-spin" style="color:var(--primary-color)"></i>';

    const statusText = isCompleted ? 'Abgeschlossen' : isError ? (d.error || 'Fehler') : (pct >= 0 ? `${pct}%` : 'Lädt…');

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
            ${isActive ? `<div class="dl-progress-track"><div class="dl-progress-bar" style="width:${pct}%"></div></div>` : ''}
        </div>
        <div class="dl-card-actions">${actionBtns}</div>
    </div>`;
}

function initDownloadsPage() {
    document.querySelectorAll('.dl-tab').forEach(tab => {
        if (tab._dlTabBound) return;
        tab._dlTabBound = true;
        tab.addEventListener('click', () => {
            document.querySelectorAll('.dl-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            const activePanel    = document.getElementById('dlActivePanel');
            const completedPanel = document.getElementById('dlCompletedPanel');
            if (activePanel)    activePanel.style.display    = target === 'active' ? 'block' : 'none';
            if (completedPanel) completedPanel.style.display = target === 'completed' ? 'block' : 'none';
        });
    });

    const clearBtn = document.getElementById('clearCompletedBtn');
    if (clearBtn && !clearBtn._dlBound) {
        clearBtn._dlBound = true;
        clearBtn.addEventListener('click', () => {
            saveDownloads(getDownloads().filter(d => d.status === 'active'));
            renderDownloadsPage();
        });
    }

    const openFolderBtn = document.getElementById('openDownloadFolderBtn');
    if (openFolderBtn && !openFolderBtn._dlBound) {
        openFolderBtn._dlBound = true;
        openFolderBtn.addEventListener('click', () => {
            if (window.electronAPI?.openDownloadsFolder) window.electronAPI.openDownloadsFolder();
            else showNotification('Ordner-Öffnen ist nur in der Electron-App verfügbar.', 'info');
        });
    }
}

console.log('[pages.js] loaded');

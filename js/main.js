/**
 * ============================================================================
 * StreamHub — Einstiegspunkt, Events & App-Initialisierung (js/main.js)
 * ============================================================================
 * Steuert den App-Start nach DOMContentLoaded:
 *  - Quota-Prüfung & Thumbnail-Cache-Bereinigung bei knappem Speicher
 *  - DOM-Referenzen füllen & Themes anwenden
 *  - Player-WakeLock, Fortschrittsspeicherung & Back-Handler (Android)
 *  - Verknüpfung sämtlicher UI-Event-Listener (mit Touch-Scroll-Schutz)
 *
 * Abhängigkeiten: alle vorherigen Module (config.js bis ui-controls.js)
 */

'use strict';

// ── Nativer Android-Back-Handler ─────────────────────────────────────────────

/**
 * Informiert MainActivity.java darüber, ob beim Zurück-Wischen ein offenes
 * Modal/Unterseite abgefangen werden muss (true) oder die System-Zurück-Geste
 * aktiv sein darf (false).
 */
function syncNativeBackHandler() {
    if (!window.AndroidNativeTheme) return;
    try {
        const vm = document.getElementById('videoModal');
        const hs = document.getElementById('hamburgerSidebar');
        const fs = document.getElementById('filterSidebar');
        const im = document.getElementById('infoModal');
        const pm = document.getElementById('profileModal');
        const np = document.getElementById('newPlaylistModal');
        const so = document.getElementById('shortcutOverlay');
        const ctxMenu = document.querySelector('.card-context-menu');

        const isModalVisible = el => el && getComputedStyle(el).display !== 'none';
        const pageIds = [
            'seriesDetailPage', 'localFolderDetailPage', 'historyPage',
            'livePage', 'localPage', 'settingsPage', 'watchlistPage',
            'watchLaterPage', 'playlistsPage', 'playlistDetailPage',
            'statsPage', 'abosPage', 'downloadsPage'
        ];
        const anySubPageOpen = pageIds.some(id => {
            const el = document.getElementById(id);
            return el && el.style.display === 'block';
        });

        const needsHandler = Boolean(
            (vm && vm.classList.contains('active') && !vm.classList.contains('modal-minimized')) ||
            (hs && hs.classList.contains('active')) ||
            (fs && fs.classList.contains('active')) ||
            (im && im.classList.contains('active')) ||
            isModalVisible(pm) ||
            isModalVisible(np) ||
            isModalVisible(so) ||
            ctxMenu ||
            anySubPageOpen
        );

        window.AndroidNativeTheme.setBackHandlerEnabled(needsHandler);
    } catch (e) {
        console.warn('[Main] syncNativeBackHandler error:', e);
    }
}
if (typeof window !== 'undefined') window._syncNativeBackHandler = syncNativeBackHandler;

// ── Wisch-zum-Schließen für Sidebars ─────────────────────────────────────────

function _setupSwipeToDismiss(containerEl, contentEl, closeCallback) {
    if (!containerEl || !contentEl) return;
    let startY = 0, currentY = 0, isDragging = false;

    contentEl.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || (contentEl.scrollTop && contentEl.scrollTop > 5)) return;
        startY = e.touches[0].clientY;
        isDragging = true;
    }, { passive: true });

    contentEl.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const diffY = currentY - startY;
        if (diffY > 0 && (!contentEl.scrollTop || contentEl.scrollTop <= 0)) {
            contentEl.style.transform = `translateY(${diffY * 0.6}px)`;
            contentEl.style.transition = 'none';
        }
    }, { passive: true });

    contentEl.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const diffY = currentY - startY;
        contentEl.style.transition = 'transform 0.3s cubic-bezier(0.2,0.8,0.2,1)';
        if (diffY > 90) {
            contentEl.style.transform = 'translateY(100%)';
            setTimeout(() => { contentEl.style.transform = ''; closeCallback(); }, 250);
        } else {
            contentEl.style.transform = '';
        }
        startY = 0; currentY = 0;
    });
}

// ── Event-Listener verdrahten ─────────────────────────────────────────────────

function attachEventListeners() {
    // Suche
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = searchInput.value.trim();
                if (val) performSearch(val);
                else {
                    currentQuery = ''; currentCategory = ''; currentResults = [];
                    loadDefaultContent();
                }
            }
        });

        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!searchInput.value.trim()) {
                const dropdown = document.getElementById('searchHistoryDropdown');
                if (dropdown && dropdown.style.display === 'block') hideSearchHistoryDropdown();
                else showSearchHistoryDropdown();
            }
        });

        searchInput.addEventListener('input', () => {
            if (!searchInput.value.trim()) {
                showSearchHistoryDropdown();
                if (currentQuery || (sectionTitle?.textContent?.includes('Ergebnisse'))) {
                    currentQuery = ''; currentCategory = ''; currentResults = [];
                    loadDefaultContent();
                }
            } else {
                hideSearchHistoryDropdown();
            }
        });

        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('searchHistoryDropdown');
            if (dropdown && searchInput && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                hideSearchHistoryDropdown();
            }
        });
    }

    // Kategorie-Leiste oben
    document.querySelectorAll('.nav-categories a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-categories a').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');

            const category = e.currentTarget.dataset.category;
            const page     = e.currentTarget.dataset.page;

            if (page) {
                navigateToPage(page);
            } else if (category === 'home') {
                if (searchInput) searchInput.value = '';
                currentQuery = ''; currentCategory = ''; currentResults = [];
                navigateToPage('home');
                loadDefaultContent();
            } else if (category) {
                previousPage = currentPage;
                currentPage  = 'home';
                if (searchInput) searchInput.value = category;
                performSearch(category);
            }
        });
    });

    // Suchlupe klickbar
    const searchIcon = document.querySelector('.search-box .fa-search');
    if (searchIcon) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener('click', () => {
            const val = searchInput ? searchInput.value.trim() : '';
            if (val) performSearch(val);
        });
    }

    // Logo-Klick (mit bindSafeTap gegen Versehentliches Tippen beim Scrollen)
    const logoEl = document.querySelector('.logo');
    if (logoEl) {
        const goHome = () => {
            if (searchInput) searchInput.value = '';
            currentQuery = ''; currentCategory = ''; currentResults = [];
            document.querySelectorAll('.nav-categories a').forEach(l => l.classList.remove('active'));
            const startTab = document.querySelector('.nav-categories a[data-category="home"]');
            if (startTab) startTab.classList.add('active');
            navigateToPage('home');
            loadDefaultContent();
        };
        if (typeof bindSafeTap === 'function') {
            bindSafeTap(logoEl, goHome, { preventDefault: true });
        } else {
            logoEl.addEventListener('click', goHome);
        }
    }

    // Filter-Sidebar
    if (filterToggle) {
        filterToggle.addEventListener('click', () => {
            if (filterSidebar) {
                filterSidebar.classList.add('active');
                if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
                if (sidebarBackdrop)  sidebarBackdrop.classList.add('active');
                syncNativeBackHandler();
            }
        });
    }
    if (closeFilter) {
        closeFilter.addEventListener('click', () => {
            if (filterSidebar)   filterSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    }
    if (applyFilter) {
        applyFilter.addEventListener('click', () => {
            applyFilters();
            if (filterSidebar)   filterSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    }
    if (resetFilter) {
        resetFilter.addEventListener('click', () => {
            const chEl  = document.getElementById('channelFilter');
            const gEl   = document.getElementById('genreFilter');
            const dEl   = document.getElementById('durationFilter');
            const sEl   = document.getElementById('sortFilter');
            if (chEl) chEl.value = '';
            if (gEl)  gEl.value  = '';
            if (dEl)  dEl.value  = '0';
            if (sEl)  sEl.value  = 'date';
            document.querySelectorAll('.cust-select').forEach(cs => {
                const firstOpt = cs.querySelector('.cust-opt');
                const span     = cs.querySelector('.cust-select-trigger span');
                if (firstOpt && span) span.textContent = firstOpt.textContent;
                cs.querySelectorAll('.cust-opt').forEach(o => o.classList.remove('selected'));
                if (firstOpt) firstOpt.classList.add('selected');
            });
            applyFilters();
        });
    }

    initCustSelects();

    // Schnell-Abo aus der Filter-Sidebar
    const quickSubscribeBtn = document.getElementById('quickSubscribeBtn');
    if (quickSubscribeBtn) {
        quickSubscribeBtn.addEventListener('click', () => {
            const channelInput = document.getElementById('channelFilter');
            const term = (channelInput?.value.trim()) || (searchInput?.value.trim()) || '';
            if (!term) {
                showNotification('Bitte zuerst einen Kanal oder Suchbegriff eingeben.', 'warning');
                return;
            }
            addAbo(term);
            if (filterSidebar)   filterSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    }

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => {
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (filterSidebar)    filterSidebar.classList.remove('active');
            sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    }

    if (loadMore) loadMore.addEventListener('click', displayMoreResults);

    // Hamburger-Menü
    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', () => {
            if (hamburgerSidebar) {
                hamburgerSidebar.classList.add('active');
                if (filterSidebar)   filterSidebar.classList.remove('active');
                if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
                syncNativeBackHandler();
            }
        });
    }
    if (closeHamburger) {
        closeHamburger.addEventListener('click', () => {
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop)  sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    }

    document.querySelectorAll('.hamburger-item[data-page]').forEach(item => {
        if (item._hamburgBound) return;
        item._hamburgBound = true;
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            if (!page) return;
            navigateToPage(page);
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop)  sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    });

    // Verlauf & Suche im Verlauf
    if (showAllHistory) showAllHistory.addEventListener('click', () => navigateToPage('history'));

    if (clearHistory) {
        clearHistory.addEventListener('click', () => {
            _showConfirmDialog(
                'Verlauf löschen?',
                'Möchtest du den gesamten Verlauf wirklich löschen?',
                () => {
                    localStorage.removeItem(getProfileKey('recentlyWatched'));
                    historySelectionState.active = false;
                    historySelectionState.selectedKeys.clear();
                    if (recentlyWatched) recentlyWatched.style.display = 'none';
                    loadFullHistoryPage();
                    loadRecentlyWatched();
                },
                'Löschen',
                true
            );
        });
    }

    const searchHistoryEl = document.getElementById('searchHistory');
    if (searchHistoryEl) {
        searchHistoryEl.addEventListener('input', (e) => filterHistoryPage(e.target.value));
    }

    // Video-Modal Buttons
    if (closeModal) closeModal.addEventListener('click', closeVideoModal);
    if (videoModal) {
        const backdrop = videoModal.querySelector('.modal-backdrop');
        if (backdrop) backdrop.addEventListener('click', closeVideoModal);
    }

    // Download-Button (inkl. Qualitätsauswahl)
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const title           = document.getElementById('videoTitle')?.textContent || 'video';
            const qualitySelector = document.getElementById('qualitySelector');
            if (!qualitySelector) return;
            const options = Array.from(qualitySelector.options);

            if (options.length <= 1) {
                const url = qualitySelector.value || (videoPlayer ? videoPlayer.src : '');
                if (!url) { showNotification('Keine Video-URL verfügbar.', 'warning'); return; }
                startDownload(url, title);
                showNotification(`⬇️ Download gestartet: „${title}"`, 'success', {
                    text: 'Zu Downloads', callback: () => navigateToPage('downloads')
                });
                return;
            }

            const existingMenu = document.getElementById('downloadQualityMenu');
            if (existingMenu) { existingMenu.remove(); return; }

            const menu = document.createElement('div');
            menu.id = 'downloadQualityMenu';
            menu.style.cssText = `position:absolute;bottom:${downloadBtn.offsetHeight + 10}px;left:50%;transform:translateX(-50%);background:rgba(18,18,24,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:6px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:4px;z-index:10000;min-width:150px;`;

            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.style.cssText = 'background:transparent;border:none;color:#f8fafc;padding:8px 12px;text-align:left;font-size:0.85rem;border-radius:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background 0.2s;';
                btn.onmouseover = () => { btn.style.background = 'rgba(255,255,255,0.08)'; };
                btn.onmouseout  = () => { btn.style.background = 'transparent'; };
                btn.innerHTML   = `<span>${opt.textContent}</span> <i class="fas fa-download" style="opacity:0.6;font-size:0.8rem;"></i>`;
                btn.addEventListener('click', () => {
                    startDownload(opt.value, title);
                    showNotification(`⬇️ Download gestartet (${opt.textContent}): „${title}"`, 'success', {
                        text: 'Zu Downloads', callback: () => navigateToPage('downloads')
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
                const closeHandler = (ev) => {
                    if (!menu.contains(ev.target) && ev.target !== downloadBtn) {
                        menu.remove();
                        document.removeEventListener('click', closeHandler);
                        parent.style.position = originalPos;
                    }
                };
                setTimeout(() => document.addEventListener('click', closeHandler), 10);
            }
        });
    }

    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) shareBtn.addEventListener('click', shareVideo);

    const pipBtn = document.getElementById('pipBtn');
    if (pipBtn) {
        pipBtn.addEventListener('click', async () => {
            try {
                if (window.AndroidNativeTheme?.enterPip) {
                    window.AndroidNativeTheme.enterPip();
                } else if (videoPlayer) {
                    if (document.pictureInPictureElement) await document.exitPictureInPicture();
                    else await videoPlayer.requestPictureInPicture();
                }
            } catch (err) { console.error('[Main] PiP Error:', err); }
        });
    }

    // Trailer-Button
    const trailerBtn             = document.getElementById('trailerBtn');
    const closeTrailerBtn        = document.getElementById('closeTrailerBtn');
    const trailerPlayerContainer = document.getElementById('trailerPlayerContainer');
    const trailerPlayer          = document.getElementById('trailerPlayer');

    if (trailerBtn) {
        trailerBtn.addEventListener('click', async () => {
            if (!window.currentPlayingVideo) return;
            if (videoPlayer) videoPlayer.pause();
            trailerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suche...';
            trailerBtn.disabled  = true;

            try {
                const vid = window.currentPlayingVideo;
                const searchTitle = (vid.topic?.trim() && vid.topic.trim() !== vid.title.trim()) ? vid.topic.trim() : vid.title;
                let trailerUrl = await fetchTrailerUrl(searchTitle, vid.channel);

                if ((!trailerUrl || trailerUrl === 'youtube_search') && window.electronAPI?.searchYoutubeTrailer) {
                    const cleanTitle = _cleanTitleForTmdb(searchTitle) || searchTitle.trim();
                    const directUrl  = await window.electronAPI.searchYoutubeTrailer(`${cleanTitle} Trailer Deutsch`);
                    if (directUrl) trailerUrl = directUrl;
                }

                if (trailerUrl && trailerUrl !== 'youtube_search') {
                    if (trailerPlayer) trailerPlayer.src = trailerUrl;
                    if (trailerPlayerContainer) trailerPlayerContainer.style.display = 'block';
                } else {
                    const cleanTitle = _cleanTitleForTmdb(searchTitle) || searchTitle.trim();
                    const ytUrl      = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanTitle + ' Trailer Deutsch')}`;
                    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(ytUrl);
                    else window.open(ytUrl, '_blank');
                }
            } catch {
                showNotification('Fehler beim Laden des Trailers.', 'error');
            } finally {
                trailerBtn.innerHTML = '<i class="fas fa-film"></i> Trailer';
                trailerBtn.disabled  = false;
            }
        });
    }

    if (closeTrailerBtn) {
        closeTrailerBtn.addEventListener('click', () => {
            if (trailerPlayerContainer) trailerPlayerContainer.style.display = 'none';
            if (trailerPlayer) trailerPlayer.src = '';
            if (videoPlayer?.paused) videoPlayer.play().catch(() => {});
        });
    }

    // ── Zurück-Aktion inkl. Double-Back-to-Exit (Android) ─────────────────────
    let _backToExitPending = false;
    let _backToExitTimer   = null;

    const handleSingleBackAction = () => {
        const vm = document.getElementById('videoModal');
        const hs = document.getElementById('hamburgerSidebar');
        const fs = document.getElementById('filterSidebar');
        const sb = document.getElementById('sidebarBackdrop');
        const im = document.getElementById('infoModal');
        const pm = document.getElementById('profileModal');
        const so = document.getElementById('shortcutOverlay');

        if (so && so.style.display !== 'none') {
            so.style.display = 'none';
            syncNativeBackHandler();
            return true;
        }
        if (vm && vm.classList.contains('active') && !vm.classList.contains('modal-minimized')) {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            } else if (vm.classList.contains('is-landscape-fullscreen')) {
                _manualExitLandscapeFs = true;
                vm.classList.remove('is-landscape-fullscreen');
                if (typeof _refreshVideoCompositor === 'function') _refreshVideoCompositor();
            } else {
                closeVideoModal();
            }
            syncNativeBackHandler();
            return true;
        }
        if (pm && getComputedStyle(pm).display !== 'none') {
            closeProfileModal(); syncNativeBackHandler(); return true;
        }
        if (hs && hs.classList.contains('active')) {
            hs.classList.remove('active'); if (sb) sb.classList.remove('active'); syncNativeBackHandler(); return true;
        }
        if (fs && fs.classList.contains('active')) {
            fs.classList.remove('active'); if (sb) sb.classList.remove('active'); syncNativeBackHandler(); return true;
        }
        if (im && im.classList.contains('active')) {
            im.classList.remove('active'); syncNativeBackHandler(); return true;
        }

        if (document.getElementById('seriesDetailPage')?.style.display === 'block') {
            navigateToPage('home'); syncNativeBackHandler(); return true;
        }
        if (document.getElementById('localFolderDetailPage')?.style.display === 'block') {
            navigateToPage('local'); syncNativeBackHandler(); return true;
        }
        if (document.getElementById('playlistDetailPage')?.style.display === 'block') {
            navigateToPage('playlists'); syncNativeBackHandler(); return true;
        }

        const newPlModal = document.getElementById('newPlaylistModal');
        if (newPlModal && getComputedStyle(newPlModal).display !== 'none') {
            newPlModal.style.display = 'none';
            newPlModal.classList.remove('active');
            syncNativeBackHandler();
            return true;
        }

        if (document.querySelector('.card-context-menu')) {
            document.querySelectorAll('.card-context-menu, .modal-backdrop-ctx').forEach(el => el.remove());
            syncNativeBackHandler();
            return true;
        }

        const subPageIds = ['historyPage', 'livePage', 'localPage', 'settingsPage', 'watchlistPage', 'watchLaterPage', 'playlistsPage', 'statsPage', 'abosPage', 'downloadsPage'];
        if (subPageIds.some(id => document.getElementById(id)?.style.display === 'block')) {
            navigateToPage('home'); syncNativeBackHandler(); return true;
        }
        return false;
    };

    window._handleBackAction = function handleBackActionWithExit() {
        const handled = handleSingleBackAction();
        if (!handled && window.AndroidNativeTheme) {
            if (_backToExitPending) {
                clearTimeout(_backToExitTimer);
                _backToExitPending = false;
                try {
                    if (typeof window.AndroidNativeTheme.finishApp === 'function') window.AndroidNativeTheme.finishApp();
                    else if (typeof window.AndroidNativeTheme.exitApp === 'function') window.AndroidNativeTheme.exitApp();
                } catch {}
            } else {
                _backToExitPending = true;
                showNotification('Nochmal drücken zum Beenden', 'info');
                _backToExitTimer = setTimeout(() => { _backToExitPending = false; }, 2000);
            }
        }
        return handled;
    };

    // Focus-Ring nach Klick kurz entfernen
    document.addEventListener('click', (e) => {
        const btn = e.target.closest?.('button, input[type="button"], input[type="submit"]');
        if (btn) setTimeout(() => { if (document.activeElement === btn) btn.blur(); }, 50);
    }, true);

    // MutationObserver für automatische Android Back-Handler-Synchronisation
    const _backObserver = new MutationObserver(() => syncNativeBackHandler());
    ['videoModal', 'hamburgerSidebar', 'filterSidebar', 'infoModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) _backObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    ['profileModal', 'newPlaylistModal', 'historyPage', 'livePage', 'localPage', 'settingsPage',
     'watchlistPage', 'watchLaterPage', 'playlistsPage', 'playlistDetailPage', 'statsPage',
     'abosPage', 'downloadsPage', 'seriesDetailPage', 'localFolderDetailPage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) _backObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
    });
    setTimeout(syncNativeBackHandler, 800);

    // Footer & Über-StreamHub Links
    const infoLinks = { aboutLink: 'about', faqLink: 'faq', imprintLink: 'imprint', privacyLink: 'privacy', termsLink: 'terms' };
    Object.entries(infoLinks).forEach(([id, type]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => { e.preventDefault(); showInfoModal(type); });
    });

    const settingsAboutBtn     = document.getElementById('settingsAboutBtn');
    const settingsPrivacyBtn   = document.getElementById('settingsPrivacyBtn');
    const settingsShortcutsBtn = document.getElementById('settingsShortcutsBtn');
    const settingsGithubBtn    = document.getElementById('settingsGithubBtn');
    if (settingsAboutBtn)     settingsAboutBtn.addEventListener('click', () => showInfoModal('about'));
    if (settingsPrivacyBtn)   settingsPrivacyBtn.addEventListener('click', () => showInfoModal('privacy'));
    if (settingsShortcutsBtn) settingsShortcutsBtn.addEventListener('click', () => {
        const so = document.getElementById('shortcutOverlay');
        if (so) so.style.display = 'flex';
    });
    if (settingsGithubBtn) settingsGithubBtn.addEventListener('click', () => {
        const url = 'https://github.com/brawllaunchchannel22/streamhub';
        if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
        else if (window.AndroidNativeTheme?.openUrl) window.AndroidNativeTheme.openUrl(url);
        else window.open(url, '_blank');
    });

    const closeInfoModal = document.getElementById('closeInfoModal');
    if (closeInfoModal) {
        closeInfoModal.addEventListener('click', () => {
            const im = document.getElementById('infoModal');
            if (im) im.classList.remove('active');
        });
    }

    // Lokale Videos Buttons
    const addLocalFolder    = document.getElementById('addLocalFolder');
    const scanLocalFolders  = document.getElementById('scanLocalFolders');
    const manageLocalFolders = document.getElementById('manageLocalFolders');
    const backToLocalFolders = document.getElementById('backToLocalFolders');

    if (addLocalFolder)     addLocalFolder.addEventListener('click', addLocalFolderDialog);
    if (scanLocalFolders)   scanLocalFolders.addEventListener('click', scanLocalVideos);
    if (manageLocalFolders) manageLocalFolders.addEventListener('click', () => navigateToPage('local'));
    if (backToLocalFolders) {
        backToLocalFolders.addEventListener('click', () => {
            window._haptic?.tick?.();
            const dp = document.getElementById('localFolderDetailPage');
            const lp = document.getElementById('localPage');
            if (dp) dp.style.display = 'none';
            if (lp) { lp.style.display = 'block'; lp.scrollTop = 0; }
        });
    }

    // Settings-Toggles
    const settingRealThumbnails = document.getElementById('settingRealThumbnails');
    const realThumbnailsToggle  = document.getElementById('realThumbnailsToggle');
    if (settingRealThumbnails) {
        settingRealThumbnails.addEventListener('change', (e) => {
            useRealThumbnails = e.target.checked;
            saveSettings();
            if (realThumbnailsToggle) realThumbnailsToggle.checked = useRealThumbnails;
        });
    }
    if (realThumbnailsToggle) {
        realThumbnailsToggle.addEventListener('change', (e) => {
            useRealThumbnails = e.target.checked;
            saveSettings();
            if (settingRealThumbnails) settingRealThumbnails.checked = useRealThumbnails;
        });
    }

    const clearWatchlistBtn = document.getElementById('clearWatchlistBtn');
    if (clearWatchlistBtn) clearWatchlistBtn.addEventListener('click', clearWatchlist);

    const clearCache = document.getElementById('clearCache');
    if (clearCache) {
        clearCache.addEventListener('click', () => {
            _showConfirmDialog(
                'Cache leeren?',
                'Möchtest du den Thumbnail-Cache wirklich leeren?',
                () => {
                    thumbnailCache = {};
                    localStorage.removeItem('thumbnailCache');
                    _clearThumbnailCache();
                    if (typeof _clearSeriesCache === 'function') _clearSeriesCache();
                    showNotification('Cache wurde geleert!', 'success');
                },
                'Leeren',
                true
            );
        });
    }
}


// ── App-Initialisierung ───────────────────────────────────────────────────────

function init() {
    try {
        // Versionsbadges synchronisieren
        document.querySelectorAll('[data-app-version]').forEach(el => {
            el.textContent = `v${APP_VERSION}`;
        });

        const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
        applyTheme(savedTheme);

        // DOM-Referenzen zuweisen (Variablen liegen in js/state.js)
        searchInput      = document.getElementById('searchInput');
        videoGrid        = document.getElementById('videoGrid');
        loadingState     = document.getElementById('loadingState');
        emptyState       = document.getElementById('emptyState');
        sectionTitle     = document.getElementById('sectionTitle');
        resultsCount     = document.getElementById('resultsCount');
        loadMore         = document.getElementById('loadMore');
        videoModal       = document.getElementById('videoModal');
        videoPlayer      = document.getElementById('videoPlayer');
        closeModal       = document.getElementById('closeModal');
        hamburgerMenu    = document.getElementById('hamburgerMenu');
        closeHamburger   = document.getElementById('closeHamburger');
        hamburgerSidebar = document.getElementById('hamburgerSidebar');
        filterToggle     = document.getElementById('filterToggle');
        filterSidebar    = document.getElementById('filterSidebar');
        closeFilter      = document.getElementById('closeFilter');
        applyFilter      = document.getElementById('applyFilter');
        resetFilter      = document.getElementById('resetFilter');
        recentlyWatched  = document.getElementById('recentlyWatched');
        recentGrid       = document.getElementById('recentGrid');
        clearHistory     = document.getElementById('clearHistory');
        showAllHistory   = document.getElementById('showAllHistory');
        sidebarBackdrop  = document.getElementById('sidebarBackdrop');

        if (filterSidebar) {
            _setupSwipeToDismiss(filterSidebar, filterSidebar, () => {
                filterSidebar.classList.remove('active');
                if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
                syncNativeBackHandler();
            });
        }
        if (hamburgerSidebar) {
            _setupSwipeToDismiss(hamburgerSidebar, hamburgerSidebar, () => {
                hamburgerSidebar.classList.remove('active');
                if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
                syncNativeBackHandler();
            });
        }

        // Haptik, Profile & UI-Komfort initialisieren
        initHaptics();
        initProfileSystem();
        initPlayerOverlays();
        initOrientationAndFullscreen();
        initMiniplayer();
        setupHoldFor2x();
        initGridZoom();
        initPullToRefresh();
        initPredictiveBackSwipe();
        initSortButtons();
        initKeyboardShortcuts();

        // WakeLock & Video-Fortschritt an Player hängen
        let wakeLock = null;
        const requestWakeLock = async () => {
            try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }
            catch {}
        };
        const releaseWakeLock = () => {
            if (wakeLock !== null) {
                wakeLock.release().then(() => { wakeLock = null; }).catch(() => { wakeLock = null; });
            }
        };
        window._releaseWakeLock = releaseWakeLock;

        if (videoPlayer) {
            videoPlayer.addEventListener('keydown', (e) => {
                if (e.code === 'Space' || e.key === ' ') {
                    e.preventDefault(); e.stopPropagation();
                    if (e.repeat) return;
                    videoPlayer.paused ? videoPlayer.play().catch(() => {}) : videoPlayer.pause();
                }
            }, true);

            videoPlayer.addEventListener('play', () => {
                document.title = '[PLAYING] StreamHub';
                requestWakeLock();
            });
            videoPlayer.addEventListener('pause', () => {
                document.title = 'StreamHub';
                releaseWakeLock();
            });
            videoPlayer.addEventListener('ended', () => {
                document.title = 'StreamHub';
                releaseWakeLock();
                if (window.currentPlayingVideo) {
                    const key = getVideoProgressKey(window.currentPlayingVideo);
                    if (key) removeVideoProgress(key);
                }
            });
            videoPlayer.addEventListener('emptied', () => {
                document.title = 'StreamHub';
                releaseWakeLock();
            });
            videoPlayer.addEventListener('timeupdate', () => {
                if (window.currentPlayingVideo && videoPlayer.duration) {
                    const currentTime = videoPlayer.currentTime;
                    const duration    = videoPlayer.duration;
                    const key         = getVideoProgressKey(window.currentPlayingVideo);
                    const now         = Date.now();
                    if (key && currentTime > 5 && currentTime < duration - 15) {
                        if (now - _progressSaveTimer >= 10000) {
                            _progressSaveTimer = now;
                            saveVideoProgress(key, currentTime, duration);
                        }
                    } else if (key && currentTime >= duration - 15) {
                        removeVideoProgress(key);
                    }
                }
            });
        }

        // Settings, Lokale Ordner, Event-Listener & Startseiten-Inhalte laden
        loadSettings();
        loadLocalFolders();
        attachEventListeners();
        loadRecentlyWatched();
        renderSearchChips();
        loadDefaultContent();

        setTimeout(() => syncAllSelects(), 350);
        setTimeout(() => checkAbosForNewContent(), 3000);
    } catch (error) {
        console.error('[Main] Init error:', error);
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            localStorage.setItem('__quota_test__', '1');
            localStorage.removeItem('__quota_test__');
        } catch {
            console.warn('[Storage] localStorage voll beim Start — räume Thumbnail-Cache auf...');
            _clearThumbnailCache();
        }
        init();
    });
}

console.log('[main.js] loaded');

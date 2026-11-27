/**
 * ============================================================================
 * StreamHub — Video-Player, Rotation/Fullscreen-Fix & Vorschläge (js/player.js)
 * ============================================================================
 * Verantwortlich für:
 *  - Video-Modal öffnen/schließen & Quellen laden (MP4 + HLS via hls.js)
 *  - Android Rotations- & Black-Screen-Fix (_onAndroidOrientationChange +
 *    _refreshVideoCompositor + CSS-Querformat-Vollbild .is-landscape-fullscreen)
 *  - Kompakte Video-Vorschläge ("Ähnliche Videos") inkl. Kinderfilter & Thumbnails
 *  - Miniplayer, Android PiP Bounds, Seek-/Volume-Overlays & Hold-for-2x
 *
 * Abhängigkeiten: config.js, state.js, utils.js, storage.js, thumbnails.js, cards.js
 */

'use strict';

// Zustand für manuelles Beenden des Querformat-CSS-Vollbilds (wird bei Hochformat zurückgesetzt)
let _manualExitLandscapeFs = false;
// Verhindert Doppelauslösung identischer Orientierungen (Java 150 ms + JS 180 ms),
// ohne echte schnelle Drehungen (Hoch <-> Quer) zu verschlucken.
let _lastOrientCallTs = 0;
let _lastOrientState = null;

// ── Android Compositor & Rotations-Schutz (Black-Screen Fix) ──────────────────

/**
 * Stößt ein leichtes Layout-/GPU-Repaint auf dem <video>-Element an.
 * Nötig unter Android WebView, damit der Hardware-Video-Surface nach
 * Orientierungswechseln oder Fullscreen-Übergängen sauber neu gezeichnet wird
 * und nicht bei laufendem Ton schwarz bleibt.
 */
function _refreshVideoCompositor() {
    const vp = document.getElementById('videoPlayer');
    if (!vp) return;
    try {
        const prevTransform = vp.style.transform || '';
        const prevOpacity = vp.style.opacity || '';
        const prevWillChange = vp.style.willChange || '';
        const raf = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (fn) => setTimeout(fn, 16);

        // Leichtes Subpixel-Translate + Opacity-Impuls erzwingen echte Viz-Neukomposition
        // inklusive SurfaceView-Hole-Punch-Aktualisierung im Android WebView.
        vp.style.willChange = 'transform, opacity';
        vp.style.transform = 'translateZ(0) scale(0.9999)';
        vp.style.opacity = '0.998';
        void vp.offsetHeight; // Reflow erzwingen

        raf(() => {
            vp.style.transform = prevTransform;
            vp.style.opacity = prevOpacity;
            vp.style.willChange = prevWillChange;
        });
    } catch (_) {}
}
if (typeof window !== 'undefined') window._refreshVideoCompositor = _refreshVideoCompositor;

/**
 * Prüft zuverlässig, ob gerade ein Video aktiv ist (auch bei HLS / MediaSource,
 * wo `video.src` leer sein kann und nur `currentSrc` oder `hlsInstance` gesetzt ist).
 */
function _hasActiveVideoStream(vp) {
    if (!vp) return false;
    return Boolean(vp.currentSrc || vp.src || hlsInstance || window.currentPlayingVideo);
}

/**
 * Einheitliche Handler-Funktion für Orientierungswechsel (Android Java Callback & WebView).
 * Verwendet im Mobil-Querformat einen stabilen CSS-Vollbildmodus (#videoModal.is-landscape-fullscreen),
 * statt während der Drehung `requestFullscreen()` auszulösen (was unter Android Capacitor
 * die Video-Fläche zerstört und zu schwarzem Bild bei laufendem Ton führt).
 *
 * @param {boolean} isLandscape
 */
function _onAndroidOrientationChange(isLandscape) {
    const targetLandscape = Boolean(isLandscape);
    const now = Date.now();
    // Nur doppelte Meldungen für *dieselbe* Orientierung innerhalb 350 ms ignorieren;
    // ein echter Wechsel (true <-> false) wird immer sofort verarbeitet.
    if (_lastOrientState === targetLandscape && (now - _lastOrientCallTs) < 350) return;
    _lastOrientCallTs = now;
    _lastOrientState = targetLandscape;

    const vm = document.getElementById('videoModal');
    const vp = document.getElementById('videoPlayer');

    if (!targetLandscape) {
        _manualExitLandscapeFs = false;
    }

    if (!vm || !vm.classList.contains('active') || vm.classList.contains('modal-minimized') || !_hasActiveVideoStream(vp)) {
        if (vm) vm.classList.remove('is-landscape-fullscreen');
        return;
    }

    const trailerContainer = document.getElementById('trailerPlayerContainer');
    const isTrailerOpen = trailerContainer && trailerContainer.style.display !== 'none';

    if (targetLandscape && !isTrailerOpen && !_manualExitLandscapeFs) {
        vm.classList.add('is-landscape-fullscreen');
    } else {
        vm.classList.remove('is-landscape-fullscreen');
    }

    // Falls zuvor natives Fullscreen aktiv war und ins Hochformat zurückgedreht wurde, sauber beenden
    if (!targetLandscape && typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    // WebView Video-Layer gestaffelt neu zeichnen (sofort + 160 ms + 350 ms Sicherheitsnetz)
    const raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 16);
    raf(() => _refreshVideoCompositor());
    setTimeout(() => {
        _refreshVideoCompositor();
        if (typeof window !== 'undefined' && typeof window._updateAndroidPipBounds === 'function') {
            window._updateAndroidPipBounds();
        }
    }, 160);
    setTimeout(() => _refreshVideoCompositor(), 350);
}
if (typeof window !== 'undefined') window._onAndroidOrientationChange = _onAndroidOrientationChange;

// ── Video öffnen, laden & schließen ───────────────────────────────────────────

/** Öffnet den Video-Player für ein Video-Item inkl. Metadaten, Qualität & Fortsetzen */
function playVideo(item) {
    try {
        const videoUrl = item.url_video_hd || item.url_video || item.url_video_low;
        window.currentPlayingVideo = item;
        window._currentPlayingItem = item;
        _manualExitLandscapeFs = false;
        document.title = '[PLAYING] ' + (item.title || 'StreamHub');

        if (videoPlayer) {
            videoPlayer.playsInline = true;
            videoPlayer.setAttribute('playsinline', '');
        }

        if (videoModal) {
            videoModal.classList.remove('modal-minimized');
            videoModal.classList.add('active');
            // Falls das Handy beim Öffnen bereits im Querformat liegt, CSS-Vollbild direkt anwenden
            const isMobileLandscape = typeof window !== 'undefined' &&
                window.innerWidth > window.innerHeight &&
                window.innerHeight <= 580;
            videoModal.classList.toggle('is-landscape-fullscreen', isMobileLandscape);
        }

        try {
            if (window.AndroidNativeTheme?.updatePipAutoEnter) window.AndroidNativeTheme.updatePipAutoEnter(true);
        } catch (e) {}
        if (window._syncNativeBackHandler) window._syncNativeBackHandler();
        setTimeout(() => { if (typeof window._updateAndroidPipBounds === 'function') window._updateAndroidPipBounds(); }, 250);
        setTimeout(() => { if (typeof window._reinitHoldZone2x === 'function') window._reinitHoldZone2x(); }, 80);

        const descEl = document.getElementById('videoDescription');
        if (!videoUrl) {
            console.warn('[playVideo] Video-URL nicht verfügbar');
            if (descEl) descEl.textContent = 'Hinweis: Für diesen Inhalt ist aktuell kein direkter Video-Stream verfügbar.';
        }

        // Metadaten setzen
        const titleEl    = document.getElementById('videoTitle');
        const channelEl  = document.getElementById('videoChannel');
        const durationEl = document.getElementById('videoDuration');
        const dateEl     = document.getElementById('videoDate');

        if (titleEl)    titleEl.textContent = cleanEpisodeTitle(item.title);
        if (channelEl) {
            channelEl.textContent = item.channel;
            const colors = senderColors[item.channel];
            channelEl.style.background = colors ? colors[0] : '';
        }
        if (durationEl) durationEl.textContent = `${Math.round(item.duration / 60)} Min`;
        if (dateEl)     dateEl.textContent = formatDate(new Date(item.timestamp * 1000));

        // ── Sternebewertung + TMDB-Bewertung ─────────────────────────────────
        const ratingEl = document.getElementById('videoRating');
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
                    star.style.cssText = `color:${i <= current ? '#eab308' : '#64748b'};font-size:1rem;transition:color 0.15s;`;
                    star.dataset.val = i;
                    star.addEventListener('mouseenter', () => renderStars(i));
                    star.addEventListener('mouseleave', () => renderStars(parseInt(localStorage.getItem(ratingKey) || '0', 10)));
                    star.addEventListener('click', () => {
                        localStorage.setItem(ratingKey, i);
                        renderStars(i);
                    });
                    ratingEl.appendChild(star);
                }
                const lbl = document.createElement('span');
                lbl.style.cssText = 'font-size:0.75rem;color:#94a3b8;margin-left:4px;';
                lbl.textContent = current > 0 ? current + '/5' : 'Bewerten';
                ratingEl.appendChild(lbl);
            };
            renderStars(savedRating);

            const apiKey = localStorage.getItem('tmdbApiKey') || '';
            const seriesTitle = (item.topic && item.topic.trim() && item.topic.trim() !== (item.title || '').trim())
                ? item.topic.trim()
                : null;
            const episodeTitle = _cleanTitleForTmdb(item.title) || (item.title || '').trim();

            const renderBadge = (vote_average, title, typeLabel) => {
                if (!ratingEl) return;
                const tmdbBadge = document.createElement('span');
                tmdbBadge.style.cssText = 'font-size:0.75rem;color:#94a3b8;margin-left:8px;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;cursor:default;display:inline-flex;align-items:center;gap:4px;';
                const numStars = Math.round(vote_average / 2);
                let starsHtml = '';
                for (let s = 0; s < 5; s++) {
                    starsHtml += s < numStars
                        ? '<i class="fas fa-star" style="color:#f59e0b;font-size:0.7rem;"></i>'
                        : '<i class="far fa-star" style="color:#475569;font-size:0.7rem;"></i>';
                }
                tmdbBadge.innerHTML = `<span>${starsHtml}</span> <span>${vote_average.toFixed(1)}/10 (${typeLabel})</span>`;
                tmdbBadge.title = `TMDb (${typeLabel}): ${title}`;
                ratingEl.appendChild(tmdbBadge);
            };

            if (!navigator.onLine) {
                const cached = localStorage.getItem(`tmdb_cache_${episodeTitle.toLowerCase()}`);
                if (cached) {
                    try {
                        const c = JSON.parse(cached);
                        renderBadge(c.vote_average, c.title, c.typeLabel || 'Cached');
                    } catch {}
                } else {
                    const offBadge = document.createElement('span');
                    offBadge.style.cssText = 'font-size:0.75rem;color:#94a3b8;margin-left:8px;opacity:0.7;';
                    offBadge.innerHTML = `<i class="fas fa-wifi" style="margin-right:3px;"></i>Bewertung offline`;
                    ratingEl.appendChild(offBadge);
                }
            } else if (apiKey && apiKey !== 'YOUR_API_KEY_HERE' && item.title && !item.isLocal) {
                const epCacheKey = `tmdb_cache_${episodeTitle.toLowerCase()}`;
                const cachedEp = localStorage.getItem(epCacheKey);
                if (cachedEp) {
                    try {
                        const c = JSON.parse(cachedEp);
                        renderBadge(c.vote_average, c.title, c.typeLabel || 'Folge');
                    } catch {}
                } else {
                    fetch(`${TMDB_BASE_URL}/search/multi?api_key=${apiKey}&language=de-DE&query=${encodeURIComponent(episodeTitle)}`)
                        .then(res => res.json())
                        .then(data => {
                            const match = (data.results || []).find(r => r.vote_average > 0);
                            if (match) {
                                renderBadge(match.vote_average, match.title || match.name, 'Folge');
                                localStorage.setItem(epCacheKey, JSON.stringify({ vote_average: match.vote_average, title: match.title || match.name, typeLabel: 'Folge' }));
                            } else if (seriesTitle) {
                                const serCacheKey = `tmdb_cache_${seriesTitle.toLowerCase()}`;
                                fetch(`${TMDB_BASE_URL}/search/multi?api_key=${apiKey}&language=de-DE&query=${encodeURIComponent(seriesTitle)}`)
                                    .then(res => res.json())
                                    .then(sData => {
                                        const sMatch = (sData.results || []).find(r => r.vote_average > 0);
                                        if (sMatch) {
                                            renderBadge(sMatch.vote_average, sMatch.name || sMatch.title, 'Serie');
                                            localStorage.setItem(serCacheKey, JSON.stringify({ vote_average: sMatch.vote_average, title: sMatch.name || sMatch.title, typeLabel: 'Serie' }));
                                        }
                                    })
                                    .catch(() => {});
                            }
                        })
                        .catch(err => console.warn('TMDb live rating error:', err));
                }
            }
        }

        // Beschreibung mit "Mehr anzeigen"
        const description = item.description || item.topic || 'Keine Beschreibung';
        if (descEl && videoUrl) {
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

        window.currentVideoUrl = videoUrl;
        window.currentVideoTitle = item.title;

        // "Zur Serie" Button & Topic-Badge
        const seriesTopic    = (item.topic && item.topic.trim()) || '';
        const topicBadge     = document.getElementById('videoTopicBadge');
        const topicName      = document.getElementById('videoTopicName');
        const modalSeriesBtn = document.getElementById('modalSeriesBtn');

        if (seriesTopic && seriesTopic.toLowerCase() !== (item.title || '').toLowerCase()) {
            if (topicBadge && topicName) {
                topicName.textContent = seriesTopic;
                topicBadge.style.display = 'inline-flex';
                topicBadge.onclick = () => { closeVideoModal(); openSeriesDetail(seriesTopic, [item]); };
            }
            if (modalSeriesBtn) {
                modalSeriesBtn.style.display = 'inline-flex';
                modalSeriesBtn.onclick = () => { closeVideoModal(); openSeriesDetail(seriesTopic, [item]); };
            }
        } else {
            if (topicBadge) topicBadge.style.display = 'none';
            if (modalSeriesBtn) modalSeriesBtn.style.display = 'none';
        }

        // Trailer-Button
        const trailerBtn = document.getElementById('trailerBtn');
        if (trailerBtn) {
            trailerBtn.style.display = (item.title && !item.isLocal) ? 'inline-flex' : 'none';
        }

        // Abonnieren-Button
        const subscribeBtn = document.getElementById('subscribeBtn');
        if (subscribeBtn) {
            const subTerm = (item.topic && item.topic.trim()) ? item.topic.trim() : item.title;
            const updateSubBtn = () => {
                const isSubbed = getAbos().some(a => a.term.toLowerCase() === subTerm.toLowerCase());
                subscribeBtn.innerHTML = isSubbed ? '<i class="fas fa-bell-slash"></i> Abonniert' : '<i class="fas fa-bell"></i> Abonnieren';
                subscribeBtn.classList.toggle('btn-subscribed', isSubbed);
            };
            updateSubBtn();
            subscribeBtn.onclick = () => {
                const abos = getAbos();
                const idx = abos.findIndex(a => a.term.toLowerCase() === subTerm.toLowerCase());
                if (idx >= 0) abos.splice(idx, 1);
                else abos.push({ term: subTerm, addedAt: Date.now() });
                saveAbos(abos);
                updateSubBtn();
            };
        }

        // Merkliste / Später-Buttons im Modal
        const modalWLBtn = document.getElementById('modalWatchlistBtn');
        if (modalWLBtn) {
            const syncWLBtn = () => {
                const active = isInWatchlist(item);
                modalWLBtn.classList.toggle('action-btn-active', active);
                modalWLBtn.innerHTML = active ? '<i class="fas fa-heart"></i> Gemerkt' : '<i class="fas fa-heart"></i> Merkliste';
            };
            syncWLBtn();
            modalWLBtn.onclick = () => { toggleWatchlist(item, null); syncWLBtn(); };
        }

        const modalWLaterBtn = document.getElementById('modalWatchLaterBtn');
        if (modalWLaterBtn) {
            const syncWLaterBtn = () => {
                const active = isInWatchLater(item);
                modalWLaterBtn.classList.toggle('action-btn-active', active);
                modalWLaterBtn.innerHTML = `<i class="${active ? 'fas fa-clock' : 'far fa-clock'}"></i> ${active ? 'Gespeichert' : 'Später'}`;
            };
            syncWLaterBtn();
            modalWLaterBtn.onclick = () => { toggleWatchLater(item, null); syncWLaterBtn(); };
        }

        // Qualitäts-Auswahl
        const qualitySelector = document.getElementById('qualitySelector');
        if (qualitySelector) {
            qualitySelector.innerHTML = '';
            const qualities = [];
            if (item.url_video_hd)  qualities.push({ label: 'HD',      url: item.url_video_hd });
            if (item.url_video)     qualities.push({ label: 'Normal',  url: item.url_video });
            if (item.url_video_low) qualities.push({ label: 'Niedrig', url: item.url_video_low });

            qualities.forEach((q, idx) => {
                const option = document.createElement('option');
                option.value = q.url;
                option.textContent = q.label;
                if (idx === 0) option.selected = true;
                qualitySelector.appendChild(option);
            });

            qualitySelector.onchange = (e) => loadVideoSource(e.target.value, videoPlayer ? videoPlayer.currentTime : 0);
            if (typeof syncCustomSelect === 'function') syncCustomSelect(qualitySelector);
        }

        // Tempo-Auswahl
        const speedSelector = document.getElementById('speedSelector');
        if (speedSelector) {
            speedSelector.value = '1.0';
            speedSelector.onchange = (e) => {
                const rate = parseFloat(e.target.value) || 1.0;
                if (videoPlayer) videoPlayer.playbackRate = rate;
            };
            if (typeof syncCustomSelect === 'function') syncCustomSelect(speedSelector);
        }

        // Untertitel-Auswahl
        const subtitleSelector          = document.getElementById('subtitleSelector');
        const subtitleSelectorContainer = document.getElementById('subtitleSelectorContainer');
        const subtitleTrack             = document.getElementById('subtitleTrack');

        if (subtitleTrack) {
            subtitleTrack.src = '';
            if (videoPlayer?.textTracks) {
                Array.from(videoPlayer.textTracks).forEach(t => { t.mode = 'disabled'; });
            }
        }

        if (subtitleSelector && subtitleSelectorContainer) {
            subtitleSelector.innerHTML = '<option value="off" selected>Aus</option>';
            if (item.url_subtitle) {
                subtitleSelectorContainer.style.display = 'flex';
                const opt = document.createElement('option');
                opt.value = item.url_subtitle;
                opt.textContent = 'Deutsch';
                subtitleSelector.appendChild(opt);
                if (subtitleTrack) subtitleTrack.src = item.url_subtitle;
                subtitleSelector.disabled = false;
            } else {
                subtitleSelectorContainer.style.display = 'none';
            }

            subtitleSelector.onchange = (e) => {
                if (!subtitleTrack) return;
                const enableSub = () => {
                    if (videoPlayer?.textTracks?.length > 0) {
                        const track = videoPlayer.textTracks[0];
                        if (e.target.value === 'off') {
                            track.mode = 'disabled';
                        } else {
                            subtitleTrack.src = e.target.value;
                            track.mode = 'showing';
                        }
                    }
                };
                enableSub();
                setTimeout(enableSub, 100);
                setTimeout(enableSub, 500);
            };
            if (typeof syncCustomSelect === 'function') syncCustomSelect(subtitleSelector);
        }

        // Wiedergabe-Fortschritt fortsetzen
        let resumeTime = 0;
        const progressKey = getVideoProgressKey(item);
        const progress = progressKey ? getVideoProgress(progressKey) : null;
        if (progress && progress.currentTime > 5) {
            resumeTime = progress.currentTime;
            setTimeout(() => {
                const container = document.querySelector('.video-player-container');
                if (!container) return;
                const toast = document.createElement('div');
                toast.className = 'resume-toast';
                toast.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(9,9,11,0.85);color:#f8fafc;padding:8px 16px;border-radius:20px;font-size:0.85rem;font-weight:500;border:1px solid var(--primary-color);z-index:10000;pointer-events:none;opacity:1;transition:opacity 0.5s ease;';
                const min = Math.floor(resumeTime / 60);
                const sec = Math.floor(resumeTime % 60).toString().padStart(2, '0');
                toast.textContent = `Wiedergabe bei ${min}:${sec} fortgesetzt`;
                container.appendChild(toast);
                setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 2500);
            }, 800);
        }

        // Scrollposition des Modals bei Videowechsel zurücksetzen & VOD-Buttons einblenden
        ['videoModal', '.video-modal-body', '.video-details'].forEach(sel => {
            const el = sel.startsWith('.') ? document.querySelector(sel) : document.getElementById(sel);
            if (el) el.scrollTop = 0;
        });
        ['modalWatchlistBtn', 'modalWatchLaterBtn', 'subscribeBtn', 'downloadBtn', 'shareBtn'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.style.display = '';
        });
        const qBox = document.getElementById('qualitySelector')?.closest('.quality-selector-container');
        if (qBox) qBox.style.display = '';

        if (videoUrl) loadVideoSource(videoUrl, resumeTime);

        if (videoModal) videoModal.classList.add('active');
        saveToRecentlyWatched(item);

        // Ähnliche Videos laden (sofern kein lokales Video)
        if (!item.isLocal) {
            loadSimilarVideos(item.topic, item.channel || item.sender, videoUrl || '', item.title || '');
        } else {
            const simSec = document.getElementById('similarVideosSection');
            if (simSec) simSec.style.display = 'none';
        }
    } catch (error) {
        console.error('[playVideo] Error:', error);
    }
}

/** Lädt einen Stream oder eine MP4-Datei in das <video>-Element (inkl. Resume-Seek) */
function loadVideoSource(videoUrl, resumeTime = 0) {
    try {
        if (!videoPlayer || !videoUrl) return;
        videoPlayer.playsInline = true;

        if (resumeTime > 0) {
            let seeked = false;
            const performSeek = () => {
                if (seeked) return;
                try {
                    videoPlayer.currentTime = resumeTime;
                    seeked = true;
                } catch (err) {
                    console.warn('[Resume] Seek failed:', err);
                }
            };

            videoPlayer.addEventListener('loadedmetadata', performSeek, { once: true });
            videoPlayer.addEventListener('canplay', performSeek, { once: true });

            const onPlaying = () => {
                if (!seeked) performSeek();
                else if (Math.abs(videoPlayer.currentTime - resumeTime) > 3) {
                    try { videoPlayer.currentTime = resumeTime; } catch (_) {}
                }
                videoPlayer.removeEventListener('playing', onPlaying);
            };
            videoPlayer.addEventListener('playing', onPlaying);
            if (videoPlayer.readyState >= 1) performSeek();
        }

        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }

        if (videoUrl.includes('.m3u8') && typeof Hls !== 'undefined') {
            if (Hls.isSupported()) {
                hlsInstance = new Hls();
                hlsInstance.loadSource(videoUrl);
                hlsInstance.attachMedia(videoPlayer);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    videoPlayer.play().catch(err => console.warn('Play failed:', err));
                });
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                videoPlayer.src = videoUrl;
                videoPlayer.play().catch(err => console.warn('Play failed:', err));
            }
        } else {
            videoPlayer.src = videoUrl;
            videoPlayer.play().catch(err => console.warn('Play failed:', err));
        }
    } catch (error) {
        console.error('[loadVideoSource] Error:', error);
    }
}

/** Schließt das Video-Modal und gibt Streams/WakeLock/Fullscreen frei */
function closeVideoModal() {
    try {
        if (window._releaseWakeLock) window._releaseWakeLock();
        _manualExitLandscapeFs = false;

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        if (videoModal) {
            videoModal.classList.remove('active', 'modal-minimized', 'modal-restoring', 'is-landscape-fullscreen');
        }
        try {
            if (window.AndroidNativeTheme?.updatePipAutoEnter) window.AndroidNativeTheme.updatePipAutoEnter(false);
        } catch (e) {}

        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.src = '';
        }
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }

        const trailerPlayerContainer = document.getElementById('trailerPlayerContainer');
        const trailerPlayer = document.getElementById('trailerPlayer');
        if (trailerPlayerContainer) trailerPlayerContainer.style.display = 'none';
        if (trailerPlayer) trailerPlayer.src = '';

        const simSection = document.getElementById('similarVideosSection');
        if (simSection) simSection.style.display = 'none';

        document.body.focus();
        if (window._syncNativeBackHandler) window._syncNativeBackHandler();
    } catch (error) {
        console.error('[closeVideoModal] Error:', error);
    }
}
if (typeof window !== 'undefined') window.closeVideoModal = closeVideoModal;

/** Klappt lange Sendungsbeschreibungen im Video-Modal ein/aus */
if (typeof window !== 'undefined') {
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
}

/** Teilt das aktuell geöffnete Video über native Share Sheet oder Clipboard */
async function shareVideo() {
    const url = window.currentVideoUrl || (videoPlayer ? videoPlayer.src : '');
    const title = window.currentVideoTitle || document.getElementById('videoTitle')?.textContent || 'Video';

    if (navigator.share) {
        try {
            await navigator.share({ title, text: `Schau dir "${title}" an!`, url });
        } catch (err) {
            if (err.name !== 'AbortError') copyToClipboard(url);
        }
    } else {
        copyToClipboard(url);
    }
}

// ── Kompakte Video-Vorschläge ("Ähnliche Videos") ─────────────────────────────

/**
 * Erzeugt eine kompakte Vorschlags-Karte (.similar-card) mit Sender-Farbverlauf,
 * echtem Frame-Thumbnail, Dauer-Badge und sauberem 2-Zeilen-Titel.
 *
 * @param {Object} video
 * @param {number} index
 * @returns {HTMLElement}
 */
function createSimilarCard(video, index = 0) {
    const card = document.createElement('div');
    card.className = 'similar-card';

    const ch       = video.channel || video.sender || '';
    const gradient = typeof getChannelGradient === 'function' ? getChannelGradient(ch) : 'linear-gradient(135deg,#374151,#4b5563)';
    const dur      = video.duration ? formatDuration(video.duration) : '';
    const dateText = video.timestamp ? formatDate(new Date(video.timestamp * 1000)) : '';
    const thumbId  = `sim_thumb_${++thumbIdCounter}`;

    // Fortschritt aus dem Verlauf/ProgressMap abrufen
    let progressPct = 0;
    let isWatched   = false;
    try {
        const pKey = typeof getVideoProgressKey === 'function' ? getVideoProgressKey(video) : null;
        const pd   = (pKey && typeof getVideoProgress === 'function') ? getVideoProgress(pKey) : null;
        if (pd && pd.duration > 0) {
            progressPct = Math.min(100, Math.round((pd.currentTime / pd.duration) * 100));
            isWatched   = progressPct >= 85;
        }
    } catch (_) {}

    card.innerHTML = `
        <div class="similar-thumb" id="${thumbId}" style="background: ${gradient};">
            ${ch ? `<span class="sender-logo thumb-overlay-logo">${ch}</span>` : ''}
            <div class="similar-play-badge"><i class="fas fa-play"></i></div>
            ${dur ? `<span class="duration-badge">${dur}</span>` : ''}
            ${isWatched ? `<span class="sim-watched-badge" title="Bereits gesehen"><i class="fas fa-check"></i></span>` : ''}
            ${progressPct > 0 && !isWatched ? `<div class="sim-progress-bar" style="--sim-pct:${progressPct}%"></div>` : ''}
        </div>
        <div class="similar-info">
            <div class="similar-video-title${isWatched ? ' sim-title-watched' : ''}">${cleanEpisodeTitle(video.title || 'Unbekannt')}</div>
            <div class="similar-video-meta">
                ${ch ? `<span class="channel-badge">${ch}</span>` : ''}
                ${dateText ? `<span>${dateText}</span>` : ''}
                ${progressPct > 0 && !isWatched ? `<span class="sim-pct-label">${progressPct}%</span>` : ''}
            </div>
        </div>
    `;

    // Touch-Scroll-Schutz beim Scrollen durch Vorschläge
    const openSuggestion = () => playVideo(video);
    if (typeof bindSafeTap === 'function') {
        bindSafeTap(card, openSuggestion, { preventDefault: false });
    } else {
        card.addEventListener('click', openSuggestion);
    }

    // Echtes Video-Thumbnail zeitversetzt nachladen
    const videoUrl = video.url_video_low || video.url_video;
    if (videoUrl && typeof queueRealThumbnail === 'function') {
        const ck = simpleHash('sim_' + videoUrl);
        setTimeout(() => {
            const el = document.getElementById(thumbId);
            if (el) queueRealThumbnail(videoUrl, ck, el, gradient);
        }, 120 + index * 90);
    }

    return card;
}


/**
 * Lädt passende Video-Vorschläge zum aktuellen Video (Topic-Suche + Fallback),
 * entfernt Duplikate, wendet den Kinderprofil-Filter an und rendert kompakte .similar-card Elemente.
 * @param {string} topic       - Topic des aktuellen Videos (für Suche und Filter)
 * @param {string} sender      - Sender des aktuellen Videos (Fallback-Suche)
 * @param {string} excludeUrl  - URL-Schlüssel des aktuellen Videos (wird aus Ergebnissen entfernt)
 * @param {string} excludeTitle - Titel des aktuellen Videos (verhindert identische Folge unter anderem Sender)
 */
async function loadSimilarVideos(topic, sender, excludeUrl, excludeTitle) {
    const section = document.getElementById('similarVideosSection');
    const grid    = document.getElementById('similarVideosGrid');
    const countEl = document.getElementById('similarVideosCount');
    if (!section || !grid) return;

    const query = (topic || '').trim() || (sender || '').trim();
    if (!query) {
        section.style.display = 'none';
        return;
    }

    // Normalisierter Ausschluss-Titel für Titel-basierte Duplikat-Erkennung
    const excludeTitleNorm = (excludeTitle || '').toLowerCase().replace(/\s+/g, ' ').trim();

    try {
        const fetchCandidates = async (searchQuery) => {
            const body = JSON.stringify({
                queries: [{ fields: ['topic', 'title'], query: searchQuery }],
                future: false,
                offset: 0,
                size: 20,
                sortBy: 'timestamp',
                sortOrder: 'desc'
            });
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body
            });
            if (!res.ok) return [];
            const data = await res.json();
            return data.result?.results || [];
        };

        let raw = await fetchCandidates(query);

        // Falls das exakte Topic zu wenig Ergebnisse liefert, zusätzlich nach erstem Schlüsselwort/Sender suchen
        if (raw.length < 4 && sender && query !== sender) {
            const more = await fetchCandidates(sender);
            raw = [...raw, ...more];
        }

        // Kinderprofil-Schutz auf Vorschläge anwenden
        if (typeof filterKidsSafe === 'function') {
            raw = filterKidsSafe(raw);
        }

        // Aktuelles Video ausschließen & Duplikate anhand Progress-Key entfernen
        const normalizedTopic  = (topic  || '').toLowerCase().trim();
        const normalizedSender = (sender || '').toLowerCase().trim();
        const seen = new Set();
        const results = [];
        for (const v of raw) {
            const vUrl = v.url_video_hd || v.url_video || v.url || '';
            if (!vUrl || vUrl === excludeUrl) continue;

            // Barrierefreiheits-Varianten (AD + Gebärdensprache) ausschließen
            if (typeof isAccessibleVariant === 'function' && isAccessibleVariant(v)) continue;
            else if (typeof isAudioDescription === 'function' && isAudioDescription(v)) continue;

            // Gleiche Episode unter anderem Sender / URL ausschließen (Titel-Vergleich)
            if (excludeTitleNorm) {
                const vTitleNorm = (v.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
                if (vTitleNorm === excludeTitleNorm) continue;
            }

            const key = getVideoProgressKey(v);
            if (!key || seen.has(key)) continue;
            seen.add(key);

            // Relevanz-Score: exaktes Topic-Match (3), Teil-Topic (2), Sender-Match (1)
            const vTopic  = (v.topic  || '').toLowerCase();
            const vSender = (v.channel || v.sender || '').toLowerCase();
            let score = 0;
            if (normalizedTopic  && vTopic === normalizedTopic)                      score = 3;
            else if (normalizedTopic  && vTopic.includes(normalizedTopic))           score = 2;
            else if (normalizedSender && vSender.includes(normalizedSender))         score = 1;
            v._simScore = score;

            results.push(v);
        }

        // Absteigend nach Relevanz sortieren, innerhalb gleicher Scores nach Datum
        results.sort((a, b) => (b._simScore - a._simScore) || ((b.timestamp || 0) - (a.timestamp || 0)));
        const topResults = results.slice(0, 6);

        if (!topResults.length) {
            section.style.display = 'none';
            return;
        }

        grid.innerHTML = '';
        topResults.forEach((video, idx) => grid.appendChild(createSimilarCard(video, idx)));

        if (countEl) countEl.textContent = `${topResults.length} Videos`;
        section.style.display = 'block';
    } catch (e) {
        console.warn('[SimilarVideos] Load failed:', e);
        section.style.display = 'none';
    }
}

// ── Fullscreen, Landscape-Rotation, Miniplayer, Hold-2x, Overlays, PiP ────────

/** Initialisiert Overlays für Seek (+10s/-10s) und Lautstärke (über Popover Top-Layer) */
function initPlayerOverlays() {
    if (typeof window === 'undefined') return;
    let _seekOverlayTimer = null;
    let _volOverlayTimer  = null;

    window._showSeekOverlay = function(seconds) {
        const overlay = document.getElementById('_seekOverlay');
        if (!overlay) return;
        const icon = seconds < 0 ? '◄◄' : '►►';
        overlay.textContent = `${icon} ${seconds < 0 ? seconds : '+' + seconds}s`;
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
        if (typeof overlay.showPopover === 'function') {
            try { overlay.showPopover(); } catch {}
        }
        clearTimeout(_seekOverlayTimer);
        _seekOverlayTimer = setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
                if (typeof overlay.hidePopover === 'function') {
                    try { overlay.hidePopover(); } catch {}
                }
            }, 280);
        }, 900);
    };

    window._showVolumeOverlay = function(vol) {
        const overlay = document.getElementById('_volumeOverlay');
        if (!overlay) return;
        const pct = Math.round(vol * 100);
        const icon = vol === 0 ? '🔇' : vol < 0.5 ? '🔉' : '🔊';
        overlay.textContent = `${icon} ${pct}%`;
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
        if (typeof overlay.showPopover === 'function') {
            try { overlay.showPopover(); } catch {}
        }
        clearTimeout(_volOverlayTimer);
        _volOverlayTimer = setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
                if (typeof overlay.hidePopover === 'function') {
                    try { overlay.hidePopover(); } catch {}
                }
            }, 280);
        }, 1000);
    };
}

function _showSeekOverlay(seconds) {
    if (window._showSeekOverlay) window._showSeekOverlay(seconds);
}

/** Berechnet und meldet die Video-Position für nahtlose Android PiP-Übergänge */
if (typeof window !== 'undefined') {
    window._updateAndroidPipBounds = function() {
        if (!window.AndroidNativeTheme?.updatePipSourceRect) return;
        const vp = document.getElementById('videoPlayer');
        if (!vp) return;
        const r = vp.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        try {
            window.AndroidNativeTheme.updatePipSourceRect(
                Math.round(r.left * dpr),
                Math.round(r.top * dpr),
                Math.round(r.right * dpr),
                Math.round(r.bottom * dpr),
                vp.videoWidth || 16,
                vp.videoHeight || 9
            );
        } catch {}
    };
}

/**
 * Initialisiert Vollbild-Toggle (Desktop & Android-Buttons) sowie sichere
 * Orientierungswechsel ohne Black-Screen-Bug.
 */
function initOrientationAndFullscreen() {
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const exitLandscapeBtn = document.getElementById('landscapeExitFsBtn');

    const _blurAll = () => {
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
    };

    const isAndroid = /android/i.test(navigator.userAgent) ||
        typeof Capacitor !== 'undefined' ||
        Boolean(window.AndroidNativeTheme);

    function toggleFullscreen() {
        const vm = document.getElementById('videoModal');
        const vp = document.getElementById('videoPlayer');

        // Auf mobilen Geräten im Querformat zuerst sauberen CSS-Vollbildmodus schalten
        if (isAndroid && vm && vm.classList.contains('is-landscape-fullscreen')) {
            _manualExitLandscapeFs = true;
            vm.classList.remove('is-landscape-fullscreen');
            _refreshVideoCompositor();
            _blurAll();
            return;
        }

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else if (isAndroid && window.innerWidth <= 920 && vm) {
            // Unter Android WebView schaltet der Vollbild-Button direkt den CSS-Vollbildmodus,
            // damit das Video-Surface nicht über onShowCustomView vom WebView gelöst wird.
            _manualExitLandscapeFs = false;
            vm.classList.add('is-landscape-fullscreen');
            _refreshVideoCompositor();
        } else if (vp) {
            if (vp.requestFullscreen) vp.requestFullscreen().catch(err => console.warn('FS error:', err));
            else if (vp.webkitRequestFullscreen) vp.webkitRequestFullscreen();
        }
        _blurAll();
    }
    if (typeof window !== 'undefined') window.toggleFullscreen = toggleFullscreen;

    if (exitLandscapeBtn) {
        const exitFn = (e) => {
            if (e) e.stopPropagation();
            _manualExitLandscapeFs = true;
            const vm = document.getElementById('videoModal');
            if (vm) vm.classList.remove('is-landscape-fullscreen');
            _refreshVideoCompositor();
        };
        if (typeof bindSafeTap === 'function') {
            bindSafeTap(exitLandscapeBtn, exitFn, { stopPropagation: true });
        } else {
            exitLandscapeBtn.addEventListener('click', exitFn);
        }
    }

    document.addEventListener('fullscreenchange', () => {
        const isFs = !!document.fullscreenElement;
        if (fullscreenBtn) {
            fullscreenBtn.innerHTML = isFs
                ? '<i class="fas fa-compress"></i> Vollbild'
                : '<i class="fas fa-expand"></i> Vollbild';
        }
        _refreshVideoCompositor();
        _blurAll();
        setTimeout(_blurAll, 50);
    });

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => toggleFullscreen());
        fullscreenBtn.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault(); e.stopPropagation();
                if (videoPlayer) {
                    videoPlayer.paused ? videoPlayer.play().catch(() => {}) : videoPlayer.pause();
                }
                _blurAll();
                return;
            }
            if (e.key === 'f' || e.key === 'F' || e.key === 'Enter') {
                e.preventDefault(); e.stopPropagation();
                toggleFullscreen();
            }
        });
    }

    // Browser-seitiger Orientierungswechsel (Backup, falls kein nativer Android-Callback feuert)
    let _orientTimer = null;
    const detectLandscape = () => {
        if (window.screen?.orientation?.type) {
            return window.screen.orientation.type.includes('landscape');
        }
        if (typeof window.orientation === 'number') {
            return Math.abs(window.orientation) === 90;
        }
        return window.innerWidth > window.innerHeight && window.innerHeight <= 580;
    };

    const handleOrientationEvent = () => {
        clearTimeout(_orientTimer);
        // 180 ms > Java-Delay (150 ms): Java feuert zuerst; state-basierter Dedup in
        // _onAndroidOrientationChange ignoriert dann doppelte identische Meldungen.
        _orientTimer = setTimeout(() => {
            _onAndroidOrientationChange(detectLandscape());
        }, 180);
    };

    const orientationTarget = window.screen?.orientation || window;
    const evtName = window.screen?.orientation ? 'change' : 'orientationchange';
    if (orientationTarget && orientationTarget.addEventListener) {
        orientationTarget.addEventListener(evtName, handleOrientationEvent);
    }

    // Resize für PiP-Bounds & nachgelagerten Orientierungs-Abgleich bei langsamen Geräten
    let _resizeOrientTimer = null;
    window.addEventListener('resize', () => {
        if (typeof window._updateAndroidPipBounds === 'function') window._updateAndroidPipBounds();
        const vm = document.getElementById('videoModal');
        if (vm && vm.classList.contains('active') && !vm.classList.contains('modal-minimized')) {
            clearTimeout(_resizeOrientTimer);
            _resizeOrientTimer = setTimeout(() => {
                if (isAndroid || window.innerWidth <= 920) {
                    _onAndroidOrientationChange(detectLandscape());
                }
            }, 220);
        }
    });

    // Wenn App/Tab nach Hintergrund wieder sichtbar wird -> Video-Compositor auffrischen
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) _refreshVideoCompositor();
    });
}

/** Initialisiert den Miniplayer (Verkleinern / Wiederherstellen) */
function initMiniplayer() {
    const minimizeBtn    = document.getElementById('minimizeModal');
    const modal          = document.getElementById('videoModal');
    const miniRestoreBtn = document.getElementById('miniRestoreBtn');
    if (!modal || !minimizeBtn) return;

    minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        modal.classList.remove('is-landscape-fullscreen');
        modal.classList.add('modal-minimized');
        setTimeout(() => { if (typeof window._updateAndroidPipBounds === 'function') window._updateAndroidPipBounds(); }, 120);
    });

    const restoreModal = (e) => {
        e.stopPropagation();
        modal.classList.add('modal-restoring');
        modal.classList.remove('modal-minimized');
        setTimeout(() => {
            _refreshVideoCompositor();
            if (typeof window._updateAndroidPipBounds === 'function') window._updateAndroidPipBounds();
        }, 120);
        requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.remove('modal-restoring')));
    };

    if (miniRestoreBtn) miniRestoreBtn.addEventListener('click', restoreModal);

    const mc = modal.querySelector('.modal-content');
    if (mc) {
        mc.addEventListener('click', (e) => {
            if (!modal.classList.contains('modal-minimized')) return;
            if (e.target.closest('.modal-close, #miniRestoreBtn')) return;
            restoreModal(e);
        });
    }

    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement && modal.classList.contains('modal-minimized')) {
            modal.classList.remove('modal-minimized');
        }
    });
}

/** Gedrückt-halten im Player schaltet temporär auf 2× Wiedergabegeschwindigkeit */
function setupHoldFor2x() {
    if (document.getElementById('speed2xPill')) return;

    const pill = document.createElement('div');
    pill.id = 'speed2xPill';
    pill.innerHTML = '<i class="fas fa-forward"></i> 2×';
    pill.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%',
        'transform:translate(-50%,-50%) scale(0.7)',
        'background:rgba(0,0,0,0.85)', 'color:#fff',
        'font-size:22px', 'font-weight:700',
        'padding:12px 28px', 'border-radius:50px',
        'pointer-events:none', 'z-index:99999', 'opacity:0',
        'transition:opacity 0.18s ease, transform 0.18s ease',
        'display:flex', 'align-items:center', 'gap:10px'
    ].join(';');
    document.body.appendChild(pill);

    let holdTimer    = null;
    let wasHolding   = false;
    let previousRate = 1.0;
    let startX = 0, startY = 0;

    const showPill = () => { pill.style.opacity = '1'; pill.style.transform = 'translate(-50%,-50%) scale(1)'; };
    const hidePill = () => { pill.style.opacity = '0'; pill.style.transform = 'translate(-50%,-50%) scale(0.7)'; };

    function isOnVideoPlayer(target) {
        const modal   = document.getElementById('videoModal');
        const trailer = document.getElementById('trailerPlayerContainer');
        if (!modal || !modal.classList.contains('active')) return false;
        if (trailer && trailer.style.display !== 'none' && trailer.contains(target)) return false;
        const container = document.querySelector('.video-player-container');
        if (!container || (!container.contains(target) && target !== container)) return false;
        if (target.closest('button, .modal-close, .action-btn, .video-details')) return false;
        return true;
    }

    function startHold() {
        const vp = document.getElementById('videoPlayer');
        if (!vp || vp.paused) return;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            wasHolding = true;
            previousRate = vp.playbackRate || 1.0;
            vp.playbackRate = 2.0;
            const sel = document.getElementById('speedSelector');
            if (sel) { sel.value = '2.0'; if (window.syncCustomSelect) syncCustomSelect(sel); }
            showPill();
            if (window._haptic) window._haptic.heavy();
        }, 250);
    }

    function endHold() {
        clearTimeout(holdTimer);
        holdTimer = null;
        if (wasHolding) {
            wasHolding = false;
            const vp = document.getElementById('videoPlayer');
            if (vp) vp.playbackRate = previousRate;
            const sel = document.getElementById('speedSelector');
            if (sel) { sel.value = String(previousRate); if (window.syncCustomSelect) syncCustomSelect(sel); }
            hidePill();
            if (window._haptic) window._haptic.tick();
        }
    }

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || !isOnVideoPlayer(e.target)) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startHold();
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!holdTimer && !wasHolding) return;
        const t = e.touches[0];
        if (t && (Math.abs(t.clientX - startX) > 12 || Math.abs(t.clientY - startY) > 12)) {
            clearTimeout(holdTimer);
            holdTimer = null;
            if (wasHolding) endHold();
        }
    }, { passive: true });

    document.addEventListener('touchend',    () => { if (holdTimer || wasHolding) endHold(); }, { passive: true });
    document.addEventListener('touchcancel', () => { if (holdTimer || wasHolding) endHold(); }, { passive: true });

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !isOnVideoPlayer(e.target)) return;
        startHold();
    });
    document.addEventListener('mouseup', () => { if (holdTimer || wasHolding) endHold(); });

    if (typeof window !== 'undefined') window._reinitHoldZone2x = () => {};
}

console.log('[player.js] loaded');

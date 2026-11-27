/**
 * ============================================================================
 * StreamHub — API-Anfragen, Suche, Filter, TMDB & EPG (js/api.js)
 * ============================================================================
 * Kapselt alle externen Netzwerk-Abfragen:
 *  - MediathekViewWeb Such-API & Empfehlungen ("Für dich empfohlen")
 *  - Erweiterte Filter- & Sortierlogik
 *  - TMDB-Serien-/Episoden-Metadaten & Trailer-Suche
 *  - EPG ("Jetzt im TV") über xmltv.se
 *  - Abonnement-Benachrichtigungen auf neue Sendungen
 *
 * Abhängigkeiten: config.js, state.js, utils.js, storage.js, profiles.js
 */

'use strict';

// ── Empfehlungen & Personalisierte Startseite ───────────────────────────────

/** Lädt personalisierte bzw. Kinder-Empfehlungen auf der Startseite */
async function loadDefaultContent() {
    try {
        console.log('[API] loadDefaultContent()');
        currentPage = 'home';
        const isKids = getActiveProfile().isKids;
        if (sectionTitle) {
            const titleHtml = isKids
                ? '<i class="fas fa-child" style="color:#10b981;"></i> Für dich empfohlen (Kinder-Modus)'
                : '<i class="fas fa-fire"></i> Für dich empfohlen';
            sectionTitle.innerHTML = `${titleHtml} <button id="fypRefreshBtn" onclick="loadDefaultContent()" title="Aktualisieren" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;margin-left:8px;font-size:0.9rem;"><i class="fas fa-sync-alt"></i></button>`;
        }
        await loadRecommendations();
    } catch (error) {
        console.error('[API] loadDefaultContent error:', error);
    }
}

/** Erzeugt anhand der letzten 30 Verlaufs-Einträge einen passenden Suchbegriff */
function buildPersonalizedQuery() {
    try {
        const history = getRecentlyWatched();
        if (history.length < 3) return null;
        const recent = history.slice(0, 30);
        const skip = new Set([
            'der', 'die', 'das', 'ein', 'eine', 'und', 'mit', 'im', 'in', 'auf',
            'zu', 'von', 'an', 'am', 'ist', 'für', 'bei', 'wie', 'aus', 'was',
            'ich', 'du', 'wir', 'sie', 'es', 'er', 'aber', 'oder', 'nicht',
            'noch', 'auch', 'schon', 'mal', 'sehr', 'mehr', 'dem', 'den', 'des',
            'wird', 'nach', 'beim', 'über', 'alle', 'als', 'hat', 'war'
        ]);
        const freq = {};
        recent.forEach(item => {
            ((item.title || '') + ' ' + (item.topic || '')).toLowerCase()
                .split(/[\s,!?.\-:]+/)
                .forEach(w => {
                    w = w.replace(/[^a-züöäß]/g, '');
                    if (w.length > 4 && !skip.has(w)) freq[w] = (freq[w] || 0) + 1;
                });
        });
        const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
        if (topWords.length > 0) {
            return topWords[Math.floor(Math.random() * topWords.length)];
        }
        return null;
    } catch {
        return null;
    }
}

/** Lädt den Empfehlungs-Feed (Kinderprofil: KiKA-Katalog; Standard: Verlauf + Themen-Mix) */
async function loadRecommendations() {
    showLoading(true);
    try {
        currentCategory = '';
        const isKids = getActiveProfile().isKids;
        const allCategories = ['Dokumentation', 'Spielfilm', 'Tatort', 'Reportage', 'Krimi',
                               'Terra X', 'Comedy', 'Natur', 'Kultur', 'Geschichte', 'Wissen', 'Krimi'];

        let results = [];

        if (isKids) {
            // KiKA: zwei verschiedene Offsets parallel laden
            const offA = Math.floor(Math.random() * 5) * 30;
            const offB = offA + 30;
            const kidsPayload = (offset) => ({
                queries: [{ fields: ['channel'], query: 'KiKA' }],
                sortBy: 'timestamp', sortOrder: 'desc', future: true, offset, size: 100
            });
            const [resA, resB] = await Promise.all([
                fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(kidsPayload(offA)) }),
                fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(kidsPayload(offB)) })
            ]);
            const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
            results = [...(dataA.result?.results || []), ...(dataB.result?.results || [])];
            results = filterKidsSafe(results);
        } else {
            // Standard: personalisierte Anfrage + zufällige Kategorie parallel
            const personalQuery = buildPersonalizedQuery();
            const usedCats = new Set();
            const pickCat = () => {
                let cat;
                do { cat = allCategories[Math.floor(Math.random() * allCategories.length)]; } while (usedCats.has(cat));
                usedCats.add(cat);
                return cat;
            };
            const catA = (personalQuery && Math.random() > 0.3) ? personalQuery : pickCat();
            const catB = pickCat();

            const makePayload = (q, offset = 0) => ({
                queries: [{ fields: ['title', 'topic', 'description'], query: q }],
                sortBy: 'timestamp', sortOrder: 'desc', future: true, offset, size: 100
            });

            const [resA, resB] = await Promise.all([
                fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(makePayload(catA)) }),
                fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(makePayload(catB)) })
            ]);
            const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
            results = [...(dataA.result?.results || []), ...(dataB.result?.results || [])];
        }

        if (results.length > 0) {
            // Duplikate nach URL entfernen (beide Fetches können gleiche Items liefern)
            const seen = new Set();
            results = results.filter(item => {
                const key = item.url_video || `${item.title}_${item.timestamp}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Serien-Einträge mischen, damit nicht eine einzige Serie alles dominiert
            // Aber: max. 3 pro Topic in headList (vorher 2) → bessere Serien-Erkennung bei groupAllResults
            const topicCount = {};
            const headList = [];
            const tailList = [];
            results.forEach(item => {
                const t = (item.topic || item.title || '').trim().toLowerCase();
                topicCount[t] = (topicCount[t] || 0) + 1;
                if (topicCount[t] <= 3) headList.push(item);
                else tailList.push(item);
            });
            results = [...headList, ...tailList];

            currentResults = results;
            originalResults = [...currentResults];
            displayResults();
            return;
        }
    } catch (error) {
        console.warn('[API] Recommendations error:', error);
    } finally {
        showLoading(false);
    }

    const fallbackCategory = getActiveProfile().isKids ? 'KiKA' : 'Dokumentation';
    await performSearch(fallbackCategory);
}

// ── Hauptsuche & Filter ───────────────────────────────────────────────────────

/** Führt eine Mediathek-Suche aus und zeigt die Ergebnisse auf der Startseite */
async function performSearch(query) {
    if (!query) return;

    if (typeof closeVideoModal === 'function') closeVideoModal();

    _searchInProgress = true;
    currentQuery = query;
    currentCategory = query;
    currentOffset = 0;
    displayedResults = [];

    if (typeof navigateToPage === 'function') navigateToPage('home');

    try {
        console.log('[API] Searching for:', query);

        const skipHistory = new Set(['Tatort', 'Dokumentation', 'Spielfilm', 'Nachrichten', 'Sport', 'Kinder', 'KiKA', 'Reportage']);
        if (!skipHistory.has(query)) {
            saveSearchQuery(query);
        }
        hideSearchHistoryDropdown();

        if (recentlyWatched) recentlyWatched.style.display = 'none';
        if (searchInput) searchInput.value = query;
        if (sectionTitle) sectionTitle.innerHTML = `<i class="fas fa-search"></i> ${query}`;

        showLoading(true);

        const qLower = query.trim().toLowerCase();
        const payload = (qLower === 'kinder' || qLower === 'kika')
            ? {
                queries: [{ fields: ['channel'], query: 'KiKA' }],
                sortBy: 'timestamp',
                sortOrder: 'desc',
                future: true,
                offset: 0,
                size: 200
            }
            : {
                queries: [{ fields: ['title', 'topic', 'description'], query }],
                sortBy: 'timestamp',
                sortOrder: 'desc',
                future: true,
                offset: 0,
                size: 200
            };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        let rawResults = data.result?.results || [];
        if (getActiveProfile().isKids) {
            rawResults = filterKidsSafe(rawResults);
        }
        currentResults = rawResults;
        originalResults = [...currentResults];

        window.scrollTo({ top: 0, behavior: 'instant' });
        const mc = document.querySelector('.main-content');
        if (mc) mc.scrollTop = 0;

        if (currentResults.length === 0) showEmpty(true);
        else displayResults();
    } catch (error) {
        console.error('[API] Search error:', error);
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
        _searchInProgress = false;
    }
}

/** Wendet Sender-, Genre-, Längen-, Hörfassungs- und Sortier-Filter auf die Ergebnisse an */
function applyFilters() {
    const channel = document.getElementById('channelFilter')?.value;
    const genre = document.getElementById('genreFilter')?.value;
    const minDuration = parseInt(document.getElementById('durationFilter')?.value || '0', 10);
    const sortBy = document.getElementById('sortFilter')?.value;

    let filtered = [...(originalResults.length > 0 ? originalResults : currentResults)];

    if (channel) {
        filtered = filtered.filter(item => item.channel === channel);
    }

    if (genre) {
        const sg = genre.toLowerCase();
        filtered = filtered.filter(item =>
            (item.title || '').toLowerCase().includes(sg) ||
            (item.topic || '').toLowerCase().includes(sg) ||
            (item.description || '').toLowerCase().includes(sg)
        );
    }

    if (minDuration > 0) {
        filtered = filtered.filter(item => Math.round(item.duration / 60) >= minDuration);
    }

    const hideAD = document.getElementById('hideAudioDescriptionToggle')?.checked;
    if (hideAD) {
        filtered = filtered.filter(item => !isAudioDescription(item));
    }

    if (sortBy === 'duration') {
        filtered.sort((a, b) => b.duration - a.duration);
    } else if (sortBy === 'title') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'episode') {
        const extractEpisode = (title) => {
            const sxex = title.match(/S(\d+)E(\d+)/i);
            if (sxex) return parseInt(sxex[1], 10) * 1000 + parseInt(sxex[2], 10);
            const sf = title.match(/Staffel\s*(\d+).*?Folge\s*(\d+)/i);
            if (sf) return parseInt(sf[1], 10) * 1000 + parseInt(sf[2], 10);
            const folge = title.match(/(?:Folge|Episode|Ep\.?)\s*(\d+)/i);
            if (folge) return parseInt(folge[1], 10);
            const dot = title.match(/^(\d+)\.\s/);
            if (dot) return parseInt(dot[1], 10);
            const paren = title.match(/\((\d+)\)/);
            if (paren) return parseInt(paren[1], 10);
            const dash = title.match(/^(\d{1,3})\s*-\s/);
            if (dash) return parseInt(dash[1], 10);
            const staffel = title.match(/Staffel\s*(\d+)/i);
            if (staffel) return parseInt(staffel[1], 10) * 1000;
            const any = title.match(/\d+/);
            return any ? parseInt(any[0], 10) : 0;
        };
        filtered.sort((a, b) => {
            const diff = extractEpisode(a.title) - extractEpisode(b.title);
            return diff !== 0 ? diff : a.title.localeCompare(b.title);
        });
    } else if (sortBy === 'date') {
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    currentResults = filtered;
    currentOffset = 0;
    displayedResults = [];
    if (videoGrid) videoGrid.innerHTML = '';

    if (filtered.length === 0) {
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

    if (filterSidebar) filterSidebar.classList.remove('active');
}

// ── TMDB API-Integration ──────────────────────────────────────────────────────

/** Verfeinert generische Serientitel anhand von Episoden-Beschreibungen für TMDB */
function findBestSeriesSearchQuery(seriesName, episodes = []) {
    if (!seriesName) return '';
    if (!episodes || episodes.length === 0) return seriesName;

    for (const ep of episodes.slice(0, 15)) {
        const combo = `${(ep.title || '').trim()} ${(ep.description || '').trim()}`;
        if (/^mako$/i.test(seriesName) || /^mako\b/i.test(seriesName)) {
            if (/meerjungfrau/i.test(combo)) return 'Mako - Einfach Meerjungfrau';
        }
        if (/^h2o$/i.test(seriesName) || /^h2o\b/i.test(seriesName)) {
            if (/meerjungfrau/i.test(combo)) return 'H2O - Plötzlich Meerjungfrau';
        }
        if (/robin\s*hood/i.test(seriesName)) {
            if (ep.channel === 'KiKA' || /sherwood|schlitzohr/i.test(combo)) {
                return 'Robin Hood - Schlitzohr von Sherwood';
            }
        }
        if (/musketiere/i.test(seriesName) && /drei musketiere/i.test(combo)) {
            return 'Die drei Musketiere';
        }
    }
    return seriesName;
}

/** Sucht eine Serie auf TMDB mit Kontext-Gewichtung (z. B. Kinder-Genre-Boost) */
async function searchTMDBSeries(seriesName, sampleItem = null) {
    TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || '';
    if (!TMDB_API_KEY || !seriesName) return null;

    const channel = sampleItem ? (sampleItem.channel || '') : '';
    const isKidsContext = (typeof getActiveProfile === 'function' && getActiveProfile().isKids) ||
        channel === 'KiKA' ||
        (sampleItem && sampleItem.duration && sampleItem.duration <= 1200);

    const cacheKey = `search_${seriesName.toLowerCase()}_${isKidsContext ? 'kids' : 'all'}`;
    if (tmdbSeriesCache.has(cacheKey)) return tmdbSeriesCache.get(cacheKey);

    const cleanSpace = seriesName.replace(/[\-–—:_]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanNoBrackets = cleanSpace.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    const firstWord = cleanNoBrackets.split(' ')[0] || '';
    const queries = [cleanSpace, cleanNoBrackets, seriesName.trim()];
    if (firstWord.length >= 3 && firstWord !== cleanNoBrackets) queries.push(firstWord);

    const uniqueQueries = queries.filter((q, idx, arr) => q && q.length >= 2 && arr.indexOf(q) === idx);
    const candidatesMap = new Map();

    for (const q of uniqueQueries) {
        try {
            const url = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&language=de-DE&query=${encodeURIComponent(q)}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                (data.results || []).forEach(r => {
                    if (r && r.id && !candidatesMap.has(r.id)) candidatesMap.set(r.id, r);
                });
            }
        } catch (e) {}
    }

    const candidates = Array.from(candidatesMap.values());
    if (candidates.length === 0) return null;

    const scoreCandidate = (candidate) => {
        const clean = s => (s || '').toLowerCase()
            .replace(/[–—:\-_,!?.\'\"\(\)\[\]\/]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const qClean = clean(seriesName);
        const nameClean = clean(candidate.name);
        const origClean = clean(candidate.original_name);

        if (nameClean === qClean || origClean === qClean) return 1.0;

        if (nameClean.startsWith(qClean) || origClean.startsWith(qClean) || qClean.startsWith(nameClean)) {
            let s = 0.85;
            if (isKidsContext && candidate.genre_ids &&
                (candidate.genre_ids.includes(16) || candidate.genre_ids.includes(10762) ||
                 candidate.genre_ids.includes(10751) || candidate.genre_ids.includes(10765))) {
                s += 0.15;
            }
            return Math.min(1.0, s);
        }

        const stopWords = new Set(['die', 'der', 'das', 'und', 'von', 'mit', 'im', 'in', 'aus', 'auf', 'zu', 'ein', 'eine', 'einer', 'eines']);
        const qWords = qClean.split(' ').filter(w => w.length > 1 && !stopWords.has(w));
        const cWords = `${nameClean} ${origClean}`.split(' ').filter(w => w.length > 1);
        if (qWords.length === 0 || cWords.length === 0) return 0;

        let matchedWords = 0;
        qWords.forEach(qw => {
            if (cWords.some(cw => cw === qw || (qw.length >= 4 && cw.includes(qw)))) matchedWords++;
        });
        const overlap = matchedWords / qWords.length;
        if (overlap < 0.5) return 0;

        let score = overlap * 0.8;
        if (isKidsContext) {
            if (candidate.genre_ids &&
                (candidate.genre_ids.includes(16) || candidate.genre_ids.includes(10762) ||
                 candidate.genre_ids.includes(10751) || candidate.genre_ids.includes(10765))) {
                score += 0.15;
            }
            if (candidate.first_air_date) {
                const year = parseInt(candidate.first_air_date.split('-')[0], 10);
                if (year < 1980 && !qClean.includes('1970')) score -= 0.4;
            }
        }
        return Math.min(1.0, score);
    };

    let bestMatch = null;
    let highestScore = 0;
    candidates.forEach(cand => {
        const s = scoreCandidate(cand);
        if (s > highestScore) { highestScore = s; bestMatch = cand; }
    });

    if (bestMatch && highestScore >= 0.6) {
        tmdbSeriesCache.set(cacheKey, bestMatch);
        return bestMatch;
    }
    return null;
}

/** Holt Detailinformationen zu einer TMDB-Serie (mit Cache) */
async function getTMDBSeriesDetails(seriesId) {
    TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || '';
    if (!TMDB_API_KEY) return null;

    const cacheKey = `details_${seriesId}`;
    if (tmdbSeriesCache.has(cacheKey)) return tmdbSeriesCache.get(cacheKey);

    try {
        const url = `${TMDB_BASE_URL}/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=de-DE`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        tmdbSeriesCache.set(cacheKey, data);
        return data;
    } catch {
        return null;
    }
}

function getTMDBPosterURL(posterPath, size = 'w500') {
    if (!posterPath) return null;
    return `${TMDB_IMAGE_BASE}/${size}${posterPath}`;
}

function getTMDBBackdropURL(backdropPath, size = 'w1280') {
    if (!backdropPath) return null;
    return `${TMDB_IMAGE_BASE}/${size}${backdropPath}`;
}

// ── Trailer-Suche (TMDB / YouTube-Fallback) ───────────────────────────────────

/** Ermittelt einen einbettbaren YouTube-Trailer über TMDB (oder gibt 'youtube_search' zurück) */
async function fetchTrailerUrl(title, channel) {
    TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || TMDB_API_KEY || '';
    if (!TMDB_API_KEY || TMDB_API_KEY === 'YOUR_API_KEY_HERE') return 'youtube_search';

    try {
        const cleanTitle = _cleanTitleForTmdb(title);

        const _bestMatch = (results, nameKey) => {
            if (!results || results.length === 0) return null;
            const scored = results.map(r => ({ r, score: _titleSimilarity(cleanTitle, r[nameKey] || '') }));
            scored.sort((a, b) => b.score - a.score);
            if (scored[0].score > 0) return scored[0].r;
            const words = cleanTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            return results.find(r => words.some(w => (r[nameKey] || '').toLowerCase().includes(w))) || null;
        };

        let id = null;
        let isTV = true;

        let res = await fetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&language=de-DE&query=${encodeURIComponent(cleanTitle)}`);
        let data = await res.json();
        const tvMatch = _bestMatch(data.results, 'name');
        if (tvMatch) id = tvMatch.id;

        if (!id) {
            res = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=de-DE&query=${encodeURIComponent(cleanTitle)}`);
            data = await res.json();
            const movieMatch = _bestMatch(data.results, 'title');
            if (movieMatch) { id = movieMatch.id; isTV = false; }
        }

        if (!id) return 'youtube_search';

        const typeStr = isTV ? 'tv' : 'movie';
        res = await fetch(`${TMDB_BASE_URL}/${typeStr}/${id}/videos?api_key=${TMDB_API_KEY}&language=de-DE`);
        data = await res.json();
        let videos = data.results || [];

        if (videos.length === 0) {
            res = await fetch(`${TMDB_BASE_URL}/${typeStr}/${id}/videos?api_key=${TMDB_API_KEY}`);
            data = await res.json();
            videos = data.results || [];
        }

        const youtubeTrailer =
            videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
            videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
            videos.find(v => v.site === 'YouTube' && v.type === 'Teaser');

        return youtubeTrailer
            ? `https://www.youtube-nocookie.com/embed/${youtubeTrailer.key}?autoplay=1`
            : 'youtube_search';
    } catch (e) {
        console.error('[API] fetchTrailerUrl error:', e);
        return 'youtube_search';
    }
}

// ── Abonnement-Update-Prüfung ─────────────────────────────────────────────────

/** Prüft einmal pro Sitzung alle Abos auf neue Sendungen und zeigt das Benachrichtigungsbanner */
async function checkAbosForNewContent() {
    const abos = getAbos();
    if (abos.length === 0) return;

    const banner = document.getElementById('aboNotifications');
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
            abo.lastSeen = newestTs;
        } catch { /* Netzwerkfehler pro Abo ignorieren */ }
    }

    saveAbos(abos);

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

// ── EPG (Elektronischer Programmführer) ───────────────────────────────────────

/** Lädt das aktuelle TV-Programm der wichtigsten öffentlich-rechtlichen Sender über xmltv.se */
async function loadEPG() {
    const epgContainer = document.getElementById('liveEpgContainer');
    if (!epgContainer) return;

    epgContainer.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;padding:0.5rem 0;"><i class="fas fa-spinner fa-spin"></i> Lade Programm...</p>';

    const epgChannelMap = [
        { name: 'Das Erste HD', id: 'das-erste.de' },
        { name: 'ZDF HD',       id: 'zdf.de' },
        { name: 'ARD alpha',    id: 'ard-alpha.de' },
        { name: '3sat HD',      id: '3sat.de' },
        { name: 'ZDFneo',       id: 'zdfneo.de' },
        { name: 'ARTE',         id: 'arte.de' },
        { name: 'Phoenix HD',   id: 'phoenix.de' },
        { name: 'tagesschau24', id: 'tagesschau24.de' }
    ];

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

    let rows = '';
    let fetchedAny = false;

    for (const ch of epgChannelMap) {
        try {
            const res = await fetch(`https://xmltv.se/${ch.id}/${todayStr}.json`, { signal: AbortSignal.timeout(4000) });
            if (!res.ok) continue;
            const data = await res.json();
            const programmes = data.programmes || [];

            const nowMs = now.getTime();
            const current = programmes.find(p => {
                const start = new Date(p.start).getTime();
                const stop = new Date(p.stop).getTime();
                return nowMs >= start && nowMs < stop;
            });
            if (!current) continue;

            const next = programmes[programmes.indexOf(current) + 1] || null;
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
        } catch { /* Timeout/Netzwerk ignorieren */ }
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

console.log('[api.js] loaded');

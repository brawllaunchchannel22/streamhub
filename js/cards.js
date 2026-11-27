// ============================================================
// js/cards.js — Video Card and Series Card Rendering
// Depends on: config.js (senderColors, API_URL, SERIES_BLACKLIST),
//             state.js (thumbIdCounter, videoGrid),
//             utils.js (simpleHash, cleanEpisodeTitle, cleanTopic,
//                       isAudioDescription, filterKidsSafe),
//             storage.js (getVideoProgressKey, getVideoProgress,
//                         isInWatchlist, toggleWatchlist,
//                         isInWatchLater, toggleWatchLater,
//                         getPlaylists, addToPlaylist,
//                         showCreatePlaylistDialog, getAbos, saveAbos),
//             thumbnails.js (queueRealThumbnail, simpleHash)
// ============================================================

'use strict';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a CSS gradient string for the given channel name.
 * Falls back to DEFAULT gradient when the channel is unknown.
 */
function getChannelGradient(channel) {
    const colors = senderColors[channel] || senderColors['DEFAULT'] || ['#374151', '#1f2937'];
    return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
}

// ── EpisodeParser ────────────────────────────────────────────────────────────

/**
 * Parses German Mediathek episode titles and descriptions to extract
 * season and episode numbers.
 *
 * Supported patterns (confidence in parentheses):
 *  - S01E01       (100)
 *  - Staffel X, Folge Y (95)
 *  - Folge X      (80)
 *  - Teil X       (75)
 *  - (X/Y)        (70)
 *  - Leading number  (60)
 *  - Any trailing #X / (X) (50) — no bare random numbers (prevents dates breaking series!)
 */
class EpisodeParser {
    constructor(title, description = '') {
        this.title       = (title || '').toLowerCase();
        this.description = (description || '').toLowerCase();
        this.combined    = `${this.title} ${this.description}`.trim();
    }

    /** Returns { season, episode, confidence, pattern } */
    parse() {
        // Detect Staffel in combined text for use as fallback season
        let detectedSeason = 1;
        const separateStaffel = this.combined.match(/(?:staffel|season)\s*(\d{1,2})\b/i)
                             || this.combined.match(/\b(\d{1,2})\.\s*(?:staffel|season)\b/i);
        if (separateStaffel) detectedSeason = Math.max(1, parseInt(separateStaffel[1], 10));

        // Pattern 1: S01E01 / S1 E01 / S1.E01 (most reliable)
        const sxex = this.combined.match(/\bs(\d{1,2})[\s._-]*e(\d{1,3})\b/i);
        if (sxex) {
            const ep = parseInt(sxex[2], 10);
            if (ep > 0) return { season: parseInt(sxex[1], 10), episode: ep, confidence: 100, pattern: 'S01E01' };
        }

        // Pattern 2: Staffel X, Folge Y / X. Staffel, Folge Y
        const staffelFolge = this.combined.match(/(?:staffel|season)[\s:]*(\d{1,2})[\s,;/-]*(?:folgen?|episoden?|ep\.?)[\s.:#]*(\d{1,3})\b/i)
                          || this.combined.match(/\b(\d{1,2})\.\s*(?:staffel|season)[\s,;/-]*(?:folgen?|episoden?|ep\.?)[\s.:#]*(\d{1,3})\b/i);
        if (staffelFolge) {
            const ep = parseInt(staffelFolge[2], 10);
            if (ep > 0) return { season: parseInt(staffelFolge[1], 10), episode: ep, confidence: 95, pattern: 'Staffel X, Folge Y' };
        }

        // Pattern 3: Folge X / Episode X / Ep. X / Kapitel X (without explicit season)
        const folge = this.combined.match(/\b(?:folge|episode|ep\.?|kapitel)[\s.:#]*(\d{1,3})\b/i);
        if (folge) {
            const ep = parseInt(folge[1], 10);
            if (ep > 0 && ep <= 500) return { season: detectedSeason, episode: ep, confidence: 80, pattern: 'Folge X' };
        }

        // Pattern 4: Teil X
        const teil = this.combined.match(/\bteil[\s.:]*(\d{1,3})\b/i);
        if (teil) {
            const ep = parseInt(teil[1], 10);
            if (ep > 0 && ep <= 50) return { season: detectedSeason, episode: ep, confidence: 75, pattern: 'Teil X' };
        }

        // Pattern 5: (X/Y) or X/Y where 1 <= X <= Y <= 99 (rejects "24/7" and dates like "04/2025")
        const fraction = this.combined.match(/(?:^|[\s(\[])(\d{1,2})\/(\d{1,2})(?![\/\d])(?:[\)\]\s,;:.]|$)/);
        if (fraction) {
            const ep    = parseInt(fraction[1], 10);
            const total = parseInt(fraction[2], 10);
            if (ep >= 1 && total >= 2 && ep <= total && total <= 99) {
                return { season: detectedSeason, episode: ep, confidence: 70, pattern: 'X/Y', total };
            }
        }

        // Pattern 6: leading number "01 - " / "1. " / "(1) " / "01: " (skip dates like "1. Mai")
        const leadingNumber = this.title.match(/^(?:\()?(\d{1,3})(?:\)|\.|:|[\s]*-)[\s]+([^\s]+)/);
        if (leadingNumber) {
            const ep   = parseInt(leadingNumber[1], 10);
            const next = (leadingNumber[2] || '').toLowerCase();
            const isDateOrUnit = /^(?:jan|feb|mär|mar|apr|mai|jun|jul|aug|sep|okt|nov|dez|jahr|jahre|prozent|uhr|fc|sc|sv|tsv)\b/i.test(next);
            if (!isDateOrUnit && ep > 0 && ep <= 500) {
                return { season: detectedSeason, episode: ep, confidence: 60, pattern: 'Leading Number' };
            }
        }

        // Pattern 7: explicit "#12" or trailing "(12)" (excluding years 1900-2099)
        const hashOrParen = this.title.match(/#(\d{1,3})\b/) || this.title.match(/\((\d{1,3})\)\s*$/);
        if (hashOrParen) {
            const ep = parseInt(hashOrParen[1], 10);
            if (ep > 0 && ep <= 300) {
                return { season: detectedSeason, episode: ep, confidence: 50, pattern: 'Explicit Marker' };
            }
        }

        return { season: null, episode: null, confidence: 0, pattern: 'none' };
    }

    /** Returns true when the item has at least 50 % confidence of being a series episode. */
    isSeries() { return this.parse().confidence >= 50; }
}

// ── Series Grouping & Deduplication Helpers ──────────────────────────────────

/** Vorkompilierte Wortgrenzen-Regexe für SERIES_BLACKLIST (verhindert z. B. Blocken von "Tatortreiniger") */
const _SERIES_BLACKLIST_REGEXES = (typeof SERIES_BLACKLIST !== 'undefined' ? SERIES_BLACKLIST : []).map(kw => {
    const esc = String(kw).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9äöüß])${esc}(?:$|[^a-z0-9äöüß])`, 'i');
});

/**
 * Normalises a topic string to a stable map key.
 * Removes articles, normalises umlauts, lowercases.
 */
function normalizeTopicKey(topic) {
    if (!topic || String(topic).trim() === '') return null;
    return cleanTopic(topic)
        .trim()
        .toLowerCase()
        .replace(/^(die|der|das|ein|eine)\s+/i, '')
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Returns true when `topic` matches any entry in SERIES_BLACKLIST on whole-word boundaries. */
function isBlacklisted(topic) {
    if (!topic) return false;
    const tl = cleanTopic(topic).toLowerCase();
    return _SERIES_BLACKLIST_REGEXES.some(re => re.test(tl));
}

/**
 * Erzeugt einen normalisierten Episoden-Kerntitel zum zuverlässigen Erkennen von
 * Dubletten (gleiche Folge auf KiKA/ORF/ZDF oder mit/ohne Hörfassung/DGS).
 */
function _episodeDedupTitle(title, seriesName = '') {
    let s = cleanEpisodeTitle(title || '')
        .replace(/\s*[\(\[](?:Gebärdensprache|DGS|OmU|Originalversion|UT)[\)\]]/gi, '')
        .trim()
        .toLowerCase();

    if (seriesName) {
        const snLower = cleanTopic(seriesName).toLowerCase().trim();
        if (snLower && s.startsWith(snLower)) {
            const rest = s.slice(snLower.length).replace(/^[\s:\-–—]+/, '').trim();
            if (rest.length >= 2) s = rest;
        }
    }

    s = s
        .replace(/\bs\d{1,2}[\s._-]*e\d{1,3}\b/gi, ' ')
        .replace(/(?:staffel|season)\s*\d{1,2}[\s,;/-]*(?:folgen?|episoden?|ep\.?)?\s*\d{0,3}/gi, ' ')
        .replace(/\b(?:folge|episode|ep\.?)\s*\d{1,3}\b[:\-–\s]*/gi, ' ')
        .replace(/^(?:\(\d{1,3}\)|\d{1,3}[.):\-])\s+/, '')
        .replace(/[^a-z0-9äöüß]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return s;
}

/** Prüft, ob zwei normalisierte Episodentitel inhaltlich dieselbe Folge bezeichnen */
function _titlesReferToSameEpisode(coreA, coreB) {
    if (!coreA || !coreB) return true;
    if (coreA === coreB) return true;
    const minLen = Math.min(coreA.length, coreB.length);
    if (minLen >= 6 && (coreA.includes(coreB) || coreB.includes(coreA))) return true;
    return false;
}

/**
 * Returns true when the results array looks like a series context
 * (3+ items sharing the same topic key with episode patterns).
 */
function isSeriesContext(items) {
    if (!Array.isArray(items) || items.length < 3) return false;
    const topicGroups = new Map();
    items.forEach(item => {
        const cleanedTopic    = cleanTopic(item.topic);
        const normalizedTopic = normalizeTopicKey(cleanedTopic);
        if (!normalizedTopic || isBlacklisted(cleanedTopic)) return;
        const parser = new EpisodeParser(item.title, item.description);
        if (!parser.isSeries()) return;
        if (!topicGroups.has(normalizedTopic)) topicGroups.set(normalizedTopic, { count: 0, items: [] });
        const group = topicGroups.get(normalizedTopic);
        group.count++;
        group.items.push(item);
    });
    for (const group of topicGroups.values()) {
        if (group.count >= 3) return true;
    }
    return false;
}

/** Regex für echte Bonus-/Trailer-Schlüsselwörter (Wortgrenzen vermeiden Fehlalarme wie "Song" in Namen) */
const _SERIES_EXTRA_REGEX = /(?:^|[^a-z0-9äöüß])(?:rückblick|making[- ]of|behind[- ]the[- ]scenes|bts|trailer|teaser|vorschau|spoiler|interview|outtakes|bloopers|bonusclip|bonus|kurzclip|musikvideo|best[- ]of|hinter den kulissen)(?:$|[^a-z0-9äöüß])/i;

/**
 * Erkennt Extras/Trailer/Kurzclips innerhalb einer Serie.
 * Kurze Serienfolgen (z. B. 3-Minuten-Kinderserien) werden NICHT als Extra gewertet,
 * solange die Serie insgesamt keine langen Hauptfolgen (> 5 Min.) besitzt.
 */
function _isSeriesExtra(ep, hasLongEpisodes = true) {
    if (!ep) return false;
    const title    = (ep.title || '').toLowerCase();
    const desc     = (ep.description || '').toLowerCase();
    const duration = parseInt(ep.duration || '0', 10);
    if (/^(?:clip|trailer|teaser|vorschau)\s*[:\-–]/i.test(title)) return true;
    if (_SERIES_EXTRA_REGEX.test(title) || _SERIES_EXTRA_REGEX.test(desc)) return true;
    if (hasLongEpisodes && duration > 0 && duration <= 240) return true;
    return false;
}

/**
 * Entfernt doppelte/AD-Varianten derselben Episode innerhalb einer Themen-Gruppe,
 * bevor entschieden wird, ob daraus eine Serien-Karte entsteht.
 */
function _dedupeTopicGroupItems(items, seriesName) {
    const map = new Map();
    for (const ep of items) {
        const parser = new EpisodeParser(ep.title, ep.description);
        const pr     = parser.parse();
        const core   = _episodeDedupTitle(ep.title, seriesName);
        const baseK  = (pr.episode > 0) ? `s${pr.season || 1}_e${pr.episode}` : `t_${core || (ep.title || '').toLowerCase()}`;

        let targetKey = baseK;
        if (pr.episode > 0 && map.has(baseK)) {
            const ex = map.get(baseK);
            if (!_titlesReferToSameEpisode(ex._coreTitle, core)) {
                targetKey = `${baseK}__${core}`;
            }
        }

        const isAcc = typeof isAccessibleVariant === 'function' ? isAccessibleVariant(ep) : isAudioDescription(ep);
        const existing = map.get(targetKey);
        if (!existing) {
            map.set(targetKey, { item: ep, isAcc, _coreTitle: core, confidence: pr.confidence });
        } else if (existing.isAcc && !isAcc) {
            map.set(targetKey, { item: ep, isAcc, _coreTitle: core, confidence: pr.confidence });
        }
    }
    return Array.from(map.values());
}

/**
 * Groups a flat list of video items into series cards and standalone video cards,
 * respecting AD-filter toggle, deduplication, and current sort order.
 *
 * @returns {{ type: 'series'|'video', title?: string, episodes?: object[], data?: object }[]}
 */
function groupAllResults(items) {
    if (!Array.isArray(items)) return [];
    const hideAD         = (typeof document !== 'undefined' && document.getElementById('hideAudioDescriptionToggle')?.checked) || false;
    const topicMap       = new Map();
    const standaloneVideos = [];

    items.forEach((item, idx) => {
        if (hideAD && isAudioDescription(item)) return;

        const cleanedTopic    = cleanTopic(item.topic);
        const normalizedTopic = normalizeTopicKey(cleanedTopic);

        if (!normalizedTopic || isBlacklisted(cleanedTopic)) {
            standaloneVideos.push({ item, order: idx });
            return;
        }

        if (!topicMap.has(normalizedTopic)) {
            topicMap.set(normalizedTopic, { originalTopic: cleanedTopic, items: [], firstOrder: idx });
        }
        topicMap.get(normalizedTopic).items.push(item);
    });

    const displayList = [];

    topicMap.forEach((groupData) => {
        const deduped         = _dedupeTopicGroupItems(groupData.items, groupData.originalTopic);
        const hasLongEpisodes = deduped.some(e => parseInt(e.item.duration || '0', 10) > 300);
        const realEpisodes    = deduped.filter(e => !_isSeriesExtra(e.item, hasLongEpisodes));
        const hasSeriesNum    = realEpisodes.some(e => e.confidence >= 60);

        // Nur echte Serien gruppieren: min. 2 echte Episoden mit Episoden-Muster ODER >= 3 eindeutige Beiträge
        if (realEpisodes.length >= 3 || (realEpisodes.length >= 2 && hasSeriesNum)) {
            displayList.push({
                type: 'series',
                title: groupData.originalTopic,
                episodes: deduped.map(e => e.item),
                order: groupData.firstOrder
            });
        } else {
            deduped.forEach((entry, subIdx) => {
                standaloneVideos.push({ item: entry.item, order: groupData.firstOrder + subIdx * 0.001 });
            });
        }
    });

    // Ursprüngliche Sortierreihenfolge (Relevanz, Datum, Dauer, Titel, Empfehlungs-Mix) beibehalten
    standaloneVideos.sort((a, b) => a.order - b.order);
    standaloneVideos.forEach(entry => displayList.push({ type: 'video', data: entry.item }));

    return displayList;
}

/**
 * Renders an array of display items (series or video) into the videoGrid.
 * @param {{ type: string, title?: string, episodes?: object[], data?: object }[]} items
 */
function renderDisplayItems(items) {
    items.forEach((item, index) => {
        if (item.type === 'series') {
            const seriesCard = createSeriesCard(item.title, item.episodes);
            if (videoGrid) videoGrid.appendChild(seriesCard);
        } else if (item.type === 'video') {
            const card = createVideoCard(item.data, index);
            if (videoGrid) videoGrid.appendChild(card);
        }
    });
}

// ── Context Menu ─────────────────────────────────────────────────────────────

/**
 * Opens a bottom-sheet context menu for a video card.
 * Provides quick actions: watch-later, watchlist, playlist.
 *
 * @param {object}      item   The video item object
 * @param {HTMLElement} cardEl The card element (used to find watchlist/later buttons)
 * @param {Event}       event  Triggering event (contextmenu or touchstart)
 */
function openCardContextMenu(item, cardEl, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }

    // Remove any existing context menu
    document.querySelectorAll('.card-context-menu, .modal-backdrop-ctx').forEach(el => el.remove());

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-ctx';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);z-index:99998;';

    const menu = document.createElement('div');
    menu.className = 'card-context-menu';
    menu.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:92%;max-width:420px;background:#1e1e2e;border:1px solid rgba(255,255,255,0.15);border-radius:24px;z-index:99999;padding:14px;box-shadow:0 16px 48px rgba(0,0,0,0.8);animation:ctxSlideUp 0.2s ease;color:#fff;';

    const inWLater   = isInWatchLater(item);
    const inWL       = isInWatchlist(item);
    const playlists  = getPlaylists();
    const itemHistKey = typeof getHistoryItemKey === 'function' ? getHistoryItemKey(item) : '';
    const inHistory  = typeof getRecentlyWatched === 'function'
        && getRecentlyWatched().some(h => getHistoryItemKey(h) === itemHistKey);

    const playlistOptions = playlists.map(p => `
        <button class="ctx-btn ctx-pl-item" data-pl-id="${p.id}">
            <i class="fas fa-list" style="color:#818cf8;"></i> Zu „${p.title}" hinzufügen
        </button>
    `).join('');

    menu.innerHTML = `
        <div style="font-weight:700;font-size:0.95rem;padding:8px 12px 12px;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#cbd5e1;">
            <i class="fas fa-play-circle" style="color:var(--primary-color);margin-right:6px;"></i> ${item.title}
        </div>
        <button class="ctx-btn ctx-watchlater">
            <i class="${inWLater ? 'fas' : 'far'} fa-clock" style="color:#f59e0b;"></i>
            ${inWLater ? 'Aus „Später ansehen" entfernen' : 'Zu „Später ansehen" hinzufügen'}
        </button>
        <button class="ctx-btn ctx-watchlist">
            <i class="fas fa-heart" style="color:#ec4899;"></i>
            ${inWL ? 'Von Merkliste entfernen' : 'Zur Merkliste hinzufügen'}
        </button>
        ${inHistory ? `
        <button class="ctx-btn ctx-remove-history" style="color:#f87171;">
            <i class="fas fa-trash-alt" style="color:#ef4444;"></i>
            Aus Verlauf entfernen
        </button>` : ''}
        ${playlistOptions}
        <button class="ctx-btn ctx-new-pl">
            <i class="fas fa-plus-circle" style="color:#6366f1;"></i> Neue Playlist erstellen...
        </button>
        <button class="ctx-btn ctx-cancel" style="margin-top:8px;background:rgba(255,255,255,0.06);text-align:center;justify-content:center;font-weight:600;">
            Abbrechen
        </button>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(menu);
    if (window._syncNativeBackHandler) window._syncNativeBackHandler();

    const closeCtx = () => {
        backdrop.remove();
        menu.remove();
        if (window._syncNativeBackHandler) window._syncNativeBackHandler();
    };
    const bindCtxBtn = (btn, fn) => {
        if (!btn) return;
        if (typeof bindSafeTap === 'function') bindSafeTap(btn, fn, { stopPropagation: true });
        else btn.onclick = fn;
    };

    backdrop.onclick = closeCtx;
    bindCtxBtn(menu.querySelector('.ctx-cancel'), closeCtx);

    const wlBtn     = cardEl ? cardEl.querySelector('.watchlist-btn')  : null;
    const wlaterBtn = cardEl ? cardEl.querySelector('.watchlater-btn') : null;

    bindCtxBtn(menu.querySelector('.ctx-watchlater'), () => { toggleWatchLater(item, wlaterBtn); closeCtx(); });
    bindCtxBtn(menu.querySelector('.ctx-watchlist'),  () => { toggleWatchlist(item, wlBtn);      closeCtx(); });

    const remHistBtn = menu.querySelector('.ctx-remove-history');
    if (remHistBtn && typeof removeHistoryItem === 'function') {
        bindCtxBtn(remHistBtn, () => {
            removeHistoryItem(itemHistKey);
            if (typeof loadRecentlyWatched === 'function') loadRecentlyWatched();
            if (currentPage === 'history' && typeof loadFullHistoryPage === 'function') loadFullHistoryPage();
            showNotification('Video aus Verlauf entfernt', 'info');
            closeCtx();
        });
    }

    bindCtxBtn(menu.querySelector('.ctx-new-pl'), () => {
        closeCtx();
        setTimeout(() => {
            showCreatePlaylistDialog((pl) => { if (pl) addToPlaylist(pl.id, item); });
        }, 100);
    });
    menu.querySelectorAll('.ctx-pl-item').forEach(btn => {
        bindCtxBtn(btn, () => { addToPlaylist(btn.dataset.plId, item); closeCtx(); });
    });
}
window.openCardContextMenu = openCardContextMenu;

// ── Video Card ───────────────────────────────────────────────────────────────

/**
 * Creates a full video card DOM element for the grid.
 * Includes thumbnail, duration badge, watchlist/watch-later buttons,
 * progress bar, channel badge, and long-press context menu.
 *
 * @param {object} item    Video item from the API
 * @param {number} index   Card index (used to stagger thumbnail loading)
 * @returns {HTMLElement}
 */
function createVideoCard(item, index) {
    const card = document.createElement('div');
    card.className = 'video-card';

    const duration     = Math.round(item.duration / 60);
    const durationText = duration > 0 ? `${duration} Min` : 'Live';
    const gradient     = getChannelGradient(item.channel);
    const thumbnailId  = `thumb-${++thumbIdCounter}`;
    const dateText     = formatDate(new Date(item.timestamp * 1000));

    // Progress bar
    const progressKey = getVideoProgressKey(item);
    const progress    = progressKey ? getVideoProgress(progressKey) : null;
    let progressHTML  = '';
    if (progress && progress.percent > 0) {
        progressHTML = `
            <div class="video-progress-bar-container" style="position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(255,255,255,0.25);z-index:10;overflow:hidden;border-radius:0 0 16px 16px;">
                <div class="video-progress-bar-fill" style="width:${progress.percent}%;height:100%;background:var(--primary-color);border-radius:inherit;"></div>
            </div>
        `;
    }

    const inWL     = isInWatchlist(item);
    const inWLater = isInWatchLater(item);

    card.innerHTML = `
        <div class="video-thumbnail" id="${thumbnailId}" style="background:${gradient};">
            <span class="sender-logo thumb-overlay-logo">${item.channel}</span>
            <span class="duration-badge">${durationText}</span>
            <button class="watchlist-btn${inWL ? ' watchlist-active' : ''}" title="${inWL ? 'Von Merkliste entfernen' : 'Zur Merkliste hinzufügen'}" aria-label="Merkliste">
                <i class="fas fa-heart"></i>
            </button>
            <button class="watchlater-btn${inWLater ? ' watchlater-active' : ''}" title="${inWLater ? 'Aus Später ansehen entfernen' : 'Später ansehen'}" aria-label="Später ansehen">
                <i class="${inWLater ? 'fas' : 'far'} fa-clock"></i>
            </button>
            ${progressHTML}
        </div>
        <div class="video-card-content">
            <h3 class="video-card-title">${cleanEpisodeTitle(item.title)}</h3>
            <div class="video-card-meta">
                <span class="channel-badge">${item.channel}</span>
                ${isAudioDescription(item) ? '<span class="channel-badge" style="background:rgba(148,163,184,0.15);color:#94a3b8;font-size:0.7rem;" title="Hörfassung / Audiodeskription">AD</span>' : ''}
                <span class="video-date">${dateText}</span>
            </div>
        </div>
    `;

    // Desktop right-click context menu (deaktiviert im Verlaufs-Auswahlmodus)
    card.addEventListener('contextmenu', (e) => {
        if (card.classList.contains('history-selectable')) return;
        openCardContextMenu(item, card, e);
    });

    // Mobile Long-Press (400 ms) + Scroll-Schutz für Karten-Klick
    let cardPressTimer = null;
    let longPressed    = false;
    let touchStartX    = 0;
    let touchStartY    = 0;
    let touchScrollSum = 0;
    let lastScrollDrag = 0;

    card.addEventListener('touchstart', (e) => {
        if (e.target.closest('.watchlist-btn, .watchlater-btn, .history-del-btn')) return;
        longPressed = false;
        const t = e.touches && e.touches[0];
        if (t) {
            touchStartX = t.clientX;
            touchStartY = t.clientY;
        }
        touchScrollSum = typeof _getScrollOffsetsSum === 'function' ? _getScrollOffsetsSum(card) : 0;
        if (card.classList.contains('history-selectable')) return;
        cardPressTimer = setTimeout(() => {
            longPressed = true;
            if (window._haptic) window._haptic.heavy();
            openCardContextMenu(item, card, e);
        }, 400);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        clearTimeout(cardPressTimer);
        const t = e.touches && e.touches[0];
        const scrolled = typeof _getScrollOffsetsSum === 'function'
            ? Math.abs(_getScrollOffsetsSum(card) - touchScrollSum) > 4
            : false;
        if (scrolled || (t && (Math.abs(t.clientX - touchStartX) > 8 || Math.abs(t.clientY - touchStartY) > 8))) {
            lastScrollDrag = Date.now();
        }
    }, { passive: true });

    card.addEventListener('touchend', () => clearTimeout(cardPressTimer), { passive: true });
    card.addEventListener('touchcancel', () => { clearTimeout(cardPressTimer); lastScrollDrag = Date.now(); }, { passive: true });

    card.addEventListener('click', (e) => {
        if (card.classList.contains('history-selectable')) return;
        if (e.target.closest?.('.watchlist-btn, .watchlater-btn, .history-del-btn')) return;
        if (longPressed || (Date.now() - lastScrollDrag) < 450) {
            e.stopPropagation();
            e.preventDefault();
            longPressed = false;
            return;
        }
        playVideo(item);
    });

    // Merkliste & Später ansehen: Scroll-geschützter Tap-Handler (ignoriert Wischen > 8px)
    const wlBtn = card.querySelector('.watchlist-btn');
    if (wlBtn) {
        bindSafeTap(wlBtn, () => toggleWatchlist(item, wlBtn), { stopPropagation: true });
    }

    const wlaterBtn = card.querySelector('.watchlater-btn');
    if (wlaterBtn) {
        bindSafeTap(wlaterBtn, () => toggleWatchLater(item, wlaterBtn), { stopPropagation: true });
    }

    // Queue real thumbnail with per-card stagger to avoid burst loading
    const videoUrl = item.url_video_low || item.url_video;
    if (videoUrl) {
        const ck     = simpleHash('vod_' + videoUrl);
        const stagger = index * 80;
        setTimeout(() => {
            const el = document.getElementById(thumbnailId);
            if (el) queueRealThumbnail(videoUrl, ck, el, gradient);
        }, 150 + stagger);
    }

    card._videoItem = item;
    return card;
}

// ── Series Processing, Cache & Card ──────────────────────────────────────────

const _seriesDataCache = new Map();
const _seriesFetchInFlight = new Map();
const _seriesFetchQueue = [];
let _seriesActiveFetches = 0;
const _MAX_SERIES_FETCHES = 3;

/** Leert den Serien-Datencache (z. B. bei Profilwechsel oder AD-Filter-Änderung). */
function _clearSeriesCache() {
    _seriesDataCache.clear();
    // In-flight Promises weiterlaufen lassen; nur gecachte Einträge verwerfen.
    console.debug('[SeriesCache] Cache geleert');
}

function _enqueueSeriesFetchTask(taskFn) {
    return new Promise((resolve, reject) => {
        _seriesFetchQueue.push({ taskFn, resolve, reject });
        _drainSeriesFetchQueue();
    });
}

function _drainSeriesFetchQueue() {
    while (_seriesActiveFetches < _MAX_SERIES_FETCHES && _seriesFetchQueue.length > 0) {
        const job = _seriesFetchQueue.shift();
        _seriesActiveFetches++;
        Promise.resolve()
            .then(job.taskFn)
            .then(job.resolve, job.reject)
            .finally(() => {
                _seriesActiveFetches--;
                _drainSeriesFetchQueue();
            });
    }
}

/**
 * Verarbeitet eine Rohliste von Episoden einer Serie exakt nach einheitlichen Regeln:
 *  - Exakter Themen-Abgleich (trennt z.B. Hauptserie vs. Spin-offs)
 *  - Kinderschutz & AD-Filter
 *  - Klassifizierung Hauptfolgen vs. Extras (schützt Kurzfolgen bei Kinderserien)
 *  - Intelligente Deduplizierung (bevorzugt normale Fassung & Hauptsender, schützt Staffel-Kollisionen)
 *  - Gruppierung und Sortierung nach Staffel & Episode
 */
function _processSeriesEpisodes(seriesName, rawEpisodes = [], opts = {}) {
    const filterTopic = !!opts.filterTopic;
    const hideAD      = (typeof document !== 'undefined' && document.getElementById('hideAudioDescriptionToggle')?.checked) || false;
    const isKids      = typeof getActiveProfile === 'function' ? !!getActiveProfile()?.isKids : false;
    const targetNorm  = normalizeTopicKey(seriesName);

    let list = Array.isArray(rawEpisodes) ? [...rawEpisodes] : [];

    // Wenn die API wegen Wortsuche verwandte Themen mitliefert, nur das exakte Serienthema behalten
    if (filterTopic && targetNorm) {
        const exactTopicMatches = list.filter(ep => normalizeTopicKey(cleanTopic(ep.topic)) === targetNorm);
        if (exactTopicMatches.length >= 1) {
            list = exactTopicMatches;
        }
    }

    if (isKids && typeof filterKidsSafe === 'function') {
        list = filterKidsSafe(list);
    }
    if (hideAD && typeof isAudioDescription === 'function') {
        list = list.filter(ep => !isAudioDescription(ep));
    }

    // Nur dann Kurzvideos (< 4 Min.) als Extras aussortieren, wenn die Serie auch echte Hauptfolgen (> 5 Min.) hat
    const hasLongEpisodes = list.some(ep => parseInt(ep.duration || '0', 10) > 300);

    const fullEpisodesList = [];
    const rawExtrasList    = [];
    list.forEach(ep => {
        if (_isSeriesExtra(ep, hasLongEpisodes)) rawExtrasList.push(ep);
        else fullEpisodesList.push(ep);
    });

    // Primärsender ermitteln (häufigster Sender der Hauptfolgen)
    const channelCounts = {};
    fullEpisodesList.forEach(ep => {
        const ch = ep.channel || 'DEFAULT';
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    });
    let primaryChannel = list[0]?.channel || 'DEFAULT';
    let maxCount       = -1;
    Object.entries(channelCounts).forEach(([ch, count]) => {
        if (count > maxCount) { maxCount = count; primaryChannel = ch; }
    });

    // Helper: Bessere Variante bei gleicher Episode auswählen
    const isBetterVariant = (existing, candidate, candidateAcc, candidateChannel) => {
        if (existing._isAccessible && !candidateAcc) return true;
        if (existing._isAccessible === candidateAcc) {
            if (candidateChannel === primaryChannel && existing.channel !== primaryChannel) return true;
            if (candidateChannel === existing.channel && (candidate.duration || 0) > (existing.duration || 0)) return true;
        }
        return false;
    };

    // Hauptfolgen deduplizieren
    const episodeMap = new Map();
    fullEpisodesList.forEach(ep => {
        const parser      = new EpisodeParser(ep.title, ep.description);
        const parseResult = parser.parse();
        const s           = parseResult.season  || 1;
        const e           = parseResult.episode || 0;
        const cleanT      = cleanEpisodeTitle(ep.title);
        const coreTitle   = _episodeDedupTitle(ep.title, seriesName);
        const baseKey     = (e > 0) ? `s${s}_e${e}` : `t_${coreTitle || cleanT.toLowerCase()}`;

        let epKey = baseKey;
        if (e > 0 && episodeMap.has(baseKey)) {
            const existingSameNum = episodeMap.get(baseKey);
            if (!_titlesReferToSameEpisode(existingSameNum._coreTitle, coreTitle)) {
                epKey = `${baseKey}__${coreTitle}`;
            }
        }

        const isAcc    = typeof isAccessibleVariant === 'function' ? isAccessibleVariant(ep) : isAudioDescription(ep);
        const enriched = {
            ...ep,
            title: cleanT,
            parsedSeason: s,
            parsedEpisode: e,
            isAD: isAudioDescription(ep),
            _isAccessible: isAcc,
            _coreTitle: coreTitle,
            parseConfidence: parseResult.confidence,
            parsePattern: parseResult.pattern
        };

        const existing = episodeMap.get(epKey);
        if (!existing || isBetterVariant(existing, enriched, isAcc, ep.channel)) {
            episodeMap.set(epKey, enriched);
        }
    });

    let parsedEpisodes = Array.from(episodeMap.values());
    if (parsedEpisodes.length === 0 && fullEpisodesList.length > 0) {
        parsedEpisodes = fullEpisodesList.map(ep => {
            const r = new EpisodeParser(ep.title, ep.description).parse();
            return { ...ep, title: cleanEpisodeTitle(ep.title), parsedSeason: r.season || 1, parsedEpisode: r.episode || 0 };
        });
    }
    // Fallback wenn ausschließlich Clips vorhanden sind: nur dann alle als Episoden zeigen,
    // wenn keine Trennung nötig ist (und nicht doppelt als Extras aufführen!)
    let extrasList = [];
    if (parsedEpisodes.length === 0 && rawExtrasList.length > 0) {
        parsedEpisodes = rawExtrasList.map(ep => ({ ...ep, title: cleanEpisodeTitle(ep.title), parsedSeason: 1, parsedEpisode: 0 }));
    } else {
        // Extras separat deduplizieren
        const extrasMap = new Map();
        rawExtrasList.forEach(ep => {
            const core  = _episodeDedupTitle(ep.title, seriesName) || cleanEpisodeTitle(ep.title).toLowerCase();
            const isAcc = typeof isAccessibleVariant === 'function' ? isAccessibleVariant(ep) : isAudioDescription(ep);
            const ex    = extrasMap.get(core);
            const enriched = { ...ep, title: cleanEpisodeTitle(ep.title), _isAccessible: isAcc };
            if (!ex || (ex._isAccessible && !isAcc)) extrasMap.set(core, enriched);
        });
        extrasList = Array.from(extrasMap.values());
    }

    // Nach Staffel & Episode sortieren
    const seasonMap = new Map();
    parsedEpisodes.forEach(ep => {
        const season = ep.parsedSeason || 1;
        if (!seasonMap.has(season)) seasonMap.set(season, []);
        seasonMap.get(season).push(ep);
    });

    const sortedSeasons = Array.from(seasonMap.keys()).sort((a, b) => a - b);
    sortedSeasons.forEach(season => {
        const eps = seasonMap.get(season);
        eps.sort((a, b) => {
            const epA = parseInt(a.parsedEpisode, 10) || 0;
            const epB = parseInt(b.parsedEpisode, 10) || 0;
            if (epA > 0 && epB > 0) return epA - epB;
            if (epA > 0) return -1;
            if (epB > 0) return 1;
            return (parseInt(a.timestamp, 10) || 0) - (parseInt(b.timestamp, 10) || 0);
        });
    });

    return {
        rawEpisodes: list,
        parsedEpisodes,
        extrasList,
        seasonMap,
        sortedSeasons,
        primaryChannel,
        totalSeasons: Math.max(1, sortedSeasons.length)
    };
}

/**
 * Lädt alle verfügbaren Episoden einer Serie gecacht & throttled (max. 3 parallele Requests)
 * und gibt das exakt verarbeitete Ergebnis zurück, sodass Serien-Kachel und Detailseite
 * immer dieselbe Folgen- und Staffelzahl anzeigen.
 */
async function _fetchSeriesDataCached(seriesName, sampleEpisodes = []) {
    const isKids   = typeof getActiveProfile === 'function' ? !!getActiveProfile()?.isKids : false;
    const hideAD   = (typeof document !== 'undefined' && document.getElementById('hideAudioDescriptionToggle')?.checked) || false;
    const norm     = normalizeTopicKey(seriesName) || (seriesName || '').toLowerCase();
    const cacheKey = `${norm}__${isKids ? 'k' : 'a'}__${hideAD ? 'na' : 'ad'}`;

    const cached = _seriesDataCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < 5 * 60 * 1000) {
        return cached.data;
    }

    if (_seriesFetchInFlight.has(cacheKey)) {
        return _seriesFetchInFlight.get(cacheKey);
    }

    const promise = _enqueueSeriesFetchTask(async () => {
        let mergedEpisodes = [...(sampleEpisodes || [])];
        let hasMoreThanLimit = false;

        try {
            const payload = {
                queries: [{ fields: ['topic'], query: seriesName }],
                sortBy: 'timestamp', sortOrder: 'desc', future: true, offset: 0, size: 200
            };
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const data    = await response.json();
                const fetched = data.result?.results || [];
                const rawTot  = data.result?.total || 0;
                hasMoreThanLimit = fetched.length >= 200 && rawTot > fetched.length;

                if (fetched.length > 0) {
                    const seen   = new Set();
                    const merged = [];
                    [...fetched, ...(sampleEpisodes || [])].forEach(ep => {
                        const key = typeof getVideoProgressKey === 'function'
                            ? getVideoProgressKey(ep)
                            : (ep.id || ep.url_video_hd || ep.url_video || ep.title);
                        if (key && !seen.has(key)) { seen.add(key); merged.push(ep); }
                    });
                    mergedEpisodes = merged;
                }
            }
        } catch (e) {
            console.warn('[_fetchSeriesDataCached] API-Fehler für', seriesName, e);
        }

        const processed = _processSeriesEpisodes(seriesName, mergedEpisodes, { filterTopic: true });
        const result = { ...processed, hasMoreThanLimit };
        _seriesDataCache.set(cacheKey, { ts: Date.now(), data: result });
        return result;
    }).finally(() => {
        _seriesFetchInFlight.delete(cacheKey);
    });

    _seriesFetchInFlight.set(cacheKey, promise);
    return promise;
}

/**
 * Creates a series card that represents a grouped set of episodes.
 * Shows TMDB poster/backdrop when available, falls back to real-frame thumbnail.
 * Synchronizes episode & season counts with openSeriesDetail via shared cache.
 *
 * @param {string}   seriesName  Display name of the series (from topic field)
 * @param {object[]} episodes    Sample episodes used for first-episode preview
 * @returns {HTMLElement}
 */
function createSeriesCard(seriesName, episodes) {
    const card = document.createElement('div');
    card.className = 'series-card';

    const localProcessed = _processSeriesEpisodes(seriesName, episodes, { filterTopic: false });
    const initCount      = localProcessed.parsedEpisodes.length || episodes.length;
    const firstEpisode   = localProcessed.parsedEpisodes[0] || episodes[0] || {};
    const gradient       = getChannelGradient(firstEpisode.channel);
    const thumbnailId    = `thumb-${++thumbIdCounter}`;
    const countBadgeId   = `scount_b_${thumbIdCounter}`;
    const countMetaId    = `scount_m_${thumbIdCounter}`;

    card.innerHTML = `
        <div class="series-card-thumbnail" id="${thumbnailId}" style="background:${gradient};">
            <span class="sender-logo thumb-overlay-logo">${firstEpisode.channel || ''}</span>
            <div class="duration-badge" style="display:inline-flex;align-items:center;gap:4px;">
                <i class="fas fa-layer-group"></i> <span id="${countBadgeId}">${initCount} ${initCount === 1 ? 'Folge' : 'Folgen'}</span>
            </div>
        </div>
        <div class="series-card-content">
            <h3 class="series-card-title">${seriesName}</h3>
            <div class="series-card-meta">
                <span class="channel-badge">${firstEpisode.channel || ''}</span>
                <span class="channel-badge" style="background:rgba(99,102,241,0.18);color:#818cf8;font-size:0.72rem;"><i class="fas fa-tv"></i> Serie</span>
                <span id="${countMetaId}">${initCount} ${initCount === 1 ? 'Folge' : 'Folgen'}</span>
            </div>
        </div>
    `;

    const openSeries = () => openSeriesDetail(seriesName, episodes);
    if (typeof bindSafeTap === 'function') {
        bindSafeTap(card, openSeries, { preventDefault: false });
    } else {
        card.addEventListener('click', openSeries);
    }

    // Async: Exakte deduplizierte Folgen- & Staffelzahl über denselben Cache wie Detailseite laden
    (async () => {
        try {
            const data    = await _fetchSeriesDataCached(seriesName, episodes);
            const count   = data.parsedEpisodes.length;
            const seasons = data.totalSeasons || 1;
            if (count > 0) {
                const suffix   = data.hasMoreThanLimit ? '+' : '';
                const epLabel  = `${count}${suffix} ${count === 1 ? 'Folge' : 'Folgen'}`;
                const metaText = seasons > 1 ? `${seasons} Staffeln · ${epLabel}` : epLabel;
                const badgeEl  = document.getElementById(countBadgeId);
                const metaEl   = document.getElementById(countMetaId);
                if (badgeEl) badgeEl.textContent = epLabel;
                if (metaEl)  metaEl.textContent  = metaText;
            }
        } catch (e) {}
    })();

    // Async: load TMDB poster/backdrop, fall back to real-frame thumbnail
    (async () => {
        try {
            const bestSearchName = findBestSeriesSearchQuery(seriesName, episodes);
            const tmdb = await searchTMDBSeries(bestSearchName, firstEpisode);
            if (tmdb && (tmdb.backdrop_path || tmdb.poster_path)) {
                const imgPath = tmdb.backdrop_path || tmdb.poster_path;
                const imgUrl  = getTMDBPosterURL(imgPath);
                const el = document.getElementById(thumbnailId);
                if (el) {
                    el.style.backgroundImage    = `url(${imgUrl})`;
                    el.style.backgroundSize     = 'cover';
                    el.style.backgroundPosition = 'center';
                }
            } else {
                const videoUrl = firstEpisode.url_video_low || firstEpisode.url_video;
                if (videoUrl) {
                    const ck = simpleHash('series_' + videoUrl);
                    setTimeout(() => {
                        const el = document.getElementById(thumbnailId);
                        if (el) queueRealThumbnail(videoUrl, ck, el, gradient);
                    }, 120);
                }
            }
        } catch (e) {
            const videoUrl = firstEpisode.url_video_low || firstEpisode.url_video;
            if (videoUrl) {
                const ck = simpleHash('series_' + videoUrl);
                setTimeout(() => {
                    const el = document.getElementById(thumbnailId);
                    if (el) queueRealThumbnail(videoUrl, ck, el, gradient);
                }, 120);
            }
        }
    })();

    return card;
}

// ── Series Detail Page ───────────────────────────────────────────────────────

/**
 * Opens the series detail page, fetches all episodes from the API,
 * integrates TMDB metadata, deduplicates episodes, groups by season,
 * and renders cards.
 *
 * @param {string}   seriesName  Topic / series name string
 * @param {object[]} episodes    Initial sample episodes (supplemented by API fetch)
 */
async function openSeriesDetail(seriesName, episodes) {
    console.log('[openSeriesDetail] Öffne Serie:', seriesName, 'mit', episodes?.length || 0, 'Episoden');

    if (currentPage && currentPage !== 'seriesDetail') {
        window._seriesPreviousPage = currentPage;
    }
    navigateToPage('seriesDetail');

    const titleEl = document.getElementById('seriesDetailTitle');
    if (titleEl) titleEl.innerHTML = `<i class="fas fa-tv"></i> ${seriesName}`;

    // Setup back button immediately so user can always go back
    const backBtn = document.getElementById('backFromSeries');
    if (backBtn) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            try {
                if (window._haptic) window._haptic.tick();
                const target = (window._seriesPreviousPage && window._seriesPreviousPage !== 'seriesDetail')
                    ? window._seriesPreviousPage
                    : 'home';
                navigateToPage(target);
            } catch (err) {
                console.error('Back button error:', err);
                navigateToPage('home');
            }
        };
    }

    const episodesGrid = document.getElementById('seriesEpisodesGrid');
    const seriesInfo   = document.getElementById('seriesInfo');
    if (episodesGrid) episodesGrid.innerHTML = '';

    try {
        const seriesData = await _fetchSeriesDataCached(seriesName, episodes);
        const {
            rawEpisodes,
            parsedEpisodes,
            extrasList,
            seasonMap,
            sortedSeasons,
            primaryChannel,
            totalSeasons,
            hasMoreThanLimit
        } = seriesData;

        // ── TMDB Lookup ──────────────────────────────────────────────────────
        let tmdbSeries  = null;
        let tmdbDetails = null;
        try {
            const bestSearchName = findBestSeriesSearchQuery(seriesName, rawEpisodes.length ? rawEpisodes : episodes);
            tmdbSeries = await searchTMDBSeries(bestSearchName, rawEpisodes[0] || episodes[0]);
            if (tmdbSeries?.id) {
                tmdbDetails = await getTMDBSeriesDetails(tmdbSeries.id);
            }
        } catch (e) {
            console.error('[openSeriesDetail] TMDB-Fehler:', e);
        }

        // ── Series Info Panel ─────────────────────────────────────────────────
        let bestDescription = '';
        if (tmdbDetails?.overview?.trim().length > 10)  bestDescription = tmdbDetails.overview.trim();
        else if (tmdbSeries?.overview?.trim().length > 10) bestDescription = tmdbSeries.overview.trim();
        else bestDescription = `Alle verfügbaren Staffeln und Folgen der Serie „${seriesName}" (${primaryChannel}).`;

        const posterId = `series_poster_${btoa(encodeURIComponent(seriesName)).substring(0, 16)}`;

        let posterHTML  = `<i class="fas fa-tv" style="opacity:0.3;"></i>`;
        let posterStyle = '';
        if (tmdbDetails?.poster_path) {
            posterStyle = `style="background-image:url(${getTMDBPosterURL(tmdbDetails.poster_path)});background-size:cover;background-position:center;"`;
            posterHTML  = '';
        }

        if (seriesInfo) {
            if (tmdbDetails?.backdrop_path) {
                seriesInfo.style.backgroundImage    = `linear-gradient(to right, rgba(9,9,11,0.95) 30%, rgba(9,9,11,0.45) 100%), url(${getTMDBBackdropURL(tmdbDetails.backdrop_path)})`;
                seriesInfo.style.backgroundSize     = 'cover';
                seriesInfo.style.backgroundPosition = 'center';
            } else {
                seriesInfo.style.backgroundImage = '';
            }

            const isSubbed = getAbos().some(a => a.term.toLowerCase() === seriesName.toLowerCase());
            const epSuffix = hasMoreThanLimit ? '+' : '';
            seriesInfo.innerHTML = `
                <div class="series-info-poster" id="${posterId}" ${posterStyle}>${posterHTML}</div>
                <div class="series-info-details">
                    <h3>${seriesName}</h3>
                    <div class="series-info-meta">
                        <span><i class="fas fa-tv"></i> ${primaryChannel}</span>
                        <span><i class="fas fa-layer-group"></i> ${totalSeasons} ${totalSeasons === 1 ? 'Staffel' : 'Staffeln'}</span>
                        <span><i class="fas fa-list"></i> ${parsedEpisodes.length}${epSuffix} ${parsedEpisodes.length === 1 ? 'Folge' : 'Folgen'}</span>
                        ${extrasList.length > 0 ? `<span><i class="fas fa-film"></i> ${extrasList.length} Extras</span>` : ''}
                        ${tmdbDetails?.first_air_date ? `<span><i class="fas fa-calendar"></i> ${tmdbDetails.first_air_date.split('-')[0]}</span>` : ''}
                        ${tmdbDetails?.vote_average ? `<span><i class="fas fa-star" style="color:#eab308;"></i> ${tmdbDetails.vote_average.toFixed(1)}/10</span>` : ''}
                    </div>
                    <div class="series-info-description">${bestDescription}</div>
                    <div style="margin-top:1rem;">
                        <button id="seriesDetailSubBtn" class="action-btn${isSubbed ? ' btn-subscribed' : ''}" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;border-radius:8px;width:auto;">
                            <i class="fas ${isSubbed ? 'fa-bell-slash' : 'fa-bell'}"></i> ${isSubbed ? 'Abonniert' : 'Serie abonnieren'}
                        </button>
                    </div>
                </div>
            `;

            const subBtn = document.getElementById('seriesDetailSubBtn');
            if (subBtn) {
                subBtn.onclick = () => {
                    const abos = getAbos();
                    const idx  = abos.findIndex(a => a.term.toLowerCase() === seriesName.toLowerCase());
                    if (idx >= 0) {
                        abos.splice(idx, 1);
                        subBtn.classList.remove('btn-subscribed');
                        subBtn.innerHTML = '<i class="fas fa-bell"></i> Serie abonnieren';
                    } else {
                        abos.push({ term: seriesName, addedAt: Date.now() });
                        subBtn.classList.add('btn-subscribed');
                        subBtn.innerHTML = '<i class="fas fa-bell-slash"></i> Abonniert';
                    }
                    saveAbos(abos);
                };
            }
        }

        // ── Render Season Sections ────────────────────────────────────────────
        if (episodesGrid) {
            episodesGrid.innerHTML = '';

            sortedSeasons.forEach(seasonNum => {
                const seasonEpisodes = seasonMap.get(seasonNum) || [];

                const seasonHeader = document.createElement('div');
                seasonHeader.className = 'series-season-header';
                seasonHeader.innerHTML = `
                    <h3>
                        <i class="fas fa-layer-group"></i> Staffel ${seasonNum}
                        <span>(${seasonEpisodes.length} ${seasonEpisodes.length === 1 ? 'Folge' : 'Folgen'})</span>
                    </h3>
                `;
                episodesGrid.appendChild(seasonHeader);

                seasonEpisodes.forEach((episode, idx) => {
                    episodesGrid.appendChild(createVideoCard(episode, idx));
                });
            });

            if (extrasList.length > 0) {
                const extrasHeader = document.createElement('div');
                extrasHeader.className = 'series-extras-header';
                extrasHeader.innerHTML = `
                    <h3>
                        <i class="fas fa-film"></i> Extras, Clips &amp; Bonus
                        <span>(${extrasList.length} ${extrasList.length === 1 ? 'Clip' : 'Clips'})</span>
                    </h3>
                `;
                episodesGrid.appendChild(extrasHeader);
                extrasList.forEach((extra, idx) => episodesGrid.appendChild(createVideoCard(extra, idx)));
            }
        }

        console.log('[openSeriesDetail] ✓ Detail-Seite erfolgreich geladen');
    } catch (fatalErr) {
        console.error('[openSeriesDetail] Schwerer Fehler:', fatalErr);
        if (episodesGrid && episodesGrid.children.length === 0) {
            (episodes || []).forEach((ep, idx) => episodesGrid.appendChild(createVideoCard(ep, idx)));
        }
    }
}

// ── UI State Helpers ─────────────────────────────────────────────────────────

/** Shows/hides the loading state overlay. */
function showLoading(show) {
    if (loadingState) loadingState.style.display = show ? 'flex' : 'none';
    if (show) {
        if (emptyState) emptyState.style.display = 'none';
        if (videoGrid)  videoGrid.innerHTML       = '';
    }
}

/** Shows/hides the empty state overlay. */
function showEmpty(show) {
    if (emptyState) emptyState.style.display = show ? 'flex' : 'none';
    if (show) {
        if (loadingState) loadingState.style.display = 'none';
        if (videoGrid)    videoGrid.innerHTML          = '';
    }
}

console.log('[cards.js] loaded');

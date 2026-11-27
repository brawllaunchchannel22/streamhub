/**
 * ============================================================================
 * StreamHub — Hilfsfunktionen, Touch-Schutz & Dialoge (js/utils.js)
 * ============================================================================
 * Enthält Formatierung, Kindersicherung, Benachrichtigungen (Toasts),
 * Android-sichere Bestätigungsdialoge und den Touch-Scroll-vs-Tap-Schutz.
 */

// ── Touch-Scroll-Schutz für Android & Mobile ──────────────────────────────────

/**
 * Summiert Scroll-Offsets über window und alle scrollbaren Eltern-Elemente
 * (wichtig für Modals & Sidebars mit overflow-y: auto unter Android).
 * @param {HTMLElement|null} node
 * @returns {number}
 */
function _getScrollOffsetsSum(node) {
    let sum = (typeof window !== 'undefined' ? (window.scrollY || 0) + (window.scrollX || 0) : 0);
    let cur = node && node.parentElement;
    while (cur) {
        sum += (cur.scrollTop || 0) + (cur.scrollLeft || 0);
        cur = cur.parentElement;
    }
    return sum;
}

/**
 * Bindet einen Klick-/Tap-Handler so an ein Element, dass versehentliches
 * Tippen während des Scrollens (Finger rutscht über "Später ansehen" etc.)
 * zuverlässig ignoriert wird.
 *
 * @param {HTMLElement|null} el - Zielelement
 * @param {Function} handler - Callback bei echtem Tap/Klick
 * @param {Object} [options]
 * @param {number} [options.threshold=8] - Maximale Fingerbewegung in px für gültigen Tap
 * @param {number} [options.maxDuration=600] - Maximale Tip-Dauer in ms
 * @param {boolean} [options.stopPropagation=false] - Event-Bubbling unterbinden
 * @param {boolean} [options.preventDefault=true] - Standard-Click nach gültigem Tap blocken
 */
function bindSafeTap(el, handler, options = {}) {
    if (!el || typeof handler !== 'function') return;

    const threshold = typeof options.threshold === 'number' ? options.threshold : 8;
    const maxDuration = typeof options.maxDuration === 'number' ? options.maxDuration : 600;
    const stopPropagation = !!options.stopPropagation;
    const preventDefault = options.preventDefault !== false;

    let startX = 0;
    let startY = 0;
    let startScrollSum = 0;
    let startTime = 0;
    let moved = false;
    let touching = false;

    el.addEventListener('touchstart', (e) => {
        if (stopPropagation) e.stopPropagation();
        if (!e.touches || e.touches.length !== 1) {
            moved = true;
            touching = false;
            return;
        }
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startScrollSum = _getScrollOffsetsSum(el);
        startTime = Date.now();
        moved = false;
        touching = true;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        if (!touching || moved) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (dx > threshold || dy > threshold || Math.abs(_getScrollOffsetsSum(el) - startScrollSum) > 4) {
            moved = true;
            el._lastMovedTapTime = Date.now();
        }
    }, { passive: true });

    el.addEventListener('touchcancel', () => {
        moved = true;
        touching = false;
        el._lastMovedTapTime = Date.now();
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        if (!touching) return;
        touching = false;

        const t = e.changedTouches && e.changedTouches[0];
        const dx = t ? Math.abs(t.clientX - startX) : 0;
        const dy = t ? Math.abs(t.clientY - startY) : 0;
        const scrolled = Math.abs(_getScrollOffsetsSum(el) - startScrollSum) > 4;
        const elapsed = Date.now() - startTime;

        if (moved || scrolled || dx > threshold || dy > threshold || elapsed > maxDuration) {
            // Finger hat gescrollt oder zu lange gehalten -> kein Button-Klick!
            el._lastMovedTapTime = Date.now();
            return;
        }

        if (preventDefault) e.preventDefault();
        if (stopPropagation) e.stopPropagation();
        el._lastSafeTapTime = Date.now();
        handler(e);
    }, { passive: !preventDefault });

    el.addEventListener('click', (e) => {
        const now = Date.now();
        // Verhindere doppeltes Auslösen (Ghost-Click nach touchend) oder verirrten Click nach Scroll
        if (el._lastSafeTapTime && (now - el._lastSafeTapTime) < 450) {
            if (stopPropagation) e.stopPropagation();
            return;
        }
        if (el._lastMovedTapTime && (now - el._lastMovedTapTime) < 450) {
            e.preventDefault();
            if (stopPropagation) e.stopPropagation();
            return;
        }
        if (stopPropagation) e.stopPropagation();
        handler(e);
    });
}

// ── Formatierungs- & Text-Hilfen ──────────────────────────────────────────────

/**
 * Formatiert ein Datum relativ ("Heute", "Gestern", "Vor X Tagen") oder als TT.MM.JJJJ.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Heute';
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    return date.toLocaleDateString('de-DE');
}

/**
 * Formatiert Sekunden in "MM:SS" bzw. "H:MM:SS".
 * @param {number|string} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
    const total = Math.floor(Number(seconds));
    if (!isFinite(total) || total <= 0) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Formatiert Byte-Werte lesbar (B, KB, MB).
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Einfacher schneller djb2-Hash für Thumbnail-Cache-Keys.
 * @param {string} str
 * @returns {string}
 */
function simpleHash(str) {
    let h = 5381;
    const s = String(str || '');
    for (let i = 0; i < Math.min(s.length, 300); i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
        h = h >>> 0;
    }
    return h.toString(36);
}

/** Entfernt gemeinsame Hörfassungs-/AD-Suffixe aus Titeln und Themen */
function _stripAdTags(str) {
    if (!str) return '';
    return String(str)
        .replace(/\s*[\(\[]Hörfassung[\)\]]/gi, '')
        .replace(/\s*[\(\[]Audiodeskription[\)\]]/gi, '')
        .replace(/\s*[\(\[]AD[\)\]]/gi, '')
        .replace(/\s*-\s*Hörfassung/gi, '')
        .replace(/\s*-\s*Audiodeskription/gi, '')
        .trim();
}

/** Entfernt "(Hörfassung)" / "(AD)" Zusätze aus Sendungstiteln */
function cleanEpisodeTitle(title) {
    return _stripAdTags(title);
}

/** Entfernt "(Hörfassung)" / "(AD)" Zusätze aus Themennamen */
function cleanTopic(topic) {
    return _stripAdTags(topic)
        .replace(/\s*[\(\[](?:Gebärdensprache|DGS)[\)\]]/gi, '')
        .trim();
}

/** Prüft, ob ein Video eine Audiodeskription / Hörfassung ist */
function isAudioDescription(item) {
    if (!item) return false;
    const text = `${item.title || ''} ${item.topic || ''} ${item.description || ''}`.toLowerCase();
    return text.includes('hörfassung') || text.includes('audiodeskription');
}

/** Prüft, ob ein Video eine barrierefreie Zweitfassung (Hörfassung oder Gebärdensprache) ist */
function isAccessibleVariant(item) {
    if (!item) return false;
    if (isAudioDescription(item)) return true;
    const text = `${item.title || ''} ${item.topic || ''}`.toLowerCase();
    return text.includes('gebärdensprache') || /\(\s*(?:dgs|ad)\s*\)/i.test(text);
}

/**
 * Bereinigt Mediathek-Titel von Qualitäts-/Episoden-Tags für bessere TMDB-Treffer.
 * Beispiel: "Tatort: Das schwarze Blut (HD)" -> "Tatort: Das schwarze Blut"
 */
function _cleanTitleForTmdb(raw) {
    if (!raw) return '';
    return raw
        .replace(/\(\s*S?\d+[\s\/E]*\d*\s*\)/gi, '')
        .replace(/\b(HD|SD|4K|MPEG4?|UHD|HFR|UT|AD)\b/gi, '')
        .replace(/\b(Hörfassung|Audiodeskription|Gebärdensprache|Untertitel|Subtitles|Originalton|Re-Upload)\b/gi, '')
        .replace(/[-–:]?\s*(Folge|Episode|Teil|Part|Staffel|Season|Series)\s*\d+[^,)]*/gi, '')
        .replace(/\bS\d{1,2}E\d{1,2}\b/gi, '')
        .replace(/\b(vom|am)?\s*\d{1,2}\.\d{1,2}\.\d{2,4}\b/gi, '')
        .replace(/\(\d{4}\)/g, '')
        .replace(/^[-–:]+\s*/g, '')
        .replace(/[-–:]+\s*$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** Ähnlichkeit zweier Titel (0 bis 1) für TMDB-Matching */
function _titleSimilarity(a, b) {
    a = String(a || '').toLowerCase().trim();
    b = String(b || '').toLowerCase().trim();
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.startsWith(b) || b.startsWith(a)) return 0.9;
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    if (longer.includes(shorter)) return 0.7;
    return 0;
}

// ── Kindersicherung ───────────────────────────────────────────────────────────

/**
 * Filtert Videos heraus, die für Kinderprofile ungeeignet sind.
 * Wenn kein Kinderprofil aktiv ist, bleiben alle Einträge erhalten.
 * @param {Array} items
 * @returns {Array}
 */
function filterKidsSafe(items) {
    if (!items || !Array.isArray(items)) return [];
    const active = typeof getActiveProfile === 'function' ? getActiveProfile() : null;
    if (!active || !active.isKids) return items;

    return items.filter(item => {
        const text = `${item.title || ''} ${item.topic || ''} ${item.description || ''}`;
        return !_KIDS_BLOCKED_REGEXES.some(re => re.test(text));
    });
}

// ── UI-Helfer (Clipboard, Toast-Benachrichtigungen, Bestätigungs-Modal) ───────

/** Kopiert Text in die Zwischenablage mit Fallback für ältere WebViews */
function copyToClipboard(text) {
    const fallbackCopy = () => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(textarea);
        showNotification('Link in Zwischenablage kopiert!', 'success');
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Link in Zwischenablage kopiert!', 'success');
        }).catch(fallbackCopy);
    } else {
        fallbackCopy();
    }
}

/**
 * Zeigt eine Toast-Nachricht unten rechts an.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @param {Object|null} [action=null] Optional { text, callback }
 */
function showNotification(message, type = 'info', action = null) {
    if (typeof document === 'undefined' || !document.body) return;

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
        ">${action.text}</button>`;
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
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 350);
        });
    }

    if (action) {
        const actBtn = toast.querySelector('.toast-action-btn');
        if (actBtn) {
            actBtn.addEventListener('click', () => {
                action.callback();
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-20px)';
                setTimeout(() => toast.remove(), 350);
            });
        }
    }

    container.appendChild(toast);

    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    raf(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    const duration = action ? 7000 : 4000;
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 350);
        }
    }, duration);
}

/**
 * Android-kompatibler Bestätigungsdialog (vermeidet blockiertes window.confirm in WebView).
 */
function _showConfirmDialog(title, message, onConfirm, confirmLabel = 'Bestätigen', isDanger = false) {
    try {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' &&
            !/android/i.test(navigator.userAgent || '') && typeof Capacitor === 'undefined') {
            if (window.confirm(`${title}\n\n${message}`)) onConfirm();
            return;
        }
    } catch (e) {}

    if (typeof document === 'undefined' || !document.body) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
    const btnBg = isDanger
        ? 'linear-gradient(135deg,#dc2626,#ef4444)'
        : 'linear-gradient(135deg,#4f46e5,#6366f1)';
    overlay.innerHTML = `
        <div style="background:#1e1e2e;border-radius:20px;padding:28px;max-width:480px;width:100%;border:1px solid rgba(255,255,255,0.1);">
            <h3 style="margin:0 0 12px;color:#fff;font-size:1.1rem;">${title}</h3>
            <p style="color:#94a3b8;font-size:0.9rem;white-space:pre-line;margin-bottom:24px;">${message}</p>
            <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button id="_confirmNo" style="padding:10px 20px;background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);border-radius:100px;cursor:pointer;font-size:0.9rem;">Abbrechen</button>
                <button id="_confirmYes" style="padding:10px 22px;background:${btnBg};color:#fff;border:none;border-radius:100px;cursor:pointer;font-size:0.9rem;font-weight:600;">${confirmLabel}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    const noBtn = overlay.querySelector('#_confirmNo');
    const yesBtn = overlay.querySelector('#_confirmYes');
    if (noBtn) noBtn.onclick = () => overlay.remove();
    if (yesBtn) yesBtn.onclick = () => { overlay.remove(); onConfirm(); };
}

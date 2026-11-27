/**
 * ============================================================================
 * StreamHub — UI-Komponenten, Gesten, Zoom & Tastenkürzel (js/ui-controls.js)
 * ============================================================================
 * Beinhaltet allgemeine UI-Komfortfunktionen:
 *  - Custom Select Dropdowns (.cust-select) mit Touch-Scroll-Schutz
 *  - Grid-Zoom (Pinch auf Touchscreens, Strg+Mausrad am Desktop)
 *  - Pull-to-Refresh auf der Startseite
 *  - Predictive Back-Swipe Geste vom linken Bildschirmrand
 *  - M3 Haptisches Feedback (Android Vibration)
 *  - Sortier-Buttons & globale Tastaturkürzel (+ Shortcut-Overlay)
 *
 * Abhängigkeiten: config.js, state.js, utils.js, api.js, pages.js, player.js
 */

'use strict';

// ── Benutzerdefinierte Select-Dropdowns ────────────────────────────────────────

/** Initialisiert alle statischen .cust-select Wrapper mit Touch-Scroll-Schutz */
function initCustSelects() {
    document.querySelectorAll('.cust-select').forEach(cs => {
        const realSelect = document.getElementById(cs.dataset.target);
        if (!realSelect) return;

        const syncSelected = () => {
            const opts    = cs.querySelectorAll('.cust-opt');
            const trigger = cs.querySelector('.cust-select-trigger span');
            opts.forEach(o => {
                const active = o.dataset.value === realSelect.value;
                o.classList.toggle('selected', active);
                if (active && trigger) trigger.textContent = o.textContent;
            });
        };
        syncSelected();

        const trigger = cs.querySelector('.cust-select-trigger');
        if (!trigger || trigger._cssBound) return;
        trigger._cssBound = true;

        const openClose = () => {
            document.querySelectorAll('.cust-select.open').forEach(other => {
                if (other !== cs) other.classList.remove('open');
            });
            cs.classList.toggle('open');
        };

        if (typeof bindSafeTap === 'function') {
            bindSafeTap(trigger, openClose, { stopPropagation: true });
        } else {
            trigger.addEventListener('click', (e) => { e.stopPropagation(); openClose(); });
        }

        cs.querySelectorAll('.cust-opt').forEach(opt => {
            if (opt._cssBound) return;
            opt._cssBound = true;
            const choose = () => {
                realSelect.value = opt.dataset.value;
                realSelect.dispatchEvent(new Event('change', { bubbles: true }));
                syncSelected();
                cs.classList.remove('open');
            };
            if (typeof bindSafeTap === 'function') {
                bindSafeTap(opt, choose, { stopPropagation: true });
            } else {
                opt.addEventListener('click', (e) => { e.stopPropagation(); choose(); });
            }
        });
    });

    if (!document._custSelectOutsideBound) {
        document._custSelectOutsideBound = true;
        document.addEventListener('click', (e) => {
            if (e.target && e.target.closest && e.target.closest('.cust-select')) return;
            document.querySelectorAll('.cust-select.open').forEach(cs => cs.classList.remove('open'));
        });
    }
}

/** Wandelt ein dynamisch befülltes <select> in einen gestylten .cust-select Dropdown um */
function syncCustomSelect(selectEl) {
    if (!selectEl) return;
    selectEl.classList.add('has-cust-select');
    selectEl.setAttribute('style', 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;position:absolute !important;width:0 !important;height:0 !important;');

    let wrapper = selectEl.nextElementSibling;
    if (!wrapper || !wrapper.classList.contains('cust-select')) {
        const existingWrapper = selectEl.id && selectEl.parentNode
            ? selectEl.parentNode.querySelector(`.cust-select[data-target="${selectEl.id}"]`)
            : null;
        if (existingWrapper) {
            wrapper = existingWrapper;
        } else if (selectEl.parentNode) {
            wrapper = document.createElement('div');
            wrapper.className = 'cust-select';
            if (selectEl.id) wrapper.dataset.target = selectEl.id;
            selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
        }
    }
    if (!wrapper) return;

    const options = Array.from(selectEl.options || []);
    if (options.length === 0) {
        wrapper.style.display = 'none';
        return;
    }
    wrapper.style.display = 'block';

    const selectedOpt  = options.find(o => o.value === selectEl.value) || options.find(o => o.selected) || options[0];
    const selectedText = selectedOpt ? selectedOpt.textContent : '';

    wrapper.innerHTML = `
        <div class="cust-select-trigger"><span>${selectedText}</span><i class="fas fa-chevron-down"></i></div>
        <div class="cust-select-options">
            ${options.map(o => `<div class="cust-opt${o.value === selectEl.value ? ' selected' : ''}" data-value="${o.value}">${o.textContent}</div>`).join('')}
        </div>
    `;

    const trigger = wrapper.querySelector('.cust-select-trigger');
    const toggleOpen = () => {
        document.querySelectorAll('.cust-select.open').forEach(other => {
            if (other !== wrapper) other.classList.remove('open');
        });
        wrapper.classList.toggle('open');
    };
    if (typeof bindSafeTap === 'function') {
        bindSafeTap(trigger, toggleOpen, { stopPropagation: true });
    } else {
        trigger.addEventListener('click', (e) => { e.stopPropagation(); toggleOpen(); });
    }

    wrapper.querySelectorAll('.cust-opt').forEach(opt => {
        const chooseOpt = () => {
            selectEl.value = opt.dataset.value;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            wrapper.classList.remove('open');
            syncCustomSelect(selectEl);
        };
        if (typeof bindSafeTap === 'function') {
            bindSafeTap(opt, chooseOpt, { stopPropagation: true });
        } else {
            opt.addEventListener('click', (e) => { e.stopPropagation(); chooseOpt(); });
        }
    });
}
if (typeof window !== 'undefined') window.syncCustomSelect = syncCustomSelect;

function syncAllSelects() {
    initCustSelects();
    ['localSortBy', 'qualitySelector', 'subtitleSelector'].forEach(id => {
        const el = document.getElementById(id);
        if (el) syncCustomSelect(el);
    });
}
if (typeof window !== 'undefined') window.syncAllSelects = syncAllSelects;

// ── Grid Zoom (Pinch auf Touch / Strg+Scroll am Desktop) ──────────────────────

function _showGridPill(idx) {
    const labels = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    let pill = document.getElementById('_gridPill');
    if (!pill) {
        pill = document.createElement('div');
        pill.id = '_gridPill';
        pill.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(99,102,241,0.92);color:#fff;padding:6px 18px;border-radius:99px;font-size:0.85rem;font-weight:700;z-index:99999;pointer-events:none;transition:opacity 0.3s;';
        document.body.appendChild(pill);
    }
    pill.textContent = `Raster: ${labels[idx]}`;
    pill.style.opacity = '1';
    clearTimeout(pill._t);
    pill._t = setTimeout(() => { pill.style.opacity = '0'; }, 1200);
}

function applyGridSize(idx) {
    _gridSizeIdx = Math.max(0, Math.min(GRID_SIZES.length - 1, idx));
    localStorage.setItem('streamhubGridSize', _gridSizeIdx);
    const px = GRID_SIZES[_gridSizeIdx];
    const grid = document.getElementById('videoGrid');
    if (grid) grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${px}px, 1fr))`;
    _showGridPill(_gridSizeIdx);
}

function initGridZoom() {
    if (_gridSizeIdx < 0 || _gridSizeIdx >= GRID_SIZES.length) _gridSizeIdx = 3;
    const px = GRID_SIZES[_gridSizeIdx];
    const grid = document.getElementById('videoGrid');
    if (grid) grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${px}px, 1fr))`;

    document.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        applyGridSize(e.deltaY < 0 ? _gridSizeIdx + 1 : _gridSizeIdx - 1);
    }, { passive: false });

    let _pDist = null;
    let _pIdx  = _gridSizeIdx;
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            _pDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            _pIdx  = _gridSizeIdx;
        }
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 2 || _pDist === null) return;
        const d     = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const steps = Math.round((d / _pDist - 1) / 0.2);
        const ni    = _pIdx + steps;
        if (ni !== _gridSizeIdx) applyGridSize(ni);
    }, { passive: true });
    document.addEventListener('touchend', (e) => { if (e.touches.length < 2) _pDist = null; }, { passive: true });
}

// ── Pull-to-Refresh ───────────────────────────────────────────────────────────

function initPullToRefresh() {
    if (!document.getElementById('_spinStyle')) {
        const s = document.createElement('style');
        s.id = '_spinStyle';
        s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(s);
    }

    let startY = 0;
    let pulling = false;
    let indicator = null;

    const getIndicator = () => {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = '_ptr';
            indicator.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%) translateY(-60px);background:var(--primary-color,#6366f1);color:#fff;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;z-index:99999;transition:transform 0.2s,opacity 0.2s;opacity:0;pointer-events:none;';
            indicator.innerHTML = '<i class="fas fa-sync-alt"></i>';
            document.body.appendChild(indicator);
        }
        return indicator;
    };

    document.addEventListener('touchstart', (e) => {
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        if (scrollY <= 2 && currentPage === 'home' && !_searchInProgress) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) {
            const prog = Math.min(dy / 80, 1);
            const ind  = getIndicator();
            ind.style.opacity   = prog.toFixed(2);
            ind.style.transform = `translateX(-50%) translateY(${-60 + prog * 70}px) rotate(${prog * 360}deg)`;
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!pulling) return;
        pulling = false;
        const dy  = (e.changedTouches[0]?.clientY || startY) - startY;
        const ind = getIndicator();
        if (dy > 70 && currentPage === 'home' && !_searchInProgress) {
            ind.querySelector('i').style.animation = 'spin 0.6s linear infinite';
            loadDefaultContent().then(() => {
                ind.style.opacity = '0';
                ind.querySelector('i').style.animation = '';
            });
        } else {
            ind.style.opacity = '0';
        }
    }, { passive: true });
}

// ── Predictive Back Swipe ─────────────────────────────────────────────────────

function initPredictiveBackSwipe() {
    const EDGE_ZONE        = 30;
    const COMMIT_THRESHOLD = 0.35;

    let active     = false;
    let startX     = 0;
    let startY     = 0;
    let axisLocked = false;

    const backDrop = document.createElement('div');
    backDrop.id = '_backDrop';
    backDrop.style.cssText = 'position:fixed;inset:0;z-index:8888;background:var(--background,#09090b);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;opacity:0;pointer-events:none;transition:none;';
    backDrop.innerHTML = `
        <i class="fas fa-arrow-left" style="font-size:2.5rem;color:var(--primary-color,#6366f1);opacity:0.8;"></i>
        <span id="_backDropLabel" style="font-size:1rem;color:var(--text-secondary,#94a3b8);font-weight:500;">Zurück</span>
    `;
    document.body.appendChild(backDrop);

    const getMainEl = () => document.querySelector('.app-container') || document.querySelector('.main-content') || document.body;

    const getBackLabel = () => {
        const labels = { home: 'Startseite', history: 'Verlauf', watchlist: 'Merkliste', live: 'Live TV', local: 'Lokale Videos' };
        return labels[previousPage] || 'Zurück';
    };

    const resetGesture = () => {
        active = false;
        axisLocked = false;
        const main = getMainEl();
        main.style.transition   = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), border-radius 0.28s, box-shadow 0.28s';
        main.style.transform    = '';
        main.style.borderRadius = '';
        main.style.boxShadow    = '';
        setTimeout(() => { main.style.transition = ''; }, 300);
        backDrop.style.opacity  = '0';
    };

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1 && e.touches[0].clientX < EDGE_ZONE) {
            active = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            axisLocked = false;
            const lbl = document.getElementById('_backDropLabel');
            if (lbl) lbl.textContent = getBackLabel();
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!active) return;
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = x - startX;
        const dy = y - startY;

        if (!axisLocked) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                if (Math.abs(dy) > Math.abs(dx)) { active = false; return; }
                axisLocked = true;
            } else return;
        }
        if (dx <= 0) { resetGesture(); return; }

        const prog    = Math.min(dx / (window.innerWidth * 0.6), 1);
        const main    = getMainEl();
        main.style.transition   = 'none';
        main.style.transform    = `translateX(${dx * 0.5}px) scale(${1 - prog * 0.08})`;
        main.style.borderRadius = `${prog * 20}px`;
        main.style.boxShadow    = `${-20 * prog}px 0 60px rgba(0,0,0,0.4)`;
        backDrop.style.opacity  = (prog * 0.85).toFixed(2);
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!active) return;
        const prog = (e.changedTouches[0].clientX - startX) / window.innerWidth;
        active = false;
        const main = getMainEl();
        if (prog > COMMIT_THRESHOLD && previousPage && previousPage !== currentPage) {
            main.style.transition  = 'transform 0.22s cubic-bezier(0.4,0,0.2,1), border-radius 0.22s, box-shadow 0.22s';
            main.style.transform   = `translateX(${window.innerWidth * 0.7}px) scale(0.95)`;
            backDrop.style.opacity = '1';
            setTimeout(() => { navigateToPage(previousPage); resetGesture(); }, 220);
        } else {
            resetGesture();
        }
    }, { passive: true });

    document.addEventListener('touchcancel', () => { if (active) resetGesture(); }, { passive: true });
}

// ── Haptisches Feedback (Android M3) ──────────────────────────────────────────

function initHaptics() {
    if (typeof window === 'undefined') return;
    window._haptic = {
        tick: () => {
            try {
                if (window.AndroidNativeTheme?.hapticTick) window.AndroidNativeTheme.hapticTick();
                else if (navigator.vibrate) navigator.vibrate(5);
            } catch {}
        },
        heavy: () => {
            try {
                if (window.AndroidNativeTheme?.hapticHeavy) window.AndroidNativeTheme.hapticHeavy();
                else if (navigator.vibrate) navigator.vibrate(15);
            } catch {}
        }
    };

    document.addEventListener('touchstart', (e) => {
        const el = e.target.closest?.('.hamburger-item, .video-card, .action-btn, .btn-primary, .btn-secondary, .btn-back, .icon-btn, .close-btn, .nav-categories a, #loadMore, .filter-section select, a[href], button');
        if (el && window._haptic?.tick) window._haptic.tick();
    }, { passive: true });
}

// ── Sortier-Buttons ───────────────────────────────────────────────────────────

function initSortButtons() {
    const applySort = (sort) => {
        currentSort = sort;
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === sort));
        if (sort === 'relevanz')    currentResults = [...originalResults];
        else if (sort === 'datum')  currentResults = [...originalResults].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        else if (sort === 'dauer')  currentResults = [...originalResults].sort((a, b) => (b.duration  || 0) - (a.duration  || 0));
        currentOffset    = 0;
        displayedResults = [];
        displayResults();
    };

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => applySort(btn.dataset.sort));
    });
}

// ── Tastaturkürzel & Shortcut-Overlay ────────────────────────────────────────

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);

        if (e.key === 'Escape') {
            const so = document.getElementById('shortcutOverlay');
            if (so && so.style.display !== 'none') { so.style.display = 'none'; return; }
            if (window._handleBackAction) window._handleBackAction();
            return;
        }

        if (e.key === 'F5') {
            e.preventDefault();
            navigateToPage(currentPage || 'home');
            return;
        }

        if (e.key === 'BrowserBack' || (e.altKey && e.key === 'ArrowLeft')) {
            e.preventDefault();
            if (previousPage && previousPage !== currentPage) navigateToPage(previousPage);
            return;
        }

        if (isInput) return;

        // "?" — Tastaturkürzel-Übersicht öffnen/schließen
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
            e.preventDefault();
            const so = document.getElementById('shortcutOverlay');
            if (so) so.style.display = so.style.display === 'none' ? 'flex' : 'none';
            return;
        }

        const vmEl = document.getElementById('videoModal');
        const tcEl = document.getElementById('trailerPlayerContainer');
        const vmOpen = vmEl && vmEl.classList.contains('active') && (!tcEl || tcEl.style.display === 'none');
        const vp = document.getElementById('videoPlayer');
        if (!vmOpen || !vp) return;

        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault(); e.stopPropagation();
            if (e.repeat) return;
            if (active && active !== document.body) active.blur();
            vp.paused ? vp.play().catch(() => {}) : vp.pause();
            return;
        }

        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && isFinite(vp.duration)) {
            e.preventDefault(); e.stopPropagation();
            const seekAmount = 10;
            vp.currentTime = e.key === 'ArrowLeft'
                ? Math.max(0, vp.currentTime - seekAmount)
                : Math.min(vp.duration, vp.currentTime + seekAmount);
            (window._showSeekOverlay || _showSeekOverlay)(e.key === 'ArrowLeft' ? -seekAmount : seekAmount);
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation();
            vp.volume = Math.min(1, Math.round((vp.volume + 0.1) * 10) / 10);
            if (window._showVolumeOverlay) window._showVolumeOverlay(vp.volume);
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault(); e.stopPropagation();
            vp.volume = Math.max(0, Math.round((vp.volume - 0.1) * 10) / 10);
            if (window._showVolumeOverlay) window._showVolumeOverlay(vp.volume);
            return;
        }

        if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            vp.muted = !vp.muted;
            if (window._showVolumeOverlay) window._showVolumeOverlay(vp.muted ? 0 : vp.volume);
            return;
        }

        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            if (typeof window.toggleFullscreen === 'function') window.toggleFullscreen();
        }
    }, true);

    const closeBtn        = document.getElementById('closeShortcutOverlay');
    const shortcutOverlay = document.getElementById('shortcutOverlay');
    if (closeBtn && shortcutOverlay) {
        closeBtn.addEventListener('click', () => { shortcutOverlay.style.display = 'none'; });
    }
    if (shortcutOverlay) {
        shortcutOverlay.addEventListener('click', (e) => {
            if (e.target === shortcutOverlay) shortcutOverlay.style.display = 'none';
        });
    }

    // Maus-Zurück-Taste (Button 3)
    document.addEventListener('mousedown', (e) => {
        if (e.button === 3) {
            e.preventDefault();
            if (previousPage && previousPage !== currentPage) navigateToPage(previousPage);
            else if (window._handleBackAction) window._handleBackAction();
        } else if (e.button === 4) {
            e.preventDefault();
        }
    });
}

console.log('[ui-controls.js] loaded');

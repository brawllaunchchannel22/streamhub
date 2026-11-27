// ============================================================
// js/profiles.js — Profile Management
// Depends on: config.js (DEFAULT_PROFILE, PROFILE_AVATARS),
//             state.js (editingProfileId, currentPage, searchInput,
//                       currentQuery, currentCategory, hamburgerSidebar,
//                       sidebarBackdrop),
//             utils.js (showNotification, _showConfirmDialog),
//             storage.js (_safeSetItem)
// ============================================================

'use strict';

// ── Core Profile CRUD ────────────────────────────────────────────────────────

/** Returns all stored profiles, falling back to [DEFAULT_PROFILE]. */
function getProfiles() {
    try {
        const stored = JSON.parse(localStorage.getItem('streamhubProfiles'));
        if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch (e) {}
    return [DEFAULT_PROFILE];
}

/** Persists the profiles array to localStorage. */
function saveProfiles(profiles) {
    _safeSetItem('streamhubProfiles', JSON.stringify(profiles));
}

/** Returns the active profile ID string ('default' if none set). */
function getActiveProfileId() {
    return localStorage.getItem('streamhubActiveProfileId') || 'default';
}

/** Returns the active profile object, falling back to default. */
function getActiveProfile() {
    const profiles = getProfiles();
    const activeId  = getActiveProfileId();
    return profiles.find(p => p.id === activeId) || profiles[0] || DEFAULT_PROFILE;
}

/**
 * Returns the localStorage key for `baseKey` scoped to the active profile.
 * Uses bare `baseKey` for the 'default' profile to stay 100% backward-compatible.
 */
function getProfileKey(baseKey) {
    const activeId = getActiveProfileId();
    if (activeId === 'default') return baseKey;
    return `sh_p_${activeId}_${baseKey}`;
}

// ── UI Sync ──────────────────────────────────────────────────────────────────

/** Syncs navbar and hamburger profile name + avatar icon. */
function updateProfileUI() {
    const active = getActiveProfile();

    const navName   = document.getElementById('navProfileName');
    const navAvatar = document.getElementById('navProfileAvatar');
    if (navName)   navName.textContent = active.name;
    if (navAvatar) navAvatar.className = `fas ${active.avatar || 'fa-user'}`;

    const hName   = document.getElementById('hProfileName');
    const hAvatar = document.getElementById('hProfileAvatar');
    if (hName)   hName.textContent = active.name;
    if (hAvatar) hAvatar.className = `fas ${active.avatar || 'fa-user'}`;
}

/**
 * Reloads the data for whatever page is currently open.
 * Called after profile switches or imports so the grid reflects the new profile.
 */
function refreshCurrentPageData() {
    if (currentPage === 'watchlist')   loadWatchlistPage();
    else if (currentPage === 'watchlater') loadWatchLaterPage();
    else if (currentPage === 'playlists')  loadPlaylistsPage();
    else if (currentPage === 'abos')       loadAbosPage();
    else if (currentPage === 'history')    loadFullHistoryPage();
    else if (currentPage === 'stats')      loadStatsPage();
    else if (currentPage === 'home')       loadRecentlyWatched();
    renderProfileSettingsList();
}

// ── Profile Switching ────────────────────────────────────────────────────────

/**
 * Switches the active profile, optionally suppressing the notification toast.
 * Resets the search bar and navigates to the home page.
 */
function switchActiveProfile(profileId, skipNotify = false) {
    const profiles = getProfiles();
    const target   = profiles.find(p => p.id === profileId);
    if (!target) return;

    localStorage.setItem('streamhubActiveProfileId', profileId);
    updateProfileUI();

    // Serien-Cache leeren, damit AD/Kids-Filter des neuen Profils sofort greift
    if (typeof _clearSeriesCache === 'function') _clearSeriesCache();

    if (!skipNotify) {
        showNotification(`Profil gewechselt zu: „${target.name}"`, 'info');
    }

    // Reset search bar when switching profiles
    if (searchInput) searchInput.value = '';
    currentQuery    = '';
    currentCategory = '';

    navigateToPage('home');
    loadDefaultContent();
    refreshCurrentPageData();
    closeProfileModal();
}


// ── Modal Views ──────────────────────────────────────────────────────────────

function openProfileModal(startInEditMode = false) {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    if (startInEditMode) {
        showProfileEditView(null);
    } else {
        showProfileListView();
    }
    modal.style.display = 'flex';
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
}

function showProfileListView() {
    const listView = document.getElementById('profileListView');
    const editView = document.getElementById('profileEditView');
    if (listView) listView.style.display = 'block';
    if (editView) editView.style.display = 'none';
    renderModalProfilesGrid();
}

/**
 * Shows the edit form.
 * @param {string|null} profileId — null = create new profile
 */
function showProfileEditView(profileId = null) {
    editingProfileId = profileId;

    const listView     = document.getElementById('profileListView');
    const editView     = document.getElementById('profileEditView');
    const titleEl      = document.getElementById('profileEditTitle');
    const nameInput    = document.getElementById('profileNameInput');
    const kidsCheckbox = document.getElementById('profileIsKidsCheckbox');

    if (listView) listView.style.display = 'none';
    if (editView) editView.style.display = 'block';

    if (profileId) {
        const profiles = getProfiles();
        const profile  = profiles.find(p => p.id === profileId);
        if (titleEl)      titleEl.textContent = 'Profil bearbeiten';
        if (nameInput)    nameInput.value      = profile ? profile.name : '';
        selectedAvatarIcon = profile ? (profile.avatar || 'fa-user') : 'fa-user';
        if (kidsCheckbox) kidsCheckbox.checked = !!(profile && profile.isKids);
    } else {
        if (titleEl)      titleEl.textContent = 'Neues Profil erstellen';
        if (nameInput)    nameInput.value      = '';
        selectedAvatarIcon = 'fa-user';
        if (kidsCheckbox) kidsCheckbox.checked = false;
    }

    renderAvatarPicker();
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

// ── Avatar Picker ────────────────────────────────────────────────────────────

/** Renders the avatar icon grid with the currently selected icon highlighted. */
function renderAvatarPicker() {
    const grid = document.getElementById('avatarPickerGrid');
    if (!grid) return;
    grid.innerHTML = '';

    PROFILE_AVATARS.forEach(av => {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = `avatar-pick-btn ${selectedAvatarIcon === av.id ? 'selected' : ''}`;
        btn.innerHTML = `<i class="fas ${av.id}"></i>`;
        btn.title     = av.label;
        btn.addEventListener('click', () => {
            selectedAvatarIcon = av.id;
            renderAvatarPicker();
        });
        grid.appendChild(btn);
    });
}

// ── Grid Renderers ───────────────────────────────────────────────────────────

/**
 * Builds a single profile card DOM element with scroll-safe tap handlers.
 * Shared by both the modal picker and the Settings list to keep UI identical.
 *
 * @param {object}   p              Profile object
 * @param {object}   opts
 * @param {string}   opts.activeId
 * @param {number}   opts.profilesCount
 * @param {string}   opts.inactiveLabel
 * @param {Function} opts.onEdit
 * @returns {HTMLElement}
 */
function _createProfileCardElement(p, { activeId, profilesCount, inactiveLabel, onEdit }) {
    const isActive = p.id === activeId;
    const card     = document.createElement('div');
    card.className = `profile-card ${isActive ? 'active' : ''}`;

    card.innerHTML = `
        <div class="profile-card-avatar" style="${p.isKids ? 'background:#10b981;' : ''}">
            <i class="fas ${p.avatar || 'fa-user'}"></i>
        </div>
        <div class="profile-card-details">
            <div class="profile-card-name-row">
                <span class="profile-card-title">${p.name}</span>
                <div class="profile-badges-wrap">
                    ${isActive ? '<span class="profile-badge-active">Aktiv</span>' : ''}
                    ${p.isKids ? '<span class="profile-badge-kids"><i class="fas fa-child"></i> Kinder</span>' : ''}
                </div>
            </div>
            <div class="profile-card-meta">
                ${isActive
                    ? '<span class="profile-active-dot"></span>Aktives Profil'
                    : inactiveLabel}
            </div>
        </div>
        <div class="profile-card-actions">
            <button class="profile-action-btn edit-p-btn" title="Bearbeiten" aria-label="Profil bearbeiten"><i class="fas fa-pencil-alt"></i></button>
            ${profilesCount > 1 && p.id !== 'default'
                ? '<button class="profile-action-btn btn-delete del-p-btn" title="Löschen" aria-label="Profil löschen"><i class="fas fa-trash"></i></button>'
                : ''}
        </div>
    `;

    // Tippen auf die Karte wechselt Profil (ignoriert Bearbeiten/Löschen-Buttons & Scrollen)
    const handleSwitch = (e) => {
        if (e.target && e.target.closest && e.target.closest('.profile-action-btn')) return;
        switchActiveProfile(p.id);
    };
    if (typeof bindSafeTap === 'function') {
        bindSafeTap(card, handleSwitch, { preventDefault: false });
    } else {
        card.addEventListener('click', handleSwitch);
    }

    const editBtn = card.querySelector('.edit-p-btn');
    if (editBtn) {
        if (typeof bindSafeTap === 'function') bindSafeTap(editBtn, onEdit, { stopPropagation: true });
        else editBtn.addEventListener('click', (e) => { e.stopPropagation(); onEdit(); });
    }

    const delBtn = card.querySelector('.del-p-btn');
    if (delBtn) {
        if (typeof bindSafeTap === 'function') bindSafeTap(delBtn, () => deleteProfile(p.id), { stopPropagation: true });
        else delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteProfile(p.id); });
    }

    return card;
}

/**
 * Renders the profile cards inside the profile modal.
 */
function renderModalProfilesGrid() {
    const grid = document.getElementById('modalProfilesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const profiles = getProfiles();
    const activeId = getActiveProfileId();

    profiles.forEach(p => {
        grid.appendChild(_createProfileCardElement(p, {
            activeId,
            profilesCount: profiles.length,
            inactiveLabel: 'Tippen zum Wechseln',
            onEdit: () => showProfileEditView(p.id)
        }));
    });
}

/**
 * Renders the profile list inside the Settings page.
 */
function renderProfileSettingsList() {
    const list = document.getElementById('settingsProfilesList');
    if (!list) return;
    list.innerHTML = '';

    const profiles = getProfiles();
    const activeId = getActiveProfileId();

    profiles.forEach(p => {
        list.appendChild(_createProfileCardElement(p, {
            activeId,
            profilesCount: profiles.length,
            inactiveLabel: 'Tippen zum Aktivieren',
            onEdit: () => { openProfileModal(); showProfileEditView(p.id); }
        }));
    });
}

// ── Form Save / Delete ───────────────────────────────────────────────────────

/** Validates and saves the profile edit form (create or update). */
function saveCurrentProfileForm() {
    const nameInput    = document.getElementById('profileNameInput');
    const kidsCheckbox = document.getElementById('profileIsKidsCheckbox');
    const name         = nameInput ? nameInput.value.trim() : '';

    if (!name) {
        showNotification('Bitte gib einen Profilnamen ein.', 'warning');
        return;
    }

    let profiles = getProfiles();

    if (editingProfileId) {
        // Update existing profile
        const p = profiles.find(x => x.id === editingProfileId);
        if (p) {
            p.name   = name;
            p.avatar = selectedAvatarIcon;
            p.isKids = !!(kidsCheckbox && kidsCheckbox.checked);
            saveProfiles(profiles);
            showNotification(`Profil „${p.name}" aktualisiert`, 'success');
        }
    } else {
        // Create new profile
        const newId      = 'p_' + Date.now();
        const newProfile = {
            id:     newId,
            name,
            avatar: selectedAvatarIcon,
            isKids: !!(kidsCheckbox && kidsCheckbox.checked),
            color:  '#6366f1'
        };
        profiles.push(newProfile);
        saveProfiles(profiles);
        switchActiveProfile(newId, true);
        showNotification(`Profil „${newProfile.name}" erstellt und aktiviert!`, 'success');
    }

    updateProfileUI();
    showProfileListView();
    renderProfileSettingsList();
}

/**
 * Shows a confirmation dialog before permanently deleting a profile.
 * Removes all profile-scoped localStorage keys before removing the entry.
 */
function deleteProfile(profileId) {
    if (profileId === 'default') {
        showNotification('Das Hauptprofil kann nicht gelöscht werden.', 'warning');
        return;
    }

    let profiles = getProfiles();
    const target = profiles.find(p => p.id === profileId);
    if (!target) return;

    _showConfirmDialog(
        'Profil löschen?',
        `Möchtest du das Profil „${target.name}" und alle zugehörigen Daten wirklich löschen?`,
        () => {
            // Purge all profile-scoped storage keys
            const profileKeys = [
                'streamhubWatchlist',
                'streamhubWatchLater',
                'streamhubPlaylists',
                'recentlyWatched',
                'videoProgressMap',
                'streamhubSearchHistory',
                'streamhub_abos'
            ];
            profileKeys.forEach(k => localStorage.removeItem(`sh_p_${profileId}_${k}`));

            profiles = profiles.filter(p => p.id !== profileId);
            saveProfiles(profiles);

            if (getActiveProfileId() === profileId) {
                switchActiveProfile('default', true);
            }

            showNotification(`Profil „${target.name}" wurde gelöscht.`, 'info');
            renderModalProfilesGrid();
            renderProfileSettingsList();
            updateProfileUI();
        },
        'Löschen',
        true // isDanger
    );
}

// ── Export & Import ──────────────────────────────────────────────────────────

/** Collects all profile data + settings and triggers an export. */
function exportStreamHubData() {
    try {
        const profiles   = getProfiles();
        const activeId   = getActiveProfileId();
        const profileData = {};
        const profileKeys = [
            'streamhubWatchlist', 'streamhubWatchLater', 'streamhubPlaylists',
            'recentlyWatched', 'videoProgressMap', 'streamhubSearchHistory', 'streamhub_abos'
        ];

        profiles.forEach(p => {
            profileData[p.id] = {};
            profileKeys.forEach(k => {
                const storageKey = (p.id === 'default') ? k : `sh_p_${p.id}_${k}`;
                const val = localStorage.getItem(storageKey);
                if (val !== null) {
                    try { profileData[p.id][k] = JSON.parse(val); }
                    catch (e) { profileData[p.id][k] = val; }
                }
            });
        });

        const settings = {
            selectedTheme:        localStorage.getItem('selectedTheme')                || 'dark',
            useRealThumbnails:    localStorage.getItem('useRealThumbnails')             === 'true',
            settingAutoplay:      localStorage.getItem('settingAutoplay')               !== 'false',
            settingDefaultPlayer: localStorage.getItem('settingDefaultPlayer')          || 'internal',
            tmdbApiKey:           localStorage.getItem('tmdbApiKey')                    || ''
        };

        const backup = {
            appName:         'StreamHub',
            version:         3,
            exportedAt:      new Date().toISOString(),
            activeProfileId: activeId,
            profiles,
            profileData,
            settings
        };

        const jsonStr  = JSON.stringify(backup, null, 2);
        const dateStr  = new Date().toISOString().split('T')[0];
        const fileName = `streamhub_backup_${dateStr}.json`;

        // Always save internally first (guaranteed backup even if share fails)
        try {
            localStorage.setItem('sh_last_backup_json', jsonStr);
            localStorage.setItem('sh_last_backup_date', new Date().toISOString());
        } catch (e) { /* quota – skip */ }

        const modalShowLastBackupBtn = document.getElementById('modalShowLastBackupBtn');
        if (modalShowLastBackupBtn) modalShowLastBackupBtn.style.display = '';

        const isAndroid = /android/i.test(navigator.userAgent) || (typeof Capacitor !== 'undefined');
        if (isAndroid) {
            _exportAndroid(jsonStr, fileName);
        } else {
            _exportViaDataUri(jsonStr, fileName);
        }
    } catch (err) {
        console.error('Export error:', err);
        showNotification('Fehler beim Export: ' + err.message, 'error');
    }
}

/** Android-specific export: tries Capacitor Filesystem → Share sheet → web share → backup modal. */
async function _exportAndroid(jsonStr, fileName) {
    let fileUri       = null;
    let savedLocation = '';

    // Method 1: Capacitor Filesystem → DOCUMENTS
    if (window.Capacitor?.Plugins?.Filesystem) {
        const fs = window.Capacitor.Plugins.Filesystem;
        try {
            const res = await fs.writeFile({ path: fileName, data: jsonStr, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
            if (res && res.uri) { fileUri = res.uri; savedLocation = 'Dokumente'; }
        } catch (eDocs) {
            console.warn('Filesystem DOCUMENTS failed, trying CACHE:', eDocs);
            try {
                const res = await fs.writeFile({ path: fileName, data: jsonStr, directory: 'CACHE', encoding: 'utf8', recursive: true });
                if (res && res.uri) fileUri = res.uri;
            } catch (eCache) { console.warn('Filesystem CACHE failed:', eCache); }
        }
    }

    // Method 2: Capacitor Share sheet
    if (fileUri && window.Capacitor?.Plugins?.Share) {
        try {
            await window.Capacitor.Plugins.Share.share({
                title: 'StreamHub Backup',
                text: 'StreamHub Sicherungsdatei',
                url: fileUri,
                dialogTitle: 'Backup sichern oder teilen'
            });
            showNotification(savedLocation ? `✅ Gespeichert in ${savedLocation} & geteilt!` : '✅ Backup geteilt!', 'success');
            return;
        } catch (shareErr) {
            const msg = (shareErr && shareErr.message) || '';
            if (shareErr.name === 'AbortError' || msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismiss')) {
                if (savedLocation) {
                    showNotification(`✅ Backup gespeichert im Ordner "${savedLocation}" (${fileName})!`, 'success', 5000);
                    return;
                }
            }
            console.warn('Capacitor Share failed:', shareErr);
        }
    }

    // Method 3: Web Share API (file object)
    try {
        if (navigator.canShare && navigator.share) {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const file = new File([blob], fileName, { type: 'application/json' });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'StreamHub Backup' });
                showNotification('✅ Backup geteilt!', 'success');
                return;
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn('Web Share API failed:', e);
    }

    if (savedLocation) {
        showNotification(`✅ Backup gespeichert im Ordner "${savedLocation}" (${fileName})!`, 'success', 5000);
        return;
    }

    // Method 4: Visual modal with copy-to-clipboard
    _showBackupModal(jsonStr, fileName);
}

/** Shows the backup JSON in a scrollable modal with a copy button. */
function _showBackupModal(jsonStr, fileName) {
    const existing = document.getElementById('_backupModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = '_backupModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:999999;display:flex;align-items:center;justify-content:center;padding:1rem;';

    const inner = document.createElement('div');
    inner.style.cssText = 'background:#1e1e2e;border-radius:20px;padding:24px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);';
    inner.innerHTML = `
        <h3 style="margin:0 0 6px;color:#fff;font-size:1.05rem;"><i class="fas fa-save" style="color:#6366f1;"></i> Backup gesichert</h3>
        <p style="color:#94a3b8;font-size:0.82rem;margin:0 0 4px;">Das Backup ist intern in der App gespeichert. Du kannst den Text kopieren oder teilen:</p>
        <p style="color:#6366f1;font-size:0.78rem;margin:0 0 12px;"><i class="fas fa-file-code"></i> <strong>${fileName}</strong></p>
        <textarea id="_bkTextarea" style="width:100%;height:180px;background:#0f0f1a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;font-size:0.72rem;font-family:monospace;resize:none;box-sizing:border-box;" readonly></textarea>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
            <button id="_bkCopyBtn" style="flex:1;min-width:130px;padding:11px 16px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none;border-radius:100px;cursor:pointer;font-size:0.9rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="fas fa-copy"></i> Kopieren</button>
            <button id="_bkCloseBtn" style="flex:1;min-width:100px;padding:11px 16px;background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);border-radius:100px;cursor:pointer;font-size:0.9rem;">Schließen</button>
        </div>`;

    modal.appendChild(inner);
    document.body.appendChild(modal);

    inner.querySelector('#_bkTextarea').value  = jsonStr;
    inner.querySelector('#_bkCloseBtn').onclick = () => modal.remove();
    inner.querySelector('#_bkCopyBtn').onclick   = async () => {
        try {
            await navigator.clipboard.writeText(jsonStr);
        } catch (e) {
            const ta = inner.querySelector('#_bkTextarea');
            ta.select();
            document.execCommand('copy');
        }
        inner.querySelector('#_bkCopyBtn').innerHTML = '<i class="fas fa-check"></i> Kopiert!';
        showNotification('✅ In Zwischenablage kopiert!', 'success');
    };
}

/** Desktop/PWA export: triggers a download via a temporary anchor element. */
function _exportViaDataUri(jsonStr, fileName) {
    try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('✅ Backup-Datei erfolgreich exportiert!', 'success');
    } catch (e) {
        _showBackupModal(jsonStr, fileName);
    }
}

/** Reads and validates a JSON backup file, then shows a confirm dialog before importing. */
function importStreamHubDataFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text   = e.target.result;
            const backup = JSON.parse(text);

            if (!backup || (!backup.appName && !backup.profiles && !backup.profileData)) {
                throw new Error('Ungültiges Dateiformat. Keine StreamHub-Sicherungsdatei.');
            }

            const dateStr = backup.exportedAt
                ? new Date(backup.exportedAt).toLocaleDateString('de-DE')
                : 'unbekannt';

            _showConfirmDialog(
                'Backup importieren?',
                `Erstellt am: ${dateStr}\n\nBestehende Profile bleiben erhalten, neue Profile aus dem Backup werden hinzugefügt.`,
                () => _doImport(backup),
                'Importieren'
            );
        } catch (err) {
            console.error('Import parse error:', err);
            showNotification('❌ Fehler beim Import: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

/** Performs the actual data merge after the user confirms the import dialog. */
function _doImport(backup) {
    try {
        const profileKeys = [
            'streamhubWatchlist', 'streamhubWatchLater', 'streamhubPlaylists',
            'recentlyWatched', 'videoProgressMap', 'streamhubSearchHistory', 'streamhub_abos'
        ];

        // MERGE profiles (add only new ones, keep existing)
        if (Array.isArray(backup.profiles) && backup.profiles.length > 0) {
            const existing    = getProfiles();
            const existingIds = new Set(existing.map(p => p.id));
            const newProfiles = backup.profiles.filter(p => !existingIds.has(p.id));
            saveProfiles([...existing, ...newProfiles]);
        }

        // Restore per-profile data
        if (backup.profileData && typeof backup.profileData === 'object') {
            Object.keys(backup.profileData).forEach(pId => {
                const dataObj = backup.profileData[pId];
                if (!dataObj) return;
                profileKeys.forEach(k => {
                    if (dataObj[k] !== undefined) {
                        const storageKey = (pId === 'default') ? k : `sh_p_${pId}_${k}`;
                        const valStr     = typeof dataObj[k] === 'string' ? dataObj[k] : JSON.stringify(dataObj[k]);
                        _safeSetItem(storageKey, valStr);
                    }
                });
            });
        }

        // Restore settings
        if (backup.settings) {
            if (backup.settings.selectedTheme) {
                localStorage.setItem('selectedTheme', backup.settings.selectedTheme);
                applyTheme(backup.settings.selectedTheme);
            }
            if (backup.settings.useRealThumbnails !== undefined) {
                localStorage.setItem('useRealThumbnails', backup.settings.useRealThumbnails);
                useRealThumbnails = backup.settings.useRealThumbnails;
            }
            if (backup.settings.tmdbApiKey) {
                localStorage.setItem('tmdbApiKey', backup.settings.tmdbApiKey);
            }
        }

        updateProfileUI();
        refreshCurrentPageData();
        renderProfileSettingsList();
        renderModalProfilesGrid();

        showNotification('✅ Backup erfolgreich importiert! Profile wurden zusammengeführt.', 'success');
    } catch (err) {
        console.error('Import error:', err);
        showNotification('❌ Fehler beim Import: ' + err.message, 'error');
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────

/**
 * Wires up all profile-related event listeners.
 * Called once from main.js inside DOMContentLoaded.
 */
function initProfileSystem() {
    updateProfileUI();

    // Top navbar profile button
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) profileBtn.addEventListener('click', () => openProfileModal());

    // Hamburger profile card
    const hamburgerProfileCard = document.getElementById('hamburgerProfileCard');
    if (hamburgerProfileCard) {
        hamburgerProfileCard.addEventListener('click', () => {
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop)  sidebarBackdrop.classList.remove('active');
            openProfileModal();
        });
    }

    // Modal close buttons
    const closeProfileModalBtn = document.getElementById('closeProfileModalBtn');
    if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);

    const closeProfileModalBackdrop = document.getElementById('closeProfileModalBackdrop');
    if (closeProfileModalBackdrop) closeProfileModalBackdrop.addEventListener('click', closeProfileModal);

    // Profile modal action buttons
    const modalNewProfileBtn = document.getElementById('modalNewProfileBtn');
    if (modalNewProfileBtn) modalNewProfileBtn.addEventListener('click', () => showProfileEditView(null));

    const openNewProfileBtn = document.getElementById('openNewProfileBtn');
    if (openNewProfileBtn) openNewProfileBtn.addEventListener('click', () => openProfileModal(true));

    const cancelProfileEditBtn = document.getElementById('cancelProfileEditBtn');
    if (cancelProfileEditBtn) cancelProfileEditBtn.addEventListener('click', showProfileListView);

    const saveProfileEditBtn = document.getElementById('saveProfileEditBtn');
    if (saveProfileEditBtn) saveProfileEditBtn.addEventListener('click', saveCurrentProfileForm);

    // Export & Import (modal)
    const modalExportBackupBtn = document.getElementById('modalExportBackupBtn');
    if (modalExportBackupBtn) modalExportBackupBtn.addEventListener('click', exportStreamHubData);

    const modalImportBackupInput = document.getElementById('modalImportBackupInput');
    if (modalImportBackupInput) {
        modalImportBackupInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                importStreamHubDataFromFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    // "Last backup" history button — only visible if a backup was ever stored internally
    const modalShowLastBackupBtn = document.getElementById('modalShowLastBackupBtn');
    if (modalShowLastBackupBtn) {
        const lastBackup = localStorage.getItem('sh_last_backup_json');
        const lastDate   = localStorage.getItem('sh_last_backup_date');
        if (lastBackup) {
            modalShowLastBackupBtn.style.display = '';
            const dateLabel = lastDate ? new Date(lastDate).toLocaleDateString('de-DE') : '';
            modalShowLastBackupBtn.title = `Letztes Backup anzeigen (${dateLabel})`;
            modalShowLastBackupBtn.addEventListener('click', () => {
                const d  = lastDate ? new Date(lastDate).toLocaleDateString('de-DE') : '';
                const fn = `streamhub_backup_${(lastDate || new Date().toISOString()).split('T')[0]}.json`;
                _showBackupModal(lastBackup, fn);
            });
        }
    }

    // Export & Import (settings page)
    const exportBackupBtn = document.getElementById('exportBackupBtn');
    if (exportBackupBtn) exportBackupBtn.addEventListener('click', exportStreamHubData);

    const importBackupInput = document.getElementById('importBackupInput');
    if (importBackupInput) {
        importBackupInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                importStreamHubDataFromFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    // Close modal when navigating via nav category tabs
    document.querySelectorAll('.nav-categories a').forEach(link => {
        link.addEventListener('click', () => closeProfileModal());
    });

    renderProfileSettingsList();
}

console.log('[profiles.js] loaded');

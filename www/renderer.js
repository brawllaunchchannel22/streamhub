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

// ============================================================================
// PROFILE & LOCAL SAVE-FILE BACKUP SYSTEM
// ============================================================================

const DEFAULT_PROFILE = {
    id: 'default',
    name: 'Hauptprofil',
    avatar: 'fa-user',
    isKids: false,
    color: '#6366f1'
};

const PROFILE_AVATARS = [
    { id: 'fa-user', label: 'Benutzer' },
    { id: 'fa-user-ninja', label: 'Ninja' },
    { id: 'fa-user-astronaut', label: 'Astronaut' },
    { id: 'fa-child', label: 'Kind' },
    { id: 'fa-film', label: 'Kino' },
    { id: 'fa-tv', label: 'TV' },
    { id: 'fa-heart', label: 'Herz' },
    { id: 'fa-star', label: 'Stern' },
    { id: 'fa-cat', label: 'Katze' },
    { id: 'fa-dog', label: 'Hund' },
    { id: 'fa-gamepad', label: 'Gamer' },
    { id: 'fa-crown', label: 'Krone' }
];

let editingProfileId = null;
let selectedAvatarIcon = 'fa-user';

function getProfiles() {
    try {
        const stored = JSON.parse(localStorage.getItem('streamhubProfiles'));
        if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch(e) {}
    return [DEFAULT_PROFILE];
}

function saveProfiles(profiles) {
    _safeSetItem('streamhubProfiles', JSON.stringify(profiles));
}

function getActiveProfileId() {
    return localStorage.getItem('streamhubActiveProfileId') || 'default';
}

function getActiveProfile() {
    const profiles = getProfiles();
    const activeId = getActiveProfileId();
    return profiles.find(p => p.id === activeId) || profiles[0] || DEFAULT_PROFILE;
}

function getProfileKey(baseKey) {
    const activeId = getActiveProfileId();
    if (activeId === 'default') {
        return baseKey; // 100% backwards compatible with existing user data!
    }
    return `sh_p_${activeId}_${baseKey}`;
}

function updateProfileUI() {
    const active = getActiveProfile();
    
    // Navbar
    const navName = document.getElementById('navProfileName');
    const navAvatar = document.getElementById('navProfileAvatar');
    if (navName) navName.textContent = active.name;
    if (navAvatar) navAvatar.className = `fas ${active.avatar || 'fa-user'}`;
    
    // Hamburger card
    const hName = document.getElementById('hProfileName');
    const hAvatar = document.getElementById('hProfileAvatar');
    if (hName) hName.textContent = active.name;
    if (hAvatar) hAvatar.className = `fas ${active.avatar || 'fa-user'}`;
}

function refreshCurrentPageData() {
    if (currentPage === 'watchlist') {
        loadWatchlistPage();
    } else if (currentPage === 'watchlater') {
        loadWatchLaterPage();
    } else if (currentPage === 'playlists') {
        loadPlaylistsPage();
    } else if (currentPage === 'abos') {
        loadAbosPage();
    } else if (currentPage === 'history') {
        loadFullHistoryPage();
    } else if (currentPage === 'stats') {
        loadStatsPage();
    } else if (currentPage === 'home') {
        loadRecentlyWatched();
    }
    renderProfileSettingsList();
}

function switchActiveProfile(profileId, skipNotify = false) {
    const profiles = getProfiles();
    const target = profiles.find(p => p.id === profileId);
    if (!target) return;
    
    localStorage.setItem('streamhubActiveProfileId', profileId);
    updateProfileUI();
    
    if (!skipNotify) {
        showNotification(`Profil gewechselt zu: „${target.name}“`, 'info');
    }
    
    // Clear search bar and active query when switching profile
    if (searchInput) searchInput.value = '';
    currentQuery = '';
    currentCategory = '';
    
    // Return to home page and load clean recommendations
    navigateToPage('home');
    loadDefaultContent();
    refreshCurrentPageData();
    closeProfileModal();
}

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

function showProfileEditView(profileId = null) {
    editingProfileId = profileId;
    const listView = document.getElementById('profileListView');
    const editView = document.getElementById('profileEditView');
    const titleEl = document.getElementById('profileEditTitle');
    const nameInput = document.getElementById('profileNameInput');
    const kidsCheckbox = document.getElementById('profileIsKidsCheckbox');
    
    if (listView) listView.style.display = 'none';
    if (editView) editView.style.display = 'block';
    
    if (profileId) {
        const profiles = getProfiles();
        const profile = profiles.find(p => p.id === profileId);
        if (titleEl) titleEl.textContent = 'Profil bearbeiten';
        if (nameInput) nameInput.value = profile ? profile.name : '';
        selectedAvatarIcon = profile ? (profile.avatar || 'fa-user') : 'fa-user';
        if (kidsCheckbox) kidsCheckbox.checked = !!(profile && profile.isKids);
    } else {
        if (titleEl) titleEl.textContent = 'Neues Profil erstellen';
        if (nameInput) nameInput.value = '';
        selectedAvatarIcon = 'fa-user';
        if (kidsCheckbox) kidsCheckbox.checked = false;
    }
    
    renderAvatarPicker();
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

function renderAvatarPicker() {
    const grid = document.getElementById('avatarPickerGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    PROFILE_AVATARS.forEach(av => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `avatar-pick-btn ${selectedAvatarIcon === av.id ? 'selected' : ''}`;
        btn.innerHTML = `<i class="fas ${av.id}"></i>`;
        btn.title = av.label;
        btn.addEventListener('click', () => {
            selectedAvatarIcon = av.id;
            renderAvatarPicker();
        });
        grid.appendChild(btn);
    });
}

function renderModalProfilesGrid() {
    const grid = document.getElementById('modalProfilesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const profiles = getProfiles();
    const activeId = getActiveProfileId();
    
    profiles.forEach(p => {
        const isActive = p.id === activeId;
        const card = document.createElement('div');
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
                    ${isActive ? 'Aktuelles Profil' : 'Klicken zum Wechseln'}
                </div>
            </div>
            <div class="profile-card-actions">
                <button class="profile-action-btn edit-p-btn" title="Bearbeiten"><i class="fas fa-pencil-alt"></i></button>
                ${profiles.length > 1 && p.id !== 'default' ? '<button class="profile-action-btn btn-delete del-p-btn" title="Löschen"><i class="fas fa-trash"></i></button>' : ''}
            </div>
        `;
        
        // Whole card switches profile (unless an action button is clicked)
        card.addEventListener('click', (e) => {
            if (e.target.closest('.profile-action-btn')) return;
            switchActiveProfile(p.id);
        });
        
        card.querySelector('.edit-p-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showProfileEditView(p.id);
        });
        
        const delBtn = card.querySelector('.del-p-btn');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteProfile(p.id);
            });
        }
        
        grid.appendChild(card);
    });
}

function renderProfileSettingsList() {
    const list = document.getElementById('settingsProfilesList');
    if (!list) return;
    list.innerHTML = '';
    
    const profiles = getProfiles();
    const activeId = getActiveProfileId();
    
    profiles.forEach(p => {
        const isActive = p.id === activeId;
        const card = document.createElement('div');
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
                    ${isActive ? 'Standardprofil ausgewählt' : 'Klicken zum Aktivieren'}
                </div>
            </div>
            <div class="profile-card-actions">
                <button class="profile-action-btn edit-p-btn" title="Bearbeiten"><i class="fas fa-pencil-alt"></i></button>
                ${profiles.length > 1 && p.id !== 'default' ? '<button class="profile-action-btn btn-delete del-p-btn" title="Löschen"><i class="fas fa-trash"></i></button>' : ''}
            </div>
        `;
        
        // Whole card switches profile (unless an action button is clicked)
        card.addEventListener('click', (e) => {
            if (e.target.closest('.profile-action-btn')) return;
            switchActiveProfile(p.id);
        });
        
        card.querySelector('.edit-p-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openProfileModal();
            showProfileEditView(p.id);
        });
        
        const delBtn = card.querySelector('.del-p-btn');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteProfile(p.id);
            });
        }
        
        list.appendChild(card);
    });
}

function saveCurrentProfileForm() {
    const nameInput = document.getElementById('profileNameInput');
    const kidsCheckbox = document.getElementById('profileIsKidsCheckbox');
    const name = nameInput ? nameInput.value.trim() : '';
    
    if (!name) {
        showNotification('Bitte gib einen Profilnamen ein.', 'warning');
        return;
    }
    
    let profiles = getProfiles();
    
    if (editingProfileId) {
        // Edit existing
        const p = profiles.find(x => x.id === editingProfileId);
        if (p) {
            p.name = name;
            p.avatar = selectedAvatarIcon;
            p.isKids = !!(kidsCheckbox && kidsCheckbox.checked);
            saveProfiles(profiles);
            showNotification(`Profil „${p.name}“ aktualisiert`, 'success');
        }
    } else {
        // Create new
        const newId = 'p_' + Date.now();
        const newProfile = {
            id: newId,
            name: name,
            avatar: selectedAvatarIcon,
            isKids: !!(kidsCheckbox && kidsCheckbox.checked),
            color: '#6366f1'
        };
        profiles.push(newProfile);
        saveProfiles(profiles);
        switchActiveProfile(newId, true);
        showNotification(`Profil „${newProfile.name}“ erstellt und aktiviert!`, 'success');
    }
    
    updateProfileUI();
    showProfileListView();
    renderProfileSettingsList();
}

function deleteProfile(profileId) {
    if (profileId === 'default') {
        showNotification('Das Hauptprofil kann nicht gelöscht werden.', 'warning');
        return;
    }
    
    let profiles = getProfiles();
    const target = profiles.find(p => p.id === profileId);
    if (!target) return;
    
    if (!confirm(`Möchtest du das Profil „${target.name}“ und alle zugehörigen Daten wirklich löschen?`)) {
        return;
    }
    
    // Remove profile-specific storage keys
    const profileKeys = [
        'streamhubWatchlist',
        'streamhubWatchLater',
        'streamhubPlaylists',
        'recentlyWatched',
        'videoProgressMap',
        'streamhubSearchHistory',
        'streamhub_abos'
    ];
    profileKeys.forEach(k => {
        localStorage.removeItem(`sh_p_${profileId}_${k}`);
    });
    
    profiles = profiles.filter(p => p.id !== profileId);
    saveProfiles(profiles);
    
    if (getActiveProfileId() === profileId) {
        switchActiveProfile('default', true);
    }
    
    showNotification(`Profil „${target.name}“ wurde gelöscht.`, 'info');
    renderModalProfilesGrid();
    renderProfileSettingsList();
    updateProfileUI();
}

// ── Export & Import Engine ──────────────────────────────────────────────────
function exportStreamHubData() {
    try {
        const profiles = getProfiles();
        const activeId = getActiveProfileId();
        const profileData = {};
        const profileKeys = [
            'streamhubWatchlist', 'streamhubWatchLater', 'streamhubPlaylists',
            'recentlyWatched', 'videoProgressMap', 'streamhubSearchHistory', 'streamhub_abos'
        ];
        profiles.forEach(p => {
            const pId = p.id;
            profileData[pId] = {};
            profileKeys.forEach(k => {
                const storageKey = (pId === 'default') ? k : `sh_p_${pId}_${k}`;
                const val = localStorage.getItem(storageKey);
                if (val !== null) {
                    try { profileData[pId][k] = JSON.parse(val); }
                    catch(e) { profileData[pId][k] = val; }
                }
            });
        });
        const settings = {
            selectedTheme: localStorage.getItem('selectedTheme') || 'dark',
            useRealThumbnails: localStorage.getItem('useRealThumbnails') === 'true',
            settingAutoplay: localStorage.getItem('settingAutoplay') !== 'false',
            settingDefaultPlayer: localStorage.getItem('settingDefaultPlayer') || 'internal',
            tmdbApiKey: localStorage.getItem('tmdbApiKey') || ''
        };
        const backup = {
            appName: 'StreamHub', version: 3,
            exportedAt: new Date().toISOString(),
            activeProfileId: activeId, profiles, profileData, settings
        };
        const jsonStr = JSON.stringify(backup, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `streamhub_backup_${dateStr}.json`;

        // STEP 1: Always save internally first (guaranteed fallback on every platform)
        try {
            localStorage.setItem('sh_last_backup_json', jsonStr);
            localStorage.setItem('sh_last_backup_date', new Date().toISOString());
        } catch(e) { /* storage quota - skip */ }

        // STEP 2: Try native file export
        const isAndroid = /android/i.test(navigator.userAgent) || (typeof Capacitor !== 'undefined');
        if (isAndroid) {
            _exportAndroid(jsonStr, fileName);
        } else {
            _exportViaDataUri(jsonStr, fileName);
        }
    } catch(err) {
        console.error('Export error:', err);
        showNotification('Fehler beim Export: ' + err.message, 'error');
    }
}

async function _exportAndroid(jsonStr, fileName) {
    // Try 1: Web Share API with File object (Android 10+ / Capacitor WebView)
    try {
        if (navigator.canShare && navigator.share) {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const file = new File([blob], fileName, { type: 'application/json' });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'StreamHub Backup' });
                showNotification('Backup geteilt! Tippe auf "In Dateien speichern".', 'success');
                return;
            }
        }
    } catch(e) {
        if (e.name === 'AbortError') return;
        console.warn('Share API:', e);
    }

    // Try 2: Classic anchor download
    try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        showNotification('Backup-Download gestartet...', 'success');
        return;
    } catch(e) { console.warn('Anchor dl:', e); }

    // Try 3: Clipboard
    try {
        await navigator.clipboard.writeText(jsonStr);
        showNotification('Backup in Zwischenablage kopiert! In Notiz-App einfuegen & als .json speichern.', 'info', 6000);
        return;
    } catch(e) { console.warn('Clipboard:', e); }

    // Try 4: Show inline modal (backup is already in localStorage)
    _showBackupModal(jsonStr, fileName);
}

function _showBackupModal(jsonStr, fileName) {
    const existing = document.getElementById('_backupModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = '_backupModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:999999;display:flex;align-items:center;justify-content:center;padding:1rem;';
    const inner = document.createElement('div');
    inner.style.cssText = 'background:#1e1e2e;border-radius:20px;padding:24px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);';
    inner.innerHTML = `
        <h3 style="margin:0 0 6px;color:#fff;font-size:1.05rem;">Backup intern gespeichert</h3>
        <p style="color:#94a3b8;font-size:0.82rem;margin:0 0 4px;">Das Backup liegt sicher in der App. Kopiere den Text und sende ihn per WhatsApp/Mail oder speichere ihn in einer Notiz.</p>
        <p style="color:#6366f1;font-size:0.78rem;margin:0 0 12px;">Datei: <strong>${fileName}</strong></p>
        <textarea id="_bkTextarea" style="width:100%;height:200px;background:#0f0f1a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;font-size:0.72rem;font-family:monospace;resize:none;box-sizing:border-box;" readonly></textarea>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
            <button id="_bkCopyBtn" style="flex:1;min-width:120px;padding:10px 16px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none;border-radius:100px;cursor:pointer;font-size:0.9rem;font-weight:600;">Kopieren</button>
            <button id="_bkCloseBtn" style="flex:1;min-width:100px;padding:10px 16px;background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);border-radius:100px;cursor:pointer;font-size:0.9rem;">Schliessen</button>
        </div>`;
    modal.appendChild(inner);
    document.body.appendChild(modal);
    inner.querySelector('#_bkTextarea').value = jsonStr;
    inner.querySelector('#_bkCloseBtn').onclick = () => modal.remove();
    inner.querySelector('#_bkCopyBtn').onclick = async () => {
        try { await navigator.clipboard.writeText(jsonStr); }
        catch(e) { const ta = inner.querySelector('#_bkTextarea'); ta.select(); document.execCommand('copy'); }
        inner.querySelector('#_bkCopyBtn').textContent = 'Kopiert!';
    };
}

function _exportViaDataUri(jsonStr, fileName) {
    try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Backup-Datei erfolgreich exportiert!', 'success');
    } catch(e) {
        _showBackupModal(jsonStr, fileName);
    }
}


function importStreamHubDataFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const backup = JSON.parse(text);
            
            if (!backup || (!backup.appName && !backup.profiles && !backup.profileData)) {
                throw new Error('Ungültiges Dateiformat. Keine StreamHub-Sicherungsdatei.');
            }
            
            const dateStr = backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString('de-DE') : 'unbekannt';
            
            // Android-safe confirm: use our own modal instead of window.confirm which is blocked in WebView
            _showConfirmDialog(
                `Backup importieren?`,
                `Erstellt am: ${dateStr}\n\nBestehende Profile bleiben erhalten, neue Profile aus dem Backup werden hinzugefügt.`,
                () => _doImport(backup)
            );
        } catch(err) {
            console.error('Import parse error:', err);
            showNotification('❌ Fehler beim Import: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function _doImport(backup) {
    try {
        const profileKeys = [
            'streamhubWatchlist',
            'streamhubWatchLater',
            'streamhubPlaylists',
            'recentlyWatched',
            'videoProgressMap',
            'streamhubSearchHistory',
            'streamhub_abos'
        ];

        // MERGE profiles
        if (Array.isArray(backup.profiles) && backup.profiles.length > 0) {
            const existingProfiles = getProfiles();
            const existingIds = new Set(existingProfiles.map(p => p.id));
            const newProfiles = backup.profiles.filter(p => !existingIds.has(p.id));
            const merged = [...existingProfiles, ...newProfiles];
            saveProfiles(merged);
        }
        
        // Restore data
        if (backup.profileData && typeof backup.profileData === 'object') {
            Object.keys(backup.profileData).forEach(pId => {
                const dataObj = backup.profileData[pId];
                if (!dataObj) return;
                profileKeys.forEach(k => {
                    if (dataObj[k] !== undefined) {
                        const storageKey = (pId === 'default') ? k : `sh_p_${pId}_${k}`;
                        const valStr = typeof dataObj[k] === 'string' ? dataObj[k] : JSON.stringify(dataObj[k]);
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
    } catch(err) {
        console.error('Import error:', err);
        showNotification('❌ Fehler beim Import: ' + err.message, 'error');
    }
}

// Android-safe confirm dialog (window.confirm is blocked in WebView)
function _showConfirmDialog(title, message, onConfirm) {
    // Try native confirm first (works on desktop/Electron)
    try {
        if (typeof window.confirm === 'function' && !/android/i.test(navigator.userAgent) && typeof Capacitor === 'undefined') {
            if (window.confirm(`${title}\n\n${message}`)) onConfirm();
            return;
        }
    } catch(e) {}

    // Custom modal for Android
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
    overlay.innerHTML = `
        <div style="background:#1e1e2e;border-radius:20px;padding:28px;max-width:480px;width:100%;border:1px solid rgba(255,255,255,0.1);">
            <h3 style="margin:0 0 12px;color:#fff;font-size:1.1rem;">${title}</h3>
            <p style="color:#94a3b8;font-size:0.9rem;white-space:pre-line;margin-bottom:24px;">${message}</p>
            <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button id="_confirmNo" style="padding:10px 20px;background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);border-radius:100px;cursor:pointer;font-size:0.9rem;">Abbrechen</button>
                <button id="_confirmYes" style="padding:10px 22px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none;border-radius:100px;cursor:pointer;font-size:0.9rem;font-weight:600;">Importieren</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#_confirmNo').onclick = () => overlay.remove();
    overlay.querySelector('#_confirmYes').onclick = () => { overlay.remove(); onConfirm(); };
}


function initProfileSystem() {
    updateProfileUI();
    
    // Top Nav button
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => openProfileModal());
    }
    
    // Hamburger profile card
    const hamburgerProfileCard = document.getElementById('hamburgerProfileCard');
    if (hamburgerProfileCard) {
        hamburgerProfileCard.addEventListener('click', () => {
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            openProfileModal();
        });
    }
    
    // Modal buttons
    const closeProfileModalBtn = document.getElementById('closeProfileModalBtn');
    if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);
    
    const closeProfileModalBackdrop = document.getElementById('closeProfileModalBackdrop');
    if (closeProfileModalBackdrop) closeProfileModalBackdrop.addEventListener('click', closeProfileModal);
    
    const modalNewProfileBtn = document.getElementById('modalNewProfileBtn');
    if (modalNewProfileBtn) modalNewProfileBtn.addEventListener('click', () => showProfileEditView(null));
    
    const openNewProfileBtn = document.getElementById('openNewProfileBtn');
    if (openNewProfileBtn) openNewProfileBtn.addEventListener('click', () => openProfileModal(true));
    
    const cancelProfileEditBtn = document.getElementById('cancelProfileEditBtn');
    if (cancelProfileEditBtn) cancelProfileEditBtn.addEventListener('click', showProfileListView);
    
    const saveProfileEditBtn = document.getElementById('saveProfileEditBtn');
    if (saveProfileEditBtn) saveProfileEditBtn.addEventListener('click', saveCurrentProfileForm);
    
    // Export & Import buttons (modal)
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

    // "Last backup" history button – show only if a backup was ever saved internally
    const modalShowLastBackupBtn = document.getElementById('modalShowLastBackupBtn');
    if (modalShowLastBackupBtn) {
        const lastBackup = localStorage.getItem('sh_last_backup_json');
        const lastDate = localStorage.getItem('sh_last_backup_date');
        if (lastBackup) {
            modalShowLastBackupBtn.style.display = '';
            const dateLabel = lastDate ? new Date(lastDate).toLocaleDateString('de-DE') : '';
            modalShowLastBackupBtn.title = `Letztes Backup anzeigen (${dateLabel})`;
            modalShowLastBackupBtn.addEventListener('click', () => {
                const d = lastDate ? new Date(lastDate).toLocaleDateString('de-DE') : '';
                const fn = `streamhub_backup_${(lastDate || new Date().toISOString()).split('T')[0]}.json`;
                _showBackupModal(lastBackup, fn);
            });
        }
    }

    // Export & Import buttons (settings page)
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

    // Close profile modal when clicking any nav category tab
    document.querySelectorAll('.nav-categories a').forEach(link => {
        link.addEventListener('click', () => closeProfileModal());
    });
    
    renderProfileSettingsList();
}

// --- History Storage Helpers ---
function getRecentlyWatched() {
    try {
        return JSON.parse(localStorage.getItem(getProfileKey('recentlyWatched')) || '[]');
    } catch(e) {
        return [];
    }
}

function saveRecentlyWatched(recent) {
    try {
        _safeSetItem(getProfileKey('recentlyWatched'), JSON.stringify(recent));
    } catch(e) {
        console.error('saveRecentlyWatched error:', e);
    }
}

// --- Suchverlauf (Search History) Helpers ---
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

// ── localStorage quota recovery ───────────────────────────────────────────────
function _clearThumbnailCache() {
    let cleared = 0;
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('t_') || k.startsWith('vod_'))) toDelete.push(k);
    }
    toDelete.forEach(k => { try { localStorage.removeItem(k); cleared++; } catch(e){} });
    console.warn('[Storage] Cleared ' + cleared + ' thumbnail cache entries to free space');
    return cleared;
}

function _safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        if (e && e.name === 'QuotaExceededError') {
            console.warn('[Storage] QuotaExceeded for ' + key + ', clearing thumbnail cache...');
            _clearThumbnailCache();
            try {
                localStorage.setItem(key, value);
                console.log('[Storage] Retry succeeded for ' + key);
            } catch (e2) {
                console.error('[Storage] Still quota exceeded after cleanup for ' + key);
            }
        } else {
            throw e;
        }
    }
}

let _progressSaveTimer = 0;
function saveVideoProgress(url, currentTime, duration) {
    try {
        const key = getProfileKey('videoProgressMap');
        const progressMap = JSON.parse(localStorage.getItem(key) || '{}');
        progressMap[url] = {
            currentTime: currentTime,
            duration: duration,
            percent: Math.round((currentTime / duration) * 100),
            timestamp: Date.now()
        };
        // Keep only the 50 most recent entries (down from 100) to save space
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

// --- Watchlist Helpers ---
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
        console.warn('[WL] debounce blocked, dt=' + (now - btnEl._lastToggle));
        return;
    }
    if (btnEl) btnEl._lastToggle = now;
    try {
        let list = getWatchlist();
        const key = getVideoProgressKey(item);
        const idx = list.findIndex(i => getVideoProgressKey(i) === key);
        const adding = idx === -1;
        console.log('[WL] toggle key=' + key + ' adding=' + adding + ' listLen=' + list.length);
        if (adding) {
            list.unshift({ ...item, watchlistedAt: Date.now() });
        } else {
            list.splice(idx, 1);
        }
        _safeSetItem(getProfileKey('streamhubWatchlist'), JSON.stringify(list));
        console.log('[WL] saved newLen=' + list.length);
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
        console.error('toggleWatchlist error: ' + e);
    }
}

// ── Watch Later (Später ansehen) ──────────────────────────────────────────────
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
        console.warn('[WLater] debounce blocked dt=' + (now - btnEl._lastToggle));
        return;
    }
    if (btnEl) btnEl._lastToggle = now;
    try {
        let list = getWatchLater();
        const key = getVideoProgressKey(item);
        const idx = list.findIndex(i => getVideoProgressKey(i) === key);
        const adding = idx === -1;
        console.log('[WLater] toggle key=' + key + ' adding=' + adding + ' listLen=' + list.length);
        if (adding) {
            list.unshift({ ...item, watchLaterAt: Date.now() });
            showNotification('⏰ Zu „Später ansehen" hinzugefügt', 'success');
        } else {
            list.splice(idx, 1);
            showNotification('Aus „Später ansehen" entfernt', 'info');
        }
        _safeSetItem(getProfileKey('streamhubWatchLater'), JSON.stringify(list));
        console.log('[WLater] saved newLen=' + list.length);
        if (btnEl) {
            btnEl.classList.toggle('watchlater-active', adding);
            btnEl.title = adding ? 'Aus „Später ansehen" entfernen' : 'Zu „Später ansehen" hinzufügen';
            const icon = btnEl.querySelector('i');
            if (icon) {
                icon.className = adding ? 'fas fa-clock' : 'far fa-clock';
            }
        }
        if (window._haptic) adding ? window._haptic.heavy() : window._haptic.tick();
    } catch (e) {
        console.error('toggleWatchLater error: ' + e);
    }
}

// ── Playlists & Card Context Menu System ─────────────────────────────────────
function getPlaylists() {
    try { return JSON.parse(localStorage.getItem(getProfileKey('streamhubPlaylists')) || '[]'); }
    catch(e) { return []; }
}

function savePlaylists(playlists) {
    _safeSetItem(getProfileKey('streamhubPlaylists'), JSON.stringify(playlists));
}

function createPlaylist(title) {
    if (!title || !title.trim()) { console.warn('[PL] empty title'); return null; }
    const playlists = getPlaylists();
    const newPl = { id: 'pl_' + Date.now(), title: title.trim(), createdAt: Date.now(), items: [] };
    playlists.push(newPl);
    savePlaylists(playlists);
    console.log('[PL] created=' + newPl.title + ' currentPage=' + currentPage + ' total=' + playlists.length);
    showNotification(`Playlist „${newPl.title}“ erstellt`, 'success');
    setTimeout(() => {
        console.log('[PL] setTimeout fired, currentPage=' + currentPage);
        if (currentPage === 'playlists') loadPlaylistsPage();
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
        if (currentPage === 'playlists') loadPlaylistsPage();
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

function openCardContextMenu(item, cardEl, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    document.querySelectorAll('.card-context-menu, .modal-backdrop-ctx').forEach(el => el.remove());

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-ctx';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);z-index:99998;';

    const menu = document.createElement('div');
    menu.className = 'card-context-menu';
    menu.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:92%;max-width:420px;background:#1e1e2e;border:1px solid rgba(255,255,255,0.15);border-radius:24px;z-index:99999;padding:14px;box-shadow:0 16px 48px rgba(0,0,0,0.8);animation:ctxSlideUp 0.2s ease;color:#fff;';

    const inWLater = isInWatchLater(item);
    const inWL = isInWatchlist(item);
    const playlists = getPlaylists();

    let playlistOptions = playlists.map(p => `
        <button class="ctx-btn ctx-pl-item" data-pl-id="${p.id}">
            <i class="fas fa-list" style="color:#818cf8;"></i> Zu „${p.title}“ hinzufügen
        </button>
    `).join('');

    menu.innerHTML = `
        <div style="font-weight:700;font-size:0.95rem;padding:8px 12px 12px;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#cbd5e1;">
            <i class="fas fa-play-circle" style="color:var(--primary-color);margin-right:6px;"></i> ${item.title}
        </div>
        <button class="ctx-btn ctx-watchlater">
            <i class="${inWLater ? 'fas' : 'far'} fa-clock" style="color:#f59e0b;"></i>
            ${inWLater ? 'Aus „Später ansehen“ entfernen' : 'Zu „Später ansehen“ hinzufügen'}
        </button>
        <button class="ctx-btn ctx-watchlist">
            <i class="fas fa-heart" style="color:#ec4899;"></i>
            ${inWL ? 'Von Merkliste entfernen' : 'Zur Merkliste hinzufügen'}
        </button>
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

    const closeCtx = () => { backdrop.remove(); menu.remove(); };
    backdrop.onclick = closeCtx;
    menu.querySelector('.ctx-cancel').onclick = closeCtx;

    const wlBtn = cardEl ? cardEl.querySelector('.watchlist-btn') : null;
    const wlaterBtn = cardEl ? cardEl.querySelector('.watchlater-btn') : null;

    menu.querySelector('.ctx-watchlater').onclick = () => { toggleWatchLater(item, wlaterBtn); closeCtx(); };
    menu.querySelector('.ctx-watchlist').onclick = () => { toggleWatchlist(item, wlBtn); closeCtx(); };
    menu.querySelector('.ctx-new-pl').onclick = () => {
        closeCtx();
        setTimeout(() => {
            showCreatePlaylistDialog((pl) => {
                if (pl) addToPlaylist(pl.id, item);
            });
        }, 100);
    };

    menu.querySelectorAll('.ctx-pl-item').forEach(btn => {
        btn.onclick = () => {
            addToPlaylist(btn.dataset.plId, item);
            closeCtx();
        };
    });
}
window.openCardContextMenu = openCardContextMenu;

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
        localStorage.removeItem(getProfileKey('streamhubWatchlist'));
        loadWatchlistPage();
    }
}

// ── Watch Later Page ──────────────────────────────────────────────────────────
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
            if (confirm('„Später ansehen" Liste wirklich leeren?')) {
                localStorage.removeItem(getProfileKey('streamhubWatchLater'));
                loadWatchLaterPage();
            }
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
    list.forEach((item, index) => {
        const card = createVideoCard(item, index);
        grid.appendChild(card);
    });
}

// ── Playlists Page ────────────────────────────────────────────────────────────
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
        navBtn.onclick = () => {
            showCreatePlaylistDialog(() => loadPlaylistsPage());
        };
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
            <div class="video-thumbnail" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
                <i class="fas fa-list" style="font-size: 3rem; color: rgba(255,255,255,0.85); margin-bottom: 8px;"></i>
                <span class="duration-badge" style="background: rgba(0,0,0,0.7);">${itemCount} Videos</span>
                <button class="watchlist-btn delete-pl-btn" title="Playlist löschen" style="background: rgba(239,68,68,0.85); opacity: 1 !important; transform: scale(1) !important;">
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

        card.onclick = (e) => {
            if (e.target.closest('.delete-pl-btn')) return;
            openPlaylistDetail(pl);
        };

        const delBtn = card.querySelector('.delete-pl-btn');
        if (delBtn) {
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Playlist „${pl.title}“ wirklich löschen?`)) {
                    const all = getPlaylists().filter(p => p.id !== pl.id);
                    savePlaylists(all);
                    loadPlaylistsPage();
                }
            };
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

    if (title) title.innerHTML = `<i class="fas fa-list" style="color: var(--primary-color);"></i> ${pl.title}`;
    if (backBtn) backBtn.onclick = () => navigateToPage('playlists');
    if (!grid) return;
    grid.innerHTML = '';

    const items = pl.items || pl.videos || [];
    if (items.length === 0) {
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';
    items.forEach((item, idx) => {
        grid.appendChild(createVideoCard(item, idx));
    });
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
    // Proactively clear thumbnail cache on startup to prevent QuotaExceededError
    try {
        const testKey = '__quota_test__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
    } catch(e) {
        // Already full – clear thumbnail cache immediately
        console.warn('[Storage] localStorage full on startup, clearing thumbnail cache...');
        _clearThumbnailCache();
    }
    init();
});

function init() {
    try {
        // Apply theme early
        const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
        applyTheme(savedTheme);

        // Touch Swipe-Down to dismiss modals
        function setupSwipeToDismiss(containerEl, contentEl, closeCallback) {
            if (!containerEl || !contentEl) return;
            let startY = 0;
            let currentY = 0;
            let isDragging = false;

            contentEl.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                if (contentEl.scrollTop && contentEl.scrollTop > 5) return;
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
                contentEl.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                if (diffY > 90) {
                    contentEl.style.transform = 'translateY(100%)';
                    setTimeout(() => {
                        contentEl.style.transform = '';
                        closeCallback();
                    }, 250);
                } else {
                    contentEl.style.transform = '';
                }
                startY = 0;
                currentY = 0;
            });
        }

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

        const modalContent = document.querySelector('.modal-content');
        const filterSidebarEl = document.getElementById('filterSidebar');
        const hamburgerSidebarEl = document.getElementById('hamburgerSidebar');
        const sidebarBackdropEl = document.getElementById('sidebarBackdrop');

        if (filterSidebarEl) {
            setupSwipeToDismiss(filterSidebarEl, filterSidebarEl, () => {
                filterSidebarEl.classList.remove('active');
                if (sidebarBackdropEl) sidebarBackdropEl.classList.remove('active');
                if (window._syncNativeBackHandler) window._syncNativeBackHandler();
            });
        }
        if (hamburgerSidebarEl) {
            setupSwipeToDismiss(hamburgerSidebarEl, hamburgerSidebarEl, () => {
                hamburgerSidebarEl.classList.remove('active');
                if (sidebarBackdropEl) sidebarBackdropEl.classList.remove('active');
                if (window._syncNativeBackHandler) window._syncNativeBackHandler();
            });
        }

        // Initialize Profile and Backup Save-File System
        initProfileSystem();
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

        // Screen Wake Lock API for mobile / Android video playback
        let wakeLock = null;
        async function requestWakeLock() {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await navigator.wakeLock.request('screen');
                }
            } catch (err) {
                console.warn('[WakeLock] Request failed:', err);
            }
        }
        function releaseWakeLock() {
            if (wakeLock !== null) {
                wakeLock.release().then(() => { wakeLock = null; }).catch(() => { wakeLock = null; });
            }
        }
        window._releaseWakeLock = releaseWakeLock;

        if (videoPlayer) {
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
                // Remove progress when finished
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
                    const duration = videoPlayer.duration;
                    const key = getVideoProgressKey(window.currentPlayingVideo);

                    // Throttle: only save every 10 seconds to avoid flooding localStorage
                    const now = Date.now();
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
            if (e.key === 'Enter') {
                const val = searchInput.value.trim();
                if (val) {
                    performSearch(val);
                } else {
                    currentQuery = '';
                    currentCategory = '';
                    currentResults = [];
                    loadDefaultContent();
                }
            }
        });

        // Click on search input toggles history if field is empty
        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!searchInput.value.trim()) {
                const dropdown = document.getElementById('searchHistoryDropdown');
                const isOpen = dropdown && dropdown.style.display === 'block';
                if (isOpen) {
                    hideSearchHistoryDropdown();
                } else {
                    showSearchHistoryDropdown();
                }
            }
        });

        searchInput.addEventListener('input', () => {
            if (!searchInput.value.trim()) {
                showSearchHistoryDropdown();
                // When search field is emptied, automatically reset results back to FYP highlights
                if (currentQuery || (sectionTitle && sectionTitle.textContent && sectionTitle.textContent.includes('Ergebnisse'))) {
                    currentQuery = '';
                    currentCategory = '';
                    currentResults = [];
                    loadDefaultContent();
                }
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
            e.currentTarget.classList.add('active');

            const category = e.currentTarget.dataset.category;
            const page = e.currentTarget.dataset.page;

            // If a page attribute is set, navigate directly (handles live, watchlater, etc.)
            if (page && page !== '') {
                navigateToPage(page);
            } else if (category === 'home') {
                if (searchInput) searchInput.value = '';
                currentQuery = '';
                currentCategory = '';
                currentResults = [];
                navigateToPage('home');
                loadDefaultContent();
            } else if (category) {
                // Category search
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
        const goHome = () => {
            if (searchInput) searchInput.value = '';
            currentQuery = '';
            currentCategory = '';
            currentResults = [];
            document.querySelectorAll('.nav-categories a').forEach(l => l.classList.remove('active'));
            const startTab = document.querySelector('.nav-categories a[data-category="home"]');
            if (startTab) startTab.classList.add('active');
            navigateToPage('home');
            loadDefaultContent();
        };
        logoEl.addEventListener('click', goHome);
        logoEl.addEventListener('touchend', (e) => { e.preventDefault(); goHome(); }, { passive: false });
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
            // Reset custom select trigger labels
            document.querySelectorAll('.cust-select').forEach(cs => {
                const targetId = cs.dataset.target;
                const sel = document.getElementById(targetId);
                const firstOpt = cs.querySelector('.cust-opt');
                if (firstOpt && cs.querySelector('.cust-select-trigger span')) {
                    cs.querySelector('.cust-select-trigger span').textContent = firstOpt.textContent;
                }
                cs.querySelectorAll('.cust-opt').forEach(o => o.classList.remove('selected'));
                if (firstOpt) firstOpt.classList.add('selected');
            });
            applyFilters();
        });
    }

    // Init custom dropdown selects (avoids Android native picker)
    initCustSelects();

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

    // Watch Later via hamburger
    document.querySelectorAll('.hamburger-item[data-category="watchlater"]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            navigateToPage('watchlist');
            setTimeout(() => {
                const title = document.querySelector('#watchlistPage .section-title');
                if (title) title.textContent = 'Später ansehen';
                loadWatchLaterPage();
            }, 50);
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
                loadFullHistoryPage();
                loadRecentlyWatched();
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
                if (window.AndroidNativeTheme && typeof window.AndroidNativeTheme.enterPip === 'function') {
                    window.AndroidNativeTheme.enterPip();
                } else if (videoPlayer) {
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
                // For episodes: prefer the series name (topic) for trailer lookup
                const vid = window.currentPlayingVideo;
                const trailerSearchTitle = vid.topic && vid.topic.trim() && vid.topic.trim() !== vid.title.trim()
                    ? vid.topic.trim()   // e.g. "Tatort" for an episode titled "Tatort: Der Mörder..."
                    : vid.title;
                let trailerUrl = await fetchTrailerUrl(trailerSearchTitle, vid.channel);

                // If TMDB didn't find an embeddable video, search YouTube programmatically using the Electron main process
                if (!trailerUrl || trailerUrl === 'youtube_search') {
                    console.log('[TrailerBtn Click] TMDB fallback or no match. Searching YouTube directly...');
                    const cleanTitle = _cleanTitleForTmdb(trailerSearchTitle) || trailerSearchTitle.trim();
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
                    const cleanTitle = _cleanTitleForTmdb(trailerSearchTitle) || trailerSearchTitle.trim();
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
        const videoModal       = document.getElementById('videoModal');
        const hamburgerSidebar = document.getElementById('hamburgerSidebar');
        const filterSidebar    = document.getElementById('filterSidebar');
        const sidebarBackdrop  = document.getElementById('sidebarBackdrop');
        const infoModal        = document.getElementById('infoModal');

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

        const seriesDetailPage      = document.getElementById('seriesDetailPage');
        const localFolderDetailPage = document.getElementById('localFolderDetailPage');
        if (seriesDetailPage && seriesDetailPage.style.display === 'block') {
            navigateToPage('home');
            syncNativeBackHandler();
            return true;
        }
        const playlistDetailPage    = document.getElementById('playlistDetailPage');
        if (playlistDetailPage && playlistDetailPage.style.display === 'block') {
            navigateToPage('playlists');
            syncNativeBackHandler();
            return true;
        }

        // Close new playlist modal if open
        const newPlModal = document.getElementById('newPlaylistModal');
        if (newPlModal && newPlModal.style.display !== 'none') {
            newPlModal.style.display = 'none';
            newPlModal.classList.remove('active');
            syncNativeBackHandler();
            return true;
        }

        // Close context menu bottom sheet if open
        const ctxMenu = document.querySelector('.card-context-menu');
        if (ctxMenu) {
            document.querySelectorAll('.card-context-menu, .modal-backdrop-ctx').forEach(el => el.remove());
            syncNativeBackHandler();
            return true;
        }

        const historyPage    = document.getElementById('historyPage');
        const livePage       = document.getElementById('livePage');
        const localPage      = document.getElementById('localPage');
        const settingsPage   = document.getElementById('settingsPage');
        const watchlistPage  = document.getElementById('watchlistPage');
        const watchLaterPage = document.getElementById('watchLaterPage');
        const playlistsPage  = document.getElementById('playlistsPage');
        const statsPage      = document.getElementById('statsPage');
        const abosPage       = document.getElementById('abosPage');
        const downloadsPage  = document.getElementById('downloadsPage');
        if (
            (historyPage    && historyPage.style.display    === 'block') ||
            (livePage       && livePage.style.display       === 'block') ||
            (localPage      && localPage.style.display      === 'block') ||
            (settingsPage   && settingsPage.style.display   === 'block') ||
            (watchlistPage  && watchlistPage.style.display  === 'block') ||
            (watchLaterPage && watchLaterPage.style.display === 'block') ||
            (playlistsPage  && playlistsPage.style.display  === 'block') ||
            (statsPage      && statsPage.style.display      === 'block') ||
            (abosPage       && abosPage.style.display       === 'block') ||
            (downloadsPage  && downloadsPage.style.display  === 'block')
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

        // F5 → reload page data (not full browser refresh)
        if (e.key === 'F5') {
            e.preventDefault();
            navigateToPage(currentPage || 'home');
            return;
        }

        // Alt+Left / Browser Back → navigate previousPage
        if (e.key === 'BrowserBack' || (e.altKey && e.key === 'ArrowLeft')) {
            e.preventDefault();
            if (previousPage && previousPage !== currentPage) navigateToPage(previousPage);
            return;
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

    // Mouse back/forward button support (button 3 = back, button 4 = forward)
    document.addEventListener('mousedown', (e) => {
        if (e.button === 3) { // Mouse back button
            e.preventDefault();
            if (previousPage && previousPage !== currentPage) {
                navigateToPage(previousPage);
            } else {
                window._handleBackAction();
            }
        }
        if (e.button === 4) { // Mouse forward button
            e.preventDefault();
            // No forward history, just do nothing gracefully
        }
    });

    // Blur any button shortly after being clicked to prevent focus styling "sticking" (excluding selects to allow dropdowns to open)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, input[type="button"], input[type="submit"]');
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
            const videoModal            = document.getElementById('videoModal');
            const hamburgerSidebar       = document.getElementById('hamburgerSidebar');
            const filterSidebar         = document.getElementById('filterSidebar');
            const infoModal             = document.getElementById('infoModal');
            const seriesDetailPage      = document.getElementById('seriesDetailPage');
            const localFolderDetailPage = document.getElementById('localFolderDetailPage');
            const historyPage           = document.getElementById('historyPage');
            const livePage              = document.getElementById('livePage');
            const localPage             = document.getElementById('localPage');
            const settingsPage          = document.getElementById('settingsPage');
            const watchlistPage         = document.getElementById('watchlistPage');
            const statsPage             = document.getElementById('statsPage');
            const abosPage              = document.getElementById('abosPage');
            const downloadsPage         = document.getElementById('downloadsPage');

            const needsHandler = Boolean(
                (videoModal            && videoModal.classList.contains('active'))      ||
                (hamburgerSidebar       && hamburgerSidebar.classList.contains('active')) ||
                (filterSidebar         && filterSidebar.classList.contains('active'))   ||
                (infoModal             && infoModal.classList.contains('active'))       ||
                (seriesDetailPage      && seriesDetailPage.style.display      === 'block')    ||
                (localFolderDetailPage && localFolderDetailPage.style.display === 'block')    ||
                (historyPage           && historyPage.style.display           === 'block')    ||
                (livePage              && livePage.style.display              === 'block')    ||
                (localPage             && localPage.style.display             === 'block')    ||
                (settingsPage          && settingsPage.style.display          === 'block')    ||
                (watchlistPage         && watchlistPage.style.display         === 'block')    ||
                (statsPage             && statsPage.style.display             === 'block')    ||
                (abosPage              && abosPage.style.display              === 'block')    ||
                (downloadsPage         && downloadsPage.style.display         === 'block')
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
        document.getElementById('watchlistPage'),
        document.getElementById('statsPage'),
        document.getElementById('abosPage'),
        document.getElementById('downloadsPage'),
        document.getElementById('seriesDetailPage'),
        document.getElementById('localFolderDetailPage')
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
    
    // Hamburger menu navigation – only for items with data-page (skip data-category ones which have dedicated handlers)
    document.querySelectorAll('.hamburger-item[data-page]').forEach(item => {
        if (item._hamburgBound) return; // avoid duplicate listeners
        item._hamburgBound = true;
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            if (!page) return;
            console.log('Hamburger navigation to:', page);
            navigateToPage(page);
            if (hamburgerSidebar) hamburgerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            syncNativeBackHandler();
        });
    });
    
    console.log('All event listeners attached');
}

// Load Default Content
// Filter out content unsuitable for children when kids profile is active
function filterKidsSafe(items) {
    if (!items || !Array.isArray(items)) return [];
    const active = getActiveProfile();
    if (!active || !active.isKids) return items;
    
    // Comprehensive block patterns for kids mode (case-insensitive substring check)
    const blockedKeywords = [
        // Reproductive / Sexual / Adult topics
        'kinderwunsch', 'embryo', 'embryonentransfer', 'abtreibung', 'schwangerschaft',
        'erotik', 'erotisch', 'sex', 'sexual', 'nackt', 'nacktheit', 'porno', 'bordell', 
        'prostitut', 'stripper', 'affäre', 'fsk 16', 'fsk 18', 'ab 16', 'ab 18',
        
        // Crime / Murder / Horror / Thriller
        'tatort', 'polizeiruf', 'krimi', 'mord', 'mörder', 'tötung', 'leiche', 'blut', 
        'horror', 'thriller', 'true crime', 'verbrechen', 'serienmörder', 'forensik',
        'obduktion', 'pathologie', 'erdrosselt', 'erstochen', 'erschossen', 'ermordet',
        
        // Violence / War / Terrorism / Crisis
        'krieg', 'waffen', 'attentat', 'massaker', 'gewalt', 'hinrichtung', 'folter', 
        'terror', 'terrorist', 'amok', 'geisel', 'schießerei', 'bombe', 'anschlag', 
        'luftangriff', 'raketen', 'frontlinie', 'soldaten', 'ukraine-krieg', 'nahost-konflikt',
        'hamas', 'israel-gaza', 'putin', 'taliban',
        
        // Drugs / Abuse / Suicide
        'drogen', 'sucht', 'süchtig', 'alkohol', 'kokain', 'heroin', 'cannabis', 
        'missbrauch', 'vergewaltigung', 'trauma', 'suizid', 'selbstmord', 'sterbehilfe',
        'psychiatrie', 'psychose', 'geschlossene anstalt',
        
        // Prison / Court
        'gefängnis', 'haft', 'strafvollzug', 'justizvollzugsanstalt', 'jva', 'anklagebank',
        
        // Adult Politics / Economy / Hard News
        'bundestagswahl', 'parteitag', 'wahlkampf', 'inflation', 'insolvenz', 'finanzkrise',
        'steuern', 'steuerhinterziehung', 'börsencrash', 'rente', 'altersarmut'
    ];
    
    return items.filter(item => {
        const text = `${item.title || ''} ${item.topic || ''} ${item.description || ''}`.toLowerCase();
        return !blockedKeywords.some(kw => text.includes(kw));
    });
}

async function loadDefaultContent() {
    try {
        console.log('loadDefaultContent() called');
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
        console.error('loadDefaultContent error:', error);
    }
}

// Build personalized query from watch history
function buildPersonalizedQuery() {
    try {
        const history = getRecentlyWatched();
        if (history.length < 3) return null;
        const recent = history.slice(0, 30);
        const skip = new Set(['der','die','das','ein','eine','und','mit','im','in','auf','zu','von','an','am','ist','für','bei','wie','aus','was','ich','du','wir','sie','es','er','aber','oder','nicht','noch','auch','schon','mal','sehr','mehr','dem','den','des','wird','eine','nach','beim','über','alle','als','hat','war']);
        const freq = {};
        recent.forEach(item => {
            ((item.title || '') + ' ' + (item.topic || '')).toLowerCase()
                .split(/[\s,!?.\-:]+/)
                .forEach(w => {
                    w = w.replace(/[^a-züöäß]/g, '');
                    if (w.length > 4 && !skip.has(w)) freq[w] = (freq[w] || 0) + 1;
                });
        });
        const topWords = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,5).map(([w]) => w);
        if (topWords.length > 0) {
            // Pick a random interest from top words to avoid locking forever into the single most recent word
            return topWords[Math.floor(Math.random() * topWords.length)];
        }
        return null;
    } catch { return null; }
}

// Helper: Clean Hörfassung / AD from title and topic
function cleanEpisodeTitle(title) {
    if (!title) return '';
    return title
        .replace(/\s*[\(\[]Hörfassung[\)\]]/gi, '')
        .replace(/\s*[\(\[]Audiodeskription[\)\]]/gi, '')
        .replace(/\s*[\(\[]AD[\)\]]/gi, '')
        .replace(/\s*-\s*Hörfassung/gi, '')
        .replace(/\s*-\s*Audiodeskription/gi, '')
        .trim();
}

function cleanTopic(topic) {
    if (!topic) return '';
    return topic
        .replace(/\s*[\(\[]Hörfassung[\)\]]/gi, '')
        .replace(/\s*[\(\[]Audiodeskription[\)\]]/gi, '')
        .replace(/\s*[\(\[]AD[\)\]]/gi, '')
        .replace(/\s*-\s*Hörfassung/gi, '')
        .replace(/\s*-\s*Audiodeskription/gi, '')
        .trim();
}

function isAudioDescription(item) {
    if (!item) return false;
    const text = `${item.title || ''} ${item.topic || ''} ${item.description || ''}`.toLowerCase();
    return text.includes('hörfassung') || text.includes('audiodeskription');
}

// Load Recommendations
async function loadRecommendations() {
    showLoading(true);
    try {
        console.log('Loading recommendations...');
        currentCategory = '';

        const isKids = getActiveProfile().isKids;
        const fallbackCategories = ['Dokumentation', 'Spielfilm', 'Tatort', 'Reportage', 'Krimi', 'Terra X', 'Comedy', 'Natur', 'Kultur'];
        
        let payload;
        if (isKids) {
            // Load diverse and colorful catalog from KiKA channel with rotating offset
            const randomOffset = Math.floor(Math.random() * 4) * 30;
            payload = {
                queries: [
                    { fields: ["channel"], query: "KiKA" }
                ],
                sortBy: "timestamp",
                sortOrder: "desc",
                future: true,
                offset: randomOffset,
                size: 150
            };
        } else {
            const personalQuery = buildPersonalizedQuery();
            const query = (personalQuery && Math.random() > 0.4) 
                ? personalQuery 
                : fallbackCategories[Math.floor(Math.random() * fallbackCategories.length)];
            const randomOffset = Math.floor(Math.random() * 3) * 20;
            payload = {
                queries: [{ fields: ["title", "topic", "description"], query }],
                sortBy: "timestamp",
                sortOrder: "desc",
                future: true,
                offset: randomOffset,
                size: 100
            };
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            let results = data.result?.results || [];
            if (isKids) {
                results = filterKidsSafe(results);
            }
            if (results.length > 0) {
                // Interleave series so no single series occupies the top 20 items in recommendations
                const topicCount = {};
                const headList = [];
                const tailList = [];
                results.forEach(item => {
                    const t = (item.topic || item.title || '').trim().toLowerCase();
                    topicCount[t] = (topicCount[t] || 0) + 1;
                    if (topicCount[t] <= 2) {
                        headList.push(item);
                    } else {
                        tailList.push(item);
                    }
                });
                results = [...headList, ...tailList];

                currentResults = results;
                originalResults = [...currentResults];
                displayResults();
                showLoading(false);
                return;
            }
        }
    } catch (error) {
        console.warn('Recommendations error:', error);
    }

    // Fallback: search default category
    const fallbackCategory = getActiveProfile().isKids ? 'KiKA' : 'Dokumentation';
    await performSearch(fallbackCategory);
}

// Track if a search is in progress so navigateToPage doesn't flash FYP content
let _searchInProgress = false;

// Perform Search
async function performSearch(query) {
    if (!query) return;
    
    // Close active video modal if open
    if (typeof closeVideoModal === 'function') {
        closeVideoModal();
    }

    // Mark search in progress BEFORE navigating so home page doesn't flash FYP
    _searchInProgress = true;
    currentQuery = query;
    currentCategory = query;
    currentOffset = 0;
    displayedResults = [];

    // Switch to home page if on subpage so search results are visible
    if (typeof navigateToPage === 'function') {
        navigateToPage('home');
    }

    try {
        console.log('Searching for:', query);
        
        // Save to search query history (skip generic category searches)
        if (query && query !== 'Tatort' && query !== 'Dokumentation' && query !== 'Spielfilm' && query !== 'Nachrichten' && query !== 'Sport' && query !== 'Kinder' && query !== 'KiKA' && query !== 'Reportage') {
            saveSearchQuery(query);
        }
        hideSearchHistoryDropdown();
        
        // Hide recently watched when actively searching
        if (recentlyWatched) {
            recentlyWatched.style.display = 'none';
        }
        
        if (searchInput) searchInput.value = query;
        // Set title immediately so it shows the search term, not FYP
        if (sectionTitle) sectionTitle.innerHTML = `<i class="fas fa-search"></i> ${query}`;
        
        showLoading(true);
        
        let payload;
        if (query.trim().toLowerCase() === 'kinder' || query.trim().toLowerCase() === 'kika') {
            // Dedicated Kids television catalog (KiKA channel)
            payload = {
                queries: [
                    { fields: ["channel"], query: "KiKA" }
                ],
                sortBy: "timestamp",
                sortOrder: "desc",
                future: true,
                offset: 0,
                size: 200
            };
        } else {
            payload = {
                queries: [
                    { fields: ["title", "topic", "description"], query: query }
                ],
                sortBy: "timestamp",
                sortOrder: "desc",
                future: true,
                offset: 0,
                size: 200
            };
        }
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        let rawResults = data.result?.results || [];
        if (getActiveProfile().isKids) {
            rawResults = filterKidsSafe(rawResults);
        }
        currentResults = rawResults;
        originalResults = [...currentResults];
        console.log('Found', currentResults.length, 'videos for:', query);
        
        // Scroll to top AFTER results load, not before
        window.scrollTo({ top: 0, behavior: 'instant' });
        const mc = document.querySelector('.main-content');
        if (mc) mc.scrollTop = 0;

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
        _searchInProgress = false;
    }
}

// Display Results
function displayResults() {
    try {
        console.log('Displaying results...');
        if (emptyState) emptyState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'none';
        
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
        if (emptyState) emptyState.style.display = 'none';
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

        // Check for separate Staffel mention in title/description (e.g. "Staffel 2", "2. Staffel", "Season 3")
        let detectedSeason = 1;
        const separateStaffel = this.combined.match(/(?:staffel|season)\s*(\d{1,2})/i) || this.combined.match(/(\d{1,2})\.\s*staffel/i);
        if (separateStaffel) {
            detectedSeason = parseInt(separateStaffel[1], 10);
        }

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
            season = detectedSeason;
            episode = parseInt(folge[1], 10);
            confidence = 80;
            return { season, episode, confidence, pattern: 'Folge X' };
        }

        // Pattern 4: Teil X
        const teil = this.combined.match(/teil[\s:]?(\d{1,3})/i);
        if (teil) {
            season = detectedSeason;
            episode = parseInt(teil[1], 10);
            confidence = 75;
            return { season, episode, confidence, pattern: 'Teil X' };
        }

        // Pattern 5: (X/Y) oder X/Y - z.B. "(1/4)" oder "1/4"
        const fraction = this.combined.match(/\(?(\d{1,3})\/(\d{1,3})\)?/);
        if (fraction) {
            season = detectedSeason;
            episode = parseInt(fraction[1], 10);
            confidence = 70;
            return { season, episode, confidence, pattern: 'X/Y', total: parseInt(fraction[2], 10) };
        }

        // Pattern 6: Führende Nummer mit Trennzeichen: "01 - ", "1. ", "(1) "
        const leadingNumber = this.title.match(/^(?:\()?(\d{1,3})(?:\)|\.|\s*-)\s+/);
        if (leadingNumber) {
            season = detectedSeason;
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
                season = detectedSeason;
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
    
    return cleanTopic(topic)
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
    
    const topicGroups = new Map();
    
    items.forEach(item => {
        const cleanedTopic = cleanTopic(item.topic);
        const normalizedTopic = normalizeTopicKey(cleanedTopic);
        
        if (!normalizedTopic || isBlacklisted(cleanedTopic)) return;
        
        const parser = new EpisodeParser(item.title, item.description);
        if (!parser.isSeries()) return;
        
        if (!topicGroups.has(normalizedTopic)) {
            topicGroups.set(normalizedTopic, {
                count: 0,
                originalTopic: cleanedTopic,
                items: []
            });
        }
        
        const group = topicGroups.get(normalizedTopic);
        group.count++;
        group.items.push(item);
    });
    
    for (const group of topicGroups.values()) {
        if (group.count >= 3) {
            console.log('[isSeriesContext] ✓ Serie erkannt:', group.originalTopic);
            return true;
        }
    }
    
    return false;
}

// REGEL 1 + 2 + 3: displaySeriesGrouped - Topic-basierte Gruppierung
// Group all results by series (topic-based)
function groupAllResults(items) {
    const hideAD = document.getElementById('hideAudioDescriptionToggle')?.checked || false;
    const topicMap = new Map();
    const standaloneVideos = [];
    
    items.forEach((item) => {
        if (hideAD && isAudioDescription(item)) {
            return;
        }

        const cleanedTopic = cleanTopic(item.topic);
        const normalizedTopic = normalizeTopicKey(cleanedTopic);
        
        // Kein Topic oder blacklisted -> Standalone
        if (!normalizedTopic || isBlacklisted(cleanedTopic)) {
            standaloneVideos.push(item);
            return;
        }
        
        if (!topicMap.has(normalizedTopic)) {
            topicMap.set(normalizedTopic, {
                originalTopic: cleanedTopic,
                items: []
            });
        }
        
        topicMap.get(normalizedTopic).items.push(item);
    });
    
    const displayList = [];
    
    // Process series (groups with 2+ items for the same topic)
    topicMap.forEach((groupData, normalizedTopic) => {
        const groupItems = groupData.items;
        
        if (groupItems.length >= 2) {
            displayList.push({
                type: 'series',
                title: groupData.originalTopic,
                episodes: groupItems
            });
        } else {
            // Only 1 item -> standalone
            standaloneVideos.push(...groupItems);
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
        } else if (item.type === 'video') {
            const card = createVideoCard(item.data, index);
            if (videoGrid) videoGrid.appendChild(card);
        }
    });
}

// REGEL 4 + 5: openSeriesDetail - Sortierung und TMDB-Integration
async function openSeriesDetail(seriesName, episodes) {
    console.log('[openSeriesDetail] Öffne Serie:', seriesName, 'mit', episodes.length, 'Episoden');
    
    if (currentPage && currentPage !== 'seriesDetail') {
        window._seriesPreviousPage = currentPage;
    }
    // Navigate to seriesDetail using unified navigateToPage
    navigateToPage('seriesDetail');
    
    // Setze Titel
    const titleEl = document.getElementById('seriesDetailTitle');
    if (titleEl) titleEl.innerHTML = `<i class="fas fa-tv"></i> ${seriesName}`;
    
    // Setup Back-Button immediately so user can always navigate back
    const backBtn = document.getElementById('backFromSeries');
    if (backBtn) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            try {
                if (window._haptic) window._haptic.tick();
                const target = (window._seriesPreviousPage && window._seriesPreviousPage !== 'seriesDetail') ? window._seriesPreviousPage : 'home';
                navigateToPage(target);
            } catch (err) {
                console.error('Back button error:', err);
                navigateToPage('home');
            }
        };
    }
    
    const episodesGrid = document.getElementById('seriesEpisodesGrid');
    const seriesInfo = document.getElementById('seriesInfo');
    if (episodesGrid) episodesGrid.innerHTML = '';
    
    try {
        const firstEpisode = (episodes && episodes.length > 0) ? episodes[0] : {};
        
        // Fetch ALL available episodes for this series topic from MediathekView
        let allEpisodes = [...(episodes || [])];
        try {
            const payload = {
                queries: [
                    { fields: ["topic"], query: seriesName }
                ],
                sortBy: "timestamp",
                sortOrder: "desc",
                future: true,
                offset: 0,
                size: 200
            };
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const data = await response.json();
                let fetched = data.result?.results || [];
                if (getActiveProfile().isKids) {
                    fetched = filterKidsSafe(fetched);
                }
                if (fetched.length > 0) {
                    const seen = new Set();
                    const merged = [];
                    [...fetched, ...(episodes || [])].forEach(ep => {
                        const key = getVideoProgressKey(ep);
                        if (key && !seen.has(key)) {
                            seen.add(key);
                            merged.push(ep);
                        }
                    });
                    allEpisodes = merged;
                    console.log(`[openSeriesDetail] Vollständige Episodenliste geladen: ${allEpisodes.length} Episoden`);
                }
            }
        } catch (e) {
            console.warn('[openSeriesDetail] Fehler beim Nachladen aller Episoden:', e);
        }
        episodes = allEpisodes;
        
        // REGEL 5: TMDB-Abfrage mit sauberem Topic (nicht mit Episode-Titel!)
        let tmdbSeries = null;
        let tmdbDetails = null;
        
        try {
            const bestSearchName = findBestSeriesSearchQuery(seriesName, episodes);
            console.log('[openSeriesDetail] TMDB-Suche für:', bestSearchName);
            tmdbSeries = await searchTMDBSeries(bestSearchName, episodes[0]);
            
            if (tmdbSeries && tmdbSeries.id) {
                console.log('[openSeriesDetail] ✓ TMDB Serie gefunden:', tmdbSeries.name, '(ID:', tmdbSeries.id + ')');
                tmdbDetails = await getTMDBSeriesDetails(tmdbSeries.id);
            } else {
                console.log('[openSeriesDetail] ✗ TMDB Serie nicht gefunden');
            }
        } catch (e) {
            console.error('[openSeriesDetail] TMDB-Fehler:', e);
        }
        
        // ── Helper: detect Extras / Clips / BTS / Rückblicke ──
        function isSeriesExtra(ep) {
            const title = (ep.title || '').toLowerCase();
            const desc = (ep.description || '').toLowerCase();
            const duration = parseInt(ep.duration || '0', 10);
            
            const extraKeywords = [
                'rückblick', 'making of', 'making-of', 'behind the scenes', 'bts',
                'trailer', 'teaser', 'clip', 'vorschau', 'spoiler', 'danke für eure',
                'interview', 'outtakes', 'bloopers', 'bonus', 'kurzclip', 'musikvideo',
                'song', 'best of', 'hinter den kulissen'
            ];
            
            if (extraKeywords.some(kw => title.includes(kw) || desc.includes(kw))) {
                return true;
            }
            if (duration > 0 && duration <= 240) {
                return true;
            }
            return false;
        }

        // 1. Separate full episodes from Extras & Clips
        const fullEpisodesList = [];
        const extrasList = [];
        
        episodes.forEach(ep => {
            if (isSeriesExtra(ep)) {
                extrasList.push(ep);
            } else {
                fullEpisodesList.push(ep);
            }
        });

        // 2. Identify Primary / Main Channel (the channel with the most full episodes)
        const channelCounts = {};
        fullEpisodesList.forEach(ep => {
            const ch = ep.channel || 'DEFAULT';
            channelCounts[ch] = (channelCounts[ch] || 0) + 1;
        });
        let primaryChannel = firstEpisode.channel || 'DEFAULT';
        let maxCount = -1;
        Object.entries(channelCounts).forEach(([ch, count]) => {
            if (count > maxCount) {
                maxCount = count;
                primaryChannel = ch;
            }
        });
        console.log(`[openSeriesDetail] Hauptsender: ${primaryChannel} (${maxCount} Episoden)`);

        // 3. Parse & Deduplicate Full Episodes (prefer non-Hörfassung over Hörfassung, prefer primary channel)
        const episodeMap = new Map();
        
        fullEpisodesList.forEach(ep => {
            const parser = new EpisodeParser(ep.title, ep.description);
            const parseResult = parser.parse();
            const s = parseResult.season || 1;
            const e = parseResult.episode || 0;
            const cleanT = cleanEpisodeTitle(ep.title).toLowerCase();
            const epKey = (e > 0) ? `s${s}_e${e}` : `t_${cleanT}`;
            const isAD = isAudioDescription(ep);
            
            const existing = episodeMap.get(epKey);
            if (!existing) {
                episodeMap.set(epKey, {
                    ...ep,
                    title: cleanEpisodeTitle(ep.title),
                    parsedSeason: s,
                    parsedEpisode: e,
                    isAD: isAD,
                    parseConfidence: parseResult.confidence,
                    parsePattern: parseResult.pattern
                });
            } else {
                // If existing is Hörfassung and incoming is regular non-Hörfassung -> replace with regular!
                if (existing.isAD && !isAD) {
                    episodeMap.set(epKey, {
                        ...ep,
                        title: cleanEpisodeTitle(ep.title),
                        parsedSeason: s,
                        parsedEpisode: e,
                        isAD: isAD,
                        parseConfidence: parseResult.confidence,
                        parsePattern: parseResult.pattern
                    });
                } else if (existing.isAD === isAD && ep.channel === primaryChannel && existing.channel !== primaryChannel) {
                    // Prefer primary channel
                    episodeMap.set(epKey, {
                        ...ep,
                        title: cleanEpisodeTitle(ep.title),
                        parsedSeason: s,
                        parsedEpisode: e,
                        isAD: isAD,
                        parseConfidence: parseResult.confidence,
                        parsePattern: parseResult.pattern
                    });
                }
            }
        });

        // Fallback: If deduplication resulted in empty list, use all full episodes
        let parsedEpisodes = Array.from(episodeMap.values());
        if (parsedEpisodes.length === 0 && fullEpisodesList.length > 0) {
            parsedEpisodes = fullEpisodesList.map(ep => {
                const parser = new EpisodeParser(ep.title, ep.description);
                const parseResult = parser.parse();
                return { ...ep, title: cleanEpisodeTitle(ep.title), parsedSeason: parseResult.season || 1, parsedEpisode: parseResult.episode || 0 };
            });
        }
        if (parsedEpisodes.length === 0 && episodes.length > 0) {
            parsedEpisodes = episodes.map(ep => ({ ...ep, title: cleanEpisodeTitle(ep.title), parsedSeason: 1, parsedEpisode: 0 }));
        }

        // 4. Group full episodes by season
        const seasonMap = new Map();
        parsedEpisodes.forEach(ep => {
            const season = ep.parsedSeason || 1;
            if (!seasonMap.has(season)) {
                seasonMap.set(season, []);
            }
            seasonMap.get(season).push(ep);
        });
        
        // Sort seasons ascending (1 -> 2 -> 3...)
        const sortedSeasons = Array.from(seasonMap.keys()).sort((a, b) => a - b);
        
        sortedSeasons.forEach(season => {
            const eps = seasonMap.get(season);
            
            // Sort episodes ascending (Folge 1 -> Folge 2 -> Folge 3... -> Folge 26)
            eps.sort((a, b) => {
                const epA = parseInt(a.parsedEpisode, 10) || 0;
                const epB = parseInt(b.parsedEpisode, 10) || 0;
                
                if (epA > 0 && epB > 0) {
                    return epA - epB;
                }
                if (epA > 0) return -1;
                if (epB > 0) return 1;
                
                // Fallback to timestamp (oldest first for chronological order)
                const timeA = parseInt(a.timestamp, 10) || 0;
                const timeB = parseInt(b.timestamp, 10) || 0;
                return timeA - timeB;
            });
            
            console.log(`[openSeriesDetail] Staffel ${season}: ${eps.length} Episoden aufsteigend sortiert`);
        });
        
        // Verwende TMDB-Beschreibung wenn verfügbar
        let bestDescription = '';
        if (tmdbDetails && tmdbDetails.overview && tmdbDetails.overview.trim().length > 10) {
            bestDescription = tmdbDetails.overview.trim();
        } else if (tmdbSeries && tmdbSeries.overview && tmdbSeries.overview.trim().length > 10) {
            bestDescription = tmdbSeries.overview.trim();
        } else {
            bestDescription = `Alle verfügbaren Staffeln und Folgen der Serie „${seriesName}“ (${primaryChannel}). Wähle unten eine Episode aus der Staffelübersicht, um sie abzuspielen.`;
        }
        
        const totalSeasons = Math.max(1, sortedSeasons.length);
        const posterId = `series_poster_${btoa(encodeURIComponent(seriesName)).substring(0, 16)}`;
        
        let posterHTML = `<i class="fas fa-tv" style="opacity: 0.3;"></i>`;
        let posterStyle = '';
        
        if (tmdbDetails && tmdbDetails.poster_path) {
            const posterURL = getTMDBPosterURL(tmdbDetails.poster_path);
            posterStyle = `style="background-image: url(${posterURL}); background-size: cover; background-position: center;"`;
            posterHTML = '';
        }
        if (seriesInfo) {
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
            
            // Check subscription status
            const isSubbed = getAbos().some(a => a.term.toLowerCase() === seriesName.toLowerCase());

            // Baue Serien-Info HTML
            seriesInfo.innerHTML = `
                <div class="series-info-poster" id="${posterId}" ${posterStyle}>
                    ${posterHTML}
                </div>
                <div class="series-info-details">
                    <h3>${seriesName}</h3>
                    <div class="series-info-meta">
                        <span><i class="fas fa-tv"></i> ${primaryChannel}</span>
                        <span><i class="fas fa-layer-group"></i> ${totalSeasons} ${totalSeasons === 1 ? 'Staffel' : 'Staffeln'}</span>
                        <span><i class="fas fa-list"></i> ${parsedEpisodes.length} Folgen</span>
                        ${extrasList.length > 0 ? `<span><i class="fas fa-film"></i> ${extrasList.length} Extras</span>` : ''}
                        ${tmdbDetails && tmdbDetails.first_air_date ? `<span><i class="fas fa-calendar"></i> ${tmdbDetails.first_air_date.split('-')[0]}</span>` : ''}
                        ${tmdbDetails && tmdbDetails.vote_average ? `<span><i class="fas fa-star" style="color:#eab308;"></i> ${tmdbDetails.vote_average.toFixed(1)}/10</span>` : ''}
                    </div>
                    <div class="series-info-description">
                        ${bestDescription}
                    </div>
                    <div style="margin-top: 1rem;">
                        <button id="seriesDetailSubBtn" class="action-btn${isSubbed ? ' btn-subscribed' : ''}" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 8px;">
                            <i class="fas ${isSubbed ? 'fa-bell-slash' : 'fa-bell'}"></i> ${isSubbed ? 'Abonniert' : 'Serie abonnieren'}
                        </button>
                    </div>
                </div>
            `;

            const subBtn = document.getElementById('seriesDetailSubBtn');
            if (subBtn) {
                subBtn.onclick = () => {
                    const abos = getAbos();
                    const idx = abos.findIndex(a => a.term.toLowerCase() === seriesName.toLowerCase());
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
        
        // Zeige Episoden gruppiert nach Staffel (aufsteigend)
        if (episodesGrid) {
            episodesGrid.innerHTML = '';
            
            sortedSeasons.forEach(seasonNum => {
                const seasonEpisodes = seasonMap.get(seasonNum) || [];
                
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

            // Zeige Extras / Clips / Bonus ganz unten
            if (extrasList.length > 0) {
                const extrasHeader = document.createElement('div');
                extrasHeader.style.cssText = 'grid-column: 1/-1; margin: 2.5rem 0 1rem 0; padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed var(--border-color);';
                extrasHeader.innerHTML = `
                    <h3 style="margin: 0; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-film"></i>
                        Extras, Clips & Bonus
                        <span style="color: var(--text-secondary); font-size: 0.85rem; font-weight: normal;">(${extrasList.length} Clips)</span>
                    </h3>
                `;
                episodesGrid.appendChild(extrasHeader);

                extrasList.forEach((extra, idx) => {
                    const card = createVideoCard(extra, idx);
                    episodesGrid.appendChild(card);
                });
            }
        }
        
        console.log('[openSeriesDetail] ✓ Detail-Seite erfolgreich geladen');
    } catch (fatalErr) {
        console.error('[openSeriesDetail] Schwerer Fehler beim Rendern:', fatalErr);
        if (episodesGrid && episodesGrid.children.length === 0) {
            (episodes || []).forEach((ep, idx) => {
                const card = createVideoCard(ep, idx);
                episodesGrid.appendChild(card);
            });
        }
    }
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

    const firstEpisode = episodes[0] || {};
    const gradient = getChannelGradient(firstEpisode.channel);
    const thumbnailId = `thumb-${++thumbIdCounter}`;
    const countBadgeId = `scount_b_${thumbIdCounter}`;
    const countMetaId = `scount_m_${thumbIdCounter}`;

    card.innerHTML = `
        <div class="series-card-thumbnail" id="${thumbnailId}" style="background: ${gradient};">
            <span class="sender-logo thumb-overlay-logo">${firstEpisode.channel || ''}</span>
            <div class="duration-badge" style="display:inline-flex; align-items:center; gap:4px;">
                <i class="fas fa-layer-group"></i> <span id="${countBadgeId}">${episodes.length} Folgen</span>
            </div>
        </div>
        <div class="series-card-content">
            <h3 class="series-card-title">${seriesName}</h3>
            <div class="series-card-meta">
                <span class="channel-badge">${firstEpisode.channel || ''}</span>
                <span class="channel-badge" style="background: rgba(99, 102, 241, 0.18); color: #818cf8; font-size: 0.72rem;"><i class="fas fa-tv"></i> Serie</span>
                <span id="${countMetaId}">${episodes.length} Folgen</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => openSeriesDetail(seriesName, episodes));

    // Fast background query to get the true total episode count across all broadcasts
    (async () => {
        try {
            const countPayload = {
                queries: [{ fields: ["topic"], query: seriesName }],
                future: true,
                size: 0
            };
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(countPayload)
            });
            if (res.ok) {
                const countData = await res.json();
                const total = countData.result?.total || 0;
                if (total > 0) {
                    const badgeEl = document.getElementById(countBadgeId);
                    const metaEl = document.getElementById(countMetaId);
                    if (badgeEl) badgeEl.textContent = `${total} Folgen`;
                    if (metaEl) metaEl.textContent = `${total} Folgen`;
                }
            }
        } catch(e) {}
    })();

    // Async TMDB poster preview for series card
    (async () => {
        try {
            const bestSearchName = findBestSeriesSearchQuery(seriesName, episodes);
            const tmdb = await searchTMDBSeries(bestSearchName, firstEpisode);
            if (tmdb && (tmdb.backdrop_path || tmdb.poster_path)) {
                const imgPath = tmdb.backdrop_path || tmdb.poster_path;
                const imgUrl = getTMDBPosterURL(imgPath);
                const el = document.getElementById(thumbnailId);
                if (el) {
                    el.style.backgroundImage = `url(${imgUrl})`;
                    el.style.backgroundSize = 'cover';
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
        } catch(e) {
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
    const inWLater = isInWatchLater(item);

    card.innerHTML = `
        <div class="video-thumbnail" id="${thumbnailId}" style="background: ${gradient};">
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
                ${isAudioDescription(item) ? '<span class="channel-badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; font-size: 0.7rem;" title="Hörfassung / Audiodeskription">AD</span>' : ''}
                <span class="video-date">${dateText}</span>
            </div>
        </div>
    `;

    // Right-click on desktop opens context menu
    card.addEventListener('contextmenu', (e) => openCardContextMenu(item, card, e));

    // Touch long-press on Android/mobile opens context menu
    let cardPressTimer = null;
    let longPressed = false;
    card.addEventListener('touchstart', (e) => {
        if (e.target.closest('.watchlist-btn, .watchlater-btn')) return;
        longPressed = false;
        cardPressTimer = setTimeout(() => {
            longPressed = true;
            if (window._haptic) window._haptic.heavy();
            openCardContextMenu(item, card, e);
        }, 400);
    }, { passive: true });

    card.addEventListener('touchend', () => clearTimeout(cardPressTimer), { passive: true });
    card.addEventListener('touchmove', () => clearTimeout(cardPressTimer), { passive: true });

    card.addEventListener('click', (e) => {
        if (longPressed) {
            e.stopPropagation();
            e.preventDefault();
            longPressed = false;
            return;
        }
        playVideo(item);
    });

    const wlBtn = card.querySelector('.watchlist-btn');
    if (wlBtn) {
        wlBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
        wlBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWatchlist(item, wlBtn);
        }, { passive: false });
        wlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // On desktop there's no touchend, so trigger toggle here
            if (!wlBtn._touchTriggered) toggleWatchlist(item, wlBtn);
            wlBtn._touchTriggered = false;
        });
        wlBtn.addEventListener('touchstart', () => { wlBtn._touchTriggered = true; }, { passive: true });
    }

    const wlaterBtn = card.querySelector('.watchlater-btn');
    if (wlaterBtn) {
        wlaterBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
        wlaterBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWatchLater(item, wlaterBtn);
        }, { passive: false });
        wlaterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // On desktop there's no touchend, so trigger toggle here
            if (!wlaterBtn._touchTriggered) toggleWatchLater(item, wlaterBtn);
            wlaterBtn._touchTriggered = false;
        });
        wlaterBtn.addEventListener('touchstart', () => { wlaterBtn._touchTriggered = true; }, { passive: true });
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

    card._videoItem = item;
    return card;
}

// Real thumbnails are always loaded via queueRealThumbnail / captureVideoFrame.

// Show/Hide States
function showLoading(show) {
    if (loadingState) loadingState.style.display = show ? 'flex' : 'none';
    if (show) {
        if (emptyState) emptyState.style.display = 'none';
        if (videoGrid) videoGrid.innerHTML = '';
    }
}

function showEmpty(show) {
    if (emptyState) emptyState.style.display = show ? 'flex' : 'none';
    if (show) {
        if (loadingState) loadingState.style.display = 'none';
        if (videoGrid) videoGrid.innerHTML = '';
    }
}

// Play Video
function playVideo(item) {
    try {
        const videoUrl = item.url_video_hd || item.url_video || item.url_video_low;
        window.currentPlayingVideo = item;
        window._currentPlayingItem = item; // used by hold-2x pill and modal watch-later btn
        document.title = '[PLAYING] ' + (item.title || 'StreamHub');
        
        // Always open video modal so user sees response
        if (videoModal) videoModal.classList.add('active');
        try { if (window.AndroidNativeTheme && window.AndroidNativeTheme.updatePipAutoEnter) window.AndroidNativeTheme.updatePipAutoEnter(true); } catch(e){}
        // Re-init the 2x hold zone – the container exists now that modal is open
        setTimeout(() => {
            if (typeof window._reinitHoldZone2x === 'function') window._reinitHoldZone2x();
        }, 80);
        
        if (!videoUrl) {
            console.warn('[playVideo] Video-URL nicht verfügbar');
            const descEl = document.getElementById('videoDescription');
            if (descEl) descEl.textContent = 'Hinweis: Für diesen Inhalt ist aktuell kein direkter Video-Stream verfügbar.';
        }
        
        // Set video info
        const titleEl = document.getElementById('videoTitle');
        const channelEl = document.getElementById('videoChannel');
        const durationEl = document.getElementById('videoDuration');
        const dateEl = document.getElementById('videoDate');
        const descEl = document.getElementById('videoDescription');
        
        if (titleEl) titleEl.textContent = cleanEpisodeTitle(item.title);
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

        // Fetch TMDb rating (episode rating first, fallback to series rating)
        const apiKey = localStorage.getItem('tmdbApiKey') || '';
        if (ratingEl) {
            const seriesTitle = (item.topic && item.topic.trim() && item.topic.trim() !== item.title.trim())
                ? item.topic.trim()
                : null;
            const episodeTitle = _cleanTitleForTmdb(item.title) || item.title.trim();

            const renderBadge = (vote_average, title, typeLabel) => {
                if (!ratingEl) return;
                const tmdbBadge = document.createElement('span');
                tmdbBadge.style.cssText = 'font-size:0.75rem; color:#94a3b8; margin-left:8px; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; cursor:default; display:inline-flex; align-items:center; gap:4px;';
                const numStars = Math.round(vote_average / 2);
                let starsHtml = '';
                for (let s = 0; s < 5; s++) {
                    if (s < numStars) starsHtml += '<i class="fas fa-star" style="color:#f59e0b; font-size:0.7rem;"></i>';
                    else starsHtml += '<i class="far fa-star" style="color:#475569; font-size:0.7rem;"></i>';
                }
                tmdbBadge.innerHTML = `<span>${starsHtml}</span> <span>${vote_average.toFixed(1)}/10 (${typeLabel})</span>`;
                tmdbBadge.title = `TMDb (${typeLabel}): ${title}`;
                ratingEl.appendChild(tmdbBadge);
            };

            // If offline and no cache
            if (!navigator.onLine) {
                const cacheKey = `tmdb_cache_${episodeTitle.toLowerCase()}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const cData = JSON.parse(cached);
                        renderBadge(cData.vote_average, cData.title, cData.typeLabel || 'Cached');
                        return;
                    } catch (e) {}
                }
                const offBadge = document.createElement('span');
                offBadge.style.cssText = 'font-size:0.75rem; color:#94a3b8; margin-left:8px; opacity:0.7;';
                offBadge.innerHTML = `<i class="fas fa-wifi" style="margin-right:3px;"></i>Bewertung offline`;
                ratingEl.appendChild(offBadge);
            } else if (apiKey && apiKey !== 'YOUR_API_KEY_HERE' && item.title && !item.isLocal) {
                const epCacheKey = `tmdb_cache_${episodeTitle.toLowerCase()}`;
                const cachedEp = localStorage.getItem(epCacheKey);
                if (cachedEp) {
                    try {
                        const cData = JSON.parse(cachedEp);
                        renderBadge(cData.vote_average, cData.title, cData.typeLabel || 'Folge');
                        return;
                    } catch (e) {}
                }

                // 1. Try episode rating search first
                fetch(`${TMDB_BASE_URL}/search/multi?api_key=${apiKey}&language=de-DE&query=${encodeURIComponent(episodeTitle)}`)
                    .then(res => res.json())
                    .then(data => {
                        const results = data.results || [];
                        const match = results.find(r => r.vote_average > 0);
                        if (match) {
                            renderBadge(match.vote_average, match.title || match.name, 'Folge');
                            localStorage.setItem(epCacheKey, JSON.stringify({ vote_average: match.vote_average, title: match.title || match.name, typeLabel: 'Folge' }));
                        } else if (seriesTitle) {
                            // 2. Fallback to series rating
                            const serCacheKey = `tmdb_cache_${seriesTitle.toLowerCase()}`;
                            fetch(`${TMDB_BASE_URL}/search/multi?api_key=${apiKey}&language=de-DE&query=${encodeURIComponent(seriesTitle)}`)
                                .then(res => res.json())
                                .then(sData => {
                                    const sResults = sData.results || [];
                                    const sMatch = sResults.find(r => r.vote_average > 0);
                                    if (sMatch) {
                                        renderBadge(sMatch.vote_average, sMatch.name || sMatch.title, 'Serie');
                                        localStorage.setItem(serCacheKey, JSON.stringify({ vote_average: sMatch.vote_average, title: sMatch.name || sMatch.title, typeLabel: 'Serie' }));
                                    }
                                });
                        }
                    })
                    .catch(err => console.warn('TMDb live rating fetch error:', err));
            }
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

        // Setup "Zur Serie" Button & clickable Topic Badge
        const seriesTopic = (item.topic && item.topic.trim()) || '';
        const topicBadge = document.getElementById('videoTopicBadge');
        const topicName = document.getElementById('videoTopicName');
        const modalSeriesBtn = document.getElementById('modalSeriesBtn');

        if (seriesTopic && seriesTopic.toLowerCase() !== (item.title || '').toLowerCase()) {
            if (topicBadge && topicName) {
                topicName.textContent = seriesTopic;
                topicBadge.style.display = 'inline-flex';
                topicBadge.onclick = () => {
                    closeVideoModal();
                    openSeriesDetail(seriesTopic, [item]);
                };
            }
            if (modalSeriesBtn) {
                modalSeriesBtn.style.display = 'inline-flex';
                modalSeriesBtn.onclick = () => {
                    closeVideoModal();
                    openSeriesDetail(seriesTopic, [item]);
                };
            }
        } else {
            if (topicBadge) topicBadge.style.display = 'none';
            if (modalSeriesBtn) modalSeriesBtn.style.display = 'none';
        }

        // Show/hide trailer button
        const trailerBtn = document.getElementById('trailerBtn');
        if (trailerBtn) {
            if (item.title && !item.isLocal) {
                trailerBtn.style.display = 'inline-flex';
            } else {
                trailerBtn.style.display = 'none';
            }
        }
        
        // Setup Subscribe button
        const subscribeBtn = document.getElementById('subscribeBtn');
        if (subscribeBtn) {
            const subTerm = (item.topic && item.topic.trim()) ? item.topic.trim() : item.title;
            const updateSubBtn = () => {
                const abos = getAbos();
                const isSubbed = abos.some(a => a.term.toLowerCase() === subTerm.toLowerCase());
                if (isSubbed) {
                    subscribeBtn.innerHTML = '<i class="fas fa-bell-slash"></i> Abonniert';
                    subscribeBtn.classList.add('btn-subscribed');
                } else {
                    subscribeBtn.innerHTML = '<i class="fas fa-bell"></i> Abonnieren';
                    subscribeBtn.classList.remove('btn-subscribed');
                }
            };
            updateSubBtn();
            subscribeBtn.onclick = () => {
                const abos = getAbos();
                const idx = abos.findIndex(a => a.term.toLowerCase() === subTerm.toLowerCase());
                if (idx >= 0) {
                    abos.splice(idx, 1);
                } else {
                    abos.push({ term: subTerm, addedAt: Date.now() });
                }
                saveAbos(abos);
                updateSubBtn();
            };
        }

        // ── Modal Merkliste / Später ansehen buttons ──────────────────────────
        const modalWLBtn = document.getElementById('modalWatchlistBtn');
        if (modalWLBtn) {
            const syncWLBtn = () => {
                const active = isInWatchlist(item);
                modalWLBtn.classList.toggle('action-btn-active', active);
                modalWLBtn.innerHTML = active
                    ? '<i class="fas fa-heart"></i> Gemerkt'
                    : '<i class="fas fa-heart"></i> Merkliste';
            };
            syncWLBtn();
            modalWLBtn.onclick = () => { toggleWatchlist(item, null); syncWLBtn(); };
        }
        const modalWLaterBtn2 = document.getElementById('modalWatchLaterBtn');
        if (modalWLaterBtn2) {
            const syncWLaterBtn = () => {
                const active = isInWatchLater(item);
                modalWLaterBtn2.classList.toggle('action-btn-active', active);
                const icon = active ? 'fas fa-clock' : 'far fa-clock';
                modalWLaterBtn2.innerHTML = `<i class="${icon}"></i> ${active ? 'Gespeichert' : 'Später'}`;
            };
            syncWLaterBtn();
            modalWLaterBtn2.onclick = () => { toggleWatchLater(item, null); syncWLaterBtn(); };
        }

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
            if (typeof syncCustomSelect === 'function') syncCustomSelect(qualitySelector);
        }
        
        // Setup speed selector
        const speedSelector = document.getElementById('speedSelector');
        if (speedSelector) {
            speedSelector.value = '1.0';
            speedSelector.onchange = (e) => {
                const rate = parseFloat(e.target.value) || 1.0;
                if (videoPlayer) videoPlayer.playbackRate = rate;
            };
            if (typeof syncCustomSelect === 'function') syncCustomSelect(speedSelector);
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
            if (typeof syncCustomSelect === 'function') syncCustomSelect(subtitleSelector);
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
        // Suppress alert on Android – the video often still loads after a recoverable error
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
        if (window._releaseWakeLock) window._releaseWakeLock();
        if (videoModal) videoModal.classList.remove('active');
        try { if (window.AndroidNativeTheme && window.AndroidNativeTheme.updatePipAutoEnter) window.AndroidNativeTheme.updatePipAutoEnter(false); } catch(e){}
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

    // Hörfassungen / AD filter
    const hideAD = document.getElementById('hideAudioDescriptionToggle')?.checked;
    if (hideAD) {
        filtered = filtered.filter(item => !isAudioDescription(item));
        console.log('After hideAD filter:', filtered.length);
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
        'watchLaterPage',
        'playlistsPage',
        'playlistDetailPage',
        'statsPage',
        'abosPage',
        'downloadsPage'
    ];

    // Hide all sections first
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Reset scroll position to top on every navigation
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector('.main-content') && (document.querySelector('.main-content').scrollTop = 0);

    // Show the requested page sections
    if (page === 'home') {
        const mainVideoSection = document.getElementById('mainVideoSection');
        const recentlyWatched = document.getElementById('recentlyWatched');
        if (mainVideoSection) mainVideoSection.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';

        // If a search is in progress, show loading state and let performSearch handle the rest.
        // This prevents the FYP flash (old results / FYP title appearing while search loads).
        if (_searchInProgress) {
            if (recentlyWatched) recentlyWatched.style.display = 'none';
            showLoading(true);
            // Title will be set by performSearch
        } else if (searchInput && searchInput.value.trim() && currentQuery && currentResults && currentResults.length > 0) {
            if (recentlyWatched) recentlyWatched.style.display = 'block';
            displayResults();
            loadRecentlyWatched();
        } else {
            if (recentlyWatched) recentlyWatched.style.display = 'block';
            loadDefaultContent();
            loadRecentlyWatched();
        }
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
    } else if (page === 'watchlater') {
        const watchLaterPage = document.getElementById('watchLaterPage');
        if (watchLaterPage) watchLaterPage.style.display = 'block';
        loadWatchLaterPage();
    } else if (page === 'playlists') {
        const playlistsPage = document.getElementById('playlistsPage');
        if (playlistsPage) playlistsPage.style.display = 'block';
        loadPlaylistsPage();
    } else if (page === 'playlistDetail') {
        const playlistDetailPage = document.getElementById('playlistDetailPage');
        if (playlistDetailPage) playlistDetailPage.style.display = 'block';
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

    // Re-run custom select sync so settings/modal dropdowns render correctly
    if (typeof syncAllSelects === 'function') setTimeout(syncAllSelects, 80);
}

window.navigateToPage = navigateToPage;

// Load Full History Page
function loadFullHistoryPage() {
    const recent = getRecentlyWatched();
    const historyGrid = document.getElementById('historyGrid');
    
    if (!historyGrid) return;
    
    if (recent.length === 0) {
        historyGrid.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><h3>Kein Verlauf</h3><p>Du hast noch keine Videos angesehen</p></div>';
        return;
    }
    
    historyGrid.innerHTML = '';
    recent.forEach((item, index) => {
        const card = createVideoCard(item, index);

        // Add per-item delete button overlay
        const delBtn = document.createElement('button');
        delBtn.className = 'history-del-btn';
        delBtn.innerHTML = '<i class="fas fa-times"></i>';
        delBtn.title = 'Aus Verlauf entfernen';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            let hist = getRecentlyWatched();
            // Match by url or title
            hist = hist.filter(h => !(h.title === item.title && (h.url_video || '') === (item.url_video || '')));
            saveRecentlyWatched(hist);
            card.style.transition = 'opacity 0.25s, transform 0.25s';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => {
                card.remove();
                if (historyGrid.children.length === 0) loadFullHistoryPage();
            }, 250);
        });
        card.style.position = 'relative';
        card.appendChild(delBtn);

        historyGrid.appendChild(card);
    });
}

// Filter History Page
function filterHistoryPage(query) {
    const recent = getRecentlyWatched();
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
    const recent = getRecentlyWatched();
    
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
    try {
        let recent = getRecentlyWatched();
        
        // Better duplicate detection: title + channel + timestamp
        const key = `${item.title}_${item.channel}_${item.timestamp}`;
        recent = recent.filter(r => {
            const rKey = `${r.title}_${r.channel}_${r.timestamp}`;
            return rKey !== key;
        });
        
        // Trim description to save localStorage space
        const desc = item.description || item.topic || '';
        const shortDesc = desc.length > 150 ? desc.substring(0, 150) + '...' : desc;

        recent.unshift({
            id: item.id,
            title: item.title,
            channel: item.channel,
            duration: item.duration,
            timestamp: item.timestamp,
            topic: item.topic,
            description: shortDesc,
            url_video: item.url_video,
            url_video_hd: item.url_video_hd,
            url_video_low: item.url_video_low,
            watchedAt: Date.now()
        });
        
        recent = recent.slice(0, 30); // Keep max 30 items
        saveRecentlyWatched(recent);
        loadRecentlyWatched();
    } catch (err) {
        console.warn('saveToRecentlyWatched non-fatal error:', err);
    }
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
    { name: 'Das Erste HD',   channel: 'ARD', url: 'https://daserste-live.ard-mcdn.de/daserste/live/hls/de/master.m3u8' },
    { name: 'tagesschau24',   channel: 'ARD', url: 'https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8' },
    { name: 'ONE HD',         channel: 'ARD', url: 'https://one-live.ard-mcdn.de/one/live/hls/de/master.m3u8' },
    { name: 'Phoenix HD',     channel: 'ARD', url: 'https://zdf-hls-19.akamaized.net/hls/live/2016502/de/veryhigh/master.m3u8' },
    { name: 'ARD alpha',      channel: 'ARD', url: 'https://mcdn.br.de/br/fs/ard_alpha/hls/de/master.m3u8' },
    { name: 'KiKA HD',        channel: 'KiKA', url: 'https://kika-lh.akamaihd.net/i/kika_de@449767/master.m3u8' },
    // ── ZDF-Familie ──────────────────────────────────────────────────────────
    { name: 'ZDF HD',         channel: 'ZDF', url: 'https://zdf-hls-15.akamaized.net/hls/live/2016498/de/veryhigh/master.m3u8' },
    { name: 'ZDFneo',         channel: 'ZDF', url: 'https://zdf-hls-16.akamaized.net/hls/live/2016499/de/veryhigh/master.m3u8' },
    { name: 'ZDFinfo',        channel: 'ZDF', url: 'https://zdf-hls-17.akamaized.net/hls/live/2016500/de/veryhigh/master.m3u8' },
    { name: '3sat HD',        channel: '3sat', url: 'https://zdf-hls-18.akamaized.net/hls/live/2016501/dach/veryhigh/master.m3u8' },
    // ── Internationale & Auslandssender ──────────────────────────────────────
    { name: 'ARTE Deutsch',   channel: 'ARTE', url: 'https://artesimulcast.akamaized.net/hls/live/2030993/artelive_de/master.m3u8' },
    { name: 'ARTE Français',  channel: 'ARTE', url: 'https://artesimulcast.akamaized.net/hls/live/2030994/artelive_fr/master.m3u8' },
    { name: 'DW Deutsch',     channel: 'DW',  url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8' },
    { name: 'DW English',     channel: 'DW',  url: 'https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8' },
    // ── Dritte Programme ─────────────────────────────────────────────────────
    { name: 'BR Fernsehen',   channel: 'BR',  url: 'https://mcdn.br.de/br/fs/bfs_sued/hls/de/master.m3u8' },
    { name: 'hr-fernsehen',   channel: 'HR',  url: 'https://hrhls.akamaized.net/hls/live/2024525/hrhls/master.m3u8' },
    { name: 'MDR Sachsen',    channel: 'MDR', url: 'https://mdrtvsnhls.akamaized.net/hls/live/2016928/mdrtvsn/master.m3u8' },
    { name: 'NDR Fernsehen',  channel: 'NDR', url: 'https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_nds/master.m3u8' },
    { name: 'Radio Bremen TV',channel: 'RB',  url: 'https://rbhls.akamaized.net/hls/live/2022791/rbhls/master.m3u8' },
    { name: 'rbb Fernsehen',  channel: 'RBB', url: 'https://rbb-hls-berlin.akamaized.net/hls/live/2017824/rbb_berlin/master.m3u8' },
    { name: 'SR Fernsehen',   channel: 'SR',  url: 'https://srfs.akamaized.net/hls/live/689649/srfsgeo/index.m3u8' },
    { name: 'SWR BW HD',      channel: 'SWR', url: 'https://swrbwd-hls.akamaized.net/hls/live/2018672/swrbwd/master.m3u8' },
    { name: 'WDR HD',         channel: 'WDR', url: 'https://wdrfs247.akamaized.net/hls/live/681509/wdr_msl4_fs247/master.m3u8' },
];

function loadLiveChannels() {
    console.log('Loading live channels...');
    const grid = document.getElementById('liveChannelsGrid');
    if (!grid) {
        console.error('liveChannelsGrid not found!');
        return;
    }
    
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

let webLocalVideos = [];

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
                const title = file.name.replace(/\.[^/.]+$/, "");
                const videoItem = {
                    id: 'web_local_' + Date.now() + '_' + idx,
                    title: title,
                    channel: 'Lokale Datei',
                    timestamp: Math.floor(file.lastModified / 1000) || Math.floor(Date.now() / 1000),
                    duration: 0,
                    url_video: objectUrl,
                    url_video_hd: objectUrl,
                    isLocal: true,
                    size: file.size,
                    fileName: file.name
                };
                webLocalVideos.push(videoItem);
            });
            
            loadLocalVideosPage();
        });
    }
    input.click();
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
        selectLocalVideosWeb();
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
    
    // Show folders/files as cards
    if (localFolders.length === 0 && webLocalVideos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>Keine lokalen Videos oder Ordner</h3>
                <p>Füge Videos oder Ordner hinzu, um lokale Inhalte abzuspielen</p>
                <button class="btn-primary" style="margin-top: 1rem; width: auto; padding: 0.75rem 2rem;" onclick="addLocalFolderDialog()">
                    <i class="fas fa-plus"></i> Videos / Ordner auswählen
                </button>
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

    if (webLocalVideos.length > 0) {
        webLocalVideos.forEach((video, index) => {
            const card = createVideoCard(video, index);
            grid.appendChild(card);
        });
    }
    
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
    // Re-sync static cust-select wrappers (already in HTML) to reflect current values
    if (typeof initCustSelects === 'function') setTimeout(initCustSelects, 0);
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
const DEFAULT_TMDB_KEY = '849d718b54e75466aeecb0c1b3d05123';
let TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || DEFAULT_TMDB_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Cache for TMDB series data
const tmdbSeriesCache = new Map();

// Helper to find expanded series name from episode metadata
function findBestSeriesSearchQuery(seriesName, episodes = []) {
    if (!seriesName) return '';
    if (!episodes || episodes.length === 0) return seriesName;
    
    for (const ep of episodes.slice(0, 15)) {
        const t = (ep.title || '').trim();
        const d = (ep.description || '').trim();
        const combo = `${t} ${d}`;
        
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
        if (/musketiere/i.test(seriesName)) {
            if (/drei musketiere/i.test(combo)) return 'Die drei Musketiere';
        }
    }
    return seriesName;
}

// Search for a series on TMDB with intelligent matching
async function searchTMDBSeries(seriesName, sampleItem = null) {
    TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || DEFAULT_TMDB_KEY;
    if (!TMDB_API_KEY || !seriesName) return null;

    const channel = sampleItem ? (sampleItem.channel || '') : '';
    const isKidsContext = (typeof getActiveProfile === 'function' && getActiveProfile().isKids) || 
                          (channel === 'KiKA' || (sampleItem && sampleItem.duration && sampleItem.duration <= 1200));
    const cacheKey = `search_${seriesName.toLowerCase()}_${isKidsContext ? 'kids' : 'all'}`;
    if (tmdbSeriesCache.has(cacheKey)) {
        return tmdbSeriesCache.get(cacheKey);
    }

    const cleanSpace = seriesName.replace(/[\-–—:_]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanNoBrackets = cleanSpace.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    const firstWord = cleanNoBrackets.split(' ')[0] || '';
    const queries = [
        cleanSpace,
        cleanNoBrackets,
        seriesName.trim()
    ];
    if (firstWord.length >= 3 && firstWord !== cleanNoBrackets) {
        queries.push(firstWord);
    }

    const uniqueQueries = queries.filter((q, idx, arr) => q && q.length >= 2 && arr.indexOf(q) === idx);

    const candidatesMap = new Map();

    for (const q of uniqueQueries) {
        try {
            const url = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&language=de-DE&query=${encodeURIComponent(q)}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    data.results.forEach(r => {
                        if (r && r.id && !candidatesMap.has(r.id)) {
                            candidatesMap.set(r.id, r);
                        }
                    });
                }
            }
        } catch(e) {}
    }

    const candidates = Array.from(candidatesMap.values());
    if (candidates.length === 0) return null;

    function scoreCandidate(candidate) {
        const clean = s => (s || '').toLowerCase()
            .replace(/[–—:\-_,!?.\'\"\(\)\[\]\/]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        const qClean = clean(seriesName);
        const nameClean = clean(candidate.name);
        const origClean = clean(candidate.original_name);
        
        // Exact match (100%)
        if (nameClean === qClean || origClean === qClean) return 1.0;
        
        // Prefix match (e.g. "Mako" matches "Mako – Einfach Meerjungfrau")
        if (nameClean.startsWith(qClean) || origClean.startsWith(qClean) || qClean.startsWith(nameClean)) {
            let s = 0.85;
            if (isKidsContext) {
                const hasKidsGenre = candidate.genre_ids && (
                    candidate.genre_ids.includes(16) || 
                    candidate.genre_ids.includes(10762) || 
                    candidate.genre_ids.includes(10751) || 
                    candidate.genre_ids.includes(10765)
                );
                if (hasKidsGenre) s += 0.15;
            }
            return Math.min(1.0, s);
        }
        
        // Word overlap match
        const stopWords = new Set(['die','der','das','und','von','mit','im','in','aus','auf','zu','ein','eine','einer','eines']);
        const qWords = qClean.split(' ').filter(w => w.length > 1 && !stopWords.has(w));
        const cWords = (nameClean + ' ' + origClean).split(' ').filter(w => w.length > 1);
        
        if (qWords.length === 0 || cWords.length === 0) return 0;
        
        let matchedWords = 0;
        qWords.forEach(qw => {
            if (cWords.some(cw => cw === qw || (qw.length >= 4 && cw.includes(qw)))) {
                matchedWords++;
            }
        });
        
        const overlap = matchedWords / qWords.length;
        if (overlap < 0.5) return 0;
        
        let score = overlap * 0.8;

        if (isKidsContext) {
            const hasKidsGenre = candidate.genre_ids && (
                candidate.genre_ids.includes(16) || 
                candidate.genre_ids.includes(10762) || 
                candidate.genre_ids.includes(10751) ||
                candidate.genre_ids.includes(10765)
            );
            if (hasKidsGenre) score += 0.15;

            // Reject ancient 1970 anime false positives when original isn't 1970
            if (candidate.first_air_date) {
                const year = parseInt(candidate.first_air_date.split('-')[0], 10);
                if (year < 1980 && !qClean.includes('1970')) {
                    score -= 0.4;
                }
            }
        }

        return Math.min(1.0, score);
    }

    let bestMatch = null;
    let highestScore = 0;

    candidates.forEach(cand => {
        const s = scoreCandidate(cand);
        if (s > highestScore) {
            highestScore = s;
            bestMatch = cand;
        }
    });

    if (bestMatch && highestScore >= 0.6) {
        tmdbSeriesCache.set(cacheKey, bestMatch);
        return bestMatch;
    }

    return null;
}

// Get detailed series information from TMDB
async function getTMDBSeriesDetails(seriesId) {
    TMDB_API_KEY = localStorage.getItem('tmdbApiKey') || DEFAULT_TMDB_KEY;
    if (!TMDB_API_KEY) return null;
    
    // Check cache
    const cacheKey = `details_${seriesId}`;
    if (tmdbSeriesCache.has(cacheKey)) {
        return tmdbSeriesCache.get(cacheKey);
    }
    
    try {
        const url = `${TMDB_BASE_URL}/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=de-DE`;
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        tmdbSeriesCache.set(cacheKey, data);
        return data;
    } catch (error) {
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
    const recent = getRecentlyWatched();
    const progressMap = JSON.parse(localStorage.getItem(getProfileKey('videoProgressMap')) || '{}');
    
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
    if (!raw) return '';
    return raw
        // Remove bracketed episode numbers like (S01/E02), (1/2), (4), (S2/E5)
        .replace(/\(\s*S?\d+[\s\/E]*\d*\s*\)/gi, '')
        // Remove quality/format tags
        .replace(/\b(HD|SD|4K|MPEG4?|UHD|HFR|UT|AD)\b/gi, '')
        // Remove accessibility variants
        .replace(/\b(Hörfassung|Audiodeskription|Gebärdensprache|Untertitel|Subtitles|Originalton|Re-Upload)\b/gi, '')
        // Remove episode info like " – Folge 12", " (Teil 2)", " - Episode 3", "Staffel 1", "S01E02", "E05"
        .replace(/[-–:]?\s*(Folge|Episode|Teil|Part|Staffel|Season|Series)\s*\d+[^,)]*/gi, '')
        .replace(/\bS\d{1,2}E\d{1,2}\b/gi, '')
        // Remove dates like "(01.05.2024)" or "(2024)" or "vom 12.03.2023"
        .replace(/\b(vom|am)?\s*\d{1,2}\.\d{1,2}\.\d{2,4}\b/gi, '')
        .replace(/\(\d{4}\)/g, '')
        // Remove trailing/leading punctuation
        .replace(/^[-–:]+\s*/g, '')
        .replace(/[-–:]+\s*$/g, '')
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
    try { return JSON.parse(localStorage.getItem(getProfileKey('streamhub_abos')) || '[]'); }
    catch { return []; }
}

function saveAbos(abos) {
    _safeSetItem(getProfileKey('streamhub_abos'), JSON.stringify(abos));
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

// ── Custom dropdown select init ────────────────────────────────────────────────
function initCustSelects() {
    document.querySelectorAll('.cust-select').forEach(cs => {
        const targetId = cs.dataset.target;
        const realSelect = document.getElementById(targetId);
        if (!realSelect) return;

        // Sync display label to current select value
        const syncSelected = () => {
            const opts = cs.querySelectorAll('.cust-opt');
            const trigger = cs.querySelector('.cust-select-trigger span');
            opts.forEach(o => {
                const active = o.dataset.value === realSelect.value;
                o.classList.toggle('selected', active);
                if (active && trigger) trigger.textContent = o.textContent;
            });
        };
        syncSelected();

        // Only bind event listeners once
        const trigger = cs.querySelector('.cust-select-trigger');
        if (!trigger || trigger._cssBound) return;
        trigger._cssBound = true;

        const openClose = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.cust-select.open').forEach(other => {
                if (other !== cs) other.classList.remove('open');
            });
            cs.classList.toggle('open');
        };
        trigger.addEventListener('click', openClose);
        // Android: also handle touchend so divs respond reliably
        trigger.addEventListener('touchend', (e) => { e.preventDefault(); openClose(e); }, { passive: false });

        cs.querySelectorAll('.cust-opt').forEach(opt => {
            if (opt._cssBound) return;
            opt._cssBound = true;
            const choose = (e) => {
                e.stopPropagation();
                realSelect.value = opt.dataset.value;
                realSelect.dispatchEvent(new Event('change', { bubbles: true }));
                syncSelected();
                cs.classList.remove('open');
            };
            opt.addEventListener('click', choose);
            opt.addEventListener('touchend', (e) => { e.preventDefault(); choose(e); }, { passive: false });
        });
    });

    // Global close-on-outside-tap (once)
    if (!document._custSelectOutsideBound) {
        document._custSelectOutsideBound = true;
        document.addEventListener('click', () => {
            document.querySelectorAll('.cust-select.open').forEach(cs => cs.classList.remove('open'));
        });
        document.addEventListener('touchend', () => {
            // Small delay so the option touchend fires first
            setTimeout(() => {
                document.querySelectorAll('.cust-select.open').forEach(cs => cs.classList.remove('open'));
            }, 50);
        }, { passive: true });
    }
}

// ── Grid Zoom (Pinch on mobile, Ctrl+Scroll on desktop) ───────────────────────
const GRID_SIZES = [100, 130, 160, 200, 240, 300];
let _gridSizeIdx = parseInt(localStorage.getItem('streamhubGridSize') || '3', 10);
if (_gridSizeIdx < 0 || _gridSizeIdx >= GRID_SIZES.length) _gridSizeIdx = 3;

function _showGridPill(idx) {
    const labels = ['XS','S','M','L','XL','XXL'];
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
    const px = GRID_SIZES[_gridSizeIdx];
    const grid = document.getElementById('videoGrid');
    if (grid) grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${px}px, 1fr))`;

    // Desktop: Ctrl + scroll
    document.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        applyGridSize(e.deltaY < 0 ? _gridSizeIdx + 1 : _gridSizeIdx - 1);
    }, { passive: false });

    // Mobile: Pinch-to-zoom
    let _pDist = null, _pIdx = _gridSizeIdx;
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            _pDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            _pIdx = _gridSizeIdx;
        }
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 2 || _pDist === null) return;
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const steps = Math.round((d / _pDist - 1) / 0.2);
        const ni = _pIdx + steps; // pinch out = bigger = higher idx
        if (ni !== _gridSizeIdx) applyGridSize(ni);
    }, { passive: true });
    document.addEventListener('touchend', (e) => { if (e.touches.length < 2) _pDist = null; }, { passive: true });
}

// ── Pull-to-refresh for FYP ───────────────────────────────────────────────────
function initPullToRefresh() {
    let startY = 0, pulling = false;
    let indicator = null;

    function getIndicator() {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = '_ptr';
            indicator.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%) translateY(-60px);background:var(--primary-color,#6366f1);color:#fff;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;z-index:99999;transition:transform 0.2s,opacity 0.2s;opacity:0;pointer-events:none;';
            indicator.innerHTML = '<i class="fas fa-sync-alt"></i>';
            document.body.appendChild(indicator);
        }
        return indicator;
    }

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
            const ind = getIndicator();
            ind.style.opacity = prog.toFixed(2);
            ind.style.transform = `translateX(-50%) translateY(${-60 + prog * 70}px) rotate(${prog * 360}deg)`;
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!pulling) return;
        pulling = false;
        const dy = (e.changedTouches[0]?.clientY || startY) - startY;
        const ind = getIndicator();
        if (dy > 70 && currentPage === 'home' && !_searchInProgress) {
            // Trigger refresh
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

// Add spin animation if not already present
if (!document.getElementById('_spinStyle')) {
    const s = document.createElement('style');
    s.id = '_spinStyle';
    s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initGridZoom(); initPullToRefresh(); });
} else {
    initGridZoom();
    initPullToRefresh();
}

// ── Predictive Back Swipe (Android 16-style preview) ─────────────────────────
// Detects a swipe from the left edge (<30px), scales down current page and
// peeks the "previous page" label behind it. On release > 35% width → navigate back.
function initPredictiveBackSwipe() {
    const EDGE_ZONE = 30;    // px from left edge to start gesture
    const COMMIT_THRESHOLD = 0.35; // fraction of screen width to commit

    let active = false;
    let startX = 0;
    let startY = 0;
    let axisLocked = false; // once locked on horizontal, ignore vertical

    // Overlay behind content showing where we'd go
    const backDrop = document.createElement('div');
    backDrop.id = '_backDrop';
    backDrop.style.cssText = `
        position: fixed; inset: 0; z-index: 8888;
        background: var(--background, #09090b);
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; gap: 1rem;
        opacity: 0; pointer-events: none; transition: none;
    `;
    backDrop.innerHTML = `
        <i class="fas fa-arrow-left" style="font-size:2.5rem;color:var(--primary-color,#6366f1);opacity:0.8;"></i>
        <span id="_backDropLabel" style="font-size:1rem;color:var(--text-secondary,#94a3b8);font-weight:500;">Zurück</span>
    `;
    document.body.appendChild(backDrop);

    // Main content wrapper (the page itself) – we'll scale/translate this
    function getMainEl() {
        return document.querySelector('.app-container') || document.querySelector('.main-content') || document.body;
    }

    function getBackLabel() {
        // Describe where "back" leads
        if (previousPage === 'home') return 'Startseite';
        if (previousPage === 'history') return 'Verlauf';
        if (previousPage === 'watchlist') return 'Merkliste';
        if (previousPage === 'live') return 'Live TV';
        if (previousPage === 'local') return 'Lokale Videos';
        return 'Zurück';
    }

    function startGesture(x, y) {
        active = true;
        startX = x;
        startY = y;
        axisLocked = false;
        const lbl = document.getElementById('_backDropLabel');
        if (lbl) lbl.textContent = getBackLabel();
    }

    function updateGesture(x, y) {
        if (!active) return;
        const dx = x - startX;
        const dy = y - startY;

        if (!axisLocked) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                if (Math.abs(dy) > Math.abs(dx)) { active = false; return; } // vertical scroll, cancel
                axisLocked = true;
            } else return;
        }

        if (dx <= 0) { resetGesture(); return; }

        const prog = Math.min(dx / (window.innerWidth * 0.6), 1);
        const scale = 1 - prog * 0.08;
        const tx = dx * 0.5;
        const borderR = prog * 20;

        const main = getMainEl();
        main.style.transition = 'none';
        main.style.transform = `translateX(${tx}px) scale(${scale})`;
        main.style.borderRadius = `${borderR}px`;
        main.style.boxShadow = `${-20 * prog}px 0 60px rgba(0,0,0,0.4)`;

        backDrop.style.opacity = (prog * 0.85).toFixed(2);
    }

    function commitGesture(x) {
        if (!active) return;
        const dx = x - startX;
        const prog = dx / window.innerWidth;
        active = false;

        const main = getMainEl();
        if (prog > COMMIT_THRESHOLD && previousPage && previousPage !== currentPage) {
            // Animate out fully then navigate
            main.style.transition = 'transform 0.22s cubic-bezier(0.4,0,0.2,1), border-radius 0.22s, box-shadow 0.22s';
            main.style.transform = `translateX(${window.innerWidth * 0.7}px) scale(0.95)`;
            backDrop.style.opacity = '1';
            setTimeout(() => {
                navigateToPage(previousPage);
                resetGesture();
            }, 220);
        } else {
            resetGesture();
        }
    }

    function resetGesture() {
        active = false;
        axisLocked = false;
        const main = getMainEl();
        main.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), border-radius 0.28s, box-shadow 0.28s';
        main.style.transform = '';
        main.style.borderRadius = '';
        main.style.boxShadow = '';
        setTimeout(() => {
            main.style.transition = '';
        }, 300);
        backDrop.style.opacity = '0';
    }

    // Touch events
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1 && e.touches[0].clientX < EDGE_ZONE) {
            startGesture(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!active) return;
        updateGesture(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!active) return;
        commitGesture(e.changedTouches[0].clientX);
    }, { passive: true });

    document.addEventListener('touchcancel', () => { if (active) resetGesture(); }, { passive: true });
}

// Init back swipe after DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPredictiveBackSwipe);
} else {
    initPredictiveBackSwipe();
}

// ── Universal Custom Select Helper ───────────────────────────────────────────
// Converts any native <select> element into a custom styled .cust-select dropdown
function syncCustomSelect(selectEl) {
    if (!selectEl) return;
    selectEl.classList.add('has-cust-select');
    selectEl.setAttribute('style', 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; position: absolute !important; width: 0 !important; height: 0 !important;');

    let wrapper = selectEl.nextElementSibling;
    // If next sibling is already a cust-select, reuse it (don't duplicate)
    if (!wrapper || !wrapper.classList.contains('cust-select')) {
        // Check if a cust-select with data-target already exists anywhere
        const existingWrapper = selectEl.id ? selectEl.parentNode.querySelector(`.cust-select[data-target="${selectEl.id}"]`) : null;
        if (existingWrapper) {
            wrapper = existingWrapper;
        } else {
            wrapper = document.createElement('div');
            wrapper.className = 'cust-select';
            if (selectEl.id) wrapper.dataset.target = selectEl.id;
            selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
        }
    }

    const options = Array.from(selectEl.options || []);
    if (options.length === 0) {
        wrapper.style.display = 'none';
        return;
    }
    wrapper.style.display = 'block';

    const selectedOpt = options.find(o => o.selected) || options[0];
    const selectedText = selectedOpt ? selectedOpt.textContent : '';

    wrapper.innerHTML = `
        <div class="cust-select-trigger"><span>${selectedText}</span><i class="fas fa-chevron-down"></i></div>
        <div class="cust-select-options">
            ${options.map(o => `<div class="cust-opt${o.value === selectEl.value ? ' selected' : ''}" data-value="${o.value}">${o.textContent}</div>`).join('')}
        </div>
    `;

    const trigger = wrapper.querySelector('.cust-select-trigger');
    trigger.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.cust-select.open').forEach(other => {
            if (other !== wrapper) other.classList.remove('open');
        });
        wrapper.classList.toggle('open');
    };

    wrapper.querySelectorAll('.cust-opt').forEach(opt => {
        opt.onclick = (e) => {
            e.stopPropagation();
            selectEl.value = opt.dataset.value;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            wrapper.classList.remove('open');
            syncCustomSelect(selectEl);
        };
    });
}
window.syncCustomSelect = syncCustomSelect;

// ── Auto-init all static cust-select elements on load ──────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initCustSelects, 200));
} else {
    setTimeout(initCustSelects, 200);
}


// ── Hold-for-2x Playback Speed ───────────────────────────────────────────────
// Uses document-level events instead of an overlay div because Android WebView
// renders native <video controls> in a separate system compositor layer that
// sits ABOVE any CSS z-index overlay and eats all touch events.
(function setupHoldFor2x() {
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

    let holdTimer = null;
    let wasHolding = false;
    let previousRate = 1.0;
    let startX = 0, startY = 0;

    const showPill = () => {
        pill.style.opacity = '1';
        pill.style.transform = 'translate(-50%,-50%) scale(1)';
    };
    const hidePill = () => {
        pill.style.opacity = '0';
        pill.style.transform = 'translate(-50%,-50%) scale(0.7)';
    };

    function isOnVideoPlayer(target) {
        // True if the touch/click is inside the video modal's player area
        const modal = document.getElementById('videoModal');
        const trailer = document.getElementById('trailerPlayerContainer');
        if (!modal || !modal.classList.contains('active')) return false;
        if (trailer && trailer.style.display !== 'none' && trailer.contains(target)) return false;
        // Accept touches on the video itself or its container (but NOT on control buttons)
        const container = document.querySelector('.video-player-container');
        if (!container) return false;
        if (!container.contains(target) && target !== container) return false;
        // Exclude modal control buttons (close, pip, etc.)
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

    // ── Touch (Android / mobile) ──────────────────────────────────────────────
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        if (!isOnVideoPlayer(e.target)) return;
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

    document.addEventListener('touchend', (e) => {
        if (holdTimer || wasHolding) endHold();
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        if (holdTimer || wasHolding) endHold();
    }, { passive: true });

    // ── Mouse (Desktop) ───────────────────────────────────────────────────────
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (!isOnVideoPlayer(e.target)) return;
        startHold();
    });
    document.addEventListener('mouseup', () => { if (holdTimer || wasHolding) endHold(); });

    // expose for legacy callers
    window._reinitHoldZone2x = () => {}; // no-op now; kept for compat
})();

// ── Long-Press on Video Cards → Watch Later context menu ─────────────────────
(function setupCardLongPress() {
    let pressTimer = null;
    let didLongPress = false;

    function showCardMenu(item, cardEl) {
        // Remove any existing menu
        document.querySelectorAll('.card-context-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'card-context-menu';
        const inWL = isInWatchlist(item);
        const inWLater = isInWatchLater(item);
        menu.innerHTML = `
            <button class="ctx-item ctx-watchlater">
                <i class="${inWLater ? 'fas' : 'far'} fa-clock"></i>
                ${inWLater ? 'Aus „Später ansehen" entfernen' : 'Später ansehen'}
            </button>
            <button class="ctx-item ctx-watchlist">
                <i class="fas fa-heart"></i>
                ${inWL ? 'Von Merkliste entfernen' : 'Zur Merkliste hinzufügen'}
            </button>
            <button class="ctx-item ctx-cancel">
                <i class="fas fa-times"></i> Abbrechen
            </button>
        `;

        // Position near card
        const rect = cardEl.getBoundingClientRect();
        menu.style.cssText = `
            position: fixed;
            top: ${Math.min(rect.bottom, window.innerHeight - 180)}px;
            left: ${Math.max(8, Math.min(rect.left, window.innerWidth - 260))}px;
            z-index: 9999;
        `;

        menu.querySelector('.ctx-watchlater').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleWatchLater(item, null);
            menu.remove();
        });
        menu.querySelector('.ctx-watchlist').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleWatchlist(item, null);
            menu.remove();
        });
        menu.querySelector('.ctx-cancel').addEventListener('click', () => menu.remove());

        document.body.appendChild(menu);
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 10);
        if (window._haptic) window._haptic.heavy();
    }

    // Delegate to all current and future video-card elements
    document.addEventListener('touchstart', (e) => {
        const card = e.target.closest('.video-card');
        if (!card || e.target.closest('.watchlist-btn, .watchlater-btn')) return;
        const item = card._videoItem;
        if (!item) return;
        pressTimer = setTimeout(() => {
            didLongPress = true;
            showCardMenu(item, card);
        }, 600);
    }, { passive: true });

    document.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        pressTimer = null;
    });
    document.addEventListener('touchmove', () => {
        clearTimeout(pressTimer);
        pressTimer = null;
    }, { passive: true });

    // Store item ref on card when created
    const origCreate = window.createVideoCard;
    if (origCreate) {
        window.createVideoCard = function(item, index) {
            const card = origCreate(item, index);
            card._videoItem = item;
            return card;
        };
    }
})();

// Sync all selects after DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(syncAllSelects, 400);
    // Also sync when settings button clicked
    document.querySelectorAll('[data-page="settings"]').forEach(el => {
        el.addEventListener('click', () => setTimeout(syncAllSelects, 120));
    });
    // Sync quality/speed selects when video modal opens
    const videoModal = document.getElementById('videoModal');
    if (videoModal) {
        const obs = new MutationObserver(() => {
            if (videoModal.classList.contains('active')) setTimeout(syncAllSelects, 80);
        });
        obs.observe(videoModal, { attributes: true, attributeFilter: ['class'] });
    }
});

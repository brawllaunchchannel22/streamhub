const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

// ─── Thumbnail disk-cache directory ──────────────────────────────────────────
const CACHE_DIR = path.join(app.getPath('userData'), 'thumb-cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ─── Custom protocol: streamhub-file://  ────────────────────────────────────
// Electron blocks renderer-side access to file:// in secure context.
// We register our own scheme so the renderer can load local videos/images.
app.whenReady().then(() => {
    protocol.handle('streamhub-file', (request) => {
        // URL looks like: streamhub-file:///home/user/video.mp4
        const filePath = decodeURIComponent(request.url.slice('streamhub-file://'.length));
        return net.fetch(`file://${filePath}`);
    });

    createWindow();
});

// ─── Main Window ─────────────────────────────────────────────────────────────
function createWindow() {
    const isDev = process.argv.includes('--dev');

    const win = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1200,
        minHeight: 800,
        backgroundColor: '#0f0f0f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
            // Allow the custom protocol in the renderer
            additionalArguments: []
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    win.loadFile('index.html');

    // Only open DevTools in dev mode
    if (isDev) {
        win.webContents.openDevTools();
    }

    return win;
}

// ─── Download video ───────────────────────────────────────────────────────────
ipcMain.handle('download-video', async (event, videoUrl, videoTitle) => {
    // Guard: HLS manifests cannot be saved as a single file
    if (videoUrl.includes('.m3u8')) {
        return {
            success: false,
            message: 'Live-Streams (HLS) können nicht direkt heruntergeladen werden. Verwende ein externes Tool wie ffmpeg.'
        };
    }

    const win = BrowserWindow.getFocusedWindow();

    const result = await dialog.showSaveDialog(win, {
        title: 'Video speichern',
        defaultPath: `${videoTitle}.mp4`,
        filters: [
            { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'avi'] },
            { name: 'Alle Dateien', extensions: ['*'] }
        ]
    });

    if (result.canceled || !result.filePath) {
        return { success: false, message: 'Abgebrochen' };
    }

    const savePath = result.filePath;

    return downloadWithRedirects(videoUrl, savePath, 0);
});

// Recursive download helper that follows redirects up to 10 hops
function downloadWithRedirects(url, savePath, hops) {
    return new Promise((resolve) => {
        if (hops > 10) {
            return resolve({ success: false, message: 'Zu viele Weiterleitungen' });
        }

        const proto = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(savePath);

        const req = proto.get(url, (response) => {
            const code = response.statusCode;

            if (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) {
                file.close();
                try { fs.unlinkSync(savePath); } catch (_) {}
                const location = response.headers.location;
                if (!location) {
                    return resolve({ success: false, message: 'Weiterleitung ohne Ziel' });
                }
                // Resolve relative redirects
                const nextUrl = location.startsWith('http') ? location : new URL(location, url).href;
                downloadWithRedirects(nextUrl, savePath, hops + 1).then(resolve);
                return;
            }

            if (code !== 200) {
                file.close();
                try { fs.unlinkSync(savePath); } catch (_) {}
                return resolve({ success: false, message: `HTTP ${code}` });
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve({ success: true, path: savePath });
            });
        });

        req.on('error', (err) => {
            file.close();
            try { fs.unlinkSync(savePath); } catch (_) {}
            resolve({ success: false, message: err.message });
        });
    });
}

// ─── Folder selection ─────────────────────────────────────────────────────────
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

// ─── Video scanning ───────────────────────────────────────────────────────────
ipcMain.handle('scan-videos', async (event, folderPath) => {
    const videoExts = new Set([
        '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v',
        '.mpg', '.mpeg', '.m2v', '.3gp', '.3g2', '.mxf', '.nsv',
        '.f4v', '.ogv', '.ogg', '.drc', '.mng', '.qt', '.yuv',
        '.rm', '.rmvb', '.asf', '.amv', '.mp2', '.mpe', '.mpv',
        '.m2ts', '.mts', '.ts', '.vob', '.divx'
    ]);

    const videos = [];
    let scannedDirs = 0;
    let errorDirs = 0;

    function scanDirectory(dirPath, depth = 0) {
        if (depth > 8) return; // safety limit

        try {
            scannedDirs++;
            const items = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const item of items) {
                if (item.name.startsWith('.')) continue;
                const fullPath = path.join(dirPath, item.name);

                if (item.isDirectory()) {
                    scanDirectory(fullPath, depth + 1);
                } else if (item.isFile()) {
                    const ext = path.extname(item.name).toLowerCase();
                    if (videoExts.has(ext)) {
                        try {
                            const stats = fs.statSync(fullPath);
                            videos.push({
                                name: path.basename(item.name, ext),
                                path: fullPath,
                                // Use the custom protocol so renderer can load it
                                streamUrl: `streamhub-file://${fullPath}`,
                                size: stats.size,
                                ext: ext,
                                modified: stats.mtime,
                                folder: dirPath
                            });
                        } catch (e) {
                            // stat failed, skip
                        }
                    }
                }
            }
        } catch (e) {
            errorDirs++;
        }
    }

    scanDirectory(folderPath, 0);
    console.log(`Scan complete: ${videos.length} videos in ${scannedDirs} dirs (${errorDirs} errors)`);
    return videos;
});

// ─── Disk thumbnail cache ─────────────────────────────────────────────────────
ipcMain.handle('get-cached-thumbnail', async (event, key) => {
    const file = path.join(CACHE_DIR, crypto.createHash('md5').update(key).digest('hex') + '.jpg');
    if (fs.existsSync(file)) {
        return 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64');
    }
    return null;
});

ipcMain.handle('set-cached-thumbnail', async (event, key, dataUrl) => {
    try {
        const base64 = dataUrl.split(',')[1];
        if (!base64) return false;
        const file = path.join(CACHE_DIR, crypto.createHash('md5').update(key).digest('hex') + '.jpg');
        fs.writeFileSync(file, Buffer.from(base64, 'base64'));
        return true;
    } catch (e) {
        console.error('Cache write error:', e.message);
        return false;
    }
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Video download (HLS guard is in main.js)
    downloadVideo: (url, title) => ipcRenderer.invoke('download-video', url, title),

    // Folder picker
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // Recursive video scanner – returns array with `streamUrl` using custom protocol
    scanVideos: (folderPath) => ipcRenderer.invoke('scan-videos', folderPath),

    // Disk-based thumbnail cache (avoids 5 MB localStorage limit)
    getCachedThumbnail: (key) => ipcRenderer.invoke('get-cached-thumbnail', key),
    setCachedThumbnail: (key, dataUrl) => ipcRenderer.invoke('set-cached-thumbnail', key, dataUrl),
});

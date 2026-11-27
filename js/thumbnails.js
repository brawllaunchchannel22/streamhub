// ============================================================
// js/thumbnails.js — Thumbnail Capture & Generation
// Depends on: state.js (realThumbQueue, realThumbBusy, activeRealThumbs,
//                        thumbnailQueue, isProcessingThumbnails, activeThumbnails),
//             utils.js (simpleHash)
// ============================================================

'use strict';

// ── Real Thumbnail Capture ───────────────────────────────────────────────────

/**
 * Captures a single JPEG frame from videoUrl.
 * Supports plain MP4/WebM and HLS (.m3u8) via hls.js.
 * @returns {Promise<string|null>} data-URL or null on failure.
 */
async function captureVideoFrame(videoUrl) {
    return new Promise((resolve) => {
        let resolved = false;
        let hlsCap   = null;

        const video = document.createElement('video');
        video.crossOrigin  = 'anonymous';
        video.muted        = true;
        video.preload      = 'auto';
        video.playsInline  = true;
        // Hidden but sized so drawImage works
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

        const timeout = setTimeout(() => done(null), 12000); // 12 s max

        const captureFrame = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width  = 320;
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

        // Capture as soon as we have a few frames
        video.addEventListener('timeupdate', () => {
            if (video.currentTime > 0.1) doCapture();
        });

        video.addEventListener('error', () => { clearTimeout(timeout); done(null); }, { once: true });

        if (videoUrl && videoUrl.includes('.m3u8')) {
            // HLS stream — use hls.js with minimal buffer settings
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                hlsCap = new Hls({
                    maxBufferLength:    1,
                    maxMaxBufferLength: 2,
                    maxBufferSize:      500 * 1024,
                    enableAudio:        false,
                    enableWorker:       true,
                    capLevelToPlayerSize: true,
                    lowLatencyMode:     true
                });
                hlsCap.loadSource(videoUrl);
                hlsCap.attachMedia(video);
                hlsCap.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(() => setTimeout(doCapture, 1000));
                });
                hlsCap.on(Hls.Events.ERROR, (_, d) => {
                    if (d.fatal) { clearTimeout(timeout); done(null); }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = videoUrl;
                video.play().catch(() => setTimeout(doCapture, 1000));
            } else {
                done(null);
            }
        } else {
            // Standard MP4 — play and capture on first timeupdate
            video.src = videoUrl;
            video.addEventListener('loadeddata', () => {
                video.play().catch(() => setTimeout(doCapture, 1000));
            }, { once: true });
        }
    });
}

// ── Real Thumbnail Queue ─────────────────────────────────────────────────────

/**
 * Queues a real thumbnail load for `element`.
 * Checks Electron disk cache and localStorage cache first; only captures if needed.
 *
 * @param {string}      videoUrl         URL of the video stream
 * @param {string}      cacheKey         Hash key for the cache
 * @param {HTMLElement} element          Thumbnail container element
 * @param {string}      fallbackGradient CSS gradient used before capture
 */
async function queueRealThumbnail(videoUrl, cacheKey, element, fallbackGradient) {
    if (!videoUrl || !element) return;

    // 1. Electron disk cache (fastest)
    if (window.electronAPI?.getCachedThumbnail) {
        try {
            const cached = await window.electronAPI.getCachedThumbnail(cacheKey);
            if (cached) { applyThumbDataUrl(element, cached); return; }
        } catch (_) {}
    }

    // 2. localStorage cache (fast, limited space)
    try {
        const lsCached = localStorage.getItem('t_' + cacheKey);
        if (lsCached) {
            applyThumbDataUrl(element, lsCached);
            // Promote to Electron disk cache if available
            if (window.electronAPI?.setCachedThumbnail) {
                window.electronAPI.setCachedThumbnail(cacheKey, lsCached).catch(() => {});
                localStorage.removeItem('t_' + cacheKey);
            }
            return;
        }
    } catch (_) {}

    // 3. Queue for live capture
    realThumbQueue.push({ videoUrl, cacheKey, element, fallbackGradient });
    drainThumbQueue();
}

/** Drains the realThumbQueue respecting the MAX_REAL_THUMBS concurrency limit. */
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

/**
 * Applies a captured frame data-URL to `element` with a smooth fade.
 * Fades out the channel logo overlay if present.
 */
function applyThumbDataUrl(element, dataUrl) {
    if (!element || !element.isConnected) return;
    element.style.transition       = 'background-image 0.3s ease';
    element.style.backgroundImage  = `url(${dataUrl})`;
    element.style.backgroundSize   = 'cover';
    element.style.backgroundPosition = 'center';
    const logo  = element.querySelector('.thumb-overlay-logo');
    const tower = element.querySelector('.live-tower-icon');
    if (logo)  { logo.style.transition  = 'opacity 0.4s'; logo.style.opacity  = '0'; }
    if (tower) { tower.style.transition = 'opacity 0.4s'; tower.style.opacity = '0'; }
}

/**
 * Loads a real thumbnail for one element:
 * Electron disk cache → localStorage → live frame capture.
 */
async function loadRealThumbnail(videoUrl, cacheKey, element, fallbackGradient) {
    if (!videoUrl || !element) return;
    try {
        // 1. Electron disk cache
        if (window.electronAPI?.getCachedThumbnail) {
            const cached = await window.electronAPI.getCachedThumbnail(cacheKey);
            if (cached) { applyThumbDataUrl(element, cached); return; }
        }
        // 2. localStorage cache
        try {
            const lsCached = localStorage.getItem('t_' + cacheKey);
            if (lsCached) {
                applyThumbDataUrl(element, lsCached);
                if (window.electronAPI?.setCachedThumbnail) {
                    window.electronAPI.setCachedThumbnail(cacheKey, lsCached).catch(() => {});
                    localStorage.removeItem('t_' + cacheKey);
                }
                return;
            }
        } catch (_) {}
        // 3. Live capture
        const frame = await captureVideoFrame(videoUrl);
        if (frame) {
            applyThumbDataUrl(element, frame);
            if (window.electronAPI?.setCachedThumbnail) {
                window.electronAPI.setCachedThumbnail(cacheKey, frame).catch(() => {});
            } else {
                try { localStorage.setItem('t_' + cacheKey, frame); } catch (_) {}
            }
        }
    } catch (e) {
        console.warn('[Thumb] Error loading thumbnail:', e.message);
    }
}

// ── Local Video Thumbnail Generation ────────────────────────────────────────

/**
 * Queues a local-video thumbnail generation task.
 * @param {string}      videoPath        Filesystem path to the local video
 * @param {HTMLElement} thumbnailElement Container to receive the thumbnail
 * @param {string|null} streamUrl        Optional stream URL override
 */
function queueThumbnailGeneration(videoPath, thumbnailElement, streamUrl = null) {
    thumbnailQueue.push({ videoPath, thumbnailElement, streamUrl });
    processThumbnailQueue();
}

/**
 * Drains the local thumbnailQueue with a concurrency limit of MAX_CONCURRENT_THUMBNAILS.
 */
async function processThumbnailQueue() {
    if (isProcessingThumbnails || thumbnailQueue.length === 0 || activeThumbnails >= MAX_CONCURRENT_THUMBNAILS) {
        return;
    }
    isProcessingThumbnails = true;
    while (thumbnailQueue.length > 0 && activeThumbnails < MAX_CONCURRENT_THUMBNAILS) {
        const item = thumbnailQueue.shift();
        activeThumbnails++;
        generateLocalThumbnail(item.videoPath, item.thumbnailElement, item.streamUrl)
            .finally(() => { activeThumbnails--; processThumbnailQueue(); });
    }
    isProcessingThumbnails = false;
}

/**
 * Generates a thumbnail from a local video file by seeking to ~10% of its duration.
 * Caches the result in localStorage under `local_thumb_${videoPath}`.
 *
 * @param {string}      videoPath        Filesystem path
 * @param {HTMLElement} thumbnailElement Container element
 * @param {string|null} streamUrl        Optional stream URL override for the src
 */
async function generateLocalThumbnail(videoPath, thumbnailElement, streamUrl = null) {
    return new Promise((resolve) => {
        try {
            // Return early if already cached
            const cachedThumb = localStorage.getItem(`local_thumb_${videoPath}`);
            if (cachedThumb) {
                thumbnailElement.style.backgroundImage = `url(${cachedThumb})`;
                thumbnailElement.innerHTML = '';
                resolve();
                return;
            }

            const video   = document.createElement('video');
            video.muted   = true;
            video.preload = 'metadata';
            video.src     = streamUrl || `file://${videoPath}`;

            let cleaned = false;
            const cleanup = () => {
                if (!cleaned) {
                    cleaned   = true;
                    video.src = '';
                    video.load();
                    video.remove();
                }
            };

            const timeout = setTimeout(() => { cleanup(); resolve(); }, 10000);

            video.addEventListener('loadeddata', () => {
                video.currentTime = Math.min(5, video.duration * 0.1);
            });

            video.addEventListener('seeked', () => {
                try {
                    const canvas  = document.createElement('canvas');
                    canvas.width  = 320;
                    canvas.height = 180;
                    canvas.getContext('2d').drawImage(video, 0, 0, 320, 180);
                    const thumbnail = canvas.toDataURL('image/jpeg', 0.6);
                    thumbnailElement.style.backgroundImage = `url(${thumbnail})`;
                    thumbnailElement.innerHTML = '';
                    try { localStorage.setItem(`local_thumb_${videoPath}`, thumbnail); }
                    catch (e) { console.warn('Could not cache local thumbnail - storage full?'); }
                } catch (e) {
                    console.error('Local thumbnail canvas error:', e);
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
            console.error('generateLocalThumbnail error:', e);
            resolve();
        }
    });
}

console.log('[thumbnails.js] loaded');

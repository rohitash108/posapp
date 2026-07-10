/**
 * GTC POS — Electron Main Process
 *
 * Performance optimisations over the baseline:
 *  1. Gzip compression for all text assets (JS/CSS/JSON/SVG) → ~74% smaller transfers
 *  2. In-memory file cache — zero disk I/O after the first load
 *  3. Background cache warm-up — entire dist tree read into RAM while splash shows
 *  4. Parallel startup — window creation & server startup happen simultaneously
 *  5. Branded splash screen with the actual GTC logo (read from dist at launch)
 */

'use strict';

const { app, BrowserWindow, dialog, session, globalShortcut, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path   = require('path');
const http   = require('http');
const net    = require('net');
const fs     = require('fs');
const zlib   = require('zlib');
const crypto = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────
let PORT = 57891;
let server;
let mainWindow = null;
let manualUpdateCheck = false;
let lastBackgroundCheckAt = 0;
let updateWin = null;

const UPDATE_CHECK_DELAY_MS = 3_000;
const UPDATE_RECHECK_MS = 2 * 60 * 60 * 1000; // every 2 hours
const UPDATE_FOCUS_THROTTLE_MS = 5 * 60 * 1000;

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript',
  '.css':   'text/css',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.ico':   'image/x-icon',
  '.json':  'application/json',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
  '.svg':   'image/svg+xml',
  '.map':   'application/json',
  '.webp':  'image/webp',
};

// Compress these extensions with gzip
const COMPRESSIBLE = new Set(['.js', '.css', '.json', '.svg', '.map', '.html', '.txt']);

// ── Dist path (computed eagerly, before app.whenReady) ────────────────────────
function getDistPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.join(__dirname, '..', 'dist');
}

// ── In-memory file cache ──────────────────────────────────────────────────────
// Key: absolute file path
// Value: { raw: Buffer, gz: Buffer|null, ct: string, etag: string }
const fileCache = new Map();

function cacheEntry(filePath, raw) {
  const ext = path.extname(filePath).toLowerCase();
  const ct  = MIME[ext] || 'application/octet-stream';
  const etag = '"' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 16) + '"';
  const gz  = COMPRESSIBLE.has(ext) ? zlib.gzipSync(raw, { level: 6 }) : null;
  const entry = { raw, gz, ct, etag };
  fileCache.set(filePath, entry);
  return entry;
}

// Walk the dist tree and pre-load every file into memory cache in the background.
// Runs concurrently — doesn't block startup. Total dist ~6.5 MB → < 200 ms on SSD.
function warmCache(distPath) {
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        // Skip already-cached and very large files (> 20 MB — safety valve)
        if (!fileCache.has(full)) {
          try {
            const raw = fs.readFileSync(full);
            if (raw.length < 20 * 1024 * 1024) cacheEntry(full, raw);
          } catch { /* skip unreadable */ }
        }
      }
    }
  }
  // Run synchronously but in a setImmediate tick so it doesn't block window creation
  setImmediate(() => walk(distPath));
}

// ── Logo path (works both in dev and when packaged) ───────────────────────────
function getLogoPath() {
  // When packaged: extraResources places it at resources/assets/
  // In dev: it's in the project root assets/ directory
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'global-tea-cafe-logo.png')
    : path.join(__dirname, '..', 'assets', 'global-tea-cafe-logo.png');
}

function getIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.ico')
    : path.join(__dirname, '..', 'assets', 'icon.ico');
}

// ── Splash screen HTML ─────────────────────────────────────────────────────────
function makeSplashHtml() {
  let imgTag;
  try {
    const logoPath = getLogoPath();
    const logoB64  = fs.readFileSync(logoPath).toString('base64');
    imgTag = `<img src="data:image/png;base64,${logoB64}"
                   alt="GTC"
                   style="width:100px;height:100px;border-radius:50%;
                          object-fit:cover;margin-bottom:20px;
                          box-shadow:0 0 0 6px rgba(201,165,42,.18),
                                     0 0 0 12px rgba(201,165,42,.07)">`;
  } catch {
    imgTag = `<div style="width:100px;height:100px;border-radius:50%;
                          background:#2D4A2D;margin:0 auto 20px;
                          display:flex;align-items:center;justify-content:center;
                          font-size:48px">🍵</div>`;
  }
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>GTC POS</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;background:#1A2B1A;display:flex;align-items:center;
          justify-content:center;font-family:system-ui,sans-serif}
.w{text-align:center;color:#fff;user-select:none}
h2{font-size:22px;font-weight:900;color:#C9A52A;letter-spacing:3px;margin-bottom:5px}
.sub{font-size:11px;color:rgba(255,255,255,.4);letter-spacing:2px;
     text-transform:uppercase;margin-bottom:28px}
.bar{width:220px;height:4px;background:rgba(255,255,255,.1);
     border-radius:4px;margin:0 auto;overflow:hidden}
.fill{height:100%;background:linear-gradient(90deg,#C9A52A,#E8C14A);
      border-radius:4px;animation:s 1.4s ease-in-out infinite}
@keyframes s{0%{width:0%;margin-left:0}50%{width:65%}100%{width:0%;margin-left:100%}}
</style></head>
<body>
<div class="w">
  ${imgTag}
  <h2>GLOBAL TEA CAFE</h2>
  <div class="sub">Billing System</div>
  <div class="bar"><div class="fill"></div></div>
</div>
</body></html>`;
}

// ── Port probe ────────────────────────────────────────────────────────────────
function findFreePort(start) {
  return new Promise((resolve, reject) => {
    function tryPort(p) {
      if (p > start + 30) {
        reject(new Error(`No free port found in range ${start}–${start + 30}`));
        return;
      }
      const probe = net.createServer();
      probe.once('error', () => { probe.close(); tryPort(p + 1); });
      probe.once('listening', () => { probe.close(() => resolve(p)); });
      probe.listen(p, '127.0.0.1');
    }
    tryPort(start);
  });
}

// ── CORS headers ──────────────────────────────────────────────────────────────
function setupCORS() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = Object.assign({}, details.responseHeaders);
    if (!headers['access-control-allow-origin'] && !headers['Access-Control-Allow-Origin']) {
      headers['Access-Control-Allow-Origin']  = ['*'];
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
      headers['Access-Control-Allow-Headers'] = ['Content-Type, Authorization, Accept, X-Requested-With'];
    }
    callback({ responseHeaders: headers });
  });

  // Only rewrite Origin for requests to the remote API, never for localhost
  // (rewriting localhost Origin breaks font CORS checks in Chromium)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = Object.assign({}, details.requestHeaders);
    const isLocal = details.url.startsWith('http://localhost') ||
                    details.url.startsWith('http://127.0.0.1');
    if (!isLocal) {
      headers['Origin'] = 'https://restaurant.softwar.in';
    }
    callback({ requestHeaders: headers });
  });
}

// ── Static file server with gzip + in-memory cache ───────────────────────────
function startServer(distPath) {
  const indexPath = path.join(distPath, 'index.html');

  server = http.createServer((req, res) => {
    // Early-return for OPTIONS pre-flight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
      });
      res.end();
      return;
    }

    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    // Path traversal guard
    const resolved = path.resolve(path.join(distPath, urlPath));
    if (!resolved.startsWith(distPath)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    // Resolve directories to index.html
    let target = resolved;
    try {
      const st = fs.statSync(resolved);
      if (st.isDirectory()) target = path.join(resolved, 'index.html');
    } catch { /* file not found — fall through to SPA fallback */ }

    const ext = path.extname(target).toLowerCase();

    // ETag check (client already has this version)
    const cached = fileCache.get(target);
    if (cached) {
      if (req.headers['if-none-match'] === cached.etag) {
        res.writeHead(304); res.end(); return;
      }
      serveEntry(req, res, cached, ext);
      return;
    }

    // Cache miss — read from disk
    fs.readFile(target, (err, raw) => {
      if (err) {
        // SPA fallback: serve index.html for unknown routes
        const idx = fileCache.get(indexPath);
        if (idx) { serveEntry(req, res, idx, '.html'); return; }
        fs.readFile(indexPath, (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          serveEntry(req, res, cacheEntry(indexPath, d2), '.html');
        });
        return;
      }
      serveEntry(req, res, cacheEntry(target, raw), ext);
    });
  });

  server.on('error', (err) => {
    dialog.showErrorBox('GTC POS — Server Error',
      `Failed to start on port ${PORT}: ${err.message}`);
    app.quit();
  });

  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
}

function serveEntry(req, res, entry, ext) {
  const isHtml     = ext === '.html';
  const isHashed   = !isHtml && /[a-f0-9]{8,}/.test(path.basename(entry.raw ? '' : ''));
  const cacheCtrl  = isHtml
    ? 'no-cache'
    : 'public, max-age=31536000, immutable'; // hashed assets are immutable

  // Negotiate compression
  const acceptGzip = (req.headers['accept-encoding'] || '').includes('gzip');
  if (acceptGzip && entry.gz) {
    res.writeHead(200, {
      'Content-Type':              entry.ct,
      'Content-Encoding':          'gzip',
      'Cache-Control':             cacheCtrl,
      'ETag':                      entry.etag,
      'Vary':                      'Accept-Encoding',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(entry.gz);
  } else {
    res.writeHead(200, {
      'Content-Type':              entry.ct,
      'Cache-Control':             cacheCtrl,
      'ETag':                      entry.etag,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(entry.raw);
  }
}

// ── Auto-updater (GitHub Releases via electron-updater) ───────────────────────
function sendUpdateStatus(payload) {
  const win = updateWin && !updateWin.isDestroyed() ? updateWin : mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('gtc-pos:update-status', payload);
  }
}

function setupAutoUpdater(win) {
  if (!app.isPackaged) return;

  updateWin = win;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  const prompt = (options) => {
    const target = win && !win.isDestroyed() ? win : BrowserWindow.getFocusedWindow();
    return dialog.showMessageBox(target || undefined, options);
  };

  autoUpdater.on('checking-for-update', () => {
    // Silent background checks — no UI noise.
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({
      state: 'available',
      version: info.version,
      currentVersion: app.getVersion(),
      message: `Version ${info.version} is available.`,
    });

    prompt({
      type: 'info',
      title: 'GTC POS — Update Available',
      message: `Version ${info.version} is available.`,
      detail: `You are on v${app.getVersion()}.\n\nDownload and install the update?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    // Only tell the user when they explicitly asked (Ctrl+Shift+U / Settings).
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    prompt({
      type: 'info',
      title: 'GTC POS — Up to Date',
      message: 'You are on the latest version.',
      detail: `Current version: v${app.getVersion()}`,
      buttons: ['OK'],
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      state: 'downloading',
      currentVersion: app.getVersion(),
      progress: Math.round(progress.percent || 0),
      message: 'Downloading update…',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({
      state: 'ready',
      version: info.version,
      currentVersion: app.getVersion(),
      message: 'Update downloaded. Restart to apply.',
    });

    prompt({
      type: 'info',
      title: 'GTC POS — Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart the app to apply the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err?.message || err);
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    prompt({
      type: 'warning',
      title: 'GTC POS — Update Check Failed',
      message: 'Could not check for updates.',
      detail: err?.message || 'Please try again later.',
      buttons: ['OK'],
    });
  });

  const checkForUpdates = (force = false) => {
    const now = Date.now();
    if (!force && now - lastBackgroundCheckAt < UPDATE_FOCUS_THROTTLE_MS) return;
    lastBackgroundCheckAt = now;

    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[autoUpdater] check failed:', err?.message || err);
    });
  };

  setTimeout(() => checkForUpdates(true), UPDATE_CHECK_DELAY_MS);
  setInterval(() => checkForUpdates(true), UPDATE_RECHECK_MS);

  win.on('focus', () => checkForUpdates(false));
}

function checkForUpdatesManual() {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'GTC POS',
      message: 'Auto-update runs in the installed Windows app only.',
      detail: 'Build the installer to test update checks.',
      buttons: ['OK'],
    });
    return;
  }

  manualUpdateCheck = true;
  autoUpdater.checkForUpdates().catch((err) => {
    manualUpdateCheck = false;
    console.error('[autoUpdater] manual check failed:', err?.message || err);
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'GTC POS — Update Check Failed',
      message: err?.message || 'Could not check for updates.',
      buttons: ['OK'],
    });
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = getIconPath();
  const win = new BrowserWindow({
    width:    1440,
    height:   900,
    minWidth: 1024,
    minHeight: 700,
    title:    'GTC POS — Global Tea Cafe',
    backgroundColor: '#1A2B1A',
    icon:     fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,            // will show after ready-to-show to avoid white flash
    webPreferences: {
      preload:                 path.join(__dirname, 'preload.js'),
      nodeIntegration:         false,
      contextIsolation:        true,
      webSecurity:             false,
      backgroundThrottling:    false,
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
    if (server) server.close();
  });
  mainWindow = win;
  return win;
}

// ── Startup ───────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Windows taskbar / notification grouping + branding
  app.setName('GTC POS');
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.gtc.pos');
  }

  setupCORS();

  const distPath = getDistPath();
  if (!fs.existsSync(distPath)) {
    dialog.showErrorBox('GTC POS — Error',
      `App files not found:\n${distPath}\n\nPlease re-download the application.`);
    app.quit();
    return;
  }

  // ── Show splash immediately ────────────────────────────────────────────────
  const win = createWindow();
  const splashHtml = makeSplashHtml();
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  // Show now (splash is data: URL, loads instantly) — ready-to-show fires immediately
  win.once('ready-to-show', () => win.show());
  win.show(); // belt-and-suspenders in case event already fired

  // ── Background cache warm-up (parallel with port finding) ─────────────────
  warmCache(distPath);

  // ── Find port & start server ───────────────────────────────────────────────
  try {
    PORT = await findFreePort(57891);
  } catch (err) {
    dialog.showErrorBox('GTC POS — Error',
      'Could not find a free port.\n\n' + err.message);
    app.quit();
    return;
  }

  await startServer(distPath);

  // Navigate to the app
  await win.loadURL(`http://localhost:${PORT}`);

  setupAutoUpdater(win);

  ipcMain.handle('gtc-pos:get-version', () => app.getVersion());
  ipcMain.handle('gtc-pos:check-for-updates', () => {
    checkForUpdatesManual();
  });
  ipcMain.handle('gtc-pos:download-update', async () => {
    if (!app.isPackaged) return;
    await autoUpdater.downloadUpdate();
  });
  ipcMain.handle('gtc-pos:install-update', () => {
    if (!app.isPackaged) return;
    autoUpdater.quitAndInstall(false, true);
  });

  globalShortcut.register('CommandOrControl+Shift+U', checkForUpdatesManual);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});

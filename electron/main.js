const { app, BrowserWindow, dialog, session } = require('electron');
const path = require('path');
const http = require('http');
const net  = require('net');
const fs   = require('fs');

let PORT   = 57891;
let server;

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
};

const LOADING_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>GTC POS</title>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;background:#1A2B1A;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}
.w{text-align:center;color:#fff}.logo{width:72px;height:72px;border-radius:50%;background:#2D4A2D;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;font-size:32px}
h2{font-size:20px;font-weight:800;color:#C9A52A;letter-spacing:2px;margin-bottom:6px}p{font-size:13px;color:rgba(255,255,255,.5);margin-bottom:22px}
.bar{width:200px;height:4px;background:rgba(255,255,255,.1);border-radius:4px;margin:0 auto;overflow:hidden}
.fill{height:100%;background:#C9A52A;border-radius:4px;animation:s 1.2s ease-in-out infinite}
@keyframes s{0%{width:0%;margin-left:0}50%{width:60%}100%{width:0%;margin-left:100%}}</style></head>
<body><div class="w"><div class="logo">🍽️</div><h2>GTC POS</h2><p>Starting…</p><div class="bar"><div class="fill"></div></div></div></body></html>`;

function getDistPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.join(__dirname, '..', 'dist');
}

// ── Find a free port starting from `start` ────────────────────────────────────
function findFreePort(start) {
  return new Promise((resolve, reject) => {
    function tryPort(p) {
      if (p > start + 20) { reject(new Error('No free port found in range ' + start + '–' + (start + 20))); return; }
      const probe = net.createServer();
      probe.once('error', () => { probe.close(); tryPort(p + 1); });
      probe.once('listening', () => { probe.close(() => resolve(p)); });
      probe.listen(p, '127.0.0.1');
    }
    tryPort(start);
  });
}

// ── CORS: only inject headers that are missing ────────────────────────────────
function setupCORS() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = Object.assign({}, details.responseHeaders);
    // Add CORS headers for API responses (not needed for localhost assets but harmless)
    if (!headers['access-control-allow-origin'] && !headers['Access-Control-Allow-Origin']) {
      headers['Access-Control-Allow-Origin']  = ['*'];
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
      headers['Access-Control-Allow-Headers'] = ['Content-Type, Authorization, Accept, X-Requested-With'];
    }
    callback({ responseHeaders: headers });
  });

  // Only rewrite Origin for requests going to the actual backend API.
  // Do NOT rewrite for localhost requests — doing so breaks font loading because
  // Chromium treats the request as cross-origin and the font CORS check fails.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = Object.assign({}, details.requestHeaders);
    const isLocal = details.url.startsWith('http://localhost') || details.url.startsWith('http://127.0.0.1');
    if (!isLocal) {
      headers['Origin'] = 'https://restaurant.softwar.in';
    }
    callback({ requestHeaders: headers });
  });
}

// ── Static file server ────────────────────────────────────────────────────────
function startServer(distPath) {
  const indexPath = path.join(distPath, 'index.html');

  server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    // Resolve absolute path and ensure it stays inside distPath (path traversal guard)
    const resolved = path.resolve(path.join(distPath, urlPath));
    if (!resolved.startsWith(distPath)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.stat(resolved, (statErr, stat) => {
      const target = (!statErr && stat.isDirectory()) ? path.join(resolved, 'index.html') : resolved;
      const ext    = path.extname(target).toLowerCase();
      const ct     = MIME[ext] || 'application/octet-stream';

      fs.readFile(target, (err, data) => {
        if (err) {
          // SPA fallback — serve index.html for unknown routes
          fs.readFile(indexPath, (e2, d2) => {
            if (e2) { res.writeHead(404); res.end('Not found'); return; }
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache',
            });
            res.end(d2);
          });
          return;
        }

        res.writeHead(200, {
          'Content-Type': ct,
          // Fonts and hashed JS/CSS are immutable — cache forever
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
          // Explicitly allow font loading (belt-and-suspenders alongside the session hook)
          'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
      });
    });
  });

  server.on('error', (err) => {
    dialog.showErrorBox('GTC POS — Server Error', `Failed to start on port ${PORT}: ${err.message}`);
    app.quit();
  });

  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'GTC POS — Global Tea Cafe',
    backgroundColor: '#1A2B1A',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });
  win.setMenu(null);
  win.on('closed', () => { if (server) server.close(); });
  return win;
}

// ── Startup ───────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  setupCORS();

  const distPath = getDistPath();
  if (!fs.existsSync(distPath)) {
    dialog.showErrorBox('GTC POS — Error',
      `App files not found:\n${distPath}\n\nPlease re-download the application.`);
    app.quit();
    return;
  }

  // Show window with loading screen immediately
  const win = createWindow();
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(LOADING_HTML)}`);
  win.show();

  // Find a free port (handles Windows reserved port ranges)
  try {
    PORT = await findFreePort(57891);
  } catch (err) {
    dialog.showErrorBox('GTC POS — Error', 'Could not find a free port to start on.\n\n' + err.message);
    app.quit();
    return;
  }

  await startServer(distPath);
  win.loadURL(`http://localhost:${PORT}`);
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 57891;
let server;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getDistPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.join(__dirname, '..', 'dist');
}

function startServer(onReady) {
  const distPath = getDistPath();

  if (!fs.existsSync(distPath)) {
    dialog.showErrorBox(
      'GTC POS — Error',
      `App files not found at:\n${distPath}\n\nPlease re-download the application.`
    );
    app.quit();
    return;
  }

  server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    let filePath = path.join(distPath, urlPath);

    try {
      if (fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch {
      filePath = path.join(distPath, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(distPath, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(d2);
        });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  server.on('error', (err) => {
    dialog.showErrorBox('GTC POS — Server Error', `Failed to start: ${err.message}`);
    app.quit();
  });

  server.listen(PORT, '127.0.0.1', onReady);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'GTC POS — Global Tea Cafe',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenu(null);
  win.loadURL(`http://localhost:${PORT}`);
  win.on('closed', () => { if (server) server.close(); });
}

app.whenReady().then(() => {
  startServer(() => {
    createWindow();
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});

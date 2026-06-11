const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

const PORT = 57891;
let server;

function getBasePath() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
}

function startServer() {
  // Require express from correct location
  const expressPath = path.join(getBasePath(), 'node_modules', 'express');
  const express = require(expressPath);
  const distPath = path.join(getBasePath(), 'dist');

  const web = express();
  web.use(express.static(distPath));
  web.get('*', (_, res) => res.sendFile(path.join(distPath, 'index.html')));
  server = http.createServer(web).listen(PORT);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'GTC POS — Global Tea Cafe',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenu(null);
  win.loadURL(`http://localhost:${PORT}`);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (server) server.close(); });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});

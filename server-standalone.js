const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 57891;

// When built with pkg, dist/ folder sits next to the .exe
const DIST = process.pkg
  ? path.join(path.dirname(process.execPath), 'dist')
  : path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pak': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  let filePath = path.join(DIST, urlPath);

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(DIST, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const fallback = path.join(DIST, 'index.html');
      fs.readFile(fallback, (e2, d2) => {
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

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`GTC POS running at ${url}`);
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : `open "${url}"`;
  exec(cmd);
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

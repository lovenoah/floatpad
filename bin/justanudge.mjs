#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const LAYOUT_FILE = path.join(process.cwd(), '.justanudge-layout.json');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3737;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET layout
  if (url.pathname === '/__justanudge/layout' && req.method === 'GET') {
    if (!fs.existsSync(LAYOUT_FILE)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end('{}');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(fs.readFileSync(LAYOUT_FILE, 'utf-8'));
  }

  // POST save
  if (url.pathname === '/__justanudge/save' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        JSON.parse(body);
        fs.writeFileSync(LAYOUT_FILE, body, 'utf-8');
        res.writeHead(200);
        res.end('ok');
      } catch {
        res.writeHead(400);
        res.end('invalid json');
      }
    });
    return;
  }

  // Static files — SPA fallback to index.html
  let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nJust a Nudge  →  ${url}\n`);

  const open =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' :
    'xdg-open';
  exec(`${open} ${url}`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT=<number> to use a different port.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

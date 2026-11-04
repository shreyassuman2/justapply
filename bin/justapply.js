#!/usr/bin/env node
// JustApply launcher: serves the app from this package on your own computer and opens it in your browser.
// No dependencies, nothing leaves your machine. Usage: npx justapply [--port 4545] [--no-open]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log('Usage: npx justapply [--port <number>] [--no-open]\n\nStarts JustApply at http://localhost:4545 and opens it in your browser.\nKeep the same port: your browser saves your data per address.');
  process.exit(0);
}
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : Number(process.env.PORT) || 4545;
const OPEN = !args.includes('--no-open');
const URL_ = `http://localhost:${PORT}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
// Only these files are ever served.
const ALLOWED = /^\/(index\.html|manifest\.webmanifest|sw\.js|icons\/[\w.-]+|vendor\/[\w.-]+)$/;

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, URL_); } catch { res.writeHead(400).end(); return; }
  let p = decodeURIComponent(url.pathname);
  if (p === '/__justapply') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('justapply'); return; }
  if (p === '/') p = '/index.html';
  if (!ALLOWED.test(p)) { res.writeHead(404).end('Not found'); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': /index\.html|sw\.js/.test(p) ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
});

function openBrowser() {
  if (!OPEN) return;
  const cmd = process.platform === 'darwin' ? `open "${URL_}"` : process.platform === 'win32' ? `start "" "${URL_}"` : `xdg-open "${URL_}"`;
  exec(cmd, () => {});
}

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') { console.error(err.message); process.exit(1); }
  // Something already has the port. If it's JustApply (another terminal), just open it.
  http.get(URL_ + '__justapply', (r) => {
    let body = ''; r.on('data', c => body += c); r.on('end', () => {
      if (body === 'justapply') { console.log(`JustApply is already running at ${URL_}`); openBrowser(); process.exit(0); }
      portBusy();
    });
  }).on('error', portBusy);
});
function portBusy() {
  console.error(`Port ${PORT} is in use by another program. Try: npx justapply --port 4546\n(Your data is saved per address, so keep using the same port afterwards.)`);
  process.exit(1);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  JustApply is running at ${URL_}\n\n  Your data stays in this browser on this computer. Press Ctrl+C to stop.\n`);
  openBrowser();
});
process.on('SIGINT', () => { console.log('\nStopped.'); process.exit(0); });

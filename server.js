// Server tanpa dependency (Node >= 18). Menyajikan frontend + proxy ke API upstream.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const UPSTREAM = (process.env.UPSTREAM || 'https://am.noxxyrorr.biz.id/api').replace(/\/$/, '');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ALLOWED = new Set(['send-link', 'verify-link']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };

function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function proxy(req, res, endpoint) {
  try {
    const body = await readBody(req);
    const r = await fetch(`${UPSTREAM}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const text = await r.text();
    send(res, r.status, text, r.headers.get('content-type') || 'application/json');
  } catch (e) {
    send(res, 502, JSON.stringify({ error: 'Gagal menghubungi API upstream', detail: String(e.message || e) }));
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

http.createServer((req, res) => {
  const m = req.url.split('?')[0].match(/^\/api\/([\w-]+)$/);
  if (m) {
    if (req.method !== 'POST' || !ALLOWED.has(m[1])) return send(res, 404, JSON.stringify({ error: 'Endpoint tidak ditemukan' }));
    return proxy(req, res, m[1]);
  }
  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 405, 'Method not allowed', 'text/plain');
}).listen(PORT, () => console.log(`Berjalan di http://localhost:${PORT}  ->  ${UPSTREAM}`));

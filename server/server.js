/**
 * Companion server for the invitation app.
 *
 * On the wedding day this runs on a laptop plugged into the venue's WiFi. It
 * keeps the single shared guest list (`data/guests.json`) so the laptop, the
 * phone scanning at the door, and the welcome screen all agree on who has
 * arrived — and, with `--static`, it also serves the built Angular app so the
 * phones have somewhere to load it from.
 *
 * Usage:
 *   node server/server.js                                  API only (use with `ng serve`)
 *   node server/server.js --static dist/invitation/browser  API + built app
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { networkInterfaces } = require('node:os');

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = path.join(__dirname, '..');
const GUESTS_FILE = path.join(ROOT, 'data', 'guests.json');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const staticRoot = readStaticRoot(process.argv.slice(2));

ensureGuestsFile();

const server = http.createServer((req, res) => {
  // The phones hit this server cross-origin whenever the app is served from
  // `ng serve` instead of from here.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const pathname = req.url.split('?')[0];

  // `/guests` is the address the pre-Angular clients used; keep it working so
  // an old bookmark or a stale QR code does not break on the day.
  if (pathname === '/api/guests' || pathname === '/guests') {
    handleGuests(req, res);
    return;
  }

  if (!staticRoot) {
    sendJson(res, 404, { error: `Route inconnue: ${pathname}` });
    return;
  }
  serveStatic(res, pathname);
});

function handleGuests(req, res) {
  if (req.method === 'GET') {
    try {
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store',
      });
      res.end(fs.readFileSync(GUESTS_FILE, 'utf8'));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      // Validate before writing: a truncated upload from a phone that walked
      // out of WiFi range must not replace the guest list with garbage.
      let guests;
      try {
        guests = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: 'JSON invalide' });
        return;
      }
      if (!Array.isArray(guests)) {
        sendJson(res, 400, { error: 'Une liste d’invités est attendue' });
        return;
      }
      try {
        writeGuestsAtomically(guests);
        sendJson(res, 200, { ok: true, count: guests.length });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
    });
    return;
  }

  sendJson(res, 405, { error: `Méthode non supportée: ${req.method}` });
}

/**
 * Serves a file from the build output, falling back to `index.html` so the
 * Angular router owns every non-file path (`/scan?id=12` included).
 */
function serveStatic(res, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = path.join(staticRoot, relative);

  // Reject anything that escapes the build output.
  const target =
    candidate.startsWith(staticRoot) && isFile(candidate)
      ? candidate
      : path.join(staticRoot, 'index.html');

  if (!isFile(target)) {
    res.writeHead(404).end(`Application non compilée. Lancez "npm run build".`);
    return;
  }

  const ext = path.extname(target).toLowerCase();
  const headers = { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' };
  // Phones cache the app aggressively; hashed assets are safe, index.html is not.
  headers['Cache-Control'] = target.endsWith('index.html')
    ? 'no-store, no-cache, must-revalidate'
    : 'public, max-age=31536000, immutable';

  res.writeHead(200, headers);
  res.end(fs.readFileSync(target));
}

function writeGuestsAtomically(guests) {
  const temp = `${GUESTS_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(guests, null, 2));
  fs.renameSync(temp, GUESTS_FILE);
}

function ensureGuestsFile() {
  fs.mkdirSync(path.dirname(GUESTS_FILE), { recursive: true });
  if (!fs.existsSync(GUESTS_FILE)) {
    fs.writeFileSync(GUESTS_FILE, '[]');
    console.log('Fichier guests.json créé:', GUESTS_FILE);
  }
}

function readStaticRoot(args) {
  const index = args.indexOf('--static');
  if (index === -1) return null;
  const dir = args[index + 1];
  if (!dir) throw new Error('--static attend un chemin de dossier');
  return path.resolve(ROOT, dir);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': CONTENT_TYPES['.json'] });
  res.end(JSON.stringify(payload));
}

function isFile(candidate) {
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net.address);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('  SERVEUR MARIAGE DÉMARRÉ');
  console.log('========================================');
  console.log(`Invités   : ${GUESTS_FILE}`);
  console.log(`Mode      : ${staticRoot ? `application + API (${staticRoot})` : 'API seule'}`);
  console.log(`Local     : http://localhost:${PORT}`);
  for (const address of lanAddresses()) {
    console.log(`Réseau    : http://${address}:${PORT}`);
  }
  console.log('========================================');
});

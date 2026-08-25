const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const GUESTS_FILE = path.join(__dirname, 'assets', 'js', 'guests.json');

// Crée le fichier guests.json s'il n'existe pas
if (!fs.existsSync(GUESTS_FILE)) {
    fs.writeFileSync(GUESTS_FILE, '[]');
    console.log('✅ Fichier guests.json créé:', GUESTS_FILE);
}

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Enlève les query strings pour le routage
    const cleanUrl = req.url.split('?')[0];
    console.log(`\n📥 Requête: ${req.method} ${req.url}`);
    console.log(`   Clean URL: ${cleanUrl}`);

    // ===== API : GET /guests =====
    if (req.method === 'GET' && cleanUrl === '/guests') {
        console.log('   → Route API: GET /guests');
        try {
            const guests = fs.readFileSync(GUESTS_FILE, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(guests);
            console.log('   ✅ Guests envoyés');
            return;
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
            console.log('   ❌ Erreur lecture:', e.message);
            return;
        }
    }

    // ===== API : POST /guests =====
    if (req.method === 'POST' && cleanUrl === '/guests') {
        console.log('   → Route API: POST /guests');
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                fs.writeFileSync(GUESTS_FILE, body);
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(200);
                res.end('{"ok":true}');
                console.log('   ✅ Guests sauvegardés');
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
                console.log('   ❌ Erreur écriture:', e.message);
            }
        });
        return;
    }

    // ===== FICHIERS STATIQUES =====
    let filePath;

    if (cleanUrl === '/') {
        filePath = path.join(__dirname, 'index.html');
    } else {
        filePath = path.join(__dirname, cleanUrl);
    }

    console.log(`   → Fichier: ${filePath}`);

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.json': 'application/json; charset=utf-8'
    };

    try {
        if (!fs.existsSync(filePath)) {
            console.log(`   ❌ Fichier NON TROUVÉ: ${filePath}`);
            res.writeHead(404);
            res.end(`Fichier non trouvé: ${req.url}`);
            return;
        }

        const content = fs.readFileSync(filePath);
        res.setHeader('Content-Type', contentTypes[ext] || 'text/plain');
        // Empêche la mise en cache des fichiers (surtout important sur mobile,
        // où le navigateur garde souvent une vieille version de app.js/scan.js
        // même après qu'on les ait corrigés sur le serveur).
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.writeHead(200);
        res.end(content);
        console.log(`   ✅ Servi: ${path.basename(filePath)} (${content.length} bytes)`);
    } catch (e) {
        console.error(`   ❌ Erreur: ${e.message}`);
        res.writeHead(500);
        res.end(`Erreur serveur: ${e.message}`);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`  🎉 SERVEUR MARIAGE DÉMARRÉ`);
    console.log(`========================================`);
    console.log(`\n📁 Dossier racine: ${__dirname}`);
    console.log(`📁 Fichier guests: ${GUESTS_FILE}`);
    console.log(`\n📱 Accès local:    http://localhost:${PORT}`);

    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    console.log(`\n🌐 Accès réseau:`);
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`   http://${net.address}:${PORT}`);
            }
        }
    }

    console.log(`\n⚠️  IMPORTANT:`);
    console.log(`   1. Vérifiez que scan.html existe: ${fs.existsSync(path.join(__dirname, 'scan.html')) ? '✅' : '❌'}`);
    console.log(`   2. Vérifiez que guests.json existe: ${fs.existsSync(GUESTS_FILE) ? '✅' : '❌'}`);
    console.log(`========================================\n`);
});
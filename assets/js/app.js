// ===== CONSTANTS =====
const tableNames = [
    "Genèse 2:24", "Matthieu 19:5", "Marc 10:9", "Jean 15:12",
    "1 Corinthiens 13:4-8", "Éphésiens 5:25", "Colossiens 3:14",
    "1 Jean 4:7", "Romains 12:10", "1 Pierre 4:8",
    "Proverbes 18:22", "Cantique 8:6", "Jean 3:16",
    "Philippiens 4:7", "Galates 5:22", "Romains 15:13",
    "Psaumes 128:3", "Proverbes 31:10", "Ésaïe 54:5",
    "Osée 2:19", "Jean 14:27", "Matthieu 5:9",
    "Romains 8:28", "Jérémie 29:11", "Psaumes 37:4",
    "Philippiens 4:13", "Hébreux 11:1", "Jacques 1:2",
    "1 Pierre 1:8", "Psaumes 16:11"
];

const links = ["Parent", "Ami", "Collègue", "Connaissance", "Église"];
const statuses = ["Couple", "Monsieur", "Madame", "Mademoiselle"];

const MAX_GUESTS = 300;
const MAX_TABLES = 30;
const MAX_PER_TABLE = 10;

let guests = [];
let tables = [];
let currentPage = 1;
const itemsPerPage = 10;
let editingId = null;
let currentQRGuest = null;

// ===== INDEXEDDB =====
const DB_NAME = 'WeddingDB';
let DB_VERSION = 1;  // ← let, pas const
let db = null;
let dbReady = false;  // ← nouveau flag

function openDB() {
    return new Promise((resolve, reject) => {
        // Vérification préliminaire
        if (!window.indexedDB) {
            reject(new Error("IndexedDB non supporté par ce navigateur"));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            dbReady = true;
            console.log("✅ IndexedDB ouverte avec succès");
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            console.log("📦 Création/mise à jour du store 'data'");

            // Supprime l'ancien store si existe (pour éviter les conflits de structure)
            if (database.objectStoreNames.contains('data')) {
                database.deleteObjectStore('data');
            }

            database.createObjectStore('data', { keyPath: 'key' });
        };

        request.onblocked = (event) => {
            console.warn("IndexedDB bloquée - fermez les autres onglets");
            reject(new Error("Base de données bloquée par un autre onglet"));
        };
    });
}

async function saveToIndexedDB(key, value) {
    if (!dbReady || !db) {
        console.warn("⚠️ IndexedDB non prête, tentative d'ouverture...");
        await openDB();
    }

    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction('data', 'readwrite');
            const store = tx.objectStore('data');

            const request = store.put({ key, value: JSON.stringify(value) });

            request.onsuccess = () => {
                console.log(`💾 Sauvegarde OK: ${key}`);
                resolve();
            };

            request.onerror = (event) => {
                console.error(`❌ Erreur sauvegarde ${key}:`, event.target.error);
                reject(event.target.error);
            };

            tx.oncomplete = () => resolve();
            tx.onerror = (event) => {
                console.error("Transaction échouée:", event.target.error);
                reject(event.target.error);
            };

        } catch (err) {
            console.error("Exception IndexedDB:", err);
            reject(err);
        }
    });
}

async function loadFromIndexedDB(key, defaultValue) {
    if (!dbReady || !db) {
        console.warn("⚠️ IndexedDB non prête, tentative d'ouverture...");
        await openDB();
    }

    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction('data', 'readonly');
            const store = tx.objectStore('data');
            const request = store.get(key);

            request.onsuccess = () => {
                if (request.result) {
                    try {
                        const parsed = JSON.parse(request.result.value);
                        console.log(`📂 Chargement OK: ${key} (${Array.isArray(parsed) ? parsed.length + ' items' : 'objet'})`);
                        resolve(parsed);
                    } catch (e) {
                        console.error(`❌ JSON invalide pour ${key}:`, e);
                        resolve(defaultValue);
                    }
                } else {
                    console.log(`📂 Clé ${key} non trouvée, valeur par défaut`);
                    resolve(defaultValue);
                }
            };

            request.onerror = (event) => {
                console.error(`❌ Erreur chargement ${key}:`, event.target.error);
                reject(event.target.error);
            };

        } catch (err) {
            console.error("Exception lecture IndexedDB:", err);
            reject(err);
        }
    });
}

async function saveToStorage() {
    try {
        await saveToIndexedDB('weddingGuests', guests);
        await saveToIndexedDB('weddingTables', tables);
        console.log("✅ Toutes les données sauvegardées localement");
    } catch (err) {
        console.error("❌ ERREUR SAUVEGARDE:", err);
        showToast("Erreur de sauvegarde: " + err.message, 'error');
        // Fallback: localStorage
        try {
            localStorage.setItem('weddingGuests_backup', JSON.stringify(guests));
            localStorage.setItem('weddingTables_backup', JSON.stringify(tables));
            showToast("Sauvegarde de secours effectuée", 'info');
        } catch (e) {
            console.error("Même localStorage échoue:", e);
        }
    }

    // Envoie aussi les données au serveur, pour que le téléphone (scan.html)
    // puisse les récupérer. Sans ça, guests.json ne bouge jamais et le
    // téléphone ne voit rien, même si le réseau fonctionne.
    try {
        const serverUrl = getServerUrl();
        const response = await fetch(`${serverUrl}/guests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guests)
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        console.log("✅ Données envoyées au serveur");
    } catch (err) {
        console.error("❌ ERREUR ENVOI SERVEUR:", err);
        showToast("⚠️ Non envoyé au serveur (" + err.message + "). Le téléphone ne verra pas ces données.", 'error');
    }
}

async function loadFromStorage() {
    try {
        const savedTables = await loadFromIndexedDB('weddingTables', null);
        const savedGuests = await loadFromIndexedDB('weddingGuests', null);

        if (savedTables) {
            tables = savedTables;
        } else {
            tables = [...tableNames];
            await saveToIndexedDB('weddingTables', tables);
        }

        if (savedGuests) {
            guests = savedGuests;
        } else {
            guests = [];
        }

        console.log("✅ Données chargées:", guests.length, "invités,", tables.length, "tables");

    } catch (err) {
        console.error("❌ ERREUR CHARGEMENT:", err);
        showToast("Erreur de chargement: " + err.message, 'error');

        // Fallback: localStorage
        try {
            const backupGuests = localStorage.getItem('weddingGuests_backup');
            const backupTables = localStorage.getItem('weddingTables_backup');
            if (backupGuests) guests = JSON.parse(backupGuests);
            if (backupTables) tables = JSON.parse(backupTables);
            showToast("Données de secours restaurées", 'info');
        } catch (e) {
            // Valeurs par défaut
            tables = [...tableNames];
            guests = [];
        }
    }
}

// ===== SYNCHRONISATION DEPUIS LE SERVEUR =====
async function syncFromServer(silent = false) {
    // En mode automatique (silent), on n'interrompt pas une saisie en cours :
    // si un modal (ajout/édition d'invité ou de table) est ouvert, on
    // attendra le prochain cycle plutôt que d'écraser l'affichage.
    if (silent) {
        const modalOpen = document.querySelector('.modal-overlay.active');
        if (modalOpen) return;
    }

    const serverUrl = getServerUrl();
    const url = `${serverUrl}/guests?t=${Date.now()}`;

    if (!silent) {
        console.log('=== SYNC FROM SERVER ===');
        console.log('Server URL:', serverUrl);
        console.log('Full URL:', url);
        showToast('Synchronisation en cours...', 'info');
    }

    try {
        // Requête GET "simple" (pas de header Content-Type) pour éviter un
        // preflight CORS (OPTIONS) inutile qui peut échouer sur certains
        // réseaux/routeurs restrictifs.
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const guestsFromServer = await response.json();

        // En mode silencieux, on évite un rafraîchissement inutile de
        // l'écran si rien n'a changé depuis le dernier cycle.
        const changed = JSON.stringify(guestsFromServer) !== JSON.stringify(guests);
        if (!changed && silent) return;

        await saveToIndexedDB('weddingGuests', guestsFromServer);
        guests = guestsFromServer;

        renderTable();
        updateStats();

        if (!silent) {
            showToast(`${guestsFromServer.length} invités synchronisés !`, 'success');
        } else if (changed) {
            showToast('Liste mise à jour (changement détecté)', 'info');
        }

    } catch (e) {
        console.error('=== SYNC ERREUR ===');
        console.error('Message:', e.message);
        console.error('URL tentée:', url);

        // En mode silencieux (auto), on ne spamme pas l'utilisateur avec des
        // toasts d'erreur toutes les quelques secondes en cas de coupure
        // réseau temporaire — on log seulement en console.
        if (silent) return;

        // Message précis incluant l'URL réellement utilisée, pour diagnostiquer
        // sans avoir besoin d'ouvrir la console développeur.
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.name === 'TypeError') {
            showToast(`Serveur inaccessible sur ${serverUrl}. Vérifiez l'IP et le WiFi. (${e.message})`, 'error');
        } else if (e.message.includes('CORS')) {
            showToast(`Erreur CORS vers ${serverUrl}. Vérifiez le serveur. (${e.message})`, 'error');
        } else {
            showToast('Erreur: ' + e.message, 'error');
        }
    }
}

// ===== CONFIGURATION IP =====
function getServerUrl() {
    const savedUrl = localStorage.getItem('weddingServerUrl');
    const onLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Garde-fou auto-réparateur : si une URL "localhost" a été enregistrée
    // par erreur alors qu'on n'est manifestement pas sur le PC lui-même, on
    // l'ignore et on l'efface, plutôt que de rester bloqué dessus.
    if (savedUrl && savedUrl.includes('localhost') && !onLocalhost) {
        console.warn('URL serveur "localhost" invalide sur cet appareil — réinitialisation automatique.');
        localStorage.removeItem('weddingServerUrl');
    } else if (savedUrl) {
        return savedUrl;
    }

    // Si la page est chargée depuis le serveur réseau, on réutilise cette
    // même origine au lieu de localhost.
    if (window.location.protocol.startsWith('http') && window.location.host) {
        return window.location.origin;
    }
    return 'http://localhost:3000';
}

function saveServerUrl(url) {
    localStorage.setItem('weddingServerUrl', url);
}

function getServerIp() {
    const url = getServerUrl();
    return url.replace('http://', '').replace('https://', '');
}

// ===== INIT =====
async function init() {
    try {
        await openDB();  // ← Ouvre D'ABORD la DB
        await loadFromStorage();
        updateTableSelect();
        renderTable();
        updateStats();
        showIpBanner();
        console.log("🚀 Application initialisée avec succès");

        // Écoute automatique des changements venant d'autres appareils
        // (ex: un invité marqué "Présent" depuis le téléphone). On
        // interroge le serveur toutes les 3 secondes en tâche de fond,
        // sans interrompre une saisie en cours (voir syncFromServer).
        setInterval(() => syncFromServer(true), 3000);
    } catch (err) {
        console.error("❌ INITIALISATION ÉCHOUÉE:", err);
        showToast("Erreur d'initialisation: " + err.message, 'error');

        // Mode dégradé
        tables = [...tableNames];
        guests = [];
        updateTableSelect();
        renderTable();
        updateStats();
    }
}

// ===== IP BANNER =====
function showIpBanner() {
    const banner = document.createElement('div');
    banner.id = 'ipBanner';
    banner.innerHTML = `
        <div style="position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:15px 20px;border-radius:12px;font-family:monospace;font-size:0.95rem;z-index:9999;box-shadow:0 8px 25px rgba(0,0,0,0.3);max-width:320px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <i class="fas fa-network-wired"></i>
                <strong style="font-size:1.05rem;">Configuration Réseau</strong>
            </div>
            <div style="margin-bottom:10px;font-size:0.85rem;opacity:0.9;">
                URL actuelle du serveur :
            </div>
            <input type="text" id="ipInput" value="${getServerUrl()}" 
                style="width:100%;padding:8px 10px;border:none;border-radius:6px;font-family:monospace;font-size:0.85rem;background:rgba(255,255,255,0.15);color:white;outline:none;margin-bottom:8px;">
            <div style="display:flex;gap:8px;">
                <button onclick="saveIpFromBanner()" style="flex:1;padding:8px;background:#58d68d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-save"></i> Enregistrer
                </button>
                <button onclick="closeIpBanner()" style="padding:8px 12px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:6px;cursor:pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <p style="margin-top:8px;font-size:0.75rem;opacity:0.8;">
                <i class="fas fa-info-circle"></i> Lancez "node server.js" et copiez l'IP affichée
            </p>
        </div>
    `;
    document.body.appendChild(banner);
}

function saveIpFromBanner() {
    const input = document.getElementById('ipInput');
    let url = input.value.trim();

    if (!url) {
        showToast('Veuillez entrer une URL', 'error');
        return;
    }

    if (!url.startsWith('http')) {
        url = 'http://' + url;
    }

    saveServerUrl(url);
    showToast('URL enregistrée avec succès !', 'success');
    closeIpBanner();
}

function closeIpBanner() {
    const banner = document.getElementById('ipBanner');
    if (banner) banner.remove();
}

// ===== RENDER TABLE =====
function getSortedGuests() {
    return [...guests].sort((a, b) => {
        const nameA = (a.nom + ' ' + (a.prenom || '')).toLowerCase();
        const nameB = (b.nom + ' ' + (b.prenom || '')).toLowerCase();
        return nameA.localeCompare(nameB);
    });
}

function renderTable() {
    const tbody = document.getElementById('guestTableBody');
    const sortedGuests = getSortedGuests();
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageGuests = sortedGuests.slice(start, end);

    tbody.innerHTML = '';

    if (pageGuests.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>Aucun invité</h3>
                    <p>Commencez par ajouter un invité avec le bouton ci-dessus.</p>
                </div>
            </td></tr>`;
        return;
    }

    pageGuests.forEach((guest, index) => {
        const statusClass = `status-${guest.status.toLowerCase().replace(/\s/g, '')}`;
        const linkClass = `link-${guest.link.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`;
        const statusIcon = {
            'Couple': 'fa-heart',
            'Monsieur': 'fa-male',
            'Madame': 'fa-female',
            'Mademoiselle': 'fa-female'
        }[guest.status];

        const presentClass = guest.present ? 'present-yes' : 'present-no';
        const presentIcon = guest.present ? 'fa-check-circle' : 'fa-hourglass-half';
        const presentText = guest.present ? 'Présent' : 'Attend';

        const displayName = guest.status === 'Couple'
            ? guest.nom.toUpperCase()
            : `${guest.nom.toUpperCase()} ${guest.prenom || ''}`.trim();

        const row = document.createElement('tr');
        row.className = 'table-row-anim';
        row.style.animationDelay = `${index * 0.05}s`;
        row.innerHTML = `
            <td><span style="font-weight:800;color:var(--accent);">#${guest.id.toString().padStart(2, '0')}</span></td>
            <td><span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${guest.status}</span></td>
            <td><span class="guest-name">${displayName}</span></td>
            <td><span class="table-badge"><i class="fas fa-book-open"></i> ${guest.table}</span></td>
            <td><span class="guest-link ${linkClass}">${guest.link}</span></td>
            <td>${guest.phone ? `<i class="fab fa-whatsapp" style="color:#25D366;margin-right:4px;"></i>${guest.phone}` : '-'}</td>
            <td><span class="present-badge ${presentClass}"><i class="fas ${presentIcon}"></i> ${presentText}</span></td>
            <td>
                <div class="actions-cell" style="justify-content:center;">
                    <button class="action-btn view" onclick="viewGuest(${guest.id})" title="Voir"><i class="fas fa-eye"></i></button>
                    <button class="action-btn edit" onclick="editGuest(${guest.id})" title="Modifier"><i class="fas fa-pen"></i></button>
                    <button class="action-btn qr" onclick="showQR(${guest.id})" title="Code QR"><i class="fas fa-qrcode"></i></button>
                    <button class="action-btn delete" onclick="deleteGuest(${guest.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    renderPagination(sortedGuests.length);
    updateShowingInfo(sortedGuests.length);
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const pagination = document.getElementById('pagination');
    let html = '';

    html += `<button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span style="color:var(--text-light);font-weight:700;">...</span>`;
        }
    }

    html += `<button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;

    pagination.innerHTML = html;
}

function changePage(page) {
    const totalPages = Math.ceil(getSortedGuests().length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
    document.querySelector('.table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateShowingInfo(totalItems) {
    const start = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);
    document.getElementById('showingInfo').textContent = `Affichage ${start}-${end} sur ${totalItems}`;
}

// ===== STATS =====
function updateStats() {
    document.getElementById('statGuests').textContent = guests.length;
    document.getElementById('statTables').textContent = tables.length;
    const seats = guests.reduce((sum, g) => sum + (g.status === 'Couple' ? 2 : 1), 0);
    document.getElementById('statSeats').textContent = seats;
    document.getElementById('statCouples').textContent = guests.filter(g => g.status === 'Couple').length;
    document.getElementById('statPresent').textContent = guests.filter(g => g.present).length;

    const capacity = tables.length > 0 ? Math.min(Math.round((seats / (tables.length * MAX_PER_TABLE)) * 100), 100) : 0;
    document.getElementById('statCapacity').textContent = capacity + '%';

    checkTableOccupancy();
}

function checkTableOccupancy() {
    const warningEl = document.getElementById('occupancyWarning');
    const warningText = document.getElementById('occupancyWarningText');

    const tableCounts = {};
    guests.forEach(g => {
        const seats = g.status === 'Couple' ? 2 : 1;
        tableCounts[g.table] = (tableCounts[g.table] || 0) + seats;
    });

    const overCapacity = Object.entries(tableCounts).filter(([_, count]) => count > MAX_PER_TABLE);

    if (overCapacity.length > 0) {
        warningEl.classList.add('show');
        warningText.textContent = `Attention: ${overCapacity.map(([t, c]) => `${t} (${c}/${MAX_PER_TABLE})`).join(', ')} dépassent la capacité de 10 places !`;
    } else {
        warningEl.classList.remove('show');
    }
}

function getTableOccupancy(tableName) {
    return guests
        .filter(g => g.table === tableName)
        .reduce((sum, g) => sum + (g.status === 'Couple' ? 2 : 1), 0);
}

// ===== SEARCH =====
let searchQuery = '';

function searchGuests() {
    searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
    currentPage = 1;

    if (!searchQuery) {
        renderTable();
        return;
    }

    const filtered = getSortedGuests().filter(g =>
        g.nom.toLowerCase().includes(searchQuery) ||
        (g.prenom && g.prenom.toLowerCase().includes(searchQuery)) ||
        g.table.toLowerCase().includes(searchQuery) ||
        g.status.toLowerCase().includes(searchQuery) ||
        g.link.toLowerCase().includes(searchQuery) ||
        (g.phone && g.phone.includes(searchQuery))
    );

    const tbody = document.getElementById('guestTableBody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>Aucun résultat</h3>
                    <p>Aucun invité ne correspond à votre recherche.</p>
                </div>
            </td></tr>`;
        document.getElementById('pagination').innerHTML = '';
        document.getElementById('showingInfo').textContent = `0 résultat`;
        return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageGuests = filtered.slice(start, end);

    pageGuests.forEach((guest, index) => {
        const statusClass = `status-${guest.status.toLowerCase().replace(/\s/g, '')}`;
        const linkClass = `link-${guest.link.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`;
        const statusIcon = {
            'Couple': 'fa-heart',
            'Monsieur': 'fa-male',
            'Madame': 'fa-female',
            'Mademoiselle': 'fa-female'
        }[guest.status];

        const presentClass = guest.present ? 'present-yes' : 'present-no';
        const presentIcon = guest.present ? 'fa-check-circle' : 'fa-hourglass-half';
        const presentText = guest.present ? 'Présent' : 'Attend';

        const displayName = guest.status === 'Couple'
            ? guest.nom.toUpperCase()
            : `${guest.nom.toUpperCase()} ${guest.prenom || ''}`.trim();

        const row = document.createElement('tr');
        row.className = 'table-row-anim';
        row.style.animationDelay = `${index * 0.05}s`;
        row.innerHTML = `
            <td><span style="font-weight:800;color:var(--accent);">#${guest.id.toString().padStart(2, '0')}</span></td>
            <td><span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${guest.status}</span></td>
            <td><span class="guest-name">${displayName}</span></td>
            <td><span class="table-badge"><i class="fas fa-book-open"></i> ${guest.table}</span></td>
            <td><span class="guest-link ${linkClass}">${guest.link}</span></td>
            <td>${guest.phone ? `<i class="fab fa-whatsapp" style="color:#25D366;margin-right:4px;"></i>${guest.phone}` : '-'}</td>
            <td><span class="present-badge ${presentClass}"><i class="fas ${presentIcon}"></i> ${presentText}</span></td>
            <td>
                <div class="actions-cell" style="justify-content:center;">
                    <button class="action-btn view" onclick="viewGuest(${guest.id})" title="Voir"><i class="fas fa-eye"></i></button>
                    <button class="action-btn edit" onclick="editGuest(${guest.id})" title="Modifier"><i class="fas fa-pen"></i></button>
                    <button class="action-btn qr" onclick="showQR(${guest.id})" title="Code QR"><i class="fas fa-qrcode"></i></button>
                    <button class="action-btn delete" onclick="deleteGuest(${guest.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    renderPagination(filtered.length);
    document.getElementById('showingInfo').textContent = `${filtered.length} résultat(s)`;
}

// ===== MODALS =====
function openModal(type) {
    if (type === 'guest') {
        editingId = null;
        document.getElementById('guestForm').reset();
        document.querySelector('#guestModal .modal-title').innerHTML = '<i class="fas fa-user-plus" style="color:var(--accent);margin-right:8px;"></i>Ajouter un invité';
        updateTableSelect();
        document.getElementById('guestModal').classList.add('active');
    } else if (type === 'table') {
        document.getElementById('tableForm').reset();
        document.getElementById('tableModal').classList.add('active');
    }
}

function closeModal(type) {
    document.getElementById(type + 'Modal').classList.remove('active');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
});

// ===== SAVE GUEST =====
async function saveGuest() {
    const status = document.getElementById('guestStatus').value;
    const nom = document.getElementById('guestNom').value.trim();
    const prenom = document.getElementById('guestPrenom').value.trim();
    const table = document.getElementById('guestTable').value;
    const link = document.getElementById('guestLink').value;
    const isChristian = document.getElementById('guestIsChristian').value; // Nouveau
    const phone = document.getElementById('guestPhone').value.trim();

    if (!status || !nom || !table || !link || !isChristian) { // Ajout de isChristian ici
        showToast('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }

    // ... (garde-fous de capacité inchangés) ...

    if (editingId) {
        const idx = guests.findIndex(g => g.id === editingId);
        if (idx !== -1) {
            guests[idx] = {
                id: editingId,
                status,
                nom,
                prenom: prenom || null,
                table,
                link,
                isChristian, // Nouveau
                phone: phone || null,
                present: guests[idx].present || false
            };
            showToast('Invité modifié avec succès', 'success');
        }
    } else {
        const newId = guests.length > 0 ? Math.max(...guests.map(g => g.id)) + 1 : 1;
        const newGuest = {
            id: newId,
            status,
            nom,
            prenom: prenom || null,
            table,
            link,
            isChristian, // Nouveau
            phone: phone || null,
            present: false
        };
        guests.push(newGuest);
        showToast('Invité ajouté avec succès', 'success');

        setTimeout(() => {
            showQR(newId);
        }, 500);
    }

    await saveToStorage();
    closeModal('guest');
    renderTable();
    updateStats();
}

// ===== SAVE TABLE =====
async function saveTable() {
    const name = document.getElementById('tableName').value.trim();
    if (!name) {
        showToast('Veuillez saisir un nom de table', 'error');
        return;
    }
    if (tables.length >= MAX_TABLES) {
        showToast(`Maximum ${MAX_TABLES} tables atteint`, 'error');
        return;
    }
    if (tables.includes(name)) {
        showToast('Cette table existe déjà', 'error');
        return;
    }
    tables.push(name);
    await saveToStorage();
    updateTableSelect();
    closeModal('table');
    showToast(`Table "${name}" ajoutée`, 'success');
    updateStats();
}

function updateTableSelect() {
    const select = document.getElementById('guestTable');
    select.innerHTML = '<option value="">-- Sélectionner la table --</option>';
    tables.forEach(t => {
        const occupancy = getTableOccupancy(t);
        const isFull = occupancy >= MAX_PER_TABLE;
        const fullText = isFull ? ' (PLEINE)' : ` (${occupancy}/${MAX_PER_TABLE})`;
        select.innerHTML += `<option value="${t}" ${isFull ? 'disabled' : ''}>${t}${fullText}</option>`;
    });
}

// ===== VIEW GUEST =====
function viewGuest(id) {
    const guest = guests.find(g => g.id === id);
    if (!guest) return;

    const statusIcon = {
        'Couple': 'fa-heart',
        'Monsieur': 'fa-male',
        'Madame': 'fa-female',
        'Mademoiselle': 'fa-female'
    }[guest.status];

    const presentText = guest.present ? 'Présent' : 'Attend';
    const presentColor = guest.present ? '#58d68d' : '#aab7b8';

    const displayName = guest.status === 'Couple'
        ? guest.nom.toUpperCase()
        : `${guest.nom.toUpperCase()} ${guest.prenom || ''}`.trim();

    document.getElementById('viewContent').innerHTML = `
        <div class="view-card">
            <div class="view-avatar"><i class="fas ${statusIcon}"></i></div>
            <div class="view-name">${displayName}</div>
            <div class="view-status">${guest.status}</div>
            <div class="view-details">
                <div class="view-detail-item">
                    <div class="view-detail-label">Table</div>
                    <div class="view-detail-value"><i class="fas fa-book-open" style="margin-right:6px;color:var(--accent);"></i>${guest.table}</div>
                </div>
                <div class="view-detail-item">
                    <div class="view-detail-label">Lien</div>
                    <div class="view-detail-value">${guest.link}</div>
                </div>
                <div class="view-detail-item">
                    <div class="view-detail-label">Places</div>
                    <div class="view-detail-value">${guest.status === 'Couple' ? '2 places' : '1 place'}</div>
                </div>
                <div class="view-detail-item">
                    <div class="view-detail-label">N° Invité</div>
                    <div class="view-detail-value">#${guest.id.toString().padStart(2, '0')}</div>
                </div>
                <div class="view-detail-item">
                    <div class="view-detail-label">WhatsApp</div>
                    <div class="view-detail-value">${guest.phone || '-'}</div>
                </div>
                <div class="view-detail-item">
                    <div class="view-detail-label">Présence</div>
                    <div class="view-detail-value" style="color:${presentColor}">${presentText}</div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('viewModal').classList.add('active');
}

// ===== QR CODE =====
function showQR(id) {
    const guest = guests.find(g => g.id === id);
    if (!guest) return;

    currentQRGuest = guest;
    const serverUrl = getServerUrl();
    const qrUrl = `${serverUrl}/scan.html?id=${guest.id}`;

    const display = document.getElementById('qrDisplay');
    display.innerHTML = `
        <div style="margin-bottom:15px;padding:12px;background:var(--bg-light);border-radius:8px;border:2px solid var(--border);">
            <label style="display:block;margin-bottom:6px;font-weight:700;color:var(--text);">
                <i class="fas fa-server"></i> URL du serveur :
            </label>
            <input type="text" id="qrServerUrl" value="${serverUrl}" 
                style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:monospace;font-size:0.9rem;background:white;color:var(--text);outline:none;margin-bottom:8px;">
            <div style="display:flex;gap:8px;">
                <button onclick="updateQrServerUrl()" style="flex:1;padding:8px 12px;background:var(--accent);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-sync-alt"></i> Mettre à jour l'URL
                </button>
            </div>
            <p style="margin-top:8px;font-size:0.75rem;color:var(--text-light);">
                <i class="fas fa-info-circle"></i> Copiez l'IP affichée dans le terminal (ex: http://192.168.1.64:3000)
            </p>
        </div>
        <div id="qrcode" style="display:flex;justify-content:center;margin:15px 0;"></div>
        <div class="qr-info">
            <div class="qr-info-item">
                <span class="qr-info-label">Statut</span>
                <span class="qr-info-value">${guest.status}</span>
            </div>
            <div class="qr-info-item">
                <span class="qr-info-label">${guest.status === 'Couple' ? 'Nom' : 'Nom et Prénom'}</span>
                <span class="qr-info-value">${guest.status === 'Couple' ? guest.nom.toUpperCase() : guest.nom.toUpperCase() + ' ' + (guest.prenom || '')}</span>
            </div>
            <div class="qr-info-item">
                <span class="qr-info-label">Table</span>
                <span class="qr-info-value">${guest.table}</span>
            </div>
            <div class="qr-info-item">
                <span class="qr-info-label">URL QR</span>
                <span class="qr-info-value" style="font-size:0.7rem;word-break:break-all;color:var(--accent);">${qrUrl}</span>
            </div>
        </div>
        <div class="qr-actions">
            <button class="btn btn-success" onclick="downloadQR()">
                <i class="fas fa-download"></i> Télécharger
            </button>
            ${guest.phone ? `<button class="btn btn-whatsapp" onclick="sendWhatsApp()">
                <i class="fab fa-whatsapp"></i> Envoyer WhatsApp
            </button>` : ''}
        </div>
    `;

    generateQRCode(qrUrl);
    document.getElementById('qrModal').classList.add('active');
}

function generateQRCode(url) {
    const qrcodeDiv = document.getElementById("qrcode");
    qrcodeDiv.innerHTML = '';
    setTimeout(() => {
        new QRCode(qrcodeDiv, {
            text: url,
            width: 200,
            height: 200,
            colorDark: "#1a1a2e",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }, 100);
}

function updateQrServerUrl() {
    const input = document.getElementById('qrServerUrl');
    let url = input.value.trim();

    if (!url) {
        showToast('Veuillez entrer une URL', 'error');
        return;
    }

    if (!url.startsWith('http')) {
        url = 'http://' + url;
    }

    saveServerUrl(url);
    showToast('URL mise à jour ! QR code régénéré.', 'success');

    if (currentQRGuest) {
        const newQrUrl = `${url}/scan.html?id=${currentQRGuest.id}`;
        generateQRCode(newQrUrl);
        const urlDisplay = document.querySelectorAll('.qr-info-value')[3];
        if (urlDisplay) urlDisplay.textContent = newQrUrl;
    }
}

function downloadQR() {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    const displayName = currentQRGuest.status === 'Couple'
        ? currentQRGuest.nom
        : `${currentQRGuest.nom}_${currentQRGuest.prenom || ''}`;
    link.download = `QR_${displayName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('Code QR téléchargé', 'success');
}

// function sendWhatsApp() {
//     if (!currentQRGuest || !currentQRGuest.phone) {
//         showToast('Aucun numéro WhatsApp disponible', 'error');
//         return;
//     }

//     const canvas = document.querySelector('#qrcode canvas');
//     if (!canvas) return;

//     const link = document.createElement('a');
//     const displayName = currentQRGuest.status === 'Couple'
//         ? currentQRGuest.nom
//         : `${currentQRGuest.nom}_${currentQRGuest.prenom || ''}`;
//     link.download = `QR_${displayName}.png`;
//     link.href = canvas.toDataURL('image/png');
//     link.click();

//     const phone = currentQRGuest.phone.replace(/\D/g, '');
//     const message = encodeURIComponent(`Bonjour, voici votre code QR pour le mariage. Table: ${currentQRGuest.table}`);
//     const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

//     setTimeout(() => {
//         window.open(whatsappUrl, '_blank');
//     }, 500);

//     showToast('QR téléchargé. WhatsApp va s\'ouvrir...', 'info');
// }

function sendWhatsApp() {
    if (!currentQRGuest || !currentQRGuest.phone) {
        showToast('Aucun numéro WhatsApp disponible', 'error');
        return;
    }

    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) return;

    // Télécharge le QR code automatiquement
    const link = document.createElement('a');
    const displayName = currentQRGuest.status === 'Couple'
        ? currentQRGuest.nom
        : `${currentQRGuest.nom}_${currentQRGuest.prenom || ''}`;
    link.download = `QR_${displayName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    const phone = currentQRGuest.phone.replace(/\D/g, '');

    // 📝 Format du message : "Bonjour + statut + prénom" (prénom uniquement pour Monsieur/Madame/Mademoiselle)
    let salutation;
    if (currentQRGuest.status === 'Couple') {
        salutation = `Bonjour ${currentQRGuest.status} ${currentQRGuest.nom}`.trim();
    } else {
        salutation = `Bonjour ${currentQRGuest.status} ${currentQRGuest.prenom} ${currentQRGuest.nom}`.trim();
    }

    const message = encodeURIComponent(
        `${salutation},\n` +
        `Voici votre QR code pour le mariage.\n\n` +
        `Table : ${currentQRGuest.table}`
    );

    const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

    setTimeout(() => {
        window.open(whatsappUrl, '_blank');
    }, 500);

    showToast('QR téléchargé. WhatsApp va s\'ouvrir...', 'info');
}

// ===== EDIT GUEST =====
function editGuest(id) {
    const guest = guests.find(g => g.id === id);
    if (!guest) return;

    editingId = id;
    document.getElementById('guestStatus').value = guest.status;
    document.getElementById('guestNom').value = guest.nom;
    document.getElementById('guestPrenom').value = guest.prenom || '';
    document.getElementById('guestLink').value = guest.link;
    document.getElementById('guestIsChristian').value = guest.isChristian || ''; // Nouveau
    document.getElementById('guestPhone').value = guest.phone || '';

    updateTableSelect();
    document.getElementById('guestTable').value = guest.table;

    document.querySelector('#guestModal .modal-title').innerHTML = '<i class="fas fa-pen" style="color:var(--accent);margin-right:8px;"></i>Modifier un invité';
    document.getElementById('guestModal').classList.add('active');
}

// ===== DELETE GUEST =====
async function deleteGuest(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet invité ?')) return;
    guests = guests.filter(g => g.id !== id);
    await saveToStorage();
    const totalPages = Math.ceil(getSortedGuests().length / itemsPerPage);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    renderTable();
    updateStats();
    showToast('Invité supprimé', 'info');
}

// ===== TOAST =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${icons[type]}"></i></div>
        <div class="toast-text">${message}</div>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

let html5QrCode = null;

function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function openMobileScanner() {
    const modal = document.getElementById('scannerModal');
    modal.classList.add('active');

    // Délai pour laisser le DOM s'afficher
    setTimeout(() => {
        startScanner();
    }, 300);
}

function closeScanner() {
    const modal = document.getElementById('scannerModal');
    modal.classList.remove('active');

    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
        }).catch(err => console.error('Erreur stop scanner:', err));
    }

    // Reset l'affichage
    document.getElementById('reader').style.display = 'block';
    document.getElementById('scannerResult').style.display = 'none';
}

function startScanner() {
    const reader = document.getElementById('reader');

    html5QrCode = new Html5Qrcode("reader");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    html5QrCode.start(
        { facingMode: "environment" }, // Caméra arrière
        config,
        onScanSuccess,
        onScanFailure
    ).catch(err => {
        console.error('Erreur démarrage scanner:', err);
        showToast('Impossible d\'accéder à la caméra. Vérifiez les permissions.', 'error');
    });
}

function onScanSuccess(decodedText, decodedResult) {
    console.log('QR scanné:', decodedText);

    // Arrête le scanner
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
        });
    }

    // Cache le lecteur, montre le résultat
    document.getElementById('reader').style.display = 'none';
    document.getElementById('scannerResult').style.display = 'block';
    document.getElementById('scannerResultText').textContent = decodedText;

    // Extrait l'ID de l'URL du QR
    let guestId = null;
    try {
        const url = new URL(decodedText);
        guestId = url.searchParams.get('id');
    } catch (e) {
        // Si ce n'est pas une URL, essaie de parser directement
        const match = decodedText.match(/[?&]id=(\d+)/);
        if (match) guestId = match[1];
    }

    if (guestId) {
        setTimeout(() => {
            closeScanner();
            // Redirige vers scan.html avec l'ID
            window.location.href = `scan.html?id=${guestId}`;
        }, 800);
    } else {
        showToast('QR Code invalide', 'error');
        setTimeout(() => {
            document.getElementById('reader').style.display = 'block';
            document.getElementById('scannerResult').style.display = 'none';
            startScanner();
        }, 1500);
    }
}

function onScanFailure(error) {
    // Échec de scan = normal, on ignore
    // console.warn('Scan échoué:', error);
}

async function testConnection() {
    const serverUrl = getServerUrl();
    const testUrl = `${serverUrl}/guests?t=${Date.now()}`;

    showToast('Test de connexion...', 'info');

    try {
        const start = Date.now();
        const response = await fetch(testUrl, { method: 'GET' });
        const duration = Date.now() - start;

        if (response.ok) {
            const data = await response.json();
            showToast(`✅ OK! ${data.length} invités en ${duration}ms`, 'success');
        } else {
            showToast(`❌ HTTP ${response.status}`, 'error');
        }
    } catch (e) {
        showToast(`❌ Erreur: ${e.message}`, 'error');
        console.error(e);
    }
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);
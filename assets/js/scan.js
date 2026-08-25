console.log('=== SCAN.JS CHARGÉ ===');

function getServerUrl() {
    const savedUrl = localStorage.getItem('weddingServerUrl');
    const onLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Garde-fou auto-réparateur : si une URL "localhost" a été enregistrée
    // par erreur (ex: pré-remplissage d'une bannière avant correction) alors
    // qu'on n'est manifestement pas sur le PC lui-même, on l'ignore et on
    // l'efface, plutôt que de rester bloqué dessus indéfiniment.
    if (savedUrl && savedUrl.includes('localhost') && !onLocalhost) {
        console.warn('URL serveur "localhost" invalide sur cet appareil — réinitialisation automatique.');
        localStorage.removeItem('weddingServerUrl');
    } else if (savedUrl) {
        return savedUrl;
    }

    // Si la page est chargée depuis le serveur réseau (cas du téléphone qui a
    // scanné le QR code), on réutilise cette même origine au lieu de localhost.
    if (window.location.protocol.startsWith('http') && window.location.host) {
        return window.location.origin;
    }
    return 'http://localhost:3000';
}

let currentScannedGuest = null;

// ===== INDEXEDDB =====
const DB_NAME = 'WeddingDB';
const DB_VERSION = 1;
let db = null;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('data')) {
                database.createObjectStore('data', { keyPath: 'key' });
            }
        };
    });
}

async function loadGuestsFromIndexedDB() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('data', 'readonly');
        const store = tx.objectStore('data');
        const request = store.get('weddingGuests');
        request.onsuccess = () => {
            if (request.result) {
                resolve(JSON.parse(request.result.value));
            } else {
                resolve([]);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function saveGuestsToIndexedDB(guests) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('data', 'readwrite');
        const store = tx.objectStore('data');
        const request = store.put({ key: 'weddingGuests', value: JSON.stringify(guests) });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ===== CHARGEMENT SERVEUR =====
async function loadGuestsFromServer() {
    const url = `${getServerUrl()}/guests?t=${Date.now()}`;
    console.log('loadGuestsFromServer - URL:', url);

    const response = await fetch(url);
    console.log('loadGuestsFromServer - status:', response.status);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const guests = JSON.parse(text);
    console.log('loadGuestsFromServer - count:', guests.length);

    await saveGuestsToIndexedDB(guests);
    return guests;
}

async function loadGuests() {
    // 1. Essaie IndexedDB d'abord
    const localGuests = await loadGuestsFromIndexedDB();
    console.log('loadGuests - IndexedDB:', localGuests.length);

    if (localGuests.length > 0) {
        return localGuests;
    }

    // 2. Sinon essaie le serveur
    try {
        return await loadGuestsFromServer();
    } catch (e) {
        console.error('loadGuests - serveur erreur:', e.message);
        return [];
    }
}

async function saveGuests(guests) {
    await saveGuestsToIndexedDB(guests);
    const url = getServerUrl();
    // On vérifie explicitement que le serveur a bien reçu et accepté les
    // données. Avant, une erreur HTTP (500, etc.) ou un fetch mal résolu
    // passait inaperçue : le mobile croyait avoir synchronisé, mais le
    // serveur gardait l'ancienne donnée, donc le PC ne voyait jamais le
    // changement de présence malgré une synchronisation.
    let response;
    try {
        response = await fetch(`${url}/guests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guests)
        });
    } catch (e) {
        // On enrichit l'erreur avec l'URL réellement visée, pour diagnostiquer
        // immédiatement (mauvaise IP enregistrée vs. vraie coupure réseau).
        throw new Error(`${e.message} — URL visée: ${url}`);
    }
    if (!response.ok) {
        throw new Error(`Le serveur a refusé la sauvegarde (HTTP ${response.status}) — URL: ${url}`);
    }
}

// ===== AFFICHAGE =====
function displayGuestInfo(guest) {
    const presentText = guest.present ? 'Présent' : 'Attend';
    const presentColor = guest.present ? '#58d68d' : '#aab7b8';

    const displayName = guest.status === 'Couple'
        ? guest.nom.toUpperCase()
        : `${guest.nom.toUpperCase()} ${guest.prenom || ''}`.trim();

    document.getElementById('scannerResultInfo').innerHTML = `
        <p><span>Nom</span><span>${displayName}</span></p>
        <p><span>Statut</span><span>${guest.status}</span></p>
        <p><span>Table</span><span>${guest.table}</span></p>
        <p><span>Lien</span><span>${guest.link}</span></p>
        <p><span>Places</span><span>${guest.status === 'Couple' ? '2' : '1'}</span></p>
        <p><span>Présence actuelle</span><span style="color:${presentColor};font-weight:700;">${presentText}</span></p>
    `;

    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('scannerResult').style.display = 'block';
}

function showError() {
    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('scannerResult').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'block';
}

function goToIndex() {
    window.location.href = 'index.html';
}

// ===== ACTIONS =====
async function markPresent() {
    if (!currentScannedGuest) return;
    const guests = await loadGuestsFromIndexedDB();
    const idx = guests.findIndex(g => g.id === currentScannedGuest.id);
    if (idx === -1) return;

    guests[idx].present = true;
    try {
        await saveGuests(guests);
    } catch (e) {
        // Le serveur n'a PAS confirmé la sauvegarde : on prévient clairement
        // au lieu de rediriger comme si tout allait bien, pour ne pas perdre
        // silencieusement le changement de présence.
        showToast(`Échec de la synchronisation avec le serveur (${e.message}). Réessayez.`, 'error');
        return;
    }

    currentScannedGuest = guests[idx];
    displayGuestInfo(guests[idx]);
    showToast(`${guests[idx].nom} marqué comme Présent !`, 'success');

    // Retour à l'accueil une fois la présence confirmée synchronisée avec le
    // serveur, après un court délai pour laisser voir la confirmation.
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1200);
}

async function markAbsent() {
    if (!currentScannedGuest) return;
    const guests = await loadGuestsFromIndexedDB();
    const idx = guests.findIndex(g => g.id === currentScannedGuest.id);
    if (idx === -1) return;

    guests[idx].present = false;
    try {
        await saveGuests(guests);
    } catch (e) {
        showToast(`Échec de la synchronisation avec le serveur (${e.message}). Réessayez.`, 'error');
        return;
    }

    showToast(`${guests[idx].nom} marqué comme Attend`, 'info');
    currentScannedGuest = guests[idx];
    displayGuestInfo(guests[idx]);
}

// ===== INITIALISATION =====
async function initScan() {
    console.log('initScan appelé');
    await openDB();

    const urlParams = new URLSearchParams(window.location.search);
    const guestId = parseInt(urlParams.get('id'));
    console.log('ID depuis URL:', guestId);

    if (!guestId || isNaN(guestId)) {
        showError();
        return;
    }

    document.getElementById('scanInput').value = guestId;

    // Charge les données
    const guests = await loadGuests();
    console.log('Total guests:', guests.length);

    if (guests.length === 0) {
        // Pas de données - affiche le bouton retour
        showError();
        return;
    }

    const guest = guests.find(g => g.id === guestId);
    console.log('Invité trouvé:', guest);

    if (!guest) {
        showError();
        return;
    }

    currentScannedGuest = guest;
    displayGuestInfo(guest);
}

// ===== TOAST =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i></div>
        <div class="toast-text">${message}</div>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DOMContentLoaded ===');
    initScan();
});
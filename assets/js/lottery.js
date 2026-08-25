// ===== CONSTANTES & VARIABLES GENERALES =====
const DB_NAME = 'WeddingDB';
const DB_VERSION = 1;
let db = null;
let dbReady = false;
let guests = [];

// ===== INDEXEDDB =====
function openDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error("IndexedDB non supporté"));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (event) => reject(event.target.error);
        request.onsuccess = (event) => {
            db = event.target.result;
            dbReady = true;
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

async function loadFromIndexedDB(key, defaultValue) {
    if (!dbReady || !db) await openDB();

    return new Promise((resolve) => {
        try {
            const tx = db.transaction('data', 'readonly');
            const store = tx.objectStore('data');
            const request = store.get(key);

            request.onsuccess = () => {
                if (request.result) {
                    try {
                        resolve(JSON.parse(request.result.value));
                    } catch (e) {
                        resolve(defaultValue);
                    }
                } else {
                    resolve(defaultValue);
                }
            };
            request.onerror = () => resolve(defaultValue);
        } catch (err) {
            resolve(defaultValue);
        }
    });
}

function getServerUrl() {
    const savedUrl = localStorage.getItem('weddingServerUrl');
    const onLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (savedUrl && savedUrl.includes('localhost') && !onLocalhost) {
        localStorage.removeItem('weddingServerUrl');
    } else if (savedUrl) {
        return savedUrl;
    }

    if (window.location.protocol.startsWith('http') && window.location.host) {
        return window.location.origin;
    }
    return 'http://localhost:3000';
}

async function loadGuests() {
    try {
        const savedGuests = await loadFromIndexedDB('weddingGuests', null);
        if (savedGuests) {
            guests = savedGuests;
        } else {
            const response = await fetch(`${getServerUrl()}/guests?t=${Date.now()}`);
            if (response.ok) {
                guests = await response.json();
            }
        }
    } catch (e) {
        console.error("Erreur de chargement des invités:", e);
        guests = [];
    }
}

// ===== ÉLIGIBILITÉ & TIRAGE AU SORT =====

function getEligibleGuests() {
    const validLinks = ["Parent", "Ami", "Collègue", "Connaissance"];
    return guests.filter(g => {
        const isPresent = g.present === true;
        const isNonChristian = g.isChristian === "Non";
        const isValidLink = validLinks.includes(g.link);
        return isPresent && isNonChristian && isValidLink;
    });
}

// ===== SEQUENCE DU TIRAGE =====

function startLotterySequence() {
    const eligibleGuests = getEligibleGuests();

    if (eligibleGuests.length === 0) {
        showToast('Aucun invité présent et éligible pour le tirage !', 'error');
        return;
    }

    // Basculer l'affichage vers le loader
    document.getElementById('initialState').classList.add('hidden');
    document.getElementById('winnerState').classList.add('hidden');
    document.getElementById('loaderState').classList.remove('hidden');

    let secondsLeft = 10;
    const countdownEl = document.getElementById('countdown');
    const progressBar = document.getElementById('progressBar');

    countdownEl.textContent = secondsLeft;
    progressBar.style.width = '0%';

    // Animation de décompte de 10 secondes
    const interval = setInterval(() => {
        secondsLeft--;
        countdownEl.textContent = secondsLeft;
        progressBar.style.width = `${((10 - secondsLeft) / 10) * 100}%`;

        if (secondsLeft <= 0) {
            clearInterval(interval);
            // Sélectionner le gagnant et l'afficher
            const randomIndex = Math.floor(Math.random() * eligibleGuests.length);
            const winner = eligibleGuests[randomIndex];
            displayWinner(winner);
        }
    }, 1000);
}

function displayWinner(winner) {
    document.getElementById('loaderState').classList.add('hidden');
    document.getElementById('winnerState').classList.remove('hidden');

    // Mise à jour des informations
    document.getElementById('winnerStatut').textContent = winner.status || 'Seul';
    document.getElementById('winnerNom').textContent = winner.nom ? winner.nom.toUpperCase() : '-';

    // Si le statut n'est pas "Couple", afficher le prénom
    const prenomContainer = document.getElementById('prenomContainer');
    if (winner.status === 'Couple') {
        prenomContainer.style.display = 'none';
    } else {
        prenomContainer.style.display = 'flex';
        document.getElementById('winnerPrenom').textContent = winner.prenom || '-';
    }

    document.getElementById('winnerTable').textContent = winner.table ? `Table N° ${winner.table}` : 'Non assignée';
}

function resetLotteryUI() {
    document.getElementById('winnerState').classList.add('hidden');
    document.getElementById('loaderState').classList.add('hidden');
    document.getElementById('initialState').classList.remove('hidden');
}

// ===== TOAST =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };

    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${icons[type] || 'fa-info-circle'}"></i></div>
        <div class="toast-text">${message}</div>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    await openDB();
    await loadGuests();
});
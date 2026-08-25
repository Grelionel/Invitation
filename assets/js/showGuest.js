// ===== SHOW GUEST PAGE =====

const DISPLAY_TIMEOUT = 10000;

let displayTimer = null;
let lastPresentGuestsIds = []; // Stocke les IDs des invités déjà traités

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

function getServerUrl() {
    const savedUrl = localStorage.getItem('weddingServerUrl');
    const onLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (savedUrl && savedUrl.includes('localhost') && !onLocalhost) {
        console.warn('URL serveur "localhost" invalide sur cet appareil — réinitialisation automatique.');
        localStorage.removeItem('weddingServerUrl');
    } else if (savedUrl) {
        return savedUrl;
    }

    if (window.location.protocol.startsWith('http') && window.location.host) {
        return window.location.origin;
    }
    return 'http://localhost:3000';
}

async function loadGuestsFromStorage() {
    const guests = await loadGuestsFromIndexedDB();
    return guests;
}

// Repasse à l'affichage de la carte d'embarquement (Boarding Card)
function showWaitingState() {
    document.getElementById('guestScreen').classList.add('hidden');
    document.getElementById('waitingScreen').classList.remove('hidden');
}

// Affiche les détails du scan et lance le compte à rebours de 10 secondes
function showGuestInfo(guest) {
    if (displayTimer) {
        clearTimeout(displayTimer);
        displayTimer = null;
    }

    // Sélection de l'icône de profil appropriée
    const statusIcon = {
        'Couple': 'fa-heart',
        'Monsieur': 'fa-male',
        'Madame': 'fa-female',
        'Mademoiselle': 'fa-female'
    }[guest.status] || 'fa-user';

    const displayName = guest.status === 'Couple'
        ? guest.nom.toUpperCase()
        : `${guest.nom.toUpperCase()} ${guest.prenom || ''}`.trim();

    // Attribution dynamique du contenu
    document.getElementById('showGuestIcon').innerHTML = `<i class="fas ${statusIcon}"></i>`;
    document.getElementById('showGuestName').textContent = displayName;
    document.getElementById('showGuestStatus').textContent = guest.status;
    document.getElementById('showGuestTable').textContent = guest.table;
    document.getElementById('showGuestLink').textContent = guest.link;
    document.getElementById('showGuestSeats').textContent = guest.status === 'Couple' ? '2 places' : '1 place';
    document.getElementById('showGuestId').textContent = `#${guest.id.toString().padStart(2, '0')}`;

    const presentEl = document.getElementById('showGuestPresent');
    if (guest.present) {
        presentEl.className = 'show-guest-present present-true';
        presentEl.innerHTML = '<i class="fas fa-check-circle"></i> Présent';
    } else {
        presentEl.className = 'show-guest-present present-false';
        presentEl.innerHTML = '<i class="fas fa-hourglass-half"></i> Attend';
    }

    // Gestion du basculement visuel des écrans
    document.getElementById('waitingScreen').classList.add('hidden');
    document.getElementById('guestScreen').classList.remove('hidden');

    // Déclenche le compte à rebours pour réafficher la carte d'embarquement
    displayTimer = setTimeout(() => {
        showWaitingState();
    }, DISPLAY_TIMEOUT);
}

async function syncFromServer() {
    try {
        const response = await fetch(`${getServerUrl()}/guests?t=${Date.now()}`);
        const guests = await response.json();

        // Récupère l'ancienne liste locale pour comparer les changements de présence
        const oldGuests = await loadGuestsFromStorage();

        // Sauvegarde dans IndexedDB
        if (!db) await openDB();
        const tx = db.transaction('data', 'readwrite');
        const store = tx.objectStore('data');
        await store.put({ key: 'weddingGuests', value: JSON.stringify(guests) });

        // Initialisation de la liste au premier chargement pour ne pas afficher le passé
        if (oldGuests.length === 0) {
            lastPresentGuestsIds = guests.filter(g => g.present).map(g => g.id);
            return;
        }

        // Détection de l'invité qui vient d'être marqué présent
        const newlyScannedGuest = guests.find(guest => {
            const oldGuest = oldGuests.find(og => og.id === guest.id);
            return guest.present && (!oldGuest || !oldGuest.present || !lastPresentGuestsIds.includes(guest.id));
        });

        if (newlyScannedGuest) {
            if (!lastPresentGuestsIds.includes(newlyScannedGuest.id)) {
                lastPresentGuestsIds.push(newlyScannedGuest.id);
            }
            showGuestInfo(newlyScannedGuest);
        }
    } catch (e) {
        console.log('Erreur sync:', e);
    }
}

// ===== SLIDESHOW PHOTOS =====
// Slide automatique des photos dans le waitingScreen
// Indépendant du scan — ne s'interrompt jamais

const SLIDE_INTERVAL = 5000; // 5 secondes par photo
const SLIDE_FOLDER = 'assets/img/slide/';
const SLIDE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const MAX_SLIDE_IMAGES = 50; // Nombre max de photos à scanner

let slideTimer = null;
let slideImages = [];
let currentSlideIndex = 0;

// Détecte dynamiquement les images disponibles dans le dossier slide
async function discoverSlideImages() {
    const images = [];
    for (let i = 1; i <= MAX_SLIDE_IMAGES; i++) {
        for (const ext of SLIDE_EXTENSIONS) {
            const url = `${SLIDE_FOLDER}${i}${ext}`;
            try {
                const response = await fetch(url, { method: 'HEAD' });
                if (response.ok) {
                    images.push(url);
                    break; // Passe au numéro suivant
                }
            } catch (e) {
                // Image non trouvée, essaie l'extension suivante
            }
        }
    }
    return images;
}

// Mélange un tableau aléatoirement (Fisher-Yates)
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Change la photo affichée avec une transition douce
function changeSlide() {
    if (slideImages.length === 0) return;

    const imgEl = document.querySelector('#waitingScreen .photo-placeholder img');
    if (!imgEl) return;

    currentSlideIndex = (currentSlideIndex + 1) % slideImages.length;
    const nextImage = slideImages[currentSlideIndex];

    // Précharge l'image suivante pour éviter le flash blanc
    const preloadImg = new Image();
    preloadImg.src = nextImage;
    preloadImg.onload = () => {
        imgEl.style.opacity = '0';
        setTimeout(() => {
            imgEl.src = nextImage;
            imgEl.style.opacity = '1';
        }, 300);
    };
}

// Démarre le slideshow
function startSlideshow() {
    if (slideTimer) clearInterval(slideTimer);
    slideTimer = setInterval(changeSlide, SLIDE_INTERVAL);
}

// Arrête le slideshow (si besoin)
function stopSlideshow() {
    if (slideTimer) {
        clearInterval(slideTimer);
        slideTimer = null;
    }
}

// Initialise le slideshow au chargement
async function initSlideshow() {
    // Découverte des images
    slideImages = await discoverSlideImages();

    if (slideImages.length === 0) {
        console.warn('Aucune image trouvée dans', SLIDE_FOLDER);
        return;
    }

    // Mélange aléatoire
    slideImages = shuffleArray(slideImages);
    currentSlideIndex = 0;

    // Affiche la première image
    const imgEl = document.querySelector('#waitingScreen .photo-placeholder img');
    if (imgEl) {
        imgEl.src = slideImages[0];
        imgEl.style.transition = 'opacity 0.3s ease-in-out';
        imgEl.style.opacity = '1';
    }

    // Démarre le cycle automatique
    startSlideshow();
    console.log('Slideshow démarré avec', slideImages.length, 'images');
}

async function initShowGuest() {
    await openDB();
    showWaitingState();

    // Initialise le slideshow (indépendant du scan)
    initSlideshow();

    // Premier rafraîchissement immédiat
    await syncFromServer();

    // Écoute dynamique toutes les 2 secondes
    setInterval(syncFromServer, 2000);
}

document.addEventListener('DOMContentLoaded', initShowGuest);
#Aller sur le projet

- cd Billet/Invitation/assets/js

#lancer la commande :

- node server.js

#Recupérer l'accès réseau

- http://192.168.1.64:3000

#Modifiez SERVER_URL dans les deux fichiers JS

- Scan.js
- ShowGust.js
  const SERVER_URL = 'http://192.168.1.XXX:3000' => const SERVER_URL = 'http://192.168.1.64:3000';
  1. Connectez le PC au WiFi du lieu

2. Ouvrez un terminal :
   cd INVITATION
   node server.js

   → Affiche l'IP réseau : http://192.168.0.123:3000

3. Sur le PC, ouvrez index.html
4. Cliquez sur un QR code d'invité
5. Dans le modal, collez l'IP : http://192.168.0.123:3000
6. Cliquez "Mettre à jour l'URL"
7. Téléchargez les QR codes → imprimez

8. Sur le téléphone : connectez-vous au MÊME WiFi
9. Scannez le QR → redirige vers scan.html?id=X
10. Validez "Présent" → l'écran showGuest affiche l'invité 10s

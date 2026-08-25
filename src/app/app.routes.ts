import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Gestion des Invités - Mariage',
    loadComponent: () => import('./features/guests/guests-page').then((m) => m.GuestsPage),
  },
  {
    path: 'scan',
    title: 'Validation Présence - Mariage',
    loadComponent: () => import('./features/scan/scan-page').then((m) => m.ScanPage),
  },
  {
    path: 'lottery',
    title: 'Tirage au Sort - Mariage',
    loadComponent: () => import('./features/lottery/lottery-page').then((m) => m.LotteryPage),
  },
  {
    path: 'display',
    title: "Écran d'accueil - Mariage",
    loadComponent: () => import('./features/display/display-page').then((m) => m.DisplayPage),
  },
  { path: '**', redirectTo: '' },
];

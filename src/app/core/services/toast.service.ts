import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly type: ToastType;
}

const VISIBLE_MS = 3000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly items = signal<readonly Toast[]>([]);

  readonly toasts = this.items.asReadonly();

  show(message: string, type: ToastType = 'info'): void {
    const toast: Toast = { id: this.nextId++, message, type };
    this.items.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), VISIBLE_MS);
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }
}

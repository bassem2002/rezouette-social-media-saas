import { Injectable, signal } from '@angular/core';

type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const TOAST_DURATION_MS = 3500;

/// Service de notification centralisé (remplace `react-hot-toast`).
/// Singleton applicatif (logique d'état) → il vit dans `core/services`, pas
/// dans `shared/` qui doit rester 100 % présentationnel.
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastItem[]>([]);
  private seq = 0;

  success(message: string): void {
    this.push('success', message);
  }
  error(message: string): void {
    this.push('error', message);
  }
  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    this.toasts.update((items) => items.filter((t) => t.id !== id));
  }

  private push(type: ToastType, message: string): void {
    const id = ++this.seq;
    this.toasts.update((items) => [...items, { id, type, message }]);
    setTimeout(() => this.dismiss(id), TOAST_DURATION_MS);
  }
}

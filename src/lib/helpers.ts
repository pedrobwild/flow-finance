import { Transaction, TransactionStatus } from './types';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
}

export function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function isToday(dateStr: string): boolean {
  return dateStr === todayISO();
}

export function isPast(dateStr: string): boolean {
  return dateStr < todayISO();
}

export function isWithinDays(dateStr: string, days: number): boolean {
  const today = todayISO();
  const target = addDays(today, days);
  return dateStr >= today && dateStr <= target;
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T12:00:00');
  const b = new Date(to + 'T12:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeStatus(tx: Transaction): TransactionStatus {
  if (tx.status === 'confirmado' || tx.paidAt) return 'confirmado';
  const today = todayISO();
  if (tx.dueDate < today) return 'atrasado';
  const daysUntilDue = daysBetween(today, tx.dueDate);
  if (daysUntilDue <= 5) return 'pendente';
  return tx.status === 'atrasado' ? 'previsto' : tx.status;
}

export function getWeekdayName(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date);
}

export function getDayMonth(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}

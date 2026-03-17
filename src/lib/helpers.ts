import { Bill } from './types';

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
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0];
}

export function isWithinDays(dateStr: string, days: number): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T12:00:00');
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

export function isPast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T12:00:00') < today;
}

export function getDueBills(bills: Bill[], days: number): Bill[] {
  return bills
    .filter(b => b.status !== 'pago' && isWithinDays(b.dueDate, days))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getOverdueBills(bills: Bill[]): Bill[] {
  return bills
    .filter(b => b.status === 'atrasado' || (b.status !== 'pago' && isPast(b.dueDate)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getTotalByStatus(bills: Bill[], status: string): number {
  return bills.filter(b => b.status === status).reduce((sum, b) => sum + b.amount, 0);
}

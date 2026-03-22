/**
 * Pure (context-free) logic extracted from useWarRoom for testability.
 */
import type { Transaction, TransactionType } from '@/lib/types';
import { addDays, formatCurrency, getDayMonth, daysBetween, formatDateFull } from '@/lib/helpers';
import type { CrisisData, WarAction } from './useWarRoom';

// ── Crisis Detection ────────────────────────────────────────────────

export interface CrisisInput {
  today: string;
  balance: number;
  transactions: Transaction[];
  /** Returns the projected balance at a given date string */
  projectedBalance: (date: string) => number;
}

export function detectCrisis(input: CrisisInput): CrisisData {
  const { today, balance, transactions: txs, projectedBalance } = input;

  let negDate: string | null = null;
  let negDays: number | null = null;
  let minBal = balance;
  let minDate = today;

  for (let i = 0; i <= 90; i++) {
    const date = addDays(today, i);
    const projected = projectedBalance(date);
    if (projected < minBal) { minBal = projected; minDate = date; }
    if (projected < 0 && negDate === null) { negDate = date; negDays = i; }
  }

  const deficit = minBal < 0 ? Math.abs(minBal) : 0;
  const overdueRec = txs.filter(t => t.type === 'receber' && t.status === 'atrasado');
  const totalOverdue = overdueRec.reduce((s, t) => s + t.amount, 0);
  const overduePayables = txs.filter(t => t.type === 'pagar' && t.status === 'atrasado');
  const totalOverduePay = overduePayables.reduce((s, t) => s + t.amount, 0);

  const upcomingPayables = txs
    .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && (negDate ? t.dueDate <= negDate : t.dueDate <= addDays(today, 30)))
    .reduce((s, t) => s + t.amount, 0);
  const pendingReceivables = txs
    .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && (negDate ? t.dueDate <= negDate : t.dueDate <= addDays(today, 30)))
    .reduce((s, t) => s + t.amount, 0);

  const next30Out = txs.filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 30)).reduce((s, t) => s + t.amount, 0);
  const next30In = txs.filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 30)).reduce((s, t) => s + t.amount, 0);
  const netBurn = next30Out - next30In;
  const avgDaily = netBurn / 30;
  const runwayDays = avgDaily > 0 && balance > 0 ? Math.floor(balance / avgDaily) : null;

  return {
    negDate, negDays, minBal, minDate, deficit, currentBalance: balance,
    totalOverdue, totalOverduePay, upcomingPayables, pendingReceivables,
    overdueRecCount: overdueRec.length, overduePayCount: overduePayables.length,
    runwayDays, avgDailyBurn: avgDaily, netBurn, next30Out, next30In,
    hasCrisis: negDate !== null || minBal < balance * 0.1,
  };
}

// ── Crisis Context String ───────────────────────────────────────────

export function buildCrisisContext(crisis: CrisisData): string {
  if (crisis.negDate) {
    return `O caixa da empresa ficará NEGATIVO em ${crisis.negDays} dias (${formatDateFull(crisis.negDate)}).
Déficit projetado: ${formatCurrency(crisis.deficit)}.
Saldo atual: ${formatCurrency(crisis.currentBalance)}.
Recebíveis atrasados: ${formatCurrency(crisis.totalOverdue)} (${crisis.overdueRecCount} transações).
Pagáveis atrasados: ${formatCurrency(crisis.totalOverduePay)} (${crisis.overduePayCount} transações).
Saídas pendentes até D-Day: ${formatCurrency(crisis.upcomingPayables)}.
Entradas previstas até D-Day: ${formatCurrency(crisis.pendingReceivables)}.
Runway estimado: ${crisis.runwayDays ?? '∞'} dias.`;
  }
  return `O caixa NÃO ficará negativo nos próximos 90 dias.
Saldo atual: ${formatCurrency(crisis.currentBalance)}.
Ponto mais apertado: ${formatCurrency(crisis.minBal)} em ${getDayMonth(crisis.minDate)}.
Recebíveis atrasados: ${formatCurrency(crisis.totalOverdue)} (${crisis.overdueRecCount} transações).
Pagáveis atrasados: ${formatCurrency(crisis.totalOverduePay)} (${crisis.overduePayCount} transações).
Runway estimado: ${crisis.runwayDays ?? '∞'} dias.
Queima líquida 30d: ${formatCurrency(crisis.netBurn)}.
Saídas próximos 30d: ${formatCurrency(crisis.next30Out)}.
Entradas próximos 30d: ${formatCurrency(crisis.next30In)}.
O CEO quer saber o que pode fazer para MELHORAR a situação, OTIMIZAR prazos e PROTEGER o caixa.`;
}

// ── Resolve Action Prefill ──────────────────────────────────────────

export function resolveActionPrefillPure(
  action: WarAction,
  obras: { code: string; id: string }[],
): { type: TransactionType; description?: string; counterpart?: string; amount?: number; category?: string; notes?: string; obraId?: string } | null {
  if (!action.prefill) return null;
  const p = action.prefill;
  const obraId = p.obraCode ? obras.find(o => o.code === p.obraCode)?.id : undefined;
  return {
    type: p.type || 'pagar',
    description: p.description,
    counterpart: p.counterpart,
    amount: p.amount,
    category: p.category,
    notes: p.notes,
    obraId,
  };
}

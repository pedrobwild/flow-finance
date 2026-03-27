import { describe, it, expect } from 'vitest';
import { detectCrisis, buildCrisisContext, resolveActionPrefillPure } from '../useWarRoom.logic';
import type { Transaction } from '@/lib/types';
import type { WarAction } from '../useWarRoom';
import { addDays } from '@/lib/helpers';

// ── Helpers ─────────────────────────────────────────────────────────

const TODAY = '2026-03-22';

function makeTx(overrides: Partial<Transaction> & { type: Transaction['type']; dueDate: string }): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    description: 'test',
    counterpart: '',
    amount: 0,
    paidAt: null,
    status: 'pendente',
    costCenter: 'Operação',
    category: 'Outros',
    recurrence: 'única',
    paymentMethod: '',
    notes: '',
    priority: 'normal',
    obraId: null,
    billingSentAt: null,
    billingCount: 0,
    attachmentUrl: null,
    receiptUrl: null,
    cdiAdjustable: false,
    cdiPercentage: null,
    baseAmount: null,
    baseDate: null,
    ...overrides,
  };
}

// ── detectCrisis ────────────────────────────────────────────────────

describe('detectCrisis', () => {
  it('detects no crisis when balance stays positive', () => {
    const result = detectCrisis({
      today: TODAY,
      balance: 50000,
      transactions: [],
      projectedBalance: () => 50000,
    });

    expect(result.hasCrisis).toBe(false);
    expect(result.negDate).toBeNull();
    expect(result.negDays).toBeNull();
    expect(result.deficit).toBe(0);
    expect(result.currentBalance).toBe(50000);
  });

  it('detects crisis when projection goes negative', () => {
    const crisisDay = addDays(TODAY, 15);
    const result = detectCrisis({
      today: TODAY,
      balance: 10000,
      transactions: [],
      projectedBalance: (date: string) => date >= crisisDay ? -5000 : 10000,
    });

    expect(result.hasCrisis).toBe(true);
    expect(result.negDate).toBe(crisisDay);
    expect(result.negDays).toBe(15);
    expect(result.deficit).toBe(5000);
  });

  it('detects crisis when min balance < 10% of current', () => {
    const lowDay = addDays(TODAY, 10);
    const result = detectCrisis({
      today: TODAY,
      balance: 100000,
      transactions: [],
      projectedBalance: (date: string) => date === lowDay ? 5000 : 100000,
    });

    expect(result.hasCrisis).toBe(true);
    expect(result.negDate).toBeNull(); // never goes negative
    expect(result.minBal).toBe(5000);
    expect(result.minDate).toBe(lowDay);
  });

  it('counts overdue receivables and payables', () => {
    const txs: Transaction[] = [
      makeTx({ type: 'receber', dueDate: '2026-03-15', amount: 3000, status: 'atrasado' }),
      makeTx({ type: 'receber', dueDate: '2026-03-18', amount: 7000, status: 'atrasado' }),
      makeTx({ type: 'pagar', dueDate: '2026-03-10', amount: 2000, status: 'atrasado' }),
    ];

    const result = detectCrisis({
      today: TODAY,
      balance: 50000,
      transactions: txs,
      projectedBalance: () => 50000,
    });

    expect(result.totalOverdue).toBe(10000);
    expect(result.overdueRecCount).toBe(2);
    expect(result.totalOverduePay).toBe(2000);
    expect(result.overduePayCount).toBe(1);
  });

  it('calculates upcoming payables and pending receivables', () => {
    const txs: Transaction[] = [
      makeTx({ type: 'pagar', dueDate: addDays(TODAY, 5), amount: 8000, status: 'pendente' }),
      makeTx({ type: 'pagar', dueDate: addDays(TODAY, 20), amount: 12000, status: 'pendente' }),
      makeTx({ type: 'receber', dueDate: addDays(TODAY, 10), amount: 15000, status: 'pendente' }),
    ];

    const result = detectCrisis({
      today: TODAY,
      balance: 50000,
      transactions: txs,
      projectedBalance: () => 50000,
    });

    expect(result.upcomingPayables).toBe(20000);
    expect(result.pendingReceivables).toBe(15000);
    expect(result.next30Out).toBe(20000);
    expect(result.next30In).toBe(15000);
    expect(result.netBurn).toBe(5000);
  });

  it('calculates runway when net burn is positive', () => {
    const txs: Transaction[] = [
      makeTx({ type: 'pagar', dueDate: addDays(TODAY, 5), amount: 30000, status: 'pendente' }),
    ];

    const result = detectCrisis({
      today: TODAY,
      balance: 60000,
      transactions: txs,
      projectedBalance: () => 60000,
    });

    // netBurn = 30000, avgDaily = 1000, runway = 60
    expect(result.runwayDays).toBe(60);
  });

  it('returns null runway when net burn is zero or negative', () => {
    const txs: Transaction[] = [
      makeTx({ type: 'receber', dueDate: addDays(TODAY, 5), amount: 10000, status: 'pendente' }),
    ];

    const result = detectCrisis({
      today: TODAY,
      balance: 50000,
      transactions: txs,
      projectedBalance: () => 50000,
    });

    expect(result.runwayDays).toBeNull();
  });
});

// ── buildCrisisContext ──────────────────────────────────────────────

describe('buildCrisisContext', () => {
  it('builds crisis context when negDate is set', () => {
    const ctx = buildCrisisContext({
      negDate: '2026-04-10', negDays: 19, minBal: -5000, minDate: '2026-04-10',
      deficit: 5000, currentBalance: 20000, totalOverdue: 3000, totalOverduePay: 1000,
      upcomingPayables: 25000, pendingReceivables: 10000, overdueRecCount: 2, overduePayCount: 1,
      runwayDays: 15, avgDailyBurn: 1333, netBurn: 40000, next30Out: 50000, next30In: 10000,
      hasCrisis: true,
    });

    expect(ctx).toContain('NEGATIVO em 19 dias');
    expect(ctx).toContain('Déficit projetado:');
    expect(ctx).toContain('2 transações');
    expect(ctx).toContain('Runway estimado: 15 dias');
  });

  it('builds proactive context when no crisis', () => {
    const ctx = buildCrisisContext({
      negDate: null, negDays: null, minBal: 15000, minDate: '2026-04-05',
      deficit: 0, currentBalance: 50000, totalOverdue: 0, totalOverduePay: 0,
      upcomingPayables: 20000, pendingReceivables: 25000, overdueRecCount: 0, overduePayCount: 0,
      runwayDays: null, avgDailyBurn: -166, netBurn: -5000, next30Out: 20000, next30In: 25000,
      hasCrisis: false,
    });

    expect(ctx).toContain('NÃO ficará negativo');
    expect(ctx).toContain('MELHORAR a situação');
    expect(ctx).toContain('Saldo atual:');
  });
});

// ── resolveActionPrefillPure ────────────────────────────────────────

describe('resolveActionPrefillPure', () => {
  it('returns null when action has no prefill', () => {
    const action: WarAction = {
      priority: 'imediata', category: 'cobranca', title: 'Test', description: 'Test',
      impactAmount: 0, impactLabel: '', effort: 'baixo', deadline: 'hoje', linkTo: '/obras',
    };
    expect(resolveActionPrefillPure(action, [])).toBeNull();
  });

  it('resolves obraCode to obraId', () => {
    const action: WarAction = {
      priority: 'imediata', category: 'cobranca', title: 'Test', description: 'Test',
      impactAmount: 5000, impactLabel: '+R$5k', effort: 'baixo', deadline: 'hoje', linkTo: '/obras',
      prefill: { type: 'receber', counterpart: 'Cliente X', amount: 5000, obraCode: 'OBR-ABC' },
    };
    const obras = [{ code: 'OBR-ABC', id: 'uuid-123' }];
    const result = resolveActionPrefillPure(action, obras);

    expect(result).not.toBeNull();
    expect(result!.obraId).toBe('uuid-123');
    expect(result!.type).toBe('receber');
    expect(result!.amount).toBe(5000);
  });

  it('defaults type to pagar when not specified', () => {
    const action: WarAction = {
      priority: 'importante', category: 'corte', title: 'Test', description: 'Test',
      impactAmount: 1000, impactLabel: '', effort: 'medio', deadline: 'amanhã', linkTo: '/pagar',
      prefill: { description: 'Cortar gasto' },
    };
    const result = resolveActionPrefillPure(action, []);
    expect(result!.type).toBe('pagar');
  });
});

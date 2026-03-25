/**
 * Reconciliation engine: matches OFX transactions against existing system transactions.
 */

import { Transaction } from './types';
import { OFXTransaction } from './ofx-parser';
import { daysBetween } from './helpers';

export type MatchConfidence = 'alta' | 'media' | 'baixa';

export interface ReconciliationMatch {
  ofxTx: OFXTransaction;
  systemTx: Transaction | null;
  confidence: MatchConfidence;
  status: 'matched' | 'unmatched' | 'ignored';
  selected: boolean; // user toggle
}

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function counterpartSimilarity(ofxName: string, systemCounterpart: string): number {
  const a = normalizeStr(ofxName);
  const b = normalizeStr(systemCounterpart);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  // Check word overlap
  const wordsA = a.split(/\s+/).filter(w => w.length > 2);
  const wordsB = b.split(/\s+/).filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const common = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  return common.length / Math.max(wordsA.length, wordsB.length);
}

export function reconcile(
  ofxTransactions: OFXTransaction[],
  systemTransactions: Transaction[],
  dateToleranceDays = 3
): ReconciliationMatch[] {
  const usedSystemIds = new Set<string>();
  const results: ReconciliationMatch[] = [];

  for (const ofxTx of ofxTransactions) {
    const expectedType = ofxTx.type === 'DEBIT' ? 'pagar' : 'receber';

    // Find candidates: same type, value match, date within tolerance
    let bestMatch: Transaction | null = null;
    let bestScore = 0;
    let bestConfidence: MatchConfidence = 'baixa';

    for (const sysTx of systemTransactions) {
      if (usedSystemIds.has(sysTx.id)) continue;
      if (sysTx.type !== expectedType) continue;

      // Amount match (exact or within 1%)
      const amountDiff = Math.abs(sysTx.amount - ofxTx.amount);
      const amountPct = ofxTx.amount > 0 ? amountDiff / ofxTx.amount : 1;
      if (amountPct > 0.01) continue; // more than 1% difference, skip

      // Date check
      const dateDiff = Math.abs(daysBetween(ofxTx.date, sysTx.dueDate));
      if (dateDiff > dateToleranceDays) continue;

      // Score: closer date + counterpart similarity
      const dateScore = 1 - (dateDiff / (dateToleranceDays + 1));
      const nameScore = counterpartSimilarity(ofxTx.name || ofxTx.memo, sysTx.counterpart);
      const totalScore = dateScore * 0.5 + nameScore * 0.3 + (amountPct < 0.001 ? 0.2 : 0.1);

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMatch = sysTx;
        if (totalScore > 0.7) bestConfidence = 'alta';
        else if (totalScore > 0.4) bestConfidence = 'media';
        else bestConfidence = 'baixa';
      }
    }

    if (bestMatch) {
      usedSystemIds.add(bestMatch.id);
      results.push({
        ofxTx,
        systemTx: bestMatch,
        confidence: bestConfidence,
        status: 'matched',
        selected: bestConfidence === 'alta',
      });
    } else {
      results.push({
        ofxTx,
        systemTx: null,
        confidence: 'baixa',
        status: 'unmatched',
        selected: true,
      });
    }
  }

  return results;
}

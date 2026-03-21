import { useMemo } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { todayISO, addDays, formatCurrency } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

function scoreToColor(score: number) {
  if (score >= 75) return { text: 'text-success', bg: 'bg-success', label: 'Saudável' };
  if (score >= 50) return { text: 'text-warning', bg: 'bg-warning', label: 'Atenção' };
  if (score >= 25) return { text: 'text-orange-500', bg: 'bg-orange-500', label: 'Risco' };
  return { text: 'text-destructive', bg: 'bg-destructive', label: 'Crítico' };
}

export default function HealthScoreCompact() {
  const { filteredTransactions: transactions, filteredBalance: currentBalance, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const { obras, getObraFinancials } = useObras();
  const today = todayISO();

  const { totalScore, breakdown } = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    const activeObras = obras.filter(o => o.status === 'ativa');
    const parts: { label: string; score: number; max: number; detail: string }[] = [];

    let runwayDays = 60;
    for (let d = 1; d <= 60; d++) {
      if (projectedBalance(addDays(today, d)) <= 0) { runwayDays = d; break; }
    }
    const runwayScore = runwayDays >= 45 ? 30 : runwayDays >= 30 ? 25 : runwayDays >= 14 ? 15 : runwayDays >= 7 ? 5 : 0;
    parts.push({ label: 'Runway', score: runwayScore, max: 30, detail: runwayDays >= 60 ? '60+d' : `${runwayDays}d` });

    const overdueReceivable = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado').reduce((s, t) => s + t.amount, 0);
    const totalReceivable = transactions.filter(t => t.type === 'receber' && t.status !== 'confirmado').reduce((s, t) => s + t.amount, 0);
    const overdueRatio = totalReceivable > 0 ? overdueReceivable / totalReceivable : 0;
    const overdueScore = overdueRatio === 0 ? 25 : overdueRatio < 0.1 ? 20 : overdueRatio < 0.25 ? 12 : overdueRatio < 0.5 ? 5 : 0;
    parts.push({ label: 'Inadimpl.', score: overdueScore, max: 25, detail: overdueReceivable > 0 ? formatCurrency(overdueReceivable) : '—' });

    if (activeObras.length > 0) {
      const avgMargin = activeObras.reduce((s, o) => s + getObraFinancials(o.id).grossMarginPercentage, 0) / activeObras.length;
      const marginScore = avgMargin >= 30 ? 25 : avgMargin >= 20 ? 20 : avgMargin >= 10 ? 12 : avgMargin >= 0 ? 5 : 0;
      parts.push({ label: 'Margem', score: marginScore, max: 25, detail: `${avgMargin.toFixed(0)}%` });
    } else {
      parts.push({ label: 'Margem', score: 15, max: 25, detail: '—' });
    }

    const next14Out = transactions.filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 14)).reduce((s, t) => s + t.amount, 0);
    const coverage = next14Out > 0 ? bal / next14Out : bal > 0 ? 5 : 0;
    const coverageScore = coverage >= 2 ? 20 : coverage >= 1.5 ? 16 : coverage >= 1 ? 10 : coverage >= 0.5 ? 4 : 0;
    parts.push({ label: 'Cobert.', score: coverageScore, max: 20, detail: coverage >= 5 ? '5x+' : `${coverage.toFixed(1)}x` });

    return { totalScore: parts.reduce((s, p) => s + p.score, 0), breakdown: parts };
  }, [transactions, currentBalance, projectedBalance, obras, getObraFinancials, today]);

  const color = scoreToColor(totalScore);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="card-elevated p-4 h-full flex flex-col justify-between"
    >
      {/* Header with score */}
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', `${color.bg}/10`)}>
          <motion.span
            className={cn('text-xl font-bold', color.text)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {totalScore}
          </motion.span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Shield className={cn('w-3.5 h-3.5', color.text)} />
            <span className="text-xs font-bold">Saúde</span>
          </div>
          <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full', `${color.bg}/10`, color.text)}>
            {color.label}
          </span>
        </div>
      </div>

      {/* Compact breakdown */}
      <div className="space-y-1.5">
        {breakdown.map((item, i) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground w-14 flex-shrink-0 truncate">{item.label}</span>
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', color.bg)}
                initial={{ width: 0 }}
                animate={{ width: `${(item.score / item.max) * 100}%` }}
                transition={{ duration: 0.6, delay: 0.3 + i * 0.08 }}
              />
            </div>
            <span className="text-[9px] font-mono text-muted-foreground w-8 text-right">{item.detail}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

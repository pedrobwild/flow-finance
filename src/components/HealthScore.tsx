import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { todayISO, addDays, daysBetween, formatCurrency } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

function scoreToColor(score: number) {
  if (score >= 75) return { text: 'text-success', bg: 'bg-success', ring: 'ring-success/20', label: 'Saudável' };
  if (score >= 50) return { text: 'text-warning', bg: 'bg-warning', ring: 'ring-warning/20', label: 'Atenção' };
  if (score >= 25) return { text: 'text-orange-500', bg: 'bg-orange-500', ring: 'ring-orange-500/20', label: 'Risco' };
  return { text: 'text-destructive', bg: 'bg-destructive', ring: 'ring-destructive/20', label: 'Crítico' };
}

interface ScoreBreakdown {
  label: string;
  score: number;
  max: number;
  detail: string;
}

export default function HealthScore() {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const { obras, getObraFinancials } = useObras();
  const today = todayISO();

  const { totalScore, breakdown } = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    const activeObras = obras.filter(o => o.status === 'ativa');
    const parts: ScoreBreakdown[] = [];

    // 1. RUNWAY (0-30 pts)
    // Check how many days until projected balance hits 0
    let runwayDays = 60;
    for (let d = 1; d <= 60; d++) {
      if (projectedBalance(addDays(today, d)) <= 0) {
        runwayDays = d;
        break;
      }
    }
    const runwayScore = runwayDays >= 45 ? 30 : runwayDays >= 30 ? 25 : runwayDays >= 14 ? 15 : runwayDays >= 7 ? 5 : 0;
    parts.push({
      label: 'Runway',
      score: runwayScore,
      max: 30,
      detail: runwayDays >= 60 ? '60+ dias' : `${runwayDays} dias`,
    });

    // 2. INADIMPLÊNCIA (0-25 pts)
    const overdueReceivable = transactions
      .filter(t => t.type === 'receber' && t.status === 'atrasado')
      .reduce((s, t) => s + t.amount, 0);
    const totalReceivable = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado')
      .reduce((s, t) => s + t.amount, 0);
    const overdueRatio = totalReceivable > 0 ? overdueReceivable / totalReceivable : 0;
    const overdueScore = overdueRatio === 0 ? 25 : overdueRatio < 0.1 ? 20 : overdueRatio < 0.25 ? 12 : overdueRatio < 0.5 ? 5 : 0;
    parts.push({
      label: 'Inadimplência',
      score: overdueScore,
      max: 25,
      detail: overdueReceivable > 0 ? `${formatCurrency(overdueReceivable)} em atraso` : 'Nenhuma',
    });

    // 3. MARGEM MÉDIA (0-25 pts)
    if (activeObras.length > 0) {
      const avgMargin = activeObras.reduce((s, o) => s + getObraFinancials(o.id).grossMarginPercentage, 0) / activeObras.length;
      const marginScore = avgMargin >= 30 ? 25 : avgMargin >= 20 ? 20 : avgMargin >= 10 ? 12 : avgMargin >= 0 ? 5 : 0;
      parts.push({
        label: 'Margem média',
        score: marginScore,
        max: 25,
        detail: `${avgMargin.toFixed(0)}%`,
      });
    } else {
      parts.push({ label: 'Margem média', score: 15, max: 25, detail: 'Sem obras ativas' });
    }

    // 4. COBERTURA DE CAIXA (0-20 pts)
    // Can current balance cover next 14 days of outflows?
    const next14Out = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 14))
      .reduce((s, t) => s + t.amount, 0);
    const coverage = next14Out > 0 ? bal / next14Out : bal > 0 ? 5 : 0;
    const coverageScore = coverage >= 2 ? 20 : coverage >= 1.5 ? 16 : coverage >= 1 ? 10 : coverage >= 0.5 ? 4 : 0;
    parts.push({
      label: 'Cobertura 14d',
      score: coverageScore,
      max: 20,
      detail: coverage >= 5 ? '5x+' : `${coverage.toFixed(1)}x`,
    });

    const total = parts.reduce((s, p) => s + p.score, 0);
    return { totalScore: total, breakdown: parts };
  }, [transactions, currentBalance, projectedBalance, obras, getObraFinancials, today]);

  const color = scoreToColor(totalScore);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (totalScore / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn('card-elevated p-5 ring-1', color.ring)}
    >
      <div className="flex items-start gap-5">
        {/* Score circle */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" opacity={0.3} />
            <motion.circle
              cx="48" cy="48" r="40" fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              className={color.text}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className={cn('text-2xl font-bold', color.text)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {totalScore}
            </motion.span>
            <span className="text-[8px] text-muted-foreground uppercase tracking-wider">/100</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Shield className={cn('w-4 h-4', color.text)} />
            <h3 className="text-sm font-bold tracking-tight">Saúde Financeira</h3>
            <span className={cn('text-[9px] font-bold uppercase px-2 py-0.5 rounded-full', `${color.bg}/10`, color.text)}>
              {color.label}
            </span>
          </div>

          <div className="space-y-2">
            {breakdown.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="flex items-center gap-2"
              >
                <span className="text-[10px] text-muted-foreground w-24 flex-shrink-0">{item.label}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full', color.bg)}
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.score / item.max) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.5 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground w-10 text-right">{item.score}/{item.max}</span>
                <span className="text-[9px] text-muted-foreground w-20 text-right truncate">{item.detail}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

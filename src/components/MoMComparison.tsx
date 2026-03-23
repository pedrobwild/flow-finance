import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function getMonthRange(offset: number) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end), label: start.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) };
}

interface MoMMetric {
  label: string;
  current: number;
  previous: number;
  format: 'currency' | 'percent';
  invertColor?: boolean; // true = decrease is good (e.g. costs)
}

export default function MoMComparison() {
  const { transactions } = useFinance();
  const { obras, getObraFinancials } = useObras();

  const data = useMemo(() => {
    const cur = getMonthRange(0);
    const prev = getMonthRange(-1);

    const filterMonth = (from: string, to: string) =>
      transactions.filter(t => t.dueDate >= from && t.dueDate <= to);

    const curTx = filterMonth(cur.from, cur.to);
    const prevTx = filterMonth(prev.from, prev.to);

    const sum = (txs: typeof transactions, type: string, statusFilter?: string) =>
      txs.filter(t => t.type === type && (statusFilter ? t.status === statusFilter : true))
        .reduce((s, t) => s + t.amount, 0);

    const curReceita = sum(curTx, 'receber');
    const prevReceita = sum(prevTx, 'receber');
    const curCustos = sum(curTx, 'pagar');
    const prevCustos = sum(prevTx, 'pagar');
    const curMargem = curReceita > 0 ? ((curReceita - curCustos) / curReceita) * 100 : 0;
    const prevMargem = prevReceita > 0 ? ((prevReceita - prevCustos) / prevReceita) * 100 : 0;
    const curInadimplencia = curTx.filter(t => t.type === 'receber' && t.status === 'atrasado').reduce((s, t) => s + t.amount, 0);
    const prevInadimplencia = prevTx.filter(t => t.type === 'receber' && t.status === 'atrasado').reduce((s, t) => s + t.amount, 0);

    const metrics: MoMMetric[] = [
      { label: 'Receita', current: curReceita, previous: prevReceita, format: 'currency' },
      { label: 'Custos', current: curCustos, previous: prevCustos, format: 'currency', invertColor: true },
      { label: 'Margem', current: curMargem, previous: prevMargem, format: 'percent' },
      { label: 'Inadimplência', current: curInadimplencia, previous: prevInadimplencia, format: 'currency', invertColor: true },
    ];

    return { metrics, curLabel: cur.label, prevLabel: prev.label };
  }, [transactions]);

  const pctChange = (cur: number, prev: number) => {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / Math.abs(prev)) * 100;
  };

  const getTrend = (cur: number, prev: number, invert?: boolean) => {
    const change = pctChange(cur, prev);
    if (Math.abs(change) < 1) return { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Estável' };
    const isUp = change > 0;
    const isPositive = invert ? !isUp : isUp;
    return {
      icon: isUp ? TrendingUp : TrendingDown,
      color: isPositive ? 'text-accent' : 'text-destructive',
      bg: isPositive ? 'bg-accent/10' : 'bg-destructive/10',
      label: `${change > 0 ? '+' : ''}${change.toFixed(0)}%`,
    };
  };

  return (
    <div className="card-elevated p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold tracking-tight">Comparativo Mensal</h2>
        <span className="text-[10px] text-muted-foreground">
          {data.prevLabel} → {data.curLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.metrics.map((m, i) => {
          const trend = getTrend(m.current, m.previous, m.invertColor);
          const TrendIcon = trend.icon;
          return (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="p-3 rounded-lg border bg-card"
            >
              <p className="text-[10px] text-muted-foreground font-medium mb-1">{m.label}</p>
              <p className="text-sm font-bold text-foreground">
                {m.format === 'currency' ? formatCurrency(m.current) : `${m.current.toFixed(1)}%`}
              </p>
              <div className="flex items-center gap-1 mt-1.5">
                <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', trend.bg, trend.color)}>
                  <TrendIcon className="w-3 h-3" />
                  {trend.label}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  vs {m.format === 'currency' ? formatCurrency(m.previous) : `${m.previous.toFixed(1)}%`}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingDown, Shield, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunwayAnalysis {
  daysUntilNegative: number | null;
  dateOfNegative: string | null;
  minBalance: number;
  minBalanceDate: string;
  currentBalance: number;
  totalOutNext30: number;
  totalInNext30: number;
  netBurn: number;
  avgDailyBurn: number;
  runwayDays: number | null;
}

export default function CashRunwayCard() {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const today = todayISO();

  const analysis: RunwayAnalysis = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    let minBal = bal;
    let minDate = today;
    let negDate: string | null = null;
    let negDays: number | null = null;

    for (let i = 0; i <= 60; i++) {
      const date = addDays(today, i);
      const projected = projectedBalance(date);
      if (projected < minBal) {
        minBal = projected;
        minDate = date;
      }
      if (projected < 0 && negDate === null) {
        negDate = date;
        negDays = i;
      }
    }

    const next30 = addDays(today, 30);
    const outNext30 = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= next30)
      .reduce((s, t) => s + t.amount, 0);
    const inNext30 = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= next30)
      .reduce((s, t) => s + t.amount, 0);

    const netBurn = outNext30 - inNext30;
    const avgDaily = netBurn / 30;
    const runway = avgDaily > 0 && bal > 0 ? Math.floor(bal / avgDaily) : null;

    return {
      daysUntilNegative: negDays,
      dateOfNegative: negDate,
      minBalance: minBal,
      minBalanceDate: minDate,
      currentBalance: bal,
      totalOutNext30: outNext30,
      totalInNext30: inNext30,
      netBurn,
      avgDailyBurn: avgDaily,
      runwayDays: runway,
    };
  }, [transactions, currentBalance, projectedBalance, today]);

  const severity = analysis.daysUntilNegative !== null && analysis.daysUntilNegative <= 7
    ? 'critical'
    : analysis.daysUntilNegative !== null && analysis.daysUntilNegative <= 14
      ? 'warning'
      : analysis.minBalance < 10000
        ? 'caution'
        : 'safe';

  const severityConfig = {
    critical: { bg: 'bg-destructive', text: 'text-destructive-foreground', icon: Flame, label: 'QUEBRA DE CAIXA IMINENTE', border: 'border-destructive' },
    warning: { bg: 'bg-warning', text: 'text-warning-foreground', icon: AlertTriangle, label: 'ATENÇÃO — CAIXA APERTADO', border: 'border-warning' },
    caution: { bg: 'bg-accent/10', text: 'text-accent', icon: TrendingDown, label: 'MONITORAR', border: 'border-accent' },
    safe: { bg: 'bg-success/10', text: 'text-success', icon: Shield, label: 'CAIXA SAUDÁVEL', border: 'border-success' },
  };

  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'card-elevated overflow-hidden h-full flex flex-col',
        (severity === 'critical') && 'pulse-alert'
      )}
    >
      {/* Status header */}
      <div className={cn('px-4 py-2.5 flex items-center gap-2', config.bg)}>
        <Icon className={cn('w-4 h-4', config.text)} />
        <span className={cn('text-[10px] font-bold tracking-wider uppercase', config.text)}>{config.label}</span>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Primary metric: Runway */}
        <div className="text-center py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Runway de Caixa</p>
          <p className={cn(
            'text-4xl font-bold tracking-tight font-mono leading-none',
            severity === 'critical' ? 'text-destructive' : severity === 'warning' ? 'text-warning' : 'text-foreground'
          )}>
            {analysis.runwayDays !== null ? `${analysis.runwayDays}` : '∞'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {analysis.runwayDays !== null
              ? `dias · queima ${formatCurrency(analysis.avgDailyBurn)}/dia`
              : 'Entradas superam saídas'}
          </p>
        </div>

        {/* Danger zone */}
        {analysis.daysUntilNegative !== null && (
          <div className="bg-destructive/5 rounded-lg p-3 border border-destructive/15">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-xs font-semibold text-destructive">Negativo em {analysis.daysUntilNegative}d</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {getDayMonth(analysis.dateOfNegative!)} cruza zero. Mínimo: <span className="font-semibold text-destructive">{formatCurrency(analysis.minBalance)}</span> em {getDayMonth(analysis.minBalanceDate)}.
            </p>
          </div>
        )}

        {/* Burn metrics */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Saídas 30d', value: formatCurrency(analysis.totalOutNext30), color: 'text-destructive' },
            { label: 'Entradas 30d', value: formatCurrency(analysis.totalInNext30), color: 'text-success' },
            { label: 'Queima Líq.', value: `${analysis.netBurn > 0 ? '−' : '+'}${formatCurrency(Math.abs(analysis.netBurn))}`, color: analysis.netBurn > 0 ? 'text-destructive' : 'text-success' },
          ].map(m => (
            <div key={m.label} className="text-center p-2 rounded-lg bg-muted/40">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
              <p className={cn('text-xs font-bold font-mono mt-0.5', m.color)}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Min balance highlight */}
        {analysis.daysUntilNegative === null && (
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground">
              Ponto mais apertado: <span className="font-semibold text-foreground">{formatCurrency(analysis.minBalance)}</span> em {getDayMonth(analysis.minBalanceDate)}
              {analysis.minBalance < 20000 && <span className="text-warning ml-1">— margem baixa</span>}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
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

    // Scan 60 days ahead
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
    caution: { bg: 'bg-accent/10', text: 'text-accent-foreground', icon: TrendingDown, label: 'MONITORAR', border: 'border-accent' },
    safe: { bg: 'bg-success/10', text: 'text-success', icon: Shield, label: 'CAIXA SAUDÁVEL', border: 'border-success' },
  };

  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'card-elevated overflow-hidden',
        (severity === 'critical') && 'pulse-alert'
      )}
    >
      {/* Status header */}
      <div className={cn('px-4 py-2.5 flex items-center gap-2', config.bg)}>
        <Icon className={cn('w-4 h-4', severity === 'critical' || severity === 'warning' ? config.text : config.text)} />
        <span className={cn('text-xs font-bold tracking-wider uppercase', config.text)}>{config.label}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Primary metric: Runway */}
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Runway de Caixa</p>
          <p className={cn(
            'text-4xl font-bold tracking-tight font-mono',
            severity === 'critical' ? 'text-destructive' : severity === 'warning' ? 'text-warning' : 'text-foreground'
          )}>
            {analysis.runwayDays !== null ? `${analysis.runwayDays} dias` : '∞'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {analysis.runwayDays !== null
              ? `ao ritmo atual de queima (${formatCurrency(analysis.avgDailyBurn)}/dia)`
              : 'Entradas superam saídas — sem risco projetado'}
          </p>
        </div>

        {/* Danger zone */}
        {analysis.daysUntilNegative !== null && (
          <div className="bg-destructive/5 rounded-lg p-3 border border-destructive/20">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-xs font-semibold text-destructive">Saldo negativo em {analysis.daysUntilNegative} dias</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Em {getDayMonth(analysis.dateOfNegative!)} o saldo projetado cruza zero. 
              Ponto mínimo: <span className="font-semibold text-destructive">{formatCurrency(analysis.minBalance)}</span> em {getDayMonth(analysis.minBalanceDate)}.
            </p>
          </div>
        )}

        {/* Burn metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saídas 30d</p>
            <p className="text-sm font-bold font-mono text-destructive mt-0.5">{formatCurrency(analysis.totalOutNext30)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entradas 30d</p>
            <p className="text-sm font-bold font-mono text-success mt-0.5">{formatCurrency(analysis.totalInNext30)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Queima Líq.</p>
            <p className={cn('text-sm font-bold font-mono mt-0.5', analysis.netBurn > 0 ? 'text-destructive' : 'text-success')}>
              {analysis.netBurn > 0 ? '−' : '+'}{formatCurrency(Math.abs(analysis.netBurn))}
            </p>
          </div>
        </div>

        {/* Min balance highlight */}
        {analysis.daysUntilNegative === null && (
          <div className="bg-muted/50 rounded-lg p-3">
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

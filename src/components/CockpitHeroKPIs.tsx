import { useMemo, useState } from 'react';
import BalanceHistoryDrawer from '@/components/BalanceHistoryDrawer';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO, daysBetween, addDays } from '@/lib/helpers';
import { motion } from 'framer-motion';
import {
  Wallet, ShieldAlert, TrendingDown, Clock, Edit3, Check, X,
  AlertTriangle, ArrowDown, ArrowUp, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import type { PeriodRange } from './DashboardPeriodFilter';

interface Props {
  period: PeriodRange;
}

export default function CockpitHeroKPIs({ period }: Props) {
  const { updateCashBalance, currentBalance } = useFinance();
  const { filteredTransactions: transactions, filteredBalance, filteredProjectedBalance } = useObraFilter();
  const { obras } = useObras();
  const today = todayISO();
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');

  const metrics = useMemo(() => {
    const bal = filteredBalance?.amount ?? 0;
    const balDate = filteredBalance?.balanceDate;
    const balAge = balDate ? daysBetween(balDate, today) : null;

    // Runway calculation: days until balance hits zero
    let runwayDays = 0;
    for (let d = 1; d <= 180; d++) {
      const proj = filteredProjectedBalance(addDays(today, d));
      if (proj <= 0) { runwayDays = d; break; }
      if (d === 180) runwayDays = 180;
    }
    if (runwayDays === 0) runwayDays = 180;

    // Next 14d cash gap
    const exits14d = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 14))
      .reduce((s, t) => s + t.amount, 0);
    const entries14d = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 14))
      .reduce((s, t) => s + t.amount, 0);
    const coverage14d = exits14d > 0 ? (entries14d / exits14d) * 100 : 100;

    // Overdue receivables (inadimplência)
    const overdueRec = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado');
    const overdueRecTotal = overdueRec.reduce((s, t) => s + t.amount, 0);
    const totalRecPeriod = transactions
      .filter(t => t.type === 'receber')
      .reduce((s, t) => s + t.amount, 0);
    const inadRate = totalRecPeriod > 0 ? (overdueRecTotal / totalRecPeriod) * 100 : 0;

    // Average margin across active obras
    const activeObras = obras.filter(o => o.status === 'ativa');
    let avgMargin = 0;
    if (activeObras.length > 0) {
      const margins = activeObras.map(o => {
        const obraTxs = transactions.filter(t => t.obraId === o.id);
        const received = obraTxs.filter(t => t.type === 'receber' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
        const paid = obraTxs.filter(t => t.type === 'pagar' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
        return received > 0 ? ((received - paid) / received) * 100 : 0;
      });
      avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
    }

    // Sparkline for hero chart
    const sparkData: { d: number; v: number }[] = [];
    for (let d = 0; d <= 30; d += 2) {
      sparkData.push({ d, v: filteredProjectedBalance(addDays(today, d)) });
    }

    return {
      bal, balAge, balDate, runwayDays, coverage14d,
      exits14d, entries14d, inadRate, overdueRecTotal,
      avgMargin, sparkData, overdueCount: overdueRec.length,
    };
  }, [transactions, filteredBalance, filteredProjectedBalance, obras, today]);

  const handleSaveBalance = () => {
    const val = parseFloat(balanceInput.replace(/[^\d.,-]/g, '').replace(',', '.'));
    if (!isNaN(val)) {
      updateCashBalance(val);
      setEditingBalance(false);
    }
  };

  const balanceDateLabel = filteredBalance
    ? new Date(filteredBalance.balanceDate + 'T12:00:00').toLocaleDateString('pt-BR')
    : null;

  const runwayColor = metrics.runwayDays > 60 ? 'text-emerald-400' : metrics.runwayDays > 21 ? 'text-amber-300' : 'text-red-400';
  const gap14d = metrics.entries14d - metrics.exits14d;
  const gapColor = gap14d >= 0 ? 'text-emerald-400' : gap14d > -metrics.bal * 0.5 ? 'text-amber-300' : 'text-red-400';
  const overdueColor = metrics.overdueRecTotal === 0 ? 'text-emerald-400' : metrics.overdueRecTotal < 50000 ? 'text-amber-300' : 'text-red-400';

  return (
    <div className="hero-panel p-0">
      <div className="relative z-10 p-5 lg:p-6">
        {/* Top row: Balance + Mini Chart */}
        <div className="flex flex-col lg:flex-row gap-5 lg:gap-8">
          {/* Left: Balance */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-white/60" />
              <span className="text-[11px] font-medium text-white/60 uppercase tracking-wider">Saldo em Conta</span>
              {metrics.balAge !== null && metrics.balAge > 3 && (
                <span className="text-[10px] text-amber-300 flex items-center gap-0.5">
                  <Clock className="w-3 h-3" /> {metrics.balAge}d atrás
                </span>
              )}
            </div>

            {editingBalance ? (
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={balanceInput}
                  onChange={e => setBalanceInput(e.target.value)}
                  placeholder="150000"
                  className="h-9 text-sm flex-1 max-w-[180px] bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveBalance()}
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={handleSaveBalance}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white/60 hover:bg-white/10" onClick={() => setEditingBalance(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-baseline gap-3">
                <p className="text-3xl lg:text-4xl font-bold font-mono tracking-tight text-white">
                  {!filteredBalance ? '—' : formatCurrency(metrics.bal)}
                </p>
                <div className="flex items-center gap-1">
                  <BalanceHistoryDrawer />
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-white/40 hover:text-white hover:bg-white/10"
                    onClick={() => { setBalanceInput(filteredBalance?.amount?.toString() || ''); setEditingBalance(true); }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
            {balanceDateLabel && (
              <p className="text-[10px] text-white/40 mt-0.5">Atualizado em {balanceDateLabel}</p>
            )}
          </div>

          {/* Right: Mini projection chart */}
          <div className="lg:w-[280px] h-[80px] lg:h-[90px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.sparkData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160, 84%, 50%)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(160, 84%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <ReferenceLine y={0} stroke="hsl(0, 72%, 60%)" strokeDasharray="3 3" strokeOpacity={0.4} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="hsl(160, 84%, 60%)"
                  strokeWidth={2}
                  fill="url(#heroGrad)"
                  dot={false}
                />
                <XAxis hide />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-card text-foreground border rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg">
                        <span className="font-mono font-medium">{formatCurrency(payload[0].value as number)}</span>
                        <span className="text-muted-foreground ml-1">em {payload[0].payload.d}d</span>
                      </div>
                    );
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-[9px] text-white/30 text-right -mt-1">Projeção 30 dias</p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/10 my-4 shimmer-line" />

        {/* Bottom: Predictive KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
          {/* Runway */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-3 border border-white/[0.08] hover:bg-white/[0.1] transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-white/50" />
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">Runway</span>
            </div>
            <p className={cn('text-2xl font-bold font-mono', runwayColor)}>
              {metrics.runwayDays >= 180 ? '180+' : metrics.runwayDays}
              <span className="text-sm font-normal text-white/40 ml-1">dias</span>
            </p>
            <p className="text-[10px] text-white/30 mt-0.5">
              {metrics.runwayDays >= 60 ? 'Fôlego confortável' : metrics.runwayDays >= 21 ? 'Atenção ao fluxo' : '⚠ Risco de quebra'}
            </p>
          </motion.div>

          {/* Cobertura 14d */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-3 border border-white/[0.08] hover:bg-white/[0.1] transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5 text-white/50" />
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">Cobertura 14d</span>
            </div>
            <p className={cn('text-2xl font-bold font-mono', coverageColor)}>
              {metrics.coverage14d.toFixed(0)}
              <span className="text-sm font-normal text-white/40 ml-0.5">%</span>
            </p>
            <div className="text-[10px] text-white/30 mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-0.5"><ArrowUp className="w-2.5 h-2.5 text-emerald-400/60" />{formatCurrency(metrics.entries14d)}</span>
              <span className="flex items-center gap-0.5"><ArrowDown className="w-2.5 h-2.5 text-red-400/60" />{formatCurrency(metrics.exits14d)}</span>
            </div>
          </motion.div>

          {/* Inadimplência */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-3 border border-white/[0.08] hover:bg-white/[0.1] transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-white/50" />
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">Inadimplência</span>
            </div>
            <p className={cn('text-2xl font-bold font-mono', inadColor)}>
              {metrics.inadRate.toFixed(1)}
              <span className="text-sm font-normal text-white/40 ml-0.5">%</span>
            </p>
            <p className="text-[10px] text-white/30 mt-0.5">
              {metrics.overdueCount > 0
                ? `${metrics.overdueCount} parcela(s) · ${formatCurrency(metrics.overdueRecTotal)}`
                : 'Nenhum recebível atrasado'}
            </p>
          </motion.div>

          {/* Margem Média */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-3 border border-white/[0.08] hover:bg-white/[0.1] transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-white/50" />
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">Margem Média</span>
            </div>
            <p className={cn('text-2xl font-bold font-mono', metrics.avgMargin >= 20 ? 'text-emerald-400' : metrics.avgMargin >= 10 ? 'text-amber-300' : 'text-red-400')}>
              {metrics.avgMargin.toFixed(1)}
              <span className="text-sm font-normal text-white/40 ml-0.5">%</span>
            </p>
            <p className="text-[10px] text-white/30 mt-0.5">
              {metrics.avgMargin >= 20 ? 'Margem saudável' : metrics.avgMargin >= 10 ? 'Margem apertada' : '⚠ Margem crítica'}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

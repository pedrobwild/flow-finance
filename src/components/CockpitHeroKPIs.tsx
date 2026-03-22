import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BalanceHistoryDrawer from '@/components/BalanceHistoryDrawer';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO, daysBetween, addDays } from '@/lib/helpers';
import { motion } from 'framer-motion';
import {
  Wallet, ShieldAlert, TrendingDown, Clock, Edit3, Check, X,
  AlertTriangle, ArrowDown,
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
  const navigate = useNavigate();
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

    // Cash gap within period range
    const exits = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= period.from && t.dueDate <= period.to)
      .reduce((s, t) => s + t.amount, 0);
    const entries = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= period.from && t.dueDate <= period.to)
      .reduce((s, t) => s + t.amount, 0);

    // Overdue receivables
    const overdueRec = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado');
    const overdueRecTotal = overdueRec.reduce((s, t) => s + t.amount, 0);

    // --- CONCENTRATION RISK ---
    // Pending receivables in period, grouped by counterpart (client)
    const pendingRec = transactions.filter(
      t => t.type === 'receber' && t.status !== 'confirmado' && t.status !== 'atrasado'
        && t.dueDate >= period.from && t.dueDate <= period.to
    );
    // Group by counterpart
    const byClient = new Map<string, number>();
    for (const t of pendingRec) {
      byClient.set(t.counterpart || 'Sem cliente', (byClient.get(t.counterpart || 'Sem cliente') ?? 0) + t.amount);
    }
    // Find biggest single client
    let biggestClient = '';
    let biggestAmount = 0;
    for (const [client, amount] of byClient) {
      if (amount > biggestAmount) { biggestClient = client; biggestAmount = amount; }
    }
    // If that client delays: what's the balance situation?
    // Payables within the selected period
    const periodPayables = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= period.from && t.dueDate <= period.to)
      .reduce((s, t) => s + t.amount, 0);
    // If biggest client delays: can current balance alone cover period bills?
    const balAfterBills = bal - periodPayables;
    const entriesWithoutBiggest = entries - biggestAmount;
    const netIfDelays = bal + entriesWithoutBiggest - periodPayables;
    const surviveIfDelays = netIfDelays > 0;
    const shortfall = surviveIfDelays ? 0 : Math.abs(netIfDelays);
    const surplus = surviveIfDelays ? netIfDelays : 0;
    const concentrationPct = entries > 0 ? (biggestAmount / entries) * 100 : 0;

    // Count pending payables in period
    const pendingPayCount = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= period.from && t.dueDate <= period.to)
      .length;

    // Sparkline for hero chart
    const sparkData: { d: number; v: number }[] = [];
    for (let d = 0; d <= 30; d += 2) {
      sparkData.push({ d, v: filteredProjectedBalance(addDays(today, d)) });
    }

    return {
      bal, balAge, balDate, runwayDays,
      exits, entries, overdueRecTotal,
      sparkData, overdueCount: overdueRec.length,
      pendingPayCount,
      // Concentration
      biggestClient, biggestAmount, concentrationPct,
      periodPayables,
      surviveIfDelays, shortfall, surplus, balAfterBills,
      clientCount: byClient.size,
    };
  }, [transactions, filteredBalance, filteredProjectedBalance, obras, today, period]);

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

  const runwayColor = metrics.runwayDays > 60 ? 'text-success' : metrics.runwayDays > 21 ? 'text-warning' : 'text-destructive';
  const entriesColor = metrics.entries === 0 ? 'text-muted-foreground' : metrics.overdueRecTotal > 0 ? 'text-warning' : 'text-success';
  const concentrationColor = !metrics.biggestClient ? 'text-muted-foreground'
    : metrics.surviveIfDelays ? 'text-success' : 'text-destructive';

  return (
    <div className="hero-panel p-0">
      <div className="relative z-10 p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row gap-5 lg:gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Saldo em Conta</span>
              {metrics.balAge !== null && metrics.balAge > 3 && (
                <span className="text-[10px] text-warning flex items-center gap-0.5">
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
                  className="h-9 text-sm flex-1 max-w-[180px] bg-background border-border text-foreground placeholder:text-muted-foreground"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveBalance()}
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-foreground hover:bg-muted" onClick={handleSaveBalance}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-muted" onClick={() => setEditingBalance(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-baseline gap-3">
                <p className="text-3xl lg:text-4xl font-bold font-mono tracking-tight text-foreground">
                  {!filteredBalance ? '—' : formatCurrency(metrics.bal)}
                </p>
                <div className="flex items-center gap-1">
                  <BalanceHistoryDrawer />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => { setBalanceInput(filteredBalance?.amount?.toString() || ''); setEditingBalance(true); }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
            {balanceDateLabel && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Atualizado em {balanceDateLabel}</p>
            )}
          </div>

          <div className="lg:w-[280px] h-[80px] lg:h-[90px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.sparkData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <ReferenceLine y={0} stroke="hsl(var(--destructive) / 0.45)" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="hsl(var(--accent))"
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
            <p className="text-[9px] text-muted-foreground text-right -mt-1">Projeção 30 dias</p>
          </div>
        </div>

        <div className="h-px bg-border my-4" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => navigate('/fluxo')}
            className={cn(
              'rounded-xl p-3 border bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer',
              metrics.runwayDays <= 21 ? 'border-destructive/30' : 'border-border'
            )}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Runway</span>
            </div>
            <p className={cn('text-2xl font-bold font-mono', runwayColor)}>
              {metrics.runwayDays >= 180 ? '180+' : metrics.runwayDays}
              <span className="text-sm font-normal text-muted-foreground ml-1">dias</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {metrics.runwayDays >= 60 ? 'Fôlego confortável' : metrics.runwayDays >= 21 ? 'Atenção ao fluxo' : 'Risco de quebra'}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            onClick={() => navigate('/pagar')}
            className="rounded-xl p-3 border border-border bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">A Pagar ({period.label})</span>
            </div>
            <p className="text-2xl font-bold font-mono text-destructive">
              {formatCurrency(metrics.exits)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {metrics.pendingPayCount} conta(s) · Receber: <span className="text-success font-medium">{formatCurrency(metrics.entries)}</span>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => navigate('/receber')}
            className={cn(
              'rounded-xl p-3 border bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer',
              metrics.overdueCount > 0 ? 'border-warning/30' : 'border-border'
            )}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <ArrowDown className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">A Receber ({period.label})</span>
            </div>
            <p className={cn('text-2xl font-bold font-mono', entriesColor)}>
              {formatCurrency(metrics.entries)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {metrics.overdueCount > 0
                ? <span className="text-warning font-medium">{metrics.overdueCount} atrasada(s) · {formatCurrency(metrics.overdueRecTotal)}</span>
                : 'Tudo em dia'}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            onClick={() => navigate('/receber')}
            className={cn(
              'rounded-xl p-3 border bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer relative overflow-hidden',
              !metrics.surviveIfDelays && metrics.biggestClient ? 'border-destructive/30 bg-destructive/5' : 'border-border'
            )}
          >
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Teste de Estresse</span>
              </div>
              {metrics.biggestClient ? (
                <>
                  <p className={cn('text-xl font-bold font-mono leading-tight', concentrationColor)}>
                    {metrics.surviveIfDelays ? `+${formatCurrency(metrics.surplus)}` : `-${formatCurrency(metrics.shortfall)}`}
                  </p>
                  <p className="text-[10px] text-foreground mt-1 leading-snug">
                    Se <span className="font-medium">{metrics.biggestClient}</span> atrasar
                    <span className="text-muted-foreground"> ({formatCurrency(metrics.biggestAmount)} · {Math.round(metrics.concentrationPct)}%)</span>
                  </p>
                  <p className="text-[9px] mt-0.5 leading-snug text-muted-foreground">
                    Saldo {formatCurrency(metrics.bal)} − {period.label} contas {formatCurrency(metrics.periodPayables)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">Sem recebíveis pendentes</p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo, useCallback } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween } from '@/lib/helpers';
import { Transaction, CostCenter, COST_CENTERS } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, ComposedChart,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Beaker, CalendarClock, RotateCcw, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, TrendingUp, TrendingDown, Plus, Trash2, Shield,
  Zap, Target, Clock, DollarSign, Lightbulb, ChevronRight,
  Activity, Flame, X, Sparkles, Eye, EyeOff, Calendar,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type DeferAction = { type: 'exclude' } | { type: 'defer'; newDate: string };

interface HypotheticalTx {
  id: string;
  type: 'pagar' | 'receber';
  description: string;
  amount: number;
  dueDate: string;
  costCenter: CostCenter;
}

function generateId() {
  return 'hyp-' + Math.random().toString(36).slice(2, 10);
}

const sect = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
});

export default function SimuladorPage() {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const today = todayISO();
  const [modifications, setModifications] = useState<Map<string, DeferAction>>(new Map());
  const [hypotheticals, setHypotheticals] = useState<HypotheticalTx[]>([]);
  const [period, setPeriod] = useState(30);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'pagar' | 'receber'>('all');

  // New hypothetical form state
  const [newType, setNewType] = useState<'pagar' | 'receber'>('pagar');
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(addDays(today, 7));
  const [newCostCenter, setNewCostCenter] = useState<CostCenter>('Operação');

  const manipulable = useMemo(() =>
    transactions
      .filter(t => t.status !== 'confirmado' && t.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .filter(t => filterType === 'all' || t.type === filterType),
    [transactions, today, filterType]
  );

  const toggleExclude = useCallback((id: string) => {
    setModifications(prev => {
      const next = new Map(prev);
      if (next.has(id) && next.get(id)!.type === 'exclude') {
        next.delete(id);
      } else {
        next.set(id, { type: 'exclude' });
      }
      return next;
    });
  }, []);

  const setDefer = useCallback((id: string, newDate: string) => {
    setModifications(prev => {
      const next = new Map(prev);
      if (newDate) {
        next.set(id, { type: 'defer', newDate });
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setModifications(new Map());
    setHypotheticals([]);
  }, []);

  const addHypothetical = useCallback(() => {
    const amount = parseFloat(newAmount);
    if (!newDesc.trim() || isNaN(amount) || amount <= 0 || !newDate) return;
    setHypotheticals(prev => [...prev, {
      id: generateId(),
      type: newType,
      description: newDesc.trim(),
      amount,
      dueDate: newDate,
      costCenter: newCostCenter,
    }]);
    setNewDesc('');
    setNewAmount('');
    setNewDate(addDays(today, 7));
    setShowAddForm(false);
  }, [newType, newDesc, newAmount, newDate, newCostCenter, today]);

  const removeHypothetical = useCallback((id: string) => {
    setHypotheticals(prev => prev.filter(h => h.id !== id));
  }, []);

  // Full analysis computation
  const analysis = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;

    const modifiedTxs = transactions.map(t => {
      const mod = modifications.get(t.id);
      if (!mod) return t;
      if (mod.type === 'exclude') return { ...t, status: 'confirmado' as const };
      if (mod.type === 'defer') return { ...t, dueDate: mod.newDate };
      return t;
    });

    const calcBalance = (txSet: Transaction[], hSet: HypotheticalTx[], date: string) => {
      let b = bal;
      for (const tx of txSet) {
        if (tx.status === 'confirmado') continue;
        if (tx.dueDate > date) continue;
        if (tx.type === 'receber') {
          if (tx.status === 'atrasado') continue;
          b += tx.amount;
        } else {
          b -= tx.amount;
        }
      }
      for (const h of hSet) {
        if (h.dueDate > date) continue;
        if (h.type === 'receber') b += h.amount;
        else b -= h.amount;
      }
      return b;
    };

    const points: { label: string; date: string; original: number; simulated: number; delta: number }[] = [];

    for (let i = 0; i <= period; i++) {
      const date = addDays(today, i);
      const original = projectedBalance(date);
      const simulated = calcBalance(modifiedTxs, hypotheticals, date);
      points.push({
        label: i === 0 ? 'Hoje' : getDayMonth(date),
        date,
        original,
        simulated,
        delta: simulated - original,
      });
    }

    const origMin = Math.min(...points.map(p => p.original));
    const simMin = Math.min(...points.map(p => p.simulated));
    const origEnd = points[points.length - 1]?.original ?? 0;
    const simEnd = points[points.length - 1]?.simulated ?? 0;
    const origMinDate = points.find(p => p.original === origMin)?.date ?? '';
    const simMinDate = points.find(p => p.simulated === simMin)?.date ?? '';

    const origNegIdx = points.findIndex(p => p.original < 0);
    const simNegIdx = points.findIndex(p => p.simulated < 0);
    const origNegDate = origNegIdx >= 0 ? points[origNegIdx].date : null;
    const simNegDate = simNegIdx >= 0 ? points[simNegIdx].date : null;

    const origRunway = origNegIdx >= 0 ? origNegIdx : null;
    const simRunway = simNegIdx >= 0 ? simNegIdx : null;
    const daysGained = origRunway !== null && simRunway !== null ? simRunway - origRunway
      : origRunway !== null && simRunway === null ? period - origRunway
        : null;

    const excludedTotal = Array.from(modifications.entries())
      .filter(([, m]) => m.type === 'exclude')
      .reduce((sum, [id]) => {
        const tx = transactions.find(t => t.id === id);
        return sum + (tx?.amount ?? 0);
      }, 0);

    const deferredCount = Array.from(modifications.values()).filter(m => m.type === 'defer').length;
    const excludedCount = Array.from(modifications.values()).filter(m => m.type === 'exclude').length;

    // Negative days count
    const origNegDays = points.filter(p => p.original < 0).length;
    const simNegDays = points.filter(p => p.simulated < 0).length;

    // Auto-recommendations
    const pendingPayables = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today)
      .sort((a, b) => b.amount - a.amount);

    const recommendations: { tx: Transaction; reason: string; impact: string }[] = [];

    if (origNegIdx >= 0) {
      for (const tx of pendingPayables.slice(0, 5)) {
        if (modifications.has(tx.id)) continue;
        const testMods = new Map(modifications);
        testMods.set(tx.id, { type: 'defer', newDate: addDays(today, period) });
        const testTxs = transactions.map(t => {
          const mod = testMods.get(t.id);
          if (!mod) return t;
          if (mod.type === 'exclude') return { ...t, status: 'confirmado' as const };
          if (mod.type === 'defer') return { ...t, dueDate: mod.newDate };
          return t;
        });
        const testNeg = points.some((p) => {
          const testBal = calcBalance(testTxs, hypotheticals, p.date);
          return testBal < 0;
        });
        if (!testNeg) {
          recommendations.push({
            tx,
            reason: 'Elimina saldo negativo',
            impact: `+${formatCurrency(tx.amount)} no período`,
          });
        } else {
          const testMinBal = Math.min(...points.map(p => calcBalance(testTxs, hypotheticals, p.date)));
          if (testMinBal > origMin) {
            recommendations.push({
              tx,
              reason: `Melhora saldo mínimo em ${formatCurrency(testMinBal - origMin)}`,
              impact: `Novo mín: ${formatCurrency(testMinBal)}`,
            });
          }
        }
      }
    }

    const hasChanges = modifications.size > 0 || hypotheticals.length > 0;

    // Health score: 0-100
    const healthScore = Math.max(0, Math.min(100,
      simNegDays === 0 ? 100 :
        simNegDays <= 3 ? 60 :
          simNegDays <= 7 ? 30 : 10
    ));

    return {
      chartData: points,
      origMin, simMin, origEnd, simEnd,
      origMinDate, simMinDate,
      origRunway, simRunway,
      origNegDate, simNegDate,
      origNegDays, simNegDays,
      daysGained,
      deltaEnd: simEnd - origEnd,
      deltaMin: simMin - origMin,
      excludedTotal,
      excludedCount,
      deferredCount,
      hypotheticalCount: hypotheticals.length,
      hasChanges,
      recommendations,
      currentBal: bal,
      healthScore,
    };
  }, [transactions, modifications, hypotheticals, currentBalance, projectedBalance, today, period]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const orig = payload.find((p: any) => p.dataKey === 'original')?.value ?? 0;
    const sim = payload.find((p: any) => p.dataKey === 'simulated')?.value ?? 0;
    const delta = sim - orig;
    return (
      <div className="bg-card border rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[200px] backdrop-blur-sm">
        <p className="font-semibold text-foreground text-sm">{label}</p>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/50" /> Original
            </span>
            <span className={cn('font-mono font-medium', orig >= 0 ? 'text-foreground' : 'text-destructive')}>{formatCurrency(orig)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-accent" /> Simulado
            </span>
            <span className={cn('font-mono font-bold', sim >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(sim)}</span>
          </div>
          {analysis.hasChanges && delta !== 0 && (
            <div className="flex justify-between items-center border-t border-border pt-2 mt-2">
              <span className="text-muted-foreground">Impacto</span>
              <span className={cn('font-mono font-bold', delta >= 0 ? 'text-success' : 'text-destructive')}>
                {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const healthColor = analysis.healthScore >= 70 ? 'text-success' : analysis.healthScore >= 40 ? 'text-warning' : 'text-destructive';
  const healthBg = analysis.healthScore >= 70 ? 'bg-success' : analysis.healthScore >= 40 ? 'bg-warning' : 'bg-destructive';
  const healthLabel = analysis.healthScore >= 70 ? 'Saudável' : analysis.healthScore >= 40 ? 'Atenção' : 'Crítico';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Page header */}
      <motion.div {...sect(0)} className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20 shrink-0">
              <Beaker className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold">Simulador</h1>
                {analysis.hasChanges && (
                  <Badge variant="outline" className="text-[10px] font-semibold border-accent/30 text-accent gap-1">
                    <Sparkles className="w-3 h-3" />
                    {modifications.size + hypotheticals.length}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 hidden sm:block">Simule decisões financeiras e veja o impacto</p>
            </div>
          </div>
          {analysis.hasChanges && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9 min-h-[36px] shrink-0" onClick={resetAll}>
              <RotateCcw className="w-3.5 h-3.5" /> Resetar
            </Button>
          )}
        </div>
        <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border w-max">
          {[30, 45, 60, 90].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3.5 py-2 text-xs font-medium rounded-md transition-all min-h-[36px]',
                period === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p}d
            </button>
          ))}
        </div>
      </motion.div>

      {/* Scenario impact banner */}
      <AnimatePresence>
        {analysis.hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className={cn(
              'rounded-xl border-2 p-4 flex items-center justify-between',
              analysis.deltaEnd >= 0
                ? 'bg-success/5 border-success/25'
                : 'bg-destructive/5 border-destructive/25'
            )}
          >
            <div className="flex items-center gap-3.5">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                analysis.deltaEnd >= 0 ? 'bg-success/10' : 'bg-destructive/10'
              )}>
                {analysis.deltaEnd >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-success" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-destructive" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold">
                  Cenário {analysis.deltaEnd >= 0 ? 'positivo' : 'negativo'}
                  <span className={cn('font-mono ml-2', analysis.deltaEnd >= 0 ? 'text-success' : 'text-destructive')}>
                    {analysis.deltaEnd >= 0 ? '+' : ''}{formatCurrency(analysis.deltaEnd)}
                  </span>
                  <span className="text-muted-foreground font-normal ml-1">em {period}d</span>
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  {analysis.excludedCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <EyeOff className="w-3 h-3" /> {analysis.excludedCount} excluído{analysis.excludedCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {analysis.deferredCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="w-3 h-3" /> {analysis.deferredCount} adiado{analysis.deferredCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {analysis.hypotheticalCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Zap className="w-3 h-3" /> {analysis.hypotheticalCount} hipotético{analysis.hypotheticalCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {analysis.daysGained !== null && (
                <Badge className={cn(
                  'text-xs font-bold px-3 py-1',
                  analysis.daysGained > 0
                    ? 'bg-success/10 text-success border border-success/20 hover:bg-success/10'
                    : 'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/10'
                )}>
                  <Clock className="w-3 h-3 mr-1" />
                  {analysis.daysGained > 0 ? '+' : ''}{analysis.daysGained} dias runway
                </Badge>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Metrics grid - 5 columns */}
      <motion.div {...sect(0.05)} className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Current balance */}
        <div className="card-elevated p-4 space-y-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Saldo atual</span>
          </div>
          <p className="text-lg font-bold font-mono tracking-tight">{formatCurrency(analysis.currentBal)}</p>
        </div>

        {/* Original end balance */}
        <div className={cn('card-elevated p-4 space-y-2', analysis.origEnd < 0 && 'border-destructive/20')}>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Original {period}d</span>
          </div>
          <p className={cn('text-lg font-bold font-mono tracking-tight', analysis.origEnd < 0 && 'text-destructive')}>
            {formatCurrency(analysis.origEnd)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {analysis.origNegDate ? `⚠ Negativo em ${getDayMonth(analysis.origNegDate)}` : '✓ Saudável'}
          </p>
        </div>

        {/* Simulated end balance */}
        <div className={cn(
          'card-elevated p-4 space-y-2 border-2',
          analysis.simEnd < 0 ? 'border-destructive/30 bg-destructive/3' : 'border-accent/30 bg-accent/3'
        )}>
          <div className="flex items-center gap-2">
            <Beaker className={cn('w-4 h-4', analysis.simEnd < 0 ? 'text-destructive' : 'text-accent')} />
            <span className={cn('text-[11px] uppercase tracking-wider font-semibold', analysis.simEnd < 0 ? 'text-destructive' : 'text-accent')}>
              Simulado {period}d
            </span>
          </div>
          <p className={cn('text-lg font-bold font-mono tracking-tight', analysis.simEnd < 0 ? 'text-destructive' : 'text-accent')}>
            {formatCurrency(analysis.simEnd)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {analysis.simNegDate ? `⚠ Negativo em ${getDayMonth(analysis.simNegDate)}` : '✓ Saudável'}
          </p>
        </div>

        {/* Simulated min balance */}
        <div className={cn('card-elevated p-4 space-y-2', analysis.simMin < 0 && 'border-destructive/20')}>
          <div className="flex items-center gap-2">
            <Activity className={cn('w-4 h-4', analysis.simMin < 0 ? 'text-destructive' : 'text-success')} />
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Saldo mínimo</span>
          </div>
          <p className={cn('text-lg font-bold font-mono tracking-tight', analysis.simMin < 0 ? 'text-destructive' : 'text-success')}>
            {formatCurrency(analysis.simMin)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {analysis.simMinDate ? `Em ${getDayMonth(analysis.simMinDate)}` : ''}
          </p>
        </div>

        {/* Health score */}
        <div className="card-elevated p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Shield className={cn('w-4 h-4', healthColor)} />
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Saúde</span>
          </div>
          <div className="flex items-center gap-2.5">
            <p className={cn('text-lg font-bold font-mono tracking-tight', healthColor)}>{analysis.healthScore}</p>
            <Badge className={cn('text-[9px] border-none', healthBg, 'text-white')}>{healthLabel}</Badge>
          </div>
          <Progress value={analysis.healthScore} className="h-1.5" />
        </div>
      </motion.div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chart */}
        <motion.div {...sect(0.1)} className="lg:col-span-8 card-elevated overflow-hidden">
          <div className="p-5 pb-0 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-accent" />
              </div>
              <h2 className="font-semibold text-sm">Projeção comparativa</h2>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40" /> Original
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent" /> Simulado
              </span>
            </div>
          </div>

          {/* Negative days indicator */}
          {analysis.simNegDays > 0 && (
            <div className="mx-5 mt-3 flex items-center gap-2 text-[11px] text-destructive bg-destructive/5 rounded-lg px-3 py-2 border border-destructive/10">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                <strong>{analysis.simNegDays} dia{analysis.simNegDays > 1 ? 's' : ''}</strong> com saldo negativo no cenário simulado
                {analysis.origNegDays > 0 && analysis.simNegDays < analysis.origNegDays && (
                  <span className="text-success ml-1">(era{analysis.origNegDays > 1 ? 'm' : ''} {analysis.origNegDays})</span>
                )}
              </span>
            </div>
          )}

          <div className="p-5" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analysis.chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <defs>
                  <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="origGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.06} />
                    <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(period / 8)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="original"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  fill="url(#origGrad)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="simulated"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2.5}
                  fill="url(#simGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: 'hsl(var(--accent))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Right sidebar: Recommendations + Hypotheticals */}
        <motion.div {...sect(0.15)} className="lg:col-span-4 space-y-4">
          {/* Recommendations */}
          <div className="card-elevated overflow-hidden">
            <div className="p-4 border-b flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--warning) / 0.1)' }}>
                <Lightbulb className="w-3.5 h-3.5" style={{ color: 'hsl(var(--warning))' }} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Recomendações</h3>
                <p className="text-[10px] text-muted-foreground">Ações sugeridas pela IA</p>
              </div>
            </div>
            <div className="p-3">
              {analysis.recommendations.length > 0 ? (
                <div className="space-y-2">
                  {analysis.recommendations.slice(0, 3).map((rec, i) => (
                    <button
                      key={rec.tx.id}
                      onClick={() => setDefer(rec.tx.id, addDays(today, period))}
                      className="w-full text-left p-3 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-accent">
                            {i + 1}
                          </span>
                          <p className="text-xs font-medium truncate">{rec.tx.description}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors shrink-0 mt-0.5" />
                      </div>
                      <div className="ml-7 mt-1">
                        <p className="text-[10px] text-muted-foreground">{rec.reason}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] font-mono text-destructive">{formatCurrency(rec.tx.amount)}</span>
                          <Badge variant="outline" className="text-[9px] h-4 border-success/30 text-success">{rec.impact}</Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-xl bg-success/5 flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-6 h-6 text-success/50" />
                  </div>
                  <p className="text-xs font-medium text-foreground">Caixa saudável</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {analysis.origRunway === null
                      ? 'Nenhuma ação urgente necessária.'
                      : 'Aplique modificações para ver sugestões.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Hypothetical transactions */}
          <div className="card-elevated overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Hipotéticas</h3>
                  <p className="text-[10px] text-muted-foreground">Transações fictícias</p>
                </div>
              </div>
              <Button
                variant={showAddForm ? 'secondary' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {showAddForm ? 'Fechar' : 'Nova'}
              </Button>
            </div>

            <div className="p-3">
              <AnimatePresence>
                {showAddForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2.5 p-3 bg-muted/30 rounded-lg border border-dashed border-border mb-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setNewType('pagar')}
                          className={cn(
                            'flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
                            newType === 'pagar'
                              ? 'bg-destructive/10 text-destructive border-2 border-destructive/20'
                              : 'bg-muted text-muted-foreground border-2 border-transparent hover:border-border'
                          )}
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5" /> Despesa
                        </button>
                        <button
                          onClick={() => setNewType('receber')}
                          className={cn(
                            'flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
                            newType === 'receber'
                              ? 'bg-success/10 text-success border-2 border-success/20'
                              : 'bg-muted text-muted-foreground border-2 border-transparent hover:border-border'
                          )}
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" /> Receita
                        </button>
                      </div>
                      <Input
                        placeholder="Descrição (ex: Novo contrato cliente X)"
                        value={newDesc}
                        onChange={e => setNewDesc(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Valor (R$)"
                          value={newAmount}
                          onChange={e => setNewAmount(e.target.value)}
                          className="h-8 text-xs flex-1"
                        />
                        <Input
                          type="date"
                          value={newDate}
                          onChange={e => setNewDate(e.target.value)}
                          min={today}
                          className="h-8 text-xs flex-1"
                        />
                      </div>
                      <Select value={newCostCenter} onValueChange={v => setNewCostCenter(v as CostCenter)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COST_CENTERS.map(cc => (
                            <SelectItem key={cc} value={cc} className="text-xs">{cc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={addHypothetical}>
                        <Plus className="w-3 h-3" /> Adicionar ao cenário
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {hypotheticals.length > 0 ? (
                <div className="space-y-1.5">
                  {hypotheticals.map(h => (
                    <motion.div
                      key={h.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 p-2.5 rounded-lg bg-accent/5 border border-accent/10 text-xs group"
                    >
                      {h.type === 'pagar' ? (
                        <ArrowDownCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      ) : (
                        <ArrowUpCircle className="w-3.5 h-3.5 text-success shrink-0" />
                      )}
                      <span className="flex-1 truncate font-medium">{h.description}</span>
                      <span className={cn('font-mono font-semibold shrink-0', h.type === 'pagar' ? 'text-destructive' : 'text-success')}>
                        {h.type === 'pagar' ? '-' : '+'}{formatCurrency(h.amount)}
                      </span>
                      <span className="text-muted-foreground shrink-0">{getDayMonth(h.dueDate)}</span>
                      <button
                        onClick={() => removeHypothetical(h.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              ) : !showAddForm ? (
                <div className="text-center py-6">
                  <p className="text-[10px] text-muted-foreground">
                    Adicione receitas ou despesas fictícias para simular cenários.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Transaction manipulation list */}
      <motion.div {...sect(0.2)} className="card-elevated overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Flame className="w-3.5 h-3.5 text-accent" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Transações futuras</h2>
              <p className="text-[10px] text-muted-foreground">Desative ou adie para simular impacto</p>
            </div>
            <Badge variant="secondary" className="text-[10px] ml-1">{manipulable.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
              {(['all', 'pagar', 'receber'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={cn(
                    'px-2.5 py-1 text-[10px] font-medium rounded-md transition-all',
                    filterType === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f === 'all' ? 'Todas' : f === 'pagar' ? 'A pagar' : 'A receber'}
                </button>
              ))}
            </div>
            {modifications.size > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setModifications(new Map())}>
                <RotateCcw className="w-3 h-3" /> Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[40px_20px_1fr_100px_60px_140px] gap-3 px-4 py-2 bg-muted/30 border-b text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          <span>Ativo</span>
          <span></span>
          <span>Descrição</span>
          <span className="text-right">Valor</span>
          <span className="text-center">Venc.</span>
          <span className="text-center">Adiar para</span>
        </div>

        <div className="divide-y max-h-[450px] overflow-y-auto">
          {manipulable.map(tx => {
            const mod = modifications.get(tx.id);
            const isExcluded = mod?.type === 'exclude';
            const isDeferred = mod?.type === 'defer';

            return (
              <div
                key={tx.id}
                className={cn(
                  'grid grid-cols-[40px_20px_1fr_100px_60px_140px] gap-3 items-center px-4 py-3 text-xs transition-all',
                  isExcluded && 'bg-muted/40 opacity-50',
                  isDeferred && 'bg-accent/5 border-l-2 border-l-accent',
                  !isExcluded && !isDeferred && 'hover:bg-muted/20',
                )}
              >
                <Switch
                  checked={!isExcluded}
                  onCheckedChange={() => toggleExclude(tx.id)}
                  className="scale-[0.7]"
                />

                {tx.type === 'pagar' ? (
                  <ArrowDownCircle className="w-3.5 h-3.5 text-destructive" />
                ) : (
                  <ArrowUpCircle className="w-3.5 h-3.5 text-success" />
                )}

                <div className="min-w-0">
                  <p className={cn('font-medium truncate', isExcluded && 'line-through')}>
                    {tx.description}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">{tx.costCenter}</Badge>
                    {tx.priority === 'crítica' && (
                      <Badge className="text-[9px] h-4 px-1.5 bg-destructive/10 text-destructive border-none">Crítica</Badge>
                    )}
                    {tx.priority === 'alta' && (
                      <Badge className="text-[9px] h-4 px-1.5 border-none" style={{ background: 'hsl(var(--warning) / 0.1)', color: 'hsl(var(--warning))' }}>Alta</Badge>
                    )}
                  </div>
                </div>

                <span className={cn('font-mono font-semibold text-right', tx.type === 'pagar' ? 'text-destructive' : 'text-success')}>
                  {tx.type === 'pagar' ? '-' : '+'}{formatCurrency(tx.amount)}
                </span>

                <span className="text-muted-foreground text-center text-[11px]">
                  {getDayMonth(tx.dueDate)}
                </span>

                <div className="flex items-center gap-1.5">
                  <CalendarClock className="w-3 h-3 text-muted-foreground shrink-0" />
                  <Input
                    type="date"
                    className="h-6 text-[10px] px-1.5"
                    value={isDeferred ? (mod as { type: 'defer'; newDate: string }).newDate : ''}
                    min={today}
                    onChange={e => setDefer(tx.id, e.target.value)}
                    disabled={isExcluded}
                  />
                </div>
              </div>
            );
          })}
          {manipulable.length === 0 && (
            <div className="p-10 text-center text-xs text-muted-foreground">
              Nenhuma transação futura encontrada
            </div>
          )}
        </div>
      </motion.div>

      {/* Empty state hint */}
      {!analysis.hasChanges && (
        <motion.div
          {...sect(0.25)}
          className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 rounded-xl p-4 border border-dashed border-border"
        >
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <span>Desative pagamentos, adie datas ou adicione transações hipotéticas para simular cenários e ver o impacto no fluxo de caixa.</span>
        </motion.div>
      )}
    </div>
  );
}

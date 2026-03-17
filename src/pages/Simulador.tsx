import { useState, useMemo, useCallback } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween } from '@/lib/helpers';
import { Transaction, CostCenter, COST_CENTERS, PAGAR_CATEGORIES, RECEBER_CATEGORIES } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, ComposedChart, Bar,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Beaker, CalendarClock, RotateCcw, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, TrendingUp, TrendingDown, Plus, Trash2, Shield,
  Zap, Target, Clock, DollarSign, Lightbulb, ChevronRight,
  Activity, Flame, BarChart3, X,
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

  // Upcoming transactions that can be manipulated
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

  // Compute simulated projection with full analysis
  const analysis = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;

    // Build modified transaction set
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

    // Days until negative
    const origNegIdx = points.findIndex(p => p.original < 0);
    const simNegIdx = points.findIndex(p => p.simulated < 0);
    const origNegDate = origNegIdx >= 0 ? points[origNegIdx].date : null;
    const simNegDate = simNegIdx >= 0 ? points[simNegIdx].date : null;

    // Runway calculation
    const origRunway = origNegIdx >= 0 ? origNegIdx : null;
    const simRunway = simNegIdx >= 0 ? simNegIdx : null;
    const daysGained = origRunway !== null && simRunway !== null ? simRunway - origRunway
      : origRunway !== null && simRunway === null ? period - origRunway
        : null;

    // Excluded total
    const excludedTotal = Array.from(modifications.entries())
      .filter(([, m]) => m.type === 'exclude')
      .reduce((sum, [id]) => {
        const tx = transactions.find(t => t.id === id);
        return sum + (tx?.amount ?? 0);
      }, 0);

    const deferredCount = Array.from(modifications.values()).filter(m => m.type === 'defer').length;
    const excludedCount = Array.from(modifications.values()).filter(m => m.type === 'exclude').length;

    // Auto-recommendations: find best payables to defer for maximum impact
    const pendingPayables = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today)
      .sort((a, b) => b.amount - a.amount);

    const recommendations: { tx: Transaction; reason: string; impact: string }[] = [];

    if (origNegIdx >= 0) {
      // Find which payments, if deferred, would eliminate the negative
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
        const testNeg = points.some((p, i) => {
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

    return {
      chartData: points,
      origMin, simMin, origEnd, simEnd,
      origMinDate, simMinDate,
      origRunway, simRunway,
      origNegDate, simNegDate,
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
    };
  }, [transactions, modifications, hypotheticals, currentBalance, projectedBalance, today, period]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const orig = payload.find((p: any) => p.dataKey === 'original')?.value ?? 0;
    const sim = payload.find((p: any) => p.dataKey === 'simulated')?.value ?? 0;
    const delta = sim - orig;
    return (
      <div className="bg-card border rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[200px]">
        <p className="font-semibold text-foreground">{label}</p>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Original</span>
          <span className={cn('font-mono font-medium', orig >= 0 ? 'text-foreground' : 'text-destructive')}>{formatCurrency(orig)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Simulado</span>
          <span className={cn('font-mono font-bold', sim >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(sim)}</span>
        </div>
        {analysis.hasChanges && (
          <div className="flex justify-between border-t border-border pt-2">
            <span className="text-muted-foreground">Diferença</span>
            <span className={cn('font-mono font-bold', delta >= 0 ? 'text-success' : 'text-destructive')}>
              {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
            </span>
          </div>
        )}
      </div>
    );
  };

  const MetricCard = ({ icon: Icon, label, value, sub, variant = 'default' }: {
    icon: any; label: string; value: string; sub?: string;
    variant?: 'default' | 'success' | 'danger' | 'accent';
  }) => {
    const styles = {
      default: 'bg-muted/50 border-border',
      success: 'bg-success/5 border-success/20',
      danger: 'bg-destructive/5 border-destructive/20',
      accent: 'bg-accent/5 border-accent/20',
    };
    const iconStyles = {
      default: 'text-muted-foreground',
      success: 'text-success',
      danger: 'text-destructive',
      accent: 'text-accent',
    };
    return (
      <div className={cn('rounded-xl border p-4 space-y-2', styles[variant])}>
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', iconStyles[variant])} />
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
        </div>
        <p className="text-lg font-bold font-mono tracking-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Beaker className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Simulador de Cenários</h1>
            <p className="text-xs text-muted-foreground">Simule decisões financeiras e veja o impacto em tempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {analysis.hasChanges && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={resetAll}>
              <RotateCcw className="w-3.5 h-3.5" /> Resetar tudo
            </Button>
          )}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {[30, 45, 60, 90].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                  period === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status bar */}
      {analysis.hasChanges && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'rounded-xl border p-4 flex items-center justify-between',
            analysis.deltaEnd >= 0 ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
          )}
        >
          <div className="flex items-center gap-3">
            {analysis.deltaEnd >= 0 ? (
              <TrendingUp className="w-5 h-5 text-success" />
            ) : (
              <TrendingDown className="w-5 h-5 text-destructive" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {analysis.deltaEnd >= 0 ? 'Cenário positivo' : 'Cenário negativo'}
                {' — '}
                <span className={cn('font-mono', analysis.deltaEnd >= 0 ? 'text-success' : 'text-destructive')}>
                  {analysis.deltaEnd >= 0 ? '+' : ''}{formatCurrency(analysis.deltaEnd)}
                </span>
                {' '} em {period} dias
              </p>
              <p className="text-[11px] text-muted-foreground">
                {analysis.excludedCount > 0 && `${analysis.excludedCount} excluído${analysis.excludedCount > 1 ? 's' : ''}`}
                {analysis.excludedCount > 0 && analysis.deferredCount > 0 && ' · '}
                {analysis.deferredCount > 0 && `${analysis.deferredCount} adiado${analysis.deferredCount > 1 ? 's' : ''}`}
                {(analysis.excludedCount > 0 || analysis.deferredCount > 0) && analysis.hypotheticalCount > 0 && ' · '}
                {analysis.hypotheticalCount > 0 && `${analysis.hypotheticalCount} hipotético${analysis.hypotheticalCount > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          {analysis.daysGained !== null && (
            <Badge variant="outline" className={cn(
              'text-xs font-semibold',
              analysis.daysGained > 0 ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'
            )}>
              <Clock className="w-3 h-3 mr-1" />
              {analysis.daysGained > 0 ? '+' : ''}{analysis.daysGained} dias de runway
            </Badge>
          )}
        </motion.div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard
          icon={DollarSign}
          label="Saldo atual"
          value={formatCurrency(analysis.currentBal)}
          variant="default"
        />
        <MetricCard
          icon={Target}
          label={`Saldo em ${period}d (original)`}
          value={formatCurrency(analysis.origEnd)}
          sub={analysis.origNegDate ? `⚠ Negativo em ${getDayMonth(analysis.origNegDate)}` : 'Saudável'}
          variant={analysis.origEnd < 0 ? 'danger' : 'default'}
        />
        <MetricCard
          icon={Beaker}
          label={`Saldo em ${period}d (simulado)`}
          value={formatCurrency(analysis.simEnd)}
          sub={analysis.simNegDate ? `⚠ Negativo em ${getDayMonth(analysis.simNegDate)}` : 'Saudável'}
          variant={analysis.simEnd < 0 ? 'danger' : 'accent'}
        />
        <MetricCard
          icon={Activity}
          label="Saldo mínimo simulado"
          value={formatCurrency(analysis.simMin)}
          sub={analysis.simMinDate ? `Em ${getDayMonth(analysis.simMinDate)}` : ''}
          variant={analysis.simMin < 0 ? 'danger' : 'success'}
        />
        <MetricCard
          icon={Shield}
          label="Impacto no mínimo"
          value={`${analysis.deltaMin >= 0 ? '+' : ''}${formatCurrency(analysis.deltaMin)}`}
          sub={analysis.hasChanges ? 'vs cenário original' : 'Sem alterações'}
          variant={analysis.deltaMin >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Main content: Chart + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chart */}
        <div className="lg:col-span-8 card-elevated p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              <h2 className="font-semibold text-sm">Projeção comparativa</h2>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-0 border-t-2 border-dashed" style={{ borderColor: 'hsl(var(--muted-foreground))' }} /> Original
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-0.5 rounded" style={{ background: 'hsl(var(--accent))' }} /> Simulado
              </span>
            </div>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analysis.chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <defs>
                  <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.7} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} interval={Math.floor(period / 8)} />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="original"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  fill="none"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="simulated"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2.5}
                  fill="url(#simGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(var(--accent))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recommendations panel */}
        <div className="lg:col-span-4 space-y-4">
          {/* Auto-recommendations */}
          <div className="card-elevated p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-warning" />
              <h3 className="font-semibold text-sm">Recomendações</h3>
            </div>
            {analysis.recommendations.length > 0 ? (
              <div className="space-y-2">
                {analysis.recommendations.slice(0, 3).map((rec, i) => (
                  <button
                    key={rec.tx.id}
                    onClick={() => setDefer(rec.tx.id, addDays(today, period))}
                    className="w-full text-left p-3 rounded-lg border border-border hover:border-accent/30 hover:bg-accent/5 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium truncate flex-1">{rec.tx.description}</p>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{rec.reason}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] font-mono text-destructive">{formatCurrency(rec.tx.amount)}</span>
                      <Badge variant="outline" className="text-[9px] h-4 border-success/30 text-success">{rec.impact}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Shield className="w-8 h-8 text-success/50 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {analysis.origRunway === null
                    ? 'Caixa saudável no período. Nenhuma ação urgente necessária.'
                    : 'Aplique as modificações acima para ver recomendações.'}
                </p>
              </div>
            )}
          </div>

          {/* Hypothetical transactions */}
          <div className="card-elevated p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm">Transações hipotéticas</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {showAddForm ? 'Fechar' : 'Adicionar'}
              </Button>
            </div>

            <AnimatePresence>
              {showAddForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2.5 p-3 bg-muted/30 rounded-lg border border-dashed border-border">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setNewType('pagar')}
                        className={cn(
                          'flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                          newType === 'pagar' ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <ArrowDownCircle className="w-3 h-3 inline mr-1" /> Despesa
                      </button>
                      <button
                        onClick={() => setNewType('receber')}
                        className={cn(
                          'flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                          newType === 'receber' ? 'bg-success/10 text-success border border-success/20' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <ArrowUpCircle className="w-3 h-3 inline mr-1" /> Receita
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
                        placeholder="Valor"
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
                    <Button size="sm" className="w-full h-8 text-xs" onClick={addHypothetical}>
                      <Plus className="w-3 h-3 mr-1" /> Adicionar ao cenário
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {hypotheticals.length > 0 ? (
              <div className="space-y-1.5">
                {hypotheticals.map(h => (
                  <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg bg-accent/5 border border-accent/10 text-xs">
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
                    <button onClick={() => removeHypothetical(h.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground text-center py-3">
                Adicione transações hipotéticas para simular cenários: contratações, novos contratos, etc.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Transaction manipulation list */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Flame className="w-4 h-4 text-accent" />
            <h2 className="font-semibold text-sm">Transações futuras</h2>
            <Badge variant="secondary" className="text-[10px]">{manipulable.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted rounded-md p-0.5">
              {(['all', 'pagar', 'receber'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={cn(
                    'px-2.5 py-1 text-[10px] font-medium rounded transition-all',
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

        <div className="divide-y max-h-[450px] overflow-y-auto">
          {manipulable.map(tx => {
            const mod = modifications.get(tx.id);
            const isExcluded = mod?.type === 'exclude';
            const isDeferred = mod?.type === 'defer';

            return (
              <div
                key={tx.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-xs transition-colors',
                  isExcluded && 'bg-muted/50 opacity-50',
                  isDeferred && 'bg-accent/5',
                )}
              >
                <Switch
                  checked={!isExcluded}
                  onCheckedChange={() => toggleExclude(tx.id)}
                  className="scale-75"
                />

                {tx.type === 'pagar' ? (
                  <ArrowDownCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                ) : (
                  <ArrowUpCircle className="w-3.5 h-3.5 text-success shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium truncate', isExcluded && 'line-through')}>
                    {tx.description}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">{tx.costCenter}</Badge>
                    {tx.priority === 'crítica' && <Badge className="text-[9px] h-4 px-1.5 bg-destructive/10 text-destructive border-none">Crítica</Badge>}
                    {tx.priority === 'alta' && <Badge className="text-[9px] h-4 px-1.5 border-none" style={{ background: 'hsl(var(--warning) / 0.1)', color: 'hsl(var(--warning))' }}>Alta</Badge>}
                  </div>
                </div>

                <span className={cn('font-mono font-semibold shrink-0', tx.type === 'pagar' ? 'text-destructive' : 'text-success')}>
                  {tx.type === 'pagar' ? '-' : '+'}{formatCurrency(tx.amount)}
                </span>

                <span className="text-muted-foreground shrink-0 w-[52px] text-center">
                  {getDayMonth(tx.dueDate)}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <CalendarClock className="w-3 h-3 text-muted-foreground" />
                  <Input
                    type="date"
                    className="h-6 w-[120px] text-[10px] px-1.5"
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
            <div className="p-8 text-center text-xs text-muted-foreground">
              Nenhuma transação futura encontrada
            </div>
          )}
        </div>
      </div>

      {/* Hint */}
      {!analysis.hasChanges && (
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground bg-muted/30 rounded-xl p-4 border border-dashed border-border">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Desative pagamentos, adie datas ou adicione transações hipotéticas para simular cenários e ver o impacto no caixa.</span>
        </div>
      )}
    </div>
  );
}

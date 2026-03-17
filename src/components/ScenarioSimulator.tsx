import { useState, useMemo, useCallback } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { Transaction } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Line, ComposedChart,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Beaker, CalendarClock, RotateCcw, ArrowDownCircle,
  ChevronDown, ChevronUp, AlertTriangle, TrendingUp,
} from 'lucide-react';

type DeferAction = { type: 'exclude' } | { type: 'defer'; newDate: string };

export default function ScenarioSimulator() {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const today = todayISO();
  const [isOpen, setIsOpen] = useState(false);
  const [modifications, setModifications] = useState<Map<string, DeferAction>>(new Map());

  // Upcoming payables that can be manipulated
  const payables = useMemo(() =>
    transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 15),
    [transactions, today]
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

  const resetAll = useCallback(() => setModifications(new Map()), []);

  // Compute simulated projection
  const { chartData, impact } = useMemo(() => {
    const period = 30;
    const bal = currentBalance?.amount ?? 0;
    const points: { label: string; original: number; simulated: number }[] = [];

    // Build modified transaction set
    const modifiedTxs = transactions.map(t => {
      const mod = modifications.get(t.id);
      if (!mod) return t;
      if (mod.type === 'exclude') return { ...t, status: 'confirmado' as const }; // effectively remove
      if (mod.type === 'defer') return { ...t, dueDate: mod.newDate };
      return t;
    });

    for (let i = 0; i <= period; i++) {
      const date = addDays(today, i);
      const original = projectedBalance(date);

      // Simulated balance
      let simBal = bal;
      for (const tx of modifiedTxs) {
        if (tx.status === 'confirmado') continue;
        if (tx.dueDate > date) continue;
        if (tx.type === 'receber') {
          if (tx.status === 'atrasado') continue;
          simBal += tx.amount;
        } else {
          simBal -= tx.amount;
        }
      }

      points.push({
        label: i === 0 ? 'Hoje' : getDayMonth(date),
        original,
        simulated: simBal,
      });
    }

    const origMin = Math.min(...points.map(p => p.original));
    const simMin = Math.min(...points.map(p => p.simulated));
    const origEnd = points[points.length - 1]?.original ?? 0;
    const simEnd = points[points.length - 1]?.simulated ?? 0;

    // Days until negative in each scenario
    const origNeg = points.findIndex(p => p.original < 0);
    const simNeg = points.findIndex(p => p.simulated < 0);

    return {
      chartData: points,
      impact: {
        origMin, simMin, origEnd, simEnd,
        gainedDays: origNeg >= 0 && simNeg < 0 ? 'Eliminado' :
          origNeg >= 0 && simNeg >= 0 ? simNeg - origNeg :
            simNeg >= 0 ? -(simNeg) : null,
        deltaEnd: simEnd - origEnd,
        deltaMin: simMin - origMin,
        hasChanges: modifications.size > 0,
      },
    };
  }, [transactions, modifications, currentBalance, projectedBalance, today]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const orig = payload.find((p: any) => p.dataKey === 'original')?.value ?? 0;
    const sim = payload.find((p: any) => p.dataKey === 'simulated')?.value ?? 0;
    return (
      <div className="bg-card border rounded-lg p-3 shadow-xl text-xs space-y-1.5 min-w-[170px]">
        <p className="font-semibold">{label}</p>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Original</span>
          <span className={cn('font-mono', orig >= 0 ? 'text-foreground' : 'text-destructive')}>{formatCurrency(orig)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Simulado</span>
          <span className={cn('font-mono font-bold', sim >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(sim)}</span>
        </div>
        {impact.hasChanges && (
          <div className="flex justify-between border-t pt-1">
            <span className="text-muted-foreground">Diferença</span>
            <span className={cn('font-mono', sim - orig >= 0 ? 'text-success' : 'text-destructive')}>
              {sim - orig >= 0 ? '+' : ''}{formatCurrency(sim - orig)}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card-elevated overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 border-b flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Beaker className="w-4 h-4 text-accent" />
          </div>
          <div className="text-left">
            <h2 className="font-semibold text-sm">Simulador de Cenários</h2>
            <p className="text-[10px] text-muted-foreground">E se eu adiar ou excluir pagamentos?</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {impact.hasChanges && (
            <span className={cn(
              'text-xs font-semibold px-2.5 py-1 rounded-full',
              impact.deltaEnd >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
            )}>
              {impact.deltaEnd >= 0 ? '+' : ''}{formatCurrency(impact.deltaEnd)} em 30d
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Impact summary */}
              {impact.hasChanges && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo mín. original</p>
                    <p className={cn('text-sm font-bold font-mono mt-0.5', impact.origMin >= 0 ? 'text-foreground' : 'text-destructive')}>
                      {formatCurrency(impact.origMin)}
                    </p>
                  </div>
                  <div className="bg-accent/5 rounded-lg p-3 text-center border border-accent/20">
                    <p className="text-[10px] text-accent uppercase tracking-wider font-medium">Saldo mín. simulado</p>
                    <p className={cn('text-sm font-bold font-mono mt-0.5', impact.simMin >= 0 ? 'text-accent' : 'text-destructive')}>
                      {formatCurrency(impact.simMin)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Impacto no mín.</p>
                    <p className={cn('text-sm font-bold font-mono mt-0.5', impact.deltaMin >= 0 ? 'text-success' : 'text-destructive')}>
                      {impact.deltaMin >= 0 ? '+' : ''}{formatCurrency(impact.deltaMin)}
                    </p>
                  </div>
                </div>
              )}

              {/* Chart: original vs simulated */}
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 15% 89%)" strokeOpacity={0.7} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(200, 10%, 46%)' }} tickLine={false} interval={3} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(200, 10%, 46%)' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="hsl(0, 72%, 51%)" strokeWidth={1} strokeOpacity={0.5} />
                    <Area
                      type="monotone"
                      dataKey="original"
                      stroke="hsl(200, 10%, 70%)"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      fill="none"
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="simulated"
                      stroke="hsl(197, 68%, 32%)"
                      strokeWidth={2.5}
                      fill="hsl(197, 68%, 32%)"
                      fillOpacity={0.08}
                      dot={false}
                      activeDot={{ r: 4, fill: 'hsl(197, 68%, 32%)', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-0 border-t-2 border-dashed" style={{ borderColor: 'hsl(200, 10%, 70%)' }} /> Original
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-0.5 rounded" style={{ background: 'hsl(197, 68%, 32%)' }} /> Simulado
                </span>
              </div>

              {/* Payment list with toggles */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Pagamentos futuros</p>
                {modifications.size > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={resetAll}>
                    <RotateCcw className="w-3 h-3" /> Resetar
                  </Button>
                )}
              </div>

              <div className="divide-y rounded-lg border overflow-hidden max-h-[320px] overflow-y-auto">
                {payables.map(tx => {
                  const mod = modifications.get(tx.id);
                  const isExcluded = mod?.type === 'exclude';
                  const isDeferred = mod?.type === 'defer';

                  return (
                    <div
                      key={tx.id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 text-xs transition-colors',
                        isExcluded && 'bg-muted/50 opacity-60',
                        isDeferred && 'bg-accent/5',
                      )}
                    >
                      {/* Exclude toggle */}
                      <Switch
                        checked={!isExcluded}
                        onCheckedChange={() => toggleExclude(tx.id)}
                        className="scale-75"
                      />

                      <ArrowDownCircle className="w-3.5 h-3.5 text-destructive shrink-0" />

                      <div className="flex-1 min-w-0">
                        <p className={cn('font-medium truncate', isExcluded && 'line-through')}>
                          {tx.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</p>
                      </div>

                      <span className="font-mono font-semibold text-destructive shrink-0">
                        {formatCurrency(tx.amount)}
                      </span>

                      <span className="text-muted-foreground shrink-0 w-[52px] text-center">
                        {getDayMonth(tx.dueDate)}
                      </span>

                      {/* Defer date picker */}
                      <div className="flex items-center gap-1 shrink-0">
                        <CalendarClock className="w-3 h-3 text-muted-foreground" />
                        <Input
                          type="date"
                          className="h-6 w-[120px] text-[10px] px-1.5"
                          value={isDeferred ? (mod as { type: 'defer'; newDate: string }).newDate : ''}
                          min={today}
                          onChange={e => setDefer(tx.id, e.target.value)}
                          disabled={isExcluded}
                          placeholder="Adiar para..."
                        />
                      </div>
                    </div>
                  );
                })}
                {payables.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Nenhum pagamento futuro encontrado
                  </div>
                )}
              </div>

              {/* Action hint */}
              {!impact.hasChanges && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-3">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Desative pagamentos ou adie datas acima para simular cenários e ver o impacto no caixa.</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

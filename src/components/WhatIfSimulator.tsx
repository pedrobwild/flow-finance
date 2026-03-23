import { useState, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO, addDays, daysBetween } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertTriangle, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { PeriodRange } from '@/components/DashboardPeriodFilter';

interface Props {
  period?: PeriodRange;
}

export default function WhatIfSimulator({ period }: Props) {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const { obras } = useObras();
  const today = todayISO();

  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa'), [obras]);

  // Find biggest upcoming receivables for quick scenarios
  const topReceivables = useMemo(() => {
    return transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [transactions, today]);

  const scenarios = useMemo(() => {
    const items: { id: string; label: string; description: string; delayDays: number; txIds: string[] }[] = [];

    // Per-obra scenarios
    activeObras.forEach(obra => {
      const obraReceivables = topReceivables.filter(t => t.obraId === obra.id);
      if (obraReceivables.length > 0) {
        const total = obraReceivables.reduce((s, t) => s + t.amount, 0);
        items.push({
          id: `obra-${obra.id}-30`,
          label: `${obra.code} atrasa 30d`,
          description: `${formatCurrency(total)} em recebíveis atrasam 30 dias`,
          delayDays: 30,
          txIds: obraReceivables.map(t => t.id),
        });
      }
    });

    // Global: biggest receivable delays
    if (topReceivables.length > 0) {
      const biggest = topReceivables[0];
      const obraRef = biggest.obraId ? obras.find(o => o.id === biggest.obraId) : null;
      items.push({
        id: `biggest-15`,
        label: `Maior recebível atrasa 15d`,
        description: `${formatCurrency(biggest.amount)} de ${biggest.counterpart || obraRef?.code || 'N/A'}`,
        delayDays: 15,
        txIds: [biggest.id],
      });
      items.push({
        id: `biggest-30`,
        label: `Maior recebível atrasa 30d`,
        description: `${formatCurrency(biggest.amount)} de ${biggest.counterpart || obraRef?.code || 'N/A'}`,
        delayDays: 30,
        txIds: [biggest.id],
      });
    }

    // All receivables delay
    if (topReceivables.length > 1) {
      const total = topReceivables.reduce((s, t) => s + t.amount, 0);
      items.push({
        id: `all-15`,
        label: `Todos recebíveis atrasam 15d`,
        description: `${formatCurrency(total)} total atrasado`,
        delayDays: 15,
        txIds: topReceivables.map(t => t.id),
      });
    }

    return items;
  }, [activeObras, topReceivables, obras]);

  const simulation = useMemo(() => {
    if (!selectedScenario) return null;
    const scenario = scenarios.find(s => s.id === selectedScenario);
    if (!scenario) return null;

    const bal = currentBalance?.amount ?? 0;
    const periodEnd = period?.to ?? addDays(today, 30);
    const days = Math.max(1, daysBetween(today, periodEnd));

    // Simulate: move delayed receivables forward
    const delayedSet = new Set(scenario.txIds);
    const simTx = transactions.map(t => {
      if (delayedSet.has(t.id)) {
        return { ...t, dueDate: addDays(t.dueDate, scenario.delayDays) };
      }
      return t;
    });

    // Calculate projected balance day by day
    const originalFlow: number[] = [];
    const simulatedFlow: number[] = [];
    let minSimBal = bal;
    let minSimDay = 0;

    for (let d = 0; d <= days; d++) {
      const date = addDays(today, d);
      // Original
      const origIn = transactions.filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate === date).reduce((s, t) => s + t.amount, 0);
      const origOut = transactions.filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate === date).reduce((s, t) => s + t.amount, 0);
      // Simulated
      const simIn = simTx.filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate === date).reduce((s, t) => s + t.amount, 0);
      const simOut = simTx.filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate === date).reduce((s, t) => s + t.amount, 0);

      const prevOrig = d > 0 ? originalFlow[d - 1] : bal;
      const prevSim = d > 0 ? simulatedFlow[d - 1] : bal;

      originalFlow.push(prevOrig + origIn - origOut);
      simulatedFlow.push(prevSim + simIn - simOut);

      if (simulatedFlow[d] < minSimBal) {
        minSimBal = simulatedFlow[d];
        minSimDay = d;
      }
    }

    const originalEnd = originalFlow[originalFlow.length - 1] ?? bal;
    const simulatedEnd = simulatedFlow[simulatedFlow.length - 1] ?? bal;
    const impact = simulatedEnd - originalEnd;
    const goesNegative = minSimBal < 0;

    return {
      scenario,
      originalEnd,
      simulatedEnd,
      impact,
      goesNegative,
      minSimBal,
      minSimDay,
    };
  }, [selectedScenario, scenarios, transactions, currentBalance, period, today]);

  if (scenarios.length === 0) return null;

  return (
    <div className="card-elevated overflow-hidden">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-left">
            <h2 className="text-xs font-bold">Simulador What-If</h2>
            <p className="text-[10px] text-muted-foreground">Simule atrasos e veja o impacto no caixa</p>
          </div>
        </div>
        <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200', expanded && 'rotate-90')} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t space-y-3">
              <div className="flex items-center gap-2">
                <Select
                  value={selectedScenario ?? ''}
                  onValueChange={(v) => setSelectedScenario(v || null)}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Escolha um cenário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarios.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedScenario && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setSelectedScenario(null)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              {simulation && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-3"
                >
                  <p className="text-[11px] text-muted-foreground">{simulation.scenario.description}</p>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg border bg-card text-center">
                      <p className="text-[9px] text-muted-foreground">Projeção Original</p>
                      <p className="text-xs font-bold text-foreground">{formatCurrency(simulation.originalEnd)}</p>
                    </div>
                    <div className="p-2.5 rounded-lg border bg-card text-center">
                      <p className="text-[9px] text-muted-foreground">Com Atraso</p>
                      <p className={cn('text-xs font-bold', simulation.simulatedEnd < 0 ? 'text-destructive' : 'text-foreground')}>
                        {formatCurrency(simulation.simulatedEnd)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg border bg-card text-center">
                      <p className="text-[9px] text-muted-foreground">Impacto</p>
                      <p className={cn('text-xs font-bold', simulation.impact < 0 ? 'text-destructive' : 'text-emerald-600')}>
                        {formatCurrency(simulation.impact)}
                      </p>
                    </div>
                  </div>

                  {simulation.goesNegative && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/15">
                      <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                      <p className="text-[11px] text-destructive">
                        Caixa ficará negativo ({formatCurrency(simulation.minSimBal)}) em {simulation.minSimDay} dia(s).
                        Ação preventiva necessária.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

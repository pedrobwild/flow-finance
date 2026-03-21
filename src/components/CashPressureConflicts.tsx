import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Flame, Calendar, AlertTriangle, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ConflictWeek {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  totalSaidas: number;
  obras: { code: string; clientName: string; total: number; categories: string[] }[];
  percentOfBalance: number;
  severity: 'critical' | 'high' | 'moderate';
}

interface PressureItem {
  obraCode: string;
  clientName: string;
  category: string;
  counterpart: string;
  amount: number;
  dueDate: string;
  dueDateLabel: string;
  impact: 'alto' | 'médio' | 'baixo';
}

export default function CashPressureConflicts() {
  const { obras } = useObras();
  const { transactions, currentBalance } = useFinance();
  const today = todayISO();
  const bal = currentBalance?.amount ?? 0;

  const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa'), [obras]);

  // Stage conflicts: multiple obras entering same expensive stage type in overlapping periods
  const stageConflicts = useMemo(() => {
    const upcoming = stages.filter(s =>
      s.status !== 'concluida' && s.estimatedStartDate &&
      s.estimatedStartDate >= today && s.estimatedStartDate <= addDays(today, 42)
    );
    // Group by stage name
    const byName = new Map<string, typeof upcoming>();
    upcoming.forEach(s => {
      const arr = byName.get(s.name) || [];
      arr.push(s);
      byName.set(s.name, arr);
    });

    const conflicts: { stageName: string; obras: { code: string; client: string; value: number; date: string }[]; totalValue: number }[] = [];
    byName.forEach((items, name) => {
      if (items.length >= 2) {
        const obraDetails = items.map(s => {
          const obra = activeObras.find(o => o.id === s.obraId);
          return { code: obra?.code || '?', client: obra?.clientName || '?', value: s.estimatedValue, date: getDayMonth(s.estimatedStartDate!) };
        });
        conflicts.push({ stageName: name, obras: obraDetails, totalValue: obraDetails.reduce((s, o) => s + o.value, 0) });
      }
    });
    return conflicts.sort((a, b) => b.totalValue - a.totalValue).slice(0, 3);
  }, [stages, activeObras, today]);

  // Conflict detection: weeks where multiple obras compete for cash
  const conflicts = useMemo((): ConflictWeek[] => {
    const result: ConflictWeek[] = [];

    for (let w = 0; w < 6; w++) {
      const ws = addDays(today, w * 7);
      const we = addDays(today, w * 7 + 6);

      const obraWeekData = activeObras
        .map(obra => {
          const txs = transactions.filter(
            t => t.obraId === obra.id && t.type === 'pagar' && t.status !== 'confirmado' &&
              t.dueDate >= ws && t.dueDate <= we
          );
          const total = txs.reduce((s, t) => s + t.amount, 0);
          const categories = [...new Set(txs.map(t => t.category))];
          return { code: obra.code, clientName: obra.clientName, total, categories };
        })
        .filter(o => o.total > 0);

      // Also add corporate
      const corpTxs = transactions.filter(
        t => !t.obraId && t.type === 'pagar' && t.status !== 'confirmado' &&
          t.dueDate >= ws && t.dueDate <= we
      );
      const corpTotal = corpTxs.reduce((s, t) => s + t.amount, 0);
      if (corpTotal > 2000) {
        obraWeekData.push({ code: 'CORP', clientName: 'Corporativo', total: corpTotal, categories: [...new Set(corpTxs.map(t => t.category))] });
      }

      if (obraWeekData.length >= 2) {
        const totalSaidas = obraWeekData.reduce((s, o) => s + o.total, 0);
        const pctBal = bal > 0 ? (totalSaidas / bal) * 100 : 100;

        let severity: 'critical' | 'high' | 'moderate' = 'moderate';
        if (pctBal > 60) severity = 'critical';
        else if (pctBal > 35) severity = 'high';

        result.push({
          weekLabel: w === 0 ? 'Esta semana' : `${getDayMonth(ws)}–${getDayMonth(we)}`,
          weekStart: ws,
          weekEnd: we,
          totalSaidas,
          obras: obraWeekData.sort((a, b) => b.total - a.total),
          percentOfBalance: pctBal,
          severity,
        });
      }
    }

    return result
      .filter(c => c.percentOfBalance > 20) // only show meaningful conflicts
      .sort((a, b) => b.percentOfBalance - a.percentOfBalance)
      .slice(0, 3);
  }, [activeObras, transactions, today, bal]);

  // Pressure ranking: top upcoming payments
  const pressureItems = useMemo((): PressureItem[] => {
    const upcoming = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 30))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    return upcoming.map(t => {
      const obra = activeObras.find(o => o.id === t.obraId);
      const pctBal = bal > 0 ? (t.amount / bal) * 100 : 100;
      let impact: 'alto' | 'médio' | 'baixo' = 'baixo';
      if (pctBal > 25) impact = 'alto';
      else if (pctBal > 10) impact = 'médio';

      return {
        obraCode: obra?.code || 'CORP',
        clientName: obra?.clientName || 'Corporativo',
        category: t.category,
        counterpart: t.counterpart || '—',
        amount: t.amount,
        dueDate: t.dueDate,
        dueDateLabel: getDayMonth(t.dueDate),
        impact,
      };
    });
  }, [transactions, activeObras, today, bal]);

  if (conflicts.length === 0 && pressureItems.length === 0 && stageConflicts.length === 0) return null;

  const severityConfig = {
    critical: { bg: 'bg-destructive/5', border: 'border-destructive/20', text: 'text-destructive', label: 'Crítico' },
    high: { bg: 'bg-warning/5', border: 'border-warning/20', text: 'text-warning', label: 'Alto' },
    moderate: { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground', label: 'Moderado' },
  };

  const impactConfig = {
    alto: { bg: 'bg-destructive/10', text: 'text-destructive' },
    médio: { bg: 'bg-warning/10', text: 'text-warning' },
    baixo: { bg: 'bg-muted', text: 'text-muted-foreground' },
  };

  return (
    <div className="card-elevated">
      {/* Stage conflicts */}
      {stageConflicts.length > 0 && (
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold">Etapas que disputam caixa</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Múltiplas obras entrando na mesma etapa simultaneamente
          </p>
          <div className="space-y-2">
            {stageConflicts.map((sc, i) => (
              <motion.div
                key={sc.stageName}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                className="rounded-lg border border-accent/20 bg-accent/5 p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold">{sc.stageName}</span>
                  <span className="text-xs font-mono font-bold text-accent">{formatCurrency(sc.totalValue)}</span>
                </div>
                <div className="space-y-0.5">
                  {sc.obras.map((o, j) => (
                    <div key={j} className="flex items-center justify-between text-[11px]">
                      <span><span className="font-mono text-muted-foreground">{o.code}</span> · {o.client} <span className="text-muted-foreground">({o.date})</span></span>
                      <span className="font-mono text-muted-foreground">{formatCurrency(o.value)}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Cash conflicts section */}
      {conflicts.length > 0 && (
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-destructive" />
            <h2 className="text-sm font-semibold">Onde o caixa trava o cronograma</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Semanas com múltiplas obras disputando o mesmo caixa
          </p>

          <div className="space-y-3">
            {conflicts.map((conflict, i) => {
              const config = severityConfig[conflict.severity];
              return (
                <motion.div
                  key={conflict.weekStart}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  className={cn('rounded-lg border p-3', config.bg, config.border)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold">{conflict.weekLabel}</span>
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', config.text)}>
                        {config.label}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold font-mono text-destructive">
                        {formatCurrency(conflict.totalSaidas)}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({Math.round(conflict.percentOfBalance)}% do saldo)
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {conflict.obras.map((obra, j) => (
                      <div key={j} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="font-mono text-[10px] text-muted-foreground">{obra.code}</span>
                          <span className="truncate">{obra.clientName}</span>
                          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                            ({obra.categories.join(', ')})
                          </span>
                        </div>
                        <span className="font-mono font-medium text-destructive flex-shrink-0 ml-2">
                          {formatCurrency(obra.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pressure ranking */}
      {pressureItems.length > 0 && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h2 className="text-sm font-semibold">Próximas pressões de caixa</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Maiores saídas previstas nos próximos 30 dias
          </p>

          <div className="space-y-1">
            {pressureItems.map((item, i) => {
              const ic = impactConfig[item.impact];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="text-xs text-muted-foreground w-7 text-right font-mono">{i + 1}.</span>
                  <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 shrink-0">
                    {item.obraCode}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{item.category}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground truncate">{item.counterpart}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{item.dueDateLabel}</span>
                  <span className="text-xs font-mono font-bold text-destructive shrink-0 w-20 text-right">
                    {formatCurrency(item.amount)}
                  </span>
                  <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 shrink-0', ic.text, ic.bg)}>
                    {item.impact}
                  </Badge>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

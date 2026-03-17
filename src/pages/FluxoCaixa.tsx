import { useState, useMemo, useEffect, Fragment } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, getWeekdayName } from '@/lib/helpers';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, ChevronRight, Calendar, TrendingDown, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import CashFlowAreaChart from '@/components/CashFlowAreaChart';
import { Transaction } from '@/lib/types';

interface DayRow {
  date: string;
  label: string;
  weekday: string;
  entradas: number;
  saidas: number;
  saldoDia: number;
  accumulated: number;
  transactions: Transaction[];
  isToday: boolean;
  isWeekend: boolean;
  txCount: number;
}

export default function FluxoCaixa() {
  const { transactions, currentBalance } = useFinance();
  const [period, setPeriod] = useState(30);
  const [initialBalance, setInitialBalance] = useState(0);
  const [alertThreshold, setAlertThreshold] = useState(20000);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const today = todayISO();

  useEffect(() => {
    if (currentBalance) setInitialBalance(currentBalance.amount);
  }, [currentBalance]);

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const overduePayables = useMemo(() =>
    transactions.filter(t => t.type === 'pagar' && t.status === 'atrasado' && t.dueDate < today),
    [transactions, today]
  );
  const overduePayablesTotal = overduePayables.reduce((s, t) => s + t.amount, 0);

  const days: DayRow[] = useMemo(() => {
    const result: DayRow[] = [];
    let accumulated = initialBalance - overduePayablesTotal;

    for (let i = 0; i < period; i++) {
      const date = addDays(today, i);
      const dayTxs = transactions.filter(t =>
        t.status !== 'confirmado' && t.dueDate === date
      );
      const entradas = dayTxs.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
      const saidas = dayTxs.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
      const saldoDia = entradas - saidas;
      accumulated += saldoDia;

      const dayDate = new Date(date + 'T12:00:00');
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

      result.push({
        date,
        label: getDayMonth(date),
        weekday: getWeekdayName(date),
        entradas,
        saidas,
        saldoDia,
        accumulated,
        transactions: dayTxs,
        isToday: date === today,
        isWeekend,
        txCount: dayTxs.length,
      });
    }
    return result;
  }, [transactions, initialBalance, overduePayablesTotal, period, today]);

  const finalBalance = days.length > 0 ? days[days.length - 1].accumulated : initialBalance;
  const minDay = days.length > 0 ? days.reduce((min, d) => d.accumulated < min.accumulated ? d : min, days[0]) : null;

  // Month progress
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthProgress = Math.round((dayOfMonth / daysInMonth) * 100);

  // Summary stats
  const totalEntradas = days.reduce((s, d) => s + d.entradas, 0);
  const totalSaidas = days.reduce((s, d) => s + d.saidas, 0);
  const daysWithMovement = days.filter(d => d.txCount > 0).length;
  const dangerDays = days.filter(d => d.accumulated < 0).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fluxo de Caixa</h1>
          <p className="text-muted-foreground text-sm mt-1">Projeção dia a dia do saldo financeiro.</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-muted-foreground uppercase">Mês {monthProgress}% executado</p>
          <Progress value={monthProgress} className="w-32 h-1.5 mt-1" />
        </div>
      </div>

      {/* Controls — responsive grid */}
      <div className="card-elevated p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase block mb-1">Saldo inicial (R$)</label>
            <Input
              type="number"
              value={initialBalance}
              onChange={e => setInitialBalance(Number(e.target.value))}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase block mb-1">Período</label>
            <Select value={period.toString()} onValueChange={v => setPeriod(Number(v))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="45">45 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase block mb-1">Alerta se &lt; (R$)</label>
            <Input
              type="number"
              value={alertThreshold}
              onChange={e => setAlertThreshold(Number(e.target.value))}
              className="h-9 text-sm"
            />
          </div>

          {/* Summary cards inside the control bar */}
          <div className={cn(
            'rounded-lg border px-3 py-2 text-center',
            finalBalance >= 0 ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'
          )}>
            <p className="text-[10px] text-muted-foreground uppercase">Saldo Final</p>
            <p className={cn('text-base font-bold font-mono', finalBalance >= 0 ? 'text-success' : 'text-destructive')}>
              {formatCurrency(finalBalance)}
            </p>
          </div>
          {minDay && (
            <div className={cn(
              'rounded-lg border px-3 py-2 text-center',
              minDay.accumulated < 0 ? 'border-destructive/30 bg-destructive/5' : minDay.accumulated < alertThreshold ? 'border-warning/30 bg-warning/5' : 'border-border'
            )}>
              <p className="text-[10px] text-muted-foreground uppercase">Saldo Mínimo</p>
              <p className={cn('text-base font-bold font-mono', minDay.accumulated < 0 ? 'text-destructive' : minDay.accumulated < alertThreshold ? 'text-warning' : 'text-foreground')}>
                {formatCurrency(minDay.accumulated)}
              </p>
              <p className="text-[10px] text-muted-foreground">em {minDay.label}</p>
            </div>
          )}
          <div className="rounded-lg border px-3 py-2 text-center border-border">
            <p className="text-[10px] text-muted-foreground uppercase">Movimentações</p>
            <div className="flex items-center justify-center gap-2 mt-0.5">
              <span className="text-xs font-mono text-success flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />{formatCurrency(totalEntradas)}
              </span>
              <span className="text-xs font-mono text-destructive flex items-center gap-0.5">
                <TrendingDown className="w-3 h-3" />{formatCurrency(totalSaidas)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Overdue warning */}
      {overduePayablesTotal > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span>
            <strong>{formatCurrency(overduePayablesTotal)}</strong> em {overduePayables.length} pagamento(s) atrasado(s) já descontados do saldo inicial.
          </span>
        </div>
      )}

      {dangerDays > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span>
            ⚠️ O saldo fica <strong>negativo em {dangerDays} dia(s)</strong> no período projetado. Revise pagamentos ou antecipe recebimentos.
          </span>
        </div>
      )}

      {/* Area chart FIRST for visual impact */}
      <CashFlowAreaChart days={days} threshold={alertThreshold} />

      {/* Timeline table */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Timeline Dia a Dia</h2>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {daysWithMovement} dias com movimentação · clique para expandir
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-7" />
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Data</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Dia</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase w-10">Mov.</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Entradas</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Saídas</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Saldo dia</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <Fragment key={day.date}>
                  <tr
                    className={cn(
                      'border-b cursor-pointer hover:bg-muted/30 transition-colors',
                      day.accumulated < 0 && 'bg-destructive/5',
                      day.accumulated >= 0 && day.accumulated < alertThreshold && 'bg-warning/5',
                      day.isToday && 'border-l-4 border-l-accent',
                      day.isWeekend && !day.isToday && 'opacity-60'
                    )}
                    onClick={() => day.txCount > 0 && toggleDay(day.date)}
                  >
                    <td className="px-2 py-2">
                      {day.txCount > 0 && (
                        <ChevronRight className={cn(
                          'w-3 h-3 transition-transform text-muted-foreground',
                          expandedDays.has(day.date) && 'rotate-90'
                        )} />
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-xs whitespace-nowrap">
                      {day.isToday && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1.5 align-middle" />}
                      {day.label}
                    </td>
                    <td className="px-3 py-2 text-xs capitalize whitespace-nowrap">
                      {day.isToday ? <span className="font-semibold text-accent">Hoje</span> : day.weekday}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {day.txCount > 0 && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-medium">
                          {day.txCount}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-success">
                      {day.entradas > 0 ? `+${formatCurrency(day.entradas)}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-destructive">
                      {day.saidas > 0 ? `−${formatCurrency(day.saidas)}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-mono text-xs font-medium',
                      day.saldoDia > 0 ? 'text-success' : day.saldoDia < 0 ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {day.saldoDia !== 0 ? formatCurrency(day.saldoDia) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-mono text-xs font-semibold',
                      day.accumulated < 0 ? 'text-destructive' : day.accumulated < alertThreshold ? 'text-warning' : ''
                    )}>
                      {formatCurrency(day.accumulated)}
                      {day.accumulated < 0 && ' ⚠️'}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  <AnimatePresence>
                    {expandedDays.has(day.date) && (
                      <motion.tr
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-b bg-muted/10"
                      >
                        <td colSpan={8} className="px-0 py-0">
                          <div className="px-10 py-3 space-y-1.5">
                            {day.transactions.map(tx => (
                              <div key={tx.id} className="flex items-center gap-3 text-xs py-1 border-b border-dashed border-border/50 last:border-0">
                                <span className={cn(
                                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0',
                                  tx.type === 'pagar' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
                                )}>
                                  {tx.type === 'pagar' ? '↓' : '↑'}
                                </span>
                                <span className="font-medium flex-1 truncate">{tx.description}</span>
                                <span className="text-muted-foreground hidden sm:inline truncate max-w-[120px]">{tx.counterpart}</span>
                                {tx.priority === 'crítica' && (
                                  <span className="status-badge text-[9px] priority-critica">Crítica</span>
                                )}
                                {tx.priority === 'alta' && (
                                  <span className="status-badge text-[9px] priority-alta">Alta</span>
                                )}
                                <span className={cn('font-mono font-semibold whitespace-nowrap',
                                  tx.type === 'pagar' ? 'text-destructive' : 'text-success'
                                )}>
                                  {tx.type === 'pagar' ? '−' : '+'}{formatCurrency(tx.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect, Fragment } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, getWeekdayName } from '@/lib/helpers';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ChevronRight, Calendar, TrendingDown, TrendingUp, ArrowDownRight, ArrowUpRight, Wallet, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import CashFlowAreaChart from '@/components/CashFlowAreaChart';
import { Transaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useFinance as useFinanceCtx } from '@/lib/finance-context';

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
  const { transactions, currentBalance, confirmTransaction } = useFinance();
  const [period, setPeriod] = useState(30);
  const [initialBalance, setInitialBalance] = useState(0);
  const [alertThreshold, setAlertThreshold] = useState(20000);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showControls, setShowControls] = useState(false);
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

  const totalEntradas = days.reduce((s, d) => s + d.entradas, 0);
  const totalSaidas = days.reduce((s, d) => s + d.saidas, 0);
  const daysWithMovement = days.filter(d => d.txCount > 0).length;
  const dangerDays = days.filter(d => d.accumulated < 0).length;
  const netFlow = totalEntradas - totalSaidas;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold leading-tight">Fluxo de Caixa</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Projeção de {period} dias · {daysWithMovement} dias com movimentação
          </p>
        </div>
        <div className="flex items-center gap-2">
          {([15, 30, 45] as const).map(p => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? 'default' : 'outline'}
              className={cn(
                'h-8 px-3 text-xs font-medium transition-all',
                period === p && 'shadow-sm'
              )}
              onClick={() => setPeriod(p)}
            >
              {p} dias
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-muted-foreground"
            onClick={() => setShowControls(!showControls)}
          >
            {showControls ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </motion.div>

      {/* Collapsible controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="card-elevated p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase block mb-1 font-medium tracking-wide">
                    Saldo inicial (R$)
                  </label>
                  <Input
                    type="number"
                    value={initialBalance}
                    onChange={e => setInitialBalance(Number(e.target.value))}
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase block mb-1 font-medium tracking-wide">
                    Alerta abaixo de (R$)
                  </label>
                  <Input
                    type="number"
                    value={alertThreshold}
                    onChange={e => setAlertThreshold(Number(e.target.value))}
                    className="h-9 text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {/* Saldo Atual */}
        <div className="card-elevated p-4 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
              Saldo Atual
            </span>
          </div>
          <p className="text-xl font-bold font-mono tracking-tight">
            {formatCurrency(initialBalance)}
          </p>
        </div>

        {/* Saldo Final */}
        <div className={cn(
          'card-elevated p-4 relative overflow-hidden',
          finalBalance < 0 && 'ring-1 ring-destructive/20'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center',
              finalBalance >= 0 ? 'bg-success/10' : 'bg-destructive/10'
            )}>
              <TrendingUp className={cn('w-3.5 h-3.5', finalBalance >= 0 ? 'text-success' : 'text-destructive')} />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
              Saldo em {period}d
            </span>
          </div>
          <p className={cn(
            'text-xl font-bold font-mono tracking-tight',
            finalBalance >= 0 ? 'text-success' : 'text-destructive'
          )}>
            {formatCurrency(finalBalance)}
          </p>
          <p className={cn(
            'text-[10px] font-mono mt-1',
            netFlow >= 0 ? 'text-success/70' : 'text-destructive/70'
          )}>
            {netFlow >= 0 ? '+' : ''}{formatCurrency(netFlow)} líquido
          </p>
        </div>

        {/* Movimentações */}
        <div className="card-elevated p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
              Entradas
            </span>
          </div>
          <p className="text-xl font-bold font-mono tracking-tight text-success">
            {formatCurrency(totalEntradas)}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <ArrowDownRight className="w-3 h-3 text-destructive/60" />
            <span className="text-[10px] font-mono text-destructive/70">
              {formatCurrency(totalSaidas)} saídas
            </span>
          </div>
        </div>

        {/* Saldo Mínimo / Alerta */}
        {minDay && (
          <div className={cn(
            'card-elevated p-4 relative overflow-hidden',
            minDay.accumulated < 0 && 'ring-1 ring-destructive/20',
            minDay.accumulated >= 0 && minDay.accumulated < alertThreshold && 'ring-1 ring-warning/20',
          )}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center',
                minDay.accumulated < 0 ? 'bg-destructive/10' : minDay.accumulated < alertThreshold ? 'bg-warning/10' : 'bg-muted'
              )}>
                <ShieldAlert className={cn(
                  'w-3.5 h-3.5',
                  minDay.accumulated < 0 ? 'text-destructive' : minDay.accumulated < alertThreshold ? 'text-warning' : 'text-muted-foreground'
                )} />
              </div>
              <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
                Saldo Mínimo
              </span>
            </div>
            <p className={cn(
              'text-xl font-bold font-mono tracking-tight',
              minDay.accumulated < 0 ? 'text-destructive' : minDay.accumulated < alertThreshold ? 'text-warning' : ''
            )}>
              {formatCurrency(minDay.accumulated)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              em {minDay.label} ({minDay.weekday})
            </p>
          </div>
        )}
      </motion.div>

      {/* Warnings */}
      <AnimatePresence>
        {(overduePayablesTotal > 0 || dangerDays > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-2"
          >
            {overduePayablesTotal > 0 && (
              <div className="bg-destructive/8 border border-destructive/15 rounded-xl p-3.5 text-sm flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-xs">Pagamentos atrasados descontados</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono font-semibold text-destructive">{formatCurrency(overduePayablesTotal)}</span> em {overduePayables.length} pagamento(s) já descontados do saldo inicial.
                  </p>
                </div>
              </div>
            )}
            {dangerDays > 0 && (
              <div className="bg-destructive/8 border border-destructive/15 rounded-xl p-3.5 text-sm flex items-start gap-3 pulse-negative">
                <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-xs">Projeção com saldo negativo</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    O saldo fica negativo em <span className="font-semibold text-destructive">{dangerDays} dia(s)</span>. Revise pagamentos ou antecipe recebimentos.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      >
        <CashFlowAreaChart days={days} threshold={alertThreshold} />
      </motion.div>

      {/* Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="card-elevated overflow-hidden"
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Timeline Dia a Dia</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Clique em um dia para expandir as transações
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="w-8" />
                <th className="text-left pl-2 pr-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Data</th>
                <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Dia</th>
                <th className="text-center px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-12">Mov.</th>
                <th className="text-right px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Entradas</th>
                <th className="text-right px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saídas</th>
                <th className="text-right px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saldo dia</th>
                <th className="text-right px-3 pr-5 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day, idx) => {
                const isDanger = day.accumulated < 0;
                const isWarn = !isDanger && day.accumulated < alertThreshold;

                return (
                  <Fragment key={day.date}>
                    <tr
                      className={cn(
                        'border-b transition-colors group',
                        day.txCount > 0 && 'cursor-pointer hover:bg-muted/40',
                        isDanger && 'bg-destructive/[0.04]',
                        isWarn && 'bg-warning/[0.04]',
                        day.isToday && 'bg-accent/[0.06]',
                        day.isWeekend && !day.isToday && !isDanger && 'opacity-50'
                      )}
                      onClick={() => day.txCount > 0 && toggleDay(day.date)}
                    >
                      <td className="pl-3 py-2.5">
                        {day.txCount > 0 && (
                          <ChevronRight className={cn(
                            'w-3.5 h-3.5 transition-transform duration-200 text-muted-foreground/60 group-hover:text-foreground',
                            expandedDays.has(day.date) && 'rotate-90'
                          )} />
                        )}
                      </td>
                      <td className="pl-2 pr-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {day.isToday && (
                            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                          )}
                          <span className={cn('text-xs font-medium', day.isToday && 'text-accent font-semibold')}>
                            {day.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs capitalize whitespace-nowrap text-muted-foreground">
                        {day.isToday ? <span className="font-semibold text-accent">Hoje</span> : day.weekday}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {day.txCount > 0 && (
                          <span className={cn(
                            'inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-semibold',
                            isDanger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                          )}>
                            {day.txCount}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {day.entradas > 0
                          ? <span className="text-success font-medium">+{formatCurrency(day.entradas)}</span>
                          : <span className="text-muted-foreground/40">—</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {day.saidas > 0
                          ? <span className="text-destructive font-medium">−{formatCurrency(day.saidas)}</span>
                          : <span className="text-muted-foreground/40">—</span>
                        }
                      </td>
                      <td className={cn('px-3 py-2.5 text-right font-mono text-xs font-medium',
                        day.saldoDia > 0 ? 'text-success' : day.saldoDia < 0 ? 'text-destructive' : 'text-muted-foreground/40'
                      )}>
                        {day.saldoDia !== 0 ? (day.saldoDia > 0 ? '+' : '') + formatCurrency(day.saldoDia) : '—'}
                      </td>
                      <td className={cn('px-3 pr-5 py-2.5 text-right font-mono text-xs font-bold',
                        isDanger ? 'text-destructive' : isWarn ? 'text-warning' : ''
                      )}>
                        <div className="flex items-center justify-end gap-1.5">
                          {formatCurrency(day.accumulated)}
                          {isDanger && (
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {expandedDays.has(day.date) && (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-b"
                        >
                          <td colSpan={8} className="p-0">
                            <div className="bg-muted/20 px-5 py-3">
                              <div className="space-y-1">
                                {day.transactions.map(tx => (
                                  <div
                                    key={tx.id}
                                    className="flex items-center gap-3 text-xs py-2 px-3 rounded-lg hover:bg-card transition-colors group/tx"
                                  >
                                    <span className={cn(
                                      'w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0',
                                      tx.type === 'pagar'
                                        ? 'bg-destructive/10 text-destructive'
                                        : 'bg-success/10 text-success'
                                    )}>
                                      {tx.type === 'pagar' ? '↓' : '↑'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate">{tx.description}</p>
                                      {tx.counterpart && (
                                        <p className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</p>
                                      )}
                                    </div>
                                    {(tx.priority === 'crítica' || tx.priority === 'alta') && (
                                      <span className={cn(
                                        'status-badge text-[9px] shrink-0',
                                        tx.priority === 'crítica' ? 'priority-critica' : 'priority-alta'
                                      )}>
                                        {tx.priority === 'crítica' ? 'Crítica' : 'Alta'}
                                      </span>
                                    )}
                                    <span className={cn(
                                      'font-mono font-bold whitespace-nowrap text-xs',
                                      tx.type === 'pagar' ? 'text-destructive' : 'text-success'
                                    )}>
                                      {tx.type === 'pagar' ? '−' : '+'}{formatCurrency(tx.amount)}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px] opacity-0 group-hover/tx:opacity-100 transition-opacity text-success hover:text-success hover:bg-success/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmTransaction(tx.id);
                                      }}
                                    >
                                      Confirmar
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

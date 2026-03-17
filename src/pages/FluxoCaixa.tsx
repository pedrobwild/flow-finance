import { useState, useMemo, useEffect } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, getWeekdayName } from '@/lib/helpers';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import CashFlowAreaChart from '@/components/CashFlowAreaChart';

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

  // Overdue payables (before today) — subtract from starting balance
  const overduePayablesTotal = useMemo(() =>
    transactions
      .filter(t => t.type === 'pagar' && t.status === 'atrasado' && t.dueDate < today)
      .reduce((s, t) => s + t.amount, 0),
    [transactions, today]
  );

  const days = useMemo(() => {
    const result = [];
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
      });
    }
    return result;
  }, [transactions, initialBalance, overduePayablesTotal, period, today]);

  const finalBalance = days.length > 0 ? days[days.length - 1].accumulated : initialBalance;
  const minDay = days.length > 0 ? days.reduce((min, d) => d.accumulated < min.accumulated ? d : min, days[0]) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fluxo de Caixa</h1>
        <p className="text-muted-foreground text-sm mt-1">Projeção dia a dia do saldo financeiro.</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase block mb-1">Saldo inicial</label>
          <Input
            type="number"
            value={initialBalance}
            onChange={e => setInitialBalance(Number(e.target.value))}
            className="w-36 h-9 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase block mb-1">Período</label>
          <Select value={period.toString()} onValueChange={v => setPeriod(Number(v))}>
            <SelectTrigger className="w-28 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="45">45 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase block mb-1">Alerta se &lt;</label>
          <Input
            type="number"
            value={alertThreshold}
            onChange={e => setAlertThreshold(Number(e.target.value))}
            className="w-28 h-9 text-sm"
          />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <div className={cn('card-elevated px-4 py-2 text-center', finalBalance >= 0 ? 'border-success/30' : 'border-destructive/30')}>
            <p className="text-[10px] text-muted-foreground uppercase">Saldo Final</p>
            <p className={cn('stat-value text-lg', finalBalance >= 0 ? 'text-success' : 'text-destructive')}>
              {formatCurrency(finalBalance)}
            </p>
          </div>
          {minDay && (
            <div className={cn('card-elevated px-4 py-2 text-center', minDay.accumulated < alertThreshold ? 'border-warning/30' : '')}>
              <p className="text-[10px] text-muted-foreground uppercase">Saldo Mínimo</p>
              <p className={cn('stat-value text-lg', minDay.accumulated < 0 ? 'text-destructive' : minDay.accumulated < alertThreshold ? 'text-warning' : 'text-foreground')}>
                {formatCurrency(minDay.accumulated)}
              </p>
              <p className="text-[10px] text-muted-foreground">em {minDay.label}</p>
            </div>
          )}
        </div>
      </div>

      {overduePayablesTotal > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span>
            <strong>{formatCurrency(overduePayablesTotal)}</strong> em pagamentos atrasados já descontados do saldo inicial.
          </span>
        </div>
      )}

      {/* Timeline table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-6" />
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Data</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Dia</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Entradas</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Saídas</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Saldo dia</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day, i) => (
                <motion.tr
                  key={day.date}
                  initial={false}
                  className="contents"
                >
                  <tr
                    className={cn(
                      'border-b cursor-pointer hover:bg-muted/30 transition-colors',
                      day.accumulated < 0 && 'bg-destructive/5',
                      day.accumulated >= 0 && day.accumulated < alertThreshold && 'bg-warning/5',
                      day.isToday && 'border-l-4 border-l-accent',
                      day.isWeekend && !day.isToday && 'text-muted-foreground/60'
                    )}
                    onClick={() => toggleDay(day.date)}
                  >
                    <td className="px-2 py-2">
                      <ChevronRight className={cn('w-3 h-3 transition-transform text-muted-foreground', expandedDays.has(day.date) && 'rotate-90')} />
                    </td>
                    <td className="px-3 py-2 font-medium text-xs">{day.label}</td>
                    <td className="px-3 py-2 text-xs capitalize">{day.isToday ? 'Hoje' : day.weekday}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: '#059669' }}>
                      {day.entradas > 0 ? `+${formatCurrency(day.entradas)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-destructive">
                      {day.saidas > 0 ? `−${formatCurrency(day.saidas)}` : '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-mono text-xs font-medium',
                      day.saldoDia > 0 ? 'text-success' : day.saldoDia < 0 ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {day.saldoDia !== 0 ? formatCurrency(day.saldoDia) : '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-mono text-xs font-semibold',
                      day.accumulated < 0 ? 'text-destructive' : day.accumulated < alertThreshold ? 'text-warning' : ''
                    )}>
                      {formatCurrency(day.accumulated)}
                      {day.accumulated < 0 && ' ⚠️'}
                    </td>
                  </tr>
                  {expandedDays.has(day.date) && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={7} className="px-8 py-2">
                        {day.transactions.length > 0 ? (
                          <div className="space-y-1">
                            {day.transactions.map(tx => (
                              <div key={tx.id} className="flex items-center gap-3 text-xs py-1">
                                <span className={tx.type === 'pagar' ? 'text-destructive' : 'text-success'}>
                                  {tx.type === 'pagar' ? '↓' : '↑'}
                                </span>
                                <span className="font-medium">{tx.description}</span>
                                <span className="text-muted-foreground">{tx.counterpart}</span>
                                <span className="ml-auto font-mono font-medium">
                                  {tx.type === 'pagar' ? '−' : '+'}{formatCurrency(tx.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground py-1">Sem movimentações neste dia.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CashFlowAreaChart days={days} threshold={alertThreshold} />
    </div>
  );
}

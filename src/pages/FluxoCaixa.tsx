import { useState, useMemo, useEffect, Fragment } from 'react';
import ExportDropdown from '@/components/ExportDropdown';
import { exportToCSV, exportToExcel, exportToPDF, cashFlowToExportRows } from '@/lib/export-utils';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO, addDays, getDayMonth, getWeekdayName } from '@/lib/helpers';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle, ChevronRight, Calendar, TrendingUp, TrendingDown,
  ArrowDownRight, ArrowUpRight, Wallet, ShieldAlert, Eye, EyeOff,
  CheckCircle2, BarChart3, Zap, Clock, Building2, LineChart, Table2,
  ArrowRight, Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import CashFlowAreaChart from '@/components/CashFlowAreaChart';
import { Transaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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

const sect = (delay: number) => ({
  initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const },
});

export default function FluxoCaixa() {
  const { confirmTransaction } = useFinance();
  const { filteredTransactions: transactions, isFiltered, selectedObraId, filteredBalance, filteredProjectedBalance } = useObraFilter();
  const { obras, getObraFinancials } = useObras();
  const [period, setPeriod] = useState(30);
  const [initialBalance, setInitialBalance] = useState(0);
  const [alertThreshold, setAlertThreshold] = useState(20000);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showControls, setShowControls] = useState(false);
  const today = todayISO();

  useEffect(() => {
    if (filteredBalance) setInitialBalance(filteredBalance.amount);
  }, [filteredBalance]);

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const effectiveInitialBalance = isFiltered ? 0 : initialBalance;

  const selectedObra = useMemo(() => {
    if (!selectedObraId) return null;
    const obra = obras.find(o => o.id === selectedObraId);
    if (!obra) return null;
    return { ...obra, ...getObraFinancials(obra.id) };
  }, [selectedObraId, obras, getObraFinancials]);

  const overduePayables = useMemo(() =>
    transactions.filter(t => t.type === 'pagar' && t.status === 'atrasado' && t.dueDate < today),
    [transactions, today]
  );
  const overduePayablesTotal = overduePayables.reduce((s, t) => s + t.amount, 0);

  // Find earliest confirmed transaction date to show history
  const historyStartDate = useMemo(() => {
    const confirmedDates = transactions
      .filter(t => t.status === 'confirmado' && t.paidAt)
      .map(t => t.paidAt as string)
      .sort();
    const dueDates = transactions
      .filter(t => t.status === 'confirmado')
      .map(t => t.dueDate)
      .sort();
    const allDates = [...confirmedDates, ...dueDates].filter(Boolean).sort();
    if (allDates.length === 0) return today;
    // Show up to 30 days of history max
    const earliest = allDates[0];
    const thirtyAgo = addDays(today, -30);
    return earliest > thirtyAgo ? earliest : thirtyAgo;
  }, [transactions, today]);

  const days: DayRow[] = useMemo(() => {
    const result: DayRow[] = [];
    const startDate = historyStartDate < today ? historyStartDate : today;
    const endDate = addDays(today, period);
    let currentDate = startDate;

    while (currentDate < endDate) {
      const date = currentDate;
      const isPast = date < today;

      // Past days: show confirmed transactions (history)
      // Today+future: show pending transactions (projection)
      const dayTxs = isPast
        ? transactions.filter(t => t.status === 'confirmado' && (t.paidAt === date || (!t.paidAt && t.dueDate === date)))
        : transactions.filter(t => {
            if (t.status === 'confirmado' && (t.paidAt === date || (!t.paidAt && t.dueDate === date))) return true;
            if (t.status !== 'confirmado' && t.dueDate === date) return true;
            return false;
          });

      const entradas = dayTxs.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
      const saidas = dayTxs.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
      const saldoDia = entradas - saidas;
      const accumulated = isPast
        ? 0 // Will be computed below
        : filteredProjectedBalance(date);
      const dayDate = new Date(date + 'T12:00:00');
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

      result.push({
        date, label: getDayMonth(date), weekday: getWeekdayName(date),
        entradas, saidas, saldoDia, accumulated,
        transactions: dayTxs, isToday: date === today, isWeekend,
        txCount: dayTxs.length,
      });

      currentDate = addDays(currentDate, 1);
    }

    // Compute accumulated for past days (backward from current balance)
    const currentBal = filteredBalance?.amount ?? 0;
    // Sum all confirmed transactions from today backward to compute past balances
    const todayIndex = result.findIndex(d => d.date === today);
    if (todayIndex > 0) {
      // Walk backward from today
      let runningBalance = currentBal;
      for (let i = todayIndex - 1; i >= 0; i--) {
        // Undo this day's effect to get the balance at end of previous day
        runningBalance = runningBalance - result[i].entradas + result[i].saidas;
        result[i].accumulated = runningBalance;
      }
      // Now re-walk forward to show end-of-day balances
      runningBalance = result[0].accumulated;
      for (let i = 0; i < todayIndex; i++) {
        runningBalance = runningBalance + result[i].entradas - result[i].saidas;
        result[i].accumulated = runningBalance;
      }
    }

    return result;
  }, [transactions, filteredProjectedBalance, filteredBalance, period, today, historyStartDate]);

  const finalBalance = days.length > 0 ? days[days.length - 1].accumulated : effectiveInitialBalance;
  const minDay = days.length > 0 ? days.reduce((min, d) => d.accumulated < min.accumulated ? d : min, days[0]) : null;
  const totalEntradas = days.reduce((s, d) => s + d.entradas, 0);
  const totalSaidas = days.reduce((s, d) => s + d.saidas, 0);
  const daysWithMovement = days.filter(d => d.txCount > 0).length;
  const dangerDays = days.filter(d => d.accumulated < 0).length;
  const netFlow = totalEntradas - totalSaidas;
  const coverageRatio = totalSaidas > 0 ? Math.min((totalEntradas / totalSaidas) * 100, 200) : 100;

  const weeklyBreakdown = useMemo(() => {
    const weeks: { label: string; entradas: number; saidas: number; saldo: number; days: number; startDate: string; endDate: string }[] = [];
    for (let w = 0; w < Math.ceil(period / 7); w++) {
      const weekDays = days.slice(w * 7, (w + 1) * 7);
      if (weekDays.length === 0) continue;
      const entradas = weekDays.reduce((s, d) => s + d.entradas, 0);
      const saidas = weekDays.reduce((s, d) => s + d.saidas, 0);
      weeks.push({
        label: `${weekDays[0].label} – ${weekDays[weekDays.length - 1].label}`,
        entradas, saidas, saldo: entradas - saidas, days: weekDays.length,
        startDate: weekDays[0].date, endDate: weekDays[weekDays.length - 1].date,
      });
    }
    return weeks;
  }, [days, period]);

  const biggestOutflowDay = useMemo(() => {
    if (days.length === 0) return null;
    const d = days.reduce((max, day) => day.saidas > max.saidas ? day : max, days[0]);
    return d && d.saidas > 0 ? d : null;
  }, [days]);

  const noIncomeDays = useMemo(() => {
    let maxStreak = 0, streak = 0;
    for (const d of days) {
      if (d.entradas === 0) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else streak = 0;
    }
    return maxStreak;
  }, [days]);

  const balanceChange = finalBalance - effectiveInitialBalance;
  const balanceChangePct = effectiveInitialBalance !== 0 ? ((balanceChange / Math.abs(effectiveInitialBalance)) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div {...sect(0)} className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">Fluxo de Caixa</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2 flex-wrap">
            Projeção de {period} dias
            {isFiltered && selectedObra && (
              <Badge variant="outline" className="text-[10px] border-primary/50 bg-primary/5">
                <Building2 className="w-3 h-3 mr-1" />
                {selectedObra.code} · {selectedObra.clientName}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {([15, 30, 45] as const).map(p => (
            <Button
              key={p} size="sm"
              variant={period === p ? 'default' : 'outline'}
              className={cn('h-8 px-3 text-xs font-medium transition-all', period === p && 'shadow-sm')}
              onClick={() => setPeriod(p)}
            >
              {p}d
            </Button>
          ))}
          {!isFiltered && (
            <Button
              size="sm" variant="ghost"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => setShowControls(!showControls)}
              title="Ajustes"
            >
              <Settings2 className="w-4 h-4" />
            </Button>
          )}
          <ExportDropdown
            onCSV={() => exportToCSV(cashFlowToExportRows(days), 'fluxo-caixa')}
            onExcel={() => exportToExcel(cashFlowToExportRows(days), 'fluxo-caixa')}
            onPDF={() => {
              const rows = cashFlowToExportRows(days);
              const headers = Object.keys(rows[0] || {});
              exportToPDF('Fluxo de Caixa', headers, rows.map(r => headers.map(h => String(r[h] ?? ''))));
            }}
          />
        </div>
      </motion.div>

      {/* Controls panel */}
      <AnimatePresence>
        {showControls && !isFiltered && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="card-elevated p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase block mb-1 font-medium tracking-wide">Saldo inicial (R$)</label>
                  <Input type="number" value={initialBalance} onChange={e => setInitialBalance(Number(e.target.value))} className="h-9 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase block mb-1 font-medium tracking-wide">Alerta abaixo de (R$)</label>
                  <Input type="number" value={alertThreshold} onChange={e => setAlertThreshold(Number(e.target.value))} className="h-9 text-sm font-mono" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero KPI Banner */}
      <motion.div {...sect(0.04)}>
        {isFiltered && selectedObra ? (
          <div className="card-elevated p-0 overflow-hidden">
            <div className="grid grid-cols-5 divide-x">
              <KPICell icon={Building2} label="Contrato" value={formatCurrency(selectedObra.totalContractValue)} iconBg="bg-primary/10" iconColor="text-primary" />
              <KPICell icon={ArrowUpRight} label="Recebido" value={formatCurrency(selectedObra.totalReceived)} sub={`${selectedObra.receivedPercentage.toFixed(0)}%`} iconBg="bg-success/10" iconColor="text-success" valueColor="text-success" />
              <KPICell icon={ArrowDownRight} label="Gasto" value={formatCurrency(selectedObra.totalPaidCost)} sub={`${selectedObra.totalContractValue > 0 ? ((selectedObra.totalPaidCost / selectedObra.totalContractValue) * 100).toFixed(0) : 0}%`} iconBg="bg-destructive/10" iconColor="text-destructive" valueColor="text-destructive" />
              <KPICell
                icon={TrendingUp} label="Margem"
                value={`${selectedObra.grossMarginPercentage.toFixed(0)}%`}
                sub={formatCurrency(selectedObra.grossMargin)}
                iconBg={selectedObra.grossMarginPercentage >= 30 ? 'bg-success/10' : selectedObra.grossMarginPercentage >= 15 ? 'bg-warning/10' : 'bg-destructive/10'}
                iconColor={selectedObra.grossMarginPercentage >= 30 ? 'text-success' : selectedObra.grossMarginPercentage >= 15 ? 'text-warning' : 'text-destructive'}
                valueColor={selectedObra.grossMarginPercentage >= 30 ? 'text-success' : selectedObra.grossMarginPercentage >= 15 ? 'text-warning' : 'text-destructive'}
              />
              <KPICell
                icon={Wallet} label="Saldo Obra"
                value={formatCurrency(selectedObra.obraNetCashFlow)}
                iconBg={selectedObra.obraNetCashFlow >= 0 ? 'bg-success/10' : 'bg-destructive/10'}
                iconColor={selectedObra.obraNetCashFlow >= 0 ? 'text-success' : 'text-destructive'}
                valueColor={selectedObra.obraNetCashFlow >= 0 ? 'text-success' : 'text-destructive'}
                highlight={selectedObra.obraNetCashFlow < 0}
              />
            </div>
          </div>
        ) : (
          <div className="card-elevated p-0 overflow-hidden">
            <div className="grid grid-cols-2 lg:grid-cols-5 divide-x divide-y lg:divide-y-0">
              <KPICell icon={Wallet} label="Saldo Atual" value={formatCurrency(initialBalance)} iconBg="bg-primary/10" iconColor="text-primary" />
              <KPICell
                icon={finalBalance >= effectiveInitialBalance ? TrendingUp : TrendingDown}
                label={`Saldo em ${period}d`}
                value={formatCurrency(finalBalance)}
                sub={`${netFlow >= 0 ? '+' : ''}${formatCurrency(netFlow)} líquido`}
                iconBg={finalBalance >= 0 ? 'bg-success/10' : 'bg-destructive/10'}
                iconColor={finalBalance >= 0 ? 'text-success' : 'text-destructive'}
                valueColor={finalBalance >= 0 ? 'text-success' : 'text-destructive'}
                highlight={finalBalance < 0}
              />
              <KPICell icon={ArrowUpRight} label="Entradas" value={formatCurrency(totalEntradas)} iconBg="bg-success/10" iconColor="text-success" valueColor="text-success" />
              <KPICell icon={ArrowDownRight} label="Saídas" value={formatCurrency(totalSaidas)} iconBg="bg-destructive/10" iconColor="text-destructive" valueColor="text-destructive" />
              {minDay && (
                <KPICell
                  icon={ShieldAlert}
                  label="Saldo Mínimo"
                  value={formatCurrency(minDay.accumulated)}
                  sub={`${minDay.label} (${minDay.weekday})`}
                  iconBg={minDay.accumulated < 0 ? 'bg-destructive/10' : minDay.accumulated < alertThreshold ? 'bg-warning/10' : 'bg-muted'}
                  iconColor={minDay.accumulated < 0 ? 'text-destructive' : minDay.accumulated < alertThreshold ? 'text-warning' : 'text-muted-foreground'}
                  valueColor={minDay.accumulated < 0 ? 'text-destructive' : minDay.accumulated < alertThreshold ? 'text-warning' : ''}
                  highlight={minDay.accumulated < 0}
                />
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Coverage + Insights strip */}
      <motion.div {...sect(0.08)} className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Coverage meter */}
        <div className="card-elevated p-4 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Cobertura</span>
            <span className={cn('text-sm font-bold font-mono', coverageRatio >= 100 ? 'text-success' : coverageRatio >= 70 ? 'text-warning' : 'text-destructive')}>
              {coverageRatio.toFixed(0)}%
            </span>
          </div>
          <Progress
            value={Math.min(coverageRatio, 100)}
            className={cn('h-2.5 rounded-full', coverageRatio >= 100 ? '[&>div]:bg-success' : coverageRatio >= 70 ? '[&>div]:bg-warning' : '[&>div]:bg-destructive')}
          />
          <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
            <span>Entradas cobrem <span className="font-semibold">{coverageRatio.toFixed(0)}%</span> das saídas</span>
          </div>
        </div>

        {/* Insight cards */}
        {dangerDays > 0 && (
          <InsightCard icon={ShieldAlert} color="destructive" title="Saldo negativo" desc={`${dangerDays} dia(s) com projeção abaixo de zero`} />
        )}
        {biggestOutflowDay && (
          <InsightCard icon={Zap} color="warning" title="Maior saída concentrada" desc={`${formatCurrency(biggestOutflowDay.saidas)} em ${biggestOutflowDay.label}`} />
        )}
        {noIncomeDays >= 5 && (
          <InsightCard icon={Clock} color="accent" title="Sem recebimentos" desc={`${noIncomeDays} dias consecutivos sem entradas`} />
        )}
      </motion.div>

      {/* Overdue warning */}
      <AnimatePresence>
        {overduePayablesTotal > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
            <div className="bg-destructive/[0.06] border border-destructive/15 rounded-xl p-3.5 text-sm flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5"><AlertTriangle className="w-4 h-4 text-destructive" /></div>
              <div>
                <p className="font-semibold text-xs">Pagamentos atrasados descontados</p>
                <p className="text-[11px] text-muted-foreground mt-0.5"><span className="font-mono font-semibold text-destructive">{formatCurrency(overduePayablesTotal)}</span> em {overduePayables.length} pagamento(s) já descontados do saldo inicial.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content: Tabbed view */}
      <motion.div {...sect(0.12)}>
        <Tabs defaultValue="chart" className="space-y-4">
          <TabsList className="bg-muted/60 p-1 h-10">
            <TabsTrigger value="chart" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
              <LineChart className="w-3.5 h-3.5" /> Gráfico
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
              <Table2 className="w-3.5 h-3.5" /> Detalhamento
            </TabsTrigger>
            <TabsTrigger value="weekly" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
              <BarChart3 className="w-3.5 h-3.5" /> Semanal
            </TabsTrigger>
          </TabsList>

          {/* Chart Tab */}
          <TabsContent value="chart" className="mt-0">
            <CashFlowAreaChart days={days} threshold={isFiltered ? 0 : alertThreshold} />
          </TabsContent>

          {/* Table Tab */}
          <TabsContent value="table" className="mt-0">
            <div className="card-elevated overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center"><Calendar className="w-3.5 h-3.5 text-muted-foreground" /></div>
                  <div>
                    <h2 className="font-semibold text-sm">Timeline Dia a Dia</h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Clique em um dia para expandir</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
                    {daysWithMovement} dias com transações
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
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
                    {days.map((day) => {
                      const isDanger = day.accumulated < 0;
                      const isWarn = !isDanger && !isFiltered && day.accumulated < alertThreshold;
                      return (
                        <Fragment key={day.date}>
                          <tr
                            className={cn(
                              'border-b transition-colors group',
                              day.txCount > 0 && 'cursor-pointer hover:bg-muted/40',
                              isDanger && 'bg-destructive/[0.04]',
                              isWarn && 'bg-warning/[0.04]',
                              day.isToday && 'bg-accent/[0.06] border-l-2 border-l-accent',
                              day.date < today && !day.isToday && 'opacity-60',
                              day.isWeekend && !day.isToday && !isDanger && day.date >= today && 'opacity-50'
                            )}
                            onClick={() => day.txCount > 0 && toggleDay(day.date)}
                          >
                            <td className="pl-3 py-2.5">
                              {day.txCount > 0 && (
                                <ChevronRight className={cn('w-3.5 h-3.5 transition-transform duration-200 text-muted-foreground/60 group-hover:text-foreground', expandedDays.has(day.date) && 'rotate-90')} />
                              )}
                            </td>
                            <td className="pl-2 pr-3 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {day.isToday && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                                <span className={cn('text-xs font-medium', day.isToday && 'text-accent font-semibold')}>{day.label}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs capitalize whitespace-nowrap text-muted-foreground">
                              {day.isToday ? <span className="font-semibold text-accent">Hoje</span> : day.weekday}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {day.txCount > 0 && (
                                <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-semibold', isDanger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>{day.txCount}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs">
                              {day.entradas > 0 ? <span className="text-success font-medium">+{formatCurrency(day.entradas)}</span> : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs">
                              {day.saidas > 0 ? <span className="text-destructive font-medium">−{formatCurrency(day.saidas)}</span> : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className={cn('px-3 py-2.5 text-right font-mono text-xs font-medium', day.saldoDia > 0 ? 'text-success' : day.saldoDia < 0 ? 'text-destructive' : 'text-muted-foreground/40')}>
                              {day.saldoDia !== 0 ? (day.saldoDia > 0 ? '+' : '') + formatCurrency(day.saldoDia) : '—'}
                            </td>
                            <td className={cn('px-3 pr-5 py-2.5 text-right font-mono text-xs font-bold', isDanger ? 'text-destructive' : isWarn ? 'text-warning' : '')}>
                              <div className="flex items-center justify-end gap-1.5">
                                {formatCurrency(day.accumulated)}
                                {isDanger && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />}
                              </div>
                            </td>
                          </tr>
                          <AnimatePresence>
                            {expandedDays.has(day.date) && (
                              <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="border-b">
                                <td colSpan={8} className="p-0">
                                  <div className="bg-muted/20 px-5 py-3">
                                    <div className="space-y-1">
                                      {day.transactions.map(tx => (
                                        <div key={tx.id} className="flex items-center gap-3 text-xs py-2 px-3 rounded-lg hover:bg-card transition-colors group/tx">
                                          <span className={cn('w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0', tx.type === 'pagar' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
                                            {tx.type === 'pagar' ? '↓' : '↑'}
                                          </span>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{tx.description}</p>
                                            {tx.counterpart && <p className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</p>}
                                          </div>
                                          {tx.obraId && !isFiltered && (
                                            <Badge variant="outline" className="text-[9px] shrink-0">{obras.find(o => o.id === tx.obraId)?.code || '—'}</Badge>
                                          )}
                                          {(tx.priority === 'crítica' || tx.priority === 'alta') && (
                                            <span className={cn('status-badge text-[9px] shrink-0', tx.priority === 'crítica' ? 'priority-critica' : 'priority-alta')}>
                                              {tx.priority === 'crítica' ? 'Crítica' : 'Alta'}
                                            </span>
                                          )}
                                          <span className={cn('font-mono font-bold whitespace-nowrap text-xs', tx.type === 'pagar' ? 'text-destructive' : 'text-success')}>
                                            {tx.type === 'pagar' ? '−' : '+'}{formatCurrency(tx.amount)}
                                          </span>
                                          <Button
                                            size="sm" variant="ghost"
                                            className="h-6 px-2 text-[10px] opacity-0 group-hover/tx:opacity-100 transition-opacity text-success hover:text-success hover:bg-success/10"
                                            onClick={(e) => { e.stopPropagation(); confirmTransaction(tx.id); }}
                                          >
                                            <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmar
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
            </div>
          </TabsContent>

          {/* Weekly Tab */}
          <TabsContent value="weekly" className="mt-0">
            {weeklyBreakdown.length > 0 && (
              <div className="card-elevated overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BarChart3 className="w-3.5 h-3.5 text-primary" /></div>
                  <div>
                    <h2 className="font-semibold text-sm">Resumo Semanal</h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Fluxo agregado por semana</p>
                  </div>
                </div>
                <div className="divide-y">
                  {weeklyBreakdown.map((week, i) => {
                    const maxVal = Math.max(...weeklyBreakdown.map(w => Math.max(w.entradas, w.saidas)));
                    const entPct = maxVal > 0 ? (week.entradas / maxVal) * 100 : 0;
                    const saiPct = maxVal > 0 ? (week.saidas / maxVal) * 100 : 0;
                    const weekBalance = filteredProjectedBalance(week.endDate);
                    return (
                      <div key={i} className={cn('px-5 py-4 flex items-center gap-4 transition-colors hover:bg-muted/20', week.saldo < 0 && 'bg-destructive/[0.03]')}>
                        <div className="w-[130px] shrink-0">
                          <p className="text-xs font-semibold">{i === 0 ? 'Esta semana' : `Semana ${i + 1}`}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{week.label}</p>
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground w-6 shrink-0">Ent.</span>
                            <div className="h-2 rounded-full bg-success/10 flex-1 overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-success/70"
                                initial={{ width: 0 }}
                                animate={{ width: `${entPct}%` }}
                                transition={{ duration: 0.6, delay: i * 0.05 }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-success font-medium w-[85px] text-right">+{formatCurrency(week.entradas)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground w-6 shrink-0">Saí.</span>
                            <div className="h-2 rounded-full bg-destructive/10 flex-1 overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-destructive/60"
                                initial={{ width: 0 }}
                                animate={{ width: `${saiPct}%` }}
                                transition={{ duration: 0.6, delay: i * 0.05 }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-destructive font-medium w-[85px] text-right">−{formatCurrency(week.saidas)}</span>
                          </div>
                        </div>
                        <div className="w-[100px] text-right border-l pl-4">
                          <p className={cn('text-xs font-bold font-mono', week.saldo >= 0 ? 'text-success' : 'text-destructive')}>
                            {week.saldo >= 0 ? '+' : ''}{formatCurrency(week.saldo)}
                          </p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">líquido</p>
                          <p className={cn('text-[9px] font-mono mt-0.5', weekBalance >= 0 ? 'text-muted-foreground' : 'text-destructive')}>
                            Saldo: {formatCurrency(weekBalance)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

/* ─── Sub-components ─── */

function KPICell({ icon: Icon, label, value, sub, iconBg, iconColor, valueColor, highlight }: {
  icon: any; label: string; value: string; sub?: string;
  iconBg: string; iconColor: string; valueColor?: string; highlight?: boolean;
}) {
  return (
    <div className={cn('p-4 relative', highlight && 'ring-1 ring-inset ring-destructive/20')}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconBg)}>
          <Icon className={cn('w-3.5 h-3.5', iconColor)} />
        </div>
        <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-bold font-mono tracking-tight', valueColor)}>{value}</p>
      {sub && <p className="text-[10px] font-mono mt-0.5 text-muted-foreground">{sub}</p>}
    </div>
  );
}

function InsightCard({ icon: Icon, color, title, desc }: {
  icon: any; color: string; title: string; desc: string;
}) {
  const colorMap: Record<string, { bg: string; border: string; iconBg: string; text: string }> = {
    destructive: { bg: 'bg-destructive/[0.06]', border: 'border-destructive/15', iconBg: 'bg-destructive/10', text: 'text-destructive' },
    warning: { bg: 'bg-warning/[0.06]', border: 'border-warning/15', iconBg: 'bg-warning/10', text: 'text-warning' },
    accent: { bg: 'bg-accent/[0.06]', border: 'border-accent/15', iconBg: 'bg-accent/10', text: 'text-accent' },
  };
  const c = colorMap[color] || colorMap.accent;
  return (
    <div className={cn('rounded-xl p-3.5 flex items-start gap-3 border', c.bg, c.border)}>
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', c.iconBg)}>
        <Icon className={cn('w-4 h-4', c.text)} />
      </div>
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

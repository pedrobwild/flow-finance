import { useMemo, useState } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, getDayMonth, getWeekdayName, daysBetween } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, ChevronDown, ChevronRight, CalendarIcon } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import { Transaction } from '@/lib/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PERIOD_PRESETS = [
  { label: '7d', days: 7 },
  { label: '15d', days: 15 },
  { label: '30d', days: 30 },
  { label: '45d', days: 45 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
] as const;

interface DayRow {
  date: string;
  label: string;
  weekday: string;
  entradas: number;
  saidas: number;
  netFlow: number;
  saldo: number;
  isToday: boolean;
  isWeekend: boolean;
  txCount: number;
  transactions: Transaction[];
}

interface CashFlowTableProps {
  /** Optional external period to sync with a parent filter */
  period?: { from: string; to: string; label: string };
}

export default function CashFlowTable({ period }: CashFlowTableProps = {}) {
  const { filteredTransactions: transactions, filteredProjectedBalance } = useObraFilter();
  const today = todayISO();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Derive initial state from external period if provided
  const externalPresetIdx = period
    ? PERIOD_PRESETS.findIndex(p => p.label === period.label)
    : -1;

  const [selectedPreset, setSelectedPreset] = useState(() =>
    externalPresetIdx >= 0 ? externalPresetIdx : 2
  );
  const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined }>(() => {
    if (period && externalPresetIdx < 0) {
      return { from: new Date(period.from + 'T12:00:00'), to: new Date(period.to + 'T12:00:00') };
    }
    return { from: undefined, to: undefined };
  });
  const [isCustom, setIsCustom] = useState(() =>
    !!period && externalPresetIdx < 0 && period.label !== ''
  );

  // Sync when external period changes
  const lastPeriodRef = useMemo(() => period, [period?.from, period?.to, period?.label]);
  useMemo(() => {
    if (!lastPeriodRef) return;
    const idx = PERIOD_PRESETS.findIndex(p => p.label === lastPeriodRef.label);
    if (idx >= 0) {
      setSelectedPreset(idx);
      setIsCustom(false);
    } else {
      setCustomRange({
        from: new Date(lastPeriodRef.from + 'T12:00:00'),
        to: new Date(lastPeriodRef.to + 'T12:00:00'),
      });
      setIsCustom(true);
    }
  }, [lastPeriodRef]);

  const numDays = useMemo(() => {
    if (isCustom && customRange.from && customRange.to) {
      const fromStr = format(customRange.from, 'yyyy-MM-dd');
      const toStr = format(customRange.to, 'yyyy-MM-dd');
      return Math.max(1, daysBetween(fromStr, toStr) + 1);
    }
    return PERIOD_PRESETS[selectedPreset].days;
  }, [isCustom, customRange, selectedPreset]);

  const startDate = useMemo(() => {
    if (isCustom && customRange.from) {
      return format(customRange.from, 'yyyy-MM-dd');
    }
    return today;
  }, [isCustom, customRange, today]);

  const rows = useMemo((): DayRow[] => {
    const data: DayRow[] = [];
    for (let i = 0; i < numDays; i++) {
      const date = addDays(startDate, i);
      const dayDate = new Date(date + 'T12:00:00');
      const dayTxs = transactions.filter(t => t.dueDate === date && t.status !== 'confirmado');
      const entradas = dayTxs.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
      const saidas = dayTxs.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
      data.push({
        date,
        label: getDayMonth(date),
        weekday: getWeekdayName(date),
        entradas,
        saidas,
        netFlow: entradas - saidas,
        saldo: filteredProjectedBalance(date),
        isToday: date === today,
        isWeekend: dayDate.getDay() === 0 || dayDate.getDay() === 6,
        txCount: dayTxs.length,
        transactions: dayTxs,
      });
    }
    return data;
  }, [transactions, filteredProjectedBalance, today, numDays, startDate]);

  const totals = useMemo(() => ({
    entradas: rows.reduce((s, r) => s + r.entradas, 0),
    saidas: rows.reduce((s, r) => s + r.saidas, 0),
  }), [rows]);

  const toggleRow = (date: string) => {
    setExpandedDate(prev => prev === date ? null : date);
  };

  const periodLabel = isCustom && customRange.from && customRange.to
    ? `${format(customRange.from, 'dd/MM')} – ${format(customRange.to, 'dd/MM')}`
    : `${PERIOD_PRESETS[selectedPreset].label}`;

  return (
    <div className="card-elevated overflow-hidden">
      {/* Period filter */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground mr-1">Período:</span>
        <div className="flex items-center gap-1">
          {PERIOD_PRESETS.map((p, idx) => (
            <Button
              key={p.label}
              variant={!isCustom && selectedPreset === idx ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => { setSelectedPreset(idx); setIsCustom(false); }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={isCustom ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
            >
              <CalendarIcon className="w-3 h-3" />
              {isCustom && customRange.from && customRange.to
                ? `${format(customRange.from, 'dd/MM')} – ${format(customRange.to, 'dd/MM')}`
                : 'Personalizado'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={customRange.from && customRange.to ? { from: customRange.from, to: customRange.to } : undefined}
              onSelect={(range) => {
                if (range?.from) {
                  setCustomRange({ from: range.from, to: range.to });
                  if (range.from && range.to) setIsCustom(true);
                }
              }}
              locale={ptBR}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase w-[100px]">Data</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase w-[80px]">Dia</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase text-right">Entradas</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase text-right">Saídas</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase text-right">Líquido</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase text-right">Saldo Projetado</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase text-center w-[60px]">Txs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <>
                <TableRow
                  key={row.date}
                  className={cn(
                    'transition-colors',
                    row.txCount > 0 && 'cursor-pointer hover:bg-accent/50',
                    row.isToday && 'bg-primary/[0.06] font-medium',
                    row.isWeekend && !row.isToday && 'bg-muted/20',
                    row.saldo < 0 && 'bg-destructive/[0.04]',
                    expandedDate === row.date && 'bg-accent/30',
                  )}
                  onClick={() => row.txCount > 0 && toggleRow(row.date)}
                >
                  <TableCell className="text-xs font-medium py-2">
                    <div className="flex items-center gap-1.5">
                      {row.txCount > 0 && (
                        expandedDate === row.date
                          ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      )}
                      {row.label}
                      {row.isToday && (
                        <Badge variant="outline" className="text-[8px] h-4 px-1 border-primary/50 text-primary">Hoje</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground py-2 capitalize">{row.weekday}</TableCell>
                  <TableCell className="text-right py-2">
                    {row.entradas > 0 ? (
                      <span className="font-mono text-xs text-success flex items-center justify-end gap-1">
                        <ArrowUp className="w-3 h-3" />
                        {formatCurrency(row.entradas)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    {row.saidas > 0 ? (
                      <span className="font-mono text-xs text-destructive flex items-center justify-end gap-1">
                        <ArrowDown className="w-3 h-3" />
                        {formatCurrency(row.saidas)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className={cn(
                    'text-right font-mono text-xs font-semibold py-2',
                    row.netFlow > 0 ? 'text-success' : row.netFlow < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {row.netFlow !== 0 ? (
                      <>{row.netFlow > 0 ? '+' : ''}{formatCurrency(row.netFlow)}</>
                    ) : '—'}
                  </TableCell>
                  <TableCell className={cn(
                    'text-right font-mono text-xs font-bold py-2',
                    row.saldo >= 0 ? 'text-foreground' : 'text-destructive'
                  )}>
                    {formatCurrency(row.saldo)}
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground py-2">
                    {row.txCount > 0 ? row.txCount : '—'}
                  </TableCell>
                </TableRow>
                {/* Expanded transaction details */}
                <AnimatePresence>
                  {expandedDate === row.date && row.transactions.length > 0 && (
                    <motion.tr
                      key={`${row.date}-details`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-muted/10"
                    >
                      <TableCell colSpan={7} className="p-0">
                        <div className="px-4 py-2 space-y-1">
                          {row.transactions.map(tx => (
                            <div
                              key={tx.id}
                              className="flex items-center justify-between py-1.5 px-3 rounded-md bg-background/60 border border-border/40"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {tx.type === 'receber' ? (
                                  <ArrowUp className="w-3 h-3 text-success shrink-0" />
                                ) : (
                                  <ArrowDown className="w-3 h-3 text-destructive shrink-0" />
                                )}
                                <span className="text-xs font-medium truncate">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                                  {tx.counterpart}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <Badge variant="outline" className={cn(
                                  'text-[9px] h-4 px-1.5',
                                  tx.status === 'atrasado' && 'border-destructive/50 text-destructive',
                                  tx.status === 'pendente' && 'border-warning/50 text-warning',
                                  tx.status === 'previsto' && 'border-muted-foreground/50 text-muted-foreground',
                                )}>
                                  {tx.status}
                                </Badge>
                                <span className={cn(
                                  'font-mono text-xs font-semibold',
                                  tx.type === 'receber' ? 'text-success' : 'text-destructive'
                                )}>
                                  {tx.type === 'receber' ? '+' : '-'}{formatCurrency(tx.amount)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </>
            ))}
            {/* Totals row */}
            <TableRow className="bg-muted/40 border-t-2">
              <TableCell className="text-xs font-bold py-2.5" colSpan={2}>Total {periodLabel}</TableCell>
              <TableCell className="text-right font-mono text-xs font-bold text-success py-2.5">
                {formatCurrency(totals.entradas)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs font-bold text-destructive py-2.5">
                {formatCurrency(totals.saidas)}
              </TableCell>
              <TableCell className={cn(
                'text-right font-mono text-xs font-bold py-2.5',
                totals.entradas - totals.saidas >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {totals.entradas - totals.saidas >= 0 ? '+' : ''}{formatCurrency(totals.entradas - totals.saidas)}
              </TableCell>
              <TableCell className="py-2.5" colSpan={2} />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

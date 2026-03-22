import { useMemo } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, getDayMonth, getWeekdayName } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';

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
}

export default function CashFlowTable() {
  const { filteredTransactions: transactions, filteredProjectedBalance } = useObraFilter();
  const today = todayISO();

  const rows = useMemo((): DayRow[] => {
    const data: DayRow[] = [];
    for (let i = 0; i < 30; i++) {
      const date = addDays(today, i);
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
      });
    }
    return data;
  }, [transactions, filteredProjectedBalance, today]);

  const totals = useMemo(() => ({
    entradas: rows.reduce((s, r) => s + r.entradas, 0),
    saidas: rows.reduce((s, r) => s + r.saidas, 0),
  }), [rows]);

  return (
    <div className="card-elevated overflow-hidden">
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
              <TableRow
                key={row.date}
                className={cn(
                  'transition-colors',
                  row.isToday && 'bg-primary/[0.06] font-medium',
                  row.isWeekend && !row.isToday && 'bg-muted/20',
                  row.saldo < 0 && 'bg-destructive/[0.04]',
                )}
              >
                <TableCell className="text-xs font-medium py-2">
                  <div className="flex items-center gap-1.5">
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
            ))}
            {/* Totals row */}
            <TableRow className="bg-muted/40 border-t-2">
              <TableCell className="text-xs font-bold py-2.5" colSpan={2}>Total 30 dias</TableCell>
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

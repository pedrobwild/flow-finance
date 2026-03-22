import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
import { ArrowDownRight, AlertTriangle, Clock, Check, CheckCheck, CalendarDays, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TransactionTable from '@/components/TransactionTable';

const sect = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function ContasPagar() {
  const { currentBalance, confirmTransaction } = useFinance();
  const { filteredTransactions: transactions } = useObraFilter();
  const { obras } = useObras();
  const today = todayISO();

  const agenda = useMemo(() => {
    const pagar = transactions.filter(t => t.type === 'pagar' && t.status !== 'confirmado');

    const overdue = pagar
      .filter(t => t.status === 'atrasado')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const todayTxs = pagar.filter(t => t.dueDate === today && t.status !== 'atrasado');
    const tomorrowTxs = pagar.filter(t => t.dueDate === addDays(today, 1));

    // Next 7 days (excluding today/tomorrow)
    const day2 = addDays(today, 2);
    const day7 = addDays(today, 7);
    const weekTxs = pagar
      .filter(t => t.dueDate >= day2 && t.dueDate <= day7)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const totalOverdue = overdue.reduce((s, t) => s + t.amount, 0);
    const totalToday = todayTxs.reduce((s, t) => s + t.amount, 0);
    const totalTomorrow = tomorrowTxs.reduce((s, t) => s + t.amount, 0);
    const totalWeek = weekTxs.reduce((s, t) => s + t.amount, 0);

    return { overdue, todayTxs, tomorrowTxs, weekTxs, totalOverdue, totalToday, totalTomorrow, totalWeek };
  }, [transactions, today]);

  const getObraCode = (obraId: string | null) => {
    if (!obraId) return null;
    return obras.find(o => o.id === obraId)?.code;
  };

  const confirmAll = (txs: typeof transactions) => {
    txs.forEach(t => confirmTransaction(t.id));
  };

  const renderTxRow = (tx: typeof transactions[0], showDate = false) => {
    const obraCode = getObraCode(tx.obraId);
    const days = tx.status === 'atrasado' ? daysBetween(tx.dueDate, today) : 0;

    return (
      <motion.div
        key={tx.id}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg group/row transition-colors',
          tx.status === 'atrasado'
            ? 'bg-destructive/5 hover:bg-destructive/10'
            : 'hover:bg-muted/50'
        )}
      >
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{tx.description}</p>
            {tx.status === 'atrasado' && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                {days}d atraso
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">{tx.counterpart || '—'}</span>
            {obraCode && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">{obraCode}</Badge>
            )}
            {tx.paymentMethod && (
              <span className="text-[10px] text-muted-foreground/70">{tx.paymentMethod}</span>
            )}
          </div>
        </div>

        {/* Date */}
        {showDate && (
          <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:block">
            {getDayMonth(tx.dueDate)}
          </span>
        )}

        {/* Amount */}
        <span className="text-sm font-mono font-bold text-destructive shrink-0">
          {formatCurrency(tx.amount)}
        </span>

        {/* Confirm */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity active:scale-90"
          onClick={() => confirmTransaction(tx.id)}
          title="Confirmar pagamento"
        >
          <Check className="w-4 h-4 text-success" />
        </Button>
      </motion.div>
    );
  };

  const hasUrgent = agenda.overdue.length > 0 || agenda.todayTxs.length > 0 || agenda.tomorrowTxs.length > 0 || agenda.weekTxs.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div {...sect(0)} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
            <ArrowDownRight className="w-[18px] h-[18px] text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Contas a Pagar</h1>
            <p className="text-muted-foreground text-xs">O que pagar, quando e como.</p>
          </div>
        </div>
        {currentBalance && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50 text-xs">
            <Wallet className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">Saldo:</span>
            <span className={cn('font-bold font-mono', currentBalance.amount >= 0 ? 'text-success' : 'text-destructive')}>
              {formatCurrency(currentBalance.amount)}
            </span>
          </div>
        )}
      </motion.div>

      {/* Action agenda */}
      {hasUrgent && (
        <motion.div {...sect(0.05)} className="space-y-3">

          {/* OVERDUE */}
          {agenda.overdue.length > 0 && (
            <div className="card-elevated overflow-hidden border-l-[3px] border-l-destructive">
              <div className="px-4 py-2.5 border-b bg-destructive/[0.03] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-bold text-destructive">Atrasados</span>
                  <Badge variant="destructive" className="text-[10px] px-1.5 h-5">
                    {agenda.overdue.length}
                  </Badge>
                  <span className="text-xs text-destructive/70 font-mono ml-1">
                    {formatCurrency(agenda.totalOverdue)}
                  </span>
                </div>
                {agenda.overdue.length > 1 && (
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => confirmAll(agenda.overdue)}>
                    <CheckCheck className="w-3.5 h-3.5" /> Confirmar tudo
                  </Button>
                )}
              </div>
              <div className="p-2 space-y-0.5">
                {agenda.overdue.map(tx => renderTxRow(tx))}
              </div>
            </div>
          )}

          {/* TODAY */}
          {agenda.todayTxs.length > 0 && (
            <div className="card-elevated overflow-hidden border-l-[3px] border-l-warning">
              <div className="px-4 py-2.5 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-warning" />
                  <span className="text-sm font-bold">Hoje</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-warning/40">
                    {agenda.todayTxs.length}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono ml-1">
                    {formatCurrency(agenda.totalToday)}
                  </span>
                </div>
                {agenda.todayTxs.length > 1 && (
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => confirmAll(agenda.todayTxs)}>
                    <CheckCheck className="w-3.5 h-3.5" /> Confirmar tudo
                  </Button>
                )}
              </div>
              <div className="p-2 space-y-0.5">
                {agenda.todayTxs.map(tx => renderTxRow(tx))}
              </div>
            </div>
          )}

          {/* TOMORROW */}
          {agenda.tomorrowTxs.length > 0 && (
            <div className="card-elevated overflow-hidden border-l-[3px] border-l-primary/40">
              <div className="px-4 py-2.5 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary/70" />
                  <span className="text-sm font-bold">Amanhã</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                    {agenda.tomorrowTxs.length}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono ml-1">
                    {formatCurrency(agenda.totalTomorrow)}
                  </span>
                </div>
                {agenda.tomorrowTxs.length > 1 && (
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => confirmAll(agenda.tomorrowTxs)}>
                    <CheckCheck className="w-3.5 h-3.5" /> Confirmar tudo
                  </Button>
                )}
              </div>
              <div className="p-2 space-y-0.5">
                {agenda.tomorrowTxs.map(tx => renderTxRow(tx))}
              </div>
            </div>
          )}

          {/* THIS WEEK */}
          {agenda.weekTxs.length > 0 && (
            <div className="card-elevated overflow-hidden">
              <div className="px-4 py-2.5 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-bold">Próximos 7 dias</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                    {agenda.weekTxs.length}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono ml-1">
                    {formatCurrency(agenda.totalWeek)}
                  </span>
                </div>
              </div>
              <div className="p-2 space-y-0.5">
                {agenda.weekTxs.map(tx => renderTxRow(tx, true))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Full table */}
      <motion.div {...sect(0.1)}>
        <TransactionTable type="pagar" />
      </motion.div>
    </div>
  );
}

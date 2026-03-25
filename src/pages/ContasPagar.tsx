import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { Transaction } from '@/lib/types';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth, formatDateFull } from '@/lib/helpers';
import {
  ArrowDownRight, AlertTriangle, Clock, Check, CheckCheck, CalendarDays, Wallet,
  CreditCard, Tag, Building2, ChevronDown, ChevronUp, FileText, MoreHorizontal,
  Pencil, Trash2, CalendarClock, RotateCcw, Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PRIORITY_LABELS, PRIORITY_CLASSES } from '@/lib/types';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import TransactionTable from '@/components/TransactionTable';
import OFXImportDialog from '@/components/OFXImportDialog';
import ConfirmPaymentDialog from '@/components/ConfirmPaymentDialog';

const sect = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function ContasPagar() {
  const { currentBalance, confirmTransaction, updateTransaction, deleteTransaction } = useFinance();
  const { filteredTransactions: transactions } = useObraFilter();
  const { obras } = useObras();
  const today = todayISO();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);
  const [rescheduleTx, setRescheduleTx] = useState<Transaction | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [refundTx, setRefundTx] = useState<Transaction | null>(null);
  const [showOFXImport, setShowOFXImport] = useState(false);
  const [confirmTx, setConfirmTx] = useState<Transaction | null>(null);

  const toggleSection = (key: string) =>
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const agenda = useMemo(() => {
    const pagar = transactions.filter(t => t.type === 'pagar' && t.status !== 'confirmado');

    const overdue = pagar
      .filter(t => t.status === 'atrasado')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const todayTxs = pagar.filter(t => t.dueDate === today && t.status !== 'atrasado');
    const tomorrowTxs = pagar.filter(t => t.dueDate === addDays(today, 1));

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
    txs.forEach(t => confirmTransaction(t.id, t.amount, t.type));
  };

  const renderTxCard = (tx: typeof transactions[0], showDate = false) => {
    const obraCode = getObraCode(tx.obraId);
    const days = tx.status === 'atrasado' ? daysBetween(tx.dueDate, today) : 0;

    return (
      <motion.div
        key={tx.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4, height: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'flex items-start gap-3 px-4 py-3 rounded-lg group/row transition-all',
          tx.status === 'atrasado'
            ? 'bg-destructive/[0.04] hover:bg-destructive/[0.08] border border-destructive/10'
            : 'hover:bg-muted/50 border border-transparent hover:border-border/50'
        )}
      >
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Row 1: Description + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold truncate max-w-[260px]">{tx.description}</p>
            {tx.status === 'atrasado' && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-[18px] shrink-0 gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                {days}d atraso
              </Badge>
            )}
            {tx.priority === 'crítica' && (
              <Badge className={cn('text-[9px] px-1.5 py-0 h-[18px]', PRIORITY_CLASSES[tx.priority])}>
                {PRIORITY_LABELS[tx.priority]}
              </Badge>
            )}
            {tx.priority === 'alta' && (
              <Badge className={cn('text-[9px] px-1.5 py-0 h-[18px]', PRIORITY_CLASSES[tx.priority])}>
                {PRIORITY_LABELS[tx.priority]}
              </Badge>
            )}
          </div>

          {/* Row 2: Supplier + metadata */}
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 font-medium">
              <CalendarDays className="w-3 h-3 shrink-0" />
              {formatDateFull(tx.dueDate)}
            </span>
            <span className="text-muted-foreground/30">·</span>
            {tx.counterpart && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[140px]">{tx.counterpart}</span>
              </span>
            )}
            {obraCode && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-[18px] font-mono shrink-0">
                {obraCode}
              </Badge>
            )}
            {tx.category && tx.category !== 'Outros' && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3 shrink-0" />
                {tx.category}
              </span>
            )}
            {tx.paymentMethod && (
              <span className="flex items-center gap-1 text-primary/70">
                <CreditCard className="w-3 h-3 shrink-0" />
                {tx.paymentMethod}
              </span>
            )}
            {tx.notes && (
              <span className="flex items-center gap-1 text-muted-foreground/60 truncate max-w-[120px]" title={tx.notes}>
                <FileText className="w-3 h-3 shrink-0" />
                {tx.notes}
              </span>
            )}
          </div>
        </div>

        {/* Right side: amount + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {showDate && (
            <span className="text-[11px] text-muted-foreground hidden sm:block font-medium">
              {getDayMonth(tx.dueDate)}
            </span>
          )}
          <span className="text-sm font-mono font-bold text-destructive min-w-[80px] text-right">
            {formatCurrency(tx.amount)}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity active:scale-90 hover:bg-success/10"
            onClick={() => setConfirmTx(tx)}
            title="Confirmar pagamento"
          >
            <Check className="w-4 h-4 text-success" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity active:scale-90"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => { setRescheduleTx(tx); setRescheduleDate(tx.dueDate); }}>
                <CalendarClock className="w-3.5 h-3.5 mr-2" />
                Reagendar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditingTx(tx); setShowForm(true); }}>
                <Pencil className="w-3.5 h-3.5 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRefundTx(tx)}>
                <RotateCcw className="w-3.5 h-3.5 mr-2" />
                Reembolso
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteConfirm(tx)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>
    );
  };

  const renderSection = (
    key: string,
    icon: React.ReactNode,
    title: string,
    txs: typeof transactions,
    total: number,
    borderColor: string,
    showDate = false,
  ) => {
    if (txs.length === 0) return null;
    const isCollapsed = collapsedSections[key];

    return (
      <div className={cn('card-elevated overflow-hidden border-l-[3px]', borderColor)}>
        <button
          onClick={() => toggleSection(key)}
          className="w-full px-4 py-3 border-b flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            {icon}
            <span className="text-sm font-bold">{title}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 h-5 font-mono">
              {txs.length}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">
              {formatCurrency(total)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {txs.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] gap-1 px-2.5"
                onClick={(e) => { e.stopPropagation(); confirmAll(txs); }}
              >
                <CheckCheck className="w-3.5 h-3.5" /> Confirmar tudo
              </Button>
            )}
            {isCollapsed
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronUp className="w-4 h-4 text-muted-foreground" />
            }
          </div>
        </button>
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="p-2 space-y-1">
                {txs.map(tx => renderTxCard(tx, showDate))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const hasUrgent = agenda.overdue.length > 0 || agenda.todayTxs.length > 0 || agenda.tomorrowTxs.length > 0 || agenda.weekTxs.length > 0;

  // Quick summary numbers
  const totalUrgent = agenda.totalOverdue + agenda.totalToday + agenda.totalTomorrow + agenda.totalWeek;
  const countUrgent = agenda.overdue.length + agenda.todayTxs.length + agenda.tomorrowTxs.length + agenda.weekTxs.length;

  return (
    <div className="space-y-5">
      {/* Sticky mobile header */}
      <div className="lg:hidden sticky top-14 z-20 bg-background/95 backdrop-blur-sm -mx-4 px-4 py-2 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="w-4 h-4 text-destructive" />
            <span className="text-sm font-bold">A Pagar</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {currentBalance && (
              <span className={cn('font-mono font-bold', currentBalance.amount >= 0 ? 'text-success' : 'text-destructive')}>
                {formatCurrency(currentBalance.amount)}
              </span>
            )}
            {hasUrgent && (
              <span className="font-mono font-bold text-destructive">
                {countUrgent} pend.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Header */}
      <motion.div {...sect(0)} className="hidden lg:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
            <ArrowDownRight className="w-[18px] h-[18px] text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Contas a Pagar</h1>
            <p className="text-muted-foreground text-xs">O que pagar, quando e como.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowOFXImport(true)} className="text-xs gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            Importar OFX
          </Button>
          {currentBalance && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-xs">
              <Wallet className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">Saldo:</span>
              <span className={cn('font-bold font-mono text-sm', currentBalance.amount >= 0 ? 'text-success' : 'text-destructive')}>
                {formatCurrency(currentBalance.amount)}
              </span>
            </div>
          )}
          {hasUrgent && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/15 text-xs">
              <Clock className="w-3.5 h-3.5 text-destructive" />
              <span className="text-muted-foreground">{countUrgent} pendência(s):</span>
              <span className="font-bold font-mono text-sm text-destructive">
                {formatCurrency(totalUrgent)}
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Action agenda */}
      {hasUrgent && (
        <motion.div {...sect(0.05)} className="space-y-3">
          {renderSection(
            'overdue',
            <AlertTriangle className="w-4 h-4 text-destructive" />,
            'Atrasados',
            agenda.overdue,
            agenda.totalOverdue,
            'border-l-destructive',
          )}

          {renderSection(
            'today',
            <CalendarDays className="w-4 h-4 text-warning" />,
            'Hoje',
            agenda.todayTxs,
            agenda.totalToday,
            'border-l-warning',
          )}

          {renderSection(
            'tomorrow',
            <CalendarDays className="w-4 h-4 text-primary/70" />,
            'Amanhã',
            agenda.tomorrowTxs,
            agenda.totalTomorrow,
            'border-l-primary/40',
          )}

          {renderSection(
            'week',
            <Clock className="w-4 h-4 text-muted-foreground" />,
            'Próximos 7 dias',
            agenda.weekTxs,
            agenda.totalWeek,
            'border-l-border',
            true,
          )}
        </motion.div>
      )}

      {/* Full table */}
      <motion.div {...sect(0.1)}>
        <TransactionTable type="pagar" />
      </motion.div>

      {/* Edit dialog */}
      <TransactionFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingTx(null); }}
        transaction={editingTx}
        defaultType="pagar"
      />

      {/* Refund dialog */}
      <TransactionFormDialog
        open={!!refundTx}
        onClose={() => setRefundTx(null)}
        transaction={null}
        defaultType="pagar"
        defaultObraId={refundTx?.obraId || undefined}
        prefill={{
          description: `Reembolso: ${refundTx?.description || ''}`,
          counterpart: refundTx?.counterpart || '',
          amount: refundTx?.amount || 0,
          category: 'Reembolso',
          notes: `Reembolso a funcionário ref.: ${refundTx?.description || ''}`,
        }}
      />

      {/* Reschedule dialog */}
      <Dialog open={!!rescheduleTx} onOpenChange={(v) => !v && setRescheduleTx(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reagendar pagamento</DialogTitle>
            <DialogDescription>
              Altere a data de vencimento de <strong>{rescheduleTx?.description}</strong>.
              <span className="block mt-1 text-xs">
                Vencimento atual: <span className="font-mono font-semibold text-foreground">{rescheduleTx && formatDateFull(rescheduleTx.dueDate)}</span>
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Nova data de vencimento
            </label>
            <Input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className="text-sm"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setRescheduleTx(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!rescheduleDate || rescheduleDate === rescheduleTx?.dueDate}
              onClick={() => {
                if (rescheduleTx && rescheduleDate) {
                  updateTransaction(rescheduleTx.id, { dueDate: rescheduleDate });
                  setRescheduleTx(null);
                }
              }}
            >
              <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
              Reagendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir conta a pagar</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm?.description}</strong>?
              {deleteConfirm && (
                <span className="block mt-1 text-xs font-mono">
                  Valor: {formatCurrency(deleteConfirm.amount)} · Venc.: {formatDateFull(deleteConfirm.dueDate)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deleteConfirm) {
                  deleteTransaction(deleteConfirm.id);
                  setDeleteConfirm(null);
                }
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OFXImportDialog open={showOFXImport} onClose={() => setShowOFXImport(false)} />
    </div>
  );
}

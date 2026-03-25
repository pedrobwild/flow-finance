import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, formatDate, todayISO, addDays } from '@/lib/helpers';
import { PRIORITY_CLASSES, PRIORITY_LABELS, STATUS_LABELS } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownCircle, ArrowUpCircle, Check, AlertTriangle, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PRIORITY_ORDER: Record<string, number> = { 'crítica': 0, 'alta': 1, 'normal': 2, 'baixa': 3 };
const STATUS_ORDER: Record<string, number> = { 'atrasado': 0, 'pendente': 1, 'previsto': 2, 'confirmado': 3 };

export default function ActionList() {
  const { confirmTransaction } = useFinance();
  const { filteredTransactions: transactions } = useObraFilter();
  const today = todayISO();

  const actions = useMemo(() => {
    return transactions
      .filter(t => t.status !== 'confirmado')
      .sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 9;
        const sb = STATUS_ORDER[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        const pa = PRIORITY_ORDER[a.priority] ?? 9;
        const pb = PRIORITY_ORDER[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 10);
  }, [transactions]);

  const getDateLabel = (dateStr: string) => {
    if (dateStr < today) return 'Atrasado';
    if (dateStr === today) return 'Hoje';
    const tmrw = addDays(today, 1);
    if (dateStr === tmrw) return 'Amanhã';
    return formatDate(dateStr);
  };

  const getDateColor = (dateStr: string) => {
    if (dateStr < today) return 'text-destructive';
    if (dateStr === today) return 'text-warning';
    return 'text-muted-foreground';
  };

  return (
    <div className="card-elevated h-full flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-accent" />
        <div>
          <h2 className="font-semibold text-sm">Próximas Ações</h2>
          <p className="text-[10px] text-muted-foreground">Top 10 — ordenadas por urgência</p>
        </div>
      </div>
      <div className="divide-y divide-border/60 flex-1 overflow-auto">
        <AnimatePresence mode="popLayout">
          {actions.map((tx, i) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ delay: i * 0.03, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'flex items-center gap-3 px-4 py-3 group/row hover:bg-muted/40 transition-colors',
                tx.status === 'atrasado' && 'bg-destructive/[0.03]',
                tx.dueDate === today && tx.status !== 'atrasado' && 'bg-warning/[0.03]'
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                tx.type === 'pagar' ? 'bg-destructive/10' : 'bg-success/10'
              )}>
                {tx.type === 'pagar'
                  ? <ArrowDownCircle className="w-3.5 h-3.5 text-destructive" />
                  : <ArrowUpCircle className="w-3.5 h-3.5 text-success" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.description}</p>
                <p className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</p>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <p className={cn('text-sm font-semibold font-mono', tx.type === 'pagar' ? 'text-destructive' : 'text-success')}>
                  {tx.type === 'pagar' ? '−' : '+'}{formatCurrency(tx.amount)}
                </p>
                <p className={cn('text-[10px]', getDateColor(tx.dueDate))}>{getDateLabel(tx.dueDate)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {tx.priority === 'crítica' && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                <span className={cn('status-badge text-[10px]', `status-${tx.status}`)}>
                  {STATUS_LABELS[tx.status]}
                </span>
                <span className={cn('status-badge text-[10px] hidden md:inline-flex', PRIORITY_CLASSES[tx.priority])}>
                  {PRIORITY_LABELS[tx.priority]}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity active:scale-90"
                onClick={() => confirmTransaction(tx.id)}
                title={tx.type === 'pagar' ? 'Confirmar pagamento' : 'Confirmar recebimento'}
              >
                <Check className="w-4 h-4 text-success" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
        {actions.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma ação pendente 🎉
          </div>
        )}
      </div>
    </div>
  );
}

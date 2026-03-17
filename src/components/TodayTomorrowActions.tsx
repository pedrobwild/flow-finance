import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowDownCircle, ArrowUpCircle, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function TodayTomorrowActions() {
  const { transactions, confirmTransaction } = useFinance();
  const today = todayISO();
  const tomorrow = addDays(today, 1);

  const groups = useMemo(() => {
    const build = (date: string, label: string) => {
      const txs = transactions.filter(t => t.status !== 'confirmado' && t.dueDate === date);
      const pagar = txs.filter(t => t.type === 'pagar');
      const receber = txs.filter(t => t.type === 'receber');
      return {
        label,
        date,
        pagar,
        receber,
        totalPagar: pagar.reduce((s, t) => s + t.amount, 0),
        totalReceber: receber.reduce((s, t) => s + t.amount, 0),
        ids: txs.map(t => t.id),
      };
    };
    return [build(today, 'Hoje'), build(tomorrow, 'Amanhã')];
  }, [transactions, today, tomorrow]);

  const hasItems = groups.some(g => g.pagar.length + g.receber.length > 0);
  if (!hasItems) return null;

  const confirmAll = (ids: string[]) => {
    ids.forEach(id => confirmTransaction(id));
  };

  return (
    <div className="card-elevated overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        {groups.map(group => {
          const total = group.pagar.length + group.receber.length;
          if (total === 0) {
            return (
              <div key={group.date} className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.label}</p>
                <p className="text-xs text-muted-foreground py-2">Nenhuma transação pendente</p>
              </div>
            );
          }

          return (
            <div key={group.date} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">{group.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {group.pagar.length > 0 && <span className="text-destructive font-medium">−{formatCurrency(group.totalPagar)}</span>}
                    {group.pagar.length > 0 && group.receber.length > 0 && ' · '}
                    {group.receber.length > 0 && <span className="text-success font-medium">+{formatCurrency(group.totalReceber)}</span>}
                  </p>
                </div>
                {total > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1 px-2.5"
                    onClick={() => confirmAll(group.ids)}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Confirmar tudo
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {[...group.pagar, ...group.receber].map(tx => (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10, height: 0 }}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-lg transition-colors group',
                        tx.type === 'pagar' ? 'bg-destructive/5 hover:bg-destructive/10' : 'bg-success/5 hover:bg-success/10'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                        tx.type === 'pagar' ? 'bg-destructive/15' : 'bg-success/15'
                      )}>
                        {tx.type === 'pagar'
                          ? <ArrowDownCircle className="w-3 h-3 text-destructive" />
                          : <ArrowUpCircle className="w-3 h-3 text-success" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{tx.description}</p>
                      </div>
                      <span className={cn(
                        'text-xs font-mono font-bold shrink-0',
                        tx.type === 'pagar' ? 'text-destructive' : 'text-success'
                      )}>
                        {tx.type === 'pagar' ? '−' : '+'}{formatCurrency(tx.amount)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => confirmTransaction(tx.id)}
                      >
                        <Check className="w-3.5 h-3.5 text-success" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { useBills } from '@/lib/bills-context';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { STATUS_LABELS } from '@/lib/types';
import { Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function PriorityList() {
  const { bills, markAsPaid } = useBills();

  const priorities = useMemo(() => {
    return bills
      .filter(b => b.status !== 'pago')
      .sort((a, b) => {
        if (a.status === 'atrasado' && b.status !== 'atrasado') return -1;
        if (b.status === 'atrasado' && a.status !== 'atrasado') return 1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 8);
  }, [bills]);

  return (
    <div className="card-elevated">
      <div className="p-5 border-b">
        <h3 className="text-base font-semibold">Prioridades da semana</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Contas que exigem atenção imediata</p>
      </div>
      <div className="divide-y">
        {priorities.map((bill, i) => (
          <motion.div
            key={bill.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {bill.status === 'atrasado' && (
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{bill.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{bill.supplier}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{formatDate(bill.dueDate)}</span>
                  <span className={`status-badge status-${bill.status}`}>
                    {STATUS_LABELS[bill.status]}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-mono text-sm font-semibold">{formatCurrency(bill.amount)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-success"
                onClick={() => markAsPaid(bill.id)}
                title="Marcar como pago"
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

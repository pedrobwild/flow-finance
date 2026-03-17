import { useFinance } from '@/lib/finance-context';
import { formatCurrency } from '@/lib/helpers';
import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AlertBanner() {
  const { transactions } = useFinance();
  const overdue = transactions.filter(t => t.status === 'atrasado');

  if (overdue.length === 0) return null;

  const payableOverdue = overdue.filter(t => t.type === 'pagar');
  const receivableOverdue = overdue.filter(t => t.type === 'receber');
  const totalPayable = payableOverdue.reduce((s, t) => s + t.amount, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-destructive text-destructive-foreground rounded-lg p-4 flex items-center gap-3 pulse-alert"
    >
      <AlertTriangle className="w-6 h-6 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold text-sm">
          ⚠️ {overdue.length} {overdue.length === 1 ? 'item atrasado' : 'itens atrasados'}
        </p>
        <p className="text-xs opacity-90 mt-0.5">
          {payableOverdue.length > 0 && `A pagar: ${formatCurrency(totalPayable)}`}
          {payableOverdue.length > 0 && receivableOverdue.length > 0 && ' · '}
          {receivableOverdue.length > 0 && `${receivableOverdue.length} recebimento(s) em atraso`}
        </p>
      </div>
    </motion.div>
  );
}

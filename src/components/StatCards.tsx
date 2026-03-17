import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Calendar, Clock, TrendingUp } from 'lucide-react';
import { useBills } from '@/lib/bills-context';
import { formatCurrency, isToday, isWithinDays, getOverdueBills } from '@/lib/helpers';

export default function StatCards() {
  const { bills } = useBills();

  const stats = useMemo(() => {
    const unpaid = bills.filter(b => b.status !== 'pago');
    const todayTotal = unpaid.filter(b => isToday(b.dueDate)).reduce((s, b) => s + b.amount, 0);
    const weekTotal = unpaid.filter(b => isWithinDays(b.dueDate, 7)).reduce((s, b) => s + b.amount, 0);
    const monthTotal = unpaid.filter(b => isWithinDays(b.dueDate, 30)).reduce((s, b) => s + b.amount, 0);
    const overdue = getOverdueBills(bills);
    const overdueTotal = overdue.reduce((s, b) => s + b.amount, 0);

    return [
      { label: 'Vence hoje', value: todayTotal, icon: Clock, alert: todayTotal > 0 },
      { label: 'Próximos 7 dias', value: weekTotal, icon: Calendar, alert: false },
      { label: 'Total do mês', value: monthTotal, icon: TrendingUp, alert: false },
      { label: 'Em atraso', value: overdueTotal, icon: AlertTriangle, alert: overdueTotal > 0, count: overdue.length },
    ];
  }, [bills]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={`card-elevated p-5 ${stat.alert ? 'pulse-alert border-destructive/30' : ''}`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">{stat.label}</span>
            <stat.icon className={`w-4 h-4 ${stat.alert ? 'text-destructive' : 'text-muted-foreground'}`} />
          </div>
          <p className="stat-value">{formatCurrency(stat.value)}</p>
          {stat.count !== undefined && stat.count > 0 && (
            <p className="text-xs text-destructive mt-1 font-medium">{stat.count} conta{stat.count > 1 ? 's' : ''}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}

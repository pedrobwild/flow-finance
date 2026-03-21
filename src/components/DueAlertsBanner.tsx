import { useMemo } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, AlertTriangle, Clock, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function DueAlertsBanner() {
  const { filteredTransactions: transactions } = useObraFilter();
  const { obras } = useObras();
  const today = todayISO();

  const alerts = useMemo(() => {
    const upcoming = transactions
      .filter(t => t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 3))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount);

    const overdue = transactions
      .filter(t => t.status === 'atrasado')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return { upcoming, overdue };
  }, [transactions, today]);

  if (!alerts.upcoming.length && !alerts.overdue.length) return null;

  const getObraCode = (obraId: string | null) => {
    if (!obraId) return null;
    return obras.find(o => o.id === obraId)?.code;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-2"
    >
      {/* Overdue alerts */}
      {alerts.overdue.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-xs font-bold text-destructive">
              {alerts.overdue.length} vencimento(s) em atraso
            </span>
            <span className="text-[10px] text-destructive/70 ml-auto">
              Total: {formatCurrency(alerts.overdue.reduce((s, t) => s + t.amount, 0))}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alerts.overdue.slice(0, 5).map(t => {
              const obraCode = getObraCode(t.obraId);
              const days = daysBetween(t.dueDate, today);
              return (
                <div key={t.id} className="inline-flex items-center gap-1.5 text-[10px] bg-destructive/10 rounded-md px-2 py-1">
                  <span className={cn('font-bold', t.type === 'pagar' ? 'text-destructive' : 'text-warning')}>
                    {t.type === 'pagar' ? '↓' : '↑'}
                  </span>
                  <span className="font-medium truncate max-w-[120px]">{t.description}</span>
                  <span className="text-destructive font-bold">{formatCurrency(t.amount)}</span>
                  <span className="text-destructive/60">{days}d atraso</span>
                  {obraCode && <Badge variant="outline" className="text-[8px] h-4 px-1">{obraCode}</Badge>}
                </div>
              );
            })}
            {alerts.overdue.length > 5 && (
              <span className="text-[10px] text-destructive/70 self-center">+{alerts.overdue.length - 5} mais</span>
            )}
          </div>
        </div>
      )}

      {/* Upcoming alerts (next 3 days) */}
      {alerts.upcoming.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-4 h-4 text-warning" />
            <span className="text-xs font-bold text-warning">
              {alerts.upcoming.length} vencimento(s) nos próximos 3 dias
            </span>
            <span className="text-[10px] text-warning/70 ml-auto">
              Total: {formatCurrency(alerts.upcoming.reduce((s, t) => s + t.amount, 0))}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alerts.upcoming.slice(0, 6).map(t => {
              const obraCode = getObraCode(t.obraId);
              const daysLeft = daysBetween(today, t.dueDate);
              const dateLabel = daysLeft === 0 ? 'Hoje' : daysLeft === 1 ? 'Amanhã' : getDayMonth(t.dueDate);
              return (
                <div key={t.id} className="inline-flex items-center gap-1.5 text-[10px] bg-warning/10 rounded-md px-2 py-1">
                  <span className={cn('font-bold', t.type === 'pagar' ? 'text-destructive' : 'text-success')}>
                    {t.type === 'pagar' ? '↓' : '↑'}
                  </span>
                  <span className="font-medium truncate max-w-[120px]">{t.description}</span>
                  <span className="font-bold">{formatCurrency(t.amount)}</span>
                  <Badge variant="outline" className="text-[8px] h-4 px-1 border-warning/40">{dateLabel}</Badge>
                  {obraCode && <Badge variant="outline" className="text-[8px] h-4 px-1">{obraCode}</Badge>}
                </div>
              );
            })}
            {alerts.upcoming.length > 6 && (
              <span className="text-[10px] text-warning/70 self-center">+{alerts.upcoming.length - 6} mais</span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

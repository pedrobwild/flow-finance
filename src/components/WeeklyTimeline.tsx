import { useMemo } from 'react';
import { useBills } from '@/lib/bills-context';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { motion } from 'framer-motion';

export default function WeeklyTimeline() {
  const { bills } = useBills();

  const weekDays = useMemo(() => {
    const days: { date: string; label: string; bills: typeof bills; total: number }[] = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayBills = bills.filter(b => b.dueDate === dateStr && b.status !== 'pago');
      const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric' }).format(d);

      days.push({
        date: dateStr,
        label,
        bills: dayBills,
        total: dayBills.reduce((s, b) => s + b.amount, 0),
      });
    }
    return days;
  }, [bills]);

  const weekTotal = weekDays.reduce((s, d) => s + d.total, 0);

  return (
    <div className="card-elevated">
      <div className="p-5 border-b flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Próximos 7 dias</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Visão diária de vencimentos</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total da semana</p>
          <p className="font-mono font-bold text-lg">{formatCurrency(weekTotal)}</p>
        </div>
      </div>
      <div className="grid grid-cols-7 divide-x">
        {weekDays.map((day, i) => (
          <motion.div
            key={day.date}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`p-3 min-h-[120px] ${i === 0 ? 'bg-primary/[0.03]' : ''}`}
          >
            <p className={`text-xs font-medium mb-2 ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`}>
              {day.label}
            </p>
            {day.total > 0 && (
              <p className="font-mono text-xs font-semibold mb-2">{formatCurrency(day.total)}</p>
            )}
            <div className="space-y-1">
              {day.bills.slice(0, 3).map(bill => (
                <div key={bill.id} className="text-[11px] text-muted-foreground truncate" title={bill.description}>
                  {bill.description}
                </div>
              ))}
              {day.bills.length > 3 && (
                <p className="text-[10px] text-muted-foreground">+{day.bills.length - 3} mais</p>
              )}
              {day.bills.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50">—</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

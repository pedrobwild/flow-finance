import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, daysBetween } from '@/lib/helpers';
import { ArrowUpRight, Users, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import TransactionTable from '@/components/TransactionTable';
import ObraClienteReport from '@/components/ObraClienteReport';

const sect = (delay: number) => ({
  initial: { opacity: 0, y: 16, filter: 'blur(4px)' } as const,
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' } as const,
  transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function ContasReceber() {
  const { } = useFinance();
  const { filteredTransactions: transactions, isFiltered } = useObraFilter();
  const today = todayISO();

  const insights = useMemo(() => {
    let receber = transactions.filter(t => t.type === 'receber');
    // Company view: exclude confirmed past transactions
    if (!isFiltered) {
      receber = receber.filter(t => !(t.status === 'confirmado' && t.dueDate < today));
    }
    const pending = receber.filter(t => t.status !== 'confirmado');
    const overdue = receber.filter(t => t.status === 'atrasado');
    const confirmed = receber.filter(t => t.status === 'confirmado');

    const totalPending = pending.reduce((s, t) => s + t.amount, 0);
    const totalOverdue = overdue.reduce((s, t) => s + t.amount, 0);
    const totalConfirmed = confirmed.reduce((s, t) => s + t.amount, 0);

    // Average days overdue
    const avgDaysOverdue = overdue.length > 0
      ? Math.round(overdue.reduce((s, t) => s + daysBetween(t.dueDate, today), 0) / overdue.length)
      : 0;

    // Top 3 clients by pending amount
    const clientMap = new Map<string, number>();
    pending.forEach(t => clientMap.set(t.counterpart, (clientMap.get(t.counterpart) || 0) + t.amount));
    const topClients = [...clientMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => ({ name, amount, pct: totalPending > 0 ? Math.round(amount / totalPending * 100) : 0 }));

    // Next 7d incoming
    const in7d = addDays(today, 7);
    const next7 = pending.filter(t => t.dueDate >= today && t.dueDate <= in7d);
    const totalNext7 = next7.reduce((s, t) => s + t.amount, 0);

    // Conversion rate
    const conversionRate = receber.length > 0 ? Math.round(confirmed.length / receber.length * 100) : 0;

    return {
      totalPending, totalOverdue, totalConfirmed,
      pendingCount: pending.length, overdueCount: overdue.length, confirmedCount: confirmed.length,
      avgDaysOverdue, topClients, totalNext7, next7Count: next7.length,
      conversionRate,
    };
  }, [transactions, today, isFiltered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...sect(0)} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center">
              <ArrowUpRight className="w-[18px] h-[18px] text-success" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Contas a Receber</h1>
              <p className="text-muted-foreground text-xs mt-0.5">Acompanhe entradas previstas, atrasadas e realizadas.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5 text-success" />
            <span>Taxa de confirmação: <span className="font-bold text-foreground">{insights.conversionRate}%</span></span>
          </div>
        </div>
      </motion.div>

      {/* Overdue warning */}
      {insights.overdueCount > 0 && (
        <motion.div {...sect(0.06)}>
          <div className="card-elevated p-4 ring-1 ring-destructive/15">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              </div>
              <div>
                <p className="text-xs font-semibold text-destructive">Recebíveis Atrasados</p>
                <p className="text-[10px] text-muted-foreground">{insights.overdueCount} pendência(s) · média de {insights.avgDaysOverdue} dias</p>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-destructive">{formatCurrency(insights.totalOverdue)}</span>
              <span className="text-[10px] text-muted-foreground">fora da projeção</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-destructive/60 transition-all duration-700"
                style={{ width: `${Math.min(100, insights.totalPending > 0 ? (insights.totalOverdue / (insights.totalPending + insights.totalOverdue)) * 100 : 0)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {insights.totalPending > 0
                ? `${Math.round(insights.totalOverdue / (insights.totalPending + insights.totalOverdue) * 100)}% do total pendente está atrasado`
                : 'Todos os valores estão atrasados'}
            </p>
          </div>
        </motion.div>
      )}

      {/* Coming soon strip */}
      {insights.next7Count > 0 && (
        <motion.div {...sect(0.10)} className="card-elevated p-3 flex items-center gap-3 border-l-[3px] border-l-success">
          <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">
              <span className="font-bold text-success">{formatCurrency(insights.totalNext7)}</span>
              <span className="text-muted-foreground"> em {insights.next7Count} recebimento(s) nos próximos 7 dias</span>
            </p>
          </div>
        </motion.div>
      )}


      {/* Table */}
      <motion.div {...sect(0.18)}>
        <TransactionTable type="receber" />
      </motion.div>
    </div>
  );
}

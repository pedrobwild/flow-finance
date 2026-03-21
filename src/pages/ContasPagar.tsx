import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, daysBetween } from '@/lib/helpers';
import { ArrowDownRight, Building2, Clock, AlertTriangle, TrendingDown, Layers, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import TransactionTable from '@/components/TransactionTable';

const sect = (delay: number) => ({
  initial: { opacity: 0, y: 16, filter: 'blur(4px)' } as const,
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' } as const,
  transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function ContasPagar() {
  const { currentBalance, projectedBalance } = useFinance();
  const { filteredTransactions: transactions } = useObraFilter();
  const { obras } = useObras();
  const today = todayISO();

  const insights = useMemo(() => {
    const pagar = transactions.filter(t => t.type === 'pagar');
    const pending = pagar.filter(t => t.status !== 'confirmado');
    const overdue = pagar.filter(t => t.status === 'atrasado');
    const confirmed = pagar.filter(t => t.status === 'confirmado');

    const totalPending = pending.reduce((s, t) => s + t.amount, 0);
    const totalOverdue = overdue.reduce((s, t) => s + t.amount, 0);
    const totalConfirmed = confirmed.reduce((s, t) => s + t.amount, 0);

    // Average days overdue
    const avgDaysOverdue = overdue.length > 0
      ? Math.round(overdue.reduce((s, t) => s + daysBetween(t.dueDate, today), 0) / overdue.length)
      : 0;

    // Top 3 suppliers by pending amount
    const supplierMap = new Map<string, number>();
    pending.forEach(t => supplierMap.set(t.counterpart, (supplierMap.get(t.counterpart) || 0) + t.amount));
    const topSuppliers = [...supplierMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => ({ name, amount, pct: totalPending > 0 ? Math.round(amount / totalPending * 100) : 0 }));

    // Top 3 categories by pending amount
    const categoryMap = new Map<string, number>();
    pending.forEach(t => categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + t.amount));
    const topCategories = [...categoryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => ({ name, amount, pct: totalPending > 0 ? Math.round(amount / totalPending * 100) : 0 }));

    // Next 7d outgoing
    const in7d = addDays(today, 7);
    const next7 = pending.filter(t => t.dueDate >= today && t.dueDate <= in7d);
    const totalNext7 = next7.reduce((s, t) => s + t.amount, 0);

    // Payment rate
    const paymentRate = pagar.length > 0 ? Math.round(confirmed.length / pagar.length * 100) : 0;

    return {
      totalPending, totalOverdue, totalConfirmed,
      pendingCount: pending.length, overdueCount: overdue.length, confirmedCount: confirmed.length,
      avgDaysOverdue, topSuppliers, topCategories, totalNext7, next7Count: next7.length,
      paymentRate,
    };
  }, [transactions, today]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...sect(0)} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <ArrowDownRight className="w-[18px] h-[18px] text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Contas a Pagar</h1>
              <p className="text-muted-foreground text-xs mt-0.5">Gerencie saídas, fornecedores e obrigações financeiras.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingDown className="w-3.5 h-3.5 text-success" />
            <span>Taxa de pagamento: <span className="font-bold text-foreground">{insights.paymentRate}%</span></span>
          </div>
        </div>
      </motion.div>

      {/* Insights strip */}
      {(insights.overdueCount > 0 || insights.topSuppliers.length > 0 || insights.topCategories.length > 0) && (
        <motion.div {...sect(0.06)} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Overdue aging */}
          {insights.overdueCount > 0 && (
            <div className="card-elevated p-4 ring-1 ring-destructive/15">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-destructive">Pagamentos Atrasados</p>
                  <p className="text-[10px] text-muted-foreground">{insights.overdueCount} pendência(s) · média de {insights.avgDaysOverdue} dias</p>
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-destructive">{formatCurrency(insights.totalOverdue)}</span>
                <span className="text-[10px] text-muted-foreground">em atraso</span>
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
          )}

          {/* Supplier concentration */}
          {insights.topSuppliers.length > 0 && (
            <div className="card-elevated p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Concentração por Fornecedor</p>
                  <p className="text-[10px] text-muted-foreground">Top fornecedores com valores pendentes</p>
                </div>
              </div>
              <div className="space-y-2">
                {insights.topSuppliers.map((s) => (
                  <div key={s.name} className="group/supplier">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium truncate flex-1 mr-2">{s.name || 'Sem nome'}</span>
                      <span className="text-xs font-mono font-semibold text-destructive shrink-0">{formatCurrency(s.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-destructive/40 transition-all duration-500"
                          style={{ width: `${s.pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{s.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {insights.topCategories.length > 0 && (
            <div className="card-elevated p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Maiores Categorias</p>
                  <p className="text-[10px] text-muted-foreground">Onde o dinheiro está comprometido</p>
                </div>
              </div>
              <div className="space-y-2">
                {insights.topCategories.map((c) => (
                  <div key={c.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium truncate flex-1 mr-2">{c.name}</span>
                      <span className="text-xs font-mono font-semibold text-foreground shrink-0">{formatCurrency(c.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/40 transition-all duration-500"
                          style={{ width: `${c.pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{c.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Upcoming payments strip */}
      {insights.next7Count > 0 && (
        <motion.div {...sect(0.10)} className="card-elevated p-3 flex items-center gap-3 border-l-[3px] border-l-warning">
          <div className="w-7 h-7 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">
              <span className="font-bold text-warning">{formatCurrency(insights.totalNext7)}</span>
              <span className="text-muted-foreground"> em {insights.next7Count} pagamento(s) nos próximos 7 dias</span>
            </p>
          </div>
        </motion.div>
      )}

      {/* Table */}
      <motion.div {...sect(0.14)}>
        <TransactionTable type="pagar" />
      </motion.div>
    </div>
  );
}

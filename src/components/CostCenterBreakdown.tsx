import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays } from '@/lib/helpers';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { COST_CENTER_COLORS } from '@/lib/types';
import type { CostCenter } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PieChart as PieIcon } from 'lucide-react';

export default function CostCenterBreakdown() {
  const { } = useFinance();
  const { filteredTransactions: transactions } = useObraFilter();
  const today = todayISO();
  const in30 = addDays(today, 30);

  const { data, total } = useMemo(() => {
    const map = new Map<CostCenter, number>();
    transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= in30)
      .forEach(t => map.set(t.costCenter, (map.get(t.costCenter) || 0) + t.amount));

    const sorted = [...map.entries()]
      .map(([name, value]) => ({ name, value, color: COST_CENTER_COLORS[name] || '#64748b' }))
      .sort((a, b) => b.value - a.value);

    return { data: sorted, total: sorted.reduce((s, d) => s + d.value, 0) };
  }, [transactions, today, in30]);

  if (data.length === 0) {
    return (
      <div className="card-elevated p-4 h-full flex flex-col items-center justify-center">
        <PieIcon className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <h2 className="font-semibold text-sm text-muted-foreground">Saídas por Centro de Custo</h2>
        <p className="text-xs text-muted-foreground mt-1">Sem saídas projetadas nos próximos 30 dias</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-card border rounded-lg p-2.5 shadow-xl text-xs space-y-1">
        <p className="font-semibold">{d.name}</p>
        <p className="font-mono">{formatCurrency(d.value)}</p>
        <p className="text-muted-foreground">{total > 0 ? `${Math.round(d.value / total * 100)}%` : ''}</p>
      </div>
    );
  };

  return (
    <div className="card-elevated h-full flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <PieIcon className="w-4 h-4 text-accent" />
        <div>
          <h2 className="font-semibold text-sm">Saídas por Centro de Custo</h2>
          <p className="text-[10px] text-muted-foreground">Próximos 30 dias · {formatCurrency(total)}</p>
        </div>
      </div>
      <div className="p-4 flex items-center gap-5 flex-1">
        <div className="w-[140px] h-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                strokeWidth={2}
                stroke="hsl(var(--card))"
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          {data.map((d, i) => {
            const pct = Math.round(d.value / total * 100);
            return (
              <div key={d.name} className="group/item">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                  <span className="text-xs truncate flex-1">{d.name}</span>
                  <span className="text-xs font-mono font-semibold shrink-0">{formatCurrency(d.value)}</span>
                </div>
                <div className="ml-[18px] flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: d.color, opacity: 0.7 }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

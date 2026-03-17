import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useBills } from '@/lib/bills-context';
import { formatCurrency } from '@/lib/helpers';
import { COST_CENTER_COLORS, CostCenter } from '@/lib/types';

export default function CostCenterChart() {
  const { bills } = useBills();

  const data = useMemo(() => {
    const unpaid = bills.filter(b => b.status !== 'pago');
    const grouped: Record<string, number> = {};
    unpaid.forEach(b => {
      grouped[b.costCenter] = (grouped[b.costCenter] || 0) + b.amount;
    });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [bills]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card-elevated p-5">
      <h3 className="text-base font-semibold mb-1">Por centro de custo</h3>
      <p className="text-sm text-muted-foreground mb-4">Distribuição de despesas pendentes</p>

      <div className="flex items-center gap-6">
        <div className="w-36 h-36 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={60}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={COST_CENTER_COLORS[entry.name as CostCenter] || '#94a3b8'}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  fontSize: '13px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COST_CENTER_COLORS[item.name as CostCenter] || '#94a3b8' }}
                />
                <span className="text-muted-foreground">{item.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{formatCurrency(item.value)}</span>
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {((item.value / total) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

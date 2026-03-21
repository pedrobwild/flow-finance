import { useMemo, useState } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Input } from '@/components/ui/input';

export default function CashFlowMiniChart() {
  const { transactions, projectedBalance } = useFinance();
  const [threshold, setThreshold] = useState(20000);
  const today = todayISO();

  const data = useMemo(() => {
    const days = [];
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i);
      const dayPay = transactions
        .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate === date)
        .reduce((s, t) => s + t.amount, 0);
      const dayRec = transactions
        .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate === date)
        .reduce((s, t) => s + t.amount, 0);

      days.push({
        label: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : getDayMonth(date),
        entradas: dayRec,
        saidas: -dayPay,
        saldo: projectedBalance(date),
      });
    }
    return days;
  }, [transactions, projectedBalance, today]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-2.5 shadow-lg text-xs space-y-1">
        <p className="font-semibold">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.dataKey === 'saldo' ? '#1A6B8A' : p.color }}>
            {p.name}: {formatCurrency(Math.abs(p.value))}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="card-elevated">
      <div className="p-4 border-b flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-sm">Fluxo 14 dias</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Entradas, saídas e saldo</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Alerta &lt;</span>
          <Input
            type="number"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-20 h-7 text-xs"
          />
        </div>
      </div>
      <div className="p-4" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            {threshold > 0 && <ReferenceLine y={threshold} stroke="#D97706" strokeDasharray="4 4" />}
            <Bar dataKey="entradas" name="Entradas" fill="#059669" radius={[3, 3, 0, 0]} />
            <Bar dataKey="saidas" name="Saídas" fill="#DC2626" radius={[0, 0, 3, 3]} />
            <Line
              dataKey="saldo"
              name="Saldo Projetado"
              stroke="#1A6B8A"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: '#1A6B8A' }}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#059669' }} /> Entradas</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#DC2626' }} /> Saídas</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded" style={{ background: '#1A6B8A' }} /> Saldo</span>
      </div>
    </div>
  );
}

import { formatCurrency } from '@/lib/helpers';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface DayData {
  label: string;
  accumulated: number;
}

interface Props {
  days: DayData[];
  threshold: number;
}

export default function CashFlowAreaChart({ days, threshold }: Props) {
  const data = days.map(d => ({ label: d.label, saldo: d.accumulated }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-2 shadow-lg text-xs">
        <p className="font-semibold">{label}</p>
        <p style={{ color: payload[0].value >= 0 ? '#059669' : '#DC2626' }}>
          Saldo: {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  };

  return (
    <div className="card-elevated">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm">Curva de Saldo Projetado</h2>
      </div>
      <div className="p-4" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1A6B8A" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#1A6B8A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#DC2626" strokeWidth={1.5} />
            {threshold > 0 && <ReferenceLine y={threshold} stroke="#D97706" strokeDasharray="4 4" />}
            <Area
              type="monotone"
              dataKey="saldo"
              stroke="#1A6B8A"
              strokeWidth={2}
              fill="url(#saldoGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

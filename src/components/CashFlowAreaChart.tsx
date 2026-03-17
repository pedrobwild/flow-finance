import { useMemo } from 'react';
import { formatCurrency, getDayMonth } from '@/lib/helpers';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';

interface DayData {
  date: string;
  label: string;
  accumulated: number;
  entradas?: number;
  saidas?: number;
  isToday?: boolean;
}

interface Props {
  days: DayData[];
  threshold: number;
}

export default function CashFlowAreaChart({ days, threshold }: Props) {
  const data = useMemo(() => days.map(d => ({
    label: d.label,
    saldo: d.accumulated,
    entradas: d.entradas || 0,
    saidas: d.saidas ? -d.saidas : 0,
  })), [days]);

  const minVal = Math.min(...data.map(d => Math.min(d.saldo, d.saidas)));
  const maxVal = Math.max(...data.map(d => Math.max(d.saldo, d.entradas)));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const saldo = payload.find((p: any) => p.dataKey === 'saldo');
    const entradas = payload.find((p: any) => p.dataKey === 'entradas');
    const saidas = payload.find((p: any) => p.dataKey === 'saidas');

    return (
      <div className="bg-card border rounded-lg p-3 shadow-xl text-xs space-y-1.5 min-w-[160px]">
        <p className="font-semibold text-foreground">{label}</p>
        {saldo && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Saldo</span>
            <span className="font-mono font-semibold" style={{ color: saldo.value >= 0 ? '#059669' : '#DC2626' }}>
              {formatCurrency(saldo.value)}
            </span>
          </div>
        )}
        {entradas && entradas.value > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Entradas</span>
            <span className="font-mono text-success">+{formatCurrency(entradas.value)}</span>
          </div>
        )}
        {saidas && saidas.value < 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Saídas</span>
            <span className="font-mono text-destructive">−{formatCurrency(Math.abs(saidas.value))}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card-elevated">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-sm">Curva de Saldo Projetado</h2>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-0.5 rounded" style={{ background: '#1A6B8A' }} /> Saldo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded opacity-40" style={{ background: '#059669' }} /> Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded opacity-40" style={{ background: '#DC2626' }} /> Saídas
          </span>
          {threshold > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-t-2 border-dashed" style={{ borderColor: '#D97706' }} /> Alerta
            </span>
          )}
        </div>
      </div>
      <div className="p-4" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="saldoGradPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1A6B8A" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#1A6B8A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="entradasGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="saidasGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#DC2626" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e9" strokeOpacity={0.5} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e5e9' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#DC2626" strokeWidth={1} strokeOpacity={0.5} />
            {threshold > 0 && (
              <ReferenceLine
                y={threshold}
                stroke="#D97706"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{ value: `Alerta: ${formatCurrency(threshold)}`, fontSize: 9, fill: '#D97706', position: 'insideTopRight' }}
              />
            )}
            <Area
              type="monotone"
              dataKey="entradas"
              stroke="#059669"
              strokeWidth={0}
              fill="url(#entradasGrad)"
              stackId="bars"
            />
            <Area
              type="monotone"
              dataKey="saidas"
              stroke="#DC2626"
              strokeWidth={0}
              fill="url(#saidasGrad)"
              stackId="bars"
            />
            <Area
              type="monotone"
              dataKey="saldo"
              stroke="#1A6B8A"
              strokeWidth={2.5}
              fill="url(#saldoGradPos)"
              dot={{ r: 2, fill: '#1A6B8A', strokeWidth: 0 }}
              activeDot={{ r: 4, fill: '#1A6B8A', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

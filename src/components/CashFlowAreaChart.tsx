import { useMemo } from 'react';
import { formatCurrency } from '@/lib/helpers';
import {
  Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Bar, ComposedChart, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';

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
    saidas: d.saidas ? d.saidas : 0,
    isNegative: d.accumulated < 0,
    isToday: d.isToday,
  })), [days]);

  const minSaldo = Math.min(...data.map(d => d.saldo));
  const maxSaldo = Math.max(...data.map(d => d.saldo));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const saldo = payload.find((p: any) => p.dataKey === 'saldo');
    const entradas = payload.find((p: any) => p.dataKey === 'entradas');
    const saidas = payload.find((p: any) => p.dataKey === 'saidas');

    return (
      <div className="bg-card border rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[200px] backdrop-blur-sm">
        <p className="font-bold text-sm text-foreground">{label}</p>
        <div className="h-px bg-border" />
        <div className="space-y-1.5">
          {entradas && entradas.value > 0 && (
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-success/60" />
                Entradas
              </span>
              <span className="font-mono text-success font-bold">+{formatCurrency(entradas.value)}</span>
            </div>
          )}
          {saidas && saidas.value > 0 && (
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-destructive/60" />
                Saídas
              </span>
              <span className="font-mono text-destructive font-bold">−{formatCurrency(saidas.value)}</span>
            </div>
          )}
        </div>
        {saldo && (
          <>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between gap-6">
              <span className="font-semibold">Saldo Projetado</span>
              <span className={cn('font-mono font-bold text-base', saldo.value >= 0 ? 'text-foreground' : 'text-destructive')}>
                {formatCurrency(saldo.value)}
              </span>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="card-elevated overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="font-bold text-sm">Curva de Saldo Projetado</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Mín: <span className={cn('font-mono font-semibold', minSaldo < 0 ? 'text-destructive' : 'text-foreground')}>{formatCurrency(minSaldo)}</span>
            <span className="mx-1.5">→</span>
            Máx: <span className="font-mono font-semibold">{formatCurrency(maxSaldo)}</span>
          </p>
        </div>
        <div className="flex items-center gap-5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-[3px] rounded-full bg-primary" /> Saldo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-success/50" /> Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-destructive/40" /> Saídas
          </span>
          {threshold > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-t-2 border-dashed border-warning" /> Alerta
            </span>
          )}
        </div>
      </div>
      <div className="p-4 pt-6" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="saldoGradPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="saldoGradNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.15} />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              interval={data.length > 30 ? 3 : 2}
            />
            <YAxis
              yAxisId="saldo"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="bars"
              orientation="right"
              tick={false}
              axisLine={false}
              tickLine={false}
              hide
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine yAxisId="saldo" y={0} stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeOpacity={0.3} strokeDasharray="4 4" />
            {threshold > 0 && (
              <ReferenceLine
                yAxisId="saldo"
                y={threshold}
                stroke="hsl(var(--warning))"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                strokeOpacity={0.6}
                label={{ value: 'Alerta', position: 'right', fill: 'hsl(var(--warning))', fontSize: 9 }}
              />
            )}
            <Bar
              yAxisId="bars"
              dataKey="entradas"
              radius={[3, 3, 0, 0]}
              barSize={data.length > 30 ? 5 : 8}
            >
              {data.map((_, i) => (
                <Cell key={i} fill="hsl(var(--success))" fillOpacity={0.4} />
              ))}
            </Bar>
            <Bar
              yAxisId="bars"
              dataKey="saidas"
              radius={[3, 3, 0, 0]}
              barSize={data.length > 30 ? 5 : 8}
            >
              {data.map((_, i) => (
                <Cell key={i} fill="hsl(var(--destructive))" fillOpacity={0.3} />
              ))}
            </Bar>
            <Area
              yAxisId="saldo"
              type="monotone"
              dataKey="saldo"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="url(#saldoGradPos)"
              dot={false}
              activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

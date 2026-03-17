import { useMemo, useState } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween } from '@/lib/helpers';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, ReferenceArea,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function ForecastChart() {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const [period, setPeriod] = useState<21 | 30 | 45>(30);
  const today = todayISO();

  const { data, dangerZones } = useMemo(() => {
    const points: { label: string; date: string; saldo: number; entradas: number; saidas: number }[] = [];
    const zones: { start: string; end: string }[] = [];
    let inDanger = false;
    let dangerStart = '';

    for (let i = 0; i <= period; i++) {
      const date = addDays(today, i);
      const projected = projectedBalance(date);
      
      const dayIn = transactions
        .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate === date)
        .reduce((s, t) => s + t.amount, 0);
      const dayOut = transactions
        .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate === date)
        .reduce((s, t) => s + t.amount, 0);

      const label = i === 0 ? 'Hoje' : getDayMonth(date);

      points.push({ label, date, saldo: projected, entradas: dayIn, saidas: dayOut });

      // Track danger zones (negative balance)
      if (projected < 0 && !inDanger) {
        inDanger = true;
        dangerStart = label;
      } else if (projected >= 0 && inDanger) {
        inDanger = false;
        zones.push({ start: dangerStart, end: points[i - 1]?.label || label });
      }
    }
    if (inDanger) {
      zones.push({ start: dangerStart, end: points[points.length - 1].label });
    }

    return { data: points, dangerZones: zones };
  }, [transactions, projectedBalance, today, period]);

  const minSaldo = Math.min(...data.map(d => d.saldo));
  const maxSaldo = Math.max(...data.map(d => d.saldo));
  const bal = currentBalance?.amount ?? 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const saldo = payload.find((p: any) => p.dataKey === 'saldo')?.value ?? 0;
    const entradas = payload.find((p: any) => p.dataKey === 'entradas')?.value ?? 0;
    const saidas = payload.find((p: any) => p.dataKey === 'saidas')?.value ?? 0;

    return (
      <div className="bg-card border rounded-lg p-3 shadow-xl text-xs space-y-1.5 min-w-[180px]">
        <p className="font-semibold text-foreground">{label}</p>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Saldo projetado</span>
          <span className={cn('font-mono font-bold', saldo >= 0 ? 'text-success' : 'text-destructive')}>
            {formatCurrency(saldo)}
          </span>
        </div>
        {entradas > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Entradas</span>
            <span className="font-mono text-success">+{formatCurrency(entradas)}</span>
          </div>
        )}
        {saidas > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Saídas</span>
            <span className="font-mono text-destructive">−{formatCurrency(saidas)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1 border-t">
          <span className="text-muted-foreground">Variação vs hoje</span>
          <span className={cn('font-mono', saldo - bal >= 0 ? 'text-success' : 'text-destructive')}>
            {saldo - bal >= 0 ? '+' : ''}{formatCurrency(saldo - bal)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="card-elevated">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm">Projeção de Caixa</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Saldo: <span className={cn('font-semibold', minSaldo < 0 ? 'text-destructive' : 'text-foreground')}>{formatCurrency(minSaldo)}</span> (mín)
            {' → '}
            <span className="font-semibold">{formatCurrency(maxSaldo)}</span> (máx)
          </p>
        </div>
        <div className="flex items-center gap-1">
          {([21, 30, 45] as const).map(p => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? 'default' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setPeriod(p)}
            >
              {p}d
            </Button>
          ))}
        </div>
      </div>
      <div className="p-4" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="forecastGradPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(160, 84%, 30%)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(160, 84%, 30%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="forecastGradNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 15% 89%)" strokeOpacity={0.7} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'hsl(200, 10%, 46%)' }}
              axisLine={{ stroke: 'hsl(200 15% 89%)' }}
              tickLine={false}
              interval={period > 30 ? 3 : 2}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(200, 10%, 46%)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(0, 72%, 51%)" strokeWidth={1.5} strokeOpacity={0.6} />
            {/* Danger zone shading */}
            {dangerZones.map((zone, i) => (
              <ReferenceArea
                key={i}
                x1={zone.start}
                x2={zone.end}
                fill="hsl(0, 72%, 51%)"
                fillOpacity={0.08}
                strokeOpacity={0}
              />
            ))}
            <Area
              type="monotone"
              dataKey="saldo"
              stroke="hsl(197, 70%, 16%)"
              strokeWidth={2.5}
              fill="url(#forecastGradPos)"
              dot={false}
              activeDot={{ r: 5, fill: 'hsl(197, 70%, 16%)', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 rounded" style={{ background: 'hsl(197, 70%, 16%)' }} /> Saldo projetado
        </span>
        {dangerZones.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-destructive/20" /> Zona de risco
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0 border-t-2 border-destructive/50" /> Zero
        </span>
      </div>
    </div>
  );
}

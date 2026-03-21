import { useMemo, useState } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, getDayMonth, getWeekdayName } from '@/lib/helpers';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TrendingDown, TrendingUp, ShieldAlert } from 'lucide-react';

type Granularity = 'dia' | 'semana';
type DayCount = 15 | 30 | 45;
type WeekCount = 6 | 8 | 12;

interface DataPoint {
  label: string;
  periodStart: string;
  periodEnd: string;
  saldoInicial: number;
  entradas: number;
  saidas: number; // negative for chart
  saldoFinal: number;
  netFlow: number;
  zone: 'safe' | 'attention' | 'danger';
}

export default function WeeklyCashProjection() {
  const { currentBalance } = useFinance();
  const { filteredTransactions, filteredProjectedBalance, filteredBalance } = useObraFilter();
  const today = todayISO();
  const [granularity, setGranularity] = useState<Granularity>('dia');
  const [days, setDays] = useState<DayCount>(30);
  const [weeks, setWeeks] = useState<WeekCount>(6);

  const safetyMargin = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    return Math.max(bal * 0.1, 5000);
  }, [currentBalance]);

  const data = useMemo((): DataPoint[] => {
    const result: DataPoint[] = [];

    if (granularity === 'dia') {
      for (let d = 0; d < days; d++) {
        const date = addDays(today, d);
        const saldoInicial = d === 0 ? (currentBalance?.amount ?? 0) : projectedBalance(addDays(today, d - 1));
        const dayEntradas = filteredTransactions
          .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate === date)
          .reduce((s, t) => s + t.amount, 0);
        const daySaidas = filteredTransactions
          .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate === date)
          .reduce((s, t) => s + t.amount, 0);
        const saldoFinal = projectedBalance(date);

        let zone: 'safe' | 'attention' | 'danger' = 'safe';
        if (saldoFinal < 0) zone = 'danger';
        else if (saldoFinal < safetyMargin) zone = 'attention';

        const label = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : getDayMonth(date);

        result.push({
          label,
          periodStart: date,
          periodEnd: date,
          saldoInicial,
          entradas: dayEntradas,
          saidas: -daySaidas,
          saldoFinal,
          netFlow: dayEntradas - daySaidas,
          zone,
        });
      }
    } else {
      for (let w = 0; w < weeks; w++) {
        const ws = addDays(today, w * 7);
        const we = addDays(today, w * 7 + 6);
        const saldoInicial = projectedBalance(ws);
        const weekEntradas = filteredTransactions
          .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= ws && t.dueDate <= we)
          .reduce((s, t) => s + t.amount, 0);
        const weekSaidas = filteredTransactions
          .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= ws && t.dueDate <= we)
          .reduce((s, t) => s + t.amount, 0);
        const saldoFinal = projectedBalance(we);

        let zone: 'safe' | 'attention' | 'danger' = 'safe';
        if (saldoFinal < 0) zone = 'danger';
        else if (saldoFinal < safetyMargin) zone = 'attention';

        result.push({
          label: w === 0 ? 'Esta semana' : getDayMonth(ws),
          periodStart: ws,
          periodEnd: we,
          saldoInicial,
          entradas: weekEntradas,
          saidas: -weekSaidas,
          saldoFinal,
          netFlow: weekEntradas - weekSaidas,
          zone,
        });
      }
    }
    return result;
  }, [filteredTransactions, projectedBalance, currentBalance, today, granularity, days, weeks, safetyMargin]);

  const dangerCount = data.filter(d => d.zone === 'danger').length;
  const attentionCount = data.filter(d => d.zone === 'attention').length;
  const worstPoint = data.length > 0 ? data.reduce((w, d) => d.saldoFinal < w.saldoFinal ? d : w, data[0]) : null;
  const periodLabel = granularity === 'dia' ? 'dia' : 'semana';
  const periodLabelPlural = granularity === 'dia' ? 'dias' : 'semanas';

  const zoneColors = {
    safe: 'hsl(var(--success))',
    attention: 'hsl(var(--warning))',
    danger: 'hsl(var(--destructive))',
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload as DataPoint;
    if (!point) return null;

    return (
      <div className="bg-card border rounded-lg p-3 shadow-xl text-xs space-y-2 min-w-[200px]">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{label}</p>
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded',
            point.zone === 'safe' && 'bg-success/10 text-success',
            point.zone === 'attention' && 'bg-warning/10 text-warning',
            point.zone === 'danger' && 'bg-destructive/10 text-destructive',
          )}>
            {point.zone === 'safe' ? 'Seguro' : point.zone === 'attention' ? 'Atenção' : 'Risco'}
          </span>
        </div>
        <div className="space-y-1 pt-1 border-t">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saldo inicial</span>
            <span className="font-mono">{formatCurrency(point.saldoInicial)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entradas</span>
            <span className="font-mono text-success">+{formatCurrency(point.entradas)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saídas</span>
            <span className="font-mono text-destructive">−{formatCurrency(Math.abs(point.saidas))}</span>
          </div>
          <div className="flex justify-between pt-1 border-t font-semibold">
            <span>Saldo final</span>
            <span className={cn('font-mono', point.saldoFinal >= 0 ? 'text-success' : 'text-destructive')}>
              {formatCurrency(point.saldoFinal)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card-elevated">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold">Margem de Segurança do Caixa</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Projeção {granularity === 'dia' ? 'diária' : 'semanal'} — o caixa suporta o cronograma?
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Granularity toggle */}
            <div className="flex items-center bg-muted rounded-md p-0.5">
              <Button
                size="sm"
                variant={granularity === 'dia' ? 'default' : 'ghost'}
                className="h-6 px-2 text-[10px]"
                onClick={() => setGranularity('dia')}
              >
                Dia
              </Button>
              <Button
                size="sm"
                variant={granularity === 'semana' ? 'default' : 'ghost'}
                className="h-6 px-2 text-[10px]"
                onClick={() => setGranularity('semana')}
              >
                Semana
              </Button>
            </div>
            {/* Period selector */}
            <div className="flex items-center gap-1">
              {granularity === 'dia'
                ? ([15, 30, 45] as const).map(d => (
                    <Button key={d} size="sm" variant={days === d ? 'default' : 'ghost'} className="h-7 px-2.5 text-xs" onClick={() => setDays(d)}>
                      {d}d
                    </Button>
                  ))
                : ([6, 8, 12] as const).map(w => (
                    <Button key={w} size="sm" variant={weeks === w ? 'default' : 'ghost'} className="h-7 px-2.5 text-xs" onClick={() => setWeeks(w)}>
                      {w}s
                    </Button>
                  ))
              }
            </div>
          </div>
        </div>

        {/* Status strip */}
        <div className="flex flex-wrap gap-3 mt-2">
          {dangerCount > 0 && (
            <div className="flex items-center gap-1.5 text-destructive">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">
                {dangerCount} {dangerCount > 1 ? periodLabelPlural : periodLabel} em risco
              </span>
            </div>
          )}
          {attentionCount > 0 && (
            <div className="flex items-center gap-1.5 text-warning">
              <TrendingDown className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">
                {attentionCount} {attentionCount > 1 ? periodLabelPlural : periodLabel} em atenção
              </span>
            </div>
          )}
          {dangerCount === 0 && attentionCount === 0 && (
            <div className="flex items-center gap-1.5 text-success">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Caixa saudável no período</span>
            </div>
          )}
          {worstPoint && (
            <span className="text-[11px] text-muted-foreground">
              Pior ponto: <span className="font-medium text-foreground">{worstPoint.label}</span> ({formatCurrency(worstPoint.saldoFinal)})
            </span>
          )}
        </div>
      </div>

      <div className="p-4" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: granularity === 'dia' ? 8 : 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              interval={granularity === 'dia' ? (days > 30 ? 3 : 2) : 0}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine
              y={safetyMargin}
              stroke="hsl(var(--warning))"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              strokeOpacity={0.6}
            />
            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeOpacity={0.4} />

            <Bar dataKey="entradas" stackId="flow" radius={[2, 2, 0, 0]} maxBarSize={granularity === 'dia' ? 16 : 32}>
              {data.map((_, i) => (
                <Cell key={i} fill="hsl(var(--success))" fillOpacity={0.7} />
              ))}
            </Bar>
            <Bar dataKey="saidas" stackId="flow" radius={[0, 0, 2, 2]} maxBarSize={granularity === 'dia' ? 16 : 32}>
              {data.map((_, i) => (
                <Cell key={i} fill="hsl(var(--destructive))" fillOpacity={0.5} />
              ))}
            </Bar>

            <Line
              type="monotone"
              dataKey="saldoFinal"
              stroke="hsl(var(--accent))"
              strokeWidth={2.5}
              dot={granularity === 'semana' ? ((props: any) => {
                const point = data[props.index];
                if (!point) return <circle key={props.index} />;
                return (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={5}
                    fill={zoneColors[point.zone]}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                );
              }) : false}
              activeDot={{ r: 5, stroke: 'hsl(var(--accent))', strokeWidth: 2, fill: 'hsl(var(--card))' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-success/70" /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-destructive/50" /> Saídas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 bg-accent rounded" /> Saldo projetado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0 border-t-2 border-dashed border-warning/60" /> Margem de segurança
        </span>
      </div>
    </div>
  );
}

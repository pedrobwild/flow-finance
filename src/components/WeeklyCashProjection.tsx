import { useMemo, useState } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TrendingDown, TrendingUp, ShieldAlert } from 'lucide-react';

interface WeekData {
  label: string;
  weekStart: string;
  weekEnd: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldoFinal: number;
  netFlow: number;
  zone: 'safe' | 'attention' | 'danger';
}

export default function WeeklyCashProjection() {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const { filteredTransactions } = useObraFilter();
  const today = todayISO();
  const [weeks, setWeeks] = useState<6 | 8 | 12>(6);

  const safetyMargin = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    return Math.max(bal * 0.1, 5000);
  }, [currentBalance]);

  const data = useMemo((): WeekData[] => {
    const result: WeekData[] = [];

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
      const netFlow = weekEntradas - weekSaidas;

      let zone: 'safe' | 'attention' | 'danger' = 'safe';
      if (saldoFinal < 0) zone = 'danger';
      else if (saldoFinal < safetyMargin) zone = 'attention';

      result.push({
        label: w === 0 ? 'Esta semana' : `${getDayMonth(ws)}`,
        weekStart: ws,
        weekEnd: we,
        saldoInicial,
        entradas: weekEntradas,
        saidas: -weekSaidas, // negative for chart
        saldoFinal,
        netFlow,
        zone,
      });
    }
    return result;
  }, [filteredTransactions, projectedBalance, today, weeks, safetyMargin]);

  const minSaldo = Math.min(...data.map(d => Math.min(d.saldoFinal, d.saidas)));
  const dangerWeeks = data.filter(d => d.zone === 'danger').length;
  const attentionWeeks = data.filter(d => d.zone === 'attention').length;
  const worstWeek = data.reduce((worst, d) => d.saldoFinal < worst.saldoFinal ? d : worst, data[0]);

  const zoneColors = {
    safe: 'hsl(var(--success))',
    attention: 'hsl(var(--warning))',
    danger: 'hsl(var(--destructive))',
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const week = payload[0]?.payload as WeekData;
    if (!week) return null;

    return (
      <div className="bg-card border rounded-lg p-3 shadow-xl text-xs space-y-2 min-w-[200px]">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{label}</p>
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded',
            week.zone === 'safe' && 'bg-success/10 text-success',
            week.zone === 'attention' && 'bg-warning/10 text-warning',
            week.zone === 'danger' && 'bg-destructive/10 text-destructive',
          )}>
            {week.zone === 'safe' ? 'Seguro' : week.zone === 'attention' ? 'Atenção' : 'Risco'}
          </span>
        </div>
        <div className="space-y-1 pt-1 border-t">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saldo inicial</span>
            <span className="font-mono">{formatCurrency(week.saldoInicial)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entradas</span>
            <span className="font-mono text-success">+{formatCurrency(week.entradas)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saídas</span>
            <span className="font-mono text-destructive">−{formatCurrency(Math.abs(week.saidas))}</span>
          </div>
          <div className="flex justify-between pt-1 border-t font-semibold">
            <span>Saldo final</span>
            <span className={cn('font-mono', week.saldoFinal >= 0 ? 'text-success' : 'text-destructive')}>
              {formatCurrency(week.saldoFinal)}
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
              Projeção semanal — o caixa suporta o cronograma?
            </p>
          </div>
          <div className="flex items-center gap-1">
            {([6, 8, 12] as const).map(w => (
              <Button
                key={w}
                size="sm"
                variant={weeks === w ? 'default' : 'ghost'}
                className="h-7 px-2.5 text-xs"
                onClick={() => setWeeks(w)}
              >
                {w}s
              </Button>
            ))}
          </div>
        </div>

        {/* Status strip */}
        <div className="flex flex-wrap gap-3 mt-2">
          {dangerWeeks > 0 && (
            <div className="flex items-center gap-1.5 text-destructive">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">
                {dangerWeeks} semana{dangerWeeks > 1 ? 's' : ''} em risco
              </span>
            </div>
          )}
          {attentionWeeks > 0 && (
            <div className="flex items-center gap-1.5 text-warning">
              <TrendingDown className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">
                {attentionWeeks} semana{attentionWeeks > 1 ? 's' : ''} em atenção
              </span>
            </div>
          )}
          {dangerWeeks === 0 && attentionWeeks === 0 && (
            <div className="flex items-center gap-1.5 text-success">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Caixa saudável no período</span>
            </div>
          )}
          {worstWeek && (
            <span className="text-[11px] text-muted-foreground">
              Pior semana: <span className="font-medium text-foreground">{worstWeek.label}</span> ({formatCurrency(worstWeek.saldoFinal)})
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
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Safety margin line */}
            <ReferenceLine
              y={safetyMargin}
              stroke="hsl(var(--warning))"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              strokeOpacity={0.6}
            />
            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeOpacity={0.4} />

            {/* Bars */}
            <Bar dataKey="entradas" stackId="flow" radius={[2, 2, 0, 0]} maxBarSize={32}>
              {data.map((_, i) => (
                <Cell key={i} fill="hsl(var(--success))" fillOpacity={0.7} />
              ))}
            </Bar>
            <Bar dataKey="saidas" stackId="flow" radius={[0, 0, 2, 2]} maxBarSize={32}>
              {data.map((_, i) => (
                <Cell key={i} fill="hsl(var(--destructive))" fillOpacity={0.5} />
              ))}
            </Bar>

            {/* Saldo line */}
            <Line
              type="monotone"
              dataKey="saldoFinal"
              stroke="hsl(var(--accent))"
              strokeWidth={2.5}
              dot={(props: any) => {
                const week = data[props.index];
                if (!week) return <circle key={props.index} />;
                return (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={5}
                    fill={zoneColors[week.zone]}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 6, stroke: 'hsl(var(--accent))', strokeWidth: 2, fill: 'hsl(var(--card))' }}
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

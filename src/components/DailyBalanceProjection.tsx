import { useMemo, useState } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, ReferenceArea,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, AlertTriangle, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

type Horizon = 30 | 60 | 90;

interface DataPoint {
  label: string;
  date: string;
  saldo: number;
  entradas: number;
  saidas: number;
  isNegative: boolean;
}

export default function DailyBalanceProjection() {
  const { filteredTransactions: transactions, filteredBalance: currentBalance, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const [horizon, setHorizon] = useState<Horizon>(30);
  const today = todayISO();
  const bal = currentBalance?.amount ?? 0;

  const { data, dangerZones, metrics } = useMemo(() => {
    const points: DataPoint[] = [];
    const zones: { start: string; end: string }[] = [];
    let inDanger = false;
    let dangerStart = '';
    let minSaldo = Infinity;
    let maxSaldo = -Infinity;
    let minDate = '';
    let maxDate = '';
    let negativeDays = 0;
    let firstNegativeDate = '';

    for (let i = 0; i <= horizon; i++) {
      const date = addDays(today, i);
      const saldo = projectedBalance(date);

      const dayIn = transactions
        .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate === date)
        .reduce((s, t) => s + t.amount, 0);
      const dayOut = transactions
        .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate === date)
        .reduce((s, t) => s + t.amount, 0);

      const label = i === 0 ? 'Hoje' : getDayMonth(date);
      const isNegative = saldo < 0;

      if (saldo < minSaldo) { minSaldo = saldo; minDate = label; }
      if (saldo > maxSaldo) { maxSaldo = saldo; maxDate = label; }
      if (isNegative) {
        negativeDays++;
        if (!firstNegativeDate) firstNegativeDate = label;
      }

      points.push({ label, date, saldo, entradas: dayIn, saidas: dayOut, isNegative });

      if (saldo < 0 && !inDanger) {
        inDanger = true;
        dangerStart = label;
      } else if (saldo >= 0 && inDanger) {
        inDanger = false;
        zones.push({ start: dangerStart, end: points[i - 1]?.label || label });
      }
    }
    if (inDanger) {
      zones.push({ start: dangerStart, end: points[points.length - 1].label });
    }

    const endSaldo = points[points.length - 1]?.saldo ?? 0;
    const variation = endSaldo - bal;

    return {
      data: points,
      dangerZones: zones,
      metrics: { minSaldo, maxSaldo, minDate, maxDate, negativeDays, firstNegativeDate, endSaldo, variation },
    };
  }, [transactions, projectedBalance, today, horizon, bal]);

  const interval = horizon <= 30 ? 2 : horizon <= 60 ? 4 : 7;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const saldo = payload.find((p: any) => p.dataKey === 'saldo')?.value ?? 0;
    const entradas = payload.find((p: any) => p.dataKey === 'entradas')?.value ?? 0;
    const saidas = payload.find((p: any) => p.dataKey === 'saidas')?.value ?? 0;

    return (
      <div className="bg-card border rounded-lg p-3 shadow-xl text-xs space-y-1.5 min-w-[190px]">
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
          <span className="text-muted-foreground">Var. vs hoje</span>
          <span className={cn('font-mono', saldo - bal >= 0 ? 'text-success' : 'text-destructive')}>
            {saldo - bal >= 0 ? '+' : ''}{formatCurrency(saldo - bal)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      className="card-elevated"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Projeção de Saldo Diário</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Próximos {horizon} dias · Saldo projetado dia a dia
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {([30, 60, 90] as const).map(p => (
            <Button
              key={p}
              size="sm"
              variant={horizon === p ? 'default' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setHorizon(p)}
            >
              {p}d
            </Button>
          ))}
        </div>
      </div>

      {/* Metrics strip */}
      <div className="px-4 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Saldo Final</p>
          <p className={cn('text-sm font-bold font-mono', metrics.endSaldo >= 0 ? 'text-foreground' : 'text-destructive')}>
            {formatCurrency(metrics.endSaldo)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Variação</p>
          <p className={cn('text-sm font-bold font-mono flex items-center justify-center gap-1', metrics.variation >= 0 ? 'text-success' : 'text-destructive')}>
            {metrics.variation >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {metrics.variation >= 0 ? '+' : ''}{formatCurrency(metrics.variation)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Mínimo</p>
          <p className={cn('text-sm font-bold font-mono', metrics.minSaldo >= 0 ? 'text-foreground' : 'text-destructive')}>
            {formatCurrency(metrics.minSaldo)}
          </p>
          <p className="text-[9px] text-muted-foreground">{metrics.minDate}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Dias negativos</p>
          <p className={cn('text-sm font-bold font-mono', metrics.negativeDays > 0 ? 'text-destructive' : 'text-success')}>
            {metrics.negativeDays}
          </p>
          {metrics.firstNegativeDate && (
            <p className="text-[9px] text-muted-foreground">a partir de {metrics.firstNegativeDate}</p>
          )}
        </div>
      </div>

      {/* Warning banner */}
      {metrics.negativeDays > 0 && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">
            Saldo ficará negativo por <strong>{metrics.negativeDays} dia{metrics.negativeDays > 1 ? 's' : ''}</strong> nos próximos {horizon} dias.
            {metrics.firstNegativeDate && <> Primeiro dia: <strong>{metrics.firstNegativeDate}</strong>.</>}
          </p>
        </div>
      )}

      {/* Chart */}
      <div className="p-4" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="dailyGradPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dailyGradNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.15} />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              interval={interval}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeOpacity={0.5} />
            {dangerZones.map((zone, i) => (
              <ReferenceArea
                key={i}
                x1={zone.start}
                x2={zone.end}
                fill="hsl(var(--destructive))"
                fillOpacity={0.06}
                strokeOpacity={0}
              />
            ))}
            <Area
              type="monotone"
              dataKey="saldo"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="url(#dailyGradPos)"
              dot={false}
              activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 rounded bg-primary" /> Saldo projetado
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
    </motion.div>
  );
}

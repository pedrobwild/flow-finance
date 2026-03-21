import { useMemo } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween } from '@/lib/helpers';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { motion } from 'framer-motion';
import { Fuel, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function CashRunwayChart() {
  const { filteredTransactions: transactions, filteredBalance: currentBalance, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const today = todayISO();
  const bal = currentBalance?.amount ?? 0;

  const { days, runwayDays, dangerStart, nextReceivable } = useMemo(() => {
    const HORIZON = 60;
    const points: { date: string; label: string; saldo: number; isToday: boolean }[] = [];

    for (let d = 0; d <= HORIZON; d++) {
      const date = addDays(today, d);
      const saldo = projectedBalance(date);
      points.push({
        date,
        label: getDayMonth(date),
        saldo,
        isToday: d === 0,
      });
    }

    // Find runway (first day saldo <= 0)
    const firstNegative = points.findIndex(p => p.saldo <= 0);
    const runway = firstNegative === -1 ? HORIZON : firstNegative;

    // Find danger zone start (saldo < 20% of current balance)
    const threshold = bal * 0.2;
    const dangerIdx = points.findIndex(p => p.saldo < threshold && p.saldo > 0);
    const dangerDate = dangerIdx > -1 ? points[dangerIdx].date : null;

    // Next receivable
    const nextRec = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;

    return { days: points, runwayDays: runway, dangerStart: dangerDate, nextReceivable: nextRec };
  }, [transactions, currentBalance, projectedBalance, today, bal]);

  const minSaldo = Math.min(...days.map(d => d.saldo));
  const maxSaldo = Math.max(...days.map(d => d.saldo));
  const yMin = Math.min(minSaldo * 1.1, 0);
  const yMax = maxSaldo * 1.15;

  const runwayColor = runwayDays > 30 ? 'text-success' : runwayDays > 14 ? 'text-warning' : 'text-destructive';
  const runwayBg = runwayDays > 30 ? 'bg-success/10' : runwayDays > 14 ? 'bg-warning/10' : 'bg-destructive/10';

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="card-elevated p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', runwayBg)}>
            <Fuel className={cn('w-4.5 h-4.5', runwayColor)} />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Runway de Caixa</h3>
            <p className="text-[10px] text-muted-foreground">Projeção dos próximos 60 dias</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {nextReceivable && (
            <div className="text-right">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Próx. entrada</p>
              <p className="text-xs font-semibold text-success">
                {formatCurrency(nextReceivable.amount)} em {getDayMonth(nextReceivable.dueDate)}
              </p>
            </div>
          )}
          <div className={cn('text-right px-3 py-1.5 rounded-lg', runwayBg)}>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Runway</p>
            <p className={cn('text-lg font-bold leading-tight', runwayColor)}>
              {runwayDays >= 60 ? '60+' : runwayDays}
              <span className="text-xs font-medium ml-0.5">dias</span>
            </p>
          </div>
        </div>
      </div>

      {runwayDays <= 14 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/15 mb-4">
          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-xs text-destructive font-medium">
            Caixa pode zerar em {runwayDays} dias sem novas entradas confirmadas
          </p>
        </div>
      )}

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={days} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="runwayGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.15} />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              interval={9}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              width={40}
            />

            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" strokeOpacity={0.5} />

            {dangerStart && (
              <ReferenceArea
                x1={getDayMonth(dangerStart)}
                x2={days[days.length - 1].label}
                fill="url(#dangerGradient)"
                fillOpacity={1}
              />
            )}

            {nextReceivable && (
              <ReferenceLine
                x={getDayMonth(nextReceivable.dueDate)}
                stroke="hsl(var(--success))"
                strokeDasharray="3 3"
                strokeOpacity={0.6}
              />
            )}

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-popover border rounded-lg p-2.5 shadow-lg">
                    <p className="text-[10px] text-muted-foreground">{d.label}{d.isToday ? ' (hoje)' : ''}</p>
                    <p className={cn('text-sm font-bold', d.saldo >= 0 ? 'text-accent' : 'text-destructive')}>
                      {formatCurrency(d.saldo)}
                    </p>
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="saldo"
              stroke="hsl(var(--accent))"
              strokeWidth={2}
              fill="url(#runwayGradient)"
              dot={false}
              activeDot={{ r: 4, stroke: 'hsl(var(--accent))', fill: 'hsl(var(--background))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-accent rounded" />
          <span className="text-[9px] text-muted-foreground">Saldo projetado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-destructive rounded opacity-50" style={{ borderTop: '1px dashed' }} />
          <span className="text-[9px] text-muted-foreground">Linha zero</span>
        </div>
        {nextReceivable && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-success rounded opacity-60" style={{ borderTop: '1px dashed' }} />
            <span className="text-[9px] text-muted-foreground">Próx. entrada</span>
          </div>
        )}
        {dangerStart && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 bg-destructive/10 rounded" />
            <span className="text-[9px] text-muted-foreground">Zona de risco</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

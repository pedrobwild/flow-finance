import { useMemo, useRef, useState, useEffect } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { GitCompareArrows } from 'lucide-react';

export default function RealVsProjected() {
  const { transactions, currentBalance } = useFinance();
  const today = todayISO();
  const bal = currentBalance?.amount ?? 0;

  const chartData = useMemo(() => {
    // Look back 30 days and forward 14 days
    const BACK = 30;
    const FWD = 14;
    const points: { label: string; date: string; real: number | null; projetado: number; isToday: boolean }[] = [];

    // Build daily actual (confirmed) vs projected balances
    let runningReal = bal;
    let runningProjected = bal;

    // First, compute what the balance was BACK days ago by reversing confirmed transactions
    const confirmedInWindow = transactions
      .filter(t => t.status === 'confirmado' && t.paidAt && t.paidAt > addDays(today, -BACK) && t.paidAt <= today);
    
    // Approximate starting balance by subtracting confirmed transactions going backward
    let startBalance = bal;
    confirmedInWindow.forEach(t => {
      if (t.type === 'receber') startBalance -= t.amount;
      else startBalance += t.amount;
    });

    runningReal = startBalance;
    runningProjected = startBalance;

    for (let d = -BACK; d <= FWD; d++) {
      const date = addDays(today, d);
      const isPast = d <= 0;

      if (isPast) {
        // Real: confirmed transactions on this date
        const dayConfirmed = transactions.filter(t => t.status === 'confirmado' && t.paidAt === date);
        dayConfirmed.forEach(t => {
          if (t.type === 'receber') runningReal += t.amount;
          else runningReal -= t.amount;
        });

        // Projected: all transactions due on this date (what we expected)
        const dayAll = transactions.filter(t => t.dueDate === date);
        dayAll.forEach(t => {
          if (t.type === 'receber') runningProjected += t.amount;
          else runningProjected -= t.amount;
        });

        points.push({
          label: getDayMonth(date),
          date,
          real: runningReal,
          projetado: runningProjected,
          isToday: d === 0,
        });
      } else {
        // Future: only projected
        const dayAll = transactions.filter(t => t.dueDate === date && t.status !== 'confirmado');
        dayAll.forEach(t => {
          if (t.type === 'receber') runningProjected += t.amount;
          else runningProjected -= t.amount;
        });

        points.push({
          label: getDayMonth(date),
          date,
          real: null,
          projetado: runningProjected,
          isToday: false,
        });
      }
    }

    return points;
  }, [transactions, currentBalance, today, bal]);

  // Compute deviation
  const todayPoint = chartData.find(p => p.isToday);
  const deviation = todayPoint && todayPoint.real !== null
    ? todayPoint.real - todayPoint.projetado
    : null;

  return (
    <div
      className="card-elevated p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <GitCompareArrows className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Real vs. Projetado</h3>
            <p className="text-[10px] text-muted-foreground">Últimos 30 dias + projeção 14 dias</p>
          </div>
        </div>

        {deviation !== null && (
          <div className={`text-right px-3 py-1.5 rounded-lg ${deviation >= 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Desvio hoje</p>
            <p className={`text-sm font-bold ${deviation >= 0 ? 'text-success' : 'text-destructive'}`}>
              {deviation >= 0 ? '+' : ''}{formatCurrency(deviation)}
            </p>
          </div>
        )}
      </div>

      <ChartWrapper height={208}>
        {(width) => (
          <AreaChart data={chartData} width={width} height={208} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="realGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.1} />
                <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              interval={6}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              width={40}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className="bg-popover border rounded-lg p-2.5 shadow-lg">
                    <p className="text-[10px] text-muted-foreground mb-1">{d.label}{d.isToday ? ' (hoje)' : ''}</p>
                    {d.real !== null && (
                      <p className="text-xs font-bold text-accent">Real: {formatCurrency(d.real)}</p>
                    )}
                    <p className="text-xs text-muted-foreground">Projetado: {formatCurrency(d.projetado)}</p>
                    {d.real !== null && (
                      <p className={`text-[10px] font-semibold mt-0.5 ${d.real - d.projetado >= 0 ? 'text-success' : 'text-destructive'}`}>
                        Desvio: {d.real - d.projetado >= 0 ? '+' : ''}{formatCurrency(d.real - d.projetado)}
                      </p>
                    )}
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="projetado"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="url(#projGrad)"
              dot={false}
              name="Projetado"
            />
            <Area
              type="monotone"
              dataKey="real"
              stroke="hsl(var(--accent))"
              strokeWidth={2}
              fill="url(#realGrad)"
              dot={false}
              connectNulls={false}
              name="Real"
            />

            <Legend
              verticalAlign="bottom"
              height={24}
              formatter={(value: string) => (
                <span className="text-[10px] text-muted-foreground">{value}</span>
              )}
            />
          </AreaChart>
        )}
      </ChartWrapper>
    </div>
  );
}

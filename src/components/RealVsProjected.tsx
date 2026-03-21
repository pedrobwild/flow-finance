import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { GitCompareArrows } from 'lucide-react';

export default function RealVsProjected() {
  const { transactions, currentBalance } = useFinance();
  const today = todayISO();
  const bal = currentBalance?.amount ?? 0;

  const chartData = useMemo(() => {
    const BACK = 30;
    const FWD = 14;
    const points: { label: string; real: number | null; projetado: number; isToday: boolean }[] = [];

    const confirmedInWindow = transactions
      .filter(t => t.status === 'confirmado' && t.paidAt && t.paidAt > addDays(today, -BACK) && t.paidAt <= today);

    let startBalance = bal;
    confirmedInWindow.forEach(t => {
      if (t.type === 'receber') startBalance -= t.amount;
      else startBalance += t.amount;
    });

    let runningReal = startBalance;
    let runningProjected = startBalance;

    for (let d = -BACK; d <= FWD; d++) {
      const date = addDays(today, d);
      const isPast = d <= 0;

      if (isPast) {
        transactions.filter(t => t.status === 'confirmado' && t.paidAt === date).forEach(t => {
          if (t.type === 'receber') runningReal += t.amount;
          else runningReal -= t.amount;
        });
        transactions.filter(t => t.dueDate === date).forEach(t => {
          if (t.type === 'receber') runningProjected += t.amount;
          else runningProjected -= t.amount;
        });
        points.push({ label: getDayMonth(date), real: runningReal, projetado: runningProjected, isToday: d === 0 });
      } else {
        transactions.filter(t => t.dueDate === date && t.status !== 'confirmado').forEach(t => {
          if (t.type === 'receber') runningProjected += t.amount;
          else runningProjected -= t.amount;
        });
        points.push({ label: getDayMonth(date), real: null, projetado: runningProjected, isToday: false });
      }
    }
    return points;
  }, [transactions, currentBalance, today, bal]);

  const todayPoint = chartData.find(p => p.isToday);
  const deviation = todayPoint && todayPoint.real !== null ? todayPoint.real - todayPoint.projetado : null;

  // Simple table-based visualization instead of recharts to avoid ResponsiveContainer issues
  const sampledPoints = chartData.filter((_, i) => i % 3 === 0 || chartData[i]?.isToday);
  const maxVal = Math.max(...chartData.map(p => Math.max(p.projetado, p.real ?? 0)), 1);
  const minVal = Math.min(...chartData.map(p => Math.min(p.projetado, p.real ?? Infinity)));
  const range = maxVal - minVal || 1;

  return (
    <div className="card-elevated p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <GitCompareArrows className="w-4 h-4 text-primary" />
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

      {/* SVG chart without recharts */}
      <svg width="100%" height="200" viewBox={`0 0 ${chartData.length * 10} 200`} preserveAspectRatio="none" className="overflow-visible">
        {/* Projected line */}
        <polyline
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          opacity="0.6"
          points={chartData.map((p, i) => `${i * 10},${200 - ((p.projetado - minVal) / range) * 180 - 10}`).join(' ')}
        />
        {/* Real line (only past points) */}
        <polyline
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="2"
          points={chartData.filter(p => p.real !== null).map((p, i) => `${i * 10},${200 - (((p.real ?? 0) - minVal) / range) * 180 - 10}`).join(' ')}
        />
        {/* Today marker */}
        {chartData.map((p, i) => p.isToday ? (
          <line key="today" x1={i * 10} y1="0" x2={i * 10} y2="200" stroke="hsl(var(--primary))" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
        ) : null)}
      </svg>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-accent rounded" />
            <span className="text-[10px] text-muted-foreground">Real</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-muted-foreground rounded opacity-60" style={{ borderTop: '1px dashed' }} />
            <span className="text-[10px] text-muted-foreground">Projetado</span>
          </div>
        </div>
        <span className="text-[9px] text-muted-foreground">Hoje ↑</span>
      </div>
    </div>
  );
}

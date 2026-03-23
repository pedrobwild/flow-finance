import { useMemo, useState } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, addDays, getDayMonth, getWeekdayName, todayISO, daysBetween } from '@/lib/helpers';
import type { PeriodRange } from './DashboardPeriodFilter';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Check, ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  period: PeriodRange;
}

interface DayPoint {
  date: string;
  label: string;
  weekday: string;
  saldo: number;
  entradas: number;
  saidas: number;
  txEntradas: { id: string; description: string; counterpart: string; amount: number; status: string; priority: string }[];
  txSaidas: { id: string; description: string; counterpart: string; amount: number; status: string; priority: string }[];
  isToday: boolean;
  isWeekend: boolean;
  isNegative: boolean;
}

export default function CashFlowHeroChart({ period }: Props) {
  const { confirmTransaction } = useFinance();
  const { filteredTransactions: transactions, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const today = todayISO();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const data: DayPoint[] = useMemo(() => {
    const totalDays = daysBetween(period.from, period.to);
    const points: DayPoint[] = [];

    for (let i = 0; i <= totalDays; i++) {
      const date = addDays(period.from, i);
      const projected = projectedBalance(date);

      const dayTxIn = transactions
        .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate === date);
      const dayTxOut = transactions
        .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate === date);

      const entradas = dayTxIn.reduce((s, t) => s + t.amount, 0);
      const saidas = dayTxOut.reduce((s, t) => s + t.amount, 0);

      const dayDate = new Date(date + 'T12:00:00');
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

      points.push({
        date,
        label: date === today ? 'Hoje' : getDayMonth(date),
        weekday: getWeekdayName(date),
        saldo: projected,
        entradas,
        saidas: -saidas, // Negative for visual stacking
        txEntradas: dayTxIn.map(t => ({ id: t.id, description: t.description, counterpart: t.counterpart, amount: t.amount, status: t.status, priority: t.priority })),
        txSaidas: dayTxOut.map(t => ({ id: t.id, description: t.description, counterpart: t.counterpart, amount: t.amount, status: t.status, priority: t.priority })),
        isToday: date === today,
        isWeekend,
        isNegative: projected < 0,
      });
    }
    return points;
  }, [transactions, projectedBalance, period, today]);

  const maxVal = Math.max(...data.map(d => Math.max(d.saldo, d.entradas, 0)));
  const minVal = Math.min(...data.map(d => Math.min(d.saldo, d.saidas, 0)));
  const totalDays = data.length;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = data.find(d => d.label === label);
    if (!point) return null;

    return (
      <div className="bg-card border rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[220px]">
        <div className="flex items-center justify-between">
          <p className="font-bold text-foreground">{point.label} · {point.weekday}</p>
          <span className="text-[10px] text-muted-foreground">{point.date}</span>
        </div>
        <div className="h-px bg-border" />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-success/60" /> Entradas
          </span>
          <span className="font-mono font-bold text-success">+{formatCurrency(point.entradas)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-destructive/60" /> Saídas
          </span>
          <span className="font-mono font-bold text-destructive">−{formatCurrency(Math.abs(point.saidas))}</span>
        </div>
        <div className="h-px bg-border" />
        <div className="flex items-center justify-between">
          <span className="font-semibold">Saldo Projetado</span>
          <span className={cn('font-mono font-bold text-base', point.saldo >= 0 ? 'text-foreground' : 'text-destructive')}>
            {formatCurrency(point.saldo)}
          </span>
        </div>
        {(point.txEntradas.length + point.txSaidas.length) > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Clique na barra para ver detalhes e confirmar
          </p>
        )}
      </div>
    );
  };

  const expandedData = expandedDay ? data.find(d => d.date === expandedDay) : null;

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Projeção de Caixa Dia a Dia</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Saldo projetado + entradas e saídas · Clique em um dia para agir
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-2.5 rounded-sm bg-success/50" /> Entradas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-2.5 rounded-sm bg-destructive/50" /> Saídas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 rounded" style={{ background: 'hsl(197, 70%, 16%)' }} /> Saldo
            </span>
          </div>
        </div>
      </div>

      <div className="p-4" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 10, bottom: 5, left: 10 }}
            onClick={(state: any) => {
              if (state?.activePayload?.[0]?.payload) {
                const point = state.activePayload[0].payload as DayPoint;
                if (point.txEntradas.length + point.txSaidas.length > 0) {
                  setExpandedDay(prev => prev === point.date ? null : point.date);
                }
              }
            }}
          >
            <defs>
              <linearGradient id="heroGradUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(160, 84%, 30%)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(160, 84%, 30%)" stopOpacity={0.15} />
              </linearGradient>
              <linearGradient id="heroGradDown" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(200, 15%, 89%)" strokeOpacity={0.5} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'hsl(200, 10%, 46%)' }}
              axisLine={{ stroke: 'hsl(200, 15%, 89%)' }}
              tickLine={false}
              interval={totalDays > 30 ? 3 : totalDays > 15 ? 1 : 0}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(200, 10%, 46%)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
              domain={[minVal * 1.1, maxVal * 1.1]}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(0, 72%, 51%)" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="4 4" />
            <Bar dataKey="entradas" stackId="flow" radius={[3, 3, 0, 0]} maxBarSize={totalDays > 30 ? 12 : 20}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill="hsl(160, 84%, 30%)"
                  fillOpacity={d.date === expandedDay ? 0.9 : 0.5}
                  cursor={d.txEntradas.length > 0 ? 'pointer' : 'default'}
                />
              ))}
            </Bar>
            <Bar dataKey="saidas" stackId="flow" radius={[0, 0, 3, 3]} maxBarSize={totalDays > 30 ? 12 : 20}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill="hsl(0, 72%, 51%)"
                  fillOpacity={d.date === expandedDay ? 0.9 : 0.5}
                  cursor={d.txSaidas.length > 0 ? 'pointer' : 'default'}
                />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="saldo"
              stroke="hsl(197, 70%, 16%)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, fill: 'hsl(197, 70%, 16%)', stroke: '#fff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Expanded day detail - actionable */}
      <AnimatePresence>
        {expandedData && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-sm">
                    {expandedData.label} · {expandedData.weekday}
                    <span className="text-muted-foreground font-normal ml-2 text-xs">{expandedData.date}</span>
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    Saldo projetado: <span className={cn('font-bold', expandedData.saldo >= 0 ? 'text-foreground' : 'text-destructive')}>{formatCurrency(expandedData.saldo)}</span>
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setExpandedDay(null)}>
                  <ChevronUp className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Saídas */}
                {expandedData.txSaidas.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider flex items-center gap-1">
                      <ArrowDownCircle className="w-3 h-3" /> Saídas · {formatCurrency(Math.abs(expandedData.saidas))}
                    </p>
                    {expandedData.txSaidas.map(tx => (
                      <div key={tx.id} className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 hover:bg-destructive/10 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{tx.description}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-destructive shrink-0">
                          −{formatCurrency(tx.amount)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                          onClick={() => confirmTransaction(tx.id)}
                          title="Confirmar pagamento"
                        >
                          <Check className="w-3.5 h-3.5 text-success" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Entradas */}
                {expandedData.txEntradas.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-success uppercase tracking-wider flex items-center gap-1">
                      <ArrowUpCircle className="w-3 h-3" /> Entradas · {formatCurrency(expandedData.entradas)}
                    </p>
                    {expandedData.txEntradas.map(tx => (
                      <div key={tx.id} className="flex items-center gap-2 p-2 rounded-lg bg-success/5 hover:bg-success/10 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{tx.description}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-success shrink-0">
                          +{formatCurrency(tx.amount)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => confirmTransaction(tx.id)}
                          title="Confirmar recebimento"
                        >
                          <Check className="w-3.5 h-3.5 text-success" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

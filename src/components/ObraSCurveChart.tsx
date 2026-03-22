import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Transaction } from '@/lib/types';
import { formatCurrency, getDayMonth, todayISO, addDays } from '@/lib/helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { TrendingUp, Target, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ReferenceLine, Area, ComposedChart,
} from 'recharts';

interface ObraStage {
  id: string;
  name: string;
  estimatedValue: number;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status: string;
  sortOrder: number;
}

interface Props {
  obraId: string;
  contractValue: number;
  budgetTarget: number;
  transactions: Transaction[];
  expectedStartDate: string | null;
  expectedEndDate: string | null;
}

function rowToStage(row: any): ObraStage {
  return {
    id: row.id,
    name: row.name,
    estimatedValue: Number(row.estimated_value),
    estimatedStartDate: row.estimated_start_date,
    estimatedEndDate: row.estimated_end_date,
    actualStartDate: row.actual_start_date,
    actualEndDate: row.actual_end_date,
    status: row.status,
    sortOrder: row.sort_order,
  };
}

export default function ObraSCurveChart({ obraId, contractValue, budgetTarget, transactions, expectedStartDate, expectedEndDate }: Props) {
  const { data: stages = [] } = useQuery({
    queryKey: ['obra-stages', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('obra_stages')
        .select('*')
        .eq('obra_id', obraId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(rowToStage);
    },
  });

  const today = todayISO();

  const { chartData, metrics, hasPlanned } = useMemo(() => {
    const payables = transactions.filter(t => t.type === 'pagar' && t.obraId === obraId);
    const receivables = transactions.filter(t => t.type === 'receber' && t.obraId === obraId);

    // ── Build planned curve from obra_stages ──
    const plannedPoints = new Map<string, number>();
    const totalEstimated = stages.reduce((s, st) => s + st.estimatedValue, 0) || budgetTarget || contractValue;

    if (stages.length > 0) {
      // Distribute each stage's value across its date range
      stages.forEach(stage => {
        const endDate = stage.estimatedEndDate || stage.estimatedStartDate;
        if (endDate) {
          plannedPoints.set(endDate, (plannedPoints.get(endDate) || 0) + stage.estimatedValue);
        }
      });
    } else if (expectedStartDate && expectedEndDate) {
      // No stages: create a linear planned curve from start to end
      const refValue = budgetTarget || contractValue;
      const totalDays = Math.max(1, Math.round((new Date(expectedEndDate).getTime() - new Date(expectedStartDate).getTime()) / 86400000));
      const step = Math.max(7, Math.round(totalDays / 10));
      for (let d = 0; d <= totalDays; d += step) {
        const date = addDays(expectedStartDate, d);
        const pct = d / totalDays;
        // S-curve shape: use sigmoid
        const sCurveVal = 1 / (1 + Math.exp(-10 * (pct - 0.5)));
        plannedPoints.set(date, refValue * sCurveVal);
      }
      plannedPoints.set(expectedEndDate, refValue);
    }

    // ── Build actual curve from confirmed transactions (costs) ──
    const confirmedCosts = payables
      .filter(t => t.status === 'confirmado' && t.paidAt)
      .sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''));

    const actualPoints = new Map<string, number>();
    confirmedCosts.forEach(tx => {
      const date = tx.paidAt!;
      actualPoints.set(date, (actualPoints.get(date) || 0) + tx.amount);
    });

    // ── Build receivable curve ──
    const confirmedReceivables = receivables
      .filter(t => t.status === 'confirmado' && t.paidAt)
      .sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''));

    const receivedPoints = new Map<string, number>();
    confirmedReceivables.forEach(tx => {
      const date = tx.paidAt!;
      receivedPoints.set(date, (receivedPoints.get(date) || 0) + tx.amount);
    });

    // ── Merge all dates ──
    const allDates = new Set([...plannedPoints.keys(), ...actualPoints.keys(), ...receivedPoints.keys()]);
    const sortedDates = [...allDates].sort();

    let cumPlanned = 0;
    let cumActual = 0;
    let cumReceived = 0;

    const data = sortedDates.map(date => {
      cumPlanned += plannedPoints.get(date) || 0;
      cumActual += actualPoints.get(date) || 0;
      cumReceived += receivedPoints.get(date) || 0;

      return {
        date,
        label: getDayMonth(date),
        planejado: Math.round(cumPlanned),
        realizado: Math.round(cumActual),
        recebido: Math.round(cumReceived),
      };
    });

    // ── Metrics ──
    const totalActual = confirmedCosts.reduce((s, t) => s + t.amount, 0);
    const totalReceived = confirmedReceivables.reduce((s, t) => s + t.amount, 0);
    const pendingCosts = payables.filter(t => t.status !== 'confirmado').reduce((s, t) => s + t.amount, 0);
    const projectedTotal = totalActual + pendingCosts;
    const refVal = budgetTarget || contractValue;
    const deviation = refVal > 0 ? ((projectedTotal - refVal) / refVal) * 100 : 0;
    const executionPct = refVal > 0 ? (totalActual / refVal) * 100 : 0;

    return {
      chartData: data,
      hasPlanned: plannedPoints.size > 0,
      metrics: {
        totalActual,
        totalReceived,
        pendingCosts,
        projectedTotal,
        refVal,
        deviation,
        executionPct,
      },
    };
  }, [transactions, stages, obraId, contractValue, budgetTarget, expectedStartDate, expectedEndDate]);

  if (chartData.length < 2 && !hasPlanned) return null;

  const isOverBudget = metrics.deviation > 5;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-primary" />
            Curva S — Evolução Financeira
          </h3>
          {isOverBudget && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="w-3 h-3 mr-0.5" />
              {metrics.deviation.toFixed(0)}% acima
            </Badge>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniMetric label="Executado" value={formatCurrency(metrics.totalActual)}
            sub={`${metrics.executionPct.toFixed(0)}% do orçamento`} />
          <MiniMetric label="Recebido" value={formatCurrency(metrics.totalReceived)}
            sub={metrics.refVal > 0 ? `${((metrics.totalReceived / metrics.refVal) * 100).toFixed(0)}% do contrato` : ''} />
          <MiniMetric label="Pendente" value={formatCurrency(metrics.pendingCosts)}
            sub="custos a pagar" />
          <MiniMetric label="Projetado" value={formatCurrency(metrics.projectedTotal)}
            sub={`Meta: ${formatCurrency(metrics.refVal)}`}
            alert={isOverBudget} />
        </div>

        {/* Chart */}
        <div className="card-elevated p-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                className="text-muted-foreground"
              />
              <RechartsTooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'planejado' ? 'Planejado' : name === 'realizado' ? 'Realizado (Custos)' : 'Recebido',
                ]}
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                }}
                labelFormatter={(label) => `Data: ${label}`}
              />
              {metrics.refVal > 0 && (
                <ReferenceLine
                  y={metrics.refVal}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{ value: 'Meta', position: 'right', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                />
              )}
              {hasPlanned && (
                <Line
                  type="monotone"
                  dataKey="planejado"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  name="planejado"
                />
              )}
              <Line
                type="monotone"
                dataKey="realizado"
                stroke="hsl(var(--destructive))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'hsl(var(--destructive))' }}
                name="realizado"
              />
              <Line
                type="monotone"
                dataKey="recebido"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                name="recebido"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          {hasPlanned && (
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 border-t-2 border-dashed border-muted-foreground" />
              <span>Planejado</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span>Custos Realizados</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span>Recebimentos</span>
          </div>
        </div>

        {/* Stages table if available */}
        {stages.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
              Etapas Planejadas
            </p>
            <div className="card-elevated overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Etapa</th>
                    <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Fornecedor</th>
                    <th className="text-right px-3 py-2 text-[10px] font-medium text-muted-foreground">Valor Est.</th>
                    <th className="text-center px-3 py-2 text-[10px] font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map(st => (
                    <tr key={st.id} className="border-b border-border/30">
                      <td className="px-3 py-2 font-medium">{st.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{st.supplier || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(st.estimatedValue)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={st.status === 'concluída' ? 'default' : st.status === 'em_andamento' ? 'secondary' : 'outline'} className="text-[9px]">
                          {st.status === 'concluída' ? 'Concluída' : st.status === 'em_andamento' ? 'Andamento' : 'Planejada'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MiniMetric({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 ${alert ? 'bg-destructive/10' : 'bg-muted/50'}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold font-mono ${alert ? 'text-destructive' : ''}`}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

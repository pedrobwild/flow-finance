import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, daysBetween, toISODate } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { Clock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import type { PeriodRange } from '@/components/DashboardPeriodFilter';

interface MonthlyDsoDpo {
  month: string;
  dso: number;
  dpo: number;
}

interface ObraDsoDpo {
  obraId: string;
  code: string;
  clientName: string;
  dso: number;
  dpo: number;
  gap: number;
  pendingReceivable: number;
  pendingPayable: number;
  trend: MonthlyDsoDpo[];
}

interface Props {
  period?: PeriodRange;
}

function MiniSparkline({ data, dataKeyA, dataKeyB }: { data: MonthlyDsoDpo[]; dataKeyA: string; dataKeyB: string }) {
  if (data.length < 2) return null;
  return (
    <div className="w-20 h-8 flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="sparkDso" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="sparkDpo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKeyA} stroke="hsl(var(--accent))" fill="url(#sparkDso)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey={dataKeyB} stroke="hsl(var(--primary))" fill="url(#sparkDpo)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function getMonthRanges(today: string, months: number) {
  const ranges: { year: number; month: number; label: string; start: string; end: string }[] = [];
  const d = new Date(today + 'T12:00:00');
  for (let i = months - 1; i >= 0; i--) {
    const ref = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const year = ref.getFullYear();
    const month = ref.getMonth();
    const start = toISODate(new Date(year, month, 1));
    const end = toISODate(new Date(year, month + 1, 0));
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(ref);
    ranges.push({ year, month, label, start, end });
  }
  return ranges;
}

export default function DsoDpoIndicators({ period }: Props) {
  const { obras } = useObras();
  const { transactions } = useFinance();
  const today = todayISO();

  const monthRanges = useMemo(() => getMonthRanges(today, 6), [today]);

  const obraMetrics = useMemo((): ObraDsoDpo[] => {
    const activeObras = obras.filter(o => o.status === 'ativa');

    return activeObras.map(obra => {
      const obraTx = transactions.filter(t => t.obraId === obra.id);

      // Current DSO/DPO
      const confirmedRec = obraTx.filter(t => t.type === 'receber' && t.status === 'confirmado' && t.paidAt);
      const dsoSum = confirmedRec.reduce((s, t) => s + Math.max(0, daysBetween(t.dueDate, t.paidAt!)), 0);
      const dso = confirmedRec.length > 0 ? Math.round(dsoSum / confirmedRec.length) : 0;

      const confirmedPay = obraTx.filter(t => t.type === 'pagar' && t.status === 'confirmado' && t.paidAt);
      const dpoSum = confirmedPay.reduce((s, t) => s + Math.max(0, daysBetween(t.dueDate, t.paidAt!)), 0);
      const dpo = confirmedPay.length > 0 ? Math.round(dpoSum / confirmedPay.length) : 0;

      const overdueRec = obraTx.filter(t => t.type === 'receber' && t.status === 'atrasado');
      const adjustedDso = overdueRec.length > 0
        ? Math.round((dsoSum + overdueRec.reduce((s, t) => s + daysBetween(t.dueDate, today), 0)) / (confirmedRec.length + overdueRec.length))
        : dso;

      const pendingReceivable = obraTx.filter(t => t.type === 'receber' && t.status !== 'confirmado').reduce((s, t) => s + t.amount, 0);
      const pendingPayable = obraTx.filter(t => t.type === 'pagar' && t.status !== 'confirmado').reduce((s, t) => s + t.amount, 0);

      // 6-month trend
      const trend: MonthlyDsoDpo[] = monthRanges.map(mr => {
        const monthRec = obraTx.filter(t => t.type === 'receber' && t.status === 'confirmado' && t.paidAt && t.paidAt >= mr.start && t.paidAt <= mr.end);
        const monthDsoSum = monthRec.reduce((s, t) => s + Math.max(0, daysBetween(t.dueDate, t.paidAt!)), 0);
        const monthDso = monthRec.length > 0 ? Math.round(monthDsoSum / monthRec.length) : 0;

        const monthPay = obraTx.filter(t => t.type === 'pagar' && t.status === 'confirmado' && t.paidAt && t.paidAt >= mr.start && t.paidAt <= mr.end);
        const monthDpoSum = monthPay.reduce((s, t) => s + Math.max(0, daysBetween(t.dueDate, t.paidAt!)), 0);
        const monthDpo = monthPay.length > 0 ? Math.round(monthDpoSum / monthPay.length) : 0;

        return { month: mr.label, dso: monthDso, dpo: monthDpo };
      });

      return {
        obraId: obra.id,
        code: obra.code,
        clientName: obra.clientName,
        dso: adjustedDso,
        dpo,
        gap: adjustedDso - dpo,
        pendingReceivable,
        pendingPayable,
        trend,
      };
    }).filter(o => o.pendingReceivable > 0 || o.pendingPayable > 0 || o.dso > 0 || o.dpo > 0)
      .sort((a, b) => b.gap - a.gap);
  }, [obras, transactions, today, monthRanges]);

  if (obraMetrics.length === 0) return null;

  const avgDso = Math.round(obraMetrics.reduce((s, o) => s + o.dso, 0) / obraMetrics.length);
  const avgDpo = Math.round(obraMetrics.reduce((s, o) => s + o.dpo, 0) / obraMetrics.length);

  // Global 6-month trend
  const globalTrend: MonthlyDsoDpo[] = monthRanges.map((mr, mi) => {
    const values = obraMetrics.map(o => o.trend[mi]);
    const activeDso = values.filter(v => v.dso > 0);
    const activeDpo = values.filter(v => v.dpo > 0);
    return {
      month: mr.label,
      dso: activeDso.length > 0 ? Math.round(activeDso.reduce((s, v) => s + v.dso, 0) / activeDso.length) : 0,
      dpo: activeDpo.length > 0 ? Math.round(activeDpo.reduce((s, v) => s + v.dpo, 0) / activeDpo.length) : 0,
    };
  });

  return (
    <div className="card-elevated p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="text-xs font-bold tracking-tight">DSO / DPO por Obra</h2>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Média DSO: <strong className="text-foreground">{avgDso}d</strong></span>
          <span>Média DPO: <strong className="text-foreground">{avgDpo}d</strong></span>
          <MiniSparkline data={globalTrend} dataKeyA="dso" dataKeyB="dpo" />
        </div>
      </div>

      <div className="space-y-2">
        {obraMetrics.map((o, i) => (
          <motion.div
            key={o.obraId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground truncate">{o.code}</span>
                <span className="text-[10px] text-muted-foreground truncate">{o.clientName}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <ArrowDownCircle className="w-3 h-3 text-accent" />
                  <span className="text-[10px] text-muted-foreground">DSO</span>
                  <span className={cn('text-[11px] font-bold', o.dso > 30 ? 'text-destructive' : o.dso > 15 ? 'text-warning' : 'text-foreground')}>
                    {o.dso}d
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <ArrowUpCircle className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-muted-foreground">DPO</span>
                  <span className="text-[11px] font-bold text-foreground">{o.dpo}d</span>
                </div>
                <div className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  o.gap > 10 ? 'bg-destructive/10 text-destructive' :
                  o.gap > 0 ? 'bg-warning/10 text-warning' :
                  'bg-accent/10 text-accent'
                )}>
                  Gap: {o.gap > 0 ? '+' : ''}{o.gap}d
                </div>
              </div>
            </div>
            <MiniSparkline data={o.trend} dataKeyA="dso" dataKeyB="dpo" />
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-muted-foreground">Pendente</p>
              <p className="text-[10px] text-accent">{formatCurrency(o.pendingReceivable)}</p>
              <p className="text-[10px] text-destructive">{formatCurrency(o.pendingPayable)}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3">
        <p className="text-[9px] text-muted-foreground">
          DSO = prazo médio de recebimento · DPO = prazo médio de pagamento · Gap positivo = você financia o cliente
        </p>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-accent rounded-full inline-block" /> DSO</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-primary rounded-full inline-block" /> DPO</span>
          <span>6 meses</span>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, daysBetween } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { Clock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeriodRange } from '@/components/DashboardPeriodFilter';

interface ObraDsoDpo {
  obraId: string;
  code: string;
  clientName: string;
  dso: number; // Days Sales Outstanding (avg days to receive)
  dpo: number; // Days Payable Outstanding (avg days to pay)
  gap: number; // DSO - DPO (positive = financing clients)
  pendingReceivable: number;
  pendingPayable: number;
}

interface Props {
  period?: PeriodRange;
}

export default function DsoDpoIndicators({ period }: Props) {
  const { obras } = useObras();
  const { transactions } = useFinance();
  const today = todayISO();

  const obraMetrics = useMemo((): ObraDsoDpo[] => {
    const activeObras = obras.filter(o => o.status === 'ativa');

    return activeObras.map(obra => {
      const obraTx = transactions.filter(t => t.obraId === obra.id);

      // DSO: average days between dueDate and paidAt for confirmed receivables
      const confirmedRec = obraTx.filter(t => t.type === 'receber' && t.status === 'confirmado' && t.paidAt);
      const dsoSum = confirmedRec.reduce((s, t) => {
        const days = Math.max(0, daysBetween(t.dueDate, t.paidAt!));
        return s + days;
      }, 0);
      const dso = confirmedRec.length > 0 ? Math.round(dsoSum / confirmedRec.length) : 0;

      // DPO: average days between dueDate and paidAt for confirmed payables
      const confirmedPay = obraTx.filter(t => t.type === 'pagar' && t.status === 'confirmado' && t.paidAt);
      const dpoSum = confirmedPay.reduce((s, t) => {
        const days = Math.max(0, daysBetween(t.dueDate, t.paidAt!));
        return s + days;
      }, 0);
      const dpo = confirmedPay.length > 0 ? Math.round(dpoSum / confirmedPay.length) : 0;

      // Include overdue receivables in DSO calculation
      const overdueRec = obraTx.filter(t => t.type === 'receber' && t.status === 'atrasado');
      const adjustedDso = overdueRec.length > 0
        ? Math.round((dsoSum + overdueRec.reduce((s, t) => s + daysBetween(t.dueDate, today), 0)) / (confirmedRec.length + overdueRec.length))
        : dso;

      const pendingReceivable = obraTx.filter(t => t.type === 'receber' && t.status !== 'confirmado').reduce((s, t) => s + t.amount, 0);
      const pendingPayable = obraTx.filter(t => t.type === 'pagar' && t.status !== 'confirmado').reduce((s, t) => s + t.amount, 0);

      return {
        obraId: obra.id,
        code: obra.code,
        clientName: obra.clientName,
        dso: adjustedDso,
        dpo,
        gap: adjustedDso - dpo,
        pendingReceivable,
        pendingPayable,
      };
    }).filter(o => o.pendingReceivable > 0 || o.pendingPayable > 0 || o.dso > 0 || o.dpo > 0)
      .sort((a, b) => b.gap - a.gap);
  }, [obras, transactions, today]);

  if (obraMetrics.length === 0) return null;

  const avgDso = Math.round(obraMetrics.reduce((s, o) => s + o.dso, 0) / obraMetrics.length);
  const avgDpo = Math.round(obraMetrics.reduce((s, o) => s + o.dpo, 0) / obraMetrics.length);

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
                  <ArrowDownCircle className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] text-muted-foreground">DSO</span>
                  <span className={cn('text-[11px] font-bold', o.dso > 15 ? 'text-warning' : o.dso > 30 ? 'text-destructive' : 'text-foreground')}>
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
                  'bg-emerald-500/10 text-emerald-600'
                )}>
                  Gap: {o.gap > 0 ? '+' : ''}{o.gap}d
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-muted-foreground">Pendente</p>
              <p className="text-[10px] text-emerald-600">{formatCurrency(o.pendingReceivable)}</p>
              <p className="text-[10px] text-destructive">{formatCurrency(o.pendingPayable)}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <p className="text-[9px] text-muted-foreground mt-3 text-center">
        DSO = prazo médio de recebimento · DPO = prazo médio de pagamento · Gap positivo = você financia o cliente
      </p>
    </div>
  );
}

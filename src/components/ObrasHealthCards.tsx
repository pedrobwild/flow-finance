import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, getDayMonth, daysBetween } from '@/lib/helpers';
import { Transaction } from '@/lib/types';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ObraCard {
  id: string;
  code: string;
  clientName: string;
  condominium: string;
  unitNumber: string;
  contractValue: number;
  totalReceived: number;
  totalPendingReceivable: number;
  totalOverdueReceivable: number;
  receivedPercentage: number;
  totalPaidCost: number;
  costPercentage: number;
  grossMargin: number;
  grossMarginPercentage: number;
  nextPayables: Transaction[];
  nextReceivable: Transaction | null;
  totalReceivableRegistered: number;
  parcelMismatch: boolean;
  parcelDiff: number;
  health: 'green' | 'amber' | 'red';
  sortKey: number;
}

export default function ObrasHealthCards() {
  const { obras, getObraFinancials } = useObras();
  const { transactions } = useFinance();
  const today = todayISO();

  const cards = useMemo((): ObraCard[] => {
    const activeObras = obras.filter(o => o.status === 'ativa');

    return activeObras.map(obra => {
      const fin = getObraFinancials(obra.id);
      const obraTxs = transactions.filter(t => t.obraId === obra.id);

      // Next 3 pending payables
      const nextPayables = obraTxs
        .filter(t => t.type === 'pagar' && t.status !== 'confirmado')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 3);

      // Next pending receivable
      const nextReceivable = obraTxs
        .filter(t => t.type === 'receber' && t.status !== 'confirmado')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;

      // Parcel mismatch
      const totalReceivableRegistered = obraTxs
        .filter(t => t.type === 'receber')
        .reduce((s, t) => s + t.amount, 0);
      const parcelDiff = Math.abs(totalReceivableRegistered - obra.contractValue);
      const parcelMismatch = parcelDiff > 100; // tolerance

      const costPercentage = obra.contractValue > 0 ? (fin.totalPaidCost / obra.contractValue) * 100 : 0;

      // Determine health
      let health: 'green' | 'amber' | 'red' = 'green';

      const hasOverdue = fin.totalOverdueReceivable > 0;
      const lowMargin = fin.grossMarginPercentage < 15;
      const deficit = fin.totalPaidCost > fin.totalReceived && fin.totalPaidCost > 0;

      if (hasOverdue || lowMargin) {
        health = 'red';
      } else {
        const medMargin = fin.grossMarginPercentage < 30;
        // Next receivable comes after next payables?
        const nextPayDate = nextPayables[0]?.dueDate;
        const nextRecDate = nextReceivable?.dueDate;
        const recAfterPay = nextPayDate && nextRecDate && nextRecDate > nextPayDate;
        const pendingIncomeSoon = nextReceivable && daysBetween(today, nextReceivable.dueDate) <= 3;

        if (medMargin || recAfterPay || pendingIncomeSoon || deficit) {
          health = 'amber';
        }
      }

      // Sort: overdue first (0), then by next payable date
      const sortKey = hasOverdue ? 0 : (nextPayables[0] ? daysBetween(today, nextPayables[0].dueDate) + 100 : 9999);

      return {
        id: obra.id,
        code: obra.code,
        clientName: obra.clientName,
        condominium: obra.condominium,
        unitNumber: obra.unitNumber,
        contractValue: obra.contractValue,
        totalReceived: fin.totalReceived,
        totalPendingReceivable: fin.totalPendingReceivable,
        totalOverdueReceivable: fin.totalOverdueReceivable,
        receivedPercentage: fin.receivedPercentage,
        totalPaidCost: fin.totalPaidCost,
        costPercentage,
        grossMargin: fin.grossMargin,
        grossMarginPercentage: fin.grossMarginPercentage,
        nextPayables,
        nextReceivable,
        totalReceivableRegistered,
        parcelMismatch,
        parcelDiff,
        health,
        sortKey,
      };
    }).sort((a, b) => a.sortKey - b.sortKey);
  }, [obras, transactions, today, getObraFinancials]);

  if (cards.length === 0) return null;

  const healthBorder: Record<string, string> = {
    green: 'border-l-success',
    amber: 'border-l-warning',
    red: 'border-l-destructive',
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <span>Saúde Financeira por Obra</span>
        <Badge variant="secondary" className="text-[10px]">{cards.length} ativas</Badge>
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'card-elevated p-4 border-l-4 space-y-3',
              healthBorder[card.health]
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{card.code}</span>
                  <span className="text-sm font-semibold truncate">{card.clientName}</span>
                </div>
                {(card.condominium || card.unitNumber) && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {[card.condominium, card.unitNumber && `Un. ${card.unitNumber}`].filter(Boolean).join(' — ')}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] flex-shrink-0">Ativa</Badge>
            </div>

            {/* Contract + Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Contrato: <strong className="text-foreground">{formatCurrency(card.contractValue)}</strong></span>
                <span className="font-medium">{card.receivedPercentage.toFixed(0)}% recebido</span>
              </div>

              {/* Segmented progress bar */}
              <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
                {card.totalReceived > 0 && (
                  <div
                    className="bg-success h-full transition-all"
                    style={{ width: `${Math.min((card.totalReceived / card.contractValue) * 100, 100)}%` }}
                  />
                )}
                {card.totalPendingReceivable > 0 && (
                  <div
                    className="bg-muted-foreground/20 h-full transition-all"
                    style={{ width: `${Math.min((card.totalPendingReceivable / card.contractValue) * 100, 100)}%` }}
                  />
                )}
                {card.totalOverdueReceivable > 0 && (
                  <div
                    className="bg-destructive h-full transition-all pulse-alert"
                    style={{ width: `${Math.min((card.totalOverdueReceivable / card.contractValue) * 100, 100)}%` }}
                  />
                )}
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>{formatCurrency(card.totalReceived)} recebido</span>
                {card.totalPendingReceivable > 0 && <span>{formatCurrency(card.totalPendingReceivable)} pendente</span>}
                {card.totalOverdueReceivable > 0 && (
                  <span className="text-destructive font-semibold">
                    {formatCurrency(card.totalOverdueReceivable)} ATRASADO ⚠
                  </span>
                )}
              </div>
            </div>

            {/* Costs + Margin */}
            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-muted-foreground">
                Custos: <strong className="text-foreground">{formatCurrency(card.totalPaidCost)}</strong>
                <span className="ml-1">({card.costPercentage.toFixed(0)}%)</span>
              </span>
              <span className="text-muted-foreground">
                Margem: <strong className={cn(
                  card.grossMarginPercentage >= 30 ? 'text-success' :
                  card.grossMarginPercentage >= 15 ? 'text-warning' : 'text-destructive'
                )}>
                  {formatCurrency(card.grossMargin)} ({card.grossMarginPercentage.toFixed(0)}%)
                </strong>
              </span>
            </div>

            {/* Next payables */}
            {card.nextPayables.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-2.5 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Próximas saídas</p>
                {card.nextPayables.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <ArrowDownCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                      <span className="text-muted-foreground flex-shrink-0">{getDayMonth(tx.dueDate)}</span>
                      <span className="truncate">{tx.counterpart || tx.description}</span>
                    </div>
                    <span className="font-mono text-destructive font-medium flex-shrink-0 ml-2">{formatCurrency(tx.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Next receivable */}
            {card.nextReceivable && (
              <div className="flex items-center gap-2 text-[11px]">
                <ArrowUpCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
                <span className="text-muted-foreground">Próximo recebimento:</span>
                <span className="font-semibold">{formatCurrency(card.nextReceivable.amount)}</span>
                <span className="text-muted-foreground">em {getDayMonth(card.nextReceivable.dueDate)}</span>
                {card.nextReceivable.description && (
                  <span className="text-[10px] text-muted-foreground truncate">({card.nextReceivable.description})</span>
                )}
              </div>
            )}

            {/* Parcel mismatch warning */}
            {card.parcelMismatch && (
              <div className="flex items-center gap-2 text-[10px] text-warning">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Parcelas cadastradas: {formatCurrency(card.totalReceivableRegistered)} ≠ Contrato: {formatCurrency(card.contractValue)}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

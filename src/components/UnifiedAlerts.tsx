import { useMemo } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, ChevronRight, Check, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface UnifiedAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  linkTo?: string;
  linkLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  amount?: number;
  badge?: string;
}

interface Props {
  period?: { from: string; to: string; label: string };
}

export default function UnifiedAlerts({ period }: Props) {
  const { filteredTransactions: transactions } = useObraFilter();
  const { obras, getObraFinancials } = useObras();
  const { confirmTransaction, currentBalance } = useFinance();
  const today = todayISO();

  const alerts = useMemo((): UnifiedAlert[] => {
    const result: UnifiedAlert[] = [];
    const activeObras = obras.filter(o => o.status === 'ativa');
    const bal = currentBalance?.amount ?? 0;

    // 1. OVERDUE items (critical) - grouped
    const overdue = transactions.filter(t => t.status === 'atrasado');
    const overduePagar = overdue.filter(t => t.type === 'pagar');
    const overdueReceber = overdue.filter(t => t.type === 'receber');

    if (overdueReceber.length > 0) {
      const total = overdueReceber.reduce((s, t) => s + t.amount, 0);
      const oldest = overdueReceber.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const daysLate = daysBetween(oldest.dueDate, today);
      result.push({
        id: 'overdue-receber',
        severity: 'critical',
        title: `${formatCurrency(total)} a receber em atraso`,
        detail: `${overdueReceber.length} parcela(s), mais antiga há ${daysLate}d`,
        linkTo: '/receber',
        linkLabel: 'Cobrar',
        amount: total,
      });
    }

    if (overduePagar.length > 0) {
      const total = overduePagar.reduce((s, t) => s + t.amount, 0);
      result.push({
        id: 'overdue-pagar',
        severity: 'critical',
        title: `${formatCurrency(total)} a pagar em atraso`,
        detail: `${overduePagar.length} conta(s) vencida(s)`,
        linkTo: '/pagar',
        linkLabel: 'Ver',
        amount: total,
      });
    }

    // 2. DUE TODAY - actionable
    const dueToday = transactions.filter(t => t.status !== 'confirmado' && t.dueDate === today);
    if (dueToday.length > 0) {
      const total = dueToday.reduce((s, t) => t.type === 'pagar' ? s - t.amount : s + t.amount, 0);
      result.push({
        id: 'due-today',
        severity: 'warning',
        title: `${dueToday.length} vencimento(s) hoje`,
        detail: `Líquido: ${formatCurrency(total)}`,
        amount: Math.abs(total),
        actionLabel: 'Confirmar todos',
        onAction: () => dueToday.forEach(t => confirmTransaction(t.id)),
      });
    }

    // 3. UPCOMING 3 DAYS
    const upcoming3 = transactions.filter(t => t.status !== 'confirmado' && t.dueDate > today && t.dueDate <= (period?.to ?? addDays(today, 3)));
    if (upcoming3.length > 0) {
      const totalOut = upcoming3.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
      const totalIn = upcoming3.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
      result.push({
        id: 'upcoming-3d',
        severity: 'info',
        title: `${upcoming3.length} vencimento(s) em 3 dias`,
        detail: `Saídas: ${formatCurrency(totalOut)} · Entradas: ${formatCurrency(totalIn)}`,
        linkTo: '/fluxo',
        linkLabel: 'Ver fluxo',
      });
    }

    // 4. CASH DRAIN per obra (red)
    activeObras.forEach(obra => {
      const obraTxs = transactions.filter(t => t.obraId === obra.id);
      const received = obraTxs.filter(t => t.type === 'receber' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const paid = obraTxs.filter(t => t.type === 'pagar' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const saldo = received - paid;
      if (saldo >= 0) return;

      const next14Exits = transactions.filter(
        t => t.obraId === obra.id && t.type === 'pagar' && t.status !== 'confirmado' &&
          t.dueDate >= today && t.dueDate <= addDays(today, 14)
      ).reduce((s, t) => s + t.amount, 0);

      if (next14Exits > 0) {
        result.push({
          id: `drain-${obra.id}`,
          severity: 'critical',
          title: `${obra.code} drena caixa`,
          detail: `Saldo: ${formatCurrency(saldo)} · +${formatCurrency(next14Exits)} em saídas 14d`,
          linkTo: '/obras',
          linkLabel: 'Ver',
          badge: obra.code,
        });
      }
    });

    // 5. CONTRACT MISMATCH (amber)
    activeObras.forEach(obra => {
      if (obra.contractValue <= 0) return;
      const totalParcelas = transactions.filter(t => t.obraId === obra.id && t.type === 'receber').reduce((s, t) => s + t.amount, 0);
      const diff = obra.contractValue - totalParcelas;
      if (Math.abs(diff) / obra.contractValue > 0.05 && Math.abs(diff) > 100) {
        result.push({
          id: `mismatch-${obra.id}`,
          severity: 'warning',
          title: `${obra.code}: parcelas ≠ contrato`,
          detail: `Diferença de ${formatCurrency(Math.abs(diff))}`,
          linkTo: '/obras',
          linkLabel: 'Ajustar',
          badge: obra.code,
        });
      }
    });

    // Sort: critical first, then warning, then info
    const order = { critical: 0, warning: 1, info: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 6);
  }, [transactions, obras, currentBalance, confirmTransaction, today]);

  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;

  const severityStyles = {
    critical: {
      dot: 'bg-destructive',
      text: 'text-destructive',
      bg: 'bg-destructive/[0.04]',
      border: 'border-destructive/15',
      hover: 'hover:bg-destructive/[0.08]',
    },
    warning: {
      dot: 'bg-warning',
      text: 'text-warning',
      bg: 'bg-warning/[0.04]',
      border: 'border-warning/15',
      hover: 'hover:bg-warning/[0.08]',
    },
    info: {
      dot: 'bg-accent',
      text: 'text-accent',
      bg: 'bg-accent/[0.04]',
      border: 'border-accent/15',
      hover: 'hover:bg-accent/[0.08]',
    },
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-5 h-5 rounded-md flex items-center justify-center',
          criticalCount > 0 ? 'bg-destructive/10' : 'bg-warning/10'
        )}>
          {criticalCount > 0
            ? <AlertTriangle className="w-3 h-3 text-destructive" />
            : <AlertCircle className="w-3 h-3 text-warning" />
          }
        </div>
        <span className="text-xs font-bold">{alerts.length} alerta(s)</span>
        {criticalCount > 0 && (
          <Badge variant="destructive" className="text-[9px] h-4 px-1.5">{criticalCount} crítico(s)</Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <AnimatePresence>
          {alerts.map((alert, i) => {
            const style = severityStyles[alert.severity];

            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all group',
                  style.bg, style.border, style.hover,
                  alert.linkTo && 'cursor-pointer',
                )}
                onClick={() => {
                  if (alert.linkTo) {
                    window.location.href = alert.linkTo;
                  }
                }}
              >
                {/* Severity dot */}
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', style.dot)} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold leading-tight truncate">{alert.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{alert.detail}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {alert.onAction && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={alert.onAction}
                    >
                      <Check className="w-3 h-3" />
                      {alert.actionLabel}
                    </Button>
                  )}
                  {alert.linkTo && (
                    <Link to={alert.linkTo}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn('h-6 px-2 text-[10px] gap-0.5', style.text)}
                      >
                        {alert.linkLabel}
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

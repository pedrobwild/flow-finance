import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, Lightbulb, ChevronRight, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DecisionAlert {
  id: string;
  severity: 'red' | 'amber' | 'green';
  title: string;
  detail: string;
  actionLabel: string;
  actionTo: string;
}

export default function DecisionAlerts() {
  const { obras, getObraFinancials } = useObras();
  const { transactions, currentBalance } = useFinance();
  const today = todayISO();

  const alerts = useMemo((): DecisionAlert[] => {
    const result: DecisionAlert[] = [];
    const activeObras = obras.filter(o => o.status === 'ativa');
    const bal = currentBalance?.amount ?? 0;

    function obraCashBalance(obraId: string) {
      const txs = transactions.filter(t => t.obraId === obraId);
      const received = txs.filter(t => t.type === 'receber' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const paid = txs.filter(t => t.type === 'pagar' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      return received - paid;
    }

    activeObras.forEach(obra => {
      const saldo = obraCashBalance(obra.id);
      if (saldo >= 0) return;
      const next14Exits = transactions.filter(
        t => t.obraId === obra.id && t.type === 'pagar' && t.status !== 'confirmado' &&
          t.dueDate >= today && t.dueDate <= addDays(today, 14)
      ).reduce((s, t) => s + t.amount, 0);

      if (next14Exits > 0) {
        const nextRec = transactions
          .filter(t => t.obraId === obra.id && t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

        result.push({
          id: `drain-${obra.id}`,
          severity: 'red',
          title: `${obra.code} drena ${formatCurrency(Math.abs(saldo))} do caixa`,
          detail: `+${formatCurrency(next14Exits)} em saídas em 14d.${nextRec ? ` Próx recebimento: ${getDayMonth(nextRec.dueDate)}.` : ' Sem recebimento previsto.'}`,
          actionLabel: 'Ver obra',
          actionTo: '/obras',
        });
      }
    });

    activeObras.forEach(obra => {
      const overdue = transactions.filter(
        t => t.obraId === obra.id && t.type === 'receber' && t.status === 'atrasado'
      );
      if (overdue.length > 0) {
        const total = overdue.reduce((s, t) => s + t.amount, 0);
        const oldest = overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
        const daysLate = daysBetween(oldest.dueDate, today);
        result.push({
          id: `overdue-${obra.id}`,
          severity: 'red',
          title: `${formatCurrency(total)} de ${obra.clientName} atrasado há ${daysLate}d`,
          detail: 'Cobrar libera caixa imediatamente.',
          actionLabel: 'Ver recebíveis',
          actionTo: '/receber',
        });
      }
    });

    for (let weekStart = 0; weekStart < 28; weekStart += 7) {
      const ws = addDays(today, weekStart);
      const we = addDays(today, weekStart + 6);
      const obraWeekTotals: { name: string; total: number }[] = [];

      activeObras.forEach(obra => {
        const weekPay = transactions.filter(
          t => t.obraId === obra.id && t.type === 'pagar' && t.status !== 'confirmado' &&
            t.dueDate >= ws && t.dueDate <= we
        ).reduce((s, t) => s + t.amount, 0);
        if (weekPay > 5000) {
          obraWeekTotals.push({ name: obra.clientName, total: weekPay });
        }
      });

      if (obraWeekTotals.length >= 2) {
        const totalWeek = obraWeekTotals.reduce((s, o) => s + o.total, 0);
        if (bal > 0 && totalWeek > bal * 0.4) {
          result.push({
            id: `collision-${weekStart}`,
            severity: 'amber',
            title: `${getDayMonth(ws)}–${getDayMonth(we)}: ${formatCurrency(totalWeek)} em saídas`,
            detail: `${obraWeekTotals.length} obras, ${Math.round((totalWeek / bal) * 100)}% do saldo. Redistribuir?`,
            actionLabel: 'Simular',
            actionTo: '/simulador',
          });
          break;
        }
      }
    }

    activeObras.forEach(obra => {
      const saldo = obraCashBalance(obra.id);
      if (saldo >= 0) return;
      if (result.some(r => r.id === `drain-${obra.id}`)) return;

      const nextRec = transactions
        .filter(t => t.obraId === obra.id && t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

      const daysToNext = nextRec ? daysBetween(today, nextRec.dueDate) : 999;
      if (daysToNext > 15) {
        result.push({
          id: `financed-${obra.id}`,
          severity: 'amber',
          title: `${obra.code}: empresa financia ${formatCurrency(Math.abs(saldo))}`,
          detail: nextRec
            ? `Próx recebimento em ${getDayMonth(nextRec.dueDate)} (${daysToNext}d).`
            : 'Sem recebimento previsto.',
          actionLabel: 'Ver recebíveis',
          actionTo: '/receber',
        });
      }
    });

    activeObras.forEach(obra => {
      if (obra.contractValue <= 0) return;
      const totalParcelas = transactions
        .filter(t => t.obraId === obra.id && t.type === 'receber')
        .reduce((s, t) => s + t.amount, 0);
      const diff = obra.contractValue - totalParcelas;
      const pct = Math.abs(diff) / obra.contractValue;
      if (pct > 0.05 && Math.abs(diff) > 100) {
        result.push({
          id: `mismatch-${obra.id}`,
          severity: 'amber',
          title: `${obra.code}: parcelas ≠ contrato (${formatCurrency(Math.abs(diff))})`,
          detail: `Faltam parcelas ${diff > 0 ? 'não cadastradas' : 'excedentes'}.`,
          actionLabel: 'Ver obra',
          actionTo: '/obras',
        });
      }
    });

    const order = { red: 0, amber: 1, green: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 4);
  }, [obras, transactions, today, currentBalance]);

  if (alerts.length === 0) return null;

  const severityConfig = {
    red: {
      icon: AlertTriangle,
      border: 'border-l-destructive',
      bg: 'bg-destructive/[0.04]',
      borderFull: 'border-destructive/15',
      iconColor: 'text-destructive',
      titleColor: 'text-destructive',
      hoverBg: 'hover:bg-destructive/[0.08]',
    },
    amber: {
      icon: AlertCircle,
      border: 'border-l-warning',
      bg: 'bg-warning/[0.04]',
      borderFull: 'border-warning/15',
      iconColor: 'text-warning',
      titleColor: 'text-warning',
      hoverBg: 'hover:bg-warning/[0.08]',
    },
    green: {
      icon: Lightbulb,
      border: 'border-l-success',
      bg: 'bg-success/[0.04]',
      borderFull: 'border-success/15',
      iconColor: 'text-success',
      titleColor: 'text-success',
      hoverBg: 'hover:bg-success/[0.08]',
    },
  };

  const redCount = alerts.filter(a => a.severity === 'red').length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center',
          redCount > 0 ? 'bg-destructive/10' : 'bg-warning/10'
        )}>
          <Bell className={cn('w-3.5 h-3.5', redCount > 0 ? 'text-destructive' : 'text-warning')} />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Alertas de Decisão</h2>
          <p className="text-[10px] text-muted-foreground">{alerts.length} item(ns) que requerem atenção</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <AnimatePresence>
          {alerts.map((alert, i) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;

            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                <Link
                  to={alert.actionTo}
                  className={cn(
                    'flex items-start gap-3 p-3.5 rounded-lg border border-l-4 transition-all group',
                    config.bg, config.borderFull, config.border, config.hoverBg
                  )}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', config.bg)}>
                    <Icon className={cn('w-4 h-4', config.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs font-semibold leading-snug', config.titleColor)}>{alert.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{alert.detail}</p>
                  </div>
                  <ChevronRight className={cn(
                    'w-4 h-4 flex-shrink-0 mt-1 text-muted-foreground group-hover:translate-x-0.5 transition-transform',
                    config.iconColor
                  )} />
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

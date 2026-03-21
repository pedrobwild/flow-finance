import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, TrendingDown, Calendar, TrendingUp, ChevronRight } from 'lucide-react';
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
  const { transactions, projectedBalance, currentBalance } = useFinance();
  const today = todayISO();

  const alerts = useMemo((): DecisionAlert[] => {
    const result: DecisionAlert[] = [];
    const activeObras = obras.filter(o => o.status === 'ativa');
    const bal = currentBalance?.amount ?? 0;

    // 1. Collision: multiple obras with >10k exits in same week, sum > 50% of projected
    for (let weekStart = 0; weekStart < 28; weekStart += 7) {
      const ws = addDays(today, weekStart);
      const we = addDays(today, weekStart + 6);
      const obraWeekTotals: { obraName: string; total: number }[] = [];

      activeObras.forEach(obra => {
        const weekPay = transactions.filter(
          t => t.obraId === obra.id && t.type === 'pagar' && t.status !== 'confirmado' &&
            t.dueDate >= ws && t.dueDate <= we
        ).reduce((s, t) => s + t.amount, 0);
        if (weekPay > 10000) {
          obraWeekTotals.push({ obraName: obra.clientName, total: weekPay });
        }
      });

      if (obraWeekTotals.length >= 2) {
        const totalWeek = obraWeekTotals.reduce((s, o) => s + o.total, 0);
        const projBal = projectedBalance(ws);
        if (projBal > 0 && totalWeek > projBal * 0.5) {
          result.push({
            id: `collision-${weekStart}`,
            severity: 'red',
            title: `Semana ${getDayMonth(ws)}-${getDayMonth(we)}: ${formatCurrency(totalWeek)} em saídas concentradas (${obraWeekTotals.length} obras)`,
            detail: `Saldo projetado cai para ${formatCurrency(projBal - totalWeek)}. Considere adiar etapas da obra com mais folga de margem.`,
            actionLabel: 'Simular cenários',
            actionTo: '/simulador',
          });
        }
      }
    }

    // 2. Overdue receivables per obra
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
          title: `${obra.code} · ${formatCurrency(total)} de ${obra.clientName} atrasado há ${daysLate} dias`,
          detail: 'Este valor NÃO está na projeção — cobrar libera caixa para a semana.',
          actionLabel: 'Ver recebíveis',
          actionTo: '/receber',
        });
      }
    });

    // 3. Obra consuming more than receiving
    activeObras.forEach(obra => {
      const fin = getObraFinancials(obra.id);
      if (fin.totalPaidCost > fin.totalReceived && fin.totalPaidCost > 0) {
        const deficit = fin.totalPaidCost - fin.totalReceived;
        const nextRec = fin.nextReceivable;
        result.push({
          id: `deficit-${obra.id}`,
          severity: 'amber',
          title: `${obra.code}: custos (${formatCurrency(fin.totalPaidCost)}) excedem recebimentos (${formatCurrency(fin.totalReceived)})`,
          detail: `A empresa está financiando ${formatCurrency(deficit)} desta obra.${nextRec ? ` Próximo recebimento: ${getDayMonth(nextRec.dueDate)}.` : ''}`,
          actionLabel: 'Ver obra',
          actionTo: '/obras',
        });
      }
    });

    // 4. Gap without income before heavy expenses
    const pendingReceivables = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    // Find gaps of 7+ days without receivables
    let gapStart = today;
    const checkEnd = addDays(today, 30);

    for (const rec of pendingReceivables) {
      if (rec.dueDate > checkEnd) break;
      const gap = daysBetween(gapStart, rec.dueDate);
      if (gap >= 7) {
        // Check exits in this gap
        const gapExits = transactions.filter(
          t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= gapStart && t.dueDate < rec.dueDate
        ).reduce((s, t) => s + t.amount, 0);

        if (gapExits > 20000) {
          result.push({
            id: `gap-${gapStart}`,
            severity: 'amber',
            title: `Nenhum recebimento entre ${getDayMonth(gapStart)} e ${getDayMonth(rec.dueDate)} (${gap} dias)`,
            detail: `${formatCurrency(gapExits)} em saídas nesse período. Antecipe cobranças ou renegocie prazos.`,
            actionLabel: 'Ver recebíveis',
            actionTo: '/receber',
          });
          break; // Only show one gap alert
        }
      }
      gapStart = rec.dueDate;
    }

    // 5. Opportunity: healthy cash
    const next15Balance = projectedBalance(addDays(today, 15));
    if (next15Balance > 30000 && result.filter(r => r.severity === 'red').length === 0) {
      result.push({
        id: 'opportunity',
        severity: 'green',
        title: 'Caixa confortável nos próximos 15 dias',
        detail: 'Oportunidade de adiantar pagamentos com desconto ou quitar fornecedores pendentes.',
        actionLabel: 'Ver a pagar',
        actionTo: '/pagar',
      });
    }

    // Sort: red first, then amber, then green. Max 4
    const order = { red: 0, amber: 1, green: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 4);
  }, [obras, transactions, today, projectedBalance, currentBalance, getObraFinancials]);

  if (alerts.length === 0) return null;

  const severityConfig = {
    red: {
      icon: AlertTriangle,
      bg: 'bg-destructive/5',
      border: 'border-destructive/20',
      iconColor: 'text-destructive',
      titleColor: 'text-destructive',
    },
    amber: {
      icon: AlertCircle,
      bg: 'bg-warning/5',
      border: 'border-warning/20',
      iconColor: 'text-warning',
      titleColor: 'text-warning',
    },
    green: {
      icon: TrendingUp,
      bg: 'bg-success/5',
      border: 'border-success/20',
      iconColor: 'text-success',
      titleColor: 'text-success',
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-2"
    >
      <h2 className="text-sm font-semibold">Alertas de Decisão</h2>

      <div className="space-y-2">
        <AnimatePresence>
          {alerts.map((alert, i) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;

            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border',
                  config.bg, config.border
                )}
              >
                <Icon className={cn('w-5 h-5 flex-shrink-0', config.iconColor)} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs font-semibold', config.titleColor)}>{alert.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{alert.detail}</p>
                </div>
                <Link
                  to={alert.actionTo}
                  className={cn(
                    'flex items-center gap-1 text-[11px] font-medium flex-shrink-0 hover:underline',
                    config.iconColor
                  )}
                >
                  {alert.actionLabel}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, Lightbulb, ChevronRight } from 'lucide-react';
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

    // Helper: obra cash balance
    function obraCashBalance(obraId: string) {
      const txs = transactions.filter(t => t.obraId === obraId);
      const received = txs.filter(t => t.type === 'receber' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const paid = txs.filter(t => t.type === 'pagar' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      return received - paid;
    }

    // 1. Obra drenando caixa (vermelho)
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
          title: `${obra.code} (${obra.clientName}) drena ${formatCurrency(Math.abs(saldo))} do caixa`,
          detail: `Mais ${formatCurrency(next14Exits)} em saídas nos próximos 14 dias.${nextRec ? ` Próximo recebimento: ${getDayMonth(nextRec.dueDate)}.` : ' Sem recebimento previsto.'} Desacelere execução ou antecipe cobrança.`,
          actionLabel: 'Ver obra',
          actionTo: '/obras',
        });
      }
    });

    // 2. Parcela de cliente atrasada (vermelho)
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
          detail: 'Valor fora da projeção — cobrar libera caixa.',
          actionLabel: 'Ver recebíveis',
          actionTo: '/receber',
        });
      }
    });

    // 3. Múltiplas obras com saídas pesadas na mesma semana (âmbar)
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
            title: `Semana ${getDayMonth(ws)}–${getDayMonth(we)}: ${formatCurrency(totalWeek)} em saídas de ${obraWeekTotals.length} obras`,
            detail: `Representa ${Math.round((totalWeek / bal) * 100)}% do saldo atual. Avalie redistribuir etapas.`,
            actionLabel: 'Simular',
            actionTo: '/simulador',
          });
          break; // only one collision alert
        }
      }
    }

    // 4. Obra financiada sem recebimento próximo (âmbar)
    activeObras.forEach(obra => {
      const saldo = obraCashBalance(obra.id);
      if (saldo >= 0) return;
      // Skip if already has drain alert
      if (result.some(r => r.id === `drain-${obra.id}`)) return;

      const nextRec = transactions
        .filter(t => t.obraId === obra.id && t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

      const daysToNext = nextRec ? daysBetween(today, nextRec.dueDate) : 999;
      if (daysToNext > 15) {
        result.push({
          id: `financed-${obra.id}`,
          severity: 'amber',
          title: `${obra.code}: empresa financia ${formatCurrency(Math.abs(saldo))} desta obra`,
          detail: nextRec
            ? `Próximo recebimento só em ${getDayMonth(nextRec.dueDate)} (${daysToNext} dias). Renegociar prazo ou desacelerar.`
            : 'Sem recebimento previsto. Cadastre parcelas ou renegocie.',
          actionLabel: 'Ver recebíveis',
          actionTo: '/receber',
        });
      }
    });

    // 5. Parcelas cadastradas ≠ contrato (âmbar baixa)
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
          title: `${obra.code}: parcelas ${formatCurrency(totalParcelas)} ≠ contrato ${formatCurrency(obra.contractValue)}`,
          detail: `Faltam ${formatCurrency(Math.abs(diff))} em parcelas ${diff > 0 ? 'não cadastradas' : 'excedentes'}.`,
          actionLabel: 'Ver obra',
          actionTo: '/obras',
        });
      }
    });

    // Sort: red first, then amber. Max 4
    const order = { red: 0, amber: 1, green: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 4);
  }, [obras, transactions, today, currentBalance]);

  if (alerts.length === 0) return null;

  const severityConfig = {
    red: {
      icon: AlertTriangle,
      border: 'border-l-destructive',
      bg: 'bg-destructive/5',
      borderFull: 'border-destructive/20',
      iconColor: 'text-destructive',
      titleColor: 'text-destructive',
    },
    amber: {
      icon: AlertCircle,
      border: 'border-l-warning',
      bg: 'bg-warning/5',
      borderFull: 'border-warning/20',
      iconColor: 'text-warning',
      titleColor: 'text-warning',
    },
    green: {
      icon: Lightbulb,
      border: 'border-l-success',
      bg: 'bg-success/5',
      borderFull: 'border-success/20',
      iconColor: 'text-success',
      titleColor: 'text-success',
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.6, delay: 0.30, ease: [0.16, 1, 0.3, 1] }}
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
                  'flex items-center gap-3 p-3 rounded-lg border border-l-4',
                  config.bg, config.borderFull, config.border
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

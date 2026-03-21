import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lightbulb, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Suggestion {
  id: string;
  severity: 'red' | 'amber' | 'green';
  text: string;
  actionLabel?: string;
  actionTo?: string;
}

const section = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' } as const,
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' } as const,
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function DecisionSuggestions() {
  const { obras } = useObras();
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const today = todayISO();

  const suggestions = useMemo((): Suggestion[] => {
    const result: Suggestion[] = [];
    const activeObras = obras.filter(o => o.status === 'ativa');
    const bal = currentBalance?.amount ?? 0;

    // 1. Redistribuir etapas (vermelho)
    if (bal > 0) {
      for (let weekStart = 0; weekStart < 28; weekStart += 7) {
        const ws = addDays(today, weekStart);
        const we = addDays(today, weekStart + 6);
        const obraWeekTotals: { client: string; total: number }[] = [];

        activeObras.forEach(obra => {
          const weekPay = transactions.filter(
            t => t.obraId === obra.id && t.type === 'pagar' && t.status !== 'confirmado' &&
              t.dueDate >= ws && t.dueDate <= we
          ).reduce((s, t) => s + t.amount, 0);
          if (weekPay > 10000) {
            obraWeekTotals.push({ client: obra.clientName, total: weekPay });
          }
        });

        if (obraWeekTotals.length >= 2) {
          const totalWeek = obraWeekTotals.reduce((s, o) => s + o.total, 0);
          const projWeek = projectedBalance(we);
          if (projWeek < bal * 0.3) {
            result.push({
              id: `redistribute-${weekStart}`,
              severity: 'red',
              text: `Postergar etapas de uma das obras da semana de ${getDayMonth(ws)} reduz a pressão de ${formatCurrency(totalWeek)} e recompõe margem de segurança.`,
              actionLabel: 'Simular',
              actionTo: '/simulador',
            });
            break;
          }
        }
      }
    }

    // 2. Cobrar cliente (vermelho)
    const overdueRec = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado');
    if (overdueRec.length > 0) {
      const oldest = overdueRec.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const obra = activeObras.find(o => o.id === oldest.obraId);
      const daysLate = daysBetween(oldest.dueDate, today);
      result.push({
        id: 'collect',
        severity: 'red',
        text: `A parcela de ${formatCurrency(oldest.amount)}${obra ? ` da obra de ${obra.clientName}` : ''} deveria ter entrado há ${daysLate} dias. Cobrar antecipa caixa e melhora a projeção.`,
        actionLabel: 'Ver cobrança',
        actionTo: '/receber',
      });
    }

    // 3. Desacelerar obra que drena (âmbar)
    for (const obra of activeObras) {
      const txs = transactions.filter(t => t.obraId === obra.id);
      const received = txs.filter(t => t.type === 'receber' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const paid = txs.filter(t => t.type === 'pagar' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const saldo = received - paid;
      if (saldo >= 0) continue;

      const nextRec = txs
        .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const daysToNext = nextRec ? daysBetween(today, nextRec.dueDate) : 999;

      if (daysToNext > 15) {
        result.push({
          id: `decelerate-${obra.id}`,
          severity: 'amber',
          text: `A obra de ${obra.clientName} consome ${formatCurrency(Math.abs(saldo))} além do que recebeu, e o próximo recebimento é só em ${nextRec ? getDayMonth(nextRec.dueDate) : '—'}. Reduzir ritmo de execução preserva caixa.`,
          actionLabel: 'Ver obra',
          actionTo: '/obras',
        });
        break;
      }
    }

    // 4. Não aprovar novos compromissos (âmbar)
    let minProj = Infinity;
    for (let d = 1; d <= 15; d++) {
      const p = projectedBalance(addDays(today, d));
      if (p < minProj) minProj = p;
    }
    if (minProj < 15000 && minProj !== Infinity) {
      result.push({
        id: 'no-new',
        severity: 'amber',
        text: `Evitar aprovar novos pagamentos nesta quinzena sem contrapartida de entrada. Margem de segurança projetada: apenas ${formatCurrency(minProj)}.`,
      });
    }

    // 5. Renegociar prazo (âmbar)
    if (bal > 0) {
      const next7 = addDays(today, 7);
      const bigExits = transactions.filter(
        t => t.type === 'pagar' && t.status !== 'confirmado' &&
          t.dueDate >= today && t.dueDate <= next7 &&
          t.amount > bal * 0.25 &&
          (t.priority === 'normal' || t.priority === 'baixa')
      );
      if (bigExits.length > 0) {
        const tx = bigExits[0];
        result.push({
          id: `renegotiate-${tx.id}`,
          severity: 'amber',
          text: `O pagamento de ${formatCurrency(tx.amount)} para ${tx.counterpart || 'fornecedor'} em ${getDayMonth(tx.dueDate)} representa ${Math.round((tx.amount / bal) * 100)}% do saldo. Negociar prazo recompõe folga.`,
          actionLabel: 'Ver pagamento',
          actionTo: '/pagar',
        });
      }
    }

    if (result.length === 0) {
      return [{
        id: 'all-good',
        severity: 'green' as const,
        text: 'Compromissos podem seguir conforme planejado. Caixa com margem confortável para as próximas semanas.',
      }];
    }

    return result.slice(0, 3);
  }, [obras, transactions, today, currentBalance, projectedBalance]);

  // Don't render the "all good" green if no real suggestions
  const hasOnlyGreen = suggestions.length === 1 && suggestions[0].severity === 'green';

  const borderColorMap = {
    red: 'border-l-destructive/60',
    amber: 'border-l-warning/60',
    green: 'border-l-success/60',
  };

  const iconColorMap = {
    red: 'text-destructive',
    amber: 'text-warning',
    green: 'text-success',
  };

  return (
    <motion.div {...section(0.36)}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Decisões Sugeridas</h2>
        </div>

        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.36 + i * 0.06 }}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-l-[3px] bg-card p-3.5',
                borderColorMap[s.severity]
              )}
            >
              {s.severity === 'green' ? (
                <CheckCircle2 className={cn('w-4 h-4 flex-shrink-0', iconColorMap[s.severity])} />
              ) : (
                <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', s.severity === 'red' ? 'bg-destructive' : 'bg-warning')} />
              )}
              <p className="flex-1 text-sm text-foreground leading-relaxed">{s.text}</p>
              {s.actionTo && s.actionLabel && (
                <Link
                  to={s.actionTo}
                  className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  {s.actionLabel}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

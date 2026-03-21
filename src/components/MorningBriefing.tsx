import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BriefingLine {
  id: string;
  text: string;
  severity: 'red' | 'amber' | 'green';
}

const section = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' } as const,
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' } as const,
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function MorningBriefing() {
  const { obras } = useObras();
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const today = todayISO();

  const lines = useMemo((): BriefingLine[] => {
    const result: BriefingLine[] = [];
    const activeObras = obras.filter(o => o.status === 'ativa');
    const bal = currentBalance?.amount ?? 0;

    // Frase 1 — Estado do caixa no curto prazo
    let addedCashLine = false;
    for (let d = 1; d <= 30; d++) {
      const date = addDays(today, d);
      const proj = projectedBalance(date);
      if (proj < 0) {
        result.push({
          id: 'cash-critical',
          severity: 'red',
          text: `Seu caixa projetado entra em zona crítica em ${getDayMonth(date)}. Avalie redistribuir etapas entre obras antes que apertem.`,
        });
        addedCashLine = true;
        break;
      }
      if (!addedCashLine && proj < 10000) {
        result.push({
          id: 'cash-pressure',
          severity: 'amber',
          text: `O caixa fica pressionado na semana de ${getDayMonth(date)}, com margem de apenas ${formatCurrency(proj)}. Evite aprovar novos compromissos sem contrapartida de entrada.`,
        });
        addedCashLine = true;
        break;
      }
    }
    if (!addedCashLine) {
      result.push({
        id: 'cash-ok',
        severity: 'green',
        text: 'O caixa se mantém em margem segura nos próximos 30 dias. Janela confortável para manter o ritmo.',
      });
    }

    // Frase 2 — Concentração de saídas
    if (bal > 0) {
      for (let weekStart = 0; weekStart < 28; weekStart += 7) {
        const ws = addDays(today, weekStart);
        const we = addDays(today, weekStart + 6);
        const weekExits = transactions.filter(
          t => t.type === 'pagar' && t.status !== 'confirmado' &&
            t.dueDate >= ws && t.dueDate <= we
        );
        const totalWeek = weekExits.reduce((s, t) => s + t.amount, 0);
        if (totalWeek > bal * 0.4) {
          result.push({
            id: 'concentration',
            severity: 'amber',
            text: `${weekExits.length} compromissos concentram ${formatCurrency(totalWeek)} na semana de ${getDayMonth(ws)} — ${Math.round((totalWeek / bal) * 100)}% do saldo atual. Considere espaçar.`,
          });
          break;
        }
      }
    }

    // Frase 3 — Obras que drenam caixa
    for (const obra of activeObras) {
      const txs = transactions.filter(t => t.obraId === obra.id);
      const received = txs.filter(t => t.type === 'receber' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const paid = txs.filter(t => t.type === 'pagar' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const saldo = received - paid;
      if (saldo >= 0) continue;

      const next14Exits = txs.filter(
        t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 14)
      ).reduce((s, t) => s + t.amount, 0);
      if (next14Exits <= 0) continue;

      const nextRec = txs
        .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

      result.push({
        id: `drain-${obra.id}`,
        severity: 'red',
        text: `A obra de ${obra.clientName} está consumindo mais do que recebeu — a empresa financia ${formatCurrency(Math.abs(saldo))}. ${nextRec ? `Próximo recebimento só em ${getDayMonth(nextRec.dueDate)}.` : 'Sem recebimento previsto.'}`,
      });
      break; // only first draining obra in briefing
    }

    // Frase 4 — Cobrança pendente
    const overdueReceivables = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado');
    if (overdueReceivables.length > 0) {
      const oldest = overdueReceivables.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const obra = activeObras.find(o => o.id === oldest.obraId);
      const daysLate = daysBetween(oldest.dueDate, today);
      const totalOverdue = overdueReceivables.reduce((s, t) => s + t.amount, 0);
      result.push({
        id: 'overdue',
        severity: 'red',
        text: `${formatCurrency(totalOverdue)}${obra ? ` da obra de ${obra.clientName}` : ''} está atrasado há ${daysLate} dias. Esse valor não entra na projeção — cobrar libera caixa para a semana.`,
      });
    }

    // If only green lines, check if we should show "tudo tranquilo"
    const hasRisk = result.some(l => l.severity !== 'green');
    if (!hasRisk && result.length <= 1) {
      // Replace with single calm message
      return [{
        id: 'all-clear',
        severity: 'green' as const,
        text: 'Sem pressões relevantes no curto prazo. Compromissos podem seguir conforme planejado.',
      }];
    }

    return result.slice(0, 4);
  }, [obras, transactions, today, currentBalance, projectedBalance]);

  const iconMap = {
    red: ShieldAlert,
    amber: AlertTriangle,
    green: CheckCircle2,
  };

  const iconColorMap = {
    red: 'text-destructive',
    amber: 'text-warning',
    green: 'text-success',
  };

  return (
    <motion.div {...section(0.24)}>
      <div className="rounded-xl bg-accent/[0.03] border border-border/50 px-5 py-4 space-y-3">
        {lines.map((line, i) => {
          const Icon = iconMap[line.severity];
          return (
            <motion.div
              key={line.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.24 + i * 0.06 }}
              className="flex items-start gap-3"
            >
              <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', iconColorMap[line.severity])} />
              <p className="text-sm text-foreground leading-relaxed">{line.text}</p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

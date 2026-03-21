import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Calendar, Zap, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConcentrationRisk {
  date: string;
  total: number;
  count: number;
  items: { description: string; amount: number }[];
}

export default function ForecastInsights() {
  const { filteredTransactions: transactions, filteredBalance: currentBalance, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const today = todayISO();

  const insights = useMemo(() => {
    const result: { type: 'danger' | 'warning' | 'info' | 'positive'; icon: typeof TrendingUp; title: string; detail: string }[] = [];

    const bal = currentBalance?.amount ?? 0;
    const dayMap = new Map<string, { total: number; count: number; items: { description: string; amount: number }[] }>();
    
    transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 30))
      .forEach(t => {
        const existing = dayMap.get(t.dueDate) || { total: 0, count: 0, items: [] };
        existing.total += t.amount;
        existing.count += 1;
        existing.items.push({ description: t.description, amount: t.amount });
        dayMap.set(t.dueDate, existing);
      });

    const concentrationDays = [...dayMap.entries()]
      .filter(([_, d]) => bal > 0 && d.total > bal * 0.3)
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (concentrationDays.length > 0) {
      const [date, data] = concentrationDays[0];
      result.push({
        type: 'danger',
        icon: Zap,
        title: `Concentração de saída em ${getDayMonth(date)}`,
        detail: `${formatCurrency(data.total)} em ${data.count} pagamentos (${Math.round(data.total / bal * 100)}% do saldo). ${data.items[0].description}${data.count > 1 ? ` +${data.count - 1}` : ''}.`,
      });
    }

    let gapStart: string | null = null;
    let gapLength = 0;
    for (let i = 1; i <= 30; i++) {
      const date = addDays(today, i);
      const hasIncome = transactions.some(
        t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate === date
      );
      if (!hasIncome) {
        if (!gapStart) gapStart = date;
        gapLength++;
      } else {
        if (gapLength >= 7 && gapStart) {
          result.push({
            type: 'warning',
            icon: Calendar,
            title: `${gapLength} dias sem recebimentos`,
            detail: `De ${getDayMonth(gapStart)} a ${getDayMonth(addDays(gapStart, gapLength - 1))}. Considere antecipar cobranças ou renegociar prazos.`,
          });
        }
        gapStart = null;
        gapLength = 0;
      }
    }
    if (gapLength >= 7 && gapStart) {
      result.push({
        type: 'warning',
        icon: Calendar,
        title: `${gapLength} dias sem recebimentos`,
        detail: `A partir de ${getDayMonth(gapStart)}. Considere antecipar cobranças.`,
      });
    }

    const thisWeekOut = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 7))
      .reduce((s, t) => s + t.amount, 0);
    const nextWeekOut = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate > addDays(today, 7) && t.dueDate <= addDays(today, 14))
      .reduce((s, t) => s + t.amount, 0);

    if (nextWeekOut > thisWeekOut * 1.5 && nextWeekOut > 5000) {
      result.push({
        type: 'warning',
        icon: TrendingUp,
        title: 'Saídas da próxima semana crescem',
        detail: `Semana atual: ${formatCurrency(thisWeekOut)} → Próxima: ${formatCurrency(nextWeekOut)} (+${Math.round((nextWeekOut / Math.max(thisWeekOut, 1) - 1) * 100)}%).`,
      });
    }

    const in7 = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 7))
      .reduce((s, t) => s + t.amount, 0);
    if (in7 > thisWeekOut && in7 > 0) {
      result.push({
        type: 'positive',
        icon: TrendingDown,
        title: 'Semana com saldo positivo',
        detail: `Entradas (${formatCurrency(in7)}) superam saídas (${formatCurrency(thisWeekOut)}) nos próximos 7 dias. Boa janela para antecipar pagamentos.`,
      });
    }

    const overdueRec = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado');
    if (overdueRec.length > 0) {
      const totalOverdue = overdueRec.reduce((s, t) => s + t.amount, 0);
      result.push({
        type: 'danger',
        icon: TrendingDown,
        title: `${formatCurrency(totalOverdue)} em cobranças atrasadas`,
        detail: `${overdueRec.length} recebimento(s) não confirmado(s). Esse valor NÃO está na projeção — cobrá-los melhora o forecast.`,
      });
    }

    return result.slice(0, 4);
  }, [transactions, currentBalance, today, projectedBalance]);

  if (insights.length === 0) return null;

  const typeStyles = {
    danger: 'border-l-destructive bg-destructive/[0.04]',
    warning: 'border-l-warning bg-warning/[0.04]',
    info: 'border-l-accent bg-accent/[0.04]',
    positive: 'border-l-success bg-success/[0.04]',
  };

  const iconBg = {
    danger: 'bg-destructive/10',
    warning: 'bg-warning/10',
    info: 'bg-accent/10',
    positive: 'bg-success/10',
  };

  const iconStyles = {
    danger: 'text-destructive',
    warning: 'text-warning',
    info: 'text-accent',
    positive: 'text-success',
  };

  return (
    <div className="card-elevated h-full flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-warning" />
        <div>
          <h2 className="font-semibold text-sm">Alertas de Forecast</h2>
          <p className="text-[10px] text-muted-foreground">Riscos e oportunidades automáticos</p>
        </div>
      </div>
      <div className="p-3 space-y-2 flex-1">
        {insights.map((insight, i) => {
          const Icon = insight.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className={cn('rounded-lg border-l-[3px] p-3 transition-colors hover:brightness-[0.98]', typeStyles[insight.type])}
            >
              <div className="flex items-start gap-2.5">
                <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5', iconBg[insight.type])}>
                  <Icon className={cn('w-3.5 h-3.5', iconStyles[insight.type])} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight">{insight.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{insight.detail}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

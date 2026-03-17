import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Calendar, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConcentrationRisk {
  date: string;
  total: number;
  count: number;
  items: { description: string; amount: number }[];
}

export default function ForecastInsights() {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const today = todayISO();

  const insights = useMemo(() => {
    const result: { type: 'danger' | 'warning' | 'info' | 'positive'; icon: typeof TrendingUp; title: string; detail: string }[] = [];

    // 1. Concentration risk: days with >30% of balance in outflows
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

    // 2. Receivable gap: periods with no income
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

    // 3. Weekly trend
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

    // 4. Positive: incoming surplus
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

    // 5. Overdue receivables
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
    danger: 'border-l-destructive bg-destructive/5',
    warning: 'border-l-warning bg-warning/5',
    info: 'border-l-accent bg-accent/5',
    positive: 'border-l-success bg-success/5',
  };

  const iconStyles = {
    danger: 'text-destructive',
    warning: 'text-warning',
    info: 'text-accent',
    positive: 'text-success',
  };

  return (
    <div className="card-elevated">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm">Alertas de Forecast</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">Riscos e oportunidades detectados automaticamente</p>
      </div>
      <div className="p-3 space-y-2">
        {insights.map((insight, i) => {
          const Icon = insight.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn('rounded-lg border-l-4 p-3', typeStyles[insight.type])}
            >
              <div className="flex items-start gap-2.5">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', iconStyles[insight.type])} />
                <div>
                  <p className="text-xs font-semibold">{insight.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{insight.detail}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

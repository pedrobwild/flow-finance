import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, daysBetween } from '@/lib/helpers';
import { motion } from 'framer-motion';
import {
  ArrowDownCircle, ArrowUpCircle, TrendingUp, Wallet,
  AlertTriangle, Edit3, Check, X, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import type { PeriodRange } from './DashboardPeriodFilter';

interface Props {
  period: PeriodRange;
}

export default function DashboardKPIs({ period }: Props) {
  const { transactions, currentBalance, projectedBalance, updateCashBalance } = useFinance();
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const today = todayISO();

  const stats = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    const balDate = currentBalance?.balanceDate;
    const balAge = balDate ? daysBetween(balDate, today) : null;

    const filtered = transactions.filter(
      t => t.status !== 'confirmado' && t.dueDate >= period.from && t.dueDate <= period.to
    );

    const totalPagar = filtered.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
    const totalReceber = filtered.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
    const saldoLiquido = totalReceber - totalPagar;

    const overduePayable = transactions.filter(t => t.status === 'atrasado' && t.type === 'pagar');
    const overdueReceivable = transactions.filter(t => t.status === 'atrasado' && t.type === 'receber');
    const overduePayableTotal = overduePayable.reduce((s, t) => s + t.amount, 0);
    const overdueReceivableTotal = overdueReceivable.reduce((s, t) => s + t.amount, 0);

    const projectedEnd = projectedBalance(period.to);

    const countPagar = filtered.filter(t => t.type === 'pagar').length;
    const countReceber = filtered.filter(t => t.type === 'receber').length;

    return {
      bal, balAge, balDate,
      totalPagar, totalReceber, saldoLiquido,
      overduePayable: overduePayable.length,
      overdueReceivable: overdueReceivable.length,
      overduePayableTotal, overdueReceivableTotal,
      projectedEnd,
      countPagar, countReceber,
    };
  }, [transactions, currentBalance, projectedBalance, period, today]);

  const handleSaveBalance = () => {
    const val = parseFloat(balanceInput.replace(/[^\d.,-]/g, '').replace(',', '.'));
    if (!isNaN(val)) {
      updateCashBalance(val);
      setEditingBalance(false);
    }
  };

  const balanceDateLabel = currentBalance
    ? new Date(currentBalance.balanceDate + 'T12:00:00').toLocaleDateString('pt-BR')
    : null;

  const cards = [
    {
      label: 'Saldo Atual',
      value: stats.bal,
      icon: Wallet,
      color: 'text-accent',
      bgIcon: 'bg-accent/10',
      isBalance: true,
    },
    {
      label: 'Total a Pagar',
      value: stats.totalPagar,
      icon: ArrowDownCircle,
      color: 'text-destructive',
      bgIcon: 'bg-destructive/10',
      subtitle: `${stats.countPagar} transações`,
      overdue: stats.overduePayable > 0 ? `+${formatCurrency(stats.overduePayableTotal)} atrasado` : undefined,
    },
    {
      label: 'Total a Receber',
      value: stats.totalReceber,
      icon: ArrowUpCircle,
      color: 'text-success',
      bgIcon: 'bg-success/10',
      subtitle: `${stats.countReceber} transações`,
      overdue: stats.overdueReceivable > 0 ? `${formatCurrency(stats.overdueReceivableTotal)} em atraso` : undefined,
    },
    {
      label: 'Saldo Líquido',
      value: stats.saldoLiquido,
      icon: TrendingUp,
      color: stats.saldoLiquido >= 0 ? 'text-success' : 'text-destructive',
      bgIcon: stats.saldoLiquido >= 0 ? 'bg-success/10' : 'bg-destructive/10',
      subtitle: `Projeção final: ${formatCurrency(stats.projectedEnd)}`,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className={cn(
            'card-elevated p-4 relative overflow-hidden',
            card.overdue && 'border-destructive/30',
            card.label === 'Saldo Atual' && stats.balAge !== null && stats.balAge > 3 && 'border-warning/50'
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', card.bgIcon)}>
              <card.icon className={cn('w-3.5 h-3.5', card.color)} />
            </div>
          </div>

          {card.isBalance && editingBalance ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={balanceInput}
                onChange={e => setBalanceInput(e.target.value)}
                placeholder="150000"
                className="h-7 text-xs flex-1"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSaveBalance()}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveBalance}>
                <Check className="w-3.5 h-3.5 text-success" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingBalance(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <p className={cn('stat-value', card.color)}>
                {card.isBalance && !currentBalance ? '—' : formatCurrency(card.value)}
              </p>
              {card.isBalance ? (
                <div className="flex items-center justify-between mt-1">
                  <p className={cn('text-[10px]', stats.balAge !== null && stats.balAge > 3 ? 'text-warning' : 'text-muted-foreground')}>
                    {stats.balAge !== null && stats.balAge > 3 && <Clock className="w-3 h-3 inline mr-0.5" />}
                    {balanceDateLabel || 'Informar saldo'}
                    {stats.balAge !== null && stats.balAge > 0 && ` (${stats.balAge}d atrás)`}
                  </p>
                  <Button
                    size="icon" variant="ghost" className="h-5 w-5"
                    onClick={() => { setBalanceInput(currentBalance?.amount?.toString() || ''); setEditingBalance(true); }}
                  >
                    <Edit3 className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {card.subtitle && <p className="text-[10px] text-muted-foreground">{card.subtitle}</p>}
                  {card.overdue && (
                    <p className="text-[10px] text-destructive font-semibold flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" />{card.overdue}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </motion.div>
      ))}
    </div>
  );
}

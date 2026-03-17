import { useState, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle, Edit3, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function DashboardStatCards() {
  const { transactions, currentBalance, projectedBalance, updateCashBalance } = useFinance();
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');

  const stats = useMemo(() => {
    const today = todayISO();
    const in7days = addDays(today, 7);

    const payablesWeek = transactions.filter(t =>
      t.type === 'pagar' && t.status !== 'confirmado' &&
      (t.dueDate <= in7days || t.status === 'atrasado')
    );
    const receivablesWeek = transactions.filter(t =>
      t.type === 'receber' && t.status !== 'confirmado' &&
      t.dueDate >= today && t.dueDate <= in7days
    );

    const totalPayWeek = payablesWeek.reduce((s, t) => s + t.amount, 0);
    const totalRecWeek = receivablesWeek.reduce((s, t) => s + t.amount, 0);
    const hasOverdue = payablesWeek.some(t => t.status === 'atrasado');
    const projected7 = projectedBalance(in7days);

    return { totalPayWeek, totalRecWeek, hasOverdue, projected7 };
  }, [transactions, projectedBalance]);

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
      value: currentBalance ? formatCurrency(currentBalance.amount) : '—',
      subtitle: balanceDateLabel ? `Atualizado em ${balanceDateLabel}` : 'Clique para informar',
      icon: Wallet,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      editable: true,
    },
    {
      label: 'Saldo Projetado (7d)',
      value: formatCurrency(stats.projected7),
      subtitle: 'Projeção para 7 dias',
      icon: TrendingUp,
      color: stats.projected7 >= 0 ? 'text-success' : 'text-destructive',
      bgColor: stats.projected7 >= 0 ? 'bg-success/10' : 'bg-destructive/10',
      pulse: stats.projected7 < 0,
    },
    {
      label: 'A Pagar (7d)',
      value: formatCurrency(stats.totalPayWeek),
      subtitle: stats.hasOverdue ? 'Inclui atrasados' : 'Próximos 7 dias',
      icon: ArrowDownCircle,
      color: stats.hasOverdue ? 'text-destructive' : 'text-foreground',
      bgColor: stats.hasOverdue ? 'bg-destructive/10' : 'bg-muted',
    },
    {
      label: 'A Receber (7d)',
      value: formatCurrency(stats.totalRecWeek),
      subtitle: 'Próximos 7 dias',
      icon: ArrowUpCircle,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={cn('card-elevated p-4', card.pulse && 'pulse-negative')}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', card.bgColor)}>
              <card.icon className={cn('w-4 h-4', card.color)} />
            </div>
          </div>

          {card.editable && editingBalance ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={balanceInput}
                onChange={e => setBalanceInput(e.target.value)}
                placeholder="150000"
                className="h-8 text-sm flex-1"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSaveBalance()}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSaveBalance}>
                <Check className="w-4 h-4 text-success" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingBalance(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <p className={cn('stat-value', card.color)}>{card.value}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px] text-muted-foreground">{card.subtitle}</p>
                {card.editable && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => {
                      setBalanceInput(currentBalance?.amount?.toString() || '');
                      setEditingBalance(true);
                    }}
                  >
                    <Edit3 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </>
          )}
        </motion.div>
      ))}
    </div>
  );
}

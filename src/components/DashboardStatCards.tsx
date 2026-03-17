import { useState, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle, Edit3, Check, X, Clock } from 'lucide-react';
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
    const in14days = addDays(today, 14);

    const projected7 = projectedBalance(in7days);
    const projected14 = projectedBalance(in14days);
    const bal = currentBalance?.amount ?? 0;
    const delta7 = projected7 - bal;
    const delta14 = projected14 - projected7;

    // Net flow this week
    const outWeek = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= in7days)
      .reduce((s, t) => s + t.amount, 0);
    const inWeek = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= in7days)
      .reduce((s, t) => s + t.amount, 0);

    const overdueCount = transactions.filter(t => t.status === 'atrasado' && t.type === 'pagar').length;
    const overdueAmount = transactions
      .filter(t => t.status === 'atrasado' && t.type === 'pagar')
      .reduce((s, t) => s + t.amount, 0);

    // Balance age
    const balDate = currentBalance?.balanceDate;
    const balAge = balDate ? daysBetween(balDate, today) : null;

    return { projected7, projected14, delta7, delta14, outWeek, inWeek, overdueCount, overdueAmount, balAge, bal };
  }, [transactions, projectedBalance, currentBalance]);

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

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Saldo Atual */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('card-elevated p-4', stats.balAge !== null && stats.balAge > 3 && 'border-warning/50')}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saldo Atual</span>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10">
            <Wallet className="w-3.5 h-3.5 text-accent" />
          </div>
        </div>
        {editingBalance ? (
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
            <p className="stat-value text-accent">{currentBalance ? formatCurrency(currentBalance.amount) : '—'}</p>
            <div className="flex items-center justify-between mt-1">
              <p className={cn('text-[10px]', stats.balAge !== null && stats.balAge > 3 ? 'text-warning' : 'text-muted-foreground')}>
                {stats.balAge !== null && stats.balAge > 3 && <Clock className="w-3 h-3 inline mr-0.5" />}
                {balanceDateLabel ? `${balanceDateLabel}` : 'Informar saldo'}
                {stats.balAge !== null && stats.balAge > 0 && ` (${stats.balAge}d atrás)`}
              </p>
              <Button
                size="icon" variant="ghost" className="h-5 w-5"
                onClick={() => { setBalanceInput(currentBalance?.amount?.toString() || ''); setEditingBalance(true); }}
              >
                <Edit3 className="w-3 h-3" />
              </Button>
            </div>
          </>
        )}
      </motion.div>

      {/* Projeção 7d */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={cn('card-elevated p-4', stats.projected7 < 0 && 'pulse-negative')}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Projeção 7d</span>
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', stats.projected7 >= 0 ? 'bg-success/10' : 'bg-destructive/10')}>
            <TrendingUp className={cn('w-3.5 h-3.5', stats.projected7 >= 0 ? 'text-success' : 'text-destructive')} />
          </div>
        </div>
        <p className={cn('stat-value', stats.projected7 >= 0 ? 'text-success' : 'text-destructive')}>{formatCurrency(stats.projected7)}</p>
        <p className={cn('text-[10px] mt-1', stats.delta7 >= 0 ? 'text-success' : 'text-destructive')}>
          {stats.delta7 >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(stats.delta7))} vs hoje
        </p>
      </motion.div>

      {/* Saídas Semana */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn('card-elevated p-4', stats.overdueCount > 0 && 'border-destructive/30')}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saídas 7d</span>
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', stats.overdueCount > 0 ? 'bg-destructive/10' : 'bg-muted')}>
            <ArrowDownCircle className={cn('w-3.5 h-3.5', stats.overdueCount > 0 ? 'text-destructive' : 'text-foreground')} />
          </div>
        </div>
        <p className="stat-value text-foreground">{formatCurrency(stats.outWeek)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {stats.overdueCount > 0
            ? <span className="text-destructive font-semibold">+{formatCurrency(stats.overdueAmount)} atrasado</span>
            : 'Nenhum atraso'}
        </p>
      </motion.div>

      {/* Entradas Semana */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="card-elevated p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Entradas 7d</span>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-success/10">
            <ArrowUpCircle className="w-3.5 h-3.5 text-success" />
          </div>
        </div>
        <p className="stat-value text-success">{formatCurrency(stats.inWeek)}</p>
        <p className={cn('text-[10px] mt-1', stats.inWeek >= stats.outWeek ? 'text-success' : 'text-muted-foreground')}>
          {stats.inWeek >= stats.outWeek 
            ? `Saldo semanal: +${formatCurrency(stats.inWeek - stats.outWeek)}`
            : `Déficit semanal: −${formatCurrency(stats.outWeek - stats.inWeek)}`}
        </p>
      </motion.div>
    </div>
  );
}

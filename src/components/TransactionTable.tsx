import { useState, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import {
  Transaction, TransactionType, STATUS_OPTIONS, PRIORITY_OPTIONS, COST_CENTERS,
  STATUS_LABELS, PRIORITY_LABELS, PRIORITY_CLASSES,
} from '@/lib/types';
import { formatCurrency, formatDateFull, todayISO, addDays } from '@/lib/helpers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Pencil, Trash2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import TransactionFormDialog from './TransactionFormDialog';

interface Props { type: TransactionType; }

const STATUS_ORDER: Record<string, number> = { atrasado: 0, pendente: 1, previsto: 2, confirmado: 3 };

export default function TransactionTable({ type }: Props) {
  const { transactions, confirmTransaction, deleteTransaction } = useFinance();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [priorityFilter, setPriorityFilter] = useState('todas');
  const [costCenterFilter, setCostCenterFilter] = useState('todos');
  const [periodFilter, setPeriodFilter] = useState('todos');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const today = todayISO();
    const eow = addDays(today, 7);
    const eom = new Date();
    eom.setMonth(eom.getMonth() + 1, 0);
    const eomStr = eom.toISOString().split('T')[0];
    const nm = new Date();
    nm.setMonth(nm.getMonth() + 2, 0);
    const nmStr = nm.toISOString().split('T')[0];

    return transactions
      .filter(t => t.type === type)
      .filter(t => statusFilter === 'todos' || t.status === statusFilter)
      .filter(t => priorityFilter === 'todas' || t.priority === priorityFilter)
      .filter(t => costCenterFilter === 'todos' || t.costCenter === costCenterFilter)
      .filter(t => {
        if (periodFilter === 'todos') return true;
        if (periodFilter === 'semana') return t.dueDate <= eow;
        if (periodFilter === 'mes') return t.dueDate <= eomStr;
        if (periodFilter === 'proximo') return t.dueDate > eomStr && t.dueDate <= nmStr;
        return true;
      })
      .filter(t => {
        if (!search) return true;
        const s = search.toLowerCase();
        return t.description.toLowerCase().includes(s) || t.counterpart.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 9;
        const sb = STATUS_ORDER[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [transactions, type, search, statusFilter, priorityFilter, costCenterFilter, periodFilter]);

  const totals = useMemo(() => {
    const today = todayISO();
    const in7d = addDays(today, 7);
    const total = filtered.reduce((s, t) => s + t.amount, 0);
    const overdue = filtered.filter(t => t.status === 'atrasado');
    const overdueTotal = overdue.reduce((s, t) => s + t.amount, 0);
    const next7 = filtered.filter(t => t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= in7d);
    const next7Total = next7.reduce((s, t) => s + t.amount, 0);
    return { total, overdueCount: overdue.length, overdueTotal, next7Total };
  }, [filtered]);

  const cLabel = type === 'pagar' ? 'Fornecedor' : 'Cliente';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={`Buscar descrição ou ${cLabel.toLowerCase()}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-56 h-9 text-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Prioridades</SelectItem>
            {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={costCenterFilter} onValueChange={setCostCenterFilter}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Centros</SelectItem>
            {COST_CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Período</SelectItem>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="mes">Este mês</SelectItem>
            <SelectItem value="proximo">Mês que vem</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={() => { setEditingTx(null); setShowForm(true); }} className="gap-1.5 text-xs">
          <Plus className="w-4 h-4" />
          {type === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'}
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card-elevated p-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase">Total filtrado</span>
          <span className="text-sm font-semibold font-mono">{formatCurrency(totals.total)}</span>
        </div>
        <div className={cn('card-elevated p-3 flex items-center justify-between', totals.overdueCount > 0 && 'border-destructive/30')}>
          <span className="text-[10px] text-muted-foreground uppercase">
            {type === 'pagar' ? 'Atrasados' : 'Não recebidos'}
          </span>
          <span className={cn('text-sm font-semibold font-mono', totals.overdueCount > 0 && 'text-destructive')}>
            {formatCurrency(totals.overdueTotal)} ({totals.overdueCount})
          </span>
        </div>
        <div className="card-elevated p-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase">Próximos 7 dias</span>
          <span className="text-sm font-semibold font-mono">{formatCurrency(totals.next7Total)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Prior.</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Vencimento</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Descrição</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">{cLabel}</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">Categoria</th>
                {type === 'pagar' && (
                  <th className="text-left px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">Obra</th>
                )}
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Valor</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase w-28">Ações</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.map(tx => {
                  const today = todayISO();
                  return (
                    <motion.tr
                      key={tx.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn(
                        'border-b hover:bg-muted/30 transition-colors',
                        tx.status === 'atrasado' && 'bg-destructive/5',
                        tx.dueDate === today && tx.status !== 'atrasado' && tx.status !== 'confirmado' && 'bg-warning/5'
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <span className={cn('status-badge text-[10px]', `status-${tx.status}`)}>{STATUS_LABELS[tx.status]}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('status-badge text-[10px]', PRIORITY_CLASSES[tx.priority])}>{PRIORITY_LABELS[tx.priority]}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{formatDateFull(tx.dueDate)}</td>
                      <td className="px-3 py-2.5 font-medium max-w-[180px] truncate">{tx.description}</td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[140px] truncate">{tx.counterpart}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">{tx.category}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(tx.amount)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          {tx.status !== 'confirmado' && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => confirmTransaction(tx.id)} title="Confirmar">
                              <Check className="w-3.5 h-3.5 text-success" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingTx(tx); setShowForm(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm('Excluir esta transação?')) deleteTransaction(tx.id); }}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma transação encontrada.</div>
          )}
        </div>
      </div>

      <TransactionFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingTx(null); }}
        transaction={editingTx}
        defaultType={type}
      />
    </div>
  );
}

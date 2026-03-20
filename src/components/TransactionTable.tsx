import { useState, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import {
  Transaction, TransactionType, STATUS_OPTIONS, PRIORITY_OPTIONS, COST_CENTERS,
  STATUS_LABELS, PRIORITY_LABELS, PRIORITY_CLASSES,
} from '@/lib/types';
import { formatCurrency, formatDateFull, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Check, Pencil, Trash2, Plus, Search, ArrowDownRight, ArrowUpRight,
  Clock, AlertTriangle, CalendarDays, Filter, X,
} from 'lucide-react';
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

  const hasActiveFilters = statusFilter !== 'todos' || priorityFilter !== 'todas' || costCenterFilter !== 'todos' || periodFilter !== 'todos' || search.length > 0;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('todos');
    setPriorityFilter('todas');
    setCostCenterFilter('todos');
    setPeriodFilter('todos');
  };

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
    const confirmed = filtered.filter(t => t.status === 'confirmado');
    const confirmedTotal = confirmed.reduce((s, t) => s + t.amount, 0);
    return { total, overdueCount: overdue.length, overdueTotal, next7Total, next7Count: next7.length, confirmedTotal, confirmedCount: confirmed.length };
  }, [filtered]);

  const cLabel = type === 'pagar' ? 'Fornecedor' : 'Cliente';
  const isPagar = type === 'pagar';

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div className="card-elevated p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              {isPagar
                ? <ArrowDownRight className="w-3.5 h-3.5 text-primary" />
                : <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
              }
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
              Total
            </span>
          </div>
          <p className="text-xl font-bold font-mono tracking-tight">
            {formatCurrency(totals.total)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {filtered.length} transação(ões)
          </p>
        </div>

        <div className={cn(
          'card-elevated p-4',
          totals.overdueCount > 0 && 'ring-1 ring-destructive/20'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center',
              totals.overdueCount > 0 ? 'bg-destructive/10' : 'bg-muted'
            )}>
              <AlertTriangle className={cn(
                'w-3.5 h-3.5',
                totals.overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground'
              )} />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
              {isPagar ? 'Atrasados' : 'Não recebidos'}
            </span>
          </div>
          <p className={cn(
            'text-xl font-bold font-mono tracking-tight',
            totals.overdueCount > 0 && 'text-destructive'
          )}>
            {formatCurrency(totals.overdueTotal)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {totals.overdueCount} item(ns)
          </p>
        </div>

        <div className="card-elevated p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-warning/10 flex items-center justify-center">
              <CalendarDays className="w-3.5 h-3.5 text-warning" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
              Próximos 7 dias
            </span>
          </div>
          <p className="text-xl font-bold font-mono tracking-tight">
            {formatCurrency(totals.next7Total)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {totals.next7Count} vencimento(s)
          </p>
        </div>

        <div className="card-elevated p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-success" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
              {isPagar ? 'Pagos' : 'Recebidos'}
            </span>
          </div>
          <p className="text-xl font-bold font-mono tracking-tight text-success">
            {formatCurrency(totals.confirmedTotal)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {totals.confirmedCount} confirmado(s)
          </p>
        </div>
      </motion.div>

      {/* Filters + Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="card-elevated p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={`Buscar descrição ou ${cLabel.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-52 h-8 text-xs pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Prioridades</SelectItem>
              {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={costCenterFilter} onValueChange={setCostCenterFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Centros</SelectItem>
              {COST_CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Período</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mês</SelectItem>
              <SelectItem value="proximo">Mês que vem</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={clearFilters}
            >
              <X className="w-3 h-3" />
              Limpar
            </Button>
          )}
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => { setEditingTx(null); setShowForm(true); }}
            className="h-8 gap-1.5 text-xs font-medium shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            {isPagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
          </Button>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="card-elevated overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left pl-5 pr-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Prior.</th>
                <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vencimento</th>
                <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Descrição</th>
                <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{cLabel}</th>
                <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                  {type === 'receber' ? 'Parcela' : 'Categoria'}
                </th>
                {isPagar && (
                  <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Obra</th>
                )}
                <th className="text-right px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Valor</th>
                <th className="text-right pr-5 pl-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-28">Ações</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.map(tx => {
                  const today = todayISO();
                  const isOverdue = tx.status === 'atrasado';
                  const isDueToday = tx.dueDate === today && !isOverdue && tx.status !== 'confirmado';
                  const isConfirmed = tx.status === 'confirmado';

                  return (
                    <motion.tr
                      key={tx.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      layout
                      className={cn(
                        'border-b transition-colors group',
                        isOverdue && 'bg-destructive/[0.04]',
                        isDueToday && 'bg-warning/[0.04]',
                        isConfirmed && 'opacity-60',
                        !isOverdue && !isDueToday && !isConfirmed && 'hover:bg-muted/30'
                      )}
                    >
                      <td className="pl-5 pr-3 py-3">
                        <span className={cn('status-badge text-[10px]', `status-${tx.status}`)}>
                          {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse mr-1" />}
                          {STATUS_LABELS[tx.status]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('status-badge text-[10px]', PRIORITY_CLASSES[tx.priority])}>
                          {PRIORITY_LABELS[tx.priority]}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isDueToday && <Clock className="w-3 h-3 text-warning" />}
                          <span className={cn('text-xs', isDueToday && 'font-semibold text-warning')}>
                            {formatDateFull(tx.dueDate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 max-w-[200px]">
                        <p className="font-medium truncate text-xs">{tx.description}</p>
                        {tx.notes && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{tx.notes}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground max-w-[140px] truncate text-xs">{tx.counterpart}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">{tx.category}</td>
                      {isPagar && (
                        <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                          {['Materiais de Obra', 'Mão de Obra Terceirizada'].includes(tx.category)
                            ? <span className="font-medium text-foreground">{tx.costCenter}</span>
                            : <span className="text-muted-foreground/40">—</span>
                          }
                        </td>
                      )}
                      <td className="px-3 py-3 text-right">
                        <span className={cn(
                          'font-mono font-bold whitespace-nowrap text-xs',
                          isPagar ? 'text-destructive' : 'text-success'
                        )}>
                          {isPagar ? '−' : '+'}{formatCurrency(tx.amount)}
                        </span>
                      </td>
                      <td className="pr-5 pl-3 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {!isConfirmed && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-success/10"
                              onClick={() => confirmTransaction(tx.id)}
                              title={isPagar ? 'Confirmar pagamento' : 'Confirmar recebimento'}
                            >
                              <Check className="w-3.5 h-3.5 text-success" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => { setEditingTx(tx); setShowForm(true); }}
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                            onClick={() => { if (confirm('Excluir esta transação?')) deleteTransaction(tx.id); }}
                          >
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
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Search className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Nenhuma transação encontrada</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {hasActiveFilters ? 'Tente ajustar os filtros' : `Clique em "Nova conta" para começar`}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" className="mt-3 text-xs h-7" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      <TransactionFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingTx(null); }}
        transaction={editingTx}
        defaultType={type}
      />
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { Obra } from '@/lib/types';
import {
  Transaction, TransactionType, STATUS_OPTIONS, PRIORITY_OPTIONS, COST_CENTERS,
  STATUS_LABELS, PRIORITY_LABELS, PRIORITY_CLASSES,
} from '@/lib/types';
import { formatCurrency, formatDateFull, todayISO, addDays } from '@/lib/helpers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Check, Pencil, Trash2, Plus, Search, ArrowDownRight, ArrowUpRight,
  Clock, AlertTriangle, CalendarDays, X, CalendarIcon, Send, FileText, CreditCard, Paperclip, Download,
} from 'lucide-react';
import ExportDropdown from './ExportDropdown';
import { exportToCSV, exportToExcel, exportToPDF, transactionsToExportRows } from '@/lib/export-utils';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import TransactionFormDialog from './TransactionFormDialog';
import ObraDetailSheet from './ObraDetailSheet';
import AuditLogDrawer from './AuditLogDrawer';
import CustomCategoriesManager from './CustomCategoriesManager';

interface Props { type: TransactionType; }

const STATUS_ORDER: Record<string, number> = { atrasado: 0, pendente: 1, previsto: 2, confirmado: 3 };

export default function TransactionTable({ type }: Props) {
  const { confirmTransaction, deleteTransaction, updateTransaction } = useFinance();
  const { filteredTransactions: transactions, isFiltered } = useObraFilter();
  const { obras } = useObras();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pendentes');
  const [priorityFilter, setPriorityFilter] = useState('todas');
  const [costCenterFilter, setCostCenterFilter] = useState('todos');
  const [counterpartFilter, setCounterpartFilter] = useState('todos');
  const [obraFilter, setObraFilter] = useState('todos');
  const [costTypeFilter, setCostTypeFilter] = useState('todos');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [billingFilter, setBillingFilter] = useState('todos');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);
  const [confirmTx, setConfirmTx] = useState<Transaction | null>(null);
  const [actualAmount, setActualAmount] = useState('');
  const [confirmPaidAt, setConfirmPaidAt] = useState(todayISO());
  const [detailObra, setDetailObra] = useState<Obra | null>(null);

  const isPagar = type === 'pagar';

  const hasActiveFilters = statusFilter !== 'pendentes' || (isPagar && priorityFilter !== 'todas') || (isPagar && costCenterFilter !== 'todos') || (isPagar && costTypeFilter !== 'todos') || (type === 'receber' && counterpartFilter !== 'todos') || (!isPagar && billingFilter !== 'todos') || obraFilter !== 'todos' || !!dateRange?.from || search.length > 0;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('pendentes');
    setPriorityFilter('todas');
    setCostCenterFilter('todos');
    setCounterpartFilter('todos');
    setObraFilter('todos');
    setBillingFilter('todos');
    setDateRange(undefined);
  };

  const obrasWithTx = useMemo(() => {
    const obraIds = new Set(transactions.filter(t => t.type === type && t.obraId).map(t => t.obraId!));
    return obras.filter(o => obraIds.has(o.id));
  }, [transactions, obras, type]);

  const uniqueCounterparts = useMemo(() => {
    const set = new Set(transactions.filter(t => t.type === 'receber').map(t => t.counterpart).filter(Boolean));
    return Array.from(set).sort();
  }, [transactions]);

  const getObraCode = (obraId: string | null) => {
    if (!obraId) return null;
    return obras.find(o => o.id === obraId)?.code || null;
  };

  const filtered = useMemo(() => {
    return transactions
      .filter(t => t.type === type)
      // Default "pendentes" filter: hide paid/confirmed items
      .filter(t => {
        if (statusFilter === 'pendentes') return t.status !== 'confirmado';
        if (statusFilter === 'todos') return true;
        return t.status === statusFilter;
      })
      .filter(t => priorityFilter === 'todas' || t.priority === priorityFilter)
      .filter(t => costCenterFilter === 'todos' || t.costCenter === costCenterFilter)
      .filter(t => counterpartFilter === 'todos' || t.counterpart === counterpartFilter)
      .filter(t => {
        if (billingFilter === 'todos') return true;
        if (billingFilter === 'cobrada') return t.billingCount > 0;
        if (billingFilter === 'nao_cobrada') return t.billingCount === 0;
        return true;
      })
      .filter(t => {
        if (obraFilter === 'todos') return true;
        if (obraFilter === '_sem_obra') return !t.obraId;
        if (obraFilter === '_com_obra') return !!t.obraId;
        return t.obraId === obraFilter;
      })
      .filter(t => {
        if (!dateRange?.from) return true;
        const from = dateRange.from.toISOString().split('T')[0];
        const to = dateRange.to ? dateRange.to.toISOString().split('T')[0] : from;
        return t.dueDate >= from && t.dueDate <= to;
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
  }, [transactions, type, search, statusFilter, priorityFilter, costCenterFilter, counterpartFilter, obraFilter, dateRange]);

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

  const cLabel = isPagar ? 'Fornecedor' : 'Obra / Cliente';

  const handleDelete = () => {
    if (deleteConfirm) {
      deleteTransaction(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            icon: isPagar ? ArrowDownRight : ArrowUpRight,
            iconBg: 'bg-primary/10',
            iconColor: 'text-primary',
            label: 'Total',
            value: formatCurrency(totals.total),
            sub: `${filtered.length} transação(ões)`,
            ring: '',
          },
          {
            icon: AlertTriangle,
            iconBg: totals.overdueCount > 0 ? 'bg-destructive/10' : 'bg-muted',
            iconColor: totals.overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground',
            label: isPagar ? 'Atrasados' : 'Não recebidos',
            value: formatCurrency(totals.overdueTotal),
            valueColor: totals.overdueCount > 0 ? 'text-destructive' : '',
            sub: `${totals.overdueCount} item(ns)`,
            ring: totals.overdueCount > 0 ? 'ring-1 ring-destructive/15' : '',
            pulse: totals.overdueCount > 0,
          },
          {
            icon: CalendarDays,
            iconBg: 'bg-warning/10',
            iconColor: 'text-warning',
            label: 'Próximos 7 dias',
            value: formatCurrency(totals.next7Total),
            sub: `${totals.next7Count} vencimento(s)`,
            ring: '',
          },
          {
            icon: Check,
            iconBg: 'bg-success/10',
            iconColor: 'text-success',
            label: isPagar ? 'Pagos' : 'Recebidos',
            value: formatCurrency(totals.confirmedTotal),
            valueColor: 'text-success',
            sub: `${totals.confirmedCount} confirmado(s)`,
            ring: '',
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className={cn('card-elevated p-4 group hover:shadow-md transition-shadow duration-200', card.ring)}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110', card.iconBg)}>
                <card.icon className={cn('w-3.5 h-3.5', card.iconColor)} />
              </div>
              <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">{card.label}</span>
              {card.pulse && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />}
            </div>
            <p className={cn('text-xl font-bold font-mono tracking-tight', card.valueColor)}>
              {card.value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{card.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters + Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
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
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendentes">Pendentes</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>
                  {isPagar && s === 'confirmado' ? 'Pago' : STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isPagar && (
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Prioridades</SelectItem>
                {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isPagar && (
            <Select value={costCenterFilter} onValueChange={setCostCenterFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Centros</SelectItem>
                {COST_CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {!isPagar && (
            <Select value={billingFilter} onValueChange={setBillingFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Cobrança</SelectItem>
                <SelectItem value="cobrada">Cobrada</SelectItem>
                <SelectItem value="nao_cobrada">Não cobrada</SelectItem>
              </SelectContent>
            </Select>
          )}
          {!isPagar && (
            <Select value={obraFilter} onValueChange={setObraFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Tipo</SelectItem>
                <SelectItem value="_com_obra">De obra</SelectItem>
                <SelectItem value="_sem_obra">Avulsa</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("h-8 text-xs gap-1.5 font-normal", !dateRange?.from && "text-muted-foreground")}>
                <CalendarIcon className="w-3.5 h-3.5" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>{format(dateRange.from, "dd/MM", { locale: ptBR })} – {format(dateRange.to, "dd/MM", { locale: ptBR })}</>
                  ) : (
                    format(dateRange.from, "dd/MM/yy", { locale: ptBR })
                  )
                ) : (
                  "Período"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={ptBR}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 active:scale-95 transition-transform"
              onClick={clearFilters}
            >
              <X className="w-3 h-3" />
              Limpar
            </Button>
          )}
          <div className="flex-1" />
          <ExportDropdown
            onCSV={() => {
              const rows = transactionsToExportRows(filtered, type);
              exportToCSV(rows, `${isPagar ? 'contas-pagar' : 'contas-receber'}`);
            }}
            onExcel={() => {
              const rows = transactionsToExportRows(filtered, type);
              exportToExcel(rows, `${isPagar ? 'contas-pagar' : 'contas-receber'}`);
            }}
            onPDF={() => {
              const rows = transactionsToExportRows(filtered, type);
              const headers = Object.keys(rows[0] || {});
              exportToPDF(
                isPagar ? 'Contas a Pagar' : 'Contas a Receber',
                headers,
                rows.map(r => headers.map(h => String(r[h] ?? '')))
              );
            }}
          />
          <AuditLogDrawer />
          <CustomCategoriesManager />
          <Button
            size="sm"
            onClick={() => { setEditingTx(null); setShowForm(true); }}
            className="h-8 gap-1.5 text-xs font-medium shadow-sm active:scale-95 transition-transform"
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
        transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="card-elevated overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left pl-5 pr-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                {isPagar && <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Prior.</th>}
                <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vencimento</th>
                {isPagar ? (
                  <>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Descrição</th>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Fornecedor</th>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Categoria</th>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Obra</th>
                  </>
                ) : (
                  <>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Obra</th>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cliente</th>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Parcela</th>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Pgto.</th>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Cobrança</th>
                    <th className="text-left px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Obs.</th>
                  </>
                )}
                <th className="text-right px-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Valor</th>
                <th className="text-right pr-5 pl-3 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-28">Ações</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.map((tx, i) => {
                  const today = todayISO();
                  const isOverdue = tx.status === 'atrasado';
                  const isDueToday = tx.dueDate === today && !isOverdue && tx.status !== 'confirmado';
                  const isConfirmed = tx.status === 'confirmado';
                  const obraCode = getObraCode(tx.obraId);

                  return (
                    <motion.tr
                      key={tx.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 6 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                      layout
                      className={cn(
                        'border-b border-border/50 transition-colors group/row',
                        isOverdue && 'bg-destructive/[0.03] hover:bg-destructive/[0.06]',
                        isDueToday && 'bg-warning/[0.03] hover:bg-warning/[0.06]',
                        isConfirmed && 'opacity-50 hover:opacity-70',
                        !isOverdue && !isDueToday && !isConfirmed && 'hover:bg-muted/30'
                      )}
                    >
                      <td className="pl-5 pr-3 py-3">
                        <span className={cn(
                          'status-badge text-[10px]',
                          `status-${tx.status}`,
                          isConfirmed && isPagar && 'bg-success/10 text-success border-success/20'
                        )}>
                          {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse mr-1" />}
                          {isConfirmed && isPagar && <Check className="w-3 h-3 mr-1" />}
                          {isConfirmed && isPagar ? 'Pago' : STATUS_LABELS[tx.status]}
                        </span>
                        {isConfirmed && tx.paidAt && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 pl-0.5">{formatDateFull(tx.paidAt)}</p>
                        )}
                      </td>
                      {isPagar && (
                        <td className="px-3 py-3">
                          <span className={cn('status-badge text-[10px]', PRIORITY_CLASSES[tx.priority])}>
                            {PRIORITY_LABELS[tx.priority]}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isDueToday && <Clock className="w-3 h-3 text-warning" />}
                          <span className={cn('text-xs', isDueToday && 'font-semibold text-warning')}>
                            {formatDateFull(tx.dueDate)}
                          </span>
                        </div>
                      </td>
                      {isPagar ? (
                        <>
                          <td className="px-3 py-3 max-w-[200px]">
                            <p className="font-medium truncate text-xs">{tx.description}</p>
                            {tx.notes && (
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{tx.notes}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 max-w-[140px] truncate text-xs text-muted-foreground">{tx.counterpart || '—'}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">{tx.category}</td>
                          <td className="px-3 py-3 text-xs hidden lg:table-cell">
                            {obraCode ? (
                              <Badge variant="outline" className="text-[10px] font-mono">{obraCode}</Badge>
                            ) : (
                              <span className="text-muted-foreground/40">Corp.</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-xs">
                            {obraCode ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono cursor-pointer hover:bg-primary/10 transition-colors"
                                onClick={() => {
                                  const obra = obras.find(o => o.id === tx.obraId);
                                  if (obra) setDetailObra(obra);
                                }}
                              >
                                {obraCode}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] font-normal bg-accent/50 text-accent-foreground">
                                Avulsa
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-3 max-w-[160px] truncate text-xs font-medium">
                            {tx.obraId ? (tx.counterpart || '—') : (
                              <span className="flex items-center gap-1.5">
                                <span>{tx.counterpart || tx.description || '—'}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 max-w-[140px]">
                            {tx.obraId ? (
                              <p className="text-xs truncate">{tx.category || tx.description}</p>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-normal border-dashed">
                                {tx.category || 'Outros'}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                            {tx.paymentMethod ? (
                              <span className="flex items-center gap-1">
                                <CreditCard className="w-3 h-3" />
                                {tx.paymentMethod}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-xs hidden lg:table-cell whitespace-nowrap">
                            {tx.billingCount > 0 && tx.billingSentAt ? (
                              <span className="flex items-center gap-1 text-success">
                                <Send className="w-3 h-3" />
                                <span className="font-medium">Cobrança {tx.billingCount}</span>
                                <span className="text-muted-foreground">· {formatDateFull(tx.billingSentAt)}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">Não cobrada</span>
                            )}
                          </td>
                          <td className="px-3 py-3 max-w-[140px] text-xs text-muted-foreground hidden xl:table-cell">
                            {tx.notes ? (
                              <p className="truncate flex items-center gap-1" title={tx.notes}>
                                <FileText className="w-3 h-3 shrink-0" />
                                {tx.notes}
                              </p>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        </>
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
                          {tx.attachmentUrl && (
                            <a href={tx.attachmentUrl} target="_blank" rel="noopener noreferrer" title="Ver comprovante">
                              <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-primary/10" type="button">
                                <Paperclip className="w-3.5 h-3.5 text-primary" />
                              </Button>
                            </a>
                          )}
                          {!isPagar && !isConfirmed && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity hover:bg-primary/10 active:scale-90"
                              title={tx.billingCount > 0 ? `Reenviar cobrança (atual: ${tx.billingCount})` : 'Marcar cobrança enviada'}
                              onClick={() => {
                                const newCount = (tx.billingCount || 0) + 1;
                                updateTransaction(tx.id, {
                                  billingSentAt: todayISO(),
                                  billingCount: newCount,
                                });
                              }}
                            >
                              <Send className="w-3.5 h-3.5 text-primary" />
                            </Button>
                          )}
                          {!isConfirmed && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity hover:bg-success/10 active:scale-90"
                              onClick={() => {
                                setConfirmTx(tx);
                                setActualAmount(tx.amount.toString());
                                setConfirmPaidAt(todayISO());
                              }}
                              title={isPagar ? 'Confirmar pagamento' : 'Confirmar recebimento'}
                            >
                              <Check className="w-3.5 h-3.5 text-success" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity active:scale-90"
                            onClick={() => { setEditingTx(tx); setShowForm(true); }}
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity hover:bg-destructive/10 active:scale-90"
                            onClick={() => setDeleteConfirm(tx)}
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

      {/* Obra Detail Sheet */}
      <ObraDetailSheet obra={detailObra} onClose={() => setDetailObra(null)} />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir transação</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm?.description}</strong>?
              {deleteConfirm && (
                <span className="block mt-1 text-xs font-mono">
                  Valor: {formatCurrency(deleteConfirm.amount)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm payment/receivable modal */}
      <Dialog open={!!confirmTx} onOpenChange={(v) => !v && setConfirmTx(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmTx?.type === 'pagar' ? 'Confirmar pagamento' : 'Confirmar recebimento'}</DialogTitle>
            <DialogDescription>
              Informe o valor real {confirmTx?.type === 'pagar' ? 'pago' : 'recebido'} para <strong>{confirmTx?.description}</strong>.
              <span className="block mt-1.5 text-xs text-muted-foreground">
                Valor planejado: <span className="font-mono font-semibold text-foreground">{confirmTx && formatCurrency(confirmTx.amount)}</span>
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Valor {confirmTx?.type === 'pagar' ? 'pago' : 'recebido'} (R$)
              </label>
              <Input
                type="number"
                step="0.01"
                value={actualAmount}
                onChange={(e) => setActualAmount(e.target.value)}
                className="font-mono text-base"
                autoFocus
              />
              {confirmTx && parseFloat(actualAmount) !== confirmTx.amount && actualAmount !== '' && (
                <p className="text-[11px] mt-1.5 text-muted-foreground">
                  Diferença: <span className={cn(
                    'font-mono font-semibold',
                    parseFloat(actualAmount) > confirmTx.amount ? 'text-success' : 'text-destructive'
                  )}>
                    {parseFloat(actualAmount) > confirmTx.amount ? '+' : ''}{formatCurrency(parseFloat(actualAmount) - confirmTx.amount)}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Data do {confirmTx?.type === 'pagar' ? 'pagamento' : 'recebimento'}
              </label>
              <Input
                type="date"
                value={confirmPaidAt}
                onChange={(e) => setConfirmPaidAt(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfirmTx(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (confirmTx && actualAmount) {
                  confirmTransaction(confirmTx.id, parseFloat(actualAmount), confirmTx.type, confirmPaidAt);
                  setConfirmTx(null);
                }
              }}
              disabled={!actualAmount || parseFloat(actualAmount) <= 0 || !confirmPaidAt}
            >
              Confirmar e atualizar saldo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

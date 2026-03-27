import { useState, useMemo, useRef } from 'react';
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
  Clock, AlertTriangle, CalendarDays, X, CalendarIcon, Send, FileText, CreditCard, Paperclip, ChevronDown,
  FileUp, Loader2, FileWarning,
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
import ConfirmPaymentDialog from './ConfirmPaymentDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props { type: TransactionType; }

const STATUS_ORDER: Record<string, number> = { atrasado: 0, pendente: 1, previsto: 2, confirmado: 3 };

/* ─── Chip filter helper ─── */
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap min-h-[32px]',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {label}
    </button>
  );
}

export default function TransactionTable({ type }: Props) {
  const { confirmTransaction, deleteTransaction, updateTransaction } = useFinance();
  const { filteredTransactions: transactions, isFiltered } = useObraFilter();
  const { obras } = useObras();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pendentes');
  const [priorityFilter, setPriorityFilter] = useState('todas');
  const [costCenterFilter, setCostCenterFilter] = useState('todos');
  const [counterpartFilter, setCounterpartFilter] = useState('todos');
  const [obraFilter, setObraFilter] = useState('todos');
  const [costTypeFilter, setCostTypeFilter] = useState('todos');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [billingFilter, setBillingFilter] = useState('todos');
  const [nfFilter, setNfFilter] = useState('todos');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);
  const [confirmTx, setConfirmTx] = useState<Transaction | null>(null);
  const [detailObra, setDetailObra] = useState<Obra | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [uploadingNfId, setUploadingNfId] = useState<string | null>(null);
  const nfFileRef = useRef<HTMLInputElement>(null);
  const [nfTargetTxId, setNfTargetTxId] = useState<string | null>(null);

  const isPagar = type === 'pagar';

  const handleNfUpload = async (file: File, txId: string) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx 10MB)');
      return;
    }
    setUploadingNfId(txId);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `nf/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('attachments').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      updateTransaction(txId, { attachmentUrl: urlData.publicUrl });
      toast.success('Nota fiscal anexada!');
    } catch {
      toast.error('Erro ao enviar nota fiscal');
    } finally {
      setUploadingNfId(null);
      setNfTargetTxId(null);
    }
  };

  const hasActiveFilters = statusFilter !== 'pendentes' || (isPagar && priorityFilter !== 'todas') || (isPagar && costCenterFilter !== 'todos') || (isPagar && costTypeFilter !== 'todos') || (type === 'receber' && counterpartFilter !== 'todos') || (!isPagar && billingFilter !== 'todos') || (!isFiltered && obraFilter !== 'todos') || !!dateRange?.from || search.length > 0 || (isPagar && nfFilter !== 'todos');

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('pendentes');
    setPriorityFilter('todas');
    setCostCenterFilter('todos');
    setCounterpartFilter('todos');
    setObraFilter('todos');
    setBillingFilter('todos');
    setCostTypeFilter('todos');
    setNfFilter('todos');
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
      .filter(t => {
        if (statusFilter === 'pendentes') return t.status !== 'confirmado';
        if (statusFilter === 'todos') return true;
        return t.status === statusFilter;
      })
      .filter(t => priorityFilter === 'todas' || t.priority === priorityFilter)
      .filter(t => costCenterFilter === 'todos' || t.costCenter === costCenterFilter)
      .filter(t => {
        if (costTypeFilter === 'todos') return true;
        if (costTypeFilter === 'fixo') return t.recurrence !== 'única';
        if (costTypeFilter === 'variavel') return t.recurrence === 'única';
        return true;
      })
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
      .filter(t => {
        if (nfFilter === 'todos') return true;
        if (nfFilter === 'sem_nf') return t.status === 'confirmado' && !t.attachmentUrl;
        if (nfFilter === 'com_nf') return !!t.attachmentUrl;
        return true;
      })
      .sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 9;
        const sb = STATUS_ORDER[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [transactions, type, search, statusFilter, priorityFilter, costCenterFilter, costTypeFilter, counterpartFilter, obraFilter, billingFilter, nfFilter, dateRange]);

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
    const missingNf = filtered.filter(t => t.status === 'confirmado' && !t.attachmentUrl);
    return { total, overdueCount: overdue.length, overdueTotal, next7Total, next7Count: next7.length, confirmedTotal, confirmedCount: confirmed.length, missingNfCount: missingNf.length };
  }, [filtered]);

  const cLabel = isPagar ? 'Fornecedor' : 'Obra / Cliente';

  const handleDelete = () => {
    if (deleteConfirm) {
      deleteTransaction(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  /* ─── Mobile Card Renderer ─── */
  const renderMobileCard = (tx: Transaction) => {
    const today = todayISO();
    const isOverdue = tx.status === 'atrasado';
    const isConfirmed = tx.status === 'confirmado';
    const obraCode = getObraCode(tx.obraId);
    const isExpanded = expandedCard === tx.id;

    return (
      <motion.div
        key={tx.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        className={cn(
          'rounded-xl border p-3.5 transition-colors',
          isOverdue && 'border-destructive/20 bg-destructive/[0.03]',
          isConfirmed && 'opacity-60',
          !isOverdue && !isConfirmed && 'border-border'
        )}
      >
        {/* Card header: tap to expand */}
        <button
          className="w-full text-left"
          onClick={() => setExpandedCard(isExpanded ? null : tx.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{tx.description}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={cn('status-badge text-[10px]', `status-${tx.status}`, isConfirmed && isPagar && 'bg-success/10 text-success border-success/20')}>
                  {isConfirmed && isPagar ? 'Pago' : STATUS_LABELS[tx.status]}
                </span>
                {isOverdue && (
                  <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-[18px]">
                    Atrasado
                  </Badge>
                )}
                {obraCode && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-[18px] font-mono">
                    {obraCode}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={cn('text-base font-bold font-mono', isPagar ? 'text-destructive' : 'text-success')}>
                {isPagar ? '−' : '+'}{formatCurrency(tx.amount)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDateFull(tx.dueDate)}
              </p>
            </div>
          </div>
          {/* Subtle expand indicator */}
          <div className="flex justify-center mt-1.5">
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground/40 transition-transform', isExpanded && 'rotate-180')} />
          </div>
        </button>

        {/* Expanded details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 mt-2 border-t space-y-2">
                {tx.counterpart && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{isPagar ? 'Fornecedor:' : 'Cliente:'}</span>
                    {tx.counterpart}
                  </div>
                )}
                {tx.category && tx.category !== 'Outros' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Categoria:</span>
                    {tx.category}
                  </div>
                )}
                {tx.paymentMethod && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CreditCard className="w-3 h-3" /> {tx.paymentMethod}
                  </div>
                )}
                {tx.notes && (
                  <div className="text-xs text-muted-foreground flex items-start gap-2">
                    <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{tx.notes}</span>
                  </div>
                )}
                {tx.attachmentUrl && (
                  <a href={tx.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary">
                    <Paperclip className="w-3 h-3" /> Ver comprovante
                  </a>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2">
                  {!isConfirmed && (
                    <Button
                      size="sm"
                      className="flex-1 h-9 text-xs gap-1.5"
                      onClick={() => setConfirmTx(tx)}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isPagar ? 'Confirmar pgto' : 'Confirmar receb.'}
                    </Button>
                  )}
                  {!isPagar && !isConfirmed && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs gap-1.5"
                      onClick={() => {
                        const newCount = (tx.billingCount || 0) + 1;
                        updateTransaction(tx.id, {
                          billingSentAt: todayISO(),
                          billingCount: newCount,
                        });
                      }}
                    >
                      <Send className="w-3.5 h-3.5" />
                      Cobrar
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    onClick={() => { setEditingTx(tx); setShowForm(true); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 hover:bg-destructive/10 hover:border-destructive/30"
                    onClick={() => setDeleteConfirm(tx)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {!isPagar && (
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
              label: 'Não recebidos',
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
              label: 'Recebidos',
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
      )}

      {/* Inline summary for pagar */}
      {isPagar && (
        <div className="flex items-center gap-4 flex-wrap text-xs px-1">
          <span className="text-muted-foreground">
            {filtered.length} transação(ões) · Total: <span className="font-mono font-bold text-foreground">{formatCurrency(totals.total)}</span>
          </span>
          {totals.overdueCount > 0 && (
            <span className="text-destructive font-medium">
              {totals.overdueCount} atrasado(s): {formatCurrency(totals.overdueTotal)}
            </span>
          )}
          {totals.confirmedCount > 0 && (
            <span className="text-success font-medium">
              {totals.confirmedCount} pago(s): {formatCurrency(totals.confirmedTotal)}
            </span>
          )}
          {totals.missingNfCount > 0 && (
            <button
              onClick={() => { setStatusFilter('confirmado'); setNfFilter('sem_nf'); }}
              className="flex items-center gap-1 text-warning font-medium hover:underline"
            >
              <FileWarning className="w-3 h-3" />
              {totals.missingNfCount} sem NF
            </button>
          )}
        </div>
      )}

      {/* ─── Filters ─── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="card-elevated p-3"
      >
        {/* Mobile: horizontal scrollable chips */}
        {isMobile ? (
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={`Buscar...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 text-xs pl-8"
              />
            </div>
            {/* Chip row: status */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              <FilterChip label="Pendentes" active={statusFilter === 'pendentes'} onClick={() => setStatusFilter('pendentes')} />
              <FilterChip label="Todos" active={statusFilter === 'todos'} onClick={() => setStatusFilter('todos')} />
              {STATUS_OPTIONS.map(s => (
                <FilterChip
                  key={s}
                  label={isPagar && s === 'confirmado' ? 'Pago' : STATUS_LABELS[s]}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                />
              ))}
            </div>
            {/* Chip row: additional filters */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {isPagar && (
                <>
                  {PRIORITY_OPTIONS.map(p => (
                    <FilterChip
                      key={p}
                      label={PRIORITY_LABELS[p]}
                      active={priorityFilter === p}
                      onClick={() => setPriorityFilter(prev => prev === p ? 'todas' : p)}
                    />
                  ))}
                </>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap min-h-[32px]',
                    dateRange?.from ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    <CalendarIcon className="w-3 h-3 inline mr-1" />
                    {dateRange?.from
                      ? `${format(dateRange.from, "dd/MM", { locale: ptBR })}${dateRange.to ? ` – ${format(dateRange.to, "dd/MM", { locale: ptBR })}` : ''}`
                      : 'Período'
                    }
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {hasActiveFilters && (
                <FilterChip label="✕ Limpar" active={false} onClick={clearFilters} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1" />
              <ExportDropdown
                onCSV={() => { exportToCSV(transactionsToExportRows(filtered, type), `${isPagar ? 'contas-pagar' : 'contas-receber'}`); }}
                onExcel={() => { exportToExcel(transactionsToExportRows(filtered, type), `${isPagar ? 'contas-pagar' : 'contas-receber'}`); }}
                onPDF={() => {
                  const rows = transactionsToExportRows(filtered, type);
                  const headers = Object.keys(rows[0] || {});
                  exportToPDF(isPagar ? 'Contas a Pagar' : 'Contas a Receber', headers, rows.map(r => headers.map(h => String(r[h] ?? ''))));
                }}
              />
              <Button
                size="sm"
                onClick={() => { setEditingTx(null); setShowForm(true); }}
                className="h-9 gap-1.5 text-xs font-medium shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova
              </Button>
            </div>
          </div>
        ) : (
          /* Desktop: original select-based filters */
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
            {isPagar && (
              <Select value={costTypeFilter} onValueChange={setCostTypeFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Tipo Custo</SelectItem>
                  <SelectItem value="fixo">Fixo (recorrente)</SelectItem>
                  <SelectItem value="variavel">Variável (único)</SelectItem>
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
            {!isPagar && !isFiltered && (
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
                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 active:scale-95 transition-transform" onClick={clearFilters}>
                <X className="w-3 h-3" /> Limpar
              </Button>
            )}
            <div className="flex-1" />
            <ExportDropdown
              onCSV={() => { exportToCSV(transactionsToExportRows(filtered, type), `${isPagar ? 'contas-pagar' : 'contas-receber'}`); }}
              onExcel={() => { exportToExcel(transactionsToExportRows(filtered, type), `${isPagar ? 'contas-pagar' : 'contas-receber'}`); }}
              onPDF={() => {
                const rows = transactionsToExportRows(filtered, type);
                const headers = Object.keys(rows[0] || {});
                exportToPDF(isPagar ? 'Contas a Pagar' : 'Contas a Receber', headers, rows.map(r => headers.map(h => String(r[h] ?? ''))));
              }}
            />
            <AuditLogDrawer />
            <CustomCategoriesManager />
            <Button size="sm" onClick={() => { setEditingTx(null); setShowForm(true); }} className="h-8 gap-1.5 text-xs font-medium shadow-sm active:scale-95 transition-transform">
              <Plus className="w-3.5 h-3.5" />
              {isPagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
            </Button>
          </div>
        )}
      </motion.div>

      {/* ─── Content: Mobile cards vs Desktop table ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      >
        {isMobile ? (
          /* Mobile card list */
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filtered.map(tx => renderMobileCard(tx))}
            </AnimatePresence>
            {filtered.length === 0 && (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Search className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Nenhuma transação</p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" className="mt-3 text-xs h-7" onClick={clearFilters}>Limpar filtros</Button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Desktop table */
          <div className="card-elevated overflow-hidden">
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
                            <span className={cn('status-badge text-[10px]', `status-${tx.status}`, isConfirmed && isPagar && 'bg-success/10 text-success border-success/20')}>
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
                                {tx.notes && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{tx.notes}</p>}
                              </td>
                              <td className="px-3 py-3 max-w-[140px] truncate text-xs text-muted-foreground">{tx.counterpart || '—'}</td>
                              <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">{tx.category}</td>
                              <td className="px-3 py-3 text-xs hidden lg:table-cell">
                                {obraCode ? <Badge variant="outline" className="text-[10px] font-mono">{obraCode}</Badge> : <span className="text-muted-foreground/40">Corp.</span>}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-3 text-xs">
                                {obraCode ? (
                                  <Badge variant="outline" className="text-[10px] font-mono cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => { const obra = obras.find(o => o.id === tx.obraId); if (obra) setDetailObra(obra); }}>
                                    {obraCode}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] font-normal bg-accent/50 text-accent-foreground">Avulsa</Badge>
                                )}
                              </td>
                              <td className="px-3 py-3 max-w-[160px] truncate text-xs font-medium">
                                {tx.obraId ? (tx.counterpart || '—') : (
                                  <span className="flex items-center gap-1.5"><span>{tx.counterpart || tx.description || '—'}</span></span>
                                )}
                              </td>
                              <td className="px-3 py-3 max-w-[140px]">
                                {tx.obraId ? (
                                  <p className="text-xs truncate">{tx.category || tx.description}</p>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] font-normal border-dashed">{tx.category || 'Outros'}</Badge>
                                )}
                              </td>
                              <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                                {tx.paymentMethod ? (<span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />{tx.paymentMethod}</span>) : '—'}
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
                                  <p className="truncate flex items-center gap-1" title={tx.notes}><FileText className="w-3 h-3 shrink-0" />{tx.notes}</p>
                                ) : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-3 text-right">
                            <span className={cn('font-mono font-bold whitespace-nowrap text-xs', isPagar ? 'text-destructive' : 'text-success')}>
                              {isPagar ? '−' : '+'}{formatCurrency(tx.amount)}
                            </span>
                          </td>
                          <td className="pr-5 pl-3 py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              {tx.attachmentUrl && (
                                <a href={tx.attachmentUrl} target="_blank" rel="noopener noreferrer"><Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-primary/10" type="button"><Paperclip className="w-3.5 h-3.5 text-primary" /></Button></a>
                              )}
                              {!isPagar && !isConfirmed && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-primary/10 active:scale-90"
                                  title={tx.billingCount > 0 ? `Reenviar cobrança (atual: ${tx.billingCount})` : 'Marcar cobrança enviada'}
                                  onClick={() => { updateTransaction(tx.id, { billingSentAt: todayISO(), billingCount: (tx.billingCount || 0) + 1 }); }}>
                                  <Send className="w-3.5 h-3.5 text-primary" />
                                </Button>
                              )}
                              {!isConfirmed && (
                                 <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-success/10 active:scale-90"
                                   onClick={() => setConfirmTx(tx)}
                                   title={isPagar ? 'Confirmar pagamento' : 'Confirmar recebimento'}>
                                  <Check className="w-3.5 h-3.5 text-success" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover/row:opacity-100 transition-opacity active:scale-90"
                                onClick={() => { setEditingTx(tx); setShowForm(true); }}>
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-destructive/10 active:scale-90"
                                onClick={() => setDeleteConfirm(tx)}>
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
                    <Button variant="outline" size="sm" className="mt-3 text-xs h-7" onClick={clearFilters}>Limpar filtros</Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>

      <TransactionFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingTx(null); }}
        transaction={editingTx}
        defaultType={type}
      />

      <ObraDetailSheet obra={detailObra} onClose={() => setDetailObra(null)} />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir transação</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm?.description}</strong>?
              {deleteConfirm && (
                <span className="block mt-1 text-xs font-mono">Valor: {formatCurrency(deleteConfirm.amount)}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm payment/receivable modal */}
      <ConfirmPaymentDialog
        transaction={confirmTx}
        onClose={() => setConfirmTx(null)}
      />
    </div>
  );
}

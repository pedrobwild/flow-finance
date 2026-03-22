import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDate, formatDateFull, todayISO, daysBetween } from '@/lib/helpers';
import { Transaction } from '@/lib/types';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Phone, MessageCircle, Mail, FileText, ArrowRight, Clock,
  CheckCircle2, XCircle, RefreshCw, Loader2, Copy, Sparkles,
  TrendingDown, DollarSign, AlertTriangle, Calendar, Trash2,
  ChevronDown, ChevronUp, Wand2, Building2
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────
type NegotiationResult = 'pendente' | 'em_andamento' | 'acordo_fechado' | 'sem_acordo';

interface Negotiation {
  id: string;
  transactionId: string | null;
  counterpart: string;
  originalAmount: number;
  proposedAmount: number | null;
  originalDueDate: string | null;
  proposedDueDate: string | null;
  strategy: string;
  contactMethod: string;
  result: NegotiationResult;
  notes: string;
  contactedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface NegotiationScript {
  supplierProfile: string;
  recommendedApproach: string;
  scenarios: Array<{
    name: string;
    description: string;
    proposedAmount: number;
    proposedDate: string;
    savings: number;
    script: string;
    whatsappMessage: string;
    formalEmail?: string;
  }>;
  objections: Array<{ objection: string; response: string }>;
  tips: string[];
}

// ── Constants ──────────────────────────────────────────────
const COLUMNS: { key: NegotiationResult; label: string; icon: React.ElementType; colorClass: string }[] = [
  { key: 'pendente', label: 'Pendente', icon: Clock, colorClass: 'text-amber-500' },
  { key: 'em_andamento', label: 'Em Andamento', icon: RefreshCw, colorClass: 'text-primary' },
  { key: 'acordo_fechado', label: 'Acordo Fechado', icon: CheckCircle2, colorClass: 'text-emerald-500' },
  { key: 'sem_acordo', label: 'Sem Acordo', icon: XCircle, colorClass: 'text-destructive' },
];

const CONTACT_ICONS: Record<string, React.ElementType> = {
  telefone: Phone, whatsapp: MessageCircle, email: Mail,
};

const CONTACT_LABELS: Record<string, string> = {
  telefone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail',
};

function rowToNegotiation(row: any): Negotiation {
  return {
    id: row.id, transactionId: row.transaction_id, counterpart: row.counterpart,
    originalAmount: Number(row.original_amount), proposedAmount: row.proposed_amount ? Number(row.proposed_amount) : null,
    originalDueDate: row.original_due_date, proposedDueDate: row.proposed_due_date,
    strategy: row.strategy, contactMethod: row.contact_method,
    result: row.result as NegotiationResult, notes: row.notes || '',
    contactedAt: row.contacted_at, resolvedAt: row.resolved_at, createdAt: row.created_at,
  };
}

// ── Main Component ─────────────────────────────────────────
export default function Negociacoes() {
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingNeg, setEditingNeg] = useState<Negotiation | null>(null);
  const [scriptDrawerOpen, setScriptDrawerOpen] = useState(false);
  const [scriptTarget, setScriptTarget] = useState<Negotiation | null>(null);
  const [script, setScript] = useState<NegotiationScript | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [detailNeg, setDetailNeg] = useState<Negotiation | null>(null);

  const { transactions } = useFinance();
  const { obras } = useObras();

  const overduePayables = useMemo(
    () => transactions.filter(t => t.type === 'pagar' && (t.status === 'atrasado' || t.status === 'pendente')),
    [transactions]
  );

  const fetchNegotiations = useCallback(async () => {
    const { data, error } = await supabase.from('negotiations').select('*').order('created_at', { ascending: false });
    if (!error && data) setNegotiations(data.map(rowToNegotiation));
    setLoading(false);
  }, []);

  useEffect(() => { fetchNegotiations(); }, [fetchNegotiations]);

  // ── Grouped data ──
  const grouped = useMemo(() => {
    const map: Record<NegotiationResult, Negotiation[]> = {
      pendente: [], em_andamento: [], acordo_fechado: [], sem_acordo: [],
    };
    negotiations.forEach(n => { (map[n.result] || map.pendente).push(n); });
    return map;
  }, [negotiations]);

  // ── KPI metrics ──
  const metrics = useMemo(() => {
    const total = negotiations.length;
    const active = negotiations.filter(n => n.result === 'pendente' || n.result === 'em_andamento').length;
    const closed = negotiations.filter(n => n.result === 'acordo_fechado').length;
    const totalOriginal = negotiations.filter(n => n.result === 'acordo_fechado').reduce((s, n) => s + n.originalAmount, 0);
    const totalProposed = negotiations.filter(n => n.result === 'acordo_fechado' && n.proposedAmount !== null).reduce((s, n) => s + (n.proposedAmount || 0), 0);
    const savings = totalOriginal - totalProposed;
    const savingsRate = totalOriginal > 0 ? (savings / totalOriginal) * 100 : 0;
    const overdueNegAmount = negotiations.filter(n => n.result !== 'acordo_fechado' && n.result !== 'sem_acordo').reduce((s, n) => s + n.originalAmount, 0);
    return { total, active, closed, savings, savingsRate, overdueNegAmount };
  }, [negotiations]);

  // ── Actions ──
  async function moveToColumn(neg: Negotiation, newResult: NegotiationResult) {
    const updates: any = { result: newResult };
    if (newResult === 'em_andamento' && !neg.contactedAt) updates.contacted_at = new Date().toISOString();
    if (newResult === 'acordo_fechado' || newResult === 'sem_acordo') updates.resolved_at = new Date().toISOString();
    const { error } = await supabase.from('negotiations').update(updates).eq('id', neg.id);
    if (!error) {
      toast.success(`Negociação movida para "${COLUMNS.find(c => c.key === newResult)?.label}"`);
      fetchNegotiations();
    }
  }

  async function deleteNegotiation(id: string) {
    const { error } = await supabase.from('negotiations').delete().eq('id', id);
    if (!error) { toast.success('Negociação excluída'); fetchNegotiations(); }
  }

  async function handleSave(data: Partial<Negotiation>) {
    if (editingNeg) {
      const { error } = await supabase.from('negotiations').update({
        counterpart: data.counterpart, original_amount: data.originalAmount,
        proposed_amount: data.proposedAmount, original_due_date: data.originalDueDate,
        proposed_due_date: data.proposedDueDate, strategy: data.strategy,
        contact_method: data.contactMethod, notes: data.notes, result: data.result,
      }).eq('id', editingNeg.id);
      if (!error) { toast.success('Negociação atualizada'); fetchNegotiations(); }
    } else {
      const { error } = await supabase.from('negotiations').insert({
        counterpart: data.counterpart || '', original_amount: data.originalAmount || 0,
        proposed_amount: data.proposedAmount, original_due_date: data.originalDueDate,
        proposed_due_date: data.proposedDueDate, strategy: data.strategy || '',
        contact_method: data.contactMethod || 'telefone', notes: data.notes || '',
        result: data.result || 'pendente', transaction_id: data.transactionId || null,
      });
      if (!error) { toast.success('Negociação criada'); fetchNegotiations(); }
    }
    setFormOpen(false);
    setEditingNeg(null);
  }

  // ── AI Script Generation ──
  const generateScript = useCallback(async (neg: Negotiation) => {
    setScriptTarget(neg);
    setScriptDrawerOpen(true);
    setScript(null);
    setScriptLoading(true);

    // Find linked transaction for history context
    const linkedTx = neg.transactionId ? transactions.find(t => t.id === neg.transactionId) : null;
    const counterpartTxs = transactions.filter(t => t.counterpart === neg.counterpart);
    const txHistory = counterpartTxs.slice(0, 10).map(t => ({
      amount: t.amount, dueDate: t.dueDate, status: t.status, type: t.type,
      paidAt: t.paidAt, category: t.category,
    }));

    const daysOverdue = neg.originalDueDate ? daysBetween(neg.originalDueDate, todayISO()) : 0;

    try {
      const { data, error } = await supabase.functions.invoke('negotiation-script', {
        body: {
          counterpart: neg.counterpart,
          amount: neg.originalAmount,
          dueDate: neg.originalDueDate,
          daysOverdue: Math.max(0, daysOverdue),
          category: linkedTx?.category || 'Outros',
          transactionHistory: txHistory,
          companyContext: `Estratégia registrada: ${neg.strategy || 'Nenhuma'}. Método de contato preferido: ${CONTACT_LABELS[neg.contactMethod] || neg.contactMethod}. Notas: ${neg.notes || 'Nenhuma'}.`,
        },
      });
      if (error) throw error;
      setScript(data);
    } catch (err: any) {
      toast.error(`Erro ao gerar script: ${err.message}`);
    }
    setScriptLoading(false);
  }, [transactions]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência');
  };

  // ── Render ──
  return (
    <div className="space-y-5 pb-8">
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Negociações</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gerencie renegociações com fornecedores e clientes
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditingNeg(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nova Negociação
          </Button>
        </div>
      </motion.div>

      {/* ── KPI Strip ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            icon={FileText} label="Total" value={String(metrics.total)}
            sub={`${metrics.active} ativas`} colorClass="text-primary"
          />
          <KPICard
            icon={AlertTriangle} label="Em Negociação" value={formatCurrency(metrics.overdueNegAmount)}
            sub={`${metrics.active} transações`} colorClass="text-amber-500"
          />
          <KPICard
            icon={CheckCircle2} label="Acordos Fechados" value={String(metrics.closed)}
            sub={metrics.savings > 0 ? `Economia ${formatCurrency(metrics.savings)}` : 'Nenhuma economia'}
            colorClass="text-emerald-500"
          />
          <KPICard
            icon={TrendingDown} label="Taxa de Economia" value={`${metrics.savingsRate.toFixed(1)}%`}
            sub="sobre valor original" colorClass="text-primary"
          />
        </div>
      </motion.div>

      {/* ── Kanban Board ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-64 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.key}
                column={col}
                items={grouped[col.key]}
                onMove={moveToColumn}
                onEdit={neg => { setEditingNeg(neg); setFormOpen(true); }}
                onDelete={deleteNegotiation}
                onGenerateScript={generateScript}
                onViewDetail={neg => setDetailNeg(neg)}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Dialogs ── */}
      <NegotiationFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingNeg(null); }}
        onSave={handleSave}
        negotiation={editingNeg}
        overduePayables={overduePayables}
      />

      <NegotiationDetailSheet
        negotiation={detailNeg}
        onClose={() => setDetailNeg(null)}
        onEdit={neg => { setDetailNeg(null); setEditingNeg(neg); setFormOpen(true); }}
        onGenerateScript={generateScript}
        transactions={transactions}
        obras={obras}
      />

      <ScriptDrawer
        open={scriptDrawerOpen}
        onClose={() => { setScriptDrawerOpen(false); setScript(null); setScriptTarget(null); }}
        script={script}
        loading={scriptLoading}
        target={scriptTarget}
        onCopy={copyToClipboard}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function KPICard({ icon: Icon, label, value, sub, colorClass }: {
  icon: React.ElementType; label: string; value: string; sub: string; colorClass: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-lg font-bold">{value}</div>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function KanbanColumn({ column, items, onMove, onEdit, onDelete, onGenerateScript, onViewDetail }: {
  column: typeof COLUMNS[0];
  items: Negotiation[];
  onMove: (neg: Negotiation, target: NegotiationResult) => void;
  onEdit: (neg: Negotiation) => void;
  onDelete: (id: string) => void;
  onGenerateScript: (neg: Negotiation) => void;
  onViewDetail: (neg: Negotiation) => void;
}) {
  const Icon = column.icon;
  const totalAmount = items.reduce((s, n) => s + n.originalAmount, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className={`w-4 h-4 ${column.colorClass}`} />
        <span className="text-sm font-semibold">{column.label}</span>
        <Badge variant="outline" className="text-[10px] ml-auto">{items.length}</Badge>
      </div>
      {totalAmount > 0 && (
        <p className="text-[10px] text-muted-foreground px-1">{formatCurrency(totalAmount)}</p>
      )}
      <ScrollArea className="min-h-[160px] max-h-[60vh]">
        <div className="space-y-2 bg-muted/30 rounded-lg p-2">
          <AnimatePresence mode="popLayout">
            {items.map(neg => (
              <NegotiationCard
                key={neg.id}
                neg={neg}
                column={column.key}
                onMove={onMove}
                onEdit={onEdit}
                onDelete={onDelete}
                onGenerateScript={onGenerateScript}
                onViewDetail={onViewDetail}
              />
            ))}
          </AnimatePresence>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhuma negociação</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function NegotiationCard({ neg, column, onMove, onEdit, onDelete, onGenerateScript, onViewDetail }: {
  neg: Negotiation;
  column: NegotiationResult;
  onMove: (neg: Negotiation, target: NegotiationResult) => void;
  onEdit: (neg: Negotiation) => void;
  onDelete: (id: string) => void;
  onGenerateScript: (neg: Negotiation) => void;
  onViewDetail: (neg: Negotiation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ContactIcon = CONTACT_ICONS[neg.contactMethod] || Phone;
  const saving = neg.proposedAmount !== null ? neg.originalAmount - neg.proposedAmount : 0;
  const daysOverdue = neg.originalDueDate ? daysBetween(neg.originalDueDate, todayISO()) : 0;
  const isActive = column === 'pendente' || column === 'em_andamento';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
    >
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-3 space-y-1.5">
          {/* Header */}
          <div className="flex items-center justify-between cursor-pointer" onClick={() => onViewDetail(neg)}>
            <span className="text-sm font-medium truncate flex-1">{neg.counterpart}</span>
            <div className="flex items-center gap-1">
              <ContactIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}>
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {/* Value info */}
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">
              {formatCurrency(neg.originalAmount)}
            </span>
            {neg.proposedAmount !== null && (
              <span className="text-xs font-medium text-primary">
                → {formatCurrency(neg.proposedAmount)}
                {saving > 0 && <span className="text-emerald-600 ml-1">(-{formatCurrency(saving)})</span>}
              </span>
            )}
          </div>

          {/* Date and overdue */}
          {neg.originalDueDate && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{formatDate(neg.originalDueDate)}</span>
              {neg.proposedDueDate && (
                <>
                  <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className="text-primary">{formatDate(neg.proposedDueDate)}</span>
                </>
              )}
              {daysOverdue > 0 && isActive && (
                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 ml-auto">
                  {daysOverdue}d atraso
                </Badge>
              )}
            </div>
          )}

          {/* Strategy preview */}
          {neg.strategy && (
            <p className="text-[10px] text-muted-foreground truncate">
              💡 {neg.strategy}
            </p>
          )}

          {/* Expanded: actions */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <Separator className="my-1.5" />
                {neg.notes && <p className="text-[10px] text-muted-foreground mb-1.5">📝 {neg.notes}</p>}

                <div className="flex flex-wrap gap-1">
                  {/* Move actions */}
                  {isActive && COLUMNS.filter(c => c.key !== column).map(target => (
                    <Button key={target.key} variant="outline" size="sm" className="h-6 text-[10px] px-1.5"
                      onClick={e => { e.stopPropagation(); onMove(neg, target.key); }}>
                      <ArrowRight className="w-3 h-3 mr-0.5" /> {target.label}
                    </Button>
                  ))}

                  {/* AI Script */}
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-1.5"
                    onClick={e => { e.stopPropagation(); onGenerateScript(neg); }}>
                    <Wand2 className="w-3 h-3 mr-0.5" /> Script IA
                  </Button>

                  {/* Edit */}
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5"
                    onClick={e => { e.stopPropagation(); onEdit(neg); }}>
                    ✏️ Editar
                  </Button>

                  {/* Delete */}
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-destructive"
                    onClick={e => { e.stopPropagation(); onDelete(neg.id); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick actions when not expanded */}
          {!expanded && isActive && (
            <div className="flex gap-1 pt-0.5">
              <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1"
                onClick={e => { e.stopPropagation(); onGenerateScript(neg); }}>
                <Wand2 className="w-3 h-3 mr-0.5" /> Script
              </Button>
              {column === 'pendente' && (
                <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1"
                  onClick={e => { e.stopPropagation(); onMove(neg, 'em_andamento'); }}>
                  <ArrowRight className="w-3 h-3 mr-0.5" /> Iniciar
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Detail Sheet ──
function NegotiationDetailSheet({ negotiation, onClose, onEdit, onGenerateScript, transactions: allTxs, obras }: {
  negotiation: Negotiation | null;
  onClose: () => void;
  onEdit: (neg: Negotiation) => void;
  onGenerateScript: (neg: Negotiation) => void;
  transactions: Transaction[];
  obras: any[];
}) {
  if (!negotiation) return null;

  const linkedTx = negotiation.transactionId ? allTxs.find(t => t.id === negotiation.transactionId) : null;
  const counterpartHistory = allTxs.filter(t => t.counterpart === negotiation.counterpart).slice(0, 8);
  const linkedObra = linkedTx?.obraId ? obras.find(o => o.id === linkedTx.obraId) : null;
  const daysOverdue = negotiation.originalDueDate ? daysBetween(negotiation.originalDueDate, todayISO()) : 0;

  return (
    <Sheet open={!!negotiation} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {negotiation.counterpart}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground">Valor Original</p>
              <p className="text-sm font-bold">{formatCurrency(negotiation.originalAmount)}</p>
            </div>
            {negotiation.proposedAmount !== null && (
              <div className="bg-primary/5 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground">Valor Proposto</p>
                <p className="text-sm font-bold text-primary">{formatCurrency(negotiation.proposedAmount)}</p>
                {negotiation.originalAmount - negotiation.proposedAmount > 0 && (
                  <p className="text-[10px] text-emerald-600">
                    Economia: {formatCurrency(negotiation.originalAmount - negotiation.proposedAmount)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline">{COLUMNS.find(c => c.key === negotiation.result)?.label}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contato</span>
              <span>{CONTACT_LABELS[negotiation.contactMethod] || negotiation.contactMethod}</span>
            </div>
            {negotiation.originalDueDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vencimento</span>
                <span>{formatDateFull(negotiation.originalDueDate)}
                  {daysOverdue > 0 && <span className="text-destructive ml-1">({daysOverdue}d atraso)</span>}
                </span>
              </div>
            )}
            {negotiation.proposedDueDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nova Data</span>
                <span className="text-primary">{formatDateFull(negotiation.proposedDueDate)}</span>
              </div>
            )}
            {negotiation.strategy && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estratégia</span>
                <span className="text-right max-w-[60%]">{negotiation.strategy}</span>
              </div>
            )}
            {negotiation.contactedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contatado em</span>
                <span>{formatDateFull(negotiation.contactedAt.split('T')[0])}</span>
              </div>
            )}
            {negotiation.notes && (
              <div>
                <span className="text-muted-foreground">Notas:</span>
                <p className="mt-1 bg-muted/50 rounded p-2 text-xs">{negotiation.notes}</p>
              </div>
            )}
          </div>

          {/* Linked Transaction */}
          {linkedTx && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium mb-2">Transação Vinculada</p>
                <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-medium">{linkedTx.description}</p>
                  <p className="text-muted-foreground">{linkedTx.category} · {formatCurrency(linkedTx.amount)}</p>
                  {linkedObra && <p className="text-muted-foreground">Obra: {linkedObra.code}</p>}
                </div>
              </div>
            </>
          )}

          {/* Counterpart History */}
          {counterpartHistory.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium mb-2">Histórico com {negotiation.counterpart}</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {counterpartHistory.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between text-[10px] bg-muted/30 rounded px-2 py-1.5">
                      <div>
                        <span className="font-medium">{tx.description}</span>
                        <span className="text-muted-foreground ml-1">{formatDate(tx.dueDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>{formatCurrency(tx.amount)}</span>
                        <Badge variant={tx.status === 'confirmado' ? 'default' : tx.status === 'atrasado' ? 'destructive' : 'outline'} className="text-[8px] px-1 h-3.5">
                          {tx.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button size="sm" className="flex-1" onClick={() => onGenerateScript(negotiation)}>
              <Wand2 className="w-4 h-4 mr-1" /> Gerar Script IA
            </Button>
            <Button size="sm" variant="outline" onClick={() => onEdit(negotiation)}>
              ✏️ Editar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Script Drawer ──
function ScriptDrawer({ open, onClose, script, loading, target, onCopy }: {
  open: boolean;
  onClose: () => void;
  script: NegotiationScript | null;
  loading: boolean;
  target: Negotiation | null;
  onCopy: (text: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Script de Negociação {target && `· ${target.counterpart}`}
          </SheetTitle>
        </SheetHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando script de negociação com IA...</p>
          </div>
        )}

        {!loading && script && (
          <div className="space-y-4 mt-4">
            {/* Profile & Approach */}
            <div className="bg-primary/5 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium">Perfil do Fornecedor</p>
              <p className="text-xs text-muted-foreground">{script.supplierProfile}</p>
              <p className="text-xs font-medium mt-2">Abordagem Recomendada</p>
              <p className="text-xs text-muted-foreground">{script.recommendedApproach}</p>
            </div>

            {/* Scenarios */}
            <div>
              <p className="text-xs font-semibold mb-2">Cenários de Negociação</p>
              <Tabs defaultValue={script.scenarios[0]?.name || 'ideal'}>
                <TabsList className="w-full">
                  {script.scenarios.map(s => (
                    <TabsTrigger key={s.name} value={s.name} className="flex-1 text-[10px]">
                      {s.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {script.scenarios.map(scenario => (
                  <TabsContent key={scenario.name} value={scenario.name} className="space-y-3 mt-3">
                    <p className="text-xs text-muted-foreground">{scenario.description}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-muted/50 rounded p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Proposta</p>
                        <p className="text-xs font-bold">{formatCurrency(scenario.proposedAmount)}</p>
                      </div>
                      <div className="bg-muted/50 rounded p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Economia</p>
                        <p className="text-xs font-bold text-emerald-600">{formatCurrency(scenario.savings)}</p>
                      </div>
                      <div className="bg-muted/50 rounded p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Nova Data</p>
                        <p className="text-xs font-bold">{scenario.proposedDate}</p>
                      </div>
                    </div>

                    {/* Phone script */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span className="text-[10px] font-medium">Roteiro Telefônico</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => onCopy(scenario.script)}>
                          <Copy className="w-3 h-3 mr-0.5" /> Copiar
                        </Button>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-xs whitespace-pre-line max-h-40 overflow-y-auto">
                        {scenario.script}
                      </div>
                    </div>

                    {/* WhatsApp */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          <span className="text-[10px] font-medium">WhatsApp</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => onCopy(scenario.whatsappMessage)}>
                          <Copy className="w-3 h-3 mr-0.5" /> Copiar
                        </Button>
                      </div>
                      <div className="bg-emerald-500/5 rounded-lg p-3 text-xs whitespace-pre-line max-h-32 overflow-y-auto">
                        {scenario.whatsappMessage}
                      </div>
                    </div>

                    {/* Email */}
                    {scenario.formalEmail && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <span className="text-[10px] font-medium">E-mail Formal</span>
                          </div>
                          <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => onCopy(scenario.formalEmail!)}>
                            <Copy className="w-3 h-3 mr-0.5" /> Copiar
                          </Button>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-xs whitespace-pre-line max-h-40 overflow-y-auto">
                          {scenario.formalEmail}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* Objections */}
            {script.objections?.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2">Antecipação de Objeções</p>
                <div className="space-y-2">
                  {script.objections.map((obj, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-2.5 text-xs space-y-1">
                      <p className="font-medium text-destructive">❌ "{obj.objection}"</p>
                      <p className="text-muted-foreground">✅ {obj.response}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            {script.tips?.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2">Dicas Estratégicas</p>
                <ul className="space-y-1">
                  {script.tips.map((tip, i) => (
                    <li key={i} className="text-[10px] text-muted-foreground flex gap-1.5">
                      <span className="text-primary">💡</span> {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!loading && !script && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Não foi possível gerar o script</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Form Dialog ──
function NegotiationFormDialog({
  open, onClose, onSave, negotiation, overduePayables,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Negotiation>) => void;
  negotiation: Negotiation | null;
  overduePayables: Transaction[];
}) {
  const [counterpart, setCounterpart] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [proposedAmount, setProposedAmount] = useState('');
  const [originalDueDate, setOriginalDueDate] = useState('');
  const [proposedDueDate, setProposedDueDate] = useState('');
  const [strategy, setStrategy] = useState('');
  const [contactMethod, setContactMethod] = useState('telefone');
  const [result, setResult] = useState<NegotiationResult>('pendente');
  const [notes, setNotes] = useState('');
  const [transactionId, setTransactionId] = useState<string | null>(null);

  useEffect(() => {
    if (negotiation) {
      setCounterpart(negotiation.counterpart);
      setOriginalAmount(String(negotiation.originalAmount));
      setProposedAmount(negotiation.proposedAmount !== null ? String(negotiation.proposedAmount) : '');
      setOriginalDueDate(negotiation.originalDueDate || '');
      setProposedDueDate(negotiation.proposedDueDate || '');
      setStrategy(negotiation.strategy);
      setContactMethod(negotiation.contactMethod);
      setResult(negotiation.result);
      setNotes(negotiation.notes);
      setTransactionId(negotiation.transactionId);
    } else {
      setCounterpart(''); setOriginalAmount(''); setProposedAmount('');
      setOriginalDueDate(''); setProposedDueDate(''); setStrategy('');
      setContactMethod('telefone'); setResult('pendente'); setNotes('');
      setTransactionId(null);
    }
  }, [negotiation, open]);

  function handleSelectTransaction(txId: string) {
    const tx = overduePayables.find(t => t.id === txId);
    if (tx) {
      setTransactionId(txId);
      setCounterpart(tx.counterpart);
      setOriginalAmount(String(tx.amount));
      setOriginalDueDate(tx.dueDate);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{negotiation ? 'Editar Negociação' : 'Nova Negociação'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!negotiation && overduePayables.length > 0 && (
            <div>
              <Label className="text-xs">Vincular a transação</Label>
              <Select value={transactionId || ''} onValueChange={handleSelectTransaction}>
                <SelectTrigger><SelectValue placeholder="Selecionar transação..." /></SelectTrigger>
                <SelectContent>
                  {overduePayables.map(tx => (
                    <SelectItem key={tx.id} value={tx.id}>
                      {tx.counterpart} - {formatCurrency(tx.amount)} ({tx.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Contraparte</Label>
            <Input value={counterpart} onChange={e => setCounterpart(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Valor Original</Label>
              <Input type="number" value={originalAmount} onChange={e => setOriginalAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Valor Proposto</Label>
              <Input type="number" value={proposedAmount} onChange={e => setProposedAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Vencimento Original</Label>
              <Input type="date" value={originalDueDate} onChange={e => setOriginalDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Vencimento Proposto</Label>
              <Input type="date" value={proposedDueDate} onChange={e => setProposedDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Método de Contato</Label>
              <Select value={contactMethod} onValueChange={setContactMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={result} onValueChange={v => setResult(v as NegotiationResult)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Estratégia</Label>
            <Input value={strategy} onChange={e => setStrategy(e.target.value)} placeholder="Ex: Parcelamento em 3x, desconto à vista" />
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave({
            counterpart, originalAmount: Number(originalAmount) || 0,
            proposedAmount: proposedAmount ? Number(proposedAmount) : null,
            originalDueDate: originalDueDate || null, proposedDueDate: proposedDueDate || null,
            strategy, contactMethod, result, notes, transactionId,
          })}>
            {negotiation ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatDate, todayISO, daysBetween } from '@/lib/helpers';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Phone, MessageCircle, Mail, FileText, ArrowRight, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

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

const COLUMNS: { key: NegotiationResult; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'pendente', label: 'Pendente', icon: Clock, color: 'text-amber-500' },
  { key: 'em_andamento', label: 'Em Andamento', icon: RefreshCw, color: 'text-primary' },
  { key: 'acordo_fechado', label: 'Acordo Fechado', icon: CheckCircle2, color: 'text-emerald-500' },
  { key: 'sem_acordo', label: 'Sem Acordo', icon: XCircle, color: 'text-destructive' },
];

const CONTACT_ICONS: Record<string, React.ElementType> = {
  telefone: Phone,
  whatsapp: MessageCircle,
  email: Mail,
};

function rowToNegotiation(row: any): Negotiation {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    counterpart: row.counterpart,
    originalAmount: Number(row.original_amount),
    proposedAmount: row.proposed_amount ? Number(row.proposed_amount) : null,
    originalDueDate: row.original_due_date,
    proposedDueDate: row.proposed_due_date,
    strategy: row.strategy,
    contactMethod: row.contact_method,
    result: row.result as NegotiationResult,
    notes: row.notes || '',
    contactedAt: row.contacted_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export default function Negociacoes() {
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingNeg, setEditingNeg] = useState<Negotiation | null>(null);
  const { transactions } = useFinance();
  const { obras } = useObras();

  const overduePayables = useMemo(
    () => transactions.filter(t => t.type === 'pagar' && t.status === 'atrasado'),
    [transactions]
  );

  async function fetchNegotiations() {
    const { data, error } = await supabase.from('negotiations').select('*').order('created_at', { ascending: false });
    if (!error && data) setNegotiations(data.map(rowToNegotiation));
    setLoading(false);
  }

  useEffect(() => { fetchNegotiations(); }, []);

  const grouped = useMemo(() => {
    const map: Record<NegotiationResult, Negotiation[]> = {
      pendente: [], em_andamento: [], acordo_fechado: [], sem_acordo: [],
    };
    negotiations.forEach(n => {
      if (map[n.result]) map[n.result].push(n);
      else map.pendente.push(n);
    });
    return map;
  }, [negotiations]);

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

  async function handleSave(data: Partial<Negotiation>) {
    if (editingNeg) {
      const { error } = await supabase.from('negotiations').update({
        counterpart: data.counterpart,
        original_amount: data.originalAmount,
        proposed_amount: data.proposedAmount,
        original_due_date: data.originalDueDate,
        proposed_due_date: data.proposedDueDate,
        strategy: data.strategy,
        contact_method: data.contactMethod,
        notes: data.notes,
        result: data.result,
      }).eq('id', editingNeg.id);
      if (!error) { toast.success('Negociação atualizada'); fetchNegotiations(); }
    } else {
      const { error } = await supabase.from('negotiations').insert({
        counterpart: data.counterpart || '',
        original_amount: data.originalAmount || 0,
        proposed_amount: data.proposedAmount,
        original_due_date: data.originalDueDate,
        proposed_due_date: data.proposedDueDate,
        strategy: data.strategy || '',
        contact_method: data.contactMethod || 'telefone',
        notes: data.notes || '',
        result: data.result || 'pendente',
        transaction_id: data.transactionId || null,
      });
      if (!error) { toast.success('Negociação criada'); fetchNegotiations(); }
    }
    setFormOpen(false);
    setEditingNeg(null);
  }

  const totalSavings = useMemo(() => {
    return negotiations
      .filter(n => n.result === 'acordo_fechado' && n.proposedAmount !== null)
      .reduce((sum, n) => sum + (n.originalAmount - (n.proposedAmount || 0)), 0);
  }, [negotiations]);

  return (
    <div className="space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Negociações</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gerencie renegociações com fornecedores e clientes
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalSavings > 0 && (
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                Economia: {formatCurrency(totalSavings)}
              </Badge>
            )}
            <Button size="sm" onClick={() => { setEditingNeg(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Nova Negociação
            </Button>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {COLUMNS.map(col => {
            const Icon = col.icon;
            const items = grouped[col.key];
            return (
              <div key={col.key} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Icon className={`w-4 h-4 ${col.color}`} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="outline" className="text-xs ml-auto">{items.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[120px] bg-muted/30 rounded-lg p-2">
                  <AnimatePresence>
                    {items.map(neg => {
                      const ContactIcon = CONTACT_ICONS[neg.contactMethod] || Phone;
                      const saving = neg.proposedAmount !== null ? neg.originalAmount - neg.proposedAmount : 0;
                      return (
                        <motion.div
                          key={neg.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                        >
                          <Card
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => { setEditingNeg(neg); setFormOpen(true); }}
                          >
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium truncate">{neg.counterpart}</span>
                                <ContactIcon className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Original: {formatCurrency(neg.originalAmount)}
                              </div>
                              {neg.proposedAmount !== null && (
                                <div className="text-xs">
                                  Proposta: <span className="font-medium text-primary">{formatCurrency(neg.proposedAmount)}</span>
                                  {saving > 0 && (
                                    <span className="text-emerald-600 ml-1">(-{formatCurrency(saving)})</span>
                                  )}
                                </div>
                              )}
                              {neg.originalDueDate && (
                                <div className="text-xs text-muted-foreground">
                                  Venc.: {formatDate(neg.originalDueDate)}
                                  {neg.proposedDueDate && ` → ${formatDate(neg.proposedDueDate)}`}
                                </div>
                              )}
                              {col.key !== 'acordo_fechado' && col.key !== 'sem_acordo' && (
                                <div className="flex gap-1 pt-1">
                                  {COLUMNS.filter(c => c.key !== col.key && c.key !== 'pendente').map(target => (
                                    <Button
                                      key={target.key}
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] px-1.5"
                                      onClick={e => { e.stopPropagation(); moveToColumn(neg, target.key); }}
                                    >
                                      <ArrowRight className="w-3 h-3 mr-0.5" />
                                      {target.label.split(' ')[0]}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">Nenhuma negociação</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NegotiationFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingNeg(null); }}
        onSave={handleSave}
        negotiation={editingNeg}
        overduePayables={overduePayables}
      />
    </div>
  );
}

function NegotiationFormDialog({
  open, onClose, onSave, negotiation, overduePayables,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Negotiation>) => void;
  negotiation: Negotiation | null;
  overduePayables: any[];
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
              <Label className="text-xs">Vincular a transação atrasada</Label>
              <Select value={transactionId || ''} onValueChange={handleSelectTransaction}>
                <SelectTrigger><SelectValue placeholder="Selecionar transação..." /></SelectTrigger>
                <SelectContent>
                  {overduePayables.map(tx => (
                    <SelectItem key={tx.id} value={tx.id}>
                      {tx.counterpart} - {formatCurrency(tx.amount)}
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
            <Input value={strategy} onChange={e => setStrategy(e.target.value)} placeholder="Ex: Parcelamento em 3x" />
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave({
            counterpart,
            originalAmount: Number(originalAmount) || 0,
            proposedAmount: proposedAmount ? Number(proposedAmount) : null,
            originalDueDate: originalDueDate || null,
            proposedDueDate: proposedDueDate || null,
            strategy,
            contactMethod,
            result,
            notes,
            transactionId,
          })}>
            {negotiation ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

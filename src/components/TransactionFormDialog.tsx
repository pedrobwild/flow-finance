import { useState, useEffect, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import {
  Transaction, TransactionType, STATUS_OPTIONS, PRIORITY_OPTIONS, COST_CENTERS,
  RECURRENCE_OPTIONS, PAGAR_CATEGORIES, RECEBER_CATEGORIES, PAYMENT_METHODS,
  STATUS_LABELS, PRIORITY_LABELS,
} from '@/lib/types';
import { todayISO } from '@/lib/helpers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  defaultType: TransactionType;
}

const empty = (type: TransactionType) => ({
  type,
  description: '',
  counterpart: '',
  amount: '',
  dueDate: todayISO(),
  paidAt: '',
  status: 'pendente' as const,
  costCenter: 'OPEX' as const,
  obra: '',
  category: 'Outros',
  recurrence: 'única' as const,
  paymentMethod: '_none',
  notes: '',
  priority: 'normal' as const,
});

export default function TransactionFormDialog({ open, onClose, transaction, defaultType }: Props) {
  const { addTransaction, updateTransaction, transactions } = useFinance();
  const isEdit = !!transaction;
  const [form, setForm] = useState(empty(defaultType));
  const [obraModalOpen, setObraModalOpen] = useState(false);

  const existingObras = useMemo(() => {
    const obrasSet = new Set(
      transactions
        .filter(t => t.type === 'pagar' && t.costCenter === 'OPEX' && t.notes)
        .map(t => {
          const match = t.notes.match(/\[Obra: (.+?)\]/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[]
    );
    return Array.from(obrasSet).sort();
  }, [transactions]);

  useEffect(() => {
    if (transaction) {
      const obraMatch = transaction.notes.match(/\[Obra: (.+?)\]/);
      setForm({
        type: transaction.type,
        description: transaction.description,
        counterpart: transaction.counterpart,
        amount: transaction.amount.toString(),
        dueDate: transaction.dueDate,
        paidAt: transaction.paidAt || '',
        status: transaction.status as any,
        costCenter: transaction.costCenter as any,
        obra: obraMatch ? obraMatch[1] : '',
        category: transaction.category,
        recurrence: transaction.recurrence as any,
        paymentMethod: transaction.paymentMethod || '_none',
        notes: transaction.notes.replace(/\s*\[Obra: .+?\]/, ''),
        priority: transaction.priority as any,
      });
    } else {
      setForm(empty(defaultType));
    }
  }, [transaction, open, defaultType]);

  const set = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    if (key === 'costCenter' && value === 'OPEX') {
      setObraModalOpen(true);
    }
  };
  const categories = form.type === 'pagar' ? PAGAR_CATEGORIES : RECEBER_CATEGORIES;
  const cLabel = form.type === 'pagar' ? 'Fornecedor' : 'Obra / Cliente';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const notesWithObra = form.costCenter === 'OPEX' && form.obra
      ? `${form.notes}${form.notes ? ' ' : ''}[Obra: ${form.obra}]`
      : form.notes;
    const data = {
      type: form.type as TransactionType,
      description: form.description,
      counterpart: form.counterpart,
      amount: parseFloat(form.amount) || 0,
      dueDate: form.dueDate,
      paidAt: form.paidAt || null,
      status: form.status as any,
      costCenter: form.costCenter as any,
      category: form.category,
      recurrence: form.recurrence as any,
      paymentMethod: (form.paymentMethod === '_none' ? '' : form.paymentMethod) as any,
      notes: notesWithObra,
      priority: form.priority as any,
    };
    if (isEdit && transaction) {
      updateTransaction(transaction.id, data);
    } else {
      addTransaction(data);
    }
    onClose();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar transação' : form.type === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Input value={form.description} onChange={e => set('description', e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs">{cLabel}</Label>
              <Input value={form.counterpart} onChange={e => set('counterpart', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs">Vencimento</Label>
              <Input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={form.priority} onValueChange={v => set('priority', v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.type === 'pagar' && (
              <div>
                <Label className="text-xs">Centro de Custo</Label>
                <Select value={form.costCenter} onValueChange={v => set('costCenter', v)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COST_CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.costCenter === 'OPEX' && form.obra && (
                  <button
                    type="button"
                    onClick={() => setObraModalOpen(true)}
                    className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Building2 className="h-3 w-3" />
                    Obra: {form.obra}
                  </button>
                )}
              </div>
            )}
            <div>
              {form.type === 'receber' ? (
                <>
                  <Label className="text-xs">Parcela</Label>
                  <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="Ex: 3/6, Sinal, Medição 2" />
                </>
              ) : (
                <>
                  <Label className="text-xs">Categoria</Label>
                  <Select value={form.category} onValueChange={v => set('category', v)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            <div>
              <Label className="text-xs">Recorrência</Label>
              <Select value={form.recurrence} onValueChange={v => set('recurrence', v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Método de pagamento</Label>
              <Select value={form.paymentMethod} onValueChange={v => set('paymentMethod', v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Não informado</SelectItem>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{form.type === 'pagar' ? 'Pago em' : 'Recebido em'}</Label>
              <Input type="date" value={form.paidAt} onChange={e => set('paidAt', e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{isEdit ? 'Salvar' : 'Criar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {/* Modal de seleção de Obra para OPEX */}
    <Dialog open={obraModalOpen} onOpenChange={setObraModalOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Selecionar Obra
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Obra destino da despesa</Label>
            <Input
              value={form.obra}
              onChange={e => setForm(f => ({ ...f, obra: e.target.value }))}
              placeholder="Ex: Reforma Apt 302 — Vila Madalena"
              autoFocus
            />
          </div>
          {existingObras.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Obras anteriores</Label>
              <div className="flex flex-wrap gap-1.5">
                {existingObras.map(obra => (
                  <button
                    key={obra}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, obra }))}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      form.obra === obra
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                    }`}
                  >
                    {obra}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setForm(f => ({ ...f, obra: '' })); setObraModalOpen(false); }}>
              Pular
            </Button>
            <Button type="button" size="sm" onClick={() => setObraModalOpen(false)} disabled={!form.obra}>
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

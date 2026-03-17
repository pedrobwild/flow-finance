import { useState, useEffect } from 'react';
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
  costCenter: 'Operação' as const,
  category: 'Outros',
  recurrence: 'única' as const,
  paymentMethod: '_none',
  notes: '',
  priority: 'normal' as const,
});

export default function TransactionFormDialog({ open, onClose, transaction, defaultType }: Props) {
  const { addTransaction, updateTransaction } = useFinance();
  const isEdit = !!transaction;
  const [form, setForm] = useState(empty(defaultType));

  useEffect(() => {
    if (transaction) {
      setForm({
        type: transaction.type,
        description: transaction.description,
        counterpart: transaction.counterpart,
        amount: transaction.amount.toString(),
        dueDate: transaction.dueDate,
        paidAt: transaction.paidAt || '',
        status: transaction.status as any,
        costCenter: transaction.costCenter as any,
        category: transaction.category,
        recurrence: transaction.recurrence as any,
        paymentMethod: transaction.paymentMethod || '_none',
        notes: transaction.notes,
        priority: transaction.priority as any,
      });
    } else {
      setForm(empty(defaultType));
    }
  }, [transaction, open, defaultType]);

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));
  const categories = form.type === 'pagar' ? PAGAR_CATEGORIES : RECEBER_CATEGORIES;
  const cLabel = form.type === 'pagar' ? 'Fornecedor' : 'Cliente';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      notes: form.notes,
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
            <div>
              {form.type === 'pagar' && ['Materiais de Obra', 'Mão de Obra Terceirizada'].includes(form.category) ? (
                <>
                  <Label className="text-xs">Obra</Label>
                  <Input value={form.costCenter} onChange={e => set('costCenter', e.target.value)} placeholder="Ex: Reforma Apt 302 — Vila Madalena" />
                </>
              ) : (
                <>
                  <Label className="text-xs">Centro de Custo</Label>
                  <Select value={form.costCenter} onValueChange={v => set('costCenter', v)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COST_CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
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
  );
}

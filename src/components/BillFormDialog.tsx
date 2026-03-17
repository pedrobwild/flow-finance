import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bill, COST_CENTERS, STATUS_OPTIONS, STATUS_LABELS, RECURRENCE_OPTIONS, CATEGORIES } from '@/lib/types';
import { useBills } from '@/lib/bills-context';

interface Props {
  open: boolean;
  onClose: () => void;
  bill: Bill | null;
}

export default function BillFormDialog({ open, onClose, bill }: Props) {
  const { addBill, updateBill } = useBills();
  const isEdit = !!bill;

  const [form, setForm] = useState({
    description: '',
    supplier: '',
    amount: '',
    dueDate: '',
    paidAt: '',
    status: 'pendente' as Bill['status'],
    costCenter: 'Operação' as Bill['costCenter'],
    category: 'Outros',
    recurrence: 'única' as Bill['recurrence'],
    notes: '',
  });

  useEffect(() => {
    if (bill) {
      setForm({
        description: bill.description,
        supplier: bill.supplier,
        amount: bill.amount.toString(),
        dueDate: bill.dueDate,
        paidAt: bill.paidAt || '',
        status: bill.status,
        costCenter: bill.costCenter,
        category: bill.category,
        recurrence: bill.recurrence,
        notes: bill.notes,
      });
    } else {
      setForm({
        description: '',
        supplier: '',
        amount: '',
        dueDate: new Date().toISOString().split('T')[0],
        paidAt: '',
        status: 'pendente',
        costCenter: 'Operação',
        category: 'Outros',
        recurrence: 'única',
        notes: '',
      });
    }
  }, [bill, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      description: form.description,
      supplier: form.supplier,
      amount: parseFloat(form.amount) || 0,
      dueDate: form.dueDate,
      paidAt: form.paidAt || null,
      status: form.status,
      costCenter: form.costCenter,
      category: form.category,
      recurrence: form.recurrence,
      notes: form.notes,
    };

    if (isEdit && bill) {
      updateBill(bill.id, data);
    } else {
      addBill(data);
    }
    onClose();
  };

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar conta' : 'Nova conta a pagar'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="description">Descrição</Label>
              <Input id="description" value={form.description} onChange={e => set('description', e.target.value)} required placeholder="Ex: Aluguel escritório" />
            </div>
            <div>
              <Label htmlFor="supplier">Fornecedor</Label>
              <Input id="supplier" value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Ex: WeWork" />
            </div>
            <div>
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input id="amount" type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required placeholder="0,00" />
            </div>
            <div>
              <Label htmlFor="dueDate">Vencimento</Label>
              <Input id="dueDate" type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="costCenter">Centro de custo</Label>
              <Select value={form.costCenter} onValueChange={v => set('costCenter', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COST_CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="category">Categoria</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="recurrence">Recorrência</Label>
              <Select value={form.recurrence} onValueChange={v => set('recurrence', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="paidAt">Pago em</Label>
              <Input id="paidAt" type="date" value={form.paidAt} onChange={e => set('paidAt', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Opcional" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{isEdit ? 'Salvar' : 'Cadastrar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

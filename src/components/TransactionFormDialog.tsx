import { useState, useEffect, useRef } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import {
  Transaction, TransactionType, STATUS_OPTIONS, PRIORITY_OPTIONS, COST_CENTERS,
  RECURRENCE_OPTIONS, PAGAR_CATEGORIES, RECEBER_CATEGORIES, PAYMENT_METHODS,
  STATUS_LABELS, PRIORITY_LABELS, ObraStatus,
} from '@/lib/types';
import { todayISO } from '@/lib/helpers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Upload, X, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCustomCategories } from './CustomCategoriesManager';
import { toast } from 'sonner';

interface PrefillData {
  description?: string;
  counterpart?: string;
  amount?: number;
  category?: string;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  defaultType: TransactionType;
  defaultObraId?: string;
  prefill?: PrefillData;
}

const ACTIVE_OBRA_STATUSES: ObraStatus[] = ['ativa'];

const empty = (type: TransactionType, obraId?: string) => ({
  type,
  description: '',
  counterpart: '',
  amount: '',
  dueDate: todayISO(),
  paidAt: '',
  status: 'pendente' as const,
  costCenter: 'Operação' as const,
  obraId: obraId || '',
  category: 'Outros',
  recurrence: 'única' as const,
  paymentMethod: '_none',
  notes: '',
  priority: 'normal' as const,
  billingSentAt: '',
});

export default function TransactionFormDialog({ open, onClose, transaction, defaultType, defaultObraId, prefill }: Props) {
  const { addTransaction, updateTransaction } = useFinance();
  const { obras } = useObras();
  const { data: customCategories = [] } = useCustomCategories();
  const isEdit = !!transaction;
  const [form, setForm] = useState(empty(defaultType, defaultObraId));
  const [uploading, setUploading] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeObras = obras.filter(o => ACTIVE_OBRA_STATUSES.includes(o.status));

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
        obraId: (transaction as any).obraId || '',
        category: transaction.category,
        recurrence: transaction.recurrence as any,
        paymentMethod: transaction.paymentMethod || '_none',
        notes: transaction.notes,
        priority: transaction.priority as any,
        billingSentAt: transaction.billingSentAt || '',
      });
      setAttachmentUrl(transaction.attachmentUrl || null);
    } else {
      const init = empty(defaultType, defaultObraId);
      if (defaultObraId) {
        const obra = obras.find(o => o.id === defaultObraId);
        if (obra && defaultType === 'receber') {
          init.counterpart = `${obra.clientName}${obra.condominium ? ` — ${obra.condominium}` : ''}${obra.unitNumber ? ` un. ${obra.unitNumber}` : ''}`;
        }
      }
      if (prefill) {
        if (prefill.description) init.description = prefill.description;
        if (prefill.counterpart) init.counterpart = prefill.counterpart;
        if (prefill.amount) init.amount = prefill.amount.toString();
        if (prefill.category) init.category = prefill.category;
        if (prefill.notes) init.notes = prefill.notes;
      }
      setForm(init);
      setAttachmentUrl(null);
    }
  }, [transaction, open, defaultType, defaultObraId, obras, prefill]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx. 10MB)');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('attachments').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      setAttachmentUrl(urlData.publicUrl);
      toast.success('Comprovante anexado');
    } catch {
      toast.error('Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const set = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const handleObraSelect = (obraId: string) => {
    setForm(f => {
      const obra = obras.find(o => o.id === obraId);
      const updates: any = { ...f, obraId };
      if (obra && f.type === 'receber') {
        updates.counterpart = `${obra.clientName}${obra.condominium ? ` — ${obra.condominium}` : ''}${obra.unitNumber ? ` un. ${obra.unitNumber}` : ''}`;
      }
      return updates;
    });
  };

  const customCatsForType = customCategories.filter(c => c.type === form.type).map(c => c.name);
  const categories = [...(form.type === 'pagar' ? PAGAR_CATEGORIES : RECEBER_CATEGORIES), ...customCatsForType];
  const cLabel = form.type === 'pagar' ? 'Fornecedor' : (form.obraId ? 'Obra / Cliente' : 'Origem / Pagador');
  const isObraReceber = form.type === 'receber' && !!form.obraId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // For receber with obra, use parcela (category) as description; without obra, use description field
    const description = form.type === 'receber' && form.obraId
      ? form.category || form.description || 'Parcela'
      : form.description || form.category;
    const data: any = {
      type: form.type as TransactionType,
      description,
      counterpart: form.counterpart,
      amount: parseFloat(form.amount) || 0,
      dueDate: form.dueDate,
      paidAt: form.paidAt || null,
      status: form.status,
      costCenter: form.costCenter,
      category: form.category,
      recurrence: form.recurrence,
      paymentMethod: form.paymentMethod === '_none' ? '' : form.paymentMethod,
      notes: form.notes,
      priority: form.type === 'receber' ? 'normal' : form.priority,
      obraId: form.obraId || null,
      billingSentAt: form.billingSentAt || null,
      attachmentUrl: attachmentUrl || null,
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
            {/* For pagar: description first */}
            {form.type === 'pagar' && (
              <div className="col-span-2">
                <Label className="text-xs">Descrição</Label>
                <Input value={form.description} onChange={e => set('description', e.target.value)} required />
              </div>
            )}

            {/* Obra selector */}
            <div className="col-span-2">
              <Label className="text-xs flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Obra
              </Label>
              <Select value={form.obraId || '_none'} onValueChange={v => handleObraSelect(v === '_none' ? '' : v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecionar obra..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem obra vinculada</SelectItem>
                  {activeObras.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      <span className="font-mono text-xs text-primary mr-2">{o.code}</span>
                      {o.clientName}
                      {o.condominium ? ` — ${o.condominium}` : ''}
                      {o.unitNumber ? ` un. ${o.unitNumber}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cliente (counterpart) */}
            <div className={form.type === 'receber' ? 'col-span-2' : ''}>
              <Label className="text-xs">{cLabel}</Label>
              <Input
                value={form.counterpart}
                onChange={e => set('counterpart', e.target.value)}
                readOnly={isObraReceber}
                className={isObraReceber ? 'bg-muted/50' : ''}
                placeholder={form.type === 'receber' && !form.obraId ? 'Ex: Banco, Investidor, Empresa...' : ''}
              />
            </div>

            {/* For receber: Parcela field prominently */}
            {form.type === 'receber' && form.obraId && (
              <div className="col-span-2">
                <Label className="text-xs">Parcela *</Label>
                <Input
                  value={form.category}
                  onChange={e => set('category', e.target.value)}
                  placeholder="Ex: Sinal, 1ª Medição, Entrega Final..."
                  required
                />
              </div>
            )}
            {form.type === 'receber' && !form.obraId && (
              <>
                <div className="col-span-2">
                  <Label className="text-xs">Descrição *</Label>
                  <Input
                    value={form.description}
                    onChange={e => set('description', e.target.value)}
                    placeholder="Ex: Rendimento aplicação, Estorno cartão..."
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Categoria</Label>
                  <Select value={form.category} onValueChange={v => set('category', v)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div>
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs">Vencimento *</Label>
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
            {form.type === 'pagar' && (
              <div>
                <Label className="text-xs">Prioridade</Label>
                <Select value={form.priority} onValueChange={v => set('priority', v)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.type === 'pagar' && (
              <div>
                <Label className="text-xs">Centro de Custo</Label>
                <Select value={form.costCenter} onValueChange={v => set('costCenter', v)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COST_CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.type === 'pagar' && (
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={form.category} onValueChange={v => set('category', v)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Forma de Pagamento</Label>
              <Select value={form.paymentMethod} onValueChange={v => set('paymentMethod', v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Não informado</SelectItem>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.type === 'pagar' && (
              <div>
                <Label className="text-xs">Recorrência</Label>
                <Select value={form.recurrence} onValueChange={v => set('recurrence', v)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">{form.type === 'pagar' ? 'Pago em' : 'Recebido em'}</Label>
              <Input type="date" value={form.paidAt} onChange={e => set('paidAt', e.target.value)} />
            </div>
            {form.type === 'receber' && (
              <div>
                <Label className="text-xs">Cobrança enviada em</Label>
                <Input type="date" value={form.billingSentAt} onChange={e => set('billingSentAt', e.target.value)} />
              </div>
            )}
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

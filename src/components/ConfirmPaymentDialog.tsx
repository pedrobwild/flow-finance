import { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction } from '@/lib/types';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Building2, AlertTriangle, Paperclip, FileUp, X as XIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ObraAllocation {
  obraId: string;
  amount: string;
}

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
}

export default function ConfirmPaymentDialog({ transaction, onClose }: Props) {
  const { confirmTransaction, addTransactions, deleteTransaction } = useFinance();
  const { obras } = useObras();
  const activeObras = useMemo(() => obras.filter(o => o.status === 'ativa'), [obras]);

  const [actualAmount, setActualAmount] = useState('');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [allocations, setAllocations] = useState<ObraAllocation[]>([]);
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [nfUploading, setNfUploading] = useState(false);
  const nfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (transaction) {
      setActualAmount(transaction.amount.toString());
      setPaidAt(todayISO());
      setSplitEnabled(false);
      setNfFile(null);
      if (transaction.obraId) {
        setAllocations([{ obraId: transaction.obraId, amount: transaction.amount.toString() }]);
      } else {
        setAllocations([{ obraId: '', amount: '' }]);
      }
    }
  }, [transaction]);

  const totalAllocated = useMemo(
    () => allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0),
    [allocations]
  );

  const totalAmount = parseFloat(actualAmount) || 0;
  const remaining = Math.round((totalAmount - totalAllocated) * 100) / 100;
  const isBalanced = Math.abs(remaining) < 0.01;

  const usedObraIds = new Set(allocations.map(a => a.obraId).filter(Boolean));

  const addAllocation = () => {
    setAllocations(prev => [...prev, { obraId: '', amount: '' }]);
  };

  const removeAllocation = (index: number) => {
    setAllocations(prev => prev.filter((_, i) => i !== index));
  };

  const updateAllocation = (index: number, field: keyof ObraAllocation, value: string) => {
    setAllocations(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  // Auto-fill remaining amount on last allocation
  const fillRemaining = (index: number) => {
    const otherTotal = allocations.reduce((sum, a, i) => i !== index ? sum + (parseFloat(a.amount) || 0) : sum, 0);
    const rest = Math.round((totalAmount - otherTotal) * 100) / 100;
    if (rest > 0) {
      updateAllocation(index, 'amount', rest.toString());
    }
  };

  const uploadNf = async (): Promise<string | null> => {
    if (!nfFile) return null;
    setNfUploading(true);
    try {
      const ext = nfFile.name.split('.').pop() || 'pdf';
      const path = `nf/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('attachments').upload(path, nfFile);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      return urlData.publicUrl;
    } catch (err) {
      toast.error('Erro ao enviar nota fiscal');
      return null;
    } finally {
      setNfUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!transaction) return;

    const nfUrl = await uploadNf();

    if (!splitEnabled) {
      confirmTransaction(transaction.id, totalAmount, transaction.type, paidAt);
      if (nfUrl) {
        updateTransaction(transaction.id, { attachmentUrl: nfUrl });
      }
      onClose();
      return;
    }

    const validAllocations = allocations.filter(a => a.obraId && parseFloat(a.amount) > 0);
    if (validAllocations.length === 0 || !isBalanced) return;

    const newTxs = validAllocations.map(a => {
      const obra = obras.find(o => o.id === a.obraId);
      return {
        type: transaction.type,
        description: transaction.description,
        counterpart: transaction.counterpart,
        amount: parseFloat(a.amount),
        dueDate: transaction.dueDate,
        paidAt: paidAt,
        status: 'confirmado' as const,
        costCenter: transaction.costCenter,
        category: transaction.category,
        recurrence: transaction.recurrence,
        paymentMethod: transaction.paymentMethod,
        notes: transaction.notes
          ? `${transaction.notes} | Rateio: ${obra?.code || ''}`
          : `Rateio: ${obra?.code || ''}`,
        priority: transaction.priority,
        obraId: a.obraId,
        billingSentAt: transaction.billingSentAt,
        billingCount: transaction.billingCount,
        attachmentUrl: nfUrl || transaction.attachmentUrl,
        cdiAdjustable: transaction.cdiAdjustable,
        cdiPercentage: transaction.cdiPercentage,
        baseAmount: transaction.baseAmount,
        baseDate: transaction.baseDate,
      };
    });

    try {
      await addTransactions(newTxs);
      deleteTransaction(transaction.id);
      onClose();
    } catch {
      // error handled by context
    }
  };

  const canConfirm = splitEnabled
    ? allocations.filter(a => a.obraId && parseFloat(a.amount) > 0).length >= 2 && isBalanced && totalAmount > 0
    : totalAmount > 0 && !!paidAt;

  if (!transaction) return null;

  return (
    <Dialog open={!!transaction} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {transaction.type === 'pagar' ? 'Confirmar pagamento' : 'Confirmar recebimento'}
          </DialogTitle>
          <DialogDescription>
            <strong>{transaction.description}</strong>
            {transaction.counterpart && (
              <span className="block text-xs mt-0.5">{transaction.counterpart}</span>
            )}
            <span className="block mt-1.5 text-xs text-muted-foreground">
              Valor planejado: <span className="font-mono font-semibold text-foreground">{formatCurrency(transaction.amount)}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Valor {transaction.type === 'pagar' ? 'pago' : 'recebido'} (R$)
              </label>
              <Input
                type="number"
                step="0.01"
                value={actualAmount}
                onChange={(e) => setActualAmount(e.target.value)}
                className="font-mono text-base"
                autoFocus
              />
              {totalAmount !== transaction.amount && totalAmount > 0 && (
                <p className="text-[11px] mt-1 text-muted-foreground">
                  Diferença: <span className={cn('font-mono font-semibold', totalAmount > transaction.amount ? 'text-success' : 'text-destructive')}>
                    {totalAmount > transaction.amount ? '+' : ''}{formatCurrency(totalAmount - transaction.amount)}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Data do {transaction.type === 'pagar' ? 'pagamento' : 'recebimento'}
              </label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="text-sm" />
            </div>
          </div>

          {/* Split toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-semibold">Dividir entre obras</p>
                <p className="text-[10px] text-muted-foreground">Ratear este valor por múltiplas obras</p>
              </div>
            </div>
            <Switch checked={splitEnabled} onCheckedChange={setSplitEnabled} />
          </div>

          {/* Allocations */}
          {splitEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">Alocação por obra</label>
                {totalAmount > 0 && (
                  <Badge variant={isBalanced ? 'default' : 'destructive'} className="text-[10px] h-5 font-mono">
                    {isBalanced ? '✓ Balanceado' : `Restante: ${formatCurrency(remaining)}`}
                  </Badge>
                )}
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {allocations.map((alloc, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={alloc.obraId} onValueChange={(v) => updateAllocation(idx, 'obraId', v)}>
                      <SelectTrigger className="flex-1 h-8 text-xs">
                        <SelectValue placeholder="Selecionar obra..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeObras
                          .filter(o => !usedObraIds.has(o.id) || o.id === alloc.obraId)
                          .map(o => (
                            <SelectItem key={o.id} value={o.id} className="text-xs">
                              <span className="font-mono">{o.code}</span> — {o.clientName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="relative w-28">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Valor"
                        value={alloc.amount}
                        onChange={(e) => updateAllocation(idx, 'amount', e.target.value)}
                        className="h-8 text-xs font-mono pr-8"
                        onDoubleClick={() => fillRemaining(idx)}
                        title="Duplo clique para preencher restante"
                      />
                    </div>
                    {allocations.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 hover:bg-destructive/10"
                        onClick={() => removeAllocation(idx)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1" onClick={addAllocation}
                disabled={allocations.length >= activeObras.length}>
                <Plus className="w-3 h-3" /> Adicionar obra
              </Button>

              {!isBalanced && totalAmount > 0 && allocations.some(a => parseFloat(a.amount) > 0) && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  A soma das alocações deve ser igual ao valor total
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canConfirm}>
            {splitEnabled ? 'Confirmar e ratear' : 'Confirmar e atualizar saldo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

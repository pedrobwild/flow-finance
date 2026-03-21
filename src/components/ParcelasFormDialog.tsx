import { useState } from 'react';
import { useFinance } from '@/lib/finance-context';
import { PaymentMethod, PAYMENT_METHODS } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/helpers';
import { toast } from 'sonner';

interface Parcela {
  description: string;
  amount: string;
  paymentMethod: PaymentMethod;
  dueDate: string;
}

const emptyParcela = (): Parcela => ({
  description: '',
  amount: '',
  paymentMethod: '' as PaymentMethod,
  dueDate: '',
});

interface Props {
  open: boolean;
  onClose: () => void;
  obraId: string;
  obraCode: string;
  clientName: string;
  contractValue: number;
}

export default function ParcelasFormDialog({ open, onClose, obraId, obraCode, clientName, contractValue }: Props) {
  const { addTransactions } = useFinance();
  const [parcelas, setParcelas] = useState<Parcela[]>([emptyParcela()]);
  const [saving, setSaving] = useState(false);

  const totalParcelas = parcelas.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const remaining = contractValue - totalParcelas;

  const updateParcela = (index: number, field: keyof Parcela, value: string) => {
    setParcelas(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const addParcela = () => setParcelas(prev => [...prev, emptyParcela()]);

  const removeParcela = (index: number) => {
    if (parcelas.length <= 1) return;
    setParcelas(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const valid = parcelas.every(p => p.description.trim() && p.amount && p.dueDate);
    if (!valid) {
      toast.error('Preencha todos os campos obrigatórios de cada parcela');
      return;
    }

    setSaving(true);
    try {
      const txs = parcelas.map(p => ({
        type: 'receber' as const,
        description: p.description,
        counterpart: clientName,
        amount: parseFloat(p.amount) || 0,
        dueDate: p.dueDate,
        paidAt: null,
        status: 'pendente' as const,
        costCenter: 'Operação' as any,
        category: 'Parcela de Contrato',
        recurrence: 'única' as const,
        paymentMethod: p.paymentMethod,
        notes: '',
        priority: 'normal' as const,
        obraId,
      }));

      await addTransactions(txs);
      toast.success(`${parcelas.length} parcela(s) cadastrada(s) com sucesso`);
      setParcelas([emptyParcela()]);
      onClose();
    } catch {
      toast.error('Erro ao cadastrar parcelas');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setParcelas([emptyParcela()]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleSkip()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Parcelas — {obraCode}</DialogTitle>
          <DialogDescription>
            Cadastre as parcelas a receber de {clientName}. Valor do contrato: {formatCurrency(contractValue)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
            <span>Total parcelas: <strong className="text-foreground">{formatCurrency(totalParcelas)}</strong></span>
            <span className={remaining < 0 ? 'text-destructive font-semibold' : remaining === 0 ? 'text-success font-semibold' : 'text-muted-foreground'}>
              {remaining === 0 ? '✓ Valor completo' : `Restante: ${formatCurrency(remaining)}`}
            </span>
          </div>

          {/* Parcelas list */}
          {parcelas.map((parcela, index) => (
            <div key={index} className="p-3 rounded-lg border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Parcela {index + 1}</span>
                {parcelas.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeParcela(index)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Descrição da Parcela *</Label>
                  <Input
                    value={parcela.description}
                    onChange={e => updateParcela(index, 'description', e.target.value)}
                    placeholder="Ex: Sinal, 1ª Medição, Entrega..."
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={parcela.amount}
                    onChange={e => updateParcela(index, 'amount', e.target.value)}
                    placeholder="0,00"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Data de Vencimento *</Label>
                  <Input
                    type="date"
                    value={parcela.dueDate}
                    onChange={e => updateParcela(index, 'dueDate', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Forma de Pagamento</Label>
                  <Select
                    value={parcela.paymentMethod || '__none__'}
                    onValueChange={v => updateParcela(index, 'paymentMethod', v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs">Não definido</SelectItem>
                      {PAYMENT_METHODS.filter(Boolean).map(m => (
                        <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}

          {/* Add parcela button */}
          <Button type="button" variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={addParcela}>
            <Plus className="w-3.5 h-3.5" />
            Adicionar Parcela
          </Button>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-3 border-t">
          <Button type="button" variant="ghost" size="sm" onClick={handleSkip} className="text-xs text-muted-foreground">
            Pular por agora
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving} className="gap-2 text-xs">
            {saving ? 'Salvando...' : `Cadastrar ${parcelas.length} parcela(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

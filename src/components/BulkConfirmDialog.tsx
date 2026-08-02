import { useEffect, useState } from 'react';
import { Transaction } from '@/lib/types';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO } from '@/lib/helpers';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface Props {
  /** Lançamentos que serão confirmados. Null/vazio mantém o diálogo fechado. */
  transactions: Transaction[] | null;
  onClose: () => void;
}

/**
 * Diálogo de confirmação em massa: mostra quantidade, soma total e data de pagamento
 * antes de executar a confirmação atômica (uma única chamada para todos os ids).
 */
export default function BulkConfirmDialog({ transactions, onClose }: Props) {
  const { confirmTransactions } = useFinance();
  const [paidAt, setPaidAt] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const open = !!transactions && transactions.length > 0;

  useEffect(() => {
    if (open) {
      setPaidAt(todayISO());
      setSaving(false);
    }
  }, [open, transactions]);

  if (!open || !transactions) return null;

  const totalReceber = transactions.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
  const totalPagar = transactions.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
  const net = totalReceber - totalPagar;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await confirmTransactions(transactions.map(t => t.id), paidAt);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar {transactions.length} lançamentos</DialogTitle>
          <DialogDescription>
            Esta ação marca todos como confirmados e ajusta o saldo em caixa de uma só vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Quantidade</span>
              <span className="font-mono font-semibold">{transactions.length}</span>
            </div>
            {totalPagar > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total a pagar</span>
                <span className="font-mono font-semibold text-destructive">−{formatCurrency(totalPagar)}</span>
              </div>
            )}
            {totalReceber > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total a receber</span>
                <span className="font-mono font-semibold text-success">+{formatCurrency(totalReceber)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs pt-1.5 border-t">
              <span className="text-muted-foreground">Efeito no saldo</span>
              <span className={net >= 0 ? 'font-mono font-bold text-success' : 'font-mono font-bold text-destructive'}>
                {net >= 0 ? '+' : ''}{formatCurrency(net)}
              </span>
            </div>
          </div>

          <div>
            <Label htmlFor="bulk-paid-at" className="text-xs">Data do pagamento/recebimento</Label>
            <Input
              id="bulk-paid-at"
              type="date"
              value={paidAt}
              onChange={e => setPaidAt(e.target.value)}
              className="text-sm mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={saving || !paidAt}>
            {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Confirmar {transactions.length} e atualizar saldo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

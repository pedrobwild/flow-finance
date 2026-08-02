import { useMemo, useState } from 'react';
import { Inbox, Check, Trash2, AlertCircle } from 'lucide-react';
import { useFinance } from '@/lib/finance-context';
import { Transaction, SOURCE_LABELS } from '@/lib/types';
import { formatCurrency, formatDateFull } from '@/lib/helpers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import TransactionFormDialog from './TransactionFormDialog';
import CopyBarcodeButton from './CopyBarcodeButton';
import { cn } from '@/lib/utils';

export function useReviewQueue(): Transaction[] {
  const { transactions } = useFinance();
  return useMemo(
    () => transactions.filter(t => t.needsReview).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [transactions]
  );
}

export default function InboxReviewButton() {
  const queue = useReviewQueue();
  const { deleteTransaction } = useFinance();
  const [open, setOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [discardTx, setDiscardTx] = useState<Transaction | null>(null);

  const count = queue.length;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('relative gap-1.5 text-xs h-9 px-2.5', count > 0 && 'text-foreground')}
            aria-label={count > 0 ? `Caixa de entrada, ${count} lançamento(s) a confirmar` : 'Caixa de entrada'}
          >
            <Inbox className="w-4 h-4" />
            {count > 0 && (
              <Badge className="h-5 px-1.5 text-[10px] font-semibold bg-warning text-warning-foreground hover:bg-warning">
                {count} a confirmar
              </Badge>
            )}
          </Button>
        </SheetTrigger>

        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <Inbox className="w-4 h-4" /> Caixa de entrada
            </SheetTitle>
            <SheetDescription className="text-xs">
              Lançamentos detectados automaticamente. Já entram no fluxo de caixa — confirme para revisar categoria, centro de custo e obra.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-3">
            {count === 0 && (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Check className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Nada a confirmar</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Novos lançamentos automáticos aparecem aqui.
                </p>
              </div>
            )}

            {queue.map(tx => (
              <div key={tx.id} className="rounded-xl border p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{tx.counterpart || tx.description}</p>
                    <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                  </div>
                  <p className={cn(
                    'text-sm font-bold font-mono shrink-0',
                    tx.type === 'pagar' ? 'text-destructive' : 'text-success'
                  )}>
                    {tx.type === 'pagar' ? '−' : '+'}{formatCurrency(tx.amount)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    Vence {formatDateFull(tx.dueDate)}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {SOURCE_LABELS[tx.source || 'manual']}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
                    <AlertCircle className="w-3 h-3" /> A confirmar
                  </Badge>
                </div>

                {tx.barcodeLine && <CopyBarcodeButton barcodeLine={tx.barcodeLine} />}

                <div className="flex items-center gap-2 pt-0.5">
                  <Button size="sm" className="flex-1 h-9 text-xs gap-1.5" onClick={() => setEditingTx(tx)}>
                    <Check className="w-3.5 h-3.5" /> Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs gap-1.5 hover:bg-destructive/10 hover:border-destructive/30"
                    onClick={() => setDiscardTx(tx)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" /> Descartar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <TransactionFormDialog
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        defaultType={editingTx?.type || 'pagar'}
      />

      <Dialog open={!!discardTx} onOpenChange={v => !v && setDiscardTx(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Descartar lançamento</DialogTitle>
            <DialogDescription>
              O lançamento <strong>{discardTx?.description}</strong> será excluído e sairá do fluxo de caixa. Não é possível desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDiscardTx(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (discardTx) deleteTransaction(discardTx.id); setDiscardTx(null); }}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

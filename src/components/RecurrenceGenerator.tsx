import { useState, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { Transaction, Recurrence } from '@/lib/types';
import { addDays, todayISO, formatCurrency, formatDate } from '@/lib/helpers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { RefreshCw, Calendar, Check, Loader2 } from 'lucide-react';

function getNextDate(dateStr: string, recurrence: Recurrence): string {
  const d = new Date(dateStr + 'T12:00:00');
  switch (recurrence) {
    case 'semanal': d.setDate(d.getDate() + 7); break;
    case 'mensal': d.setMonth(d.getMonth() + 1); break;
    case 'trimestral': d.setMonth(d.getMonth() + 3); break;
    case 'anual': d.setFullYear(d.getFullYear() + 1); break;
    default: return dateStr;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function RecurrenceGenerator() {
  const { transactions, addTransactions } = useFinance();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const recurringTxs = useMemo(() => {
    return transactions.filter(
      t => t.recurrence !== 'única' && t.status !== 'confirmado'
    );
  }, [transactions]);

  const preview = useMemo(() => {
    const result: { source: Transaction; generated: Omit<Transaction, 'id'>[] }[] = [];
    const selected = recurringTxs.filter(t => selectedIds.has(t.id));

    selected.forEach(tx => {
      const items: Omit<Transaction, 'id'>[] = [];
      let lastDate = tx.dueDate;
      const existingDates = new Set(
        transactions.filter(t => t.description === tx.description && t.counterpart === tx.counterpart).map(t => t.dueDate)
      );

      for (let i = 0; i < count; i++) {
        const nextDate = getNextDate(lastDate, tx.recurrence);
        if (!existingDates.has(nextDate)) {
          items.push({
            type: tx.type,
            description: tx.description,
            counterpart: tx.counterpart,
            amount: tx.amount,
            dueDate: nextDate,
            paidAt: null,
            status: 'previsto',
            costCenter: tx.costCenter,
            category: tx.category,
            recurrence: tx.recurrence,
            paymentMethod: tx.paymentMethod,
            notes: tx.notes,
            priority: tx.priority,
            obraId: tx.obraId,
            billingSentAt: null,
            billingCount: 0,
            attachmentUrl: null,
            cdiAdjustable: false,
            cdiPercentage: null,
            baseAmount: null,
            baseDate: null,
          });
        }
        lastDate = nextDate;
      }
      if (items.length > 0) result.push({ source: tx, generated: items });
    });

    return result;
  }, [selectedIds, count, recurringTxs, transactions]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === recurringTxs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(recurringTxs.map(t => t.id)));
  }

  async function handleGenerate() {
    const all = preview.flatMap(p => p.generated);
    if (all.length === 0) { toast.info('Nenhuma transação para gerar'); return; }
    setGenerating(true);
    try {
      await addTransactions(all);
      toast.success(`${all.length} transações recorrentes geradas`);
      setOpen(false);
      setSelectedIds(new Set());
    } catch {
      toast.error('Erro ao gerar transações');
    }
    setGenerating(false);
  }

  if (recurringTxs.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="w-4 h-4 mr-1" /> Gerar Recorrências
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar Transações Recorrentes</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div>
                <Label className="text-xs">Repetições por transação</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={count}
                  onChange={e => setCount(Math.min(24, Math.max(1, Number(e.target.value))))}
                  className="w-24"
                />
              </div>
              <Button variant="ghost" size="sm" className="mt-5" onClick={selectAll}>
                {selectedIds.size === recurringTxs.length ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Transações recorrentes ativas:</p>
              {recurringTxs.map(tx => (
                <Card
                  key={tx.id}
                  className={`cursor-pointer transition-colors ${selectedIds.has(tx.id) ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => toggleSelect(tx.id)}
                >
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{tx.description}</span>
                      <div className="text-xs text-muted-foreground">
                        {tx.counterpart} · {formatCurrency(tx.amount)} · {tx.recurrence}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={tx.type === 'pagar' ? 'destructive' : 'default'} className="text-[10px]">
                        {tx.type === 'pagar' ? 'Pagar' : 'Receber'}
                      </Badge>
                      {selectedIds.has(tx.id) && <Check className="w-4 h-4 text-primary" />}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {preview.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Preview: {preview.reduce((s, p) => s + p.generated.length, 0)} transações serão criadas
                </p>
                {preview.map(p => (
                  <div key={p.source.id} className="text-xs bg-muted/50 rounded p-2">
                    <span className="font-medium">{p.source.description}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.generated.map((g, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          <Calendar className="w-3 h-3 mr-0.5" />
                          {formatDate(g.dueDate)} · {formatCurrency(g.amount)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || preview.length === 0}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Gerar {preview.reduce((s, p) => s + p.generated.length, 0)} Transações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

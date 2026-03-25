import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Check, X, AlertTriangle, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, RefreshCw, Plus, Link2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseOFX, type OFXStatement, type OFXTransaction } from '@/lib/ofx-parser';
import { reconcile, type ReconciliationMatch } from '@/lib/ofx-reconciler';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, formatDateFull } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { TransactionType } from '@/lib/types';

type Step = 'upload' | 'review' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function OFXImportDialog({ open, onClose }: Props) {
  const { transactions, addTransaction, addTransactions, confirmTransaction } = useFinance();
  const [step, setStep] = useState<Step>('upload');
  const [statement, setStatement] = useState<OFXStatement | null>(null);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [processing, setProcessing] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const text = await file.text();

    try {
      const parsed = parseOFX(text);
      if (parsed.transactions.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo OFX.');
        return;
      }
      setStatement(parsed);

      // Run reconciliation
      const pendingTxs = transactions.filter(t => t.status !== 'confirmado');
      const reconciled = reconcile(parsed.transactions, pendingTxs);
      setMatches(reconciled);
      setStep('review');
      toast.success(`${parsed.transactions.length} transações extraídas do extrato.`);
    } catch {
      toast.error('Erro ao processar arquivo OFX. Verifique o formato.');
    }
  }, [transactions]);

  const toggleMatch = (idx: number) => {
    setMatches(prev => prev.map((m, i) => i === idx ? { ...m, selected: !m.selected } : m));
  };

  const stats = useMemo(() => {
    const matched = matches.filter(m => m.status === 'matched');
    const unmatched = matches.filter(m => m.status === 'unmatched');
    const selected = matches.filter(m => m.selected);
    const totalCredits = matches.filter(m => m.ofxTx.type === 'CREDIT').reduce((s, m) => s + m.ofxTx.amount, 0);
    const totalDebits = matches.filter(m => m.ofxTx.type === 'DEBIT').reduce((s, m) => s + m.ofxTx.amount, 0);
    return { matched: matched.length, unmatched: unmatched.length, selected: selected.length, totalCredits, totalDebits };
  }, [matches]);

  const handleApply = async () => {
    setProcessing(true);
    try {
      const selected = matches.filter(m => m.selected);
      let confirmed = 0;
      let created = 0;
      const newTxBatch: Parameters<typeof addTransactions>[0] = [];

      for (const m of selected) {
        if (m.status === 'matched' && m.systemTx) {
          // Confirm existing transaction
          await confirmTransaction(m.systemTx.id, m.ofxTx.amount, m.systemTx.type as TransactionType, m.ofxTx.date);
          confirmed++;
        } else if (m.status === 'unmatched') {
          // Create new confirmed transaction
          newTxBatch.push({
            type: m.ofxTx.type === 'DEBIT' ? 'pagar' : 'receber',
            description: m.ofxTx.memo || m.ofxTx.name || 'Importação OFX',
            counterpart: m.ofxTx.name || '',
            amount: m.ofxTx.amount,
            dueDate: m.ofxTx.date,
            paidAt: m.ofxTx.date,
            status: 'conciliar',
            costCenter: 'Operação',
            category: 'Outros',
            recurrence: 'única',
            paymentMethod: '',
            notes: `Importado do extrato OFX (${fileName})`,
            priority: 'normal',
            obraId: null,
            billingSentAt: null,
            billingCount: 0,
            attachmentUrl: null,
            cdiAdjustable: false,
            cdiPercentage: null,
            baseAmount: null,
            baseDate: null,
          });
          created++;
        }
      }

      if (newTxBatch.length > 0) {
        await addTransactions(newTxBatch);
      }

      toast.success(`Conciliação concluída: ${confirmed} confirmada(s), ${created} criada(s).`);
      setStep('done');
    } catch {
      toast.error('Erro ao aplicar conciliação.');
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setStatement(null);
    setMatches([]);
    setFileName('');
    setExpandedIdx(null);
    onClose();
  };

  const confidenceBadge = (c: ReconciliationMatch['confidence']) => {
    const map = {
      alta: { label: 'Alta', className: 'bg-success/10 text-success border-success/20' },
      media: { label: 'Média', className: 'bg-warning/10 text-warning border-warning/20' },
      baixa: { label: 'Baixa', className: 'bg-destructive/10 text-destructive border-destructive/20' },
    };
    const { label, className } = map[c];
    return <Badge variant="outline" className={cn('text-[10px] font-medium', className)}>{label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Importar Extrato OFX
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Selecione o arquivo OFX do seu banco para conciliação automática.'}
            {step === 'review' && `${matches.length} transações encontradas · ${stats.matched} conciliadas · ${stats.unmatched} novas`}
            {step === 'done' && 'Importação concluída com sucesso!'}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 gap-4">
            <label
              className="w-full border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Clique para selecionar o arquivo OFX</p>
                <p className="text-xs text-muted-foreground mt-1">Suporta arquivos .ofx e .ofc de qualquer banco brasileiro</p>
              </div>
              <input
                type="file"
                accept=".ofx,.ofc,.OFX,.OFC"
                className="hidden"
                onChange={handleFile}
              />
            </label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
              <span>A conciliação cruza valor, data (±3 dias) e contrapartida automaticamente</span>
            </div>
          </div>
        )}

        {/* STEP 2: Review */}
        {step === 'review' && statement && (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            {/* Summary strip */}
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted">
                <FileText className="w-3 h-3" />
                <span className="font-medium">{fileName}</span>
              </div>
              {statement.startDate && (
                <div className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground">
                  {formatDateFull(statement.startDate)} → {formatDateFull(statement.endDate)}
                </div>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-success/10 text-success">
                <ArrowUpRight className="w-3 h-3" />
                {formatCurrency(stats.totalCredits)}
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive">
                <ArrowDownRight className="w-3 h-3" />
                {formatCurrency(stats.totalDebits)}
              </div>
            </div>

            {/* Tabs: Conciliados / Novos */}
            <Tabs defaultValue="all" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="all" className="text-xs">Todas ({matches.length})</TabsTrigger>
                <TabsTrigger value="matched" className="text-xs">
                  <Link2 className="w-3 h-3 mr-1" />
                  Conciliadas ({stats.matched})
                </TabsTrigger>
                <TabsTrigger value="unmatched" className="text-xs">
                  <Plus className="w-3 h-3 mr-1" />
                  Novas ({stats.unmatched})
                </TabsTrigger>
              </TabsList>

              {(['all', 'matched', 'unmatched'] as const).map(tab => (
                <TabsContent key={tab} value={tab} className="flex-1 overflow-hidden mt-2">
                  <ScrollArea className="h-[340px]">
                    <div className="space-y-1.5 pr-3">
                      <AnimatePresence>
                        {matches
                          .filter(m => tab === 'all' || m.status === tab)
                          .map((m, idx) => {
                            const realIdx = matches.indexOf(m);
                            const isDebit = m.ofxTx.type === 'DEBIT';
                            const expanded = expandedIdx === realIdx;
                            return (
                              <motion.div
                                key={m.ofxTx.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.02 }}
                                className={cn(
                                  'rounded-lg border p-3 transition-colors',
                                  m.selected ? 'bg-card' : 'bg-muted/30 opacity-60',
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={m.selected}
                                    onCheckedChange={() => toggleMatch(realIdx)}
                                    className="scale-75"
                                  />
                                  <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0',
                                    isDebit ? 'bg-destructive/10' : 'bg-success/10'
                                  )}>
                                    {isDebit
                                      ? <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
                                      : <ArrowUpRight className="w-3.5 h-3.5 text-success" />
                                    }
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{m.ofxTx.name || m.ofxTx.memo}</p>
                                    <p className="text-[10px] text-muted-foreground">{formatDateFull(m.ofxTx.date)}</p>
                                  </div>
                                  <span className={cn('text-sm font-mono font-bold', isDebit ? 'text-destructive' : 'text-success')}>
                                    {isDebit ? '-' : '+'}{formatCurrency(m.ofxTx.amount)}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {m.status === 'matched' ? (
                                      <>
                                        {confidenceBadge(m.confidence)}
                                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                          <Link2 className="w-2.5 h-2.5 mr-0.5" />Conciliada
                                        </Badge>
                                      </>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">
                                        <Plus className="w-2.5 h-2.5 mr-0.5" />Nova
                                      </Badge>
                                    )}
                                    <button onClick={() => setExpandedIdx(expanded ? null : realIdx)} className="p-0.5 hover:bg-muted rounded">
                                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>

                                {expanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    className="mt-2 pt-2 border-t text-xs space-y-1"
                                  >
                                    {m.ofxTx.memo && <p><span className="text-muted-foreground">Memo:</span> {m.ofxTx.memo}</p>}
                                    {m.ofxTx.checkNum && <p><span className="text-muted-foreground">Nº:</span> {m.ofxTx.checkNum}</p>}
                                    {m.systemTx && (
                                      <div className="mt-1 p-2 rounded bg-muted/50">
                                        <p className="font-medium text-primary">↳ Vinculada a: {m.systemTx.description}</p>
                                        <p className="text-muted-foreground">
                                          {m.systemTx.counterpart} · {formatCurrency(m.systemTx.amount)} · Venc. {formatDateFull(m.systemTx.dueDate)}
                                        </p>
                                      </div>
                                    )}
                                    {!m.systemTx && (
                                      <p className="text-muted-foreground italic">
                                        Será criada como transação confirmada ({isDebit ? 'pagar' : 'receber'}).
                                      </p>
                                    )}
                                  </motion.div>
                                )}
                              </motion.div>
                            );
                          })}
                      </AnimatePresence>
                    </div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>

            {/* Action bar */}
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                {stats.selected} selecionada(s) para aplicar
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>Cancelar</Button>
                <Button size="sm" onClick={handleApply} disabled={processing || stats.selected === 0}>
                  {processing ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> Aplicando...</>
                  ) : (
                    <><Check className="w-3.5 h-3.5 mr-1" /> Aplicar Conciliação</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Done */}
        {step === 'done' && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">Importação Concluída!</p>
              <p className="text-sm text-muted-foreground mt-1">
                As transações foram conciliadas e atualizadas no sistema.
              </p>
            </div>
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

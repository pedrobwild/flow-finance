import { useState, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO, daysBetween, getDayMonth } from '@/lib/helpers';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Siren, ChevronRight, ChevronLeft, CheckCircle2, Circle, Phone,
  MessageSquare, Copy, AlertTriangle, TrendingDown, ArrowRight,
  Target, ShieldAlert, Clock, Sparkles, Loader2, FileText, BookOpen,
  ArrowLeftRight, ClipboardList,
} from 'lucide-react';
import type { Transaction } from '@/lib/types';

// === WIZARD STEPS ===
const STEPS = [
  { id: 'diagnostico', label: 'Diagnóstico', icon: ShieldAlert },
  { id: 'priorizacao', label: 'Priorização', icon: Target },
  { id: 'negociacao', label: 'Negociação', icon: Phone },
  { id: 'simulador', label: 'Simulador', icon: ArrowLeftRight },
  { id: 'registro', label: 'Registro', icon: ClipboardList },
] as const;

type StepId = typeof STEPS[number]['id'];

interface NegotiationScript {
  supplierProfile: string;
  recommendedApproach: string;
  scenarios: Array<{
    name: string;
    description: string;
    proposedAmount: number;
    proposedDate: string;
    savings: number;
    script: string;
    whatsappMessage: string;
  }>;
  objections: Array<{ objection: string; response: string }>;
  tips: string[];
}

interface NegotiationRecord {
  transactionId: string;
  counterpart: string;
  result: 'pendente' | 'aceito' | 'recusado' | 'contraproposta';
  notes: string;
  proposedAmount?: number;
  proposedDate?: string;
}

export default function ComandoDeGuerra() {
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const { obras } = useObras();
  const today = todayISO();
  const [currentStep, setCurrentStep] = useState<StepId>('diagnostico');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [negotiationScript, setNegotiationScript] = useState<NegotiationScript | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [negotiations, setNegotiations] = useState<NegotiationRecord[]>([]);
  const [renegDays, setRenegDays] = useState<Record<string, number>>({});

  const bal = currentBalance?.amount ?? 0;

  // === DIAGNOSIS DATA ===
  const diagnosis = useMemo(() => {
    const pendingPayables = transactions.filter(t => t.type === 'pagar' && t.status !== 'confirmado');
    const overduePayables = pendingPayables.filter(t => t.status === 'atrasado');
    const overdueReceivables = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado');
    const totalPendingOut = pendingPayables.reduce((s, t) => s + t.amount, 0);
    const totalOverdueOut = overduePayables.reduce((s, t) => s + t.amount, 0);
    const totalOverdueIn = overdueReceivables.reduce((s, t) => s + t.amount, 0);

    // Find first day of negative cash
    let firstNegDay: string | null = null;
    for (let d = 0; d < 90; d++) {
      const date = todayISO();
      const proj = projectedBalance(date);
      if (proj < 0 && !firstNegDay) {
        firstNegDay = date;
        break;
      }
    }

    const proj30 = projectedBalance(todayISO());
    const gap = proj30 < 0 ? Math.abs(proj30) : 0;

    return {
      balance: bal,
      totalPendingOut,
      totalOverdueOut,
      totalOverdueIn,
      pendingPayables,
      overduePayables,
      overdueReceivables,
      gap,
      firstNegDay,
      pendingCount: pendingPayables.length,
      overdueOutCount: overduePayables.length,
      overdueInCount: overdueReceivables.length,
    };
  }, [transactions, bal, projectedBalance]);

  // === PRIORITIZED PAYABLES (by negotiation impact) ===
  const prioritizedPayables = useMemo(() => {
    const payables = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado')
      .map(t => {
        const daysUntilDue = daysBetween(today, t.dueDate);
        const isOverdue = t.status === 'atrasado';
        const daysOverdue = isOverdue ? daysBetween(t.dueDate, today) : 0;
        const obra = t.obraId ? obras.find(o => o.id === t.obraId) : null;

        // Score: higher = more worth negotiating
        let score = 0;
        score += t.amount / 1000; // bigger amounts first
        if (isOverdue) score += 20 + daysOverdue;
        if (daysUntilDue <= 7 && !isOverdue) score += 15;
        if (t.recurrence !== 'única') score += 10; // recurring = leverage
        if (t.priority === 'baixa' || t.priority === 'normal') score += 5;

        return { ...t, score, daysUntilDue, daysOverdue, isOverdue, obra };
      })
      .sort((a, b) => b.score - a.score);

    return payables;
  }, [transactions, today, obras]);

  // === RENEGOTIATION SIMULATOR ===
  const simulatedSavings = useMemo(() => {
    return Object.entries(renegDays).reduce((total, [id, days]) => {
      const tx = transactions.find(t => t.id === id);
      if (!tx) return total;
      // Estimate: postponing doesn't save money directly but relieves pressure
      return total;
    }, 0);
  }, [renegDays, transactions]);

  const simulatedProjection = useMemo(() => {
    // Calculate how renegotiation changes the cash flow
    const adjustedTxs = transactions.map(t => {
      const adjustment = renegDays[t.id];
      if (!adjustment || t.type !== 'pagar') return t;
      const newDate = new Date(t.dueDate + 'T12:00:00');
      newDate.setDate(newDate.getDate() + adjustment);
      return { ...t, dueDate: newDate.toISOString().split('T')[0] };
    });

    // Project 30 days with adjusted dates
    const points: Array<{ day: number; original: number; adjusted: number }> = [];
    for (let d = 0; d <= 30; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      
      const originalFlow = transactions
        .filter(t => t.status !== 'confirmado' && t.dueDate <= dateStr)
        .reduce((s, t) => s + (t.type === 'receber' ? t.amount : -t.amount), 0);
      
      const adjustedFlow = adjustedTxs
        .filter(t => t.status !== 'confirmado' && t.dueDate <= dateStr)
        .reduce((s, t) => s + (t.type === 'receber' ? t.amount : -t.amount), 0);

      points.push({ day: d, original: bal + originalFlow, adjusted: bal + adjustedFlow });
    }
    return points;
  }, [transactions, renegDays, bal]);

  // === GENERATE NEGOTIATION SCRIPT ===
  const generateScript = useCallback(async (tx: Transaction) => {
    setSelectedTransaction(tx);
    setLoadingScript(true);
    setNegotiationScript(null);

    try {
      const { data, error } = await supabase.functions.invoke('negotiation-script', {
        body: {
          counterpart: tx.counterpart,
          amount: tx.amount,
          dueDate: tx.dueDate,
          daysOverdue: tx.status === 'atrasado' ? daysBetween(tx.dueDate, today) : 0,
          category: tx.category,
          companyContext: `Saldo atual: R$ ${bal.toFixed(2)}. Empresa de reformas de alto padrão.`,
        },
      });

      if (error) throw error;
      setNegotiationScript(data as NegotiationScript);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar script de negociação');
    } finally {
      setLoadingScript(false);
    }
  }, [today, bal]);

  // === RECORD NEGOTIATION ===
  const recordNegotiation = useCallback(async (record: NegotiationRecord) => {
    try {
      const { error } = await supabase.from('negotiations').insert({
        transaction_id: record.transactionId,
        counterpart: record.counterpart,
        original_amount: transactions.find(t => t.id === record.transactionId)?.amount ?? 0,
        proposed_amount: record.proposedAmount,
        proposed_due_date: record.proposedDate,
        result: record.result,
        notes: record.notes,
        contacted_at: new Date().toISOString(),
        resolved_at: record.result !== 'pendente' ? new Date().toISOString() : null,
      });
      if (error) throw error;
      setNegotiations(prev => [...prev, record]);
      toast.success('Negociação registrada!');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao registrar negociação');
    }
  }, [transactions]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);
  const canNext = stepIndex < STEPS.length - 1;
  const canPrev = stepIndex > 0;

  return (
    <div className="space-y-6 pb-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Siren className="w-5 h-5 text-destructive" />
            <h1 className="text-lg font-bold tracking-tight">Comando de Guerra</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Resolução de crise passo a passo — siga o wizard para proteger seu caixa
          </p>
        </div>
        <Link to="/">
          <Button variant="outline" size="sm" className="text-xs">← Dashboard</Button>
        </Link>
      </div>

      {/* WIZARD STEPPER */}
      <div className="flex items-center gap-1 bg-card border rounded-xl p-2">
        {STEPS.map((step, i) => {
          const isActive = step.id === currentStep;
          const isDone = i < stepIndex;
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              onClick={() => setCurrentStep(step.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center',
                isActive && 'bg-primary text-primary-foreground shadow-sm',
                isDone && !isActive && 'bg-success/10 text-success',
                !isActive && !isDone && 'text-muted-foreground hover:bg-muted',
              )}
            >
              {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* STEP CONTENT */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          {currentStep === 'diagnostico' && (
            <DiagnosticoStep diagnosis={diagnosis} />
          )}

          {currentStep === 'priorizacao' && (
            <PriorizacaoStep
              payables={prioritizedPayables}
              onSelect={(tx) => {
                setSelectedTransaction(tx);
                setCurrentStep('negociacao');
                generateScript(tx);
              }}
            />
          )}

          {currentStep === 'negociacao' && (
            <NegociacaoStep
              transaction={selectedTransaction}
              script={negotiationScript}
              loading={loadingScript}
              onGenerate={generateScript}
              onCopy={copyToClipboard}
              payables={prioritizedPayables}
              onRecord={(result, notes) => {
                if (!selectedTransaction) return;
                recordNegotiation({
                  transactionId: selectedTransaction.id,
                  counterpart: selectedTransaction.counterpart,
                  result,
                  notes,
                  proposedAmount: negotiationScript?.scenarios?.[0]?.proposedAmount,
                  proposedDate: negotiationScript?.scenarios?.[0]?.proposedDate,
                });
              }}
            />
          )}

          {currentStep === 'simulador' && (
            <SimuladorStep
              payables={prioritizedPayables}
              renegDays={renegDays}
              setRenegDays={setRenegDays}
              projection={simulatedProjection}
              balance={bal}
            />
          )}

          {currentStep === 'registro' && (
            <RegistroStep negotiations={negotiations} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* NAV BUTTONS */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => canPrev && setCurrentStep(STEPS[stepIndex - 1].id)}
          disabled={!canPrev}
          className="gap-1.5"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </Button>
        <span className="text-xs text-muted-foreground">
          Passo {stepIndex + 1} de {STEPS.length}
        </span>
        <Button
          size="sm"
          onClick={() => canNext && setCurrentStep(STEPS[stepIndex + 1].id)}
          disabled={!canNext}
          className="gap-1.5"
        >
          Próximo <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ============= STEP 1: DIAGNÓSTICO =============
function DiagnosticoStep({ diagnosis }: { diagnosis: any }) {
  const metrics = [
    { label: 'Saldo atual', value: formatCurrency(diagnosis.balance), color: diagnosis.balance >= 0 ? 'text-success' : 'text-destructive', icon: TrendingDown },
    { label: 'Saídas pendentes', value: formatCurrency(diagnosis.totalPendingOut), color: 'text-destructive', count: diagnosis.pendingCount },
    { label: 'Pagáveis atrasados', value: formatCurrency(diagnosis.totalOverdueOut), color: 'text-destructive', count: diagnosis.overdueOutCount },
    { label: 'Recebíveis atrasados', value: formatCurrency(diagnosis.totalOverdueIn), color: 'text-warning', count: diagnosis.overdueInCount },
  ];

  return (
    <div className="space-y-4">
      <Card className="card-elevated border-destructive/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive" />
            Diagnóstico da Situação
          </CardTitle>
          <CardDescription className="text-xs">Visão geral da pressão sobre o caixa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.map((m, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
                <p className={cn('text-lg font-bold font-mono', m.color)}>{m.value}</p>
                {m.count !== undefined && (
                  <p className="text-[10px] text-muted-foreground">{m.count} transações</p>
                )}
              </div>
            ))}
          </div>

          {diagnosis.gap > 0 && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-sm font-semibold text-destructive">
                  Gap de caixa: {formatCurrency(diagnosis.gap)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Esse é o valor que precisa ser coberto para evitar saldo negativo. Avance para priorizar negociações.
              </p>
            </div>
          )}

          <div className="mt-4 p-3 bg-primary/5 border border-primary/10 rounded-lg">
            <p className="text-xs font-medium mb-1">💡 Próximo passo</p>
            <p className="text-xs text-muted-foreground">
              Avance para a etapa de <strong>Priorização</strong> para identificar quais fornecedores negociar primeiro,
              baseado no impacto no caixa e na facilidade de renegociação.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============= STEP 2: PRIORIZAÇÃO =============
function PriorizacaoStep({ payables, onSelect }: { payables: any[]; onSelect: (tx: Transaction) => void }) {
  return (
    <div className="space-y-4">
      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Ranking de Negociação
          </CardTitle>
          <CardDescription className="text-xs">
            Fornecedores ordenados por impacto e facilidade — negocie de cima para baixo
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {payables.slice(0, 15).map((tx, i) => (
              <button
                key={tx.id}
                onClick={() => onSelect(tx)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
              >
                <span className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  i < 3 ? 'bg-destructive/10 text-destructive' : i < 6 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground',
                )}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{tx.counterpart || tx.description}</span>
                    {tx.isOverdue && (
                      <Badge variant="destructive" className="text-[9px] px-1 py-0">
                        {tx.daysOverdue}d atrasado
                      </Badge>
                    )}
                    {tx.recurrence !== 'única' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{tx.recurrence}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{tx.category}</span>
                    <span className="text-[10px] text-muted-foreground">· Vence {getDayMonth(tx.dueDate)}</span>
                    {tx.obra && (
                      <span className="text-[10px] text-muted-foreground">· {tx.obra.code}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold font-mono text-destructive">{formatCurrency(tx.amount)}</span>
                  <div className="flex items-center gap-1 justify-end mt-0.5">
                    <span className="text-[10px] text-primary">Negociar</span>
                    <ArrowRight className="w-3 h-3 text-primary" />
                  </div>
                </div>
              </button>
            ))}
          </div>
          {payables.length === 0 && (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma conta a pagar pendente</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============= STEP 3: NEGOCIAÇÃO =============
function NegociacaoStep({
  transaction,
  script,
  loading,
  onGenerate,
  onCopy,
  payables,
  onRecord,
}: {
  transaction: Transaction | null;
  script: NegotiationScript | null;
  loading: boolean;
  onGenerate: (tx: Transaction) => void;
  onCopy: (text: string) => void;
  payables: any[];
  onRecord: (result: 'aceito' | 'recusado' | 'contraproposta', notes: string) => void;
}) {
  const [resultNotes, setResultNotes] = useState('');

  if (!transaction) {
    return (
      <Card className="card-elevated">
        <CardContent className="p-8 text-center">
          <Phone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Selecione um fornecedor na etapa de Priorização ou escolha abaixo:
          </p>
          <div className="space-y-2 max-w-md mx-auto">
            {payables.slice(0, 5).map(tx => (
              <Button
                key={tx.id}
                variant="outline"
                className="w-full justify-between text-xs"
                onClick={() => onGenerate(tx)}
              >
                <span className="truncate">{tx.counterpart || tx.description}</span>
                <span className="font-mono text-destructive">{formatCurrency(tx.amount)}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selected transaction header */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{transaction.counterpart || transaction.description}</p>
              <p className="text-xs text-muted-foreground">{transaction.category} · Vence {getDayMonth(transaction.dueDate)}</p>
            </div>
            <span className="text-lg font-bold font-mono text-destructive">{formatCurrency(transaction.amount)}</span>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Gerando scripts de negociação personalizados...</p>
          </CardContent>
        </Card>
      )}

      {script && !loading && (
        <>
          {/* Profile & approach */}
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Perfil & Estratégia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs">{script.supplierProfile}</p>
              <Badge variant="outline" className="text-xs">
                Abordagem recomendada: {script.recommendedApproach}
              </Badge>
            </CardContent>
          </Card>

          {/* Scenarios */}
          {script.scenarios?.map((scenario, i) => (
            <Card key={i} className={cn('card-elevated', i === 0 && 'border-success/30')}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {i === 0 ? '🎯' : i === 1 ? '🔄' : '⚡'} Cenário {scenario.name}
                  </CardTitle>
                  {scenario.savings > 0 && (
                    <Badge className="bg-success/10 text-success border-success/20 text-xs">
                      Economia: {formatCurrency(scenario.savings)}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">{scenario.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3 text-xs">
                  <div className="bg-muted/50 rounded p-2 flex-1">
                    <p className="text-muted-foreground">Valor proposto</p>
                    <p className="font-bold font-mono">{formatCurrency(scenario.proposedAmount)}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2 flex-1">
                    <p className="text-muted-foreground">Data proposta</p>
                    <p className="font-bold">{scenario.proposedDate ? getDayMonth(scenario.proposedDate) : '—'}</p>
                  </div>
                </div>

                {/* Phone script */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <Phone className="w-3 h-3" /> Script para ligação
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => onCopy(scenario.script)}>
                      <Copy className="w-3 h-3" /> Copiar
                    </Button>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap border">
                    {scenario.script}
                  </div>
                </div>

                {/* WhatsApp message */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> Mensagem WhatsApp
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => onCopy(scenario.whatsappMessage)}>
                      <Copy className="w-3 h-3" /> Copiar
                    </Button>
                  </div>
                  <div className="bg-success/5 rounded-lg p-3 text-xs leading-relaxed border border-success/10">
                    {scenario.whatsappMessage}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Objections */}
          {script.objections?.length > 0 && (
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Objeções e Respostas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {script.objections.map((obj, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-medium text-destructive">❝ {obj.objection}</p>
                    <p className="text-xs text-muted-foreground">→ {obj.response}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tips */}
          {script.tips?.length > 0 && (
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Dicas para esta negociação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {script.tips.map((tip, i) => (
                    <li key={i} className="text-xs flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Record result */}
          <Card className="card-elevated border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" /> Registrar resultado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Anote o resultado da conversa..."
                value={resultNotes}
                onChange={e => setResultNotes(e.target.value)}
                className="text-xs min-h-[60px]"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="text-xs bg-success hover:bg-success/90"
                  onClick={() => { onRecord('aceito', resultNotes); setResultNotes(''); }}
                >
                  ✓ Aceito
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => { onRecord('contraproposta', resultNotes); setResultNotes(''); }}
                >
                  ↔ Contraproposta
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="text-xs"
                  onClick={() => { onRecord('recusado', resultNotes); setResultNotes(''); }}
                >
                  ✕ Recusado
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ============= STEP 4: SIMULADOR DE RENEGOCIAÇÃO =============
function SimuladorStep({
  payables,
  renegDays,
  setRenegDays,
  projection,
  balance,
}: {
  payables: any[];
  renegDays: Record<string, number>;
  setRenegDays: (v: Record<string, number>) => void;
  projection: Array<{ day: number; original: number; adjusted: number }>;
  balance: number;
}) {
  const totalPostponed = Object.keys(renegDays).length;
  const minOriginal = Math.min(...projection.map(p => p.original));
  const minAdjusted = Math.min(...projection.map(p => p.adjusted));
  const improvement = minAdjusted - minOriginal;

  return (
    <div className="space-y-4">
      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            Simulador de Renegociação
          </CardTitle>
          <CardDescription className="text-xs">
            Arraste os dias para adiar pagamentos e veja o impacto no caixa em tempo real
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Impact summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Contas ajustadas</p>
              <p className="text-lg font-bold">{totalPostponed}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Pior ponto original</p>
              <p className={cn('text-lg font-bold font-mono', minOriginal < 0 ? 'text-destructive' : 'text-success')}>
                {formatCurrency(minOriginal)}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Pior ponto ajustado</p>
              <p className={cn('text-lg font-bold font-mono', minAdjusted < 0 ? 'text-destructive' : 'text-success')}>
                {formatCurrency(minAdjusted)}
              </p>
            </div>
          </div>

          {improvement > 0 && (
            <div className="mb-4 p-2.5 bg-success/10 border border-success/20 rounded-lg text-center">
              <p className="text-xs font-medium text-success">
                🎯 Melhoria no pior ponto: +{formatCurrency(improvement)}
              </p>
            </div>
          )}

          {/* Payable adjuster list */}
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {payables.slice(0, 12).map(tx => {
              const days = renegDays[tx.id] || 0;
              return (
                <div key={tx.id} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{tx.counterpart || tx.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatCurrency(tx.amount)} · Vence {getDayMonth(tx.dueDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0 text-xs"
                      onClick={() => setRenegDays({ ...renegDays, [tx.id]: Math.max(0, days - 7) })}
                    >
                      −
                    </Button>
                    <span className={cn(
                      'text-xs font-mono w-10 text-center',
                      days > 0 ? 'text-primary font-bold' : 'text-muted-foreground',
                    )}>
                      +{days}d
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0 text-xs"
                      onClick={() => setRenegDays({ ...renegDays, [tx.id]: days + 7 })}
                    >
                      +
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPostponed > 0 && (
            <div className="mt-3 pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setRenegDays({})}
              >
                Limpar todos os ajustes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============= STEP 5: REGISTRO =============
function RegistroStep({ negotiations }: { negotiations: NegotiationRecord[] }) {
  const resultColors: Record<string, string> = {
    aceito: 'bg-success/10 text-success',
    recusado: 'bg-destructive/10 text-destructive',
    contraproposta: 'bg-warning/10 text-warning',
    pendente: 'bg-muted text-muted-foreground',
  };

  const resultLabels: Record<string, string> = {
    aceito: 'Aceito',
    recusado: 'Recusado',
    contraproposta: 'Contraproposta',
    pendente: 'Pendente',
  };

  return (
    <div className="space-y-4">
      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Registro de Negociações
          </CardTitle>
          <CardDescription className="text-xs">
            Acompanhe o resultado de cada contato com fornecedores
          </CardDescription>
        </CardHeader>
        <CardContent>
          {negotiations.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma negociação registrada ainda.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Vá para a etapa de Negociação, gere um script e registre o resultado.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {negotiations.map((neg, i) => (
                <div key={i} className="py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{neg.counterpart}</span>
                    <Badge className={cn('text-[10px]', resultColors[neg.result])}>
                      {resultLabels[neg.result]}
                    </Badge>
                  </div>
                  {neg.proposedAmount && (
                    <p className="text-xs text-muted-foreground">
                      Proposta: {formatCurrency(neg.proposedAmount)}
                      {neg.proposedDate && ` · até ${getDayMonth(neg.proposedDate)}`}
                    </p>
                  )}
                  {neg.notes && (
                    <p className="text-xs text-muted-foreground italic">"{neg.notes}"</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {negotiations.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-success">{negotiations.filter(n => n.result === 'aceito').length}</p>
                  <p className="text-[10px] text-muted-foreground">Aceitas</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-warning">{negotiations.filter(n => n.result === 'contraproposta').length}</p>
                  <p className="text-[10px] text-muted-foreground">Contrapropostas</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-destructive">{negotiations.filter(n => n.result === 'recusado').length}</p>
                  <p className="text-[10px] text-muted-foreground">Recusadas</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

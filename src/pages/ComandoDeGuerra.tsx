import { useState, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth, formatDateFull } from '@/lib/helpers';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import type { Transaction, TransactionType } from '@/lib/types';
import {
  Siren, CheckCircle2, Circle, Phone, MessageSquare, Copy, Mail,
  AlertTriangle, ArrowRight, ShieldAlert, Clock,
  Sparkles, Loader2, Plus, ExternalLink,
  RefreshCw, Zap, CalendarClock, HandCoins, ArrowLeftRight,
  Scissors, Landmark, ChevronDown, ChevronUp, Shield, Flame,
} from 'lucide-react';
import { useWarRoom, priorityStyles, effortLabels, type WarAction } from '@/hooks/useWarRoom';

// === LOCAL TYPES ===
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
    formalEmail?: string;
  }>;
  objections: Array<{ objection: string; response: string }>;
  tips: string[];
}

const categoryIcons: Record<string, React.ElementType> = {
  cobranca: Phone,
  antecipacao: HandCoins,
  renegociacao: ArrowLeftRight,
  corte: Scissors,
  credito: Landmark,
  cronograma: CalendarClock,
};

export default function ComandoDeGuerra() {
  const { confirmTransaction } = useFinance();
  const {
    crisis, isProactive, aiData, loading, error, completedActions,
    toggleCompleted, fetchWarPlan, resolveActionPrefill, setRetried,
    today, allTransactions, obras, bal, globalProjected,
  } = useWarRoom({ mode: 'page' });

  // Negotiation script (page-only feature)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [negotiationScript, setNegotiationScript] = useState<NegotiationScript | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [showNegotiation, setShowNegotiation] = useState(false);

  // Transaction form
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormDefaults, setTxFormDefaults] = useState<{
    type: TransactionType; description?: string; counterpart?: string;
    amount?: number; category?: string; notes?: string; obraId?: string;
  } | null>(null);

  const handleActionPrefill = (action: WarAction) => {
    const prefill = resolveActionPrefill(action);
    if (!prefill) return;
    setTxFormDefaults(prefill);
    setTxFormOpen(true);
  };

  // Projection chart data
  const projectionData = useMemo(() => {
    const points: Array<{ day: number; label: string; saldo: number }> = [];
    const horizon = 60;
    for (let d = 0; d <= horizon; d++) {
      const date = addDays(today, d);
      points.push({
        day: d,
        label: d === 0 ? 'Hoje' : getDayMonth(date),
        saldo: globalProjected(date),
      });
    }
    return points;
  }, [globalProjected, today]);

  const severity = crisis.negDate && crisis.negDays !== null && crisis.negDays <= 7
    ? 'critical'
    : crisis.negDate && crisis.negDays !== null && crisis.negDays <= 14
      ? 'warning'
      : crisis.negDate
        ? 'caution'
        : 'monitoring';

  const severityConfig = {
    critical: { bg: 'bg-destructive/10', border: 'border-destructive/40', color: 'text-destructive' },
    warning: { bg: 'bg-warning/10', border: 'border-warning/40', color: 'text-warning' },
    caution: { bg: 'bg-accent/10', border: 'border-accent/40', color: 'text-accent' },
    monitoring: { bg: 'bg-muted/20', border: 'border-border', color: 'text-foreground' },
  };

  const sConfig = severityConfig[severity];

  // === NEGOTIATION SCRIPT ===
  const generateScript = useCallback(async (tx: Transaction) => {
    setSelectedTx(tx);
    setShowNegotiation(true);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  return (
    <div className="space-y-6 pb-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {isProactive ? (
              <Shield className={cn('w-5 h-5', 'text-success')} />
            ) : (
              <Siren className={cn('w-5 h-5', sConfig.color)} />
            )}
            <h1 className="text-lg font-bold tracking-tight">
              {isProactive ? 'Comando Estratégico' : 'Comando de Guerra'}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isProactive
              ? 'Caixa saudável — oportunidades de otimização e proteção identificadas pela IA'
              : 'Análise completa da IA — tudo que você pode fazer para proteger o caixa'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm" className="text-xs gap-1.5"
            onClick={() => { setRetried(false); fetchWarPlan(); }}
            disabled={loading}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar análise
          </Button>
          <Link to="/">
            <Button variant="outline" size="sm" className="text-xs">← Dashboard</Button>
          </Link>
        </div>
      </div>

      {/* === CRISIS ALERT === */}
      {crisis.negDate && crisis.negDays !== null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20"
        >
          <Flame className="w-4 h-4 text-destructive flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-destructive">
              Caixa negativo em {crisis.negDays}d — {formatDateFull(crisis.negDate)}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              Déficit: {formatCurrency(crisis.deficit)} · Pior ponto: {formatCurrency(crisis.minBal)} em {getDayMonth(crisis.minDate)}
            </span>
          </div>
          {aiData && (
            <div className="text-right flex-shrink-0">
              <span className={cn('text-sm font-bold font-mono', aiData.coveragePercentage >= 100 ? 'text-success' : 'text-warning')}>
                {aiData.coveragePercentage.toFixed(0)}%
              </span>
              <p className="text-[9px] text-muted-foreground">cobertura</p>
            </div>
          )}
        </motion.div>
      )}

      {!crisis.negDate && crisis.minBal < bal * 0.3 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-warning/5 border border-warning/20"
        >
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          <span className="text-sm text-muted-foreground">
            Ponto mais apertado: <span className="font-semibold text-foreground">{formatCurrency(crisis.minBal)}</span> em {getDayMonth(crisis.minDate)} — margem baixa
          </span>
        </motion.div>
      )}

      {/* === PROJECTION CHART === */}
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Projeção de Caixa — 60 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                  interval={9}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0];
                    return (
                      <div className="bg-card border rounded-lg p-2 shadow-xl text-xs">
                        <p className="font-semibold">{p.payload.label}</p>
                        <p className={cn('font-mono font-bold', p.value < 0 ? 'text-destructive' : 'text-success')}>
                          {formatCurrency(p.value)}
                        </p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeOpacity={0.4} />
                <defs>
                  <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey="saldo"
                  stroke="hsl(var(--primary))" strokeWidth={2}
                  fill="url(#saldoGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* === AI SUMMARY === */}
      {aiData?.summary && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 rounded-xl bg-accent/5 border border-accent/15"
        >
          <Sparkles className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-accent mb-1">Análise da IA</p>
            <p className="text-sm leading-relaxed text-foreground">{aiData.summary}</p>
          </div>
        </motion.div>
      )}

      {/* === COVERAGE BAR === */}
      {aiData && !loading && (crisis.deficit > 0 || isProactive) && (() => {
        const completedImpact = aiData.actions
          .filter((_, i) => completedActions.has(i))
          .reduce((sum, a) => sum + a.impactAmount, 0);
        const totalImpact = aiData.totalRecoverable;
        const targetAmount = isProactive ? totalImpact : crisis.deficit;
        const completedPct = targetAmount > 0 ? Math.min(100, (completedImpact / targetAmount) * 100) : 0;
        const totalPct = targetAmount > 0 ? Math.min(100, (totalImpact / targetAmount) * 100) : 0;
        const remainingActions = aiData.actions.length - completedActions.size;

        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-4 space-y-3"
          >
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  completedPct >= 100 ? 'bg-success/10' : 'bg-primary/10',
                )}>
                  {completedPct >= 100 ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <Zap className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold">
                    {isProactive ? 'Progresso das Otimizações' : 'Progresso de Recuperação'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {completedActions.size}/{aiData.actions.length} ações concluídas
                    {remainingActions > 0 && ` · ${remainingActions} pendentes`}
                  </p>
                </div>
              </div>
              {!isProactive && (
                <div className="text-right">
                  <span className={cn(
                    'text-lg font-bold font-mono tabular-nums',
                    completedPct >= 100 ? 'text-success' : completedPct >= 50 ? 'text-warning' : 'text-destructive',
                  )}>
                    {completedPct.toFixed(0)}%
                  </span>
                  <p className="text-[9px] text-muted-foreground">do gap coberto</p>
                </div>
              )}
            </div>

            {/* Stacked progress bar */}
            <div className="relative h-3 rounded-full bg-muted/40 overflow-hidden">
              {/* Total potential (lighter) */}
              {!isProactive && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${totalPct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/15"
                />
              )}
              {/* Completed (solid) */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${isProactive ? (completedActions.size / aiData.actions.length) * 100 : completedPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full',
                  completedPct >= 100 ? 'bg-success' : 'bg-primary',
                )}
              />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <p className="text-xs font-bold text-success font-mono tabular-nums">
                  {formatCurrency(completedImpact)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {isProactive ? 'Ganho conquistado' : 'Recuperado'}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <p className="text-xs font-bold text-foreground font-mono tabular-nums">
                  {formatCurrency(totalImpact - completedImpact)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  Potencial restante
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/20">
                <p className={cn(
                  'text-xs font-bold font-mono tabular-nums',
                  !isProactive && crisis.deficit > completedImpact ? 'text-destructive' : 'text-success',
                )}>
                  {isProactive
                    ? formatCurrency(totalImpact)
                    : formatCurrency(Math.max(0, crisis.deficit - completedImpact))
                  }
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {isProactive ? 'Ganho total possível' : 'Gap restante'}
                </p>
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* === LOADING STATE === */}
      {loading && (
        <Card className="card-elevated">
          <CardContent className="p-8">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground animate-pulse">
                {isProactive
                  ? 'IA buscando oportunidades de otimização financeira...'
                  : 'IA analisando dados financeiros, cobranças, obras e mercado...'}
              </p>
              <p className="text-[10px] text-muted-foreground">Isso pode levar alguns segundos</p>
            </div>
            <div className="mt-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-muted/20 border border-border/30">
                  <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${60 + i * 7}%` }} />
                    <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${40 + i * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === ERROR STATE === */}
      {error && !loading && (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button size="sm" onClick={() => { setRetried(false); fetchWarPlan(); }} className="text-xs">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* === ACTION PLAN === */}
      {aiData && !loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {isProactive ? (
              <Sparkles className="w-4 h-4 text-accent" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-foreground" />
            )}
            <h2 className="text-sm font-bold uppercase tracking-wider">
              {isProactive
                ? `Oportunidades — ${aiData.actions.length} Sugestões Proativas`
                : `Plano de Ação — ${aiData.actions.length} Recomendações`}
            </h2>
          </div>

          {aiData.actions.map((action, i) => {
            const styles = priorityStyles[action.priority] || priorityStyles.importante;
            const Icon = categoryIcons[action.category] || Zap;
            const effort = effortLabels[action.effort] || effortLabels.medio;
            const hasPrefill = !!action.prefill;
            const isDone = completedActions.has(i);

            const matchingTx = action.category === 'cobranca' || action.category === 'renegociacao'
              ? allTransactions.find(t =>
                  (action.prefill?.counterpart && t.counterpart?.toLowerCase().includes(action.prefill.counterpart.toLowerCase())) ||
                  (action.prefill?.amount && t.amount === action.prefill.amount)
                )
              : null;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: isDone ? 0.5 : 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
                className={cn(
                  'rounded-xl border transition-all overflow-hidden',
                  isDone ? 'bg-muted/10 border-border/30' : 'bg-card border-border shadow-sm',
                )}
              >
                {/* Header row */}
                <div className={cn(
                  'flex items-center gap-3 px-5 py-3 border-b',
                  isDone ? 'border-border/20' : cn(styles.bg, styles.border),
                )}>
                  <button
                    onClick={() => {
                      const wasCompleted = isDone;
                      toggleCompleted(i);
                      if (!wasCompleted) {
                        toast.success(`Ação concluída: ${action.title}`, {
                          description: `Impacto recuperado: ${action.impactLabel}`,
                        });
                      }
                    }}
                    className="flex-shrink-0 transition-colors"
                    title={isDone ? 'Desmarcar' : 'Marcar como concluída'}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : (
                      <Circle className={cn('w-5 h-5', styles.text, 'opacity-50 hover:opacity-100')} />
                    )}
                  </button>

                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', isDone ? 'bg-muted/30' : styles.bg)}>
                    <Icon className={cn('w-4 h-4', isDone ? 'text-muted-foreground' : styles.text)} />
                  </div>

                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn('text-[10px] font-bold uppercase tracking-wider border-0', isDone ? 'bg-muted text-muted-foreground' : styles.badge)}>
                      {action.priority}
                    </Badge>
                    <h3 className={cn('text-[15px] font-semibold leading-tight', isDone ? 'text-muted-foreground line-through' : 'text-foreground')}>
                      {action.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={cn('text-sm font-bold font-mono', isDone ? 'text-muted-foreground line-through' : action.impactAmount > 0 ? 'text-success' : 'text-destructive')}>
                      {action.impactLabel}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-3">
                  <p className={cn('text-sm leading-relaxed', isDone ? 'text-muted-foreground/50' : 'text-foreground/80')}>
                    {action.description}
                  </p>

                  {/* Sub-steps */}
                  {action.steps && action.steps.length > 0 && !isDone && (
                    <div className="space-y-1.5 pl-1">
                      {action.steps.map((step, si) => (
                        <div key={si} className="flex items-start gap-2.5">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                            {si + 1}
                          </span>
                          <p className="text-[13px] leading-relaxed text-foreground/70">{step}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Timeline indicator for antecipacao */}
                  {action.category === 'antecipacao' && crisis.negDate && !isDone && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-accent/5 border border-accent/15">
                      <CalendarClock className="w-4 h-4 text-accent flex-shrink-0" />
                      <div className="flex items-center gap-1.5 text-xs flex-wrap">
                        <span className="text-muted-foreground">Vence:</span>
                        <span className="font-semibold text-foreground">{action.deadline.includes('/') ? action.deadline : 'após crise'}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-destructive font-semibold">Crise: {getDayMonth(crisis.negDate)}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-success font-semibold">Antecipar</span>
                      </div>
                    </div>
                  )}

                  {/* Footer: meta + actions */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {action.deadline}
                      </span>
                      <span className={cn('text-xs', isDone ? 'text-muted-foreground' : effort.className)}>
                        {effort.text}
                      </span>
                    </div>

                    {!isDone && (
                      <div className="flex items-center gap-2">
                        {matchingTx && action.category === 'renegociacao' && (
                          <Button
                            size="sm" variant="outline"
                            className="text-xs h-8 gap-1.5"
                            onClick={() => generateScript(matchingTx)}
                          >
                            <Phone className="w-3.5 h-3.5" /> Script
                          </Button>
                        )}
                        {hasPrefill && (
                          <Button
                            size="sm" className="text-xs h-8 gap-1.5"
                            onClick={() => handleActionPrefill(action)}
                          >
                            <Plus className="w-3.5 h-3.5" /> Criar
                          </Button>
                        )}
                        <Link to={action.linkTo}>
                          <Button variant="ghost" size="sm" className="text-xs h-8 gap-1.5 text-muted-foreground">
                            <ExternalLink className="w-3.5 h-3.5" /> Ver
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* === NEGOTIATION SCRIPT DRAWER === */}
      <AnimatePresence>
        {showNegotiation && selectedTx && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Card className="card-elevated border-primary/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary" />
                    Script de Negociação — {selectedTx.counterpart || selectedTx.description}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowNegotiation(false)} className="h-7 text-xs">
                    Fechar
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  {selectedTx.category} · {formatCurrency(selectedTx.amount)} · Vence {getDayMonth(selectedTx.dueDate)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingScript && (
                  <div className="py-8 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Gerando scripts personalizados...</p>
                  </div>
                )}

                {negotiationScript && !loadingScript && (
                  <>
                    <div className="bg-muted/30 rounded-lg p-3 border">
                      <p className="text-xs font-medium mb-1">Perfil do fornecedor</p>
                      <p className="text-xs text-muted-foreground">{negotiationScript.supplierProfile}</p>
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {negotiationScript.recommendedApproach}
                      </Badge>
                    </div>

                    {negotiationScript.scenarios?.map((scenario, i) => (
                      <div key={i} className={cn('rounded-lg border p-4 space-y-3', i === 0 ? 'border-success/30 bg-success/5' : 'bg-muted/20')}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{i === 0 ? '🎯' : i === 1 ? '🔄' : '⚡'} {scenario.name}</span>
                          {scenario.savings > 0 && (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px]">
                              Economia: {formatCurrency(scenario.savings)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{scenario.description}</p>

                        <div className="flex gap-3 text-xs">
                          <div className="bg-background rounded p-2 flex-1 border">
                            <p className="text-[10px] text-muted-foreground">Valor</p>
                            <p className="font-bold font-mono">{formatCurrency(scenario.proposedAmount)}</p>
                          </div>
                          <div className="bg-background rounded p-2 flex-1 border">
                            <p className="text-[10px] text-muted-foreground">Data</p>
                            <p className="font-bold">{scenario.proposedDate ? getDayMonth(scenario.proposedDate) : '—'}</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-medium flex items-center gap-1"><Phone className="w-3 h-3" /> Script ligação</span>
                            <Button variant="ghost" size="sm" className="h-5 px-2 text-[9px] gap-1" onClick={() => copyToClipboard(scenario.script)}>
                              <Copy className="w-3 h-3" /> Copiar
                            </Button>
                          </div>
                          <div className="bg-background rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap border">{scenario.script}</div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-medium flex items-center gap-1"><MessageSquare className="w-3 h-3" /> WhatsApp</span>
                            <Button variant="ghost" size="sm" className="h-5 px-2 text-[9px] gap-1" onClick={() => copyToClipboard(scenario.whatsappMessage)}>
                              <Copy className="w-3 h-3" /> Copiar
                            </Button>
                          </div>
                          <div className="bg-success/5 rounded-lg p-3 text-xs leading-relaxed border border-success/10">{scenario.whatsappMessage}</div>
                        </div>
                      </div>
                    ))}

                    {negotiationScript.objections?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5" /> Objeções e Respostas
                        </p>
                        <div className="space-y-2">
                          {negotiationScript.objections.map((obj, i) => (
                            <div key={i} className="bg-muted/30 rounded-lg p-3 space-y-1 border">
                              <p className="text-xs font-medium text-destructive">❝ {obj.objection}</p>
                              <p className="text-xs text-muted-foreground">→ {obj.response}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border/30">
        <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Plano gerado pela IA com base em dados financeiros em tempo real, histórico de cobranças e indicadores macro.
          Clique em "Atualizar análise" após confirmar transações para recalcular.
        </p>
      </div>

      {/* Transaction form from AI suggestions */}
      {txFormDefaults && (
        <TransactionFormDialog
          open={txFormOpen}
          onClose={() => { setTxFormOpen(false); setTxFormDefaults(null); }}
          transaction={null}
          defaultType={txFormDefaults.type}
          defaultObraId={txFormDefaults.obraId}
          prefill={{
            description: txFormDefaults.description,
            counterpart: txFormDefaults.counterpart,
            amount: txFormDefaults.amount,
            category: txFormDefaults.category,
            notes: txFormDefaults.notes,
          }}
        />
      )}
    </div>
  );
}

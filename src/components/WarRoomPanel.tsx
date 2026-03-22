import { useState } from 'react';
import { formatCurrency, getDayMonth } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Siren, ShieldAlert, ChevronDown, ChevronUp, RefreshCw,
  Phone, AlertTriangle, HandCoins,
  Scissors, Clock, Zap, Sparkles, Plus, ExternalLink, CheckCircle2, Circle,
  CalendarClock, Landmark, ArrowRightLeft, TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import type { TransactionType } from '@/lib/types';
import { useWarRoom, priorityStyles, effortLabels, type WarAction } from '@/hooks/useWarRoom';

const categoryIcons: Record<string, React.ElementType> = {
  cobranca: Phone,
  antecipacao: HandCoins,
  renegociacao: ArrowRightLeft,
  corte: Scissors,
  credito: Landmark,
  cronograma: CalendarClock,
};

interface WarRoomProps {
  period?: { from: string; to: string; label: string };
}

export default function WarRoomPanel({ period }: WarRoomProps = {}) {
  const {
    crisis, aiData, loading, error, completedActions,
    toggleCompleted, fetchWarPlan, resolveActionPrefill, setRetried,
  } = useWarRoom({ mode: 'panel' });

  const [expanded, setExpanded] = useState(true);
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

  // Don't render if no crisis
  if (!crisis.negDate) return null;

  const countdown = crisis.negDays!;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-xl border-2 border-destructive/40 shadow-[0_0_30px_-5px_hsl(var(--destructive)/0.2)]"
      >
        {/* Pulsing border */}
        <div className="absolute inset-0 rounded-xl border-2 border-destructive/20 animate-pulse pointer-events-none" />

        {/* HEADER */}
        <button onClick={() => setExpanded(e => !e)} className="w-full bg-destructive/5 hover:bg-destructive/8 transition-colors">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-destructive/15 flex items-center justify-center">
                <Siren className="w-6 h-6 text-destructive animate-pulse" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-destructive-foreground" />
              </div>
            </div>

            <div className="flex-1 text-left">
              <h2 className="text-sm font-bold tracking-tight text-destructive">
                COMANDO DE GUERRA — CAIXA NEGATIVO PREVISTO
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-bold text-destructive">{crisis.negDate}</span>
                {' '}({countdown}d) · Déficit: <span className="font-bold text-destructive">{formatCurrency(crisis.deficit)}</span>
                {aiData && !loading && (
                  <span className="ml-2 text-accent">· {aiData.actions.length} ações recomendadas pela IA</span>
                )}
                {loading && <span className="ml-2 text-muted-foreground animate-pulse">· IA analisando...</span>}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/comando-de-guerra" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10">
                  <ExternalLink className="w-3 h-3" /> Abrir Painel Completo
                </Button>
              </Link>
              <Button
                size="sm" variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); setRetried(false); fetchWarPlan(); }}
                disabled={loading}
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </Button>
              <div className="text-center px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className={cn(
                  'text-3xl font-bold font-mono leading-none',
                  countdown <= 7 ? 'text-destructive animate-pulse' : countdown <= 14 ? 'text-destructive' : 'text-warning'
                )}>
                  {countdown}
                </p>
                <p className="text-[8px] text-muted-foreground uppercase tracking-widest mt-1">dias</p>
              </div>
              {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 w-full bg-muted/30">
            <motion.div
              className="h-full bg-gradient-to-r from-warning via-destructive to-destructive"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(5, 100 - (countdown / 90) * 100)}%` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </div>
        </button>

        {/* BODY */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="px-5 py-4 space-y-4 bg-background">
                {/* Situation summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Saldo Atual', value: formatCurrency(crisis.currentBalance), color: 'text-foreground' },
                    { label: 'Saídas até D-Day', value: formatCurrency(crisis.upcomingPayables), color: 'text-destructive' },
                    { label: 'Entradas Previstas', value: formatCurrency(crisis.pendingReceivables), color: 'text-success' },
                  ].map(m => (
                    <div key={m.label} className="text-center p-3 rounded-lg bg-muted/30 border border-border/40">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                      <p className={cn('text-sm font-bold font-mono mt-1', m.color)}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* GAP indicator */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
                  <TrendingDown className="w-5 h-5 text-destructive flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-destructive">
                      GAP de {formatCurrency(crisis.deficit)} precisa ser coberto
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Ponto mais crítico: {formatCurrency(crisis.minBal)} em {getDayMonth(crisis.minDate)}
                    </p>
                  </div>
                  {aiData && (
                    <div className="text-right">
                      <p className="text-[9px] text-muted-foreground uppercase">Cobertura IA</p>
                      <p className={cn('text-sm font-bold font-mono', aiData.coveragePercentage >= 100 ? 'text-success' : 'text-warning')}>
                        {aiData.coveragePercentage.toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>

                {/* AI Coverage bar */}
                {aiData && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Potencial de recuperação: {formatCurrency(aiData.totalRecoverable)}</span>
                      <span className={cn('font-semibold', aiData.coveragePercentage >= 100 ? 'text-success' : 'text-warning')}>
                        {aiData.coveragePercentage.toFixed(0)}% do gap
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, aiData.coveragePercentage)}
                      className="h-2"
                    />
                  </div>
                )}

                {/* AI Summary */}
                {aiData?.summary && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent/5 border border-accent/15">
                    <Sparkles className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed text-foreground">{aiData.summary}</p>
                  </div>
                )}

                {/* Loading state */}
                {loading && (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-accent animate-pulse" />
                      <span className="text-xs text-muted-foreground animate-pulse">
                        IA analisando dados financeiros, cobranças e mercado...
                      </span>
                    </div>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-muted/20 border border-border/30">
                        <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${60 + i * 8}%` }} />
                          <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${40 + i * 10}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error state */}
                {error && !loading && (
                  <div className="text-center py-4">
                    <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground mb-3">{error}</p>
                    <Button size="sm" variant="outline" onClick={() => { setRetried(false); fetchWarPlan(); }} className="text-xs h-7">
                      Tentar novamente
                    </Button>
                  </div>
                )}

                {/* AI Action Items */}
                {aiData && !loading && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert className="w-4 h-4 text-foreground" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Plano de Ação IA ({aiData.actions.length} recomendações)
                      </h3>
                      <div className="flex-1" />
                      {completedActions.size > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-success">
                            {completedActions.size}/{aiData.actions.length} concluídas
                          </span>
                          <Progress
                            value={(completedActions.size / aiData.actions.length) * 100}
                            className="h-1.5 w-20"
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {aiData.actions.map((action, i) => {
                        const styles = priorityStyles[action.priority] || priorityStyles.importante;
                        const Icon = categoryIcons[action.category] || Zap;
                        const effort = effortLabels[action.effort] || effortLabels.medio;
                        const hasPrefill = !!action.prefill;
                        const isDone = completedActions.has(i);

                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: isDone ? 0.5 : 1, x: 0 }}
                            transition={{ delay: i * 0.06, duration: 0.3 }}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-lg border transition-all',
                              isDone ? 'bg-muted/20 border-border/30' : cn(styles.bg, styles.border),
                            )}
                          >
                            <button
                              onClick={() => toggleCompleted(i)}
                              className="mt-1 flex-shrink-0 transition-colors"
                              title={isDone ? 'Desmarcar' : 'Marcar como concluída'}
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-5 h-5 text-success" />
                              ) : (
                                <Circle className={cn('w-5 h-5', styles.text, 'opacity-40 hover:opacity-100')} />
                              )}
                            </button>

                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', isDone ? 'bg-muted/30' : styles.bg)}>
                              <Icon className={cn('w-4 h-4', isDone ? 'text-muted-foreground' : styles.text)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', isDone ? 'bg-muted text-muted-foreground line-through' : styles.badge)}>
                                  {action.priority}
                                </span>
                                <span className={cn('text-xs font-semibold', isDone ? 'text-muted-foreground line-through' : 'text-foreground')}>{action.title}</span>
                                <span className={cn('text-[9px]', isDone ? 'text-muted-foreground' : effort.className)}>{effort.text}</span>
                              </div>
                              <p className={cn('text-[10px] leading-relaxed mt-1', isDone ? 'text-muted-foreground/60' : 'text-muted-foreground')}>{action.description}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className={cn('text-[10px] font-bold', isDone ? 'text-muted-foreground line-through' : action.impactAmount > 0 ? 'text-success' : 'text-destructive')}>
                                  ⚡ {action.impactLabel}
                                </span>
                                <span className="text-[9px] text-muted-foreground">
                                  <Clock className="w-3 h-3 inline mr-0.5" />{action.deadline}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                              {hasPrefill && !isDone && (
                                <Button
                                  size="sm" variant="default"
                                  className="text-[10px] h-7 gap-1"
                                  onClick={() => handleActionPrefill(action)}
                                >
                                  <Plus className="w-3 h-3" /> Criar
                                </Button>
                              )}
                              {!isDone && (
                                <Link to={action.linkTo}>
                                  <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1 w-full">
                                    <ExternalLink className="w-3 h-3" /> Ver
                                  </Button>
                                </Link>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                  <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Plano gerado pela IA com base em dados financeiros em tempo real, histórico de cobranças e indicadores macro.
                    Atualiza automaticamente conforme transações são confirmadas.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

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
    </>
  );
}

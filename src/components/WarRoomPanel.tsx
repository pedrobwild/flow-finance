import { useMemo, useState } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween, formatDateFull } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Siren, ShieldAlert, ChevronDown, ChevronUp,
  Phone, Receipt, Pause, ArrowRightLeft, CalendarClock,
  TrendingDown, AlertTriangle, Landmark, HandCoins, Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface WarAction {
  id: string;
  icon: React.ElementType;
  priority: 'urgente' | 'importante' | 'recomendado';
  title: string;
  description: string;
  impact: string;
  linkTo?: string;
  linkLabel?: string;
}

export default function WarRoomPanel() {
  const { filteredTransactions: transactions, filteredBalance: currentBalance, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const { obras } = useObras();
  const { confirmTransaction } = useFinance();
  const today = todayISO();
  const [expanded, setExpanded] = useState(true);

  const analysis = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    let negDate: string | null = null;
    let negDays: number | null = null;
    let minBal = bal;
    let minDate = today;

    for (let i = 0; i <= 90; i++) {
      const date = addDays(today, i);
      const projected = projectedBalance(date);
      if (projected < minBal) {
        minBal = projected;
        minDate = date;
      }
      if (projected < 0 && negDate === null) {
        negDate = date;
        negDays = i;
      }
    }

    // Overdue receivables
    const overdueReceivables = transactions.filter(
      t => t.type === 'receber' && t.status === 'atrasado' && t.dueDate < today
    );
    const totalOverdue = overdueReceivables.reduce((s, t) => s + t.amount, 0);

    // Upcoming payables before negative date
    const upcomingPayables = negDate
      ? transactions.filter(
          t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= negDate!
        )
      : [];
    const totalUpcomingPayables = upcomingPayables.reduce((s, t) => s + t.amount, 0);

    // Pending receivables before negative date
    const pendingReceivables = negDate
      ? transactions.filter(
          t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= negDate!
        )
      : [];
    const totalPendingReceivables = pendingReceivables.reduce((s, t) => s + t.amount, 0);

    // Largest payables (negotiable)
    const largestPayables = upcomingPayables
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    // Non-critical payables (baixa/normal priority)
    const postponablePayables = upcomingPayables
      .filter(t => t.priority === 'normal' || t.priority === 'baixa')
      .sort((a, b) => b.amount - a.amount);
    const totalPostponable = postponablePayables.reduce((s, t) => s + t.amount, 0);

    // Amount needed to survive
    const deficit = negDate ? Math.abs(minBal) : 0;

    return {
      negDate,
      negDays,
      minBal,
      minDate,
      currentBalance: bal,
      overdueReceivables,
      totalOverdue,
      upcomingPayables,
      totalUpcomingPayables,
      pendingReceivables,
      totalPendingReceivables,
      largestPayables,
      postponablePayables,
      totalPostponable,
      deficit,
    };
  }, [transactions, currentBalance, projectedBalance, today]);

  // Don't render if no negative projection
  if (analysis.negDate === null) return null;

  const actions: WarAction[] = [];

  // 1. Cobrar recebíveis atrasados
  if (analysis.totalOverdue > 0) {
    actions.push({
      id: 'cobrar-atrasados',
      icon: Phone,
      priority: 'urgente',
      title: `Cobrar ${analysis.overdueReceivables.length} recebíveis atrasados`,
      description: `${formatCurrency(analysis.totalOverdue)} em recebíveis vencidos. Contate os clientes imediatamente.`,
      impact: `Recupera até ${formatCurrency(analysis.totalOverdue)}`,
      linkTo: '/contas-receber',
      linkLabel: 'Ver recebíveis',
    });
  }

  // 2. Antecipar recebíveis pendentes
  if (analysis.totalPendingReceivables > 0) {
    actions.push({
      id: 'antecipar-recebiveis',
      icon: HandCoins,
      priority: 'urgente',
      title: 'Antecipar recebíveis pendentes',
      description: `${formatCurrency(analysis.totalPendingReceivables)} em entradas previstas antes de ${getDayMonth(analysis.negDate!)}. Negocie antecipação com clientes.`,
      impact: `Antecipa até ${formatCurrency(analysis.totalPendingReceivables)}`,
      linkTo: '/contas-receber',
      linkLabel: 'Ver pendentes',
    });
  }

  // 3. Postergar pagamentos não-críticos
  if (analysis.totalPostponable > 0) {
    actions.push({
      id: 'postergar-pagamentos',
      icon: CalendarClock,
      priority: 'importante',
      title: `Postergar ${analysis.postponablePayables.length} pagamentos não-críticos`,
      description: `${formatCurrency(analysis.totalPostponable)} em saídas de prioridade normal/baixa podem ser renegociadas.`,
      impact: `Adia ${formatCurrency(analysis.totalPostponable)}`,
      linkTo: '/contas-pagar',
      linkLabel: 'Ver pagamentos',
    });
  }

  // 4. Renegociar maiores pagamentos
  if (analysis.largestPayables.length > 0) {
    const top3Total = analysis.largestPayables.reduce((s, t) => s + t.amount, 0);
    actions.push({
      id: 'renegociar-maiores',
      icon: ArrowRightLeft,
      priority: 'importante',
      title: 'Renegociar maiores saídas do período',
      description: `Top ${analysis.largestPayables.length}: ${analysis.largestPayables.map(t => `${t.description} (${formatCurrency(t.amount)})`).join(', ')}`,
      impact: `Renegocia ${formatCurrency(top3Total)}`,
      linkTo: '/contas-pagar',
      linkLabel: 'Ver detalhes',
    });
  }

  // 5. Pausar gastos não-essenciais
  actions.push({
    id: 'pausar-gastos',
    icon: Pause,
    priority: 'recomendado',
    title: 'Congelar novos gastos até passar a crise',
    description: `Suspenda aprovações de compras e contratações até ${getDayMonth(analysis.negDate!)}. Foco em sobrevivência de caixa.`,
    impact: `Protege o caixa`,
  });

  // 6. Buscar crédito emergencial
  if (analysis.deficit > 50000) {
    actions.push({
      id: 'credito-emergencial',
      icon: Landmark,
      priority: 'recomendado',
      title: 'Avaliar crédito emergencial',
      description: `Déficit projetado de ${formatCurrency(analysis.deficit)}. Considere linha de crédito ou antecipação de recebíveis bancária.`,
      impact: `Cobre déficit de ${formatCurrency(analysis.deficit)}`,
    });
  }

  const priorityOrder = { urgente: 0, importante: 1, recomendado: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const priorityStyles = {
    urgente: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', badge: 'bg-destructive text-destructive-foreground' },
    importante: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', badge: 'bg-warning text-warning-foreground' },
    recomendado: { bg: 'bg-accent/10', border: 'border-accent/30', text: 'text-accent', badge: 'bg-accent text-accent-foreground' },
  };

  const countdown = analysis.negDays!;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-xl border-2 border-destructive/40 shadow-[0_0_30px_-5px_hsl(var(--destructive)/0.2)]"
    >
      {/* Pulsing border effect */}
      <div className="absolute inset-0 rounded-xl border-2 border-destructive/20 animate-pulse pointer-events-none" />

      {/* HEADER - Always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full bg-destructive/5 hover:bg-destructive/8 transition-colors"
      >
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-destructive/15 flex items-center justify-center">
              <Siren className="w-6 h-6 text-destructive animate-pulse" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
              <span className="text-[9px] font-bold text-destructive-foreground">!</span>
            </div>
          </div>

          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-destructive">
                COMANDO DE GUERRA — CAIXA NEGATIVO PREVISTO
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Projeção indica saldo negativo em <span className="font-bold text-destructive">{formatDateFull(analysis.negDate!)}</span>
              {' '}({countdown} dias) · Déficit: <span className="font-bold text-destructive">{formatCurrency(analysis.deficit)}</span>
            </p>
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-3">
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

        {/* Progress bar showing time until negative */}
        <div className="h-1 w-full bg-muted/30">
          <motion.div
            className="h-full bg-gradient-to-r from-warning via-destructive to-destructive"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(5, 100 - (countdown / 90) * 100)}%` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
        </div>
      </button>

      {/* BODY - Expandable */}
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
                  { label: 'Saldo Atual', value: formatCurrency(analysis.currentBalance), color: 'text-foreground' },
                  { label: 'Saídas até D-Day', value: formatCurrency(analysis.totalUpcomingPayables), color: 'text-destructive' },
                  { label: 'Entradas Previstas', value: formatCurrency(analysis.totalPendingReceivables), color: 'text-success' },
                ].map(m => (
                  <div key={m.label} className="text-center p-3 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                    <p className={cn('text-sm font-bold font-mono mt-1', m.color)}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Visual gap indicator */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
                <TrendingDown className="w-5 h-5 text-destructive flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-destructive">
                    GAP de {formatCurrency(analysis.deficit)} precisa ser coberto
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Ponto mais crítico: {formatCurrency(analysis.minBal)} em {getDayMonth(analysis.minDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-muted-foreground uppercase">Necessário</p>
                  <p className="text-sm font-bold text-destructive font-mono">{formatCurrency(analysis.deficit)}</p>
                </div>
              </div>

              {/* Action items */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="w-4 h-4 text-foreground" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Plano de Ação ({actions.length} recomendações)
                  </h3>
                </div>
                <div className="space-y-2">
                  {actions.map((action, i) => {
                    const styles = priorityStyles[action.priority];
                    const Icon = action.icon;
                    return (
                      <motion.div
                        key={action.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border',
                          styles.bg, styles.border
                        )}
                      >
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', styles.bg)}>
                          <Icon className={cn('w-4 h-4', styles.text)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', styles.badge)}>
                              {action.priority}
                            </span>
                            <span className="text-xs font-semibold text-foreground">{action.title}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">{action.description}</p>
                          <p className="text-[10px] font-semibold text-accent mt-1">⚡ {action.impact}</p>
                        </div>
                        {action.linkTo && (
                          <Link to={action.linkTo}>
                            <Button variant="outline" size="sm" className="text-[10px] h-7 flex-shrink-0">
                              {action.linkLabel}
                            </Button>
                          </Link>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Footer note */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Este painel é atualizado em tempo real conforme transações são confirmadas ou adicionadas.
                  Resolva as ações urgentes primeiro para deslocar a data de caixa negativo.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
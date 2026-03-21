import { useState, useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import {
  Obra, ObraStatus, ObraFinancials,
  OBRA_STATUS_OPTIONS, OBRA_STATUS_LABELS, OBRA_STATUS_COLORS,
} from '@/lib/types';
import { formatCurrency, formatDate, formatDateFull, todayISO } from '@/lib/helpers';
import { motion } from 'framer-motion';
import {
  Building2, Plus, Pencil, Trash2, Search, Eye, AlertTriangle,
  DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ObraFormDialog from '@/components/ObraFormDialog';
import ObraDetailSheet from '@/components/ObraDetailSheet';

const sect = (delay: number) => ({
  initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function Obras() {
  const { obras, isLoading, deleteObra, getObraFinancials, getActiveObrasWithFinancials } = useObras();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ObraStatus | 'todas'>('todas');
  const [formOpen, setFormOpen] = useState(false);
  const [editingObra, setEditingObra] = useState<Obra | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailObra, setDetailObra] = useState<Obra | null>(null);

  const activeObras = getActiveObrasWithFinancials();

  const kpis = useMemo(() => {
    const carteira = activeObras.reduce((s, o) => s + o.totalContractValue, 0);
    const aReceber = activeObras.reduce((s, o) => s + o.totalPendingReceivable + o.totalOverdueReceivable, 0);
    const custosPendentes = activeObras.reduce((s, o) => s + o.totalPendingCost, 0);
    const margins = activeObras.filter(o => o.totalContractValue > 0);
    const margemMedia = margins.length > 0
      ? margins.reduce((s, o) => s + o.grossMarginPercentage * o.totalContractValue, 0) / margins.reduce((s, o) => s + o.totalContractValue, 0)
      : 0;
    return { carteira, aReceber, custosPendentes, margemMedia };
  }, [activeObras]);

  const filtered = useMemo(() => {
    return obras
      .filter(o => statusFilter === 'todas' || o.status === statusFilter)
      .filter(o =>
        `${o.code} ${o.clientName} ${o.condominium} ${o.unitNumber} ${o.address}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
      .sort((a, b) => {
        const order: Record<string, number> = { em_execucao: 0, contratada: 1, proposta: 2, pausada: 3, concluida: 4, cancelada: 5 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });
  }, [obras, search, statusFilter]);

  const openNew = () => { setEditingObra(null); setFormOpen(true); };
  const openEdit = (obra: Obra) => { setEditingObra(obra); setFormOpen(true); };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    obras.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [obras]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...sect(0)} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Obras
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão centralizada de obras — contratos, parcelas e custos.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Obra
        </Button>
      </motion.div>

      {/* KPIs */}
      {activeObras.length > 0 && (
        <motion.div {...sect(0.04)} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Wallet, label: 'Carteira Ativa', value: formatCurrency(kpis.carteira), bg: 'bg-primary/10', color: 'text-primary' },
            { icon: ArrowUpRight, label: 'A Receber', value: formatCurrency(kpis.aReceber), bg: 'bg-success/10', color: 'text-success' },
            { icon: ArrowDownRight, label: 'Custos Pendentes', value: formatCurrency(kpis.custosPendentes), bg: 'bg-destructive/10', color: 'text-destructive' },
            { icon: TrendingUp, label: 'Margem Média', value: `${kpis.margemMedia.toFixed(0)}%`, bg: 'bg-warning/10', color: 'text-warning' },
          ].map((kpi, i) => (
            <div key={kpi.label} className="card-elevated p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', kpi.bg)}>
                  <kpi.icon className={cn('w-3.5 h-3.5', kpi.color)} />
                </div>
                <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">{kpi.label}</span>
              </div>
              <p className="text-lg font-bold font-mono tracking-tight">{kpi.value}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* Filters */}
      <motion.div {...sect(0.08)} className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, cliente, condomínio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button
            variant={statusFilter === 'todas' ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setStatusFilter('todas')}
          >
            Todas ({obras.length})
          </Button>
          {(['em_execucao', 'contratada', 'concluida', 'pausada', 'proposta', 'cancelada'] as ObraStatus[]).map(s => {
            const count = statusCounts[s] || 0;
            if (count === 0 && s !== statusFilter) return null;
            return (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setStatusFilter(s)}
              >
                {OBRA_STATUS_LABELS[s]} ({count})
              </Button>
            );
          })}
        </div>
      </motion.div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma obra encontrada</p>
            <p className="text-sm mt-1">Clique em "Nova Obra" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((obra, i) => {
            const fin = getObraFinancials(obra.id);
            const statusColor = OBRA_STATUS_COLORS[obra.status];
            const receivedPct = fin.totalContractValue > 0 ? Math.round(fin.totalReceived / fin.totalContractValue * 100) : 0;
            const costPct = fin.totalContractValue > 0 ? Math.round(fin.totalCost / fin.totalContractValue * 100) : 0;
            const parcDiff = fin.totalContractValue > 0 && Math.abs(fin.totalReceivable - fin.totalContractValue) > 1;

            return (
              <motion.div
                key={obra.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="hover:border-primary/30 transition-colors h-full">
                  <CardContent className="p-4 space-y-3 flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-mono text-xs text-primary font-semibold">{obra.code}</p>
                        <p className="font-semibold mt-1">{obra.clientName}</p>
                      </div>
                      <Badge className={cn('text-[10px]', statusColor.bg, statusColor.text)} variant="outline">
                        {OBRA_STATUS_LABELS[obra.status]}
                      </Badge>
                    </div>

                    {/* Location */}
                    {(obra.condominium || obra.unitNumber) && (
                      <p className="text-xs text-muted-foreground">
                        {obra.condominium}{obra.condominium && obra.unitNumber ? ' — ' : ''}
                        {obra.unitNumber && `Un. ${obra.unitNumber}`}
                      </p>
                    )}

                    {/* Contract value & progress */}
                    {fin.totalContractValue > 0 && (
                      <div className="space-y-1.5 flex-1">
                        <p className="text-xs text-muted-foreground">
                          Contrato: <span className="font-mono font-semibold text-foreground">{formatCurrency(fin.totalContractValue)}</span>
                        </p>

                        {/* Receivable progress bar */}
                        <div className="space-y-1">
                          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                            <div
                              className="h-full bg-success transition-all duration-500"
                              style={{ width: `${Math.min(receivedPct, 100)}%` }}
                            />
                            {fin.totalOverdueReceivable > 0 && (
                              <div
                                className="h-full bg-destructive animate-pulse"
                                style={{ width: `${Math.min(Math.round(fin.totalOverdueReceivable / fin.totalContractValue * 100), 100 - receivedPct)}%` }}
                              />
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-success font-mono font-semibold">{receivedPct}% recebido</span>
                            <span className="font-mono text-muted-foreground">{formatCurrency(fin.totalReceived)}</span>
                          </div>
                        </div>

                        {/* Costs & Margin */}
                        <p className="text-xs text-muted-foreground">
                          Custos: <span className="font-mono font-medium text-foreground">{formatCurrency(fin.totalCost)}</span>
                          <span className="text-[10px] ml-1">({costPct}% do contrato)</span>
                        </p>
                        <p className="text-xs">
                          Margem projetada: <span className={cn('font-mono font-semibold', fin.grossMargin >= 0 ? 'text-success' : 'text-destructive')}>
                            {formatCurrency(fin.grossMargin)} ({fin.grossMarginPercentage.toFixed(0)}%)
                          </span>
                        </p>
                      </div>
                    )}

                    {/* Next transactions */}
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      {fin.nextReceivable && (
                        <p>
                          <span className="text-success">↑</span> Próx. recebimento: {formatCurrency(fin.nextReceivable.amount)} em {formatDate(fin.nextReceivable.dueDate)}
                        </p>
                      )}
                      {fin.nextPayable && (
                        <p>
                          <span className="text-destructive">↓</span> Próx. pagamento: {formatCurrency(fin.nextPayable.amount)} em {formatDate(fin.nextPayable.dueDate)}
                        </p>
                      )}
                    </div>

                    {/* Parcelas mismatch warning */}
                    {parcDiff && (
                      <div className="flex items-start gap-1.5 p-2 rounded-md bg-warning/10 text-[10px] text-warning">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>
                          Parcelas: {formatCurrency(fin.totalReceivable)} · Contrato: {formatCurrency(fin.totalContractValue)} · Dif: {formatCurrency(Math.abs(fin.totalReceivable - fin.totalContractValue))}
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1 pt-1 border-t">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => setDetailObra(obra)}>
                        <Eye className="h-3 w-3" /> Detalhes
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(obra)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteId(obra.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <ObraFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingObra(null); }}
        obra={editingObra}
      />

      {/* Detail Sheet */}
      <ObraDetailSheet
        obra={detailObra}
        onClose={() => setDetailObra(null)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover obra?</AlertDialogTitle>
            <AlertDialogDescription>
              Transações vinculadas a esta obra perderão a referência. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deleteObra(deleteId); setDeleteId(null); } }}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

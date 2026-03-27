import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, formatDateFull, toISODate } from '@/lib/helpers';
import { exportToCSV, exportToExcel, exportToPDF } from '@/lib/export-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CheckCircle2, XCircle, FileText, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import ExportDropdown from './ExportDropdown';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface MonthGroup {
  key: string;
  label: string;
  total: number;
  countAll: number;
  countWithNF: number;
  countWithoutNF: number;
  totalWithNF: number;
  totalWithoutNF: number;
  coverage: number;
  countWithReceipt: number;
  countWithoutReceipt: number;
  receiptCoverage: number;
}

export default function NFReportDialog({ open, onClose }: Props) {
  const { filteredTransactions } = useObraFilter();
  const { obras } = useObras();
  const [viewMode, setViewMode] = useState<'month' | 'detail'>('month');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const confirmedPayables = useMemo(() => {
    let txs = filteredTransactions.filter(t => t.type === 'pagar' && t.status === 'confirmado');
    if (dateFrom) {
      const fromISO = toISODate(dateFrom);
      txs = txs.filter(t => t.dueDate >= fromISO);
    }
    if (dateTo) {
      const toISO = toISODate(dateTo);
      txs = txs.filter(t => t.dueDate <= toISO);
    }
    return txs;
  }, [filteredTransactions, dateFrom, dateTo]);

  const monthGroups = useMemo(() => {
    const map = new Map<string, MonthGroup>();
    confirmedPayables.forEach(t => {
      const d = new Date(t.dueDate + 'T12:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      if (!map.has(key)) {
        map.set(key, { key, label, total: 0, countAll: 0, countWithNF: 0, countWithoutNF: 0, totalWithNF: 0, totalWithoutNF: 0, coverage: 0, countWithReceipt: 0, countWithoutReceipt: 0, receiptCoverage: 0 });
      }
      const g = map.get(key)!;
      g.total += t.amount;
      g.countAll++;
      if (t.attachmentUrl) {
        g.countWithNF++;
        g.totalWithNF += t.amount;
      } else {
        g.countWithoutNF++;
        g.totalWithoutNF += t.amount;
      }
      if (t.receiptUrl) { g.countWithReceipt++; } else { g.countWithoutReceipt++; }
    });
    map.forEach(g => {
      g.coverage = g.countAll > 0 ? (g.countWithNF / g.countAll) * 100 : 0;
      g.receiptCoverage = g.countAll > 0 ? (g.countWithReceipt / g.countAll) * 100 : 0;
    });
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [confirmedPayables]);

  const totals = useMemo(() => {
    const withReceipt = confirmedPayables.filter(t => t.receiptUrl).length;
    return {
      total: confirmedPayables.reduce((s, t) => s + t.amount, 0),
      withNF: confirmedPayables.filter(t => t.attachmentUrl).length,
      withoutNF: confirmedPayables.filter(t => !t.attachmentUrl).length,
      totalWithNF: confirmedPayables.filter(t => t.attachmentUrl).reduce((s, t) => s + t.amount, 0),
      totalWithoutNF: confirmedPayables.filter(t => !t.attachmentUrl).reduce((s, t) => s + t.amount, 0),
      coverage: confirmedPayables.length > 0
        ? (confirmedPayables.filter(t => t.attachmentUrl).length / confirmedPayables.length) * 100
        : 0,
      withReceipt,
      withoutReceipt: confirmedPayables.length - withReceipt,
      receiptCoverage: confirmedPayables.length > 0 ? (withReceipt / confirmedPayables.length) * 100 : 0,
    };
  }, [confirmedPayables]);

  const detailRows = useMemo(() =>
    confirmedPayables
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      .map(t => {
        const obra = t.obraId ? obras.find(o => o.id === t.obraId) : null;
        return {
          description: t.description,
          counterpart: t.counterpart,
          amount: t.amount,
          dueDate: t.dueDate,
          category: t.category,
          obra: obra?.code || '-',
          hasNF: !!t.attachmentUrl,
          hasReceipt: !!t.receiptUrl,
        };
      }),
    [confirmedPayables, obras]
  );

  const handleExportCSV = () => {
    const rows = detailRows.map(r => ({
      'Descrição': r.description,
      'Fornecedor': r.counterpart,
      'Valor': formatCurrency(r.amount),
      'Vencimento': formatDateFull(r.dueDate),
      'Categoria': r.category,
      'Obra': r.obra,
      'NF Anexada': r.hasNF ? 'Sim' : 'Não',
      'Comprovante': r.hasReceipt ? 'Sim' : 'Não',
    }));
    exportToCSV(rows, 'relatorio-nf');
  };

  const handleExportExcel = () => {
    const rows = detailRows.map(r => ({
      'Descrição': r.description,
      'Fornecedor': r.counterpart,
      'Valor': formatCurrency(r.amount),
      'Vencimento': formatDateFull(r.dueDate),
      'Categoria': r.category,
      'Obra': r.obra,
      'NF Anexada': r.hasNF ? 'Sim' : 'Não',
      'Comprovante': r.hasReceipt ? 'Sim' : 'Não',
    }));
    exportToExcel(rows, 'relatorio-nf');
  };

  const handleExportPDF = () => {
    const headers = ['Descrição', 'Fornecedor', 'Valor', 'Vencimento', 'Categoria', 'Obra', 'NF', 'Comp.'];
    const rows = detailRows.map(r => [
      r.description, r.counterpart, formatCurrency(r.amount),
      formatDateFull(r.dueDate), r.category, r.obra, r.hasNF ? '✓' : '✗', r.hasReceipt ? '✓' : '✗',
    ]);
    exportToPDF('Relatório de Notas Fiscais e Comprovantes', headers, rows);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4 text-primary" />
            Relatório de Auditoria — NF e Comprovantes
          </DialogTitle>
        </DialogHeader>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Pago</p>
            <p className="text-sm font-bold font-mono mt-1">{formatCurrency(totals.total)}</p>
            <p className="text-[10px] text-muted-foreground">{confirmedPayables.length} transações</p>
          </div>
          <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cobertura NF</p>
            <p className={cn('text-sm font-bold font-mono mt-1', totals.coverage >= 80 ? 'text-success' : totals.coverage >= 50 ? 'text-warning' : 'text-destructive')}>
              {totals.coverage.toFixed(0)}%
            </p>
            <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', totals.coverage >= 80 ? 'bg-success' : totals.coverage >= 50 ? 'bg-warning' : 'bg-destructive')} style={{ width: `${totals.coverage}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{totals.withNF} com / {totals.withoutNF} sem</p>
          </div>
          <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cobertura Comp.</p>
            <p className={cn('text-sm font-bold font-mono mt-1', totals.receiptCoverage >= 80 ? 'text-success' : totals.receiptCoverage >= 50 ? 'text-warning' : 'text-destructive')}>
              {totals.receiptCoverage.toFixed(0)}%
            </p>
            <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', totals.receiptCoverage >= 80 ? 'bg-success' : totals.receiptCoverage >= 50 ? 'bg-warning' : 'bg-destructive')} style={{ width: `${totals.receiptCoverage}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{totals.withReceipt} com / {totals.withoutReceipt} sem</p>
          </div>
        </div>

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1.5', !dateFrom && 'text-muted-foreground')}>
                <CalendarIcon className="w-3.5 h-3.5" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Data início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">até</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1.5', !dateTo && 'text-muted-foreground')}>
                <CalendarIcon className="w-3.5 h-3.5" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Data fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
              Limpar
            </Button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant={viewMode === 'month' ? 'default' : 'outline'}
              onClick={() => setViewMode('month')} className="text-xs h-8"
            >
              Por Mês
            </Button>
            <Button
              size="sm" variant={viewMode === 'detail' ? 'default' : 'outline'}
              onClick={() => setViewMode('detail')} className="text-xs h-8"
            >
              Detalhado
            </Button>
          </div>
          <ExportDropdown onCSV={handleExportCSV} onExcel={handleExportExcel} onPDF={handleExportPDF} />
        </div>

        {/* Monthly view */}
        {viewMode === 'month' && (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[11px]">Período</TableHead>
                  <TableHead className="text-[11px] text-right">Total</TableHead>
                  <TableHead className="text-[11px] text-center">NF</TableHead>
                  <TableHead className="text-[11px] text-center">Comp.</TableHead>
                  <TableHead className="text-[11px] text-right">Cob. NF</TableHead>
                  <TableHead className="text-[11px] text-right">Cob. Comp.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                      Nenhum pagamento confirmado encontrado.
                    </TableCell>
                  </TableRow>
                ) : monthGroups.map(g => (
                  <TableRow key={g.key}>
                    <TableCell className="text-xs font-medium capitalize">{g.label}</TableCell>
                    <TableCell className="text-xs font-mono text-right">{formatCurrency(g.total)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cn("text-[10px] gap-1", g.countWithNF > 0 ? "bg-success/5 text-success border-success/20" : "text-muted-foreground")}>
                        <CheckCircle2 className="w-3 h-3" />{g.countWithNF}/{g.countAll}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cn("text-[10px] gap-1", g.countWithReceipt > 0 ? "bg-success/5 text-success border-success/20" : "text-muted-foreground")}>
                        <CheckCircle2 className="w-3 h-3" />{g.countWithReceipt}/{g.countAll}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn('text-xs font-bold', g.coverage >= 80 ? 'text-success' : g.coverage >= 50 ? 'text-warning' : 'text-destructive')}>
                        {g.coverage.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn('text-xs font-bold', g.receiptCoverage >= 80 ? 'text-success' : g.receiptCoverage >= 50 ? 'text-warning' : 'text-destructive')}>
                        {g.receiptCoverage.toFixed(0)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Detail view */}
        {viewMode === 'detail' && (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[11px]">Descrição</TableHead>
                  <TableHead className="text-[11px]">Fornecedor</TableHead>
                  <TableHead className="text-[11px] text-right">Valor</TableHead>
                  <TableHead className="text-[11px]">Vencimento</TableHead>
                  <TableHead className="text-[11px]">Obra</TableHead>
                  <TableHead className="text-[11px] text-center">NF</TableHead>
                  <TableHead className="text-[11px] text-center">Comp.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                      Nenhum pagamento confirmado encontrado.
                    </TableCell>
                  </TableRow>
                ) : detailRows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs max-w-[150px] truncate">{r.description}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{r.counterpart}</TableCell>
                    <TableCell className="text-xs font-mono text-right">{formatCurrency(r.amount)}</TableCell>
                    <TableCell className="text-xs">{formatDateFull(r.dueDate)}</TableCell>
                    <TableCell className="text-xs">{r.obra}</TableCell>
                    <TableCell className="text-center">
                      {r.hasNF ? (
                        <CheckCircle2 className="w-4 h-4 text-success mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive mx-auto" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

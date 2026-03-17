import { useState, useMemo } from 'react';
import { useBills } from '@/lib/bills-context';
import { formatCurrency, formatDateFull } from '@/lib/helpers';
import { Bill, BillStatus, CostCenter, COST_CENTERS, STATUS_LABELS, STATUS_OPTIONS } from '@/lib/types';
import { Check, Pencil, Trash2, Plus, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import BillFormDialog from './BillFormDialog';

export default function BillsTable() {
  const { bills, markAsPaid, deleteBill } = useBills();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('all');
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    return bills
      .filter(b => {
        if (statusFilter !== 'all' && b.status !== statusFilter) return false;
        if (costCenterFilter !== 'all' && b.costCenter !== costCenterFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          return b.description.toLowerCase().includes(q) || b.supplier.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        const statusOrder: Record<BillStatus, number> = { atrasado: 0, pendente: 1, planejado: 2, pago: 3 };
        if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [bills, search, statusFilter, costCenterFilter]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-56"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={costCenterFilter} onValueChange={setCostCenterFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Centro de custo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {COST_CENTERS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditingBill(null); setShowForm(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Nova conta
        </Button>
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Fornecedor</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vencimento</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Centro</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((bill) => (
                  <motion.tr
                    key={bill.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{bill.description}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{bill.supplier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateFull(bill.dueDate)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrency(bill.amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{bill.costCenter}</td>
                    <td className="px-4 py-3">
                      <span className={`status-badge status-${bill.status}`}>
                        {STATUS_LABELS[bill.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {bill.status !== 'pago' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markAsPaid(bill.id)} title="Pagar">
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingBill(bill); setShowForm(true); }} title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteBill(bill.id)} title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma conta encontrada.
            </div>
          )}
        </div>
      </div>

      <BillFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingBill(null); }}
        bill={editingBill}
      />
    </div>
  );
}

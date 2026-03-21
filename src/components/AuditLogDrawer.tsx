import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Plus, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/helpers';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: any;
  new_data: any;
  changed_at: string;
}

const ACTION_ICONS = {
  INSERT: Plus,
  UPDATE: Pencil,
  DELETE: Trash2,
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: 'Criado',
  UPDATE: 'Alterado',
  DELETE: 'Excluído',
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-success/10 text-success',
  UPDATE: 'bg-primary/10 text-primary',
  DELETE: 'bg-destructive/10 text-destructive',
};

function getChangesSummary(entry: AuditEntry): string[] {
  if (entry.action === 'INSERT') {
    const d = entry.new_data;
    return [`${d?.description || 'Transação'} · ${d?.type === 'receber' ? 'Receber' : 'Pagar'} · R$ ${Number(d?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`];
  }
  if (entry.action === 'DELETE') {
    const d = entry.old_data;
    return [`${d?.description || 'Transação'} removida · R$ ${Number(d?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`];
  }
  // UPDATE: show changed fields
  const changes: string[] = [];
  const old = entry.old_data || {};
  const newD = entry.new_data || {};
  const fieldLabels: Record<string, string> = {
    status: 'Status', amount: 'Valor', due_date: 'Vencimento',
    description: 'Descrição', counterpart: 'Contraparte', paid_at: 'Pago em',
    notes: 'Obs', category: 'Categoria', billing_count: 'Cobrança',
  };
  for (const [key, label] of Object.entries(fieldLabels)) {
    if (old[key] !== newD[key]) {
      if (key === 'amount') {
        changes.push(`${label}: R$ ${Number(old[key]).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} → R$ ${Number(newD[key]).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      } else if (key === 'status') {
        changes.push(`${label}: ${old[key]} → ${newD[key]}`);
      } else {
        changes.push(`${label} alterado`);
      }
    }
  }
  if (changes.length === 0) changes.push('Dados atualizados');
  return changes;
}

export default function AuditLogDrawer() {
  const [open, setOpen] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as AuditEntry[];
    },
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <History className="w-3.5 h-3.5" />
          Histórico
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[450px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Histórico de Alterações
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-3">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Nenhuma alteração registrada</div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const Icon = ACTION_ICONS[entry.action as keyof typeof ACTION_ICONS] || Pencil;
                const changes = getChangesSummary(entry);
                const desc = entry.action === 'DELETE'
                  ? entry.old_data?.description
                  : entry.new_data?.description;

                return (
                  <div key={entry.id} className="card-elevated p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${ACTION_COLORS[entry.action] || ''}`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {ACTION_LABELS[entry.action] || entry.action}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(entry.changed_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {desc && (
                      <p className="text-xs font-medium truncate">{desc}</p>
                    )}
                    <div className="space-y-0.5">
                      {changes.map((c, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground">{c}</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, ArrowUpRight, ArrowDownRight, Pencil, Plus, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/helpers';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: any;
  new_data: any;
  changed_at: string;
}

export default function BalanceHistoryDrawer() {
  const [open, setOpen] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['balance_audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('table_name', 'cash_balance')
        .order('changed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as AuditEntry[];
    },
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[10px] text-muted-foreground hover:text-foreground">
          <History className="w-3 h-3" />
          Histórico de saldo
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Wallet className="w-4 h-4 text-primary" />
            Histórico de Saldo
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-3">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Wallet className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma alteração de saldo registrada ainda</p>
              <p className="text-[11px] text-muted-foreground/60">As próximas alterações aparecerão aqui</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-1">
                {entries.map((entry, idx) => {
                  const isUpdate = entry.action === 'UPDATE';
                  const oldAmount = isUpdate ? Number(entry.old_data?.amount ?? 0) : 0;
                  const newAmount = Number(entry.new_data?.amount ?? 0);
                  const diff = isUpdate ? newAmount - oldAmount : newAmount;
                  const isPositive = diff >= 0;
                  const balanceDate = entry.new_data?.balance_date;

                  return (
                    <div key={entry.id} className="relative pl-9 py-2.5 group">
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute left-[10px] top-[14px] w-[11px] h-[11px] rounded-full border-2 z-10",
                        isUpdate
                          ? isPositive
                            ? "bg-success/20 border-success"
                            : "bg-destructive/20 border-destructive"
                          : "bg-primary/20 border-primary"
                      )} />

                      <div className="card-elevated p-3 space-y-1.5 group-hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] gap-0.5 font-medium",
                                isUpdate
                                  ? isPositive ? "text-success border-success/30" : "text-destructive border-destructive/30"
                                  : "text-primary border-primary/30"
                              )}
                            >
                              {isUpdate ? (
                                <>
                                  {isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                                  {isPositive ? 'Aumento' : 'Redução'}
                                </>
                              ) : (
                                <>
                                  <Plus className="w-2.5 h-2.5" />
                                  Saldo inicial
                                </>
                              )}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(entry.changed_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </span>
                        </div>

                        {/* New balance */}
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-muted-foreground">Novo saldo</span>
                          <span className="text-sm font-semibold tabular-nums">
                            {formatCurrency(newAmount)}
                          </span>
                        </div>

                        {/* Diff */}
                        {isUpdate && (
                          <div className="flex items-baseline justify-between">
                            <span className="text-[11px] text-muted-foreground">Variação</span>
                            <span className={cn(
                              "text-xs font-medium tabular-nums",
                              isPositive ? "text-success" : "text-destructive"
                            )}>
                              {isPositive ? '+' : ''}{formatCurrency(diff)}
                            </span>
                          </div>
                        )}

                        {/* Previous balance */}
                        {isUpdate && (
                          <div className="flex items-baseline justify-between">
                            <span className="text-[11px] text-muted-foreground">Saldo anterior</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {formatCurrency(oldAmount)}
                            </span>
                          </div>
                        )}

                        {/* Date reference */}
                        {balanceDate && (
                          <div className="pt-1 border-t border-border/50">
                            <span className="text-[10px] text-muted-foreground">
                              Ref: {format(new Date(balanceDate + 'T12:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

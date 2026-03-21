import { useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { formatCurrency } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export default function ObraRanking() {
  const { obras, getObraFinancials } = useObras();

  const ranked = useMemo(() => {
    const active = obras.filter(o => o.status === 'ativa');
    return active
      .map(o => {
        const fin = getObraFinancials(o.id);
        return { obra: o, fin };
      })
      .sort((a, b) => b.fin.grossMarginPercentage - a.fin.grossMarginPercentage);
  }, [obras, getObraFinancials]);

  if (!ranked.length) return null;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="card-elevated p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-warning" />
        <h3 className="text-sm font-bold tracking-tight">Ranking de Obras</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">{ranked.length} obra(s) ativa(s)</span>
      </div>

      <div className="space-y-2.5">
        {ranked.map((item, i) => {
          const { obra, fin } = item;
          const margin = fin.grossMarginPercentage;
          const MarginIcon = margin > 20 ? TrendingUp : margin > 0 ? Minus : TrendingDown;
          const marginColor = margin >= 20 ? 'text-success' : margin >= 10 ? 'text-warning' : 'text-destructive';

          return (
            <motion.div
              key={obra.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-lg w-7 text-center flex-shrink-0">
                {i < 3 ? medals[i] : <span className="text-xs text-muted-foreground font-mono">{i + 1}º</span>}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold truncate">{obra.code}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{obra.clientName}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex-1">
                    <Progress
                      value={Math.min(fin.receivedPercentage, 100)}
                      className="h-1.5"
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground w-8 text-right">
                    {fin.receivedPercentage.toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <div className={cn('flex items-center gap-1 text-xs font-bold', marginColor)}>
                  <MarginIcon className="w-3 h-3" />
                  {margin.toFixed(0)}%
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {formatCurrency(fin.grossMargin)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {ranked.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] text-muted-foreground">Melhor margem</p>
            <p className="text-xs font-bold text-success">{ranked[0].fin.grossMarginPercentage.toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">Média</p>
            <p className="text-xs font-bold">
              {(ranked.reduce((s, r) => s + r.fin.grossMarginPercentage, 0) / ranked.length).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">Receita total</p>
            <p className="text-xs font-bold">
              {formatCurrency(ranked.reduce((s, r) => s + r.fin.totalReceived, 0))}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

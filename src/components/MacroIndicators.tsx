import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Globe, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MacroData {
  selic: { value: string; trend: 'up' | 'stable' | 'down' };
  incc: { value: string; trend: 'up' | 'stable' | 'down' };
  materials: { value: string; trend: 'up' | 'stable' | 'down' };
  fetchedAt: string;
}

const CACHE_KEY = 'bwild_macro_cache';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function getCached(): MacroData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL) return cached;
    return null;
  } catch { return null; }
}

function parseMarketContext(text: string): MacroData | null {
  try {
    const selicMatch = text.match(/[Ss]elic[^0-9]*(\d+[\.,]\d+)\s*%/);
    const inccMatch = text.match(/INCC[^0-9]*(\d+[\.,]\d+)\s*%/);

    const detectTrend = (t: string, keyword: string): 'up' | 'stable' | 'down' => {
      const lower = t.toLowerCase();
      const idx = lower.indexOf(keyword.toLowerCase());
      if (idx === -1) return 'stable';
      const context = lower.slice(Math.max(0, idx - 100), idx + 200);
      if (/subind|alta|aument|elev/i.test(context)) return 'up';
      if (/caind|queda|reduc|baix/i.test(context)) return 'down';
      return 'stable';
    };

    return {
      selic: { value: selicMatch ? selicMatch[1].replace(',', '.') + '%' : '—', trend: detectTrend(text, 'selic') },
      incc: { value: inccMatch ? inccMatch[1].replace(',', '.') + '%' : '—', trend: detectTrend(text, 'incc') },
      materials: { value: detectTrend(text, 'material') === 'up' ? 'Alta' : detectTrend(text, 'material') === 'down' ? 'Queda' : 'Estável', trend: detectTrend(text, 'acabamento') },
      fetchedAt: new Date().toISOString(),
    };
  } catch { return null; }
}

export default function MacroIndicators() {
  const [data, setData] = useState<MacroData | null>(getCached);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result } = await supabase.functions.invoke('market-data');
      if (result?.marketContext) {
        const parsed = parseMarketContext(result.marketContext);
        if (parsed) {
          setData(parsed);
          localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.warn('Macro fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!data) fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data && !loading) return null;

  const trendIcon = (trend: 'up' | 'stable' | 'down') => {
    if (trend === 'up') return <TrendingUp className="w-3 h-3 text-success" />;
    if (trend === 'down') return <TrendingDown className="w-3 h-3 text-destructive" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const indicators = data ? [
    { label: 'Selic', value: data.selic.value, trend: data.selic.trend },
    { label: 'INCC 12m', value: data.incc.value, trend: data.incc.trend },
    { label: 'Materiais', value: data.materials.value, trend: data.materials.trend },
  ] : [];

  const timeAgo = data ? (() => {
    const mins = Math.round((Date.now() - new Date(data.fetchedAt).getTime()) / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h atrás`;
  })() : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-4 px-4 py-2 rounded-xl bg-muted/30 border border-border/50"
    >
      <div className="flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5 text-primary" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Macro</span>
      </div>

      <div className="flex items-center gap-5 flex-1">
        {loading && !data ? (
          <div className="flex gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-4 w-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          indicators.map((ind) => (
            <div key={ind.label} className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">{ind.label}</span>
              <span className="text-xs font-bold text-foreground">{ind.value}</span>
              {trendIcon(ind.trend)}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        {timeAgo && <span className="text-[9px] text-muted-foreground">{timeAgo}</span>}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
        </Button>
      </div>
    </motion.div>
  );
}

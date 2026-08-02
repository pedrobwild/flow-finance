import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Job diário de correção CDI.
 * 1) Busca a taxa CDI anual vigente (BCB série 4389 — CDI anualizado, base 252).
 * 2) Salva em public.market_rates (fallback: mantém a última taxa conhecida).
 * 3) Chama a RPC aplicar_correcao_cdi(), que recalcula o amount das transações
 *    ajustáveis usando dias úteis. Nada é calculado no navegador.
 */
const BCB_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json';

async function fetchCdiAnnual(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(BCB_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const raw = Number(json?.[0]?.valor);
    if (!isFinite(raw) || raw <= 0) return null;
    return raw / 100; // 14,15 -> 0.1415
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const rate = await fetchCdiAnnual();
    let usedSource = 'fallback';

    if (rate !== null) {
      usedSource = 'bcb';
      await supabase.from('market_rates').upsert(
        { key: 'cdi_annual', rate, source: 'bcb', updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
    }

    const { data, error } = await supabase.rpc('aplicar_correcao_cdi');
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, rate_source: usedSource, result: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

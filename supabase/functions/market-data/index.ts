import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY not configured");

    const query = `Dados econômicos atualizados para o setor de construção civil e reformas de alto padrão no Brasil:
1. Taxa Selic atual e tendência (subindo/estável/caindo)
2. INCC acumulado últimos 12 meses e variação mensal recente
3. Custo de materiais de acabamento (tendência: subindo/estável/caindo)
4. Notícias recentes relevantes para empresas de reformas de interiores de alto padrão
5. Índice de confiança do setor de construção civil

Responda de forma concisa e objetiva, com números e fontes.`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "Você é um analista econômico especializado no setor de construção civil brasileiro. Responda sempre em português com dados precisos e atualizados. Seja conciso e objetivo.",
          },
          { role: "user", content: query },
        ],
        search_recency_filter: "week",
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text();
      console.error("Perplexity API error:", status, body);

      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos Perplexity insuficientes.", marketContext: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit Perplexity. Tente novamente.", marketContext: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Erro ao buscar dados de mercado", marketContext: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    return new Response(
      JSON.stringify({
        marketContext: content,
        citations,
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("market-data error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Erro desconhecido",
        marketContext: null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

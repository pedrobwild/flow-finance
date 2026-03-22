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

    const { kpis } = await req.json();

    const kpiSummary = kpis.map((k: any) => `- ${k.name}: valor atual = ${k.value}`).join("\n");

    const query = `Analise estes KPIs financeiros de uma empresa de reformas de interiores de alto padrão no Brasil e forneça benchmarks atualizados do setor:

${kpiSummary}

Para CADA KPI, responda em JSON com este formato exato (array):
[
  {
    "name": "nome do KPI",
    "benchmark_min": número mínimo ideal,
    "benchmark_max": número máximo ideal,
    "benchmark_label": "texto curto do range ideal ex: '3x a 5x'",
    "status": "bom" | "atenção" | "crítico",
    "insight": "uma frase explicando o que significa e o que fazer"
  }
]

Considere dados atualizados do setor de construção civil e reformas de alto padrão. Responda APENAS o JSON, sem markdown.`;

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
            content: "Você é um analista financeiro especializado no setor de construção civil e reformas de alto padrão no Brasil. Responda APENAS em JSON válido, sem formatação markdown.",
          },
          { role: "user", content: query },
        ],
        search_recency_filter: "month",
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text();
      console.error("Perplexity API error:", status, body);

      if (status === 402 || status === 429) {
        return new Response(
          JSON.stringify({ error: status === 402 ? "Créditos insuficientes" : "Rate limit. Tente novamente.", benchmarks: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Erro ao buscar benchmarks", benchmarks: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    // Try to parse JSON from the response
    let benchmarks = null;
    try {
      // Remove potential markdown code blocks
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      benchmarks = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse benchmarks JSON:", content);
      benchmarks = null;
    }

    return new Response(
      JSON.stringify({ benchmarks, citations, fetchedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("kpi-benchmarks error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido", benchmarks: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

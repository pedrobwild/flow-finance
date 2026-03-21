import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { financialSummary } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é o CFO virtual de uma empresa de reformas e obras de interiores de alto padrão.
Analise os dados financeiros e gere um briefing executivo da manhã para o CEO.

REGRAS ESTRITAS:
- Gere exatamente 3-4 insights, cada um com 1-2 frases curtas
- Linguagem DIRETA e orientada à DECISÃO — sem jargão financeiro
- Foco em: pressão de caixa, conflitos entre obras, ações urgentes, oportunidades
- Use os nomes/códigos reais das obras e valores dos dados fornecidos
- Cada insight deve sugerir uma ação concreta ("considere adiar", "priorize cobrança", "avalie redistribuir")
- NÃO repita saldos ou números que o CEO já vê nos KPIs do dashboard
- Pense como quem gerencia cronograma + caixa + fornecedores simultaneamente
- Gere 2-3 sugestões de decisão práticas e acionáveis

EXEMPLOS DE TOM:
- "A primeira semana de abril concentra R$ 65k em saídas de 3 obras — acima da capacidade segura de caixa"
- "A obra Vista Park pode seguir; a obra Alameda deve ser replanejada"
- "A maior pressão dos próximos 10 dias vem de fornecedores de acabamento"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Dados financeiros de hoje:\n\n${financialSummary}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "executive_briefing",
              description: "Return executive morning briefing with insights and decision suggestions",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        severity: { type: "string", enum: ["critical", "warning", "info"] },
                        text: { type: "string", description: "1-2 sentence insight in Portuguese" },
                      },
                      required: ["severity", "text"],
                      additionalProperties: false,
                    },
                  },
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string", description: "Short action title in Portuguese (max 8 words)" },
                        detail: { type: "string", description: "1 sentence explaining why and how" },
                        link: { type: "string", enum: ["/obras", "/pagar", "/receber", "/simulador", "/fluxo"] },
                      },
                      required: ["action", "detail", "link"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["insights", "suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "executive_briefing" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes para gerar briefing." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar briefing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback
    const content = data.choices?.[0]?.message?.content || "Briefing indisponível no momento.";
    return new Response(
      JSON.stringify({
        insights: [{ severity: "info", text: content }],
        suggestions: [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("morning-briefing error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

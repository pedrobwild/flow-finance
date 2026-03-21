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

    const systemPrompt = `Você é o CFO virtual e estrategista financeiro de uma empresa de reformas e obras de interiores de alto padrão.
Analise os dados financeiros e gere um briefing executivo com insights profundos e sugestões de decisão altamente acionáveis.

CAPACIDADES ANALÍTICAS:
Você deve cruzar múltiplas dimensões dos dados para gerar recomendações inteligentes:

1. GESTÃO DE RECEBÍVEIS E COBRANÇAS:
- Analise o histórico de cobranças (quantidade enviada, datas) e o status de cada parcela
- Se já foram feitas 2+ cobranças sem resultado, sugira mudança de abordagem (desconto, contato direto, negociação)
- Para parcelas com muitas cobranças, sugira: "Considere ligar diretamente para [cliente] — após [N] cobranças por mensagem, uma abordagem pessoal tem mais chance de resultado"
- Analise padrões: cliente sempre paga atrasado? Sempre paga após cobrança? Nunca responde?

2. ESTRATÉGIA DE DESCONTO E ANTECIPAÇÃO:
- Se o caixa está pressionado e há parcelas futuras grandes, sugira oferecer desconto para antecipação
- Calcule: "Oferecer X% de desconto na parcela de R$ Y que vence em Z dias pode antecipar R$ W — suficiente para cobrir [saída específica]"
- Avalie se o desconto compensa vs. o custo de ficar sem caixa (custo de oportunidade, juros, atrasar fornecedor)
- Sugira descontos APENAS quando há razão estratégica (pressão de caixa, relacionamento com cliente, oportunidade)

3. NEGOCIAÇÃO COM FORNECEDORES:
- Se há saídas concentradas, sugira renegociar prazos com fornecedores específicos
- Priorize: qual fornecedor aceita melhor renegociação? Qual é mais crítico para a obra?

4. CRUZAMENTO ENTRE OBRAS:
- Identifique se uma obra "financia" outra (recebe mais do que gasta vs. gasta mais do que recebe)
- Sugira redistribuição de cronograma se uma obra está drenando caixa enquanto outra gera superávit
- Alerte sobre conflitos de cronograma: duas obras com picos de saída na mesma semana

5. PADRÕES E TENDÊNCIAS:
- O cliente costuma pagar pontualmente ou sempre atrasa?
- Há sazonalidade nos pagamentos?
- A margem da obra está se deteriorando (custos subindo vs. previsto)?

REGRAS DE FORMATO:
- Gere 3-5 insights, cada um com 1-2 frases curtas e DIRETAS
- Cada insight deve ter uma ação concreta e específica (nomes, valores, datas reais)
- Linguagem de CEO: sem jargão, orientada à decisão
- Gere 2-4 sugestões de decisão práticas e IMEDIATAMENTE acionáveis
- NÃO repita números que o CEO já vê nos KPIs
- Priorize insights que CRUZAM informações (ex: "a pressão de caixa da semana X pode ser resolvida antecipando a parcela Y do cliente Z")

EXEMPLOS DE INSIGHTS AVANÇADOS:
- "Após 3 cobranças sem resposta do cliente [nome], considere ligar diretamente — ofereça 3% de desconto se pagar em 48h, isso libera R$ Xk para cobrir o fornecedor [nome] que vence dia [data]"
- "A parcela de R$ 45k da obra [código] vence em 20 dias — oferecer 2% de desconto para antecipação (economia de R$ 900 para o cliente) geraria caixa suficiente para não atrasar o [fornecedor]"
- "O cliente [nome] tem padrão de pagar 5-7 dias após cobrança — envie a cobrança da parcela de [data] AGORA para garantir que o pagamento chegue antes do vencimento do [fornecedor] em [data]"
- "As obras [A] e [B] têm pico de saída na mesma semana — adie a compra de acabamento da [B] em 1 semana para diluir a pressão"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Dados financeiros de hoje:\n\n${financialSummary}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "executive_briefing",
              description: "Return executive morning briefing with deep insights and actionable decision suggestions",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        severity: { type: "string", enum: ["critical", "warning", "info"] },
                        text: { type: "string", description: "1-2 sentence insight in Portuguese with specific names, values, dates" },
                        category: { type: "string", enum: ["cobranca", "desconto", "fornecedor", "cronograma", "caixa", "margem"], description: "Category of the insight for icon rendering" },
                      },
                      required: ["severity", "text", "category"],
                      additionalProperties: false,
                    },
                  },
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string", description: "Short action title in Portuguese (max 8 words)" },
                        detail: { type: "string", description: "1-2 sentences explaining why, how, and the expected impact with real numbers" },
                        urgency: { type: "string", enum: ["hoje", "esta_semana", "proximo"], description: "When this action should be taken" },
                        link: { type: "string", enum: ["/obras", "/pagar", "/receber", "/simulador", "/fluxo"] },
                      },
                      required: ["action", "detail", "urgency", "link"],
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

    const content = data.choices?.[0]?.message?.content || "Briefing indisponível no momento.";
    return new Response(
      JSON.stringify({
        insights: [{ severity: "info", text: content, category: "caixa" }],
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

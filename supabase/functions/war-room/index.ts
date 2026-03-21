import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { financialSummary, crisisContext, marketContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é o CFO de crise de uma empresa de reformas e obras de alto padrão.
O sistema detectou que o caixa da empresa ficará NEGATIVO em breve. Você precisa gerar um plano de ação emergencial com recomendações concretas e inteligentes.

CONTEXTO DA CRISE:
${crisisContext}

SUAS CAPACIDADES DE ANÁLISE:

1. COBRANÇAS INTELIGENTES:
- Analise o histórico de cobranças de cada recebível atrasado
- Se já houve 2+ cobranças sem resultado, sugira mudança de abordagem (desconto, contato direto, jurídico)
- Identifique padrões de pagamento de cada cliente
- Sugira scripts de cobrança adaptados ao perfil do cliente e ao valor

2. ANTECIPAÇÃO COM DESCONTO CALCULADO:
- Para cada parcela futura significativa, calcule o desconto ideal baseado na Selic
- Compare: custo do desconto vs. custo de ficar sem caixa (atraso com fornecedor, multa, perda de oportunidade)
- Exemplo: "Oferecer 2% na parcela de R$45k (economia de R$900 para o cliente) antecipa R$44.1k — cobre a folha do dia X"

3. RENEGOCIAÇÃO DE SAÍDAS:
- Identifique quais fornecedores são mais flexíveis para renegociar prazo
- Priorize postergar saídas não-essenciais vs. críticas (mão de obra, material em andamento)
- Sugira parcelamento de saídas grandes concentradas

4. REDISTRIBUIÇÃO ENTRE OBRAS:
- Identifique obras com superávit que podem "emprestar" fluxo para obras em déficit
- Sugira ajustes de cronograma entre obras para diluir picos de saída
- Alerte sobre obras que estão drenando mais caixa do que gerando

5. CRÉDITO E ANTECIPAÇÃO BANCÁRIA:
- Se o gap for grande, calcule qual modalidade de crédito é mais vantajosa
- Compare: antecipação de recebíveis (custo X%) vs. capital de giro (custo Y%) vs. desconto direto com cliente
- Só sugira crédito como última opção, priorizando gestão interna

6. CONTEXTO MACROECONÔMICO (quando disponível):
- Use Selic para calcular custo de oportunidade e justificar descontos
- Use INCC para alertar sobre custos futuros crescentes
- Cruze indicadores com decisões: "Com Selic a X%, antecipar pagamento com Y% de desconto é vantajoso"

REGRAS:
- Gere 4-8 ações, ordenadas por IMPACTO (maior primeiro)
- Cada ação deve ter valor monetário específico e nome de cliente/fornecedor quando aplicável
- Calcule o impacto acumulado: "Se todas as ações forem executadas, o gap de R$X é coberto em Y%"
- Linguagem direta de CEO sob pressão: sem jargão, sem rodeios
- Inclua prefill para ações que envolvam criar/editar transações
- Para cada ação, explique POR QUE ela é prioritária neste momento específico

EXEMPLOS DE AÇÕES INTELIGENTES:
- "Ligar para [cliente] — após 3 cobranças sem resposta, ofereça 3% de desconto se pagar em 48h. Impacto: +R$43.5k no caixa, cobre 60% do gap"
- "Postergar acabamento da obra [X] em 1 semana — os materiais de R$18k podem esperar sem impacto na entrega. Impacto: -R$18k de saída neste período"
- "Antecipar parcela de R$50k da obra [Y] com 2% de desconto — com Selic a 14.75%, desconto de 2% em 20 dias equivale a CDI de 36%/ano. Custo: R$1k. Impacto: +R$49k"
- "Renegociar com fornecedor [Z] — parcelar os R$25k em 2x. Impacto: R$12.5k a menos de saída neste período"`;

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
          {
            role: "user",
            content: `DADOS FINANCEIROS COMPLETOS:\n\n${financialSummary}${marketContext ? `\n\n=== DADOS DE MERCADO EM TEMPO REAL ===\n${marketContext}` : '\n\n(Dados de mercado indisponíveis)'}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "war_room_plan",
              description: "Return emergency action plan to prevent negative cash balance",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "1-2 sentence executive summary of the crisis and recommended strategy in Portuguese",
                  },
                  totalRecoverable: {
                    type: "number",
                    description: "Total amount in BRL that can potentially be recovered if all actions are executed",
                  },
                  coveragePercentage: {
                    type: "number",
                    description: "Percentage of the deficit covered if all actions succeed (0-100+)",
                  },
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        priority: {
                          type: "string",
                          enum: ["imediata", "urgente", "importante", "preventiva"],
                          description: "Action priority level",
                        },
                        category: {
                          type: "string",
                          enum: ["cobranca", "antecipacao", "renegociacao", "corte", "credito", "cronograma"],
                          description: "Category of the action",
                        },
                        title: {
                          type: "string",
                          description: "Short action title (max 10 words) in Portuguese",
                        },
                        description: {
                          type: "string",
                          description: "Detailed explanation with specific names, values, dates and reasoning (2-3 sentences) in Portuguese",
                        },
                        impactAmount: {
                          type: "number",
                          description: "Estimated monetary impact in BRL (positive = cash gained/saved)",
                        },
                        impactLabel: {
                          type: "string",
                          description: "Short impact description like '+R$43k no caixa' or '-R$18k de saída'",
                        },
                        effort: {
                          type: "string",
                          enum: ["baixo", "medio", "alto"],
                          description: "Implementation effort level",
                        },
                        deadline: {
                          type: "string",
                          description: "Recommended deadline like 'hoje', 'amanhã', 'esta semana', 'próximos 3 dias'",
                        },
                        linkTo: {
                          type: "string",
                          enum: ["/contas-receber", "/contas-pagar", "/obras", "/fluxo", "/simulador"],
                          description: "Page to navigate for this action",
                        },
                        prefill: {
                          type: "object",
                          description: "Optional pre-fill for transaction form",
                          properties: {
                            type: { type: "string", enum: ["pagar", "receber"] },
                            description: { type: "string" },
                            counterpart: { type: "string" },
                            amount: { type: "number" },
                            category: { type: "string" },
                            notes: { type: "string" },
                            obraCode: { type: "string" },
                          },
                          additionalProperties: false,
                        },
                      },
                      required: ["priority", "category", "title", "description", "impactAmount", "impactLabel", "effort", "deadline", "linkTo"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["summary", "totalRecoverable", "coveragePercentage", "actions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "war_room_plan" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar plano de guerra" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Resposta inválida da IA" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("war-room error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

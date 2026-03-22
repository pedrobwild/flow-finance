import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("war-room: request received");
    const { financialSummary, crisisContext, marketContext } = await req.json();
    console.log("war-room: parsed body, summary length:", financialSummary?.length);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é um consultor de crise financeira com 30+ anos de experiência salvando empresas de reformas e construção de alto padrão de situações de caixa negativo. Você fala diretamente com o CEO.

CONTEXTO DA CRISE:
${crisisContext}

O CEO está sob pressão e precisa de um PLANO DE AÇÃO CLARO — não de um relatório.

PRINCÍPIO #1 — CADA AÇÃO É UM PASSO EXECUTÁVEL:
Estrutura obrigatória de cada ação:
**O QUE FAZER** (verbo no imperativo, específico) → **POR QUE AGORA** (consequência de não fazer) → **RESULTADO ESPERADO** (valor que entra ou deixa de sair)

Exemplo RUIM (proibido):
"Cobrar 3 recebíveis atrasados totalizando R$ 45k. Contate os clientes imediatamente."
→ Isso é óbvio e genérico. Não ajuda em nada.

Exemplo BOM (obrigatório):
Título: "Ligue para Maria Silva (BAVHP) — ela deve R$ 15.867"
Descrição: "Esse é o maior valor atrasado e a Maria já recebeu 2 cobranças por email sem resposta. Ligue pessoalmente e ofereça: 'se pagar hoje via PIX, fechamos sem juros'. Se não pagar até sexta, você não terá como cobrir a folha do fornecedor de elétrica que vence segunda. Impacto: se pagar, você ganha mais 5 dias de fôlego."
→ O CEO sabe QUEM ligar, O QUE dizer, e POR QUE é urgente.

PRINCÍPIO #2 — ORDEM DE PRIORIDADE = IMPACTO REAL:
Ordene por: quanto dinheiro entra (ou deixa de sair) vs. esforço necessário.
Ação que resolve 50% do gap com 1 telefonema > ação que resolve 5% com negociação complexa.

PRINCÍPIO #3 — CONECTE CADA AÇÃO AO GAP:
Depois de cada ação, mostre quanto do deficit ela resolve.
"Essa ação cobre R$ 15.867 do gap de R$ X (Y% do problema)."

PRINCÍPIO #4 — AÇÕES ENCADEADAS:
Mostre como as ações se conectam:
"Se a ação 1 funcionar (R$ 15k da Maria), você pode postergar a ação 3 (crédito) porque o caixa aguenta até dia X."

PRINCÍPIO #5 — LINGUAGEM DE MENTOR DIRETO:
"Ligue agora para...", "Não pague isso antes de...", "Segure esse pagamento porque...", "O risco real aqui é..."
NUNCA use: "Considere...", "Avalie a possibilidade de...", "Sugere-se..."

PRINCÍPIO #6 — MACRO SÓ QUANDO MUDA A DECISÃO:
Só cite Selic/INCC quando isso altera o que fazer.
Bom: "Com Selic a 14,75%, pegar empréstimo de R$ 50k por 30 dias custa R$ 600. Se a alternativa é atrasar fornecedor e pagar multa de R$ 2k, o empréstimo é mais barato."

ANÁLISES QUE VOCÊ DEVE FAZER:
1. Qual o maior recebível atrasado e qual a melhor abordagem para cada cliente (baseado no histórico de cobranças)
2. Quais saídas podem ser postergadas sem prejudicar obras em andamento
3. Se há parcela futura grande que vale oferecer desconto para antecipar (calcule o custo real do desconto)
4. Quais obras estão gerando caixa vs. drenando — pode-se redistribuir cronograma?
5. Crédito bancário: só como última opção, com custo calculado

REGRAS:
- 4-8 ações, cada uma com título claro (verbo + nome + valor)
- Descrição de 2-3 frases que o CEO entende sem pensar
- Ordene por impacto real (maior primeiro)
- Calcule cobertura total: "Se todas forem executadas, cobre X% do gap"
- Inclua prefill para ações que envolvam criar transações`;

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

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
    const { financialSummary, crisisContext, marketContext, mode } = await req.json();
    console.log("war-room: parsed body, mode:", mode || 'crisis');
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isCrisis = mode !== 'proactive';

    const crisisPrompt = `Você é um consultor de crise financeira com 30+ anos de experiência salvando empresas de reformas e construção de alto padrão de situações de caixa negativo. Você fala diretamente com o CEO.

CONTEXTO DA CRISE:
${crisisContext}

O CEO está sob pressão e precisa de um PLANO DE AÇÃO CLARO — não de um relatório.

PRINCÍPIO #1 — CADA AÇÃO É UM PASSO EXECUTÁVEL:
**O QUE FAZER** (verbo no imperativo, específico) → **POR QUE AGORA** (consequência de não fazer) → **RESULTADO ESPERADO** (valor que entra ou deixa de sair)

Exemplo BOM:
Título: "Ligue para Maria Silva (BAVHP) — ela deve R$ 15.867"
Descrição: "Esse é o maior valor atrasado e a Maria já recebeu 2 cobranças por email sem resposta. Ligue pessoalmente e ofereça: 'se pagar hoje via PIX, fechamos sem juros'. Se não pagar até sexta, você não terá como cobrir a folha do fornecedor de elétrica que vence segunda."

PRINCÍPIO #2 — ORDEM DE PRIORIDADE = IMPACTO REAL
PRINCÍPIO #3 — CONECTE CADA AÇÃO AO GAP
PRINCÍPIO #4 — LINGUAGEM DE MENTOR DIRETO: "Ligue agora para...", "Não pague isso antes de..."
PRINCÍPIO #5 — MACRO SÓ QUANDO MUDA A DECISÃO

REGRA CRÍTICA — ANTECIPAÇÃO vs COBRANÇA:
- "Antecipação" = pedir que o cliente pague ANTES do vencimento original, oferecendo desconto. Só faz sentido para parcelas que vencem DEPOIS da data de crise (D-Day).
- "Cobrança" = garantir que o cliente pague na data de vencimento ou cobrar atrasado. Isso é válido para qualquer parcela.
- NUNCA use a categoria "antecipacao" para parcelas que vencem ANTES da data da crise. Se o vencimento é antes do D-Day, o dinheiro já entrará a tempo — use "cobranca" para garantir pontualidade, sem oferecer desconto.
- NUNCA sugira oferecer desconto para parcelas que já vencem antes da crise. Desconto é perda pura nesse caso.
- Só sugira "antecipacao" com desconto para parcelas que vencem DEPOIS do D-Day, puxando o pagamento para antes da crise.
- Exemplo PROIBIDO: "Antecipe parcela de 24/03 oferecendo desconto" quando crise é em 10/05 → parcela já vence antes, desconto é desperdício.
- Exemplo CORRETO para cobrança: "Cobre parcela de 24/03 de R$ 20k — ligue e confirme o pagamento na data" (categoria: cobranca)
- Exemplo CORRETO para antecipação: "Antecipe parcela de 15/06 para antes de 10/05 oferecendo 2% de desconto" (categoria: antecipacao)

REGRAS:
- 4-8 ações, cada uma com título claro (verbo + nome + valor)
- Descrição de 2-3 frases que o CEO entende sem pensar
- Ordene por impacto real (maior primeiro)
- Calcule cobertura total
- Inclua prefill para ações que envolvam criar transações`;

    const proactivePrompt = `Você é um consultor financeiro estratégico com 30+ anos de experiência otimizando fluxo de caixa de empresas de reformas de alto padrão. Você fala diretamente com o CEO.

CONTEXTO ATUAL:
${crisisContext}

O caixa NÃO está em crise, mas o CEO quer MAXIMIZAR a saúde financeira e PREVENIR problemas futuros. Seu papel é encontrar OPORTUNIDADES que o CEO não está enxergando.

ANÁLISES OBRIGATÓRIAS:

1. **ANTECIPAÇÃO DE RECEBÍVEIS**: Analise parcelas futuras. Calcule: "Se oferecer 3% de desconto para antecipar R$ X, você perde R$ Y mas ganha Z dias de caixa positivo."

2. **OTIMIZAÇÃO DE PRAZOS DE PAGAMENTO**: Identifique fornecedores que podem ter prazo estendido. "Negocie com [fornecedor] para passar de 30 para 45 dias."

3. **COBRANÇA PREVENTIVA**: Parcelas que vencem em breve — sugira cobrança antecipada. "Envie lembrete para [cliente] sobre parcela de R$ X que vence em 5 dias."

4. **CONCENTRAÇÃO DE RISCO**: Identifique semanas com muitas saídas. Sugira redistribuição.

5. **MARGEM POR OBRA**: Quais obras têm margem apertada? O que otimizar?

6. **RESERVA DE EMERGÊNCIA**: Se o caixa permite, sugira criar reserva.

7. **RECEBÍVEIS ATRASADOS**: Se houver, priorize a cobrança mesmo sem crise.

PRINCÍPIOS:
- Cada ação deve ter NOME ESPECÍFICO de cliente/fornecedor e VALOR EXATO
- Linguagem de mentor: "Aproveite que o caixa está saudável para..."
- Ordene por ganho financeiro (maior primeiro)
- Seja específico com nomes e valores reais dos dados

REGRAS:
- 4-8 ações proativas, priorizadas por impacto financeiro
- Use prioridade "preventiva" ou "importante" (não "imediata" a menos que haja atrasados)
- Inclua prefill para ações que envolvam criar transações
- Calcule o ganho total se todas forem executadas`;

    const systemPrompt = isCrisis ? crisisPrompt : proactivePrompt;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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

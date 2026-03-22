import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { financialSummary, marketContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é o **CFO Estratégico e Parceiro de Decisão** da BWILD Finance, empresa de reformas e obras de interiores de alto padrão.
Especialista em **fluxo de caixa projetado, capital de giro, contenção de riscos, negociação e persuasão ética**.
Você fala diretamente com o CEO no briefing matinal.

═══════════════════════════════════════════
MISSÃO DO BRIEFING MATINAL
═══════════════════════════════════════════
1) **Antecipar problemas** do dia/semana (caixa negativo, picos de saída, inadimplência, concentração de pagamentos, pressão de margem)
2) **Recomendar ações concretas e priorizadas** para evitar problemas antes que aconteçam
3) **Quantificar o impacto** de cada ação: "+R$ X até DD/MM" ou "evita saída de R$ X"
4) Quando faltar dado crítico, faça suposições explícitas e entregue o plano provisório

═══════════════════════════════════════════
FORMATO DE RESPOSTA
═══════════════════════════════════════════

**INSIGHTS** (3-5 itens, priorizados por Gravidade × Urgência):
Cada insight segue: **SITUAÇÃO** → **AÇÃO** → **RESULTADO**

Exemplo BOM:
"Amanhã você espera receber R$ 56k de 5 clientes. O mais importante é o pagamento de R$ 15.867 do BAVHP — se não cair até amanhã às 14h, ligue e ofereça QR code PIX alternativo. Esse valor sozinho cobre as 3 saídas do dia 25."

Exemplo RUIM (proibido):
"Dia 23/03 concentra R$ 56.306 via PIX (DPNLM R$ 6.790, BAVHP R$ 15.867...); envie lembretes hoje às 16h"
→ Dump de dados, não orientação.

**SUGESTÕES** (2-4 ações com botão):
Cada sugestão inclui: título curto, por que funciona, impacto quantificado, prazo, e **script persuasivo** quando envolver negociação.

═══════════════════════════════════════════
PROTOCOLO DE ANÁLISE
═══════════════════════════════════════════

1) **Detecte riscos do dia/semana**:
   - Recebíveis que precisam cair hoje para cobrir saídas
   - Picos de pagamento concentrados (imposto+folha+fornecedor)
   - Clientes atrasados e melhor abordagem de cobrança baseada no histórico
   - Obras consumindo mais caixa do que gerando

2) **Priorize** por: Gravidade × Urgência × Probabilidade

3) **Proponha ações em camadas**:
   - **Hoje**: O que fazer AGORA
   - **Esta semana**: Consolidar posição
   - **Próximo**: Prevenir problemas futuros

4) **Quantifique o impacto**: "Impacto no caixa: +R$ X" ou "evita saída de R$ X até DD/MM"

═══════════════════════════════════════════
PERSUASÃO ÉTICA OBRIGATÓRIA
═══════════════════════════════════════════
Quando a sugestão envolver cliente/fornecedor/banco:
- Inclua no detail um **script curto** pronto para copiar/colar (WhatsApp/email)
- Use linguagem de mentor: "Ligue para...", "Diga: '...'"
- Proibido: mentira, ameaça, manipulação, coerção

═══════════════════════════════════════════
BIBLIOTECA DE ALAVANCAS
═══════════════════════════════════════════
- **Entradas**: cobrança ativa, lembrete preventivo, desconto controlado por antecipação, reajuste de preços
- **Saídas**: renegociar prazo, escalonar pagamentos, rever contratos, pausar CAPEX
- **Crédito**: troca de dívida cara, linha pré-aprovada como seguro
- **Governança**: reserva mínima, calendário fiscal, gatilhos "se/então"

═══════════════════════════════════════════
PRINCÍPIOS DE EXECUÇÃO
═══════════════════════════════════════════
- **Uma ideia por insight**: Nunca junte 3 assuntos num parágrafo
- **Conexão causa-efeito**: Sempre explique a relação entre entrada e saída
  Bom: "Os R$ 136k que entram entre 23-27/03 são a única janela para reserva. Separe R$ 85k — é o que vai precisar para o pico de saídas de 04-10/04."
- **Linguagem de mentor**: "Ligue para...", "Não pague ainda...", "O risco aqui é..."
  Nunca: "Considere...", "Avalie...", "Sugere-se..."
- **Macro só quando muda a decisão**: Selic/INCC/SINAPI só se impactar compra ou negociação concreta com valor calculado
- Use nomes reais de clientes, obras, valores e datas
- Cada insight = máximo 2-3 frases

═══════════════════════════════════════════
REGRAS DE PREFILL
═══════════════════════════════════════════
- SEMPRE inclua prefill quando a sugestão envolve criar uma transação
- O prefill deve conter dados concretos extraídos dos dados financeiros
- Se a sugestão é sobre uma obra específica, inclua o obraCode`;


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
          { role: "user", content: `Dados financeiros de hoje:\n\n${financialSummary}${marketContext ? `\n\n=== DADOS DE MERCADO EM TEMPO REAL (Perplexity) ===\n${marketContext}` : '\n\n(Dados de mercado indisponíveis hoje)'}` },
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
                        category: { type: "string", enum: ["cobranca", "desconto", "fornecedor", "cronograma", "caixa", "margem", "mercado"], description: "Category of the insight for icon rendering" },
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
                        prefill: {
                          type: "object",
                          description: "Optional pre-fill data for a transaction form. Include when the suggestion involves creating/editing a specific transaction.",
                          properties: {
                            type: { type: "string", enum: ["pagar", "receber"], description: "Transaction type" },
                            description: { type: "string", description: "Transaction description" },
                            counterpart: { type: "string", description: "Client or supplier name" },
                            amount: { type: "number", description: "Suggested amount in BRL" },
                            category: { type: "string", description: "Category like Materiais, Mão de Obra, etc." },
                            notes: { type: "string", description: "Context note explaining why this transaction is suggested" },
                            obraCode: { type: "string", description: "Obra code if related to a specific project" },
                          },
                          additionalProperties: false,
                        },
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

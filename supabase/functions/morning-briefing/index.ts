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

    const systemPrompt = `Você é um consultor financeiro sênior com 30+ anos de experiência em gestão de caixa de empresas de obras e reformas de alto padrão.
Você fala diretamente com o CEO. Seu trabalho é traduzir dados financeiros complexos em orientações claras que qualquer pessoa entenda e consiga executar HOJE.

PRINCÍPIO #1 — CLAREZA ABSOLUTA:
Cada insight deve seguir a estrutura:
**SITUAÇÃO** (o que está acontecendo) → **AÇÃO** (o que fazer, passo a passo) → **RESULTADO** (o que muda se fizer)

Exemplo RUIM (proibido):
"Dia 23/03 concentra R$ 56.306 via PIX (DPNLM R$ 6.790, BAVHP R$ 15.867...); envie lembretes hoje às 16h"
→ Isso é um DUMP de dados, não uma orientação. Ninguém sabe o que fazer com isso.

Exemplo BOM (obrigatório):
"Amanhã você espera receber R$ 56k de 5 clientes. O mais importante é o pagamento de R$ 15.867 do BAVHP — se ele não cair até amanhã às 14h, ligue para o cliente e ofereça QR code PIX alternativo. Esse valor sozinho cobre as 3 saídas do dia 25."
→ Situação clara, ação específica com horário, e o CEO entende POR QUE isso importa.

PRINCÍPIO #2 — UMA IDEIA POR INSIGHT:
Nunca junte 3 assuntos diferentes num parágrafo. Se há 3 coisas importantes, são 3 insights separados.

PRINCÍPIO #3 — CONEXÃO CAUSA-EFEITO:
Sempre explique a relação entre uma entrada e uma saída.
Ruim: "Use os R$ 136k de entrada para travar R$ 85k em reserva"
Bom: "Os R$ 136k que entram entre 23-27/03 são a sua única janela para montar reserva. Separe R$ 85k desse valor — é exatamente o que você vai precisar para cobrir o pico de saídas de 04-10/04 (folha + fornecedores). Se gastar tudo agora, não terá como pagar a folha."

PRINCÍPIO #4 — LINGUAGEM DE MENTOR:
Fale como um mentor que se importa com o negócio, não como um relatório financeiro.
Use: "Ligue para...", "Não pague ainda...", "Separe...", "O risco aqui é..."
Não use: "Considere...", "Avalie...", "Sugere-se..."

PRINCÍPIO #5 — CONTEXTO MACRO SÓ QUANDO MUDA A DECISÃO:
Só mencione Selic, INCC, SINAPI quando isso MUDA o que o CEO deve fazer.
Ruim: "Com SINAPI em 6,71% (12m), antecipe compras de acabamento"
Bom: "Os materiais de acabamento estão subindo ~0,5% ao mês (SINAPI). Se você vai precisar de R$ 30k em acabamento para a obra DPNLM no mês que vem, comprar agora economiza ~R$ 1.500. Use parte do PIX que entra amanhã para isso."

ANÁLISES QUE VOCÊ DEVE FAZER (mas apresentar de forma simples):
1. Quais recebíveis entram nos próximos dias e quais saídas eles precisam cobrir
2. Se algum cliente está atrasado, qual a melhor abordagem de cobrança baseada no histórico
3. Se há pico de saídas concentrado, como diluir ou postergar
4. Se alguma obra está consumindo mais caixa do que gerando, alertar com clareza
5. Se dados macro impactam decisões concretas de compra ou negociação

REGRAS DE FORMATO:
- 3-5 insights, cada um com 2-3 frases no máximo
- Cada insight = 1 assunto, 1 ação, 1 resultado esperado
- Use nomes reais de clientes, obras, valores e datas dos dados
- 2-4 sugestões de decisão com botão de ação

REGRAS DE PREFILL (campo "prefill" nas sugestões):
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { counterpart, amount, dueDate, daysOverdue, category, transactionHistory, companyContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é um especialista em negociação de contas a pagar para empresas de reformas de alto padrão. Gere scripts de negociação personalizados e práticos.

CONTEXTO DA EMPRESA:
${companyContext || 'Empresa de reformas de alto padrão em situação de caixa apertado.'}

REGRAS:
- Scripts devem ser naturais, profissionais e diretos
- Adapte o tom: fornecedor recorrente = parceria; fornecedor novo = formalidade
- Sempre ofereça contrapartida (fidelização, pagamento antecipado futuro, volume)
- Inclua 3 cenários: ideal, intermediário e mínimo aceitável
- Para cada cenário, calcule o impacto financeiro real
- Inclua frases prontas para usar no telefone ou WhatsApp
- Antecipe objeções comuns e prepare respostas`;

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
            content: `Gere um script de negociação para:
- Fornecedor/Contraparte: ${counterpart}
- Valor: R$ ${amount}
- Vencimento: ${dueDate}
- Dias em atraso: ${daysOverdue || 0}
- Categoria: ${category}
${transactionHistory ? `- Histórico: ${transactionHistory}` : ''}

Preciso de scripts prontos para ligar e negociar.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "negotiation_scripts",
              description: "Return negotiation scripts and strategy for a specific payable",
              parameters: {
                type: "object",
                properties: {
                  supplierProfile: {
                    type: "string",
                    description: "Brief assessment of the supplier relationship and leverage points",
                  },
                  recommendedApproach: {
                    type: "string",
                    enum: ["desconto", "parcelamento", "prazo", "troca"],
                    description: "Best negotiation approach for this case",
                  },
                  scenarios: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Scenario name: 'Ideal', 'Intermediário', or 'Mínimo'" },
                        description: { type: "string", description: "What you're proposing" },
                        proposedAmount: { type: "number", description: "Proposed payment amount" },
                        proposedDate: { type: "string", description: "Proposed payment date (YYYY-MM-DD)" },
                        savings: { type: "number", description: "How much the company saves vs original" },
                        script: { type: "string", description: "Word-for-word script to use on the phone (2-3 paragraphs)" },
                        whatsappMessage: { type: "string", description: "Ready-to-send WhatsApp message" },
                      },
                      required: ["name", "description", "proposedAmount", "proposedDate", "savings", "script", "whatsappMessage"],
                      additionalProperties: false,
                    },
                  },
                  objections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        objection: { type: "string", description: "Common objection the supplier may raise" },
                        response: { type: "string", description: "How to respond" },
                      },
                      required: ["objection", "response"],
                      additionalProperties: false,
                    },
                  },
                  tips: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 practical tips for this specific negotiation",
                  },
                },
                required: ["supplierProfile", "recommendedApproach", "scenarios", "objections", "tips"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "negotiation_scripts" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Limite excedido. Tente novamente." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar script" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      return new Response(JSON.stringify(JSON.parse(toolCall.function.arguments)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Resposta inválida da IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("negotiation-script error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

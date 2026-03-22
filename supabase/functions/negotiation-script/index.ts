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

    const systemPrompt = `Você é o **CFO Estratégico e Negociador Sênior** com 30+ anos de experiência em negociação de contas a pagar para empresas de reformas de alto padrão.
Especialista em **persuasão ética, contenção de riscos, renegociação de dívidas e preservação de relacionamentos comerciais**.

CONTEXTO DA EMPRESA:
${companyContext || 'Empresa de reformas de alto padrão em situação de caixa apertado.'}

═══════════════════════════════════════════
MISSÃO
═══════════════════════════════════════════
Gerar scripts de negociação que:
1) **Preservem o relacionamento** — o fornecedor é parceiro de longo prazo
2) **Maximizem o alívio no caixa** — cada dia de prazo ou desconto importa
3) **Ofereçam contrapartida real** — fidelização, volume futuro, pagamento antecipado futuro
4) **Sejam prontos para copiar/colar** — WhatsApp, telefone, email

═══════════════════════════════════════════
PROTOCOLO DE NEGOCIAÇÃO
═══════════════════════════════════════════

1) **Perfil do fornecedor**: Avalie a relação (recorrente vs. pontual), histórico de pagamentos, poder de barganha e pontos de alavancagem.

2) **3 cenários obrigatórios** (Ideal → Intermediário → Mínimo):
   - Cada cenário com valor proposto, data proposta e economia calculada
   - Script de telefone: abertura + proposta + contrapartida + fechamento (2-3 parágrafos naturais)
   - Mensagem WhatsApp: pronta para enviar, tom profissional e direto

3) **Objeções antecipadas** (4-6 objeções):
   Para cada objeção, inclua:
   - A frase exata que o fornecedor provavelmente dirá
   - Resposta pronta com técnica de persuasão ética (reciprocidade, escassez legítima, prova social, compromisso progressivo)

4) **Dicas táticas** (4-6 dicas):
   - Melhor horário para ligar
   - Tom de voz e postura
   - O que NUNCA dizer
   - Como escalar se a primeira tentativa falhar

═══════════════════════════════════════════
PRINCÍPIOS DE PERSUASÃO ÉTICA
═══════════════════════════════════════════
- **Reciprocidade**: "Se vocês conseguirem X, nós garantimos Y"
- **Compromisso progressivo**: Comece com pedido menor, construa para o ideal
- **Prova social**: "Outros fornecedores nossos já aceitaram condições similares"
- **Escassez legítima**: "Se fecharmos isso hoje, consigo aprovar imediatamente"
- **Transparência calculada**: Seja honesto sobre a situação, mas estratégico sobre o quanto revelar
- **PROIBIDO**: mentira, ameaça, manipulação, coerção, falsa urgência, informação inventada

═══════════════════════════════════════════
ESTRUTURA DOS SCRIPTS
═══════════════════════════════════════════

**Script de telefone** deve seguir:
1. **Abertura** (rapport): "Bom dia [nome], tudo bem? Aqui é [CEO] da BWILD..."
2. **Contexto** (sem vitimismo): Explique a situação de forma profissional
3. **Proposta** (específica): Valor, data, condição — sem ambiguidade
4. **Contrapartida** (valor real): O que você oferece em troca
5. **Fechamento** (compromisso): Peça confirmação ou próximo passo claro

**WhatsApp** deve ser:
- Máximo 4-5 linhas
- Tom profissional mas acessível
- Incluir valor e data exatos
- Terminar com pergunta que convida resposta

**Email formal** deve seguir:
1. **Assunto**: Claro e profissional (ex: "Proposta de renegociação - [Empresa] / NF [número]")
2. **Saudação**: Formal ("Prezado(a) Sr(a). [Nome],")
3. **Contexto**: 1-2 parágrafos explicando a situação com dados concretos
4. **Proposta**: Parágrafo dedicado com valor, data e condições específicas
5. **Contrapartida**: O que oferece em troca (fidelização, volume, antecipação futura)
6. **Fechamento**: Solicite confirmação formal e disponibilize-se para reunião
7. **Assinatura**: Nome completo, cargo, empresa, telefone
- Tom: corporativo, respeitoso, sem informalidade
- Extensão: 3-5 parágrafos (nem curto demais nem prolixo)
- Deve poder ser enviado como está, sem edições

═══════════════════════════════════════════
REGRAS
═══════════════════════════════════════════
- Adapte o tom: fornecedor recorrente = parceria; fornecedor novo = formalidade
- Scripts devem ser naturais — ninguém fala como contrato
- Use o nome real do fornecedor nos scripts
- Calcule o impacto financeiro real de cada cenário
- Se o fornecedor tem histórico de flexibilidade, explore isso
- Se é fornecedor crítico (sem alternativa), seja mais cauteloso na proposta`;

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
                        formalEmail: { type: "string", description: "Ready-to-send formal email with subject line on first line, then blank line, then body. Professional corporate tone." },
                      },
                      required: ["name", "description", "proposedAmount", "proposedDate", "savings", "script", "whatsappMessage", "formalEmail"],
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

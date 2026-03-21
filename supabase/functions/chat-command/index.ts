import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch current data context for the AI
    const [{ data: obras }, { data: transactions }, { data: cashBalance }] = await Promise.all([
      supabase.from("obras").select("*").order("code"),
      supabase.from("transactions").select("*").order("due_date"),
      supabase.from("cash_balance").select("*").order("balance_date", { ascending: false }).limit(1),
    ]);

    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `Você é o assistente financeiro inteligente da BWILD Finance, uma empresa de reformas e obras de interiores de alto padrão.
Você pode CONVERSAR com o usuário E EXECUTAR AÇÕES no sistema financeiro usando as ferramentas disponíveis.

DATA DE HOJE: ${today}

=== DADOS DO SISTEMA ===

OBRAS CADASTRADAS:
${(obras || []).map((o: any) => `- ${o.code} | Cliente: ${o.client_name} | Status: ${o.status} | Contrato: R$ ${o.contract_value} | ID: ${o.id}`).join("\n")}

TRANSAÇÕES (últimas 200):
${(transactions || []).slice(0, 200).map((t: any) => {
  const obraRef = t.obra_id ? (obras || []).find((o: any) => o.id === t.obra_id) : null;
  return `- ID: ${t.id} | ${t.type} | ${t.description} | ${t.counterpart} | R$ ${t.amount} | Venc: ${t.due_date} | Status: ${t.status} | Pago em: ${t.paid_at || "não"} | Cobranças: ${t.billing_count}${obraRef ? ` | Obra: ${obraRef.code}` : ""}`;
}).join("\n")}

SALDO ATUAL: R$ ${cashBalance?.[0]?.amount ?? "não informado"}

=== REGRAS ===
1. Quando o usuário pedir para confirmar/marcar como pago, use a ferramenta confirm_transactions
2. Quando pedir para criar transação, use create_transaction
3. Quando pedir para atualizar cobrança, use update_billing
4. Quando pedir para alterar transação, use update_transaction
5. Interprete linguagem natural: "já foram pagas" = confirmar, "registrar pagamento" = criar transação tipo pagar
6. Ao confirmar parcelas, identifique pelo cliente, obra, período ou descrição
7. Sempre confirme a ação antes de executar, listando o que vai fazer
8. Responda SEMPRE em português brasileiro
9. Seja conciso e direto
10. Quando o contexto for ambíguo, pergunte para esclarecer
11. Após executar ações, resuma o que foi feito

IMPORTANTE: Quando o usuário disser algo como "as parcelas passadas do cliente X já foram pagas", você deve:
1. Identificar todas as transações do tipo "receber" desse cliente com vencimento anterior a hoje
2. Filtrar apenas as que ainda não estão confirmadas
3. Usar confirm_transactions para marcá-las como pagas
4. Informar quantas parcelas foram confirmadas e o valor total`;

    const tools = [
      {
        type: "function",
        function: {
          name: "confirm_transactions",
          description: "Confirma (marca como pago) uma ou mais transações pelo ID. Use quando o usuário disser que parcelas foram pagas, recebidas ou confirmadas.",
          parameters: {
            type: "object",
            properties: {
              transaction_ids: {
                type: "array",
                items: { type: "string" },
                description: "Lista de IDs das transações a confirmar",
              },
              paid_date: {
                type: "string",
                description: "Data do pagamento no formato YYYY-MM-DD. Se não informado, usa hoje.",
              },
            },
            required: ["transaction_ids"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "create_transaction",
          description: "Cria uma nova transação no sistema. Use quando o usuário pedir para registrar um pagamento, recebimento ou lançamento.",
          parameters: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["pagar", "receber"] },
              description: { type: "string" },
              counterpart: { type: "string", description: "Nome do cliente ou fornecedor" },
              amount: { type: "number" },
              due_date: { type: "string", description: "YYYY-MM-DD" },
              category: { type: "string" },
              obra_id: { type: "string", description: "ID da obra, se aplicável" },
              notes: { type: "string" },
              status: { type: "string", enum: ["pendente", "previsto", "confirmado"], description: "Default: pendente" },
            },
            required: ["type", "description", "amount", "due_date"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_billing",
          description: "Atualiza o contador de cobranças de uma transação recebível. Use quando o usuário disser que enviou cobrança.",
          parameters: {
            type: "object",
            properties: {
              transaction_id: { type: "string" },
              billing_count: { type: "number" },
              billing_sent_at: { type: "string", description: "YYYY-MM-DD" },
              notes: { type: "string", description: "Observação sobre a cobrança" },
            },
            required: ["transaction_id"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_transaction",
          description: "Atualiza campos de uma transação existente. Use para alterar valor, data, status, descrição, etc.",
          parameters: {
            type: "object",
            properties: {
              transaction_id: { type: "string" },
              updates: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  counterpart: { type: "string" },
                  amount: { type: "number" },
                  due_date: { type: "string" },
                  status: { type: "string" },
                  notes: { type: "string" },
                  category: { type: "string" },
                  payment_method: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            required: ["transaction_id", "updates"],
            additionalProperties: false,
          },
        },
      },
    ];

    // First AI call - understand intent
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
          ...messages,
        ],
        tools,
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
      console.error("AI error:", status, t);
      throw new Error("Erro na IA");
    }

    const aiData = await response.json();
    const choice = aiData.choices?.[0]?.message;

    // If there are tool calls, execute them
    if (choice?.tool_calls?.length) {
      const toolResults: any[] = [];

      for (const toolCall of choice.tool_calls) {
        const fn = toolCall.function;
        const args = JSON.parse(fn.arguments);
        let result: any;

        try {
          switch (fn.name) {
            case "confirm_transactions": {
              const paidDate = args.paid_date || today;
              const { data, error } = await supabase
                .from("transactions")
                .update({ status: "confirmado", paid_at: paidDate })
                .in("id", args.transaction_ids)
                .select();
              if (error) throw error;
              result = { success: true, confirmed: data?.length || 0, ids: args.transaction_ids };
              break;
            }
            case "create_transaction": {
              const { data, error } = await supabase
                .from("transactions")
                .insert({
                  type: args.type,
                  description: args.description,
                  counterpart: args.counterpart || "",
                  amount: args.amount,
                  due_date: args.due_date,
                  category: args.category || "Outros",
                  obra_id: args.obra_id || null,
                  notes: args.notes || "",
                  status: args.status || "pendente",
                })
                .select()
                .single();
              if (error) throw error;
              result = { success: true, transaction: data };
              break;
            }
            case "update_billing": {
              const updates: any = {};
              if (args.billing_count !== undefined) updates.billing_count = args.billing_count;
              if (args.billing_sent_at) updates.billing_sent_at = args.billing_sent_at;
              if (args.notes) updates.notes = args.notes;
              const { data, error } = await supabase
                .from("transactions")
                .update(updates)
                .eq("id", args.transaction_id)
                .select()
                .single();
              if (error) throw error;
              result = { success: true, transaction: data };
              break;
            }
            case "update_transaction": {
              const { data, error } = await supabase
                .from("transactions")
                .update(args.updates)
                .eq("id", args.transaction_id)
                .select()
                .single();
              if (error) throw error;
              result = { success: true, transaction: data };
              break;
            }
            default:
              result = { error: `Unknown function: ${fn.name}` };
          }
        } catch (e) {
          console.error(`Tool ${fn.name} error:`, e);
          result = { error: e instanceof Error ? e.message : "Erro ao executar ação" };
        }

        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Second AI call with tool results to generate final response
      const followUp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
            choice,
            ...toolResults,
          ],
        }),
      });

      if (!followUp.ok) {
        const t = await followUp.text();
        console.error("Follow-up error:", followUp.status, t);
        throw new Error("Erro ao gerar resposta");
      }

      const followUpData = await followUp.json();
      const finalContent = followUpData.choices?.[0]?.message?.content || "Ações executadas com sucesso.";

      return new Response(JSON.stringify({
        content: finalContent,
        actions_executed: choice.tool_calls.map((tc: any) => tc.function.name),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No tool calls - just conversation
    return new Response(JSON.stringify({
      content: choice?.content || "Não entendi. Pode reformular?",
      actions_executed: [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-command error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

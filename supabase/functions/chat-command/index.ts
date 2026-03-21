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
          description: "Confirma (marca como pago) uma ou mais transações pelo ID.",
          parameters: {
            type: "object",
            properties: {
              transaction_ids: { type: "array", items: { type: "string" } },
              paid_date: { type: "string" },
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
          description: "Cria uma nova transação no sistema.",
          parameters: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["pagar", "receber"] },
              description: { type: "string" },
              counterpart: { type: "string" },
              amount: { type: "number" },
              due_date: { type: "string" },
              category: { type: "string" },
              obra_id: { type: "string" },
              notes: { type: "string" },
              status: { type: "string", enum: ["pendente", "previsto", "confirmado"] },
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
          description: "Atualiza o contador de cobranças de uma transação recebível.",
          parameters: {
            type: "object",
            properties: {
              transaction_id: { type: "string" },
              billing_count: { type: "number" },
              billing_sent_at: { type: "string" },
              notes: { type: "string" },
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
          description: "Atualiza campos de uma transação existente.",
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

    // Helper to execute tool calls
    async function executeToolCalls(toolCalls: any[]) {
      const results: any[] = [];
      const actionsExecuted: string[] = [];

      for (const toolCall of toolCalls) {
        const fn = toolCall.function;
        const args = JSON.parse(fn.arguments);
        let result: any;
        actionsExecuted.push(fn.name);

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

        results.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      return { results, actionsExecuted };
    }

    // First AI call - understand intent (non-streaming to check for tool calls)
    const firstResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools,
      }),
    });

    if (!firstResponse.ok) {
      const status = firstResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro na IA");
    }

    const aiData = await firstResponse.json();
    const choice = aiData.choices?.[0]?.message;

    // Build the messages for the streaming call
    let streamMessages: any[];
    let actionsExecuted: string[] = [];

    if (choice?.tool_calls?.length) {
      // Execute tools, then stream the follow-up
      const { results, actionsExecuted: actions } = await executeToolCalls(choice.tool_calls);
      actionsExecuted = actions;
      streamMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
        choice,
        ...results,
      ];
    } else if (choice?.content) {
      // No tool calls and we already have content — just return it as a simple stream-like SSE
      const body = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          if (actionsExecuted.length > 0) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "actions", actions: actionsExecuted })}\n\n`));
          }
          // Send entire content as one chunk (already complete)
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "delta", content: choice.content })}\n\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        },
      });
      return new Response(body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    } else {
      // Fallback
      streamMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];
    }

    // Streaming AI call for the final response
    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: streamMessages,
        stream: true,
      }),
    });

    if (!streamResponse.ok || !streamResponse.body) {
      throw new Error("Erro ao gerar resposta streaming");
    }

    // Transform the OpenAI SSE stream into our custom SSE format
    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const body = new ReadableStream({
      async start(controller) {
        // Send actions event first if any
        if (actionsExecuted.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "actions", actions: actionsExecuted })}\n\n`));
        }

        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIdx: number;
            while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, newlineIdx);
              buffer = buffer.slice(newlineIdx + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", content })}\n\n`));
                }
              } catch {
                // partial JSON, put back
                buffer = line + "\n" + buffer;
                break;
              }
            }
          }
        } catch (e) {
          console.error("Stream read error:", e);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      },
    });

    return new Response(body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("chat-command error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

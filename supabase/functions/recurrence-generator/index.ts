import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Maps recurrence type to the date increment
function getNextDueDate(currentDue: string, recurrence: string): string | null {
  const d = new Date(currentDue + "T12:00:00Z");
  switch (recurrence) {
    case "semanal":
      d.setDate(d.getDate() + 7);
      break;
    case "mensal":
      d.setMonth(d.getMonth() + 1);
      break;
    case "trimestral":
      d.setMonth(d.getMonth() + 3);
      break;
    case "anual":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return null;
  }
  return d.toISOString().split("T")[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Horizon: generate up to 45 days ahead
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 45);
    const horizonStr = horizon.toISOString().split("T")[0];

    // 1. Fetch all recurring transactions (recurrence != 'única')
    const { data: recurring, error: fetchErr } = await supabase
      .from("transactions")
      .select("*")
      .neq("recurrence", "única")
      .order("due_date", { ascending: false });

    if (fetchErr) throw fetchErr;
    if (!recurring || recurring.length === 0) {
      return new Response(
        JSON.stringify({ message: "No recurring transactions found", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Group by a "series key" to find the latest due_date per series
    // Series key = type + description + counterpart + amount + recurrence + obra_id
    const seriesMap = new Map<
      string,
      { latestDueDate: string; template: any }
    >();

    for (const tx of recurring) {
      const key = [
        tx.type,
        tx.description,
        tx.counterpart,
        String(tx.amount),
        tx.recurrence,
        tx.obra_id || "null",
      ].join("|");

      const existing = seriesMap.get(key);
      if (!existing || tx.due_date > existing.latestDueDate) {
        seriesMap.set(key, { latestDueDate: tx.due_date, template: tx });
      }
    }

    // 3. For each series, generate next occurrences up to horizon
    const toInsert: any[] = [];

    for (const [_key, { latestDueDate, template }] of seriesMap) {
      let nextDate = getNextDueDate(latestDueDate, template.recurrence);

      // Generate multiple if needed (e.g., if cron was offline for a while)
      let safety = 0;
      while (nextDate && nextDate <= horizonStr && nextDate >= todayStr && safety < 12) {
        toInsert.push({
          type: template.type,
          description: template.description,
          counterpart: template.counterpart,
          amount: template.amount,
          due_date: nextDate,
          status: "previsto",
          cost_center: template.cost_center,
          category: template.category,
          recurrence: template.recurrence,
          payment_method: template.payment_method,
          notes: template.notes || "",
          priority: template.priority,
          obra_id: template.obra_id,
        });

        nextDate = getNextDueDate(nextDate, template.recurrence);
        safety++;
      }
    }

    if (toInsert.length === 0) {
      return new Response(
        JSON.stringify({ message: "All recurrences up to date", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Check for duplicates before inserting
    // Fetch existing transactions in the horizon window to avoid duplicates
    const { data: existingTxs } = await supabase
      .from("transactions")
      .select("type, description, counterpart, amount, due_date, obra_id")
      .gte("due_date", todayStr)
      .lte("due_date", horizonStr);

    const existingKeys = new Set(
      (existingTxs || []).map((tx: any) =>
        [tx.type, tx.description, tx.counterpart, String(tx.amount), tx.due_date, tx.obra_id || "null"].join("|")
      )
    );

    const uniqueInserts = toInsert.filter((tx) => {
      const key = [tx.type, tx.description, tx.counterpart, String(tx.amount), tx.due_date, tx.obra_id || "null"].join("|");
      if (existingKeys.has(key)) return false;
      existingKeys.add(key); // prevent duplicates within the batch
      return true;
    });

    if (uniqueInserts.length === 0) {
      return new Response(
        JSON.stringify({ message: "All recurrences already exist", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Insert
    const { error: insertErr } = await supabase
      .from("transactions")
      .insert(uniqueInserts);

    if (insertErr) throw insertErr;

    console.log(`Created ${uniqueInserts.length} recurring transactions`);

    return new Response(
      JSON.stringify({
        message: `${uniqueInserts.length} transações recorrentes geradas`,
        created: uniqueInserts.length,
        details: uniqueInserts.map((t: any) => ({
          description: t.description,
          dueDate: t.due_date,
          amount: t.amount,
          type: t.type,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Recurrence generator error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

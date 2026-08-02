import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const PayloadSchema = z.object({
  _source_system: z.string().min(1).default('envision'),
  _source_id: z.string().uuid(),
  project_name: z.string().min(1).max(300).default(''),
  client_name: z.string().min(1).max(300),
  client_phone: z.string().max(60).optional().nullable(),
  client_email: z.string().max(200).optional().nullable(),
  condominio: z.string().max(200).optional().nullable(),
  bairro: z.string().max(200).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  cep: z.string().max(30).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  metragem: z.union([z.number(), z.string()]).optional().nullable(),
  unit: z.string().max(60).optional().nullable(),
  total_value: z.union([z.number(), z.string()]).optional().nullable(),
  planned_start_date: z.string().optional().nullable(),
  planned_end_date: z.string().optional().nullable(),
  contract_signing_date: z.string().optional().nullable(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'OBR-';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

const num = (v: unknown): number => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  return 0;
};

const dateOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expectedKey = Deno.env.get('INTEGRATION_API_KEY');
  const providedKey = req.headers.get('x-integration-key');
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const p = parsed.data;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const sourceSystem = p._source_system || 'envision';
  const entityType = 'obra';

  const addressParts = [p.address, p.bairro, p.city, p.cep].filter(v => !!v && String(v).trim());
  const address = addressParts.join(' - ');
  const totalValue = num(p.total_value);
  const today = new Date().toISOString().slice(0, 10);
  const metragem = p.metragem != null && String(p.metragem).trim() ? String(p.metragem) : 'não informada';
  const notes = `Criada via integração Envision (orçamento ${p._source_id}) em ${today} — metragem ${metragem} m²`;

  const obraData = {
    client_name: p.client_name,
    client_email: p.client_email || '',
    client_phone: p.client_phone || '',
    condominium: p.condominio || '',
    unit_number: p.unit || '',
    address,
    status: 'ativa',
    contract_value: totalValue,
    expected_start_date: dateOrNull(p.planned_start_date),
    expected_end_date: dateOrNull(p.planned_end_date),
    notes,
  };

  try {
    const { data: existingLog } = await supabase
      .from('integration_sync_log')
      .select('*')
      .eq('source_system', sourceSystem)
      .eq('entity_type', entityType)
      .eq('source_id', p._source_id)
      .maybeSingle();

    let obraId: string | null = existingLog?.target_id ?? null;
    let created = false;

    if (obraId) {
      const { error } = await supabase.from('obras').update(obraData).eq('id', obraId);
      if (error) throw error;
    } else {
      let insertErr: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase
          .from('obras')
          .insert({ ...obraData, code: generateCode() })
          .select('id')
          .single();
        if (!error) {
          obraId = data.id;
          created = true;
          insertErr = null;
          break;
        }
        insertErr = error;
        if (!String((error as { message?: string }).message || '').includes('duplicate')) break;
      }
      if (!obraId) throw insertErr ?? new Error('Falha ao criar obra');
    }

    const txData = {
      type: 'receber',
      description: `Contrato ${p.project_name || p.client_name} — a parcelar`,
      counterpart: p.client_name,
      amount: totalValue,
      due_date: dateOrNull(p.contract_signing_date) || today,
      status: 'previsto',
      priority: 'alta',
      category: 'Parcela de Contrato',
      cost_center: 'Operação',
      obra_id: obraId,
      source: 'integracao',
      needs_review: true,
      notes: 'Valor total do contrato vindo do Envision — parcelar conforme condições de pagamento',
    };

    const existingTxId = (existingLog?.payload as { transaction_id?: string } | null)?.transaction_id ?? null;
    let transactionId = existingTxId;

    if (existingTxId) {
      const { error } = await supabase.from('transactions').update(txData).eq('id', existingTxId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('transactions').insert(txData).select('id').single();
      if (error) throw error;
      transactionId = data.id;
    }

    const { error: logError } = await supabase.from('integration_sync_log').upsert({
      source_system: sourceSystem,
      target_system: 'flow_finance',
      entity_type: entityType,
      source_id: p._source_id,
      target_id: obraId,
      sync_status: 'success',
      payload: { ...p, transaction_id: transactionId },
      error_message: null,
      attempts: (existingLog?.attempts ?? 0) + 1,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'source_system,entity_type,source_id' });
    if (logError) console.error('sync log error', logError);

    return json({ success: true, created, obra_id: obraId, transaction_id: transactionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('sync-obra-inbound failed', message);
    await supabase.from('integration_sync_log').upsert({
      source_system: sourceSystem,
      target_system: 'flow_finance',
      entity_type: entityType,
      source_id: p._source_id,
      sync_status: 'error',
      payload: p,
      error_message: message,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'source_system,entity_type,source_id' });
    return json({ success: false, error: message }, 500);
  }
});

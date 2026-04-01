const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? '';
const API_KEY = Deno.env.get('CLOUDINARY_API_KEY') ?? '';
const API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') ?? '';
const BASE_FOLDER = (Deno.env.get('CLOUDINARY_FOLDER') ?? 'grupo-lopar').trim().replace(/^\/+|\/+$/g, '');

type ModuleName = 'materiales' | 'concretera';

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const sha1Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return toHex(digest);
};

const buildFolder = (input: {
  module: ModuleName;
  branchId?: string | null;
  customerId?: string | null;
  noteId?: string | null;
  paymentId?: string | null;
  transactionId?: string | null;
}) => {
  const parts = [
    BASE_FOLDER || 'grupo-lopar',
    input.module,
    'abonos',
    input.branchId ? `branch-${input.branchId}` : null,
    input.customerId ? `customer-${input.customerId}` : null,
    input.noteId ? `note-${input.noteId}` : null,
    input.paymentId ? `payment-${input.paymentId}` : null,
    input.transactionId ? `sale-${input.transactionId}` : null,
  ].filter(Boolean);

  return parts.join('/');
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    return jsonResponse(200, {
      ok: true,
      configured: Boolean(CLOUD_NAME && API_KEY && API_SECRET),
    });
  }

  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return jsonResponse(405, { error: 'Método no permitido.' });
  }

  try {
    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return jsonResponse(500, { error: 'Cloudinary no está configurado en la función.' });
    }

    if (request.method === 'DELETE') {
      const payload = await request.json().catch(() => ({} as Record<string, unknown>));
      const publicId = String(payload.public_id ?? '').trim();
      const resourceType = String(payload.resource_type ?? 'image').trim() || 'image';

      if (!publicId) {
        return jsonResponse(400, { error: 'public_id es obligatorio.' });
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await sha1Hex(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`);
      const destroyForm = new FormData();
      destroyForm.append('public_id', publicId);
      destroyForm.append('invalidate', 'true');
      destroyForm.append('api_key', API_KEY);
      destroyForm.append('timestamp', String(timestamp));
      destroyForm.append('signature', signature);

      const destroyResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/destroy`, {
        method: 'POST',
        body: destroyForm,
      });

      const destroyPayload = await destroyResponse.json().catch(() => ({}));
      if (!destroyResponse.ok) {
        const cloudinaryMessage =
          typeof destroyPayload?.error?.message === 'string'
            ? destroyPayload.error.message
            : 'No se pudo eliminar la evidencia de Cloudinary.';
        return jsonResponse(502, { error: cloudinaryMessage });
      }

      return jsonResponse(200, {
        ok: true,
        result: destroyPayload?.result ?? 'ok',
      });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonResponse(400, { error: 'No se recibió ningún archivo.' });
    }

    const module = String(formData.get('module') ?? '').trim().toLowerCase();
    if (module !== 'materiales' && module !== 'concretera') {
      return jsonResponse(400, { error: 'Módulo inválido para la evidencia.' });
    }

    const folder = buildFolder({
      module,
      branchId: String(formData.get('branch_id') ?? '').trim() || null,
      customerId: String(formData.get('customer_id') ?? '').trim() || null,
      noteId: String(formData.get('note_id') ?? '').trim() || null,
      paymentId: String(formData.get('payment_id') ?? '').trim() || null,
      transactionId: String(formData.get('transaction_id') ?? '').trim() || null,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}${API_SECRET}`);

    const cloudinaryForm = new FormData();
    cloudinaryForm.append('file', file, file.name);
    cloudinaryForm.append('api_key', API_KEY);
    cloudinaryForm.append('timestamp', String(timestamp));
    cloudinaryForm.append('folder', folder);
    cloudinaryForm.append('signature', signature);

    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
      method: 'POST',
      body: cloudinaryForm,
    });

    const uploadPayload = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) {
      const cloudinaryMessage =
        typeof uploadPayload?.error?.message === 'string'
          ? uploadPayload.error.message
          : 'No se pudo subir la evidencia a Cloudinary.';
      return jsonResponse(502, { error: cloudinaryMessage });
    }

    return jsonResponse(200, {
      file_url: uploadPayload.url ?? uploadPayload.secure_url ?? null,
      secure_url: uploadPayload.secure_url ?? uploadPayload.url ?? null,
      public_id: uploadPayload.public_id ?? null,
      resource_type: uploadPayload.resource_type ?? 'raw',
      format: uploadPayload.format ?? null,
      original_filename: uploadPayload.original_filename ?? file.name ?? null,
      bytes: uploadPayload.bytes ?? file.size ?? null,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'No se pudo procesar la evidencia.',
    });
  }
});

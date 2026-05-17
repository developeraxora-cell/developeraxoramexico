const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const UPLOAD_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/payment-evidence-upload` : '';

export interface UploadedDocument {
  file_url: string;
  secure_url: string;
  public_id: string | null;
  resource_type: string;
  format: string | null;
  original_filename: string | null;
  bytes: number | null;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

export const validateDocumentFile = (file: File) => {
  const ext = file.name.split('.').pop()?.trim().toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('Solo JPG, PNG, WEBP o PDF.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Archivo supera 10 MB.');
  }
};

export const vinosDocumentUploadService = {
  isConfigured() {
    return Boolean(UPLOAD_URL && SUPABASE_ANON_KEY);
  },

  async upload(file: File, payload: { branch_id?: string | null; customer_id?: string | null }): Promise<UploadedDocument> {
    if (!UPLOAD_URL) throw new Error('Servicio de carga no configurado.');
    validateDocumentFile(file);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('module', 'vinos');
    formData.append('category', 'documentos');
    if (payload.branch_id) formData.append('branch_id', payload.branch_id);
    if (payload.customer_id) formData.append('customer_id', payload.customer_id);

    const headers: Record<string, string> = {};
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const res = await fetch(UPLOAD_URL, { method: 'POST', headers, body: formData });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(json?.error || 'Error al subir archivo.'));
    return json as UploadedDocument;
  },

  async delete(public_id: string, resource_type = 'image'): Promise<void> {
    if (!UPLOAD_URL) throw new Error('Servicio de carga no configurado.');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }
    const res = await fetch(UPLOAD_URL, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ public_id, resource_type: resource_type || 'image' }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(String(json?.error || 'No se pudo eliminar archivo.'));
    }
  },
};

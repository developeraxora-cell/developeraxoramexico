const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const DEFAULT_UPLOAD_API_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/payment-evidence-upload` : '';
const PAYMENT_EVIDENCE_UPLOAD_URL = (import.meta.env.VITE_PAYMENT_EVIDENCE_UPLOAD_URL ?? DEFAULT_UPLOAD_API_URL).trim();

export interface UploadedPaymentEvidence {
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

export const validatePaymentEvidenceFile = (file: File) => {
  const extension = file.name.split('.').pop()?.trim().toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error('Solo se permiten archivos JPG, PNG, WEBP o PDF.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('El archivo supera el límite de 10 MB.');
  }
};

export const paymentEvidenceUploadService = {
  isConfigured() {
    return Boolean(PAYMENT_EVIDENCE_UPLOAD_URL && SUPABASE_ANON_KEY);
  },

  async upload(file: File, payload: { module: 'materiales' | 'concretera'; branch_id: string; customer_id?: string | null; note_id?: string | null; payment_id?: string | null }) {
    if (!PAYMENT_EVIDENCE_UPLOAD_URL) {
      throw new Error('La función de carga de evidencias no está configurada.');
    }

    validatePaymentEvidenceFile(file);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('module', payload.module);
    formData.append('branch_id', payload.branch_id);
    if (payload.customer_id) formData.append('customer_id', payload.customer_id);
    if (payload.note_id) formData.append('note_id', payload.note_id);
    if (payload.payment_id) formData.append('payment_id', payload.payment_id);

    const headers: Record<string, string> = {};
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const response = await fetch(PAYMENT_EVIDENCE_UPLOAD_URL, {
      method: 'POST',
      headers,
      body: formData,
    });

    const payloadJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payloadJson?.error || 'No se pudo subir la evidencia.'));
    }

    return payloadJson as UploadedPaymentEvidence;
  },
};

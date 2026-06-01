// "Conciencia" del Asistente IA: registra errores de SQL y su corrección para no
// repetirlos. Se persiste en localStorage y se inyecta al contexto en cada consulta.

export interface SqlLesson {
  error: string;     // mensaje de error que ocurrió
  fixedSql: string;  // consulta que sí funcionó
  at: string;        // ISO timestamp
}

const KEY = 'lopar_ai_sql_lessons';
const MAX = 25;

export function loadLessons(): SqlLesson[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SqlLesson[]) : [];
  } catch {
    return [];
  }
}

function shorten(s: string, n: number) {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

export function addLesson(error: string, fixedSql: string): void {
  try {
    const lessons = loadLessons();
    const entry: SqlLesson = {
      error: shorten(error, 180),
      fixedSql: shorten(fixedSql, 400),
      at: new Date().toISOString(),
    };
    // Evitar duplicados por mismo error+fix
    const exists = lessons.some((l) => l.error === entry.error && l.fixedSql === entry.fixedSql);
    if (exists) return;
    const next = [entry, ...lessons].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

/** Bloque de texto con las lecciones para inyectar al system prompt. */
export function lessonsContext(): string {
  const lessons = loadLessons();
  if (!lessons.length) return '';
  const lines = lessons
    .slice(0, 12)
    .map((l, i) => `${i + 1}. Antes falló: "${l.error}". Consulta que SÍ funcionó: ${l.fixedSql}`)
    .join('\n');
  return `# LECCIONES APRENDIDAS (no repitas estos errores; reutiliza estas consultas que ya funcionaron)\n${lines}`;
}

export function clearLessons(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Megaphone, Plus, X, Send, Users, Calendar, Percent, Eye,
  Loader2, Trash2, Search, MessageSquare, CheckCircle2, XCircle, Clock,
  ChevronRight, ChevronLeft, Check, UserPlus,
} from 'lucide-react';
import { Branch, User } from '../../types';
import {
  vinosCampaignsService, renderMessage,
  type Campaign, type SegmentType, type SegmentConfig, type Recipient,
} from '../../services/vinos/campaigns.service';
import { vinosCustomersService, type VinosCustomer } from '../../services/vinos/customers.service';
import { logVinosAudit } from '../../services/audit/audit.service';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

const SEGMENTS: { value: SegmentType; label: string; desc: string }[] = [
  { value: 'AT_RISK',       label: 'En riesgo',        desc: 'EN_RIESGO o PERDIDO' },
  { value: 'INFREQUENT',    label: 'Poco frecuentes',  desc: 'Sin comprar en N días' },
  { value: 'BIRTHDAY',      label: 'Cumpleaños del mes', desc: 'Cumplen este mes' },
  { value: 'LOYALTY',       label: 'Por nivel',        desc: 'Bronce / Plata / Oro / Black' },
  { value: 'STATUS',        label: 'Por estado',       desc: 'Activo / Dormido / etc.' },
  { value: 'CUSTOMER_TYPE', label: 'Por tipo',         desc: 'Vino / Whisky / etc.' },
  { value: 'ALL',           label: 'Todos',            desc: 'Todos los clientes activos' },
];

interface MessageTemplate { id: string; label: string; segment?: SegmentType; text: string; }

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  { id: 'general', label: 'General / Promoción',
    text: 'Hola {{nombre_cliente}} 👋 tenemos una promoción especial para ti: {{descuento}} de descuento con el código {{promocion}}, válido del {{fecha_inicio_promocion}} al {{fecha_fin_promocion}}. ¡Te esperamos! 🍷' },
  { id: 'at_risk', label: 'Reactivación (en riesgo)', segment: 'AT_RISK',
    text: 'Hola {{nombre_cliente}}, ¡te extrañamos! 🍷 Vuelve y disfruta {{descuento}} de descuento con tu código {{promocion}}, válido del {{fecha_inicio_promocion}} al {{fecha_fin_promocion}}. Te esperamos.' },
  { id: 'infrequent', label: 'Te extrañamos (poco frecuentes)', segment: 'INFREQUENT',
    text: 'Hola {{nombre_cliente}}, hace tiempo no nos visitas 🥂 Tenemos {{descuento}} de descuento para ti con el código {{promocion}}, del {{fecha_inicio_promocion}} al {{fecha_fin_promocion}}. ¡Vuelve pronto!' },
  { id: 'birthday', label: 'Cumpleaños 🎂', segment: 'BIRTHDAY',
    text: '🎉 ¡Feliz cumpleaños {{nombre_cliente}}! Para celebrar te regalamos {{descuento}} de descuento con el código {{promocion}}, válido del {{fecha_inicio_promocion}} al {{fecha_fin_promocion}}. ¡Salud! 🥂' },
  { id: 'loyalty', label: 'Cliente preferente', segment: 'LOYALTY',
    text: 'Hola {{nombre_cliente}}, gracias por tu preferencia ✨ Como cliente especial tienes {{descuento}} de descuento con el código {{promocion}}, válido del {{fecha_inicio_promocion}} al {{fecha_fin_promocion}}.' },
];

const DEFAULT_TEMPLATE_FOR = (seg: SegmentType | null): MessageTemplate =>
  MESSAGE_TEMPLATES.find(t => t.segment === seg) ?? MESSAGE_TEMPLATES[0];

const LOYALTY_LEVELS = ['BRONCE', 'PLATA', 'ORO', 'BLACK'];
const STATUSES = ['ACTIVO', 'DORMIDO', 'EN_RIESGO', 'PERDIDO'];
const CUSTOMER_TYPES = ['vino', 'whisky', 'cerveza_artesanal', 'tequila', 'premium', 'fiesta_eventos'];

const VARIABLES = ['{{nombre_cliente}}', '{{promocion}}', '{{fecha_inicio_promocion}}', '{{fecha_fin_promocion}}', '{{descuento}}'];

const CAMPAIGN_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  BORRADOR:   { label: 'Borrador',   bg: 'bg-slate-100',  text: 'text-slate-700'  },
  ENVIADA:    { label: 'Enviada',    bg: 'bg-green-100',  text: 'text-green-800'  },
  FINALIZADA: { label: 'Finalizada', bg: 'bg-blue-100',   text: 'text-blue-800'   },
  CANCELADA:  { label: 'Cancelada', bg: 'bg-red-100',    text: 'text-red-700'    },
};

const PROMO_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVA:    { label: 'Activa',    bg: 'bg-green-100',  text: 'text-green-800'  },
  USADA:     { label: 'Usada',     bg: 'bg-slate-200',  text: 'text-slate-700'  },
  VENCIDA:   { label: 'Vencida',   bg: 'bg-amber-100',  text: 'text-amber-800'  },
  CANCELADA: { label: 'Cancelada', bg: 'bg-red-100',    text: 'text-red-700'    },
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const plusDaysStr = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const DEFAULT_MESSAGE = MESSAGE_TEMPLATES[0].text;

interface DetailRow { name: string; phone: string | null; code: string | null; status: string | null; }

const VinosCampaignsScreen: React.FC<Props> = ({ selectedBranchId, branches, currentUser }) => {
  const [branchDbId, setBranchDbId] = useState<number | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [allCustomers, setAllCustomers] = useState<VinosCustomer[]>([]);

  // wizard
  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [discount, setDiscount] = useState('10');
  const [validFrom, setValidFrom] = useState(todayStr());
  const [validTo, setValidTo] = useState(plusDaysStr(15));
  const [segmentType, setSegmentType] = useState<SegmentType | null>(null);
  const [levels, setLevels] = useState<string[]>(['ORO', 'BLACK']);
  const [statuses, setStatuses] = useState<string[]>(['EN_RIESGO']);
  const [types, setTypes] = useState<string[]>(['vino']);
  const [infreqDays, setInfreqDays] = useState('30');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [resolving, setResolving] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  // detail
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailUseFilter, setDetailUseFilter] = useState<'ALL' | 'USED' | 'UNUSED'>('ALL');
  const [detailPage, setDetailPage] = useState(1);
  const DETAIL_PAGE_SIZE = 10;

  // send / delete confirm
  const [sendTarget, setSendTarget] = useState<Campaign | null>(null);
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleteNote, setDeleteNote] = useState('');

  useEffect(() => {
    vinosCustomersService.getBranchId(selectedBranchId).then(setBranchDbId);
  }, [selectedBranchId]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCampaigns(await vinosCampaignsService.list(branchDbId)); }
    catch (e) { console.error('Error cargando campañas:', e); }
    if (branchDbId) {
      try { setAllCustomers(await vinosCustomersService.getAll(branchDbId)); } catch { /* noop */ }
    }
    setLoading(false);
  }, [branchDbId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const segmentConfig = useCallback((): SegmentConfig => {
    switch (segmentType) {
      case 'LOYALTY':       return { levels };
      case 'STATUS':        return { statuses };
      case 'CUSTOMER_TYPE': return { types };
      case 'INFREQUENT':    return { days: Number(infreqDays) || 30 };
      default:              return {};
    }
  }, [segmentType, levels, statuses, types, infreqDays]);

  const openCreate = () => {
    setStep(1); setName(''); setDiscount('10'); setValidFrom(todayStr()); setValidTo(plusDaysStr(15));
    setSegmentType(null); setLevels(['ORO', 'BLACK']); setStatuses(['EN_RIESGO']); setTypes(['vino']);
    setInfreqDays('30'); setRecipients([]); setAddSearch(''); setMessage(DEFAULT_MESSAGE);
    setCreateOpen(true);
  };

  const applySegment = async (type: SegmentType) => {
    setSegmentType(type);
    // Sugerir plantilla del segmento si el mensaje sigue siendo una plantilla sin editar
    if (MESSAGE_TEMPLATES.some(t => t.text === message)) setMessage(DEFAULT_TEMPLATE_FOR(type).text);
    setResolving(true);
    try {
      const cfg: SegmentConfig =
        type === 'LOYALTY' ? { levels } :
        type === 'STATUS' ? { statuses } :
        type === 'CUSTOMER_TYPE' ? { types } :
        type === 'INFREQUENT' ? { days: Number(infreqDays) || 30 } : {};
      const r = await vinosCampaignsService.resolveRecipients(type, cfg, branchDbId);
      // Mantener agregados manuales que no estén en el segmento
      setRecipients(prev => {
        const ids = new Set(r.map(x => x.id));
        const manualExtras = prev.filter(x => !ids.has(x.id));
        return [...r, ...manualExtras];
      });
    } catch (e) {
      setFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Error al resolver segmento' });
    } finally { setResolving(false); }
  };

  const addRecipient = (c: VinosCustomer) => {
    setRecipients(prev => prev.some(r => r.id === c.id) ? prev : [...prev, {
      id: c.id, name: c.name, phone: c.phone ?? null,
      loyalty_level: c.loyalty_level, status: c.status, last_purchase_date: c.last_purchase_date ?? null,
    }]);
  };
  const removeRecipient = (id: string) => setRecipients(prev => prev.filter(r => r.id !== id));

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const insertVar = (v: string) => setMessage(m => `${m}${m && !m.endsWith(' ') ? ' ' : ''}${v}`);

  const previewMessage = useMemo(() => renderMessage(message, {
    nombre_cliente: recipients[0]?.name ?? 'Juan Pérez',
    promocion: 'PROMO-A1B2C', fecha_inicio: validFrom, fecha_fin: validTo, descuento: Number(discount) || 0,
  }), [message, validFrom, validTo, discount, recipients]);

  const addCandidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    const chosen = new Set(recipients.map(r => r.id));
    return allCustomers
      .filter(c => !chosen.has(c.id))
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      .slice(0, 30);
  }, [allCustomers, recipients, addSearch]);

  const step1Valid = name.trim() && Number(discount) > 0 && Number(discount) <= 100 && validFrom && validTo && validFrom <= validTo;
  const step2Valid = recipients.length > 0;
  const step3Valid = message.trim().length > 0;

  const saveCampaign = async () => {
    setSaving(true);
    try {
      const camp = await vinosCampaignsService.create({
        name: name.trim(),
        segment_type: segmentType ?? 'MANUAL',
        segment_config: segmentConfig(),
        recipient_ids: recipients.map(r => r.id),
        discount_percent: Number(discount),
        valid_from: validFrom,
        valid_to: validTo,
        message_template: message.trim(),
        branch_id: branchDbId,
        created_by: currentUser.id,
        created_by_name: currentUser.name,
      });
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id, user_name: currentUser.name,
        action_type: 'CREAR', entity_type: 'campania', entity_id: camp.id,
        description: `Campaña creada: ${camp.name} · ${recipients.length} clientes`,
        new_data: { name: camp.name, discount_percent: camp.discount_percent, total_recipients: recipients.length },
      });
      setCreateOpen(false);
      setFeedback({ type: 'success', msg: `Campaña creada · ${recipients.length} clientes` });
      load();
    } catch (e) {
      setFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Error al guardar' });
    } finally { setSaving(false); }
  };

  const openDetail = async (c: Campaign) => {
    setDetail(c); setLoadingDetail(true); setDetailRows([]); setDetailSearch(''); setDetailUseFilter('ALL'); setDetailPage(1);
    try {
      if (c.status === 'ENVIADA' || c.sent_count > 0) {
        const promos = await vinosCampaignsService.listPromotions({ campaignId: c.id });
        setDetailRows(promos.map(p => ({ name: p.customer_name ?? '—', phone: null, code: p.code, status: p.status })));
      } else {
        const recs = await vinosCampaignsService.listRecipients(c);
        setDetailRows(recs.map(r => ({ name: r.name, phone: r.phone, code: null, status: null })));
      }
    } catch (e) { console.error(e); }
    finally { setLoadingDetail(false); }
  };

  const doSend = async () => {
    if (!sendTarget) return;
    setSending(true);
    try {
      const res = await vinosCampaignsService.sendCampaign(sendTarget.id);
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id, user_name: currentUser.name,
        action_type: 'ACTUALIZAR', entity_type: 'campania', entity_id: sendTarget.id,
        description: `Campaña enviada: ${sendTarget.name} · ${res.sent} enviados / ${res.failed} fallidos`,
        new_data: { total: res.total, sent: res.sent, failed: res.failed },
      });
      setSendTarget(null);
      setFeedback({ type: res.failed === 0 ? 'success' : 'error', msg: `Enviados: ${res.sent} · Fallidos: ${res.failed}` });
      load();
    } catch (e) {
      setFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Error al enviar' });
    } finally { setSending(false); }
  };

  const doDelete = async () => {
    if (!deleteTarget || !deleteNote.trim()) { setFeedback({ type: 'error', msg: 'La observación es obligatoria.' }); return; }
    try {
      await vinosCampaignsService.softDelete(deleteTarget.id, deleteNote.trim());
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id, user_name: currentUser.name,
        action_type: 'ELIMINAR', entity_type: 'campania', entity_id: deleteTarget.id,
        description: `Campaña eliminada: ${deleteTarget.name}`, justification: deleteNote.trim(),
      });
      setDeleteTarget(null); setDeleteNote('');
      setFeedback({ type: 'success', msg: 'Campaña eliminada.' });
      load();
    } catch (e) {
      setFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Error al eliminar' });
    }
  };

  const detailHasCodes = useMemo(() => detailRows.some(r => r.code), [detailRows]);
  const detailFiltered = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();
    return detailRows
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .filter(r => detailUseFilter === 'ALL' ? true : detailUseFilter === 'USED' ? r.status === 'USADA' : r.status !== 'USADA');
  }, [detailRows, detailSearch, detailUseFilter]);
  const detailUsedCount = useMemo(() => detailRows.filter(r => r.status === 'USADA').length, [detailRows]);
  const detailTotalPages = Math.max(1, Math.ceil(detailFiltered.length / DETAIL_PAGE_SIZE));
  const detailPaged = useMemo(
    () => detailFiltered.slice((detailPage - 1) * DETAIL_PAGE_SIZE, detailPage * DETAIL_PAGE_SIZE),
    [detailFiltered, detailPage],
  );

  const STEPS = ['Datos', 'Clientes', 'Mensaje', 'Verificación'];

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {feedback.msg}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-purple-100 p-2.5 text-purple-600"><Megaphone size={20} /></div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Campañas</h1>
            <p className="text-[11px] font-bold text-slate-400">Envíos masivos WhatsApp + promociones por cliente</p>
          </div>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-2xl bg-purple-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-purple-500">
          <Plus size={16} /> Nueva campaña
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin" size={28} /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {campaigns.length === 0 ? (
            <div className="py-16 text-center"><Megaphone size={32} className="mx-auto text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-400">Sin campañas aún</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Campaña</th>
                  <th className="px-4 py-3 text-center">Desc.</th>
                  <th className="px-4 py-3 text-center">Vigencia</th>
                  <th className="px-4 py-3 text-center">Clientes</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map(c => {
                  const st = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.BORRADOR;
                  const isDraft = c.status === 'BORRADOR';
                  const isExpired = c.valid_to < todayStr();
                  return (
                    <tr key={c.id} className={`hover:bg-slate-50 ${isExpired ? 'border-l-4 border-l-red-400 bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{c.name}{isExpired && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-red-600">Vencida</span>}</p>
                        <p className="text-[10px] text-slate-400">{c.created_by_name ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-center font-black text-purple-600">{c.discount_percent}%</td>
                      <td className="px-4 py-3 text-center text-[11px] text-slate-500">{c.valid_from} → {c.valid_to}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">
                        {c.total_recipients}
                        {c.status === 'ENVIADA' && <span className="ml-1 text-[10px] text-slate-400">({c.sent_count}✓/{c.failed_count}✗)</span>}
                      </td>
                      <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${st.bg} ${st.text}`}>{st.label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openDetail(c)} title="Ver detalle" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Eye size={15} /></button>
                          {isDraft && <button onClick={() => setSendTarget(c)} title="Enviar" className="rounded-lg p-1.5 text-green-500 hover:bg-green-50"><Send size={15} /></button>}
                          {isDraft && <button onClick={() => { setDeleteTarget(c); setDeleteNote(''); }} title="Eliminar" className="rounded-lg p-1.5 text-red-400 hover:bg-red-50"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Wizard crear ─── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Nueva campaña</h3>
              <button onClick={() => setCreateOpen(false)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-3">
              {STEPS.map((s, i) => {
                const n = i + 1;
                const done = n < step, active = n === step;
                return (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-2">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${active ? 'bg-purple-600 text-white' : done ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {done ? <Check size={12} /> : n}
                      </div>
                      <span className={`text-[11px] font-black uppercase tracking-widest ${active ? 'text-purple-600' : 'text-slate-400'}`}>{s}</span>
                    </div>
                    {n < STEPS.length && <div className="h-px flex-1 bg-slate-200" />}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* Paso 1: datos */}
              {step === 1 && (
                <>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Nombre de la campaña *</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Reactivación Oro Mayo"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500"><Percent size={12} className="mb-0.5 mr-1 inline" />Descuento %</label>
                      <input type="number" min="1" max="100" value={discount} onChange={e => setDiscount(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500"><Calendar size={12} className="mb-0.5 mr-1 inline" />Inicio</label>
                      <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500"><Calendar size={12} className="mb-0.5 mr-1 inline" />Fin</label>
                      <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
                    </div>
                  </div>
                  {!step1Valid && <p className="text-[11px] font-bold text-slate-400">Completa nombre, descuento (1-100) y fechas válidas.</p>}
                </>
              )}

              {/* Paso 2: clientes */}
              {step === 2 && (
                <>
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-500"><Users size={12} className="mb-0.5 mr-1 inline" />1. Elige un segmento</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {SEGMENTS.map(s => (
                        <button key={s.value} onClick={() => applySegment(s.value)}
                          className={`rounded-xl border px-3 py-2 text-left ${segmentType === s.value ? 'border-purple-400 bg-purple-50' : 'border-slate-200'}`}>
                          <p className="text-xs font-black text-slate-800">{s.label}</p>
                          <p className="text-[9px] text-slate-400">{s.desc}</p>
                        </button>
                      ))}
                    </div>
                    {segmentType === 'LOYALTY' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {LOYALTY_LEVELS.map(l => (
                          <button key={l} onClick={() => { toggle(levels, l, setLevels); }}
                            className={`rounded-full px-3 py-1 text-xs font-bold ${levels.includes(l) ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
                        ))}
                        <button onClick={() => applySegment('LOYALTY')} className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">Aplicar</button>
                      </div>
                    )}
                    {segmentType === 'STATUS' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {STATUSES.map(s => (
                          <button key={s} onClick={() => { toggle(statuses, s, setStatuses); }}
                            className={`rounded-full px-3 py-1 text-xs font-bold ${statuses.includes(s) ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{s}</button>
                        ))}
                        <button onClick={() => applySegment('STATUS')} className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">Aplicar</button>
                      </div>
                    )}
                    {segmentType === 'CUSTOMER_TYPE' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {CUSTOMER_TYPES.map(t => (
                          <button key={t} onClick={() => { toggle(types, t, setTypes); }}
                            className={`rounded-full px-3 py-1 text-xs font-bold ${types.includes(t) ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
                        ))}
                        <button onClick={() => applySegment('CUSTOMER_TYPE')} className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">Aplicar</button>
                      </div>
                    )}
                    {segmentType === 'INFREQUENT' && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">Sin comprar en</span>
                        <input type="number" min="1" value={infreqDays} onChange={e => setInfreqDays(e.target.value)}
                          className="w-20 rounded-xl border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-purple-400" />
                        <span className="text-xs font-bold text-slate-500">días</span>
                        <button onClick={() => applySegment('INFREQUENT')} className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">Aplicar</button>
                      </div>
                    )}
                  </div>

                  {/* Agregar clientes manualmente */}
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-500"><UserPlus size={12} className="mb-0.5 mr-1 inline" />2. Agrega otros clientes (opcional)</p>
                    <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <Search size={14} className="text-slate-400" />
                      <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Buscar cliente para agregar…"
                        className="w-full bg-transparent text-xs outline-none" />
                    </div>
                    {addSearch && (
                      <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-1">
                        {addCandidates.length === 0 ? <p className="px-2 py-2 text-center text-[11px] text-slate-400">Sin resultados</p> :
                          addCandidates.map(c => (
                            <button key={c.id} onClick={() => addRecipient(c)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-purple-50">
                              <Plus size={13} className="text-purple-500" />
                              <span className="flex-1 text-xs font-semibold text-slate-700">{c.name}</span>
                              <span className="text-[10px] text-slate-400">{c.phone ?? 'sin tel.'}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Lista final */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Clientes en la campaña</p>
                      <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-black text-purple-700">{recipients.length}</span>
                    </div>
                    {resolving ? (
                      <div className="flex justify-center py-6 text-slate-400"><Loader2 className="animate-spin" size={20} /></div>
                    ) : recipients.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 py-6 text-center text-xs font-bold text-slate-400">Elige un segmento o agrega clientes</p>
                    ) : (
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-1">
                        {recipients.map(r => (
                          <div key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <span className="flex-1 text-xs font-semibold text-slate-700">{r.name}</span>
                            <span className="text-[10px] text-slate-400">{r.phone ?? 'sin tel.'}</span>
                            <button onClick={() => removeRecipient(r.id)} className="text-slate-300 hover:text-red-500"><X size={13} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Paso 3: mensaje */}
              {step === 3 && (
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">Plantilla</label>
                  <select
                    onChange={e => { const t = MESSAGE_TEMPLATES.find(x => x.id === e.target.value); if (t) setMessage(t.text); }}
                    value={MESSAGE_TEMPLATES.find(t => t.text === message)?.id ?? ''}
                    className="mb-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 outline-none focus:border-purple-400">
                    <option value="" disabled>Elige una plantilla…</option>
                    {MESSAGE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500"><MessageSquare size={12} className="mb-0.5 mr-1 inline" />Mensaje</label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {VARIABLES.map(v => (
                      <button key={v} onClick={() => insertVar(v)}
                        className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-600 hover:bg-purple-100 hover:text-purple-700">{v}</button>
                    ))}
                  </div>
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
                  <div className="mt-2 rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Vista previa</p>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{previewMessage}</p>
                  </div>
                </div>
              )}

              {/* Paso 4: verificación */}
              {step === 4 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Campaña</p><p className="text-sm font-black text-slate-900">{name}</p></div>
                    <div className="rounded-2xl border border-slate-200 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Descuento</p><p className="text-sm font-black text-purple-600">{discount}%</p></div>
                    <div className="rounded-2xl border border-slate-200 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inicio</p><p className="text-sm font-black text-slate-900">{validFrom}</p></div>
                    <div className="rounded-2xl border border-slate-200 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fin</p><p className="text-sm font-black text-slate-900">{validTo}</p></div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Clientes</p>
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700">{recipients.length}</span>
                    </div>
                    <p className="text-xs text-slate-600">{recipients.slice(0, 12).map(r => r.name).join(', ')}{recipients.length > 12 ? `, +${recipients.length - 12} más` : ''}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Mensaje (ejemplo)</p>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{previewMessage}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer wizard */}
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
              <button onClick={() => step === 1 ? setCreateOpen(false) : setStep(s => s - 1)}
                className="inline-flex items-center gap-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100">
                {step === 1 ? 'Cancelar' : <><ChevronLeft size={14} /> Atrás</>}
              </button>
              {step < 4 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid) || (step === 3 && !step3Valid)}
                  className="inline-flex items-center gap-1 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-purple-500 disabled:opacity-40">
                  Siguiente <ChevronRight size={14} />
                </button>
              ) : (
                <button onClick={saveCampaign} disabled={saving || !step1Valid || !step2Valid || !step3Valid}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-purple-500 disabled:opacity-40">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Crear campaña
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Detalle ─── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">{detail.name}</h3>
              <button onClick={() => setDetail(null)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-4 gap-3 border-b border-slate-100 px-6 py-3">
              <div className="text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estado</p><p className="text-sm font-black text-slate-900">{CAMPAIGN_STATUS[detail.status]?.label}</p></div>
              <div className="text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Descuento</p><p className="text-lg font-black text-purple-600">{detail.discount_percent}%</p></div>
              <div className="text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Clientes</p><p className="text-lg font-black text-slate-900">{detail.total_recipients}</p></div>
              <div className="text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Vigencia</p><p className="text-[11px] font-bold text-slate-700">{detail.valid_from}<br/>{detail.valid_to}</p></div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingDetail ? (
                <div className="flex justify-center py-10 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
              ) : detailRows.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-400">Sin clientes.</p>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <Search size={14} className="text-slate-400" />
                      <input value={detailSearch} onChange={e => { setDetailSearch(e.target.value); setDetailPage(1); }}
                        placeholder="Buscar cliente…" className="w-full bg-transparent text-xs outline-none" />
                    </div>
                    {detailHasCodes && (
                      <select value={detailUseFilter} onChange={e => { setDetailUseFilter(e.target.value as 'ALL' | 'USED' | 'UNUSED'); setDetailPage(1); }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:border-purple-400">
                        <option value="ALL">Todos ({detailRows.length})</option>
                        <option value="USED">Usados ({detailUsedCount})</option>
                        <option value="UNUSED">Sin usar ({detailRows.length - detailUsedCount})</option>
                      </select>
                    )}
                  </div>
                  {detailFiltered.length === 0 ? (
                    <p className="py-8 text-center text-xs font-bold text-slate-400">Sin resultados</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <tr><th className="px-2 py-2 text-left">Cliente</th><th className="px-2 py-2 text-left">Código</th><th className="px-2 py-2 text-center">Estado</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailPaged.map((r, i) => {
                          const ps = r.status ? (PROMO_STATUS[r.status] ?? null) : null;
                          return (
                            <tr key={i}>
                              <td className="px-2 py-2 font-semibold text-slate-700">{r.name}</td>
                              <td className="px-2 py-2 font-mono font-bold text-slate-900">{r.code ?? <span className="font-sans text-[11px] font-bold text-slate-400">Se genera al enviar</span>}</td>
                              <td className="px-2 py-2 text-center">{ps ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ps.bg} ${ps.text}`}>{ps.label}</span> : <span className="text-[11px] text-slate-300">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {detailTotalPages > 1 && (
                    <div className="mt-3 flex items-center justify-between">
                      <button onClick={() => setDetailPage(p => Math.max(1, p - 1))} disabled={detailPage === 1}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                        <ChevronLeft size={13} /> Anterior
                      </button>
                      <span className="text-[11px] font-bold text-slate-400">Página {detailPage} / {detailTotalPages}</span>
                      <button onClick={() => setDetailPage(p => Math.min(detailTotalPages, p + 1))} disabled={detailPage === detailTotalPages}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                        Siguiente <ChevronRight size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirmar envío ─── */}
      {sendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-2xl bg-green-100 p-2.5 text-green-600"><Send size={20} /></div>
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Enviar campaña</h3>
            </div>
            <p className="text-sm text-slate-600">
              Se generarán <b>{sendTarget.total_recipients}</b> promociones y se enviarán los mensajes por WhatsApp. Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSendTarget(null)} disabled={sending} className="rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={doSend} disabled={sending}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-green-500 disabled:opacity-40">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirmar eliminación ─── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-2xl bg-red-100 p-2.5 text-red-600"><Trash2 size={20} /></div>
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Eliminar campaña</h3>
            </div>
            <p className="mb-3 text-sm text-slate-600">Vas a eliminar <b>{deleteTarget.name}</b>. Indica el motivo (obligatorio).</p>
            <textarea value={deleteNote} onChange={e => setDeleteNote(e.target.value)} rows={3} placeholder="Motivo de la eliminación…"
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-red-400" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={doDelete} disabled={!deleteNote.trim()}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-red-500 disabled:opacity-40">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VinosCampaignsScreen;

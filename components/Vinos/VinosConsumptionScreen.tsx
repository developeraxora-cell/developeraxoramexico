import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Eye, Printer, RefreshCw, Trash2, PackageCheck, Bell, X } from 'lucide-react';
import { Branch, User } from '../../types';
import { vinosCustomersService, VinosCustomer } from '../../services/vinos/customers.service';
import { vinosProductsService, ProductWithStock } from '../../services/vinos/products.service';
import { consumptionService, Consumption, ConsumptionCredit, consumptionFolio, consumptionState, mexicoToday } from '../../services/vinos/consumption.service';
import { printConsumptionTicket } from '../../services/vinos/consumptionTicket';
import { formatCurrency as money } from '../../services/currency';
import './consumption.css';
import './consumption-cancel.css';

type Props = { selectedBranchId: string; branches: Branch[]; currentUser: User };
type Draft = { product_id: string; name: string; qty: number; unit_price: number; available: number };
const message = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la operacion.';
const tierLabel: Record<string,string> = { MENUDEO: 'Menudeo', MEDIO_MAYOREO: 'Medio mayoreo', MAYOREO: 'Mayoreo' };

export default function VinosConsumptionScreen({ selectedBranchId, branches, currentUser }: Props) {
  const [branch, setBranch] = useState<number | null>(null);
  const [rows, setRows] = useState<Consumption[]>([]);
  const [customers, setCustomers] = useState<VinosCustomer[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [today, setToday] = useState(mexicoToday());
  const [mode, setMode] = useState<'new' | 'settle' | 'detail' | 'cancel' | null>(null);
  const [selected, setSelected] = useState<Consumption | null>(null);
  const [customer, setCustomer] = useState('');
  const [tier, setTier] = useState('MENUDEO');
  const [due, setDue] = useState(mexicoToday());
  const [draft, setDraft] = useState<Draft[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [returned, setReturned] = useState<Record<string,number>>({});
  const [payment, setPayment] = useState('EFECTIVO');
  const [credit, setCredit] = useState<ConsumptionCredit | null>(null);
  const [creditError, setCreditError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const requestId = useRef('');
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const code = branches.find(b => b.id === selectedBranchId)?.code ?? selectedBranchId;
  useEffect(() => {
    let active = true;
    setBranch(null); setRows([]); setMode(null); setLoading(true);
    vinosCustomersService.getBranchId(code).then(id => { if(active) { setBranch(id); if(!id) { setError('Sucursal no encontrada.'); setLoading(false); } } }).catch(e => { if(active) { setError(message(e)); setLoading(false); } });
    return () => { active = false; };
  }, [code]);
  const refresh = useCallback(async () => {
    if (!branch) return;
    setLoading(true); setError('');
    try {
      const [list, clients, catalog] = await Promise.all([consumptionService.list(branch), vinosCustomersService.getAll(branch), vinosProductsService.listWithStock(branch)]);
      setRows(list); setCustomers(clients); setProducts(catalog);
    } catch(e) { setError(message(e)); } finally { setLoading(false); }
  }, [branch]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const timer = window.setInterval(() => { setToday(mexicoToday()); if(!submitting.current) void refresh(); }, 60000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if(mode) dialog.current?.showModal(); else dialog.current?.close(); }, [mode]);
  const activeCustomer = mode === 'new' ? customer : selected?.customer_id;
  useEffect(() => {
    let active = true; setCredit(null); setCreditError('');
    if(activeCustomer && mode) consumptionService.credit(activeCustomer).then(c => { if(active) setCredit(c); }).catch(e => { if(active) setCreditError(message(e)); });
    return () => { active = false; };
  }, [activeCustomer, mode]);
  const open = rows.filter(r => r.status === 'OPEN');
  const overdue = open.filter(r => r.due_date < today);
  const dueToday = open.filter(r => r.due_date === today);
  const total = mode === 'new' ? draft.reduce((s,i) => s+i.qty*i.unit_price,0)
    : (selected?.items ?? []).reduce((s,i) => s+(i.qty_out-(returned[i.id] ?? 0))*i.unit_price,0);
  const blocked = mode === 'new' && credit && (credit.overdue || credit.overdue_consumption || credit.unknown_due_dates);
  const invalidCredit = payment === 'CREDITO' && total > 0 && (!credit || credit.credit_limit<=0 || credit.overdue || credit.unknown_due_dates || total>credit.available);
  const visible = rows.filter(r => (filter ? consumptionState(r,today)===filter : r.status!=='CANCELLED') && `${r.customer_name} ${consumptionFolio(r.folio)}`.toLowerCase().includes(search.toLowerCase()));
  function openDetail(row: Consumption, next: 'detail' | 'settle') {
    setSelected(row); setReturned(Object.fromEntries(row.items.map(i => [i.id, row.status==='SETTLED' ? i.qty_returned : 0])));
    setPayment(row.payment_method ?? 'EFECTIVO'); setModalError(''); setMode(next);
  }
  async function cancelSelected() {
    if (!selected || submitting.current || !cancelReason.trim()) return;
    submitting.current = true; setBusy(true); setModalError('');
    try {
      const branchName = branches.find(item => item.code === code)?.name ?? 'Casa Tahona';
      await consumptionService.cancel({ consumption: selected, actorId: currentUser.id, actorName: currentUser.name, branchCode: code, branchName, reason: cancelReason.trim() });
      const updated = await consumptionService.list(selected.branch_id);
      setRows(updated); setSelected(null);
      setMode(null); setNotice('Salida eliminada, observación auditada y stock devuelto.'); setCancelReason('');
      window.dispatchEvent(new Event('vinos-consumption-changed'));
      void refresh();
    } catch (e) { setModalError(message(e)); }
    finally { submitting.current = false; setBusy(false); }
  }
  function newConsumption() {
    requestId.current=crypto.randomUUID(); setCustomer(''); setDraft([]); setDue(today); setTier('MENUDEO'); setProductSearch(''); setModalError(''); setMode('new');
  }
  function addProduct(p: ProductWithStock) {
    if(draft.some(i => i.product_id===p.id)) return;
    const price = p.single_price_mode || tier==='MENUDEO' ? p.price_retail : tier==='MAYOREO' ? p.price_wholesale : p.price_mid_wholesale;
    setDraft([...draft,{ product_id:p.id,name:p.name,qty:1,unit_price:Number(price),available:p.total_stock }]);
  }
  function print(row: Consumption, settlement: boolean) {
    try { printConsumptionTicket(row,settlement,window.open('','_blank')); } catch(e) { setModalError(message(e)); }
  }
  async function submit() {
    if(submitting.current || !branch) return;
    setModalError('');
    if(mode==='new' && (!customer || !draft.length || !credit || blocked || !due || due<today || draft.some(i=>!Number.isInteger(i.qty)||i.qty<=0||i.qty>i.available||!Number.isFinite(i.unit_price)||i.unit_price<0))) {
      setModalError('Revisa cliente, fecha, piezas disponibles y precios.'); return;
    }
    if(mode==='settle' && (invalidCredit || selected?.items.some(i=>!Number.isInteger(returned[i.id])||returned[i.id]<0||returned[i.id]>i.qty_out))) {
      setModalError('Revisa las devoluciones y el credito disponible.'); return;
    }
    const isNew = mode==='new';
    const ticketWindow = window.open('','_blank');
    submitting.current=true; setBusy(true);
    let committed = false;
    try {
      let id = selected?.id;
      if(isNew) id=await consumptionService.create({ id:requestId.current,branch_id:branch,customer_id:customer,due_date:due,actor_id:currentUser.id,price_type:tier,items:draft });
      else if(id) await consumptionService.settle(id,currentUser.id,payment,selected!.items.map(i=>({id:i.id,qty:returned[i.id]})));
      committed=true;
      const updated=await consumptionService.list(branch);
      setRows(updated); const saved=updated.find(r=>r.id===id);
      if(!saved) throw new Error('Operacion guardada. Recarga el listado para imprimir el ticket.');
      setSelected(saved); setMode('detail'); setNotice(isNew ? 'Salida registrada.' : 'Consumo liquidado.');
      try { printConsumptionTicket(saved,!isNew,ticketWindow); } catch(e) { setModalError(`Operacion guardada. ${message(e)}`); }
      window.dispatchEvent(new Event('vinos-consumption-changed'));
      void refresh();
    } catch(e) { ticketWindow?.close(); setModalError(`${committed ? 'Operacion guardada. ' : ''}${message(e)}`); }
    finally { submitting.current=false; setBusy(false); }
  }
  return <div className="consumption">
    <header className="consumption-heading"><div><h1>Consumo</h1><span>Casa Tahona</span></div><button title="Actualizar" aria-label="Actualizar" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18}/></button></header>
    {error && <p role="alert" className="consumption-error">{error}</p>}
    {notice && <p role="status" className="consumption-success">{notice}</p>}
    {overdue.length>0 && <button className="consumption-alert overdue" onClick={()=>setFilter('Vencido')}><Bell size={18}/>{overdue.length} consumos vencidos sin liquidar</button>}
    {dueToday.length>0 && <button className="consumption-alert" onClick={()=>setFilter('Vence hoy')}><Bell size={18}/>{dueToday.length} consumos vencen hoy</button>}
    <section className="consumption-metrics" aria-label="Resumen">
      {[[ 'En consumo',open.length ],['Piezas fuera',open.reduce((s,c)=>s+c.items.reduce((a,i)=>a+i.qty_out,0),0)],['Valor en consumo',money(open.reduce((s,c)=>s+c.items.reduce((a,i)=>a+i.qty_out*i.unit_price,0),0))],['Liquidado este mes',money(rows.filter(c=>c.settled_at && new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit'}).format(new Date(c.settled_at))===today.slice(0,7)).reduce((s,c)=>s+c.total,0))]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </section>
    <div className="consumption-toolbar"><label>Buscar<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente o folio"/></label><label>Estado<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Todos</option>{['En consumo','Vence hoy','Vencido','Liquidado','Cancelado'].map(s=><option key={s}>{s}</option>)}</select></label><button className="primary" onClick={newConsumption} disabled={!branch||loading||!!error}><Plus size={18}/>Nueva salida a consumo</button></div>
    <div className="consumption-table"><table><thead><tr>{['Folio / Cliente','Salida','Fecha limite','Salieron','Regresaron','Consumidas','Valor en consumo','Liquidado','Estado','Acciones'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
      {loading && !rows.length ? <tr><td colSpan={10}>Cargando consumos...</td></tr> : !visible.length ? <tr><td colSpan={10}>Sin consumos para este filtro.</td></tr> : visible.map(r=><tr key={r.id}>
        <td><strong>{consumptionFolio(r.folio)}</strong><span>{r.customer_name}</span></td><td>{new Date(r.created_at).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'})}</td><td>{r.due_date}</td>
        <td>{r.items.reduce((s,i)=>s+i.qty_out,0)}</td><td>{r.status==='OPEN'?'—':r.items.reduce((s,i)=>s+i.qty_returned,0)}</td><td>{r.status==='OPEN'?'—':r.items.reduce((s,i)=>s+i.qty_out-i.qty_returned,0)}</td>
        <td>{money(r.status==='OPEN'?r.items.reduce((s,i)=>s+i.qty_out*i.unit_price,0):0)}</td><td>{r.status==='SETTLED'?money(r.total):'—'}</td><td><span className={`consumption-status ${consumptionState(r,today)==='Vencido'?'late':r.status==='SETTLED'?'done':''}`}>{consumptionState(r,today)}</span></td>
        <td><div className="consumption-actions"><button aria-label={`Ver ${consumptionFolio(r.folio)}`} title="Detalle" onClick={()=>openDetail(r,'detail')}><Eye size={18}/></button>{r.status==='OPEN'&&<><button title="Liquidar" aria-label={`Liquidar ${consumptionFolio(r.folio)}`} onClick={()=>openDetail(r,'settle')}><PackageCheck size={18}/></button><button className="cancel-action" style={{ color: '#dc2626', background: '#fef2f2' }} title="Eliminar salida" aria-label={`Eliminar ${consumptionFolio(r.folio)}`} onClick={()=>{setSelected(r);setCancelReason('');setModalError('');setMode('cancel');}}><Trash2 size={17}/></button></>}</div></td>
      </tr>)}</tbody></table></div>
    <dialog ref={dialog} className="consumption-dialog" style={{ position: 'fixed', inset: 'auto', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', margin: 0 }} onCancel={e=>{if(busy)e.preventDefault();else setMode(null);}}>
      <header><div><h2>{mode==='new'?'Nueva salida a consumo':mode==='settle'?'Devolucion y cobro':mode==='cancel'?'Cancelar salida':selected?consumptionFolio(selected.folio):'Detalle'}</h2>{mode!=='new'&&<p>{selected?.customer_name} · Fecha limite: {selected?.due_date}</p>}</div><button disabled={busy} aria-label="Cerrar" title="Cerrar" onClick={()=>setMode(null)}><X size={20}/></button></header>
      <div className="consumption-dialog-body">
        {mode==='cancel' && selected ? <section className="consumption-cancel"><label>Observación<textarea rows={4} maxLength={500} value={cancelReason} disabled={busy} onChange={e=>setCancelReason(e.target.value)} placeholder="Escribe el motivo de eliminación"/></label></section> : mode==='new' ? <>
          <div className="consumption-form"><label>Cliente<select value={customer} onChange={e=>setCustomer(e.target.value)} disabled={busy}><option value="">Seleccionar cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Lista de precio<select value={tier} disabled={busy||draft.length>0} onChange={e=>setTier(e.target.value)}>{Object.entries(tierLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Fecha limite<input type="date" min={today} value={due} disabled={busy} onChange={e=>setDue(e.target.value)}/></label></div>
          {blocked && <p className="consumption-error" role="alert">Cliente bloqueado por consumo o credito vencido. Revisa sus pendientes.</p>}
          {creditError && <p role="alert" className="consumption-error">{creditError}</p>}
          <label>Producto<input value={productSearch} disabled={busy} onChange={e=>setProductSearch(e.target.value)} placeholder="Nombre, SKU o codigo de barras"/></label>
          <div className="consumption-picker">{products.filter(p=>`${p.name} ${p.sku} ${p.barcode??''}`.toLowerCase().includes(productSearch.toLowerCase())).slice(0,12).map(p=><button key={p.id} disabled={busy||p.total_stock<1||draft.some(i=>i.product_id===p.id)} onClick={()=>addProduct(p)}><Plus size={16}/><span>{p.name}</span><small>{p.total_stock} disponibles</small></button>)}</div>
          <div className="consumption-table"><table><thead><tr><th>Producto</th><th>Piezas</th><th>Precio pactado</th><th>Importe</th><th></th></tr></thead><tbody>{draft.map((i,index)=><tr key={i.product_id}><td>{i.name}</td><td><input aria-label={`Piezas ${i.name}`} type="number" min="1" max={i.available} step="1" value={i.qty} disabled={busy} onChange={e=>setDraft(draft.map((x,n)=>n===index?{...x,qty:Number(e.target.value)}:x))}/></td><td><input aria-label={`Precio ${i.name}`} type="number" min="0" step="0.01" value={i.unit_price} disabled={busy} onChange={e=>setDraft(draft.map((x,n)=>n===index?{...x,unit_price:Number(e.target.value)}:x))}/></td><td>{money(i.qty*i.unit_price)}</td><td><button disabled={busy} title="Quitar" aria-label={`Quitar ${i.name}`} onClick={()=>setDraft(draft.filter((_,n)=>n!==index))}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>
        </> : selected && <>
          <div className="consumption-table"><table><thead><tr><th>Producto</th><th>Salieron</th><th>Regresan</th><th>Consumidas</th><th>Precio</th><th>Importe</th></tr></thead><tbody>{selected.items.map(i=><tr key={i.id}><td>{i.product_name}</td><td>{i.qty_out}</td><td>{mode==='settle'?<input aria-label={`Regresan ${i.product_name}`} type="number" min="0" max={i.qty_out} step="1" value={returned[i.id]??0} disabled={busy} onChange={e=>setReturned({...returned,[i.id]:Number(e.target.value)})}/>:selected.status==='OPEN'?'—':i.qty_returned}</td><td>{mode==='settle'?i.qty_out-(returned[i.id]??0):selected.status==='OPEN'?'—':i.qty_out-i.qty_returned}</td><td>{money(i.unit_price)}</td><td>{money((mode==='settle'?i.qty_out-(returned[i.id]??0):selected.status==='OPEN'?i.qty_out:i.qty_out-i.qty_returned)*i.unit_price)}</td></tr>)}</tbody></table></div>
          {mode==='settle'?<><div className="consumption-toolbar"><label>Metodo de pago<select value={payment} disabled={busy} onChange={e=>setPayment(e.target.value)}>{['EFECTIVO','TRANSFERENCIA','TARJETA','CREDITO'].map(p=><option key={p}>{p}</option>)}</select></label><button disabled={busy} onClick={()=>setReturned(Object.fromEntries(selected.items.map(i=>[i.id,i.qty_out])))}>Regreso todo</button><button disabled={busy} onClick={()=>setReturned(Object.fromEntries(selected.items.map(i=>[i.id,0])))}>No regreso nada</button></div>
            {payment==='CREDITO' && <section className="consumption-credit"><h3>Credito del cliente</h3>{credit?<><p>Autorizado: <b>{money(credit.credit_limit)}</b> · Saldo: <b>{money(credit.debt)}</b> · Disponible: <b>{money(credit.available)}</b></p><p>Saldo despues: <b>{money(credit.debt+total)}</b> · Plazo: {credit.credit_days} dias</p>{invalidCredit&&<p role="alert" className="consumption-error">No se permite liquidar con credito: revisa autorizacion, vencimiento y disponible.</p>}</>:<p>{creditError||'Consultando credito...'}</p>}</section>}
          </>:<div className="consumption-toolbar">{selected.status!=='CANCELLED'&&<button onClick={()=>print(selected,false)}><Printer size={18}/>Ticket de salida</button>}{selected.status==='SETTLED'?<button onClick={()=>print(selected,true)}><Printer size={18}/>Ticket de liquidacion</button>:selected.status==='OPEN'?<button className="primary" onClick={()=>openDetail(selected,'settle')}><PackageCheck size={18}/>Liquidar</button>:<p className="consumption-cancel-note">Motivo: {selected.cancel_reason || 'Sin motivo registrado'}</p>}</div>}
        </>}
        {modalError&&<p role="alert" className="consumption-error">{modalError}</p>}
      </div>
      {mode==='cancel'&&<footer><button disabled={busy} onClick={()=>setMode('detail')}>Volver</button><button className="danger" disabled={busy||!cancelReason.trim()} onClick={()=>void cancelSelected()}>{busy?'Eliminando...':'Eliminar salida'}</button></footer>}
      {mode!=='detail'&&mode!=='cancel'&&<footer><div><span>{mode==='new'?'Valor de salida':payment==='CREDITO'?'Cargo a credito':'Total a cobrar'}</span><strong>{money(total)}</strong></div><button className="primary" disabled={busy||!!blocked||(mode==='new'&&(!credit||!draft.length))||(mode==='settle'&&invalidCredit)} onClick={()=>void submit()}>{busy?'Guardando...':mode==='new'?'Confirmar salida e imprimir':'Liquidar e imprimir'}</button></footer>}
    </dialog>
  </div>;
}

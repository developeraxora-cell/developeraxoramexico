import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { vinosCustomersService } from '../../services/vinos/customers.service';
import { consumptionService, mexicoToday } from '../../services/vinos/consumption.service';

export default function VinosConsumptionAlerts({ branchCode, onOpen }: { branchCode: string; onOpen: () => void }) {
  const [counts, setCounts] = useState({ overdue: 0, today: 0 });
  useEffect(() => {
    let active = true;
    setCounts({ overdue: 0, today: 0 });
    const refresh = async () => {
      try {
        const branch = await vinosCustomersService.getBranchId(branchCode);
        if(!branch) return;
        const rows = await consumptionService.list(branch);
        const day = mexicoToday();
        if(active) setCounts({ overdue: rows.filter(c=>c.status==='OPEN'&&c.due_date<day).length, today: rows.filter(c=>c.status==='OPEN'&&c.due_date===day).length });
      } catch { /* El modulo muestra el error de configuracion al abrirlo. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh,60000);
    window.addEventListener('vinos-consumption-changed',refresh);
    window.addEventListener('focus',refresh);
    return () => { active=false;clearInterval(timer);window.removeEventListener('vinos-consumption-changed',refresh);window.removeEventListener('focus',refresh); };
  }, [branchCode]);
  if(!counts.overdue&&!counts.today) return null;
  return <button onClick={onOpen} className="mt-3 flex w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" aria-live="polite"><Bell size={18}/>Consumo: {counts.overdue} vencidos · {counts.today} vencen hoy</button>;
}

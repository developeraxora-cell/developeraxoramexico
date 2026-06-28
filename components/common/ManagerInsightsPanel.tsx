import React from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb, TrendingUp } from 'lucide-react';

export type ManagerInsightPriority = 'alta' | 'media' | 'baja';
export type ManagerInsightKind = 'risk' | 'opportunity' | 'action' | 'info';

export interface ManagerInsight {
  id: string;
  priority: ManagerInsightPriority;
  kind: ManagerInsightKind;
  title: string;
  description: string;
  metric?: string;
  action?: string;
}

interface ManagerInsightsPanelProps {
  title?: string;
  subtitle?: string;
  insights: ManagerInsight[];
  isLoading?: boolean;
}

const priorityLabel: Record<ManagerInsightPriority, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const priorityClass: Record<ManagerInsightPriority, string> = {
  alta: 'border-red-200 bg-red-50 text-red-700',
  media: 'border-amber-200 bg-amber-50 text-amber-700',
  baja: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const kindIcon = {
  risk: AlertTriangle,
  opportunity: Lightbulb,
  action: CheckCircle2,
  info: TrendingUp,
};

const kindClass: Record<ManagerInsightKind, string> = {
  risk: 'bg-red-100 text-red-700',
  opportunity: 'bg-amber-100 text-amber-700',
  action: 'bg-emerald-100 text-emerald-700',
  info: 'bg-blue-100 text-blue-700',
};

const ManagerInsightsPanel: React.FC<ManagerInsightsPanelProps> = ({
  title = 'Gerente digital',
  subtitle = 'Alertas, oportunidades y acciones calculadas con los datos del periodo.',
  insights,
  isLoading,
}) => {
  const visibleInsights = insights.length > 0
    ? insights
    : [{
        id: 'sin-alertas',
        priority: 'baja' as const,
        kind: 'info' as const,
        title: 'Sin alertas críticas en este corte',
        description: 'No se detectaron focos rojos con los filtros actuales. Revisa otro periodo o producto para ampliar el análisis.',
      }];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-700">{title}</h3>
          <p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
          {isLoading ? 'Analizando...' : `${visibleInsights.length} señales`}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visibleInsights.map((insight) => {
          const Icon = kindIcon[insight.kind];
          return (
            <article key={insight.id} className="min-h-[190px] rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className={`rounded-2xl p-2.5 ${kindClass[insight.kind]}`}>
                  <Icon size={18} />
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${priorityClass[insight.priority]}`}>
                  {priorityLabel[insight.priority]}
                </span>
              </div>
              <h4 className="mt-4 text-sm font-black leading-snug text-slate-900">{insight.title}</h4>
              {insight.metric && (
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{insight.metric}</p>
              )}
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{insight.description}</p>
              {insight.action && (
                <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-700">
                  {insight.action}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ManagerInsightsPanel;

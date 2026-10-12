import React from 'react';
import {
  Activity, ArrowDownToLine, ArrowRight, Ban, BarChart3, BellRing,
  Building2, Cake, Check, CheckCircle2, ChevronDown, ClipboardList,
  Construction, Factory, FileText, FlaskConical, Fuel, Globe2,
  HardHat, Hourglass, LockKeyhole, MapPin, Megaphone, Menu, Package,
  Pencil, Plus, Printer, Search, ShieldCheck, ShoppingCart, Trash2,
  TrendingUp, Truck, Users, Wallet, Wine, Wrench, X, XCircle, Zap,
  TriangleAlert, type LucideIcon,
} from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  activity: Activity, download: ArrowDownToLine, arrow: ArrowRight,
  ban: Ban, chart: BarChart3, alert: BellRing, building: Building2,
  cake: Cake, check: Check, success: CheckCircle2, chevron: ChevronDown,
  clipboard: ClipboardList, construction: Construction, factory: Factory,
  formula: FlaskConical, fuel: Fuel, globe: Globe2, worker: HardHat,
  loading: Hourglass, lock: LockKeyhole, pin: MapPin, campaign: Megaphone,
  menu: Menu, package: Package, edit: Pencil, plus: Plus, print: Printer,
  search: Search, shield: ShieldCheck, cart: ShoppingCart, trash: Trash2,
  trend: TrendingUp, truck: Truck, users: Users, wallet: Wallet,
  wine: Wine, wrench: Wrench, close: X, error: XCircle, zap: Zap,
  warning: TriangleAlert, file: FileText,
};

// Existing status APIs accept string icons; preserve that contract at the UI boundary.
const legacyNames: Record<string, string> = {
  '📈': 'trend', '📊': 'chart', '🏗️': 'construction', '🛒': 'cart',
  '📥': 'download', '📦': 'package', '📋': 'clipboard', '👥': 'users',
  '🚨': 'alert', '🏭': 'factory', '🏢': 'building', '🛡️': 'shield',
  '⛽': 'fuel', '🔥': 'fuel', '🚚': 'truck', '🚛': 'truck', '🍷': 'wine',
  '🖨️': 'print', '📣': 'campaign', '⚒️': 'construction', '🌐': 'globe',
  '✅': 'success', '❌': 'error', '⚠️': 'warning', '⚠': 'warning',
  '⏳': 'loading', '🗑️': 'trash', '⛔': 'ban', '🔒': 'lock',
  '🛢️': 'fuel', '👷': 'worker', '📍': 'pin', '🔧': 'wrench',
  '🧪': 'formula', '⚡': 'zap', '📄': 'file', '➕': 'plus',
  '🔍': 'search', '✏️': 'edit', '🚧': 'construction', '💵': 'wallet',
  '🚀': 'arrow', '🎂': 'cake', '✓': 'check', '✗': 'close', '✕': 'close',
  '☰': 'menu', '▼': 'chevron',
  '🔎': 'search', '🔴': 'alert', '🟡': 'warning', '🟢': 'success',
};

export default function AppIcon({ name, className = '' }: { name: string; className?: string }) {
  const Icon = icons[legacyNames[name] ?? name] ?? Activity;
  return <Icon aria-hidden="true" className={`crm-icon ${className}`} />;
}

const inlineIconPattern = new RegExp(`(${Object.keys(legacyNames).sort((a, b) => b.length - a.length).join('|')})`, 'gu');

/** Display legacy status/report decorations as SVGs without changing stored text. */
export function IconText({ children }: { children: string }) {
  return <>{children.split(inlineIconPattern).map((part, index) =>
    legacyNames[part] ? <AppIcon key={index} name={part} /> : part
  )}</>;
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Search, Trash2, User as UserIcon, CreditCard, Banknote, Gift, Tag, Receipt, X, Loader2, Plus, Minus, Wallet, Eye, FileText, Pencil,
  Clock, History, LockKeyhole, UnlockKeyhole, Store, ArrowRight,
} from 'lucide-react';
import { Branch, User } from '../../types';
import { formatCurrency } from '../../services/currency';
import { vinosProductsService, type ProductWithStock } from '../../services/vinos/products.service';
import { vinosCustomersService, type VinosCustomer } from '../../services/vinos/customers.service';
import { vinosSalesService, type SaleCartItem, type PaymentMethod, type PriceTier } from '../../services/vinos/sales.service';
import { vinosCashRegisterService, type CashRegisterSession, type CashRegisterSummary } from '../../services/vinos/cashRegister.service';
import { supabaseVinos } from '../../services/vinosClient';
import { generateVinosSaleTicket, type VinosSalePdfInput } from '../../services/vinos/saleTicketPdf';
import { generateVinosCashRegisterReceipt } from '../../services/vinos/cashRegisterReceiptPdf';
import { logVinosAudit } from '../../services/audit/audit.service';
import Toast from '../common/Toast';

interface Props {
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

interface UomMini {
  id: string;
  name: string;
  symbol: string | null;
}

interface ProductUomFull {
  id: string;
  uom_id: string;
  factor_to_base: number;
  price_retail: number;
  price_mid_wholesale: number;
  price_wholesale: number;
  uom: UomMini;
}

interface ProductFull extends ProductWithStock {
  product_uoms: ProductUomFull[];
}

const PRICE_TIER_LABEL: Record<PriceTier, string> = {
  MENUDEO: 'Menudeo',
  MEDIO_MAYOREO: 'Medio mayoreo',
  MAYOREO: 'Mayoreo',
};

const STOCK_EPSILON = 0.000001;
const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
const getCashChange = (cashReceivedValue: number, saleTotal: number) =>
  Math.max(0, Number(cashReceivedValue || 0) - Number(saleTotal || 0));
const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const VinosPOSScreen: React.FC<Props> = ({ selectedBranchId, currentUser, branches }) => {
  const [products, setProducts] = useState<ProductFull[]>([]);
  const [customers, setCustomers] = useState<VinosCustomer[]>([]);
  const [branchDbId, setBranchDbId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // caja
  const [cashSession, setCashSession] = useState<CashRegisterSession | null>(null);
  const [cashSessionReady, setCashSessionReady] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashStartPromptOpen, setCashStartPromptOpen] = useState(false);
  const [cashOpenModal, setCashOpenModal] = useState(false);
  const [cashCloseModal, setCashCloseModal] = useState(false);
  const [cashHistoryOpen, setCashHistoryOpen] = useState(false);
  const [cashHistory, setCashHistory] = useState<CashRegisterSession[]>([]);
  const [cashSummary, setCashSummary] = useState<CashRegisterSummary | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [openingObservations, setOpeningObservations] = useState('');
  const [deliveredCash, setDeliveredCash] = useState('');
  const [closingObservations, setClosingObservations] = useState('');
  const [cashError, setCashError] = useState('');

  // catálogo
  const [search, setSearch] = useState('');

  // carrito
  const [cart, setCart] = useState<SaleCartItem[]>([]);

  // cliente
  const [customerId, setCustomerId] = useState<string>('');
  const [customerSelectorOpen, setCustomerSelectorOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // add-product modal
  const [addProductTarget, setAddProductTarget] = useState<ProductFull | null>(null);
  const [stepUomId, setStepUomId] = useState('');
  const [stepTier, setStepTier] = useState<PriceTier>('MENUDEO');
  const [stepQty, setStepQty] = useState('1');

  // pago
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO');
  const [cashReceived, setCashReceived] = useState('');
  const [useCoupon, setUseCoupon] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedPromoId, setAppliedPromoId] = useState<string | null>(null);
  const [manualDiscountOpen, setManualDiscountOpen] = useState(false);
  const [manualDiscountPercent, setManualDiscountPercent] = useState('');
  const [manualDiscountJustification, setManualDiscountJustification] = useState('');
  const [manualDiscountError, setManualDiscountError] = useState('');
  const [manualDiscountApplied, setManualDiscountApplied] = useState<{ percent: number; justification: string } | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [walletAmount, setWalletAmount] = useState('0');

  const [charging, setCharging] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // checkout modal
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [saleNotes, setSaleNotes] = useState('');

  // history modal
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySales, setHistorySales] = useState<import('../../services/vinos/sales.service').SaleRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 5;

  // sale detail / actions modals
  const [saleDetailOpen, setSaleDetailOpen] = useState(false);
  const [saleDetailRow, setSaleDetailRow] = useState<import('../../services/vinos/sales.service').SaleRow | null>(null);
  const [saleDetailItems, setSaleDetailItems] = useState<Array<{ id: string; product_id: string; qty: number; unit_price: number; line_total: number; price_type: string; product?: { name: string; sku: string } | null; uom?: { name: string } | null }>>([]);
  const [editTypeOpen, setEditTypeOpen] = useState(false);
  const [editTypeRow, setEditTypeRow] = useState<import('../../services/vinos/sales.service').SaleRow | null>(null);
  const [editTypeValue, setEditTypeValue] = useState<'EFECTIVO' | 'CREDITO'>('EFECTIVO');
  const [editTypeUseWallet, setEditTypeUseWallet] = useState(false);
  const [editTypeWalletAmount, setEditTypeWalletAmount] = useState('0');
  const [editTypeObservation, setEditTypeObservation] = useState('');
  const [editTypeCustomerSnapshot, setEditTypeCustomerSnapshot] = useState<{ wallet_balance: number; wallet_enabled: boolean; credit_limit: number; name: string } | null>(null);
  const [editTypeSaving, setEditTypeSaving] = useState(false);
  const [editTypeError, setEditTypeError] = useState('');
  const [deleteSaleOpen, setDeleteSaleOpen] = useState(false);
  const [deleteSaleRow, setDeleteSaleRow] = useState<import('../../services/vinos/sales.service').SaleRow | null>(null);
  const [deleteSaleNote, setDeleteSaleNote] = useState('');
  const [deletingSale, setDeletingSale] = useState(false);

  // customer detail modal
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [customerDebt, setCustomerDebt] = useState(0);

  // ── branch ──────────────────────────────────────────────
  useEffect(() => {
    vinosCustomersService.getBranchId(selectedBranchId).then(setBranchDbId);
  }, [selectedBranchId]);

  const activeBranch = useMemo(
    () => branches.find(b => b.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  const branchName = activeBranch?.name ?? 'CASA TAHONA';

  // ── load catálogo + clientes ────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, custs] = await Promise.all([
        vinosProductsService.listWithStock(branchDbId ?? undefined),
        vinosCustomersService.getAll(branchDbId ?? undefined),
      ]);
      const ids = prods.map(p => p.id);
      const { data: pricedUoms } = await supabaseVinos
        .from('product_uoms')
        .select('id, product_id, uom_id, factor_to_base, price_retail, price_mid_wholesale, price_wholesale, uom:uoms(id,name,symbol)')
        .in('product_id', ids);
      const byProduct: Record<string, ProductUomFull[]> = {};
      (pricedUoms ?? []).forEach((row: { id: string; product_id: string; uom_id: string; factor_to_base: number; price_retail: number; price_mid_wholesale: number; price_wholesale: number; uom: UomMini | UomMini[] }) => {
        const u = Array.isArray(row.uom) ? row.uom[0] : row.uom;
        byProduct[row.product_id] = byProduct[row.product_id] || [];
        byProduct[row.product_id]!.push({
          id: row.id, uom_id: row.uom_id,
          factor_to_base: Number(row.factor_to_base),
          price_retail: Number(row.price_retail),
          price_mid_wholesale: Number(row.price_mid_wholesale),
          price_wholesale: Number(row.price_wholesale),
          uom: u,
        });
      });
      setProducts(prods.map(p => ({ ...p, product_uoms: byProduct[p.id] ?? [] })) as ProductFull[]);
      setCustomers(custs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [branchDbId]);

  useEffect(() => { load(); }, [load]);

  const loadCashSession = useCallback(async () => {
    if (!branchDbId) {
      setCashSession(null);
      setCashSessionReady(false);
      return;
    }
    setCashSessionReady(false);
    setCashLoading(true);
    setCashError('');
    try {
      const session = await vinosCashRegisterService.getActive(branchDbId, currentUser.id);
      setCashSession(session);
      if (session) setCashStartPromptOpen(false);
    } catch (e) {
      setCashError(e instanceof Error ? e.message : 'No se pudo cargar la caja.');
    } finally {
      setCashLoading(false);
      setCashSessionReady(true);
    }
  }, [branchDbId, currentUser.id]);

  useEffect(() => { loadCashSession(); }, [loadCashSession]);

  useEffect(() => {
    if (!cashSessionReady || !branchDbId || cashSession || cashOpenModal || cashCloseModal) return;
    setCashStartPromptOpen(true);
  }, [branchDbId, cashCloseModal, cashOpenModal, cashSession, cashSessionReady]);

  const openCashOpeningForm = () => {
    setCashStartPromptOpen(false);
    setCashOpenModal(true);
    setCashError('');
  };

  const handleOpenCash = async () => {
    if (!branchDbId) return;
    const amount = Number(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setCashError('Ingresa un efectivo inicial válido.');
      return;
    }
    setCashLoading(true);
    setCashError('');
    try {
      const session = await vinosCashRegisterService.open({
        branch_id: branchDbId,
        branch_code: activeBranch?.code ?? selectedBranchId,
        branch_name: branchName,
        cashier_user_id: currentUser.id,
        cashier_name: currentUser.name,
        opening_cash: amount,
        opening_observations: openingObservations,
      });
      setCashSession(session);
      setCashStartPromptOpen(false);
      setCashOpenModal(false);
      setOpeningCash('0');
      setOpeningObservations('');
      setFeedback({ type: 'success', msg: 'Caja iniciada.' });
    } catch (e) {
      setCashError(e instanceof Error ? e.message : 'No se pudo iniciar caja.');
    } finally {
      setCashLoading(false);
    }
  };

  const openCloseCashModal = async () => {
    if (!cashSession) return;
    setCashCloseModal(true);
    setCashError('');
    setClosingObservations('');
    setDeliveredCash('');
    setCashSummary(null);
    setCashLoading(true);
    try {
      const summary = await vinosCashRegisterService.previewClose(cashSession);
      setCashSummary(summary);
      setDeliveredCash(String(summary.expected_cash.toFixed(2)));
    } catch (e) {
      setCashError(e instanceof Error ? e.message : 'No se pudo calcular el corte.');
    } finally {
      setCashLoading(false);
    }
  };

  const handleCloseCash = async () => {
    if (!cashSession) return;
    const delivered = Number(deliveredCash);
    if (!Number.isFinite(delivered) || delivered < 0) {
      setCashError('Ingresa el efectivo entregado.');
      return;
    }
    const cashDocumentWindow = window.open('', '_blank');
    if (cashDocumentWindow) {
      cashDocumentWindow.document.title = 'Corte de caja';
      cashDocumentWindow.blur();
      window.focus();
    }
    setCashLoading(true);
    setCashError('');
    try {
      const closedSession = await vinosCashRegisterService.close({
        session: cashSession,
        delivered_cash: delivered,
        closing_observations: closingObservations,
      });
      let documentOpened = true;
      try {
        await generateVinosCashRegisterReceipt({
          session: closedSession,
          branchName,
        }, { mode: 'print', targetWindow: cashDocumentWindow });
      } catch (pdfError) {
        console.error(pdfError);
        documentOpened = false;
        if (cashDocumentWindow && !cashDocumentWindow.closed) cashDocumentWindow.close();
        setFeedback({ type: 'error', msg: 'Caja cerrada, pero no se pudo imprimir el corte.' });
      }
      setCashSession(null);
      setCashCloseModal(false);
      setCashSummary(null);
      setDeliveredCash('');
      setClosingObservations('');
      if (documentOpened) setFeedback({ type: 'success', msg: 'Caja cerrada. Imprimiendo corte...' });
    } catch (e) {
      if (cashDocumentWindow && !cashDocumentWindow.closed) cashDocumentWindow.close();
      setCashError(e instanceof Error ? e.message : 'No se pudo cerrar caja.');
    } finally {
      setCashLoading(false);
    }
  };

  const openCashHistory = async () => {
    if (!branchDbId) return;
    setCashHistoryOpen(true);
    setCashLoading(true);
    setCashError('');
    try {
      const rows = await vinosCashRegisterService.list(branchDbId);
      setCashHistory(rows);
    } catch (e) {
      setCashError(e instanceof Error ? e.message : 'No se pudo cargar el historial de caja.');
    } finally {
      setCashLoading(false);
    }
  };

  // ── filtrados ───────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').includes(q)
    );
  }, [products, search]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => customers.find(c => c.id === customerId) ?? null, [customers, customerId]);

  // ── totales ─────────────────────────────────────────────
  const subtotal = useMemo(() => cart.reduce((s, it) => s + Number(it.qty) * Number(it.unit_price), 0), [cart]);
  const manualDiscountAmount = manualDiscountApplied ? Math.min(subtotal, (subtotal * manualDiscountApplied.percent) / 100) : 0;
  const activeDiscount = manualDiscountApplied ? manualDiscountAmount : couponDiscount;
  const discountLabel = manualDiscountApplied ? `Descuento manual ${manualDiscountApplied.percent}%` : 'Cupón';
  const totalAfterCoupon = Math.max(0, subtotal - activeDiscount);
  const walletAvailable = selectedCustomer?.wallet_enabled ? Number(selectedCustomer.wallet_balance ?? 0) : 0;
  const walletUsedActual = useWallet ? Math.min(Number(walletAmount) || 0, walletAvailable, totalAfterCoupon) : 0;
  const totalAfterWallet = Math.max(0, totalAfterCoupon - walletUsedActual);

  const isCortesia = paymentMethod === 'CORTESIA';
  const isCredito = paymentMethod === 'CREDITO';
  const isEfectivo = paymentMethod === 'EFECTIVO';

  const creditAvailable = Math.max(0, (selectedCustomer?.credit_limit ?? 0) - customerDebt);
  const total = isCortesia ? 0 : totalAfterWallet;
  const cashReceivedNum = Number(cashReceived) || 0;
  const change = isEfectivo && cashReceivedNum > 0 ? getCashChange(cashReceivedNum, total) : 0;
  const cashPaymentInvalid = isEfectivo && total > 0 && cashReceivedNum < total;

  // ── add product modal helpers ──────────────────────────
  const openAddProduct = (p: ProductFull) => {
    if (p.product_uoms.length === 0) {
      setFeedback({ type: 'error', msg: 'Este producto no tiene unidades configuradas.' });
      return;
    }
    const base = p.product_uoms.find(u => Number(u.factor_to_base) === 1) ?? p.product_uoms[0];
    setAddProductTarget(p);
    setStepUomId(base.id);
    setStepTier('MENUDEO');
    setStepQty('1');
  };

  const closeAddProduct = () => setAddProductTarget(null);

  const getPriceForTier = (pu: ProductUomFull, tier: PriceTier) => {
    if (tier === 'MENUDEO') return pu.price_retail;
    if (tier === 'MEDIO_MAYOREO') return pu.price_mid_wholesale;
    return pu.price_wholesale;
  };

  const getCartItemQtyBase = (item: SaleCartItem) =>
    Number(item.qty || 0) * Number(item.factor_to_base || 1);

  const getProductQtyBaseInCart = (items: SaleCartItem[], productId: string, excludeIdx?: number) =>
    items.reduce((sum, item, idx) => {
      if (item.product_id !== productId || idx === excludeIdx) return sum;
      return sum + getCartItemQtyBase(item);
    }, 0);

  const getProductStock = (productId: string) =>
    Number(products.find(p => p.id === productId)?.total_stock ?? 0);

  const showStockInsufficient = (productName: string, availableBase: number, factorToBase: number, uomName?: string) => {
    const availableInSelectedUom = Math.max(0, Math.floor((availableBase / factorToBase) * 100) / 100);
    setFeedback({
      type: 'error',
      msg: `Stock insuficiente para "${productName}". Disponible: ${availableInSelectedUom} ${uomName || 'unidad(es)'} (${Math.max(0, availableBase)} base).`,
    });
  };

  const canUseStock = (
    productId: string,
    productName: string,
    qty: number,
    factorToBase: number,
    uomName?: string,
    excludeIdx?: number
  ) => {
    const stockBase = getProductStock(productId);
    if (stockBase <= 0) {
      setFeedback({ type: 'error', msg: `Sin stock para "${productName}".` });
      return false;
    }
    const otherCartQtyBase = getProductQtyBaseInCart(cart, productId, excludeIdx);
    const requestedQtyBase = qty * factorToBase;
    const availableBase = stockBase - otherCartQtyBase;
    if (requestedQtyBase - availableBase > STOCK_EPSILON) {
      showStockInsufficient(productName, availableBase, factorToBase, uomName);
      return false;
    }
    return true;
  };

  const handleAddToCart = () => {
    if (!addProductTarget) return;
    const pu = addProductTarget.product_uoms.find(u => u.id === stepUomId);
    if (!pu) return;
    const qty = Number(stepQty);
    if (!qty || qty <= 0) return;
    const factorToBase = Number(pu.factor_to_base || 1);
    const uomName = pu.uom?.name ?? '';
    if (!canUseStock(addProductTarget.id, addProductTarget.name, qty, factorToBase, uomName)) return;
    const unit_price = getPriceForTier(pu, stepTier);

    setCart(prev => [...prev, {
      product_id: addProductTarget.id,
      product_uom_id: pu.id,
      factor_to_base: factorToBase,
      qty,
      price_type: stepTier,
      unit_price,
      product_name: addProductTarget.name,
      product_sku: addProductTarget.sku,
      uom_name: uomName,
    }]);
    setAddProductTarget(null);
  };

  const updateCartItem = (idx: number, patch: Partial<SaleCartItem>) =>
    setCart(prev => {
      const current = prev[idx];
      if (!current) return prev;
      const next = { ...current, ...patch };
      const nextQty = Number(next.qty);
      const nextFactor = Number(next.factor_to_base || 1);
      if (!Number.isFinite(nextQty) || nextQty <= 0) {
        return prev.map((row, i) => i === idx ? next : row);
      }
      const stockBase = getProductStock(next.product_id);
      const otherCartQtyBase = getProductQtyBaseInCart(prev, next.product_id, idx);
      const requestedQtyBase = nextQty * nextFactor;
      const availableBase = stockBase - otherCartQtyBase;
      if (requestedQtyBase - availableBase > STOCK_EPSILON) {
        showStockInsufficient(next.product_name ?? 'producto', availableBase, nextFactor, next.uom_name);
        return prev;
      }
      return prev.map((row, i) => i === idx ? next : row);
    });

  const removeCartItem = (idx: number) =>
    setCart(prev => prev.filter((_, i) => i !== idx));

  const clearCart = () => {
    setCart([]);
    setCustomerId('');
    setUseCoupon(false); setCouponCode(''); setCouponDiscount(0); setCouponMsg(''); setAppliedPromoId(null);
    setManualDiscountApplied(null); setManualDiscountPercent(''); setManualDiscountJustification(''); setManualDiscountError('');
    setUseWallet(false); setWalletAmount('0');
    setCashReceived('');
    setPaymentMethod('EFECTIVO');
    setSaleNotes('');
    setCheckoutOpen(false);
  };

  const removeManualDiscount = () => {
    setManualDiscountApplied(null);
    setManualDiscountPercent('');
    setManualDiscountJustification('');
    setManualDiscountError('');
  };

  const applyManualDiscount = () => {
    const percent = Number(manualDiscountPercent);
    const justification = manualDiscountJustification.trim();
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      setManualDiscountError('Ingresa un porcentaje entre 1 y 100.');
      return;
    }
    if (!justification) {
      setManualDiscountError('La justificación es obligatoria.');
      return;
    }
    setUseCoupon(false);
    setCouponCode('');
    setCouponDiscount(0);
    setCouponMsg('');
    setAppliedPromoId(null);
    setManualDiscountApplied({ percent, justification });
    setManualDiscountOpen(false);
    setManualDiscountError('');
  };

  // ── cupón (incluye promociones de campaña) ─────────────
  const validateCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setValidatingCoupon(true);
    setCouponMsg('');
    // 1. Intentar como promoción de campaña
    const promo = await vinosSalesService.validatePromotion(code, subtotal, customerId || null);
    if (promo.valid) {
      removeManualDiscount();
      setCouponDiscount(promo.discount);
      setAppliedPromoId(promo.promotion.id);
      setCouponMsg(`✓ ${promo.promotion.discount_percent}% aplicado: -${formatCurrency(promo.discount)}`);
      setValidatingCoupon(false);
      return;
    }
    // 2. Intentar como cupón genérico
    const coupon = await vinosSalesService.validateCoupon(code, subtotal);
    if (coupon.valid) {
      removeManualDiscount();
      setCouponDiscount(coupon.discount);
      setAppliedPromoId(null);
      setCouponMsg(`✓ Aplicado: -${formatCurrency(coupon.discount)}`);
    } else {
      setCouponDiscount(0);
      setAppliedPromoId(null);
      setCouponMsg(`✗ ${promo.valid === false ? promo.error : coupon.error}`);
    }
    setValidatingCoupon(false);
  };

  const removeCoupon = () => { setCouponCode(''); setCouponDiscount(0); setCouponMsg(''); setAppliedPromoId(null); };

  // ── history ───────────────────────────────────────────
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = await vinosSalesService.list(branchDbId ?? undefined, {
        from: historyFrom || undefined,
        to: historyTo || undefined,
        search: historySearch.trim() || undefined,
      });
      setHistorySales(rows);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const openHistory = () => { setHistoryOpen(true); setHistoryPage(1); loadHistory(); };
  const clearHistoryFilters = () => { setHistoryFrom(''); setHistoryTo(''); setHistorySearch(''); setHistoryPage(1); };

  useEffect(() => {
    if (historyOpen) { loadHistory(); setHistoryPage(1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFrom, historyTo, historySearch]);

  // Al cambiar de cliente, limpiar cupón aplicado (las promociones van por dueño)
  useEffect(() => { removeCoupon(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [customerId]);

  // Cargar deuda del cliente para calcular crédito disponible (límite - deuda)
  useEffect(() => {
    if (!customerId) { setCustomerDebt(0); return; }
    vinosSalesService.customerCreditBalance(customerId)
      .then(({ debt }) => setCustomerDebt(debt))
      .catch(() => setCustomerDebt(0));
  }, [customerId]);

  // ── helpers color / type detection ────────────────────
  const getSaleTypeInfo = (s: import('../../services/vinos/sales.service').SaleRow) => {
    if (Number(s.wallet_used ?? 0) > 0 && Number(s.wallet_used) >= Number(s.total)) {
      return { label: 'SALDO',    color: '#a855f7', bg: 'bg-purple-100', text: 'text-purple-700' };
    }
    if (s.payment_method === 'CREDITO') {
      return { label: 'CREDITO',  color: '#ef4444', bg: 'bg-red-100',    text: 'text-red-700' };
    }
    if (s.payment_method === 'CORTESIA') {
      return { label: 'SIN COSTO', color: '#94a3b8', bg: 'bg-slate-200',  text: 'text-slate-700' };
    }
    return { label: 'EFECTIVO',   color: '#22c55e', bg: 'bg-green-100',  text: 'text-green-700' };
  };

  // ── sale actions ──────────────────────────────────────
  const openSaleDetail = async (s: import('../../services/vinos/sales.service').SaleRow) => {
    setSaleDetailRow(s);
    setSaleDetailOpen(true);
    setSaleDetailItems([]);
    try {
      const { data } = await supabaseVinos
        .from('sale_items')
        .select('id, product_id, qty, unit_price, line_total, price_type, product:products(id,name,sku), uom:product_uoms(id, uom:uoms(name))')
        .eq('sale_id', s.id);
      interface RawItem { id: string; product_id: string; qty: number; unit_price: number; line_total: number; price_type: string; product?: { name: string; sku: string } | { name: string; sku: string }[] | null; uom?: { id: string; uom?: { name: string } | { name: string }[] | null } | { id: string; uom?: { name: string } | { name: string }[] | null }[] | null }
      const flatten = (data ?? []).map((r: RawItem) => {
        const product = Array.isArray(r.product) ? r.product[0] : r.product;
        const uomWrap = Array.isArray(r.uom) ? r.uom[0] : r.uom;
        const uomInner = uomWrap?.uom ? (Array.isArray(uomWrap.uom) ? uomWrap.uom[0] : uomWrap.uom) : null;
        return {
          id: r.id, product_id: r.product_id, qty: r.qty, unit_price: r.unit_price, line_total: r.line_total, price_type: r.price_type,
          product: product ? { name: product.name, sku: product.sku } : null,
          uom: uomInner ? { name: uomInner.name } : null,
        };
      });
      setSaleDetailItems(flatten);
    } catch (e) { console.error(e); }
  };

  const openEditType = async (s: import('../../services/vinos/sales.service').SaleRow) => {
    setEditTypeRow(s);
    setEditTypeValue(s.payment_method === 'CREDITO' ? 'CREDITO' : 'EFECTIVO');
    // Si la venta ya usaba wallet, pre-marcar checkbox y amount
    const prevWallet = Number(s.wallet_used ?? 0);
    setEditTypeUseWallet(prevWallet > 0);
    setEditTypeWalletAmount(prevWallet > 0 ? String(prevWallet) : '0');
    setEditTypeObservation('');
    setEditTypeError('');
    setEditTypeCustomerSnapshot(null);
    setEditTypeOpen(true);
    if (s.customer_id) {
      const { data } = await supabaseVinos
        .from('customers')
        .select('name, wallet_enabled, wallet_balance, credit_limit')
        .eq('id', s.customer_id)
        .single();
      if (data) setEditTypeCustomerSnapshot({
        name: data.name,
        wallet_enabled: !!data.wallet_enabled,
        wallet_balance: Number(data.wallet_balance ?? 0),
        credit_limit: Number(data.credit_limit ?? 0),
      });
    }
  };

  const saveEditType = async () => {
    if (!editTypeRow) return;
    if (!editTypeObservation.trim()) { setEditTypeError('La observación es obligatoria.'); return; }
    setEditTypeSaving(true);
    setEditTypeError('');
    try {
      await vinosSalesService.updatePaymentType({
        saleId: editTypeRow.id,
        newType: editTypeValue,
        useWallet: editTypeUseWallet,
        walletAmount: Number(editTypeWalletAmount) || 0,
        observation: editTypeObservation.trim(),
        actorId: currentUser.id,
      });
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ACTUALIZAR',
        entity_type: 'venta',
        entity_id: editTypeRow.id,
        description: `Cambio tipo venta: ${editTypeRow.payment_method} → ${editTypeValue}`,
        justification: editTypeObservation.trim(),
        previous_data: { payment_method: editTypeRow.payment_method, credit_used: editTypeRow.credit_used, wallet_used: editTypeRow.wallet_used },
        new_data: { payment_method: editTypeValue, useWallet: editTypeUseWallet, walletAmount: Number(editTypeWalletAmount) || 0 },
      });
      await loadHistory();
      setEditTypeOpen(false);
      setFeedback({ type: 'success', msg: 'Tipo de venta actualizado.' });
    } catch (e: unknown) {
      setEditTypeError(e instanceof Error ? e.message : 'Error al actualizar.');
    }
    finally { setEditTypeSaving(false); }
  };

  const openDeleteSale = (s: import('../../services/vinos/sales.service').SaleRow) => {
    setDeleteSaleRow(s);
    setDeleteSaleNote('');
    setDeleteSaleOpen(true);
  };

  const confirmDeleteSale = async () => {
    if (!deleteSaleRow || !deleteSaleNote.trim()) return;
    setDeletingSale(true);
    try {
      await vinosSalesService.softDelete(deleteSaleRow.id, deleteSaleNote.trim());
      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branches.find(b => b.id === selectedBranchId)?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'ELIMINAR',
        entity_type: 'venta',
        entity_id: deleteSaleRow.id,
        description: `Venta eliminada · ${formatCurrency(deleteSaleRow.total)}`,
        justification: deleteSaleNote.trim(),
        previous_data: { total: deleteSaleRow.total, payment_method: deleteSaleRow.payment_method, customer_id: deleteSaleRow.customer_id },
      });
      setHistorySales(prev => prev.filter(s => s.id !== deleteSaleRow.id));
      setDeleteSaleOpen(false);
    } catch (e) { console.error(e); }
    finally { setDeletingSale(false); }
  };

  const exportSalePdf = async (s: import('../../services/vinos/sales.service').SaleRow) => {
    try {
      // Fetch items
      const { data: rawItems } = await supabaseVinos
        .from('sale_items')
        .select('id, qty, unit_price, line_total, factor_used, price_type, product:products(id,name,sku), uom:product_uoms(id, uom:uoms(id,name))')
        .eq('sale_id', s.id);
      interface ItemRow {
        id: string; qty: number; unit_price: number; line_total: number; factor_used: number; price_type: string;
        product?: { name: string; sku: string } | { name: string; sku: string }[] | null;
        uom?: { uom?: { name: string } | { name: string }[] | null } | { uom?: { name: string } | { name: string }[] | null }[] | null;
      }
      const items = (rawItems as ItemRow[] ?? []).map(r => {
        const product = Array.isArray(r.product) ? r.product[0] : r.product;
        const uomWrap = Array.isArray(r.uom) ? r.uom[0] : r.uom;
        const uomInner = uomWrap?.uom ? (Array.isArray(uomWrap.uom) ? uomWrap.uom[0] : uomWrap.uom) : null;
        return {
          name: product?.name ?? 'PRODUCTO',
          presentation: `${uomInner?.name ?? '—'} (x${Number(r.factor_used).toFixed(2)})`,
          priceType: r.price_type,
          qty: Number(r.qty),
          unitPrice: Number(r.unit_price),
          subtotal: Number(r.line_total ?? r.qty * r.unit_price),
        };
      });

      await generateVinosSaleTicket({
        saleId: s.id,
        createdAt: s.created_at,
        branchName: branches.find(b => b.id === selectedBranchId)?.name ?? 'CASA TAHONA',
        customerName: s.customer?.name ?? 'PUBLICO GENERAL',
        customerAddress: '',
        cashierName: currentUser.name,
        paymentMethod: s.payment_method,
        walletUsed: Number(s.wallet_used ?? 0),
        creditUsed: Number(s.credit_used ?? 0),
        cashReceived: Number(s.cash_received ?? 0),
        cashChange: s.payment_method === 'EFECTIVO' ? getCashChange(Number(s.cash_received ?? 0), Number(s.total ?? 0)) : 0,
        saleNotes: s.notes,
        items,
        subtotal: Number(s.subtotal),
        discount: Number(s.discount_amount ?? 0),
        total: Number(s.total),
        discountCode: (s as { promotion_code?: string | null }).promotion_code ?? s.coupon_code ?? null,
      });
    } catch (e) {
      console.error(e);
      setFeedback({ type: 'error', msg: 'Error al generar PDF.' });
    }
  };

  // pagined slice
  const totalPages = Math.max(1, Math.ceil(historySales.length / HISTORY_PAGE_SIZE));
  const pagedSales = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return historySales.slice(start, start + HISTORY_PAGE_SIZE);
  }, [historySales, historyPage]);

  // ── customer detail ───────────────────────────────────
  const openCustomerDetail = async () => {
    if (!selectedCustomer) return;
    setCustomerDetailOpen(true);
    try {
      const { debt } = await vinosSalesService.customerCreditBalance(selectedCustomer.id);
      setCustomerDebt(debt);
    } catch (e) { console.error(e); }
  };

  // ── cobrar ─────────────────────────────────────────────
  const handleCharge = async () => {
    if (!branchDbId) { setFeedback({ type: 'error', msg: 'Sucursal no encontrada.' }); return; }
    if (cart.length === 0) { setFeedback({ type: 'error', msg: 'Carrito vacío.' }); return; }
    if (cashPaymentInvalid) {
      setFeedback({ type: 'error', msg: 'El monto recibido debe cubrir el total de la venta.' });
      return;
    }
    if (isCredito && !customerId) { setFeedback({ type: 'error', msg: 'Crédito requiere cliente seleccionado.' }); return; }
    if (isCredito && totalAfterWallet > creditAvailable) {
      setFeedback({ type: 'error', msg: `Crédito insuficiente. Disponible: ${formatCurrency(creditAvailable)}` });
      return;
    }
    flushSync(() => {
      setPrintModalOpen(true);
      setCharging(true);
    });
    await wait(900);
    const saleDocumentWindow = window.open('', '_blank');
    if (saleDocumentWindow) {
      saleDocumentWindow.document.title = 'Nota de venta';
      saleDocumentWindow.blur();
      window.focus();
    }
    const ticketItems = cart.map(item => ({
      name: item.product_name ?? 'PRODUCTO',
      presentation: `${item.uom_name ?? '—'} (x${Number(item.factor_to_base || 1).toFixed(2)})`,
      priceType: item.price_type,
      qty: Number(item.qty),
      unitPrice: Number(item.unit_price),
      subtotal: Number(item.qty) * Number(item.unit_price),
    }));
    const branchName = branches.find(b => b.id === selectedBranchId)?.name ?? 'CASA TAHONA';
    const manualDiscountNote = manualDiscountApplied
      ? `Descuento manual ${manualDiscountApplied.percent}%: ${manualDiscountApplied.justification}`
      : null;
    const notesForSale = [saleNotes.trim(), manualDiscountNote].filter(Boolean).join(' | ') || null;
    const notesForTicket = notesForSale;
    try {
      const saleId = await vinosSalesService.create({
        branch_id: branchDbId,
        customer_id: customerId || null,
        payment_method: paymentMethod,
        subtotal,
        discount_amount: activeDiscount,
        total,
        coupon_code: !manualDiscountApplied && !appliedPromoId && couponDiscount > 0 ? couponCode.trim().toUpperCase() : null,
        promotion_id: manualDiscountApplied ? null : appliedPromoId,
        promotion_code: !manualDiscountApplied && appliedPromoId ? couponCode.trim().toUpperCase() : null,
        wallet_used: walletUsedActual,
        credit_used: isCredito ? totalAfterWallet : 0,
        cash_received: isEfectivo ? cashReceivedNum : 0,
        notes: notesForSale,
        created_by: currentUser.id,
        items: cart,
      });
      const ticketInput: VinosSalePdfInput = {
        saleId,
        createdAt: new Date().toISOString(),
        branchName,
        customerName: selectedCustomer?.name ?? 'PUBLICO GENERAL',
        customerAddress: '',
        cashierName: currentUser.name,
        paymentMethod,
        walletUsed: walletUsedActual,
        creditUsed: isCredito ? totalAfterWallet : 0,
        cashReceived: isEfectivo ? cashReceivedNum : 0,
        cashChange: isEfectivo ? change : 0,
        saleNotes: notesForTicket,
        items: ticketItems,
        subtotal,
        discount: activeDiscount,
        total,
        discountCode: manualDiscountApplied ? 'DESCUENTO MANUAL' : couponDiscount > 0 ? couponCode.trim().toUpperCase() : null,
      };

      logVinosAudit({
        branch_id: selectedBranchId,
        branch_name: branchName,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'VENTA',
        entity_type: 'venta',
        entity_id: saleId,
        description: `Venta ${formatCurrency(total)} · ${paymentMethod} · ${cart.length} producto(s)`,
        new_data: {
          payment_method: paymentMethod,
          total,
          customer_id: customerId,
          items_count: cart.length,
          wallet_used: walletUsedActual,
          credit_used: isCredito ? totalAfterWallet : 0,
          cash_received: isEfectivo ? cashReceivedNum : 0,
          cash_change: isEfectivo ? change : 0,
          discount_amount: activeDiscount,
          manual_discount_percent: manualDiscountApplied?.percent ?? null,
          manual_discount_justification: manualDiscountApplied?.justification ?? null,
          coupon_code: !manualDiscountApplied && !appliedPromoId && couponDiscount > 0 ? couponCode.toUpperCase() : null,
          promotion_code: !manualDiscountApplied && appliedPromoId ? couponCode.toUpperCase() : null,
          notes: notesForSale,
        },
      });
      let documentOpened = true;
      try {
        await generateVinosSaleTicket(ticketInput, { mode: 'print', targetWindow: saleDocumentWindow });
      } catch (pdfError) {
        console.error(pdfError);
        documentOpened = false;
        if (saleDocumentWindow && !saleDocumentWindow.closed) saleDocumentWindow.close();
        setFeedback({ type: 'error', msg: 'Venta registrada, pero no se pudo abrir el documento.' });
      }
      if (documentOpened) setFeedback({ type: 'success', msg: '✓ Venta registrada' });
      clearCart();
      await load();
    } catch (e: unknown) {
      if (saleDocumentWindow && !saleDocumentWindow.closed) saleDocumentWindow.close();
      setFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Error al cobrar.' });
    } finally {
      setPrintModalOpen(false);
      setCharging(false);
    }
  };

  // ── render ──────────────────────────────────────────────
  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-3 h-[calc(100vh-168px)]">

      {/* ─── Catálogo ──────────────────────────────────── */}
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                className="w-full rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                placeholder="Buscar producto por nombre, SKU o código…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={openHistory}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              title="Historial de ventas"
            >
              <Receipt size={14}/> Historial
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
            <div className="mr-auto flex items-center gap-2 text-[11px] font-bold text-slate-600">
              <Clock size={14} className="text-orange-500" />
              <span>
                {cashSession ? `Caja abierta desde ${formatDateTime(cashSession.opened_at)}` : 'Caja sin iniciar'}
              </span>
            </div>
            {cashSession ? (
              <button
                onClick={openCloseCashModal}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100"
                title={`Caja abierta desde ${formatDateTime(cashSession.opened_at)}`}
              >
                <LockKeyhole size={14}/> Cerrar caja
              </button>
            ) : (
              <button
                onClick={openCashOpeningForm}
                className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-orange-700 hover:bg-orange-100"
              >
                <UnlockKeyhole size={14}/> Iniciar caja
              </button>
            )}
            <button
              onClick={openCashHistory}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              title="Historial de caja"
            >
              <History size={14}/> Caja
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="py-20 text-center text-sm font-bold text-slate-400">Cargando catálogo…</div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-20 text-center">
              <Tag size={36} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Sin productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => openAddProduct(p)}
                  className="flex min-h-[88px] flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all hover:border-orange-300 hover:shadow-sm"
                >
                  <p className="flex-1 text-[11px] font-black leading-4 text-slate-900 line-clamp-2">{p.name}</p>
                  <p className="text-[9px] font-mono text-slate-400">{p.sku}</p>
                  <div className="flex items-end justify-between gap-2 pt-0.5">
                    <p className="text-sm font-black text-orange-600">{formatCurrency(p.price_retail)}</p>
                    <p className="text-[9px] font-bold text-slate-500">Stock: {p.total_stock}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Panel carrito + pago ──────────────────────── */}
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

        {/* Cliente */}
        <div className="border-b border-slate-100 p-3">
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Cliente</p>
          {selectedCustomer ? (
            <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-sm font-black text-white">
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-bold text-slate-900">{selectedCustomer.name}</p>
                <p className="text-[9px] text-slate-500">
                  {selectedCustomer.wallet_enabled ? `Saldo: ${formatCurrency(walletAvailable)}` : ''}
                  {selectedCustomer.credit_limit > 0 ? ` · Crédito: ${formatCurrency(creditAvailable)}` : ''}
                </p>
              </div>
              <button onClick={openCustomerDetail} className="rounded-lg p-1.5 text-slate-500 hover:bg-orange-100 hover:text-orange-700" title="Gestionar cliente">
                <UserIcon size={14}/>
              </button>
              <button onClick={() => { setCustomerId(''); setUseWallet(false); }} className="rounded-lg p-1 text-slate-400 hover:text-red-500" title="Quitar">
                <X size={14}/>
              </button>
            </div>
          ) : (
            <button onClick={() => setCustomerSelectorOpen(true)} className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left hover:border-orange-400 hover:bg-orange-50/40">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <UserIcon size={14}/>
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-700">Público general</p>
                <p className="text-[9px] text-slate-400">Click para seleccionar cliente</p>
              </div>
            </button>
          )}
        </div>

        {/* Carrito */}
        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Receipt size={36} className="text-slate-300" />
              <p className="mt-3 text-xs font-black uppercase tracking-widest text-slate-400">Carrito vacío</p>
              <p className="mt-1 text-[10px] text-slate-400">Click un producto del catálogo</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {cart.map((it, idx) => (
                <div key={idx} className="space-y-1.5 rounded-xl border border-slate-200 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900">{it.product_name}</p>
                      <p className="text-[9px] text-slate-400">{it.uom_name} · {PRICE_TIER_LABEL[it.price_type]}</p>
                    </div>
                    <button onClick={() => removeCartItem(idx)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-1">
                      <button onClick={() => updateCartItem(idx, { qty: Math.max(0.01, it.qty - 1) })} className="rounded-lg p-1 hover:bg-slate-100"><Minus size={12}/></button>
                      <input
                        type="number" min="0" step="0.01"
                        className="w-12 bg-transparent text-center text-xs font-black outline-none"
                        value={it.qty}
                        onChange={e => updateCartItem(idx, { qty: Number(e.target.value) || 0 })}
                      />
                      <button onClick={() => updateCartItem(idx, { qty: it.qty + 1 })} className="rounded-lg p-1 hover:bg-slate-100"><Plus size={12}/></button>
                    </div>
                    <p className="text-xs font-black text-slate-900">{formatCurrency(it.qty * it.unit_price)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: método pago + subtotal + cobrar */}
        <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/50 p-3">

          {/* Método de pago */}
          <div>
            <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Método de pago</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'EFECTIVO', label: 'Efectivo',  icon: Banknote,   disabled: false },
                { v: 'CREDITO',  label: 'Crédito',   icon: CreditCard, disabled: !selectedCustomer },
              ] as const).map(p => {
                const active = paymentMethod === p.v;
                return (
                  <button
                    key={p.v}
                    onClick={() => !p.disabled && setPaymentMethod(p.v)}
                    disabled={p.disabled}
                    title={p.disabled ? 'Selecciona un cliente primero' : ''}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-1.5 transition-colors ${
                      p.disabled ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed' :
                      active ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p.icon size={14} className={active && !p.disabled ? 'text-orange-700' : 'text-slate-500'} />
                    <span className={`text-[9px] font-black ${active && !p.disabled ? 'text-orange-700' : 'text-slate-600'}`}>{p.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setManualDiscountPercent(manualDiscountApplied ? String(manualDiscountApplied.percent) : '');
                  setManualDiscountJustification(manualDiscountApplied?.justification ?? '');
                  setManualDiscountError('');
                  setManualDiscountOpen(true);
                }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-1.5 transition-colors ${
                  manualDiscountApplied ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <Tag size={14} className={manualDiscountApplied ? 'text-blue-700' : 'text-slate-500'} />
                <span className={`text-[9px] font-black ${manualDiscountApplied ? 'text-blue-700' : 'text-slate-600'}`}>Aplicar descuento</span>
              </button>
            </div>
            {!selectedCustomer && (
              <p className="mt-1.5 text-[10px] text-slate-400">Crédito requiere cliente seleccionado.</p>
            )}
          </div>

          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Subtotal</span>
            <span className="text-xl font-black text-orange-600">{formatCurrency(subtotal)}</span>
          </div>
          <button
            onClick={() => setCheckoutOpen(true)}
            disabled={cart.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-40"
          >
            Continuar a cobro
          </button>
          {cart.length > 0 && (
            <button onClick={clearCart} className="w-full rounded-2xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50">
              Limpiar carrito
            </button>
          )}
        </div>
      </div>

      {/* ─── MODAL BLOQUEANTE INICIAR CAJA ────────────── */}
      {cashStartPromptOpen && !cashSession && !cashOpenModal && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-slate-950/70 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-orange-100 bg-white p-8 shadow-2xl sm:p-10">
            <div className="mb-6 flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-2xl bg-orange-300 opacity-30" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/25">
                  <Store size={29} />
                </div>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-600">Casa Tahona</p>
                <p className="text-sm font-bold text-slate-600">{branchName}</p>
              </div>
            </div>

            <h2 className="text-4xl font-black tracking-tight text-slate-950">Iniciar Caja</h2>
            <p className="mt-4 max-w-lg text-sm font-semibold leading-6 text-slate-500">
              Para comenzar a vender, primero registra la apertura de caja de {currentUser.name}.
            </p>

            <button
              onClick={openCashOpeningForm}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 py-4 text-sm font-black uppercase tracking-wider text-white shadow-xl shadow-orange-600/20 transition hover:bg-orange-500"
            >
              Continuar <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL INICIAR CAJA ───────────────────────── */}
      {cashOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Iniciar caja</h3>
                <p className="text-[11px] font-bold text-slate-400">{currentUser.name} · {branchName}</p>
              </div>
              <button onClick={() => { setCashOpenModal(false); if (!cashSession) setCashStartPromptOpen(true); }} disabled={cashLoading} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18}/></button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Monto inicial</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingCash}
                  onChange={e => setOpeningCash(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xl font-black text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Descripción opcional</span>
                <textarea
                  rows={3}
                  value={openingObservations}
                  onChange={e => setOpeningObservations(e.target.value)}
                  placeholder="Opcional..."
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </label>
              {cashError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{cashError}</p>}
            </div>
            <div className="flex gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button onClick={() => { setCashOpenModal(false); if (!cashSession) setCashStartPromptOpen(true); }} disabled={cashLoading} className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-40">Regresar</button>
              <button onClick={handleOpenCash} disabled={cashLoading} className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:opacity-40">
                {cashLoading && <Loader2 size={14} className="animate-spin"/>}
                Iniciar caja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL CERRAR CAJA ────────────────────────── */}
      {cashCloseModal && cashSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Cerrar caja</h3>
                <p className="text-[11px] font-bold text-slate-400">
                  {cashSession.cashier_name} · Apertura {formatDateTime(cashSession.opened_at)}
                </p>
              </div>
              <button onClick={() => setCashCloseModal(false)} disabled={cashLoading} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {cashLoading && !cashSummary ? (
                <div className="py-16 text-center">
                  <Loader2 size={28} className="mx-auto animate-spin text-orange-500" />
                  <p className="mt-3 text-sm font-bold text-slate-400">Calculando corte...</p>
                </div>
              ) : cashSummary ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { label: 'Ventas efectivo', value: cashSummary.cash_sales_total, icon: Banknote, box: 'border-emerald-200 bg-emerald-50', iconBox: 'bg-emerald-100 text-emerald-700', valueClass: 'text-emerald-700' },
                      { label: 'Cortesías', value: cashSummary.courtesy_total, icon: Gift, box: 'border-purple-200 bg-purple-50', iconBox: 'bg-purple-100 text-purple-700', valueClass: 'text-purple-700' },
                      { label: 'Descuentos', value: cashSummary.discounts_total, icon: Tag, box: 'border-blue-200 bg-blue-50', iconBox: 'bg-blue-100 text-blue-700', valueClass: 'text-blue-700' },
                      { label: 'Cancelaciones', value: cashSummary.cancellations_total, icon: Trash2, box: 'border-red-200 bg-red-50', iconBox: 'bg-red-100 text-red-700', valueClass: 'text-red-700' },
                      { label: 'Total vendido', value: cashSummary.total_sold, icon: Receipt, box: 'border-orange-200 bg-orange-50', iconBox: 'bg-orange-100 text-orange-700', valueClass: 'text-orange-700' },
                      { label: 'Efectivo esperado', value: cashSummary.expected_cash, icon: Wallet, box: 'border-slate-200 bg-slate-50', iconBox: 'bg-slate-200 text-slate-700', valueClass: 'text-slate-900' },
                    ].map(row => (
                      <div key={row.label} className={`rounded-2xl border p-4 ${row.box}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{row.label}</p>
                            <p className={`mt-1 text-xl font-black ${row.valueClass}`}>{formatCurrency(row.value)}</p>
                          </div>
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${row.iconBox}`}>
                            <row.icon size={18} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <label className="grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Efectivo entregado</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deliveredCash}
                        onChange={e => setDeliveredCash(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-900 outline-none focus:border-orange-400"
                      />
                      <span className={`text-xs font-black ${Number(deliveredCash || 0) - cashSummary.expected_cash === 0 ? 'text-slate-500' : Number(deliveredCash || 0) - cashSummary.expected_cash > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Dif. {formatCurrency(Number(deliveredCash || 0) - cashSummary.expected_cash)}
                      </span>
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Observaciones de cierre</span>
                    <textarea
                      rows={3}
                      value={closingObservations}
                      onChange={e => setClosingObservations(e.target.value)}
                      placeholder="Opcional..."
                      className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </label>
                </>
              ) : null}
              {cashError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{cashError}</p>}
            </div>

            <div className="flex gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button onClick={() => setCashCloseModal(false)} disabled={cashLoading} className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-40">Cancelar</button>
              <button onClick={handleCloseCash} disabled={cashLoading || !cashSummary} className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:opacity-40">
                {cashLoading && <Loader2 size={14} className="animate-spin"/>}
                Cerrar caja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL HISTORIAL CAJA ─────────────────────── */}
      {cashHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-6xl rounded-xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                  <Clock size={18}/>
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Historial de caja</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{branchName}</p>
                </div>
              </div>
              <button onClick={() => setCashHistoryOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {cashLoading ? (
                <p className="py-16 text-center text-sm text-slate-400">Cargando...</p>
              ) : cashHistory.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">Sin cortes de caja registrados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100">
                    <tr className="border-b border-slate-200">
                      {['Cajera','Apertura','Cierre','Efectivo','Cortesías','Desc.','Cancel.','Total','Esperado','Obs.'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashHistory.map(row => (
                      <tr key={row.id} className="hover:bg-orange-50/30">
                        <td className="px-3 py-3 text-xs font-bold text-slate-800">{row.cashier_name}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(row.opened_at)}</td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(row.closed_at)}</td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-900">{formatCurrency(row.cash_sales_total)}</td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-900">{formatCurrency(row.courtesy_total)}</td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-900">{formatCurrency(row.discounts_total)}</td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-900">{row.cancellations_count} · {formatCurrency(row.cancellations_total)}</td>
                        <td className="px-3 py-3 text-xs font-black text-slate-900">{formatCurrency(row.total_sold)}</td>
                        <td className="px-3 py-3 text-xs font-black text-slate-900">{formatCurrency(row.expected_cash)}</td>
                        <td className="px-3 py-3 text-xs text-slate-500 max-w-[220px]">
                          <p className="truncate">{row.closing_observations || row.opening_observations || '—'}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DESCUENTO MANUAL ───────────────────── */}
      {manualDiscountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Aplicar descuento</h3>
                <p className="text-[11px] font-bold text-slate-400">Sobre el subtotal de la compra</p>
              </div>
              <button onClick={() => setManualDiscountOpen(false)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Porcentaje de descuento</span>
                <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="0.01"
                    value={manualDiscountPercent}
                    onChange={e => setManualDiscountPercent(e.target.value)}
                    className="w-full bg-transparent text-xl font-black text-slate-900 outline-none"
                    autoFocus
                  />
                  <span className="text-sm font-black text-slate-400">%</span>
                </div>
                {Number(manualDiscountPercent) > 0 && (
                  <p className="mt-1 text-right text-xs font-bold text-blue-700">
                    Descuento: {formatCurrency(Math.min(subtotal, (subtotal * Number(manualDiscountPercent || 0)) / 100))}
                  </p>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Justificación obligatoria</span>
                <textarea
                  rows={4}
                  value={manualDiscountJustification}
                  onChange={e => setManualDiscountJustification(e.target.value)}
                  placeholder="Ej. Promoción autorizada, ajuste por cliente frecuente..."
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </label>
              {manualDiscountError && (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{manualDiscountError}</p>
              )}
            </div>
            <div className="flex gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button onClick={() => setManualDiscountOpen(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={applyManualDiscount} className="flex-[2] rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500">
                Aplicar descuento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ADD PRODUCT (uom + tier + qty) ───────── */}
      {addProductTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Agregar al carrito</h3>
                <p className="text-[11px] font-bold text-slate-500 truncate">{addProductTarget.name}</p>
              </div>
              <button onClick={closeAddProduct} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>
            <div className="px-6 py-5 space-y-4">

              {/* Unidad */}
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">1. Unidad de medida</label>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400"
                  value={stepUomId}
                  onChange={e => setStepUomId(e.target.value)}
                >
                  {addProductTarget.product_uoms.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.uom?.name ?? ''}{u.uom?.symbol ? ` (${u.uom.symbol})` : ''} · x{u.factor_to_base}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo precio */}
              <div>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500">2. Tipo de precio</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['MENUDEO','MEDIO_MAYOREO','MAYOREO'] as PriceTier[]).map(tier => {
                    const pu = addProductTarget.product_uoms.find(u => u.id === stepUomId);
                    const price = pu ? getPriceForTier(pu, tier) : 0;
                    const active = stepTier === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setStepTier(tier)}
                        className={`rounded-2xl border px-3 py-2 text-center transition-colors ${
                          active ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <p className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-orange-700' : 'text-slate-500'}`}>{PRICE_TIER_LABEL[tier]}</p>
                        <p className={`mt-1 text-sm font-black ${active ? 'text-orange-700' : 'text-slate-900'}`}>{formatCurrency(price)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cantidad */}
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-widest text-slate-500">3. Cantidad</label>
                <input
                  type="number" min="0" step="0.01" autoFocus
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-base font-bold outline-none focus:border-orange-400"
                  value={stepQty}
                  onChange={e => setStepQty(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddToCart(); }}
                />
                {addProductTarget.product_uoms.find(u => u.id === stepUomId) && (
                  <p className="mt-2 text-[11px] font-bold text-slate-500 text-right">
                    Subtotal: <span className="text-base font-black text-orange-600">
                      {formatCurrency(Number(stepQty) * getPriceForTier(addProductTarget.product_uoms.find(u => u.id === stepUomId)!, stepTier))}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
              <button onClick={closeAddProduct} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={handleAddToCart} className="rounded-2xl bg-orange-600 px-5 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL SELECTOR CLIENTE ────────────────────── */}
      {customerSelectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Seleccionar cliente</h3>
              <button onClick={() => setCustomerSelectorOpen(false)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>
            <div className="border-b border-slate-100 px-6 py-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
                  placeholder="Buscar por nombre, teléfono o email…"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {filteredCustomers.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Sin resultados</p>
              ) : filteredCustomers.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setCustomerId(c.id); setCustomerSelectorOpen(false); setCustomerSearch(''); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-orange-50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 font-black text-orange-600">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {c.phone ?? '—'}
                      {c.wallet_enabled ? ` · Saldo: ${formatCurrency(c.wallet_balance)}` : ''}
                      {c.credit_limit > 0 ? ` · Crédito: ${formatCurrency(c.credit_limit)}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL CHECKOUT ────────────────────────────── */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Finalizar venta</h3>
                <p className="text-[11px] font-bold text-slate-400">
                  {cart.length} producto{cart.length !== 1 ? 's' : ''}
                  {selectedCustomer ? ` · ${selectedCustomer.name}` : ' · Público general'}
                </p>
              </div>
              <button onClick={() => setCheckoutOpen(false)} disabled={charging} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Cupón */}
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Gift size={14} className="text-orange-500"/>
                    <span className="text-sm font-bold text-slate-700">¿Usar cupón?</span>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                    checked={useCoupon}
                    onChange={e => { setUseCoupon(e.target.checked); if (!e.target.checked) removeCoupon(); }}
                  />
                </label>
                {useCoupon && (
                  couponDiscount > 0 ? (
                    <div className="mt-2 flex items-center justify-between rounded-xl bg-green-50 px-3 py-2 text-xs">
                      <span className="font-bold text-green-700">{couponCode.toUpperCase()} · -{formatCurrency(couponDiscount)}</span>
                      <button onClick={removeCoupon} className="text-green-700 hover:text-red-500"><X size={12}/></button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs uppercase outline-none focus:border-orange-400"
                          placeholder="Código del cupón"
                          value={couponCode}
                          onChange={e => setCouponCode(e.target.value)}
                        />
                        <button onClick={validateCoupon} disabled={!couponCode.trim() || validatingCoupon} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-700 disabled:opacity-40">
                          {validatingCoupon ? '…' : 'Aplicar'}
                        </button>
                      </div>
                      {couponMsg && <p className="mt-1 text-[10px] font-bold text-red-500">{couponMsg}</p>}
                    </>
                  )
                )}
              </section>

              {manualDiscountApplied && (
                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-blue-800">Descuento manual aplicado</p>
                      <p className="mt-0.5 text-xs font-bold text-blue-700">
                        {manualDiscountApplied.percent}% · -{formatCurrency(manualDiscountAmount)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-blue-600">{manualDiscountApplied.justification}</p>
                    </div>
                    <button onClick={removeManualDiscount} className="rounded-lg p-1 text-blue-700 hover:bg-blue-100 hover:text-red-500" title="Quitar descuento">
                      <X size={13}/>
                    </button>
                  </div>
                </section>
              )}

              {/* Saldo a favor */}
              {selectedCustomer?.wallet_enabled && walletAvailable > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Wallet size={14} className="text-blue-500"/>
                      <span className="text-sm font-bold text-slate-700">¿Usar saldo a favor?</span>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                      checked={useWallet}
                      onChange={e => { setUseWallet(e.target.checked); if (e.target.checked) setWalletAmount(String(Math.min(walletAvailable, totalAfterCoupon))); }}
                    />
                  </label>
                  <p className="mt-1 text-[10px] text-slate-500">Disponible: <strong>{formatCurrency(walletAvailable)}</strong></p>
                  {useWallet && (
                    <input
                      type="number" min="0" step="0.01" max={Math.min(walletAvailable, totalAfterCoupon)}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-orange-400"
                      value={walletAmount}
                      onChange={e => setWalletAmount(e.target.value)}
                      placeholder="Monto a usar"
                    />
                  )}
                </section>
              )}

              {/* Método de pago (info solo) */}
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Método seleccionado</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {paymentMethod === 'EFECTIVO' ? '💵 Efectivo' : paymentMethod === 'CREDITO' ? '💳 Crédito' : '💵 Efectivo'}
                </p>
                {isCredito && selectedCustomer && (
                  <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
                    Se descontará <strong>{formatCurrency(totalAfterWallet)}</strong> del crédito de <strong>{selectedCustomer.name}</strong> (disponible: {formatCurrency(creditAvailable)}).
                  </div>
                )}
              </section>

              {/* Efectivo recibido */}
              {isEfectivo && total > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Monto recibido</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-base font-black text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    placeholder="Ej. 100.00"
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
                      <p className="mt-1 font-black text-slate-900">{formatCurrency(total)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vuelto</p>
                      <p className={`mt-1 font-black ${cashPaymentInvalid ? 'text-red-500' : 'text-green-600'}`}>{formatCurrency(change)}</p>
                    </div>
                  </div>
                  {cashPaymentInvalid && (
                    <p className="mt-2 text-[11px] font-bold text-red-500">
                      El monto recibido debe ser mayor o igual al total.
                    </p>
                  )}
                </section>
              )}

              {/* Notas */}
              <section>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Observaciones de la venta</label>
                <textarea
                  rows={2}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
                  placeholder="Opcional…"
                  value={saleNotes}
                  onChange={e => setSaleNotes(e.target.value)}
                />
              </section>

              {/* Resumen */}
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                {activeDiscount > 0 && <div className="flex justify-between text-green-600"><span>{discountLabel}</span><span>-{formatCurrency(activeDiscount)}</span></div>}
                {walletUsedActual > 0 && <div className="flex justify-between text-blue-600"><span>Saldo a favor</span><span>-{formatCurrency(walletUsedActual)}</span></div>}
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-lg font-black text-slate-900">
                  <span>Total</span><span className="text-orange-600">{formatCurrency(total)}</span>
                </div>
              </section>
            </div>

            <div className="flex gap-2 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
              <button onClick={() => setCheckoutOpen(false)} disabled={charging} className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                Volver
              </button>
              <button
                onClick={handleCharge}
                disabled={charging || cart.length === 0 || cashPaymentInvalid || (isCredito && (!selectedCustomer || totalAfterWallet > creditAvailable))}
                className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-40"
              >
                {charging && <Loader2 size={14} className="animate-spin"/>}
                {charging ? 'Procesando…' : `Confirmar venta ${formatCurrency(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL HISTORIAL DE VENTAS ─────────────────── */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-6xl rounded-xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                  <Receipt size={18}/>
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Historial de Ventas</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sucursal activa</p>
                </div>
              </div>
              <button onClick={() => setHistoryOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18}/></button>
            </div>

            {/* Filtros */}
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 grid grid-cols-1 md:grid-cols-[140px_140px_1fr_auto] gap-3 items-end">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Desde</label>
                <input type="date" value={historyFrom} onChange={e => setHistoryFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-orange-400"/>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Hasta</label>
                <input type="date" value={historyTo} onChange={e => setHistoryTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-orange-400"/>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Buscar</label>
                <input value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Cliente, total, código…"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-orange-400"/>
              </div>
              <button onClick={clearHistoryFilters} className="rounded-lg bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-700">
                Limpiar filtro
              </button>
            </div>

            {/* Tabla */}
            <div className="flex-1 overflow-y-auto">
              {historyLoading ? (
                <p className="py-16 text-center text-sm text-slate-400">Cargando…</p>
              ) : historySales.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">Sin ventas en este rango</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-200">
                      {['Fecha','Cliente','Tipo','Productos','Total','Notas','Acciones'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedSales.map(s => {
                      const itemCount = ((s as unknown as { items?: { id: string }[] }).items ?? []).length;
                      const typeInfo = getSaleTypeInfo(s);
                      const saleCashReceived = Number(s.cash_received ?? 0);
                      const saleCashChange = getCashChange(saleCashReceived, Number(s.total ?? 0));
                      return (
                        <tr key={s.id} className="hover:bg-orange-50/30 border-l-4" style={{ borderLeftColor: typeInfo.color }}>
                          <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{new Date(s.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-800">{s.customer?.name ?? <span className="font-normal text-slate-400">Público general</span>}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-black tracking-wider ${typeInfo.bg} ${typeInfo.text}`}>{typeInfo.label}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-black text-blue-700">{itemCount}</span>
                          </td>
                          <td className="px-4 py-3 text-sm font-black text-slate-900 whitespace-nowrap">
                            <div>{formatCurrency(s.total)}</div>
                            {s.payment_method === 'EFECTIVO' && saleCashReceived > 0 && (
                              <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                                Pagó {formatCurrency(saleCashReceived)} · Vuelto {formatCurrency(saleCashChange)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 italic truncate max-w-[200px]">{s.notes ?? '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEditType(s)} title="Editar tipo de venta" className="rounded-md border border-slate-200 p-1.5 text-orange-500 hover:bg-orange-50 hover:border-orange-300">
                                <Pencil size={13}/>
                              </button>
                              <button onClick={() => exportSalePdf(s)} title="Exportar PDF" className="rounded-md border border-slate-200 p-1.5 text-blue-500 hover:bg-blue-50 hover:border-blue-300">
                                <FileText size={13}/>
                              </button>
                              <button onClick={() => openSaleDetail(s)} title="Ver detalle" className="rounded-md border border-slate-200 p-1.5 text-green-500 hover:bg-green-50 hover:border-green-300">
                                <Eye size={13}/>
                              </button>
                              <button onClick={() => openDeleteSale(s)} title="Eliminar venta" className="rounded-md border border-slate-200 p-1.5 text-red-500 hover:bg-red-50 hover:border-red-300">
                                <Trash2 size={13}/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer: paginación + leyenda */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <span>{historySales.length} venta{historySales.length !== 1 ? 's' : ''}</span>
                {historySales.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage <= 1} className="rounded-md border border-slate-200 bg-white px-2 py-1 disabled:opacity-40 hover:bg-slate-100">‹</button>
                    <span className="px-2">Página {historyPage} / {totalPages}</span>
                    <button onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))} disabled={historyPage >= totalPages} className="rounded-md border border-slate-200 bg-white px-2 py-1 disabled:opacity-40 hover:bg-slate-100">›</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-green-500"/> Efectivo</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500"/> Crédito</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-purple-500"/> Saldo</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-slate-400"/> Sin costo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL GESTIONAR CLIENTE ───────────────────── */}
      {customerDetailOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight">Gestionar cliente</h3>
                <p className="text-[11px] font-bold text-orange-400">{selectedCustomer.name.toUpperCase()}</p>
              </div>
              <button onClick={() => setCustomerDetailOpen(false)} className="rounded-xl bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* 4 Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Límite</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{formatCurrency(selectedCustomer.credit_limit)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deuda actual</p>
                  <p className="mt-1 text-xl font-black text-red-500">{formatCurrency(customerDebt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Disponible</p>
                  <p className="mt-1 text-xl font-black text-green-600">{formatCurrency(Math.max(0, selectedCustomer.credit_limit - customerDebt))}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo a favor</p>
                  <p className="mt-1 text-xl font-black text-purple-600">{formatCurrency(selectedCustomer.wallet_balance)}</p>
                </div>
              </div>

              {/* 3 Paneles */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Cliente */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</h4>
                  <button disabled className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left opacity-60">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Editar datos</p>
                      <p className="text-[10px] text-slate-400">Modifica nombre, teléfono, dirección y límite</p>
                    </div>
                    <span className="text-[9px] text-slate-400">Próx.</span>
                  </button>
                  <button disabled className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left opacity-60">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Exportar PDF</p>
                      <p className="text-[10px] text-slate-400">Estado de cuenta completo</p>
                    </div>
                    <span className="text-[9px] text-slate-400">Próx.</span>
                  </button>
                </div>

                {/* Crédito */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Crédito</h4>
                  <button disabled className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left opacity-60">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Historial de abonos</p>
                      <p className="text-[10px] text-slate-400">Consulta abonos registrados</p>
                    </div>
                    <span className="text-[9px] text-slate-400">Próx.</span>
                  </button>
                  <button disabled className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left opacity-60">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Notas de crédito</p>
                      <p className="text-[10px] text-slate-400">Ventas a crédito y documentos</p>
                    </div>
                    <span className="text-[9px] text-slate-400">Próx.</span>
                  </button>
                  <button disabled className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left opacity-60">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Registrar abono</p>
                      <p className="text-[10px] text-slate-400">Captura abono para deuda</p>
                    </div>
                    <span className="text-[9px] text-slate-400">Próx.</span>
                  </button>
                </div>

                {/* Saldo a favor */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo a favor</h4>
                  <button disabled className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left opacity-60">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Recargar saldo</p>
                      <p className="text-[10px] text-slate-400">Aumenta saldo del cliente</p>
                    </div>
                    <span className="text-[9px] text-slate-400">Próx.</span>
                  </button>
                  <button disabled className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left opacity-60">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Historial de saldo</p>
                      <p className="text-[10px] text-slate-400">Aperturas, recargas, consumos</p>
                    </div>
                    <span className="text-[9px] text-slate-400">Próx.</span>
                  </button>
                  <button disabled className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left opacity-60">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Exportar historial</p>
                      <p className="text-[10px] text-slate-400">PDF con recargas y gastos</p>
                    </div>
                    <span className="text-[9px] text-slate-400">Próx.</span>
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 italic">Las acciones marcadas "Próx." se implementarán en la siguiente fase (igual que módulo materiales).</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DETALLE VENTA ────────────────────────── */}
      {saleDetailOpen && saleDetailRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Detalle de venta</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Folio {saleDetailRow.id.slice(0, 8)}</p>
              </div>
              <button onClick={() => setSaleDetailOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</p><p className="font-bold text-slate-900">{new Date(saleDetailRow.created_at).toLocaleString('es-MX')}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</p><p className="font-bold text-slate-900">{saleDetailRow.customer?.name ?? 'Público general'}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo</p>
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-black ${getSaleTypeInfo(saleDetailRow).bg} ${getSaleTypeInfo(saleDetailRow).text}`}>{getSaleTypeInfo(saleDetailRow).label}</span>
                </div>
                {saleDetailRow.coupon_code && <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cupón</p><p className="font-mono font-bold text-slate-900">{saleDetailRow.coupon_code}</p></div>}
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="py-2 text-left">Producto</th>
                  <th className="py-2 text-left">Unidad</th>
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">Precio</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {saleDetailItems.map(it => (
                    <tr key={it.id}>
                      <td className="py-2 text-slate-700">{it.product?.name ?? '—'}</td>
                      <td className="py-2 text-slate-500">{it.uom?.name ?? '—'}</td>
                      <td className="py-2 text-slate-500">{it.price_type}</td>
                      <td className="py-2 text-right text-slate-700">{it.qty}</td>
                      <td className="py-2 text-right text-slate-700">{formatCurrency(it.unit_price)}</td>
                      <td className="py-2 text-right font-bold text-slate-900">{formatCurrency(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(saleDetailRow.subtotal)}</span></div>
                {Number(saleDetailRow.discount_amount) > 0 && <div className="flex justify-between text-green-600"><span>Descuento</span><span>-{formatCurrency(saleDetailRow.discount_amount)}</span></div>}
                {Number(saleDetailRow.wallet_used) > 0 && <div className="flex justify-between text-purple-600"><span>Saldo aplicado</span><span>-{formatCurrency(saleDetailRow.wallet_used)}</span></div>}
                {Number(saleDetailRow.credit_used) > 0 && <div className="flex justify-between text-red-600"><span>Crédito aplicado</span><span>{formatCurrency(saleDetailRow.credit_used)}</span></div>}
                <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-black text-slate-900"><span>Total</span><span className="text-orange-600">{formatCurrency(saleDetailRow.total)}</span></div>
                {saleDetailRow.payment_method === 'EFECTIVO' && Number(saleDetailRow.cash_received ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between text-slate-500"><span>Pagó con</span><span>{formatCurrency(Number(saleDetailRow.cash_received ?? 0))}</span></div>
                    <div className="flex justify-between font-bold text-green-600"><span>Vuelto</span><span>{formatCurrency(getCashChange(Number(saleDetailRow.cash_received ?? 0), Number(saleDetailRow.total ?? 0)))}</span></div>
                  </>
                )}
              </div>
              {saleDetailRow.notes && <p className="text-xs italic text-slate-500">Notas: {saleDetailRow.notes}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL EDITAR TIPO DE VENTA ─────────────────── */}
      {editTypeOpen && editTypeRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-orange-500 px-6 py-4 text-white">
              <h3 className="text-base font-black uppercase tracking-tight">Editar tipo de venta</h3>
              <p className="text-[11px] font-bold opacity-90">V-{editTypeRow.id.replace(/-/g, '').slice(0, 6).toUpperCase()} · {formatCurrency(editTypeRow.total)}</p>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Cliente info */}
              {editTypeCustomerSnapshot ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">{editTypeCustomerSnapshot.name}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg bg-white p-2">
                      <p className="font-black uppercase tracking-widest text-slate-400">Saldo a favor</p>
                      <p className="mt-0.5 text-sm font-black text-purple-600">{formatCurrency(editTypeCustomerSnapshot.wallet_balance)}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="font-black uppercase tracking-widest text-slate-400">Crédito disp.</p>
                      <p className="mt-0.5 text-sm font-black text-blue-600">{formatCurrency(editTypeCustomerSnapshot.credit_limit)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">⚠ Venta sin cliente vinculado. Solo se puede cambiar entre EFECTIVO ↔ EFECTIVO.</p>
              )}

              {/* Selector nuevo tipo */}
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nuevo tipo de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['EFECTIVO', 'CREDITO'] as const).map(t => {
                    const active = editTypeValue === t;
                    const disabled = t === 'CREDITO' && !editTypeCustomerSnapshot;
                    return (
                      <button
                        key={t}
                        disabled={disabled}
                        onClick={() => setEditTypeValue(t)}
                        className={`rounded-2xl border-2 px-4 py-3 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                          active
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <p className={`text-xs font-black uppercase tracking-widest ${active ? 'text-orange-700' : 'text-slate-600'}`}>{t}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {t === 'EFECTIVO' ? 'Pago completo / al contado' : 'Se descuenta del crédito'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Saldo a favor — visible si cliente tiene wallet_enabled o la venta ya usaba wallet */}
              {editTypeCustomerSnapshot?.wallet_enabled && (() => {
                const oldWalletUsed = Number(editTypeRow.wallet_used ?? 0);
                // tras rollback el cliente recupera el wallet_used → balance disponible = balance + oldWalletUsed
                const effectiveBalance = editTypeCustomerSnapshot.wallet_balance + oldWalletUsed;
                if (effectiveBalance <= 0) return null;
                const maxApply = Math.min(effectiveBalance, Number(editTypeRow.total));
                return (
                  <div className={`rounded-2xl border-2 p-3 transition-colors ${editTypeUseWallet ? 'border-purple-400 bg-purple-50' : 'border-slate-200 bg-white'}`}>
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Wallet size={16} className="text-purple-500"/>
                        <div>
                          <p className="text-sm font-bold text-slate-800">Aplicar saldo a favor</p>
                          <p className="text-[10px] text-slate-500">
                            Disponible tras revertir: {formatCurrency(effectiveBalance)}
                            {oldWalletUsed > 0 && <span className="ml-1 italic">(esta venta usó {formatCurrency(oldWalletUsed)})</span>}
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                        checked={editTypeUseWallet}
                        onChange={e => {
                          setEditTypeUseWallet(e.target.checked);
                          if (e.target.checked) setEditTypeWalletAmount(String(maxApply));
                        }}
                      />
                    </label>
                    {editTypeUseWallet && (
                      <input
                        type="number" min="0" step="0.01" max={maxApply}
                        className="mt-3 w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-purple-400"
                        value={editTypeWalletAmount}
                        onChange={e => setEditTypeWalletAmount(e.target.value)}
                      />
                    )}
                  </div>
                );
              })()}

              {/* Observación obligatoria */}
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Observación <span className="text-red-500">(obligatoria)</span>
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
                  placeholder="Explica por qué se está modificando el tipo de venta…"
                  value={editTypeObservation}
                  onChange={e => setEditTypeObservation(e.target.value)}
                />
              </div>

              {/* Info rollback */}
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-700 leading-relaxed">
                <strong>Rollback automático:</strong> se revierten saldo y crédito de la venta anterior, luego se aplica el nuevo método con saldo/crédito del cliente actual.
              </div>

              {editTypeError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{editTypeError}</p>
              )}
            </div>

            {/* Footer botones */}
            <div className="flex gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                onClick={() => setEditTypeOpen(false)}
                disabled={editTypeSaving}
                className="flex-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={saveEditType}
                disabled={editTypeSaving || !editTypeObservation.trim()}
                className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-orange-600 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-orange-600/20 hover:bg-orange-500 disabled:opacity-40"
              >
                {editTypeSaving && <Loader2 size={14} className="animate-spin"/>}
                {editTypeSaving ? 'Aplicando…' : 'Guardar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ELIMINAR VENTA ───────────────────────── */}
      {deleteSaleOpen && deleteSaleRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-500"><Trash2 size={18}/></div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Eliminar venta</h3>
                <p className="text-[10px] text-slate-500">Folio {deleteSaleRow.id.slice(0, 8)} · {formatCurrency(deleteSaleRow.total)}</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Motivo de eliminación *</label>
              <textarea
                rows={3}
                value={deleteSaleNote}
                onChange={e => setDeleteSaleNote(e.target.value)}
                placeholder="Explica por qué se elimina…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none"
              />
              <p className="rounded-xl bg-red-50 px-3 py-2 text-[11px] text-red-700">⚠ La venta quedará marcada como eliminada. El stock no se revierte automáticamente.</p>
            </div>
            <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
              <button onClick={() => setDeleteSaleOpen(false)} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={confirmDeleteSale} disabled={deletingSale || !deleteSaleNote.trim()} className="flex-[2] rounded-xl bg-red-500 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-600 disabled:opacity-40">
                {deletingSale ? 'Eliminando…' : 'Eliminar venta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {printModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <Loader2 size={28} className="animate-spin" />
            </div>
            <h3 className="mt-4 text-base font-black uppercase tracking-tight text-slate-900">Generando documento</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              La nota de venta se abrirá para imprimir en unos segundos.
            </p>
          </div>
        </div>
      )}

      {feedback && <Toast type={feedback.type} message={feedback.msg} onClose={() => setFeedback(null)} />}
    </div>
  );
};

export default VinosPOSScreen;

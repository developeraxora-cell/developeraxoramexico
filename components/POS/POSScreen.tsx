import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Eye, FileDown, RotateCcw } from 'lucide-react';
import { PDFDocument, rgb } from 'pdf-lib';
import { Branch, Product as PosProduct, CartItem, ProductConversion, User } from '../../types';
import { UNITS } from '../../constants';
import { convert, getPriceForUnit } from '../../services/conversionEngine';
import { creditService, type CreditCustomer, type CreditNoteWithStatus, type CreditPaymentMethod } from '../../services/credit/credit.service';
import { catalogService, type Product as CatalogProduct, type ProductUom, type Uom } from '../../services/inventory/catalog.service';
import { purchasesService } from '../../services/inventory/purchases.service';
import { supabase } from '../../services/supabaseClient';
import { formatCurrency, formatNumber } from '../../services/currency';
import { logMaterialsAudit } from '../../services/audit/audit.service';
import FeedbackModal, { type FeedbackType } from '../common/FeedbackModal';
import CustomerSearchSelect from '../common/CustomerSearchSelect';

interface POSProps {
  products: PosProduct[];
  conversions: ProductConversion[];
  selectedBranchId: string;
  branches: Branch[];
  currentUser: User;
}

interface SpecialPriceModalState {
  itemId: string;
  itemName: string;
  currentPrice: number;
  currentNote: string;
}

let watermarkPngBytesPromise: Promise<ArrayBuffer | null> | null = null;
const SALES_HISTORY_PAGE_SIZE = 5;

const getWatermarkPngBytes = async () => {
  if (!watermarkPngBytesPromise) {
    watermarkPngBytesPromise = fetch('/lopar-watermark.png')
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null);
  }
  return watermarkPngBytesPromise;
};

const POSScreen: React.FC<POSProps> = ({
  products,
  conversions,
  selectedBranchId,
  branches,
  currentUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [branchProducts, setBranchProducts] = useState<CatalogProduct[]>([]);
  const [branchStock, setBranchStock] = useState<Record<string, number>>({});
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [defaultSaleUomByProduct, setDefaultSaleUomByProduct] = useState<Record<string, ProductUom>>({});
  const [uomsById, setUomsById] = useState<Record<string, Uom>>({});
  const [saleUomsByProduct, setSaleUomsByProduct] = useState<Record<string, ProductUom[]>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'CREDITO'>('EFECTIVO');
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomer[]>([]);
  const [isCustomerSearchLoading, setIsCustomerSearchLoading] = useState(false);
  const [creditCheck, setCreditCheck] = useState<{
    allowedCredit: boolean;
    reason: 'VENCIDAS' | 'LIMITE' | null;
    policy: CreditCustomer['policy'];
    allowCash: boolean;
    vencidas: CreditNoteWithStatus[];
    saldo_total: number;
    disponible: number;
    limite: number;
  } | null>(null);
  const [isCreditBlockedOpen, setIsCreditBlockedOpen] = useState(false);
  const [isCreditLimitOpen, setIsCreditLimitOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<CreditPaymentMethod>('EFECTIVO');
  const [noteRows, setNoteRows] = useState<Record<string, number>>({});
  const [isSaleTypeOpen, setIsSaleTypeOpen] = useState(false);
  const [isUnitSelectOpen, setIsUnitSelectOpen] = useState(false);
  const [isSaleUomSelectOpen, setIsSaleUomSelectOpen] = useState(false);
  const [pendingCatalogProduct, setPendingCatalogProduct] = useState<CatalogProduct | null>(null);
  const [pendingPrice, setPendingPrice] = useState(0);
  const [pendingStockValue, setPendingStockValue] = useState<number | undefined>(undefined);
  const [saleUomOptions, setSaleUomOptions] = useState<ProductUom[]>([]);
  const [saleUomObservation, setSaleUomObservation] = useState('');
  const [saleUomObservationError, setSaleUomObservationError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('loading');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [isSalesHistoryOpen, setIsSalesHistoryOpen] = useState(false);
  const [salesHistory, setSalesHistory] = useState<Array<{
    id: string;
    created_at: string;
    reference: string | null;
    notes: string | null;
    direccion_cliente: string | null;
    nombre_cliente: string | null;
    created_by: string | null;
    items_count: number;
    total_amount: number;
  }>>([]);
  const [isSalesHistoryLoading, setIsSalesHistoryLoading] = useState(false);
  const [salesHistoryPage, setSalesHistoryPage] = useState(1);
  const [salesHistoryTotal, setSalesHistoryTotal] = useState(0);
  const [salesHistoryDateFrom, setSalesHistoryDateFrom] = useState('');
  const [salesHistoryDateTo, setSalesHistoryDateTo] = useState('');
  const [salesHistorySaleNumber, setSalesHistorySaleNumber] = useState('');
  const [isSaleDetailOpen, setIsSaleDetailOpen] = useState(false);
  const [saleDetail, setSaleDetail] = useState<{
    id: string;
    created_at: string;
    nombre_cliente: string | null;
  } | null>(null);
  const [saleDetailItems, setSaleDetailItems] = useState<Array<{
    id: string;
    qty: number;
    unit_price: number;
    qty_base: number;
    factor_used: number;
    product_name: string | null;
    product_sku: string | null;
    uom_name: string | null;
    uom_code: string | null;
    custom_label: string | null;
  }>>([]);
  const [isSaleDetailLoading, setIsSaleDetailLoading] = useState(false);
  const [specialPriceModal, setSpecialPriceModal] = useState<SpecialPriceModalState | null>(null);
  const [specialPriceValue, setSpecialPriceValue] = useState('');
  const [specialPriceNote, setSpecialPriceNote] = useState('');
  const [specialPriceError, setSpecialPriceError] = useState<string | null>(null);

  const activeBranchProducts = useMemo(
    () => branchProducts.filter((product) => product.is_active !== false),
    [branchProducts]
  );

  const visibleBranchProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = activeBranchProducts.filter((product) => {
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? '').toLowerCase().includes(term) ||
        (product.barcode ?? '').toLowerCase().includes(term)
      );
    });
    return filtered.slice(0, 6);
  }, [activeBranchProducts, searchTerm]);

  const showFeedback = (type: FeedbackType, title: string, description?: string) => {
    setFeedbackType(type);
    setFeedbackTitle(title);
    setFeedbackDescription(description ?? '');
    setFeedbackOpen(true);
  };

  const closeFeedback = () => {
    if (feedbackType === 'loading') return;
    setFeedbackOpen(false);
  };

  const applyLocalSaleStock = (items: CartItem[]) => {
    const deltaByProduct = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.productId] = (acc[item.productId] ?? 0) + Number(item.qtyBase ?? 0);
      return acc;
    }, {});

    setBranchStock((prev) => {
      const next = { ...prev };
      Object.entries(deltaByProduct).forEach(([productId, delta]) => {
        const current = Number(next[productId] ?? 0);
        next[productId] = Math.max(0, current - delta);
      });
      return next;
    });
  };

  const resolveProductForCart = useCallback((productId: string) => {
    return branchProducts.find((p) => String(p.id) === String(productId))
      ?? (products ?? []).find((p) => String(p.id) === String(productId));
  }, [branchProducts, products]);

  const resolveBasePriceForSaleType = useCallback((product: any, saleType: 'MAYOR' | 'MENOR') => {
    return Number(
      saleType === 'MAYOR'
        ? product?.wholesale_price ?? product?.pricePerBaseUnit ?? 0
        : product?.retail_price ?? product?.precio ?? product?.pricePerBaseUnit ?? 0
    );
  }, []);

  const resolveStandardUnitPrice = useCallback((
    productId: string,
    saleType: 'MAYOR' | 'MENOR' | undefined,
    factor: number,
    fallbackUnitPrice: number
  ) => {
    const product = resolveProductForCart(productId);
    if (!product) return Number(fallbackUnitPrice ?? 0);
    const safeFactor = Number(factor || 1);
    return resolveBasePriceForSaleType(product, saleType ?? 'MENOR') * safeFactor;
  }, [resolveBasePriceForSaleType, resolveProductForCart]);

  const branchId = useMemo(() => {
    const match = branches.find((b) => b.id === selectedBranchId);
    if (match?.dbId !== undefined) return String(match.dbId);
    return selectedBranchId || '';
  }, [branches, selectedBranchId]);
  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );
  const salesHistoryTotalPages = Math.max(1, Math.ceil(salesHistoryTotal / SALES_HISTORY_PAGE_SIZE));

  const loadSalesHistory = useCallback(async () => {
    if (!branchId) return;
    setIsSalesHistoryLoading(true);
    try {
      const saleNumberRaw = salesHistorySaleNumber.trim();
      const parsedSaleNumber = Number(saleNumberRaw);
      if (saleNumberRaw && (!Number.isInteger(parsedSaleNumber) || parsedSaleNumber <= 0)) {
        setSalesHistory([]);
        setSalesHistoryTotal(0);
        return;
      }

      let countQuery = supabase
        .from('inventory_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .eq('type', 'SALE');

      if (salesHistoryDateFrom) {
        countQuery = countQuery.gte('created_at', `${salesHistoryDateFrom}T00:00:00`);
      }
      if (salesHistoryDateTo) {
        countQuery = countQuery.lte('created_at', `${salesHistoryDateTo}T23:59:59.999`);
      }
      if (saleNumberRaw) {
        countQuery = countQuery.eq('id', parsedSaleNumber);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      const from = (salesHistoryPage - 1) * SALES_HISTORY_PAGE_SIZE;
      const to = from + SALES_HISTORY_PAGE_SIZE - 1;

      let transactionsQuery = supabase
        .from('inventory_transactions')
        .select('id, reference, notes, direccion_cliente, created_at, nombre_cliente, created_by')
        .eq('branch_id', branchId)
        .eq('type', 'SALE');

      if (salesHistoryDateFrom) {
        transactionsQuery = transactionsQuery.gte('created_at', `${salesHistoryDateFrom}T00:00:00`);
      }
      if (salesHistoryDateTo) {
        transactionsQuery = transactionsQuery.lte('created_at', `${salesHistoryDateTo}T23:59:59.999`);
      }
      if (saleNumberRaw) {
        transactionsQuery = transactionsQuery.eq('id', parsedSaleNumber);
      }

      const { data: transactions, error: txError } = await transactionsQuery
        .order('created_at', { ascending: false })
        .range(from, to);

      if (txError) throw txError;

      const transactionIds = (transactions ?? []).map((tx) => tx.id);
      let itemsSummary: Record<string, { count: number; total: number }> = {};

      if (transactionIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from('inventory_transaction_items')
          .select('transaction_id, qty, unit_price')
          .in('transaction_id', transactionIds);

        if (itemsError) throw itemsError;

        itemsSummary = (items ?? []).reduce<Record<string, { count: number; total: number }>>((acc, item) => {
          const current = acc[item.transaction_id] ?? { count: 0, total: 0 };
          current.count += 1;
          current.total += Number(item.qty) * Number(item.unit_price || 0);
          acc[item.transaction_id] = current;
          return acc;
        }, {});
      }

      const formatted = (transactions ?? []).map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        notes: tx.notes,
        direccion_cliente: tx.direccion_cliente ?? null,
        nombre_cliente: tx.nombre_cliente ?? null,
        created_by: tx.created_by ?? null,
        created_at: tx.created_at,
        items_count: itemsSummary[tx.id]?.count ?? 0,
        total_amount: itemsSummary[tx.id]?.total ?? 0,
      }));

      setSalesHistory(formatted);
      setSalesHistoryTotal(Number(count ?? 0));
    } catch {
      setSalesHistory([]);
      setSalesHistoryTotal(0);
    } finally {
      setIsSalesHistoryLoading(false);
    }
  }, [branchId, salesHistoryDateFrom, salesHistoryDateTo, salesHistoryPage, salesHistorySaleNumber]);

  const openSaleDetail = async (sale: { id: string; created_at: string; nombre_cliente: string | null }) => {
    setSaleDetail(sale);
    setIsSaleDetailOpen(true);
    setIsSaleDetailLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_transaction_items')
        .select(`
          id,
          qty,
          unit_price,
          qty_base,
          factor_used,
          products ( name, sku, attrs ),
          product_uoms ( uom_id, uoms ( name, code ) )
        `)
        .eq('transaction_id', sale.id);

      if (error) throw error;

      const normalized = (data ?? []).map((row: any) => {
        const attrs = row.products?.attrs ?? {};
        const factorUsed = Number(row.factor_used ?? 1);
        let customLabel: string | null = null;

        if (attrs && typeof attrs === 'object') {
          for (const [key, value] of Object.entries(attrs)) {
            const numericValue = Number(value);
            if (!Number.isNaN(numericValue) && numericValue === factorUsed) {
              customLabel = key;
              break;
            }
          }
        }

        return {
          id: row.id,
          qty: Number(row.qty ?? 0),
          unit_price: Number(row.unit_price ?? 0),
          qty_base: Number(row.qty_base ?? 0),
          factor_used: factorUsed,
          product_name: row.products?.name ?? null,
          product_sku: row.products?.sku ?? null,
          uom_name: row.product_uoms?.uoms?.name ?? null,
          uom_code: row.product_uoms?.uoms?.code ?? null,
          custom_label: customLabel,
        };
      });

      setSaleDetailItems(normalized);
    } catch {
      setSaleDetailItems([]);
    } finally {
      setIsSaleDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!isSalesHistoryOpen) return;
    void loadSalesHistory();
  }, [isSalesHistoryOpen, loadSalesHistory]);

  const openSpecialPriceModal = (item: CartItem) => {
    setSpecialPriceModal({
      itemId: item.id,
      itemName: item.name,
      currentPrice: Number(item.specialUnitPrice ?? item.unitPrice ?? 0),
      currentNote: item.specialPriceNote ?? '',
    });
    setSpecialPriceValue(String(Number(item.specialUnitPrice ?? item.unitPrice ?? 0)));
    setSpecialPriceNote(item.specialPriceNote ?? '');
    setSpecialPriceError(null);
  };

  const closeSpecialPriceModal = () => {
    setSpecialPriceModal(null);
    setSpecialPriceValue('');
    setSpecialPriceNote('');
    setSpecialPriceError(null);
  };

  const handleSaveSpecialPrice = () => {
    if (!specialPriceModal) return;
    const parsedPrice = Number(String(specialPriceValue).replace(/,/g, '').trim());
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setSpecialPriceError('Ingrese un precio especial válido.');
      return;
    }
    const note = specialPriceNote.trim();
    if (!note) {
      setSpecialPriceError('La observación es obligatoria para usar precio especial.');
      return;
    }

    setCart((prev) => prev.map((item) => (
      item.id === specialPriceModal.itemId
        ? {
            ...item,
            specialUnitPrice: parsedPrice,
            specialPriceNote: note,
            unitPrice: parsedPrice,
            subtotal: Number(item.qty ?? 0) * parsedPrice,
          }
        : item
    )));

    closeSpecialPriceModal();
  };

  const clearSpecialPrice = (itemId: string) => {
    setCart((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      const standardUnitPrice = resolveStandardUnitPrice(
        item.productId,
        item.saleType,
        Number(item.factorUsed ?? 1),
        Number(item.unitPrice ?? 0)
      );
      return {
        ...item,
        specialUnitPrice: null,
        specialPriceNote: null,
        unitPrice: standardUnitPrice,
        subtotal: Number(item.qty ?? 0) * standardUnitPrice,
      };
    }));
  };

  const cartTotal = cart.reduce((acc, curr) => acc + curr.subtotal, 0);
  const formatLocalDateTime = (value: string) => {
    const normalized = value.endsWith('Z') ? value : `${value}Z`;
    return new Date(normalized).toLocaleString();
  };
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const openPdfPreview = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const previewWindow = window.open('', '_blank');

    if (previewWindow && !previewWindow.closed) {
      try {
        previewWindow.document.title = filename;
        previewWindow.location.href = url;
      } catch {
        downloadBlob(blob, filename);
      }
    } else {
      downloadBlob(blob, filename);
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const toFileToken = (value: string | null | undefined, fallback: string) => {
    const source = String(value ?? '');
    const normalized = typeof source.normalize === 'function' ? source.normalize('NFD') : source;
    const cleaned = normalized
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase();
    return cleaned || fallback;
  };
  const buildSalePdfFilename = (branchName: string | null | undefined, saleId: string) => {
    const moduleToken = 'MATERIALES';
    const branchToken = toFileToken(branchName, 'SUCURSAL');
    const saleToken = toFileToken(saleId, '0');
    return `${moduleToken}-${branchToken}-${saleToken}.pdf`;
  };
  const getPresentationLabelFromRow = (factorUsed: number, row: any) => {
    const uomCode = row.product_uoms?.uoms?.code ?? row.product_uoms?.uoms?.name ?? 'UND';
    const safeFactor = Number(factorUsed ?? 1);
    return safeFactor > 1 ? `${uomCode} (${safeFactor})` : uomCode;
  };
  const getPresentationLabelFromCart = (item: CartItem) => {
    if (item.customLabel) return item.customLabel;

    const saleUoms = saleUomsByProduct[item.productId] ?? [];
    const matched =
      saleUoms.find((uom) => String(uom.id) === String(item.productUomId))
      ?? defaultSaleUomByProduct[item.productId];

    if (matched) {
      const code = matched.uom?.code ?? matched.uom?.name ?? 'UND';
      const factor = Number(matched.factor_to_base ?? item.factorUsed ?? 1);
      return factor > 1 ? `${code} (${factor})` : code;
    }

    const product = branchProducts.find((p) => String(p.id) === String(item.productId));
    const baseUom = product?.base_uom_id ? uomsById[String(product.base_uom_id)] : null;
    return baseUom?.code ?? baseUom?.name ?? 'UND';
  };
  const generateSalePdf = async (input: {
    saleId: string;
    createdAt: string;
    items: Array<{
      name: string;
      presentation: string;
      qty: number;
      unitPrice: number;
      subtotal: number;
    }>;
    paymentMethod: 'EFECTIVO' | 'CREDITO';
    customerName: string;
    customerAddress: string;
    cashierName: string;
    branchName: string;
  }) => {
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont('Helvetica');
    const fontBold = await pdfDoc.embedFont('Helvetica-Bold');
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    let watermarkImage: any = null;
    try {
      const logoBytes = await getWatermarkPngBytes();
      if (logoBytes) {
        watermarkImage = await pdfDoc.embedPng(logoBytes);
      }
    } catch {
      watermarkImage = null;
    }

    if (watermarkImage) {
      const dims = watermarkImage.scale(0.5);
      page.drawImage(watermarkImage, {
        x: (width - dims.width) / 2,
        y: (height - dims.height) / 2 - 40,
        width: dims.width,
        height: dims.height,
        opacity: 0.12,
      });
    }

    const marginX = 30;
    const outerY = 75;
    const outerTop = height - 70;
    const outerHeight = outerTop - outerY;
    page.drawRectangle({
      x: marginX,
      y: outerY,
      width: width - marginX * 2,
      height: outerHeight,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });

    const title = `MATERIALES ${(input.branchName || 'SUCURSAL').toUpperCase()}`;
    const titleSize = 14;
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 42,
      size: titleSize,
      font: fontBold,
    });

    const infoTop = height - 105;
    const rightInfoX = width - marginX - 155;
    page.drawText(`FECHA:  ${formatLocalDateTime(input.createdAt)}`, { x: marginX + 10, y: infoTop, size: 10, font: fontBold });
    page.drawText(`CLIENTE:  ${input.customerName.toUpperCase()}`, { x: marginX + 10, y: infoTop - 24, size: 10, font: fontBold });
    page.drawText(`DIRECCION:  ${input.customerAddress.toUpperCase()}`, { x: marginX + 10, y: infoTop - 48, size: 10, font: fontBold });
    page.drawText(input.paymentMethod === 'CREDITO' ? 'CREDITO' : 'LIQUIDADO', { x: marginX + 10, y: infoTop - 72, size: 10, font: fontBold });
    page.drawText('NOTA DE VENTA', { x: rightInfoX + 18, y: infoTop, size: 12, font: fontBold });
    page.drawText(String(input.saleId), { x: rightInfoX + 70, y: infoTop - 24, size: 12, font: fontBold });
    page.drawText(`CAJERO:  ${input.cashierName.toUpperCase()}`, { x: rightInfoX, y: infoTop - 72, size: 10, font: fontBold });

    const tableTop = infoTop - 120;
    const tableWidth = width - marginX * 2;
    const colRatios = [0.36, 0.2, 0.14, 0.15, 0.15];
    const colXs = colRatios.reduce<number[]>((acc, ratio) => {
      const prev = acc[acc.length - 1];
      acc.push(prev + tableWidth * ratio);
      return acc;
    }, [marginX]);
    const drawCellText = (text: string, col: number, y: number, size: number, font: any, color = rgb(0, 0, 0)) => {
      const xStart = colXs[col];
      const xEnd = colXs[col + 1];
      const colWidth = xEnd - xStart;
      const available = colWidth - 6;
      let safe = text ?? '';
      while (safe.length > 0 && font.widthOfTextAtSize(safe, size) > available) {
        safe = `${safe.slice(0, -1)}`;
      }
      if (safe !== text && safe.length > 3) safe = `${safe.slice(0, -3)}...`;
      const textWidth = font.widthOfTextAtSize(safe, size);
      const textX = xStart + Math.max(3, (colWidth - textWidth) / 2);
      page.drawText(safe, { x: textX, y, size, font, color });
    };

    page.drawRectangle({ x: marginX, y: tableTop - 16, width: tableWidth, height: 16, color: rgb(0, 0, 0) });
    ['PRODUCTO', 'PRESENTACION', 'CANTIDAD', 'PRECIO UNITARIO', 'SUBTOTAL'].forEach((header, idx) => {
      drawCellText(header, idx, tableTop - 12, 8, fontBold, rgb(1, 1, 1));
    });

    let rowY = tableTop - 32;
    const maxRows = Math.min(14, input.items.length);
    let total = 0;
    for (let i = 0; i < maxRows; i += 1) {
      const item = input.items[i];
      const subtotal = Number(item.subtotal ?? (item.qty * item.unitPrice));
      total += subtotal;
      const rowHeight = 18;
      page.drawRectangle({
        x: marginX,
        y: rowY - 2,
        width: tableWidth,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: rgb(0, 0, 0),
      });
      for (let c = 1; c < colXs.length - 1; c += 1) {
        page.drawLine({
          start: { x: colXs[c], y: rowY - 2 },
          end: { x: colXs[c], y: rowY - 2 + rowHeight },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }
      drawCellText(item.name.toUpperCase(), 0, rowY + 4, 8, fontBold);
      drawCellText(item.presentation.toUpperCase(), 1, rowY + 4, 8, fontBold);
      drawCellText(Number(item.qty).toFixed(2), 2, rowY + 4, 8, fontBold);
      drawCellText(formatCurrency(Number(item.unitPrice)), 3, rowY + 4, 8, fontBold);
      drawCellText(formatCurrency(subtotal), 4, rowY + 4, 8, fontBold);
      rowY -= rowHeight;
    }

    page.drawText(`TOTAL:  ${formatCurrency(total)}`, { x: width - marginX - 210, y: 108, size: 20, font: fontBold });
    page.drawText('KILOMETRO, 3 LAS CANOAS, JESUS MARIA JALISCO   (348) 148 8326', {
      x: marginX + 80,
      y: 64,
      size: 9,
      font: fontBold,
    });
    page.drawText('Página 1', { x: width - marginX - 54, y: 64, size: 9, font: fontBold });

    const pdfBytes = await pdfDoc.save();
    const filename = buildSalePdfFilename(input.branchName, input.saleId);
    openPdfPreview(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
  };
  const handleDownloadSalePdf = async (sale: {
    id: string;
    created_at: string;
    nombre_cliente: string | null;
    direccion_cliente: string | null;
    created_by: string | null;
  }) => {
    showFeedback('loading', 'Generando PDF', 'Preparando documento de venta...');
    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from('inventory_transaction_items')
        .select(`
          qty,
          unit_price,
          factor_used,
          products ( name ),
          product_uoms ( uoms ( name, code ) )
        `)
        .eq('transaction_id', sale.id);
      if (itemsError) throw itemsError;

      const { data: creditNote } = await supabase
        .from('credit_notes')
        .select('id')
        .eq('inventory_transaction_id', sale.id)
        .maybeSingle();

      const lines = (itemsData ?? []).map((row: any) => {
        const factorUsed = Number(row.factor_used ?? 1);
        const qty = Number(row.qty ?? 0);
        const unitPrice = Number(row.unit_price ?? 0);
        return {
          name: row.products?.name ?? 'PRODUCTO',
          presentation: getPresentationLabelFromRow(factorUsed, row),
          qty,
          unitPrice,
          subtotal: qty * unitPrice,
        };
      });

      await generateSalePdf({
        saleId: sale.id,
        createdAt: sale.created_at,
        items: lines,
        paymentMethod: creditNote?.id ? 'CREDITO' : 'EFECTIVO',
        customerName: sale.nombre_cliente ?? 'PUBLICO GENERAL',
        customerAddress: sale.direccion_cliente ?? '-',
        cashierName: sale.created_by || currentUser.name,
        branchName: selectedBranch?.name ?? selectedBranchId ?? 'SUCURSAL',
      });
      setFeedbackOpen(false);
    } catch (err) {
      setFeedbackOpen(false);
      console.error('Error exporting sale PDF:', err);
      showFeedback('error', 'No se pudo exportar', 'No se pudo generar el PDF de la venta.');
    }
  };

  const handleCustomerSearch = useCallback(async (query: string) => {
    const term = query.trim();
    if (!branchId || term.length < 3) {
      setCreditCustomers([]);
      setIsCustomerSearchLoading(false);
      return;
    }

    setIsCustomerSearchLoading(true);
    try {
      const list = await creditService.searchCustomersByBranch(branchId, term);
      setCreditCustomers(list);
    } catch {
      setCreditCustomers([]);
    } finally {
      setIsCustomerSearchLoading(false);
    }
  }, [branchId]);

  const loadBranchCatalog = useCallback(async () => {
    if (!branchId) {
      setBranchProducts([]);
      setBranchStock({});
      setDefaultSaleUomByProduct({});
      setSaleUomsByProduct({});
      return;
    }
    setIsCatalogLoading(true);
    try {
      const [productsList, stockRows, uomsList] = await Promise.all([
        catalogService.listProductsByBranch(branchId),
        catalogService.listStockByBranch(branchId),
        catalogService.listUoms(),
      ]);
      setBranchProducts(productsList);
      const stockMap = stockRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.product_id] = Number(row.qty_base ?? 0);
        return acc;
      }, {});
      setBranchStock(stockMap);
      const uomMap = (uomsList ?? []).reduce<Record<string, Uom>>((acc, uom) => {
        acc[String(uom.id)] = uom;
        return acc;
      }, {});
      setUomsById(uomMap);

      const productIds = productsList.map((p) => String(p.id));
      const defaultSaleUoms = await catalogService.listDefaultSaleUoms(productIds);
      const saleUomMap = defaultSaleUoms.reduce<Record<string, ProductUom>>((acc, uom) => {
        acc[String(uom.product_id)] = uom;
        return acc;
      }, {});
      setDefaultSaleUomByProduct(saleUomMap);
      setSaleUomsByProduct({});

    } catch {
      setBranchProducts([]);
      setBranchStock({});
      setDefaultSaleUomByProduct({});
      setUomsById({});
      setSaleUomsByProduct({});
    } finally {
      setIsCatalogLoading(false);
    }
  }, [branchId]);

  const ensureSaleUoms = useCallback(async (productId: string) => {
    if (saleUomsByProduct[productId]) return;
    try {
      const uoms = await catalogService.listProductUoms(productId);
      setSaleUomsByProduct((prev) => ({
        ...prev,
        [productId]: uoms,
      }));
    } catch {
      setSaleUomsByProduct((prev) => ({
        ...prev,
        [productId]: [],
      }));
    }
  }, [saleUomsByProduct]);

  useEffect(() => {
    loadBranchCatalog();
  }, [loadBranchCatalog]);

  useEffect(() => {
    setSelectedCustomer(null);
    setCreditCustomers([]);
    setCreditCheck(null);
    setPaymentMethod('EFECTIVO');
    setIsCustomerSearchLoading(false);
  }, [branchId]);

  const runCreditCheck = useCallback(async () => {
    if (!selectedCustomer) return null;
    const result = await creditService.canSellOnCredit({
      customer: selectedCustomer,
      totalVenta: cartTotal,
    });
    setCreditCheck(result);
    return result;
  }, [selectedCustomer, cartTotal]);

  const handleSelectPaymentMethod = async (method: 'EFECTIVO' | 'CREDITO') => {
    if (method === 'CREDITO') {
      if (!selectedCustomer) {
        alert('⚠️ Seleccione un cliente para habilitar crédito.');
        return;
      }
      const result = await runCreditCheck();
      if (!result) return;
      if (!result.allowedCredit) {
        if (result.reason === 'VENCIDAS') {
          setIsCreditBlockedOpen(true);
        } else if (result.reason === 'LIMITE') {
          setIsCreditLimitOpen(true);
        }
        return;
      }
    }
    setPaymentMethod(method);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!branchId) {
      showFeedback('alert', 'Sucursal requerida', 'Seleccione una sucursal antes de vender.');
      return;
    }
    const missingUom = cart.find((item) => !item.productUomId);
    if (missingUom) {
      showFeedback('alert', 'Unidad de venta faltante', `El producto ${missingUom.name} no tiene UOM de venta.`);
      return;
    }

    if (paymentMethod === 'CREDITO') {
      if (!selectedCustomer) {
        alert('⚠️ Debe seleccionar un cliente para vender a crédito.');
        return;
      }
      const result = await runCreditCheck();
      if (!result?.allowedCredit) {
        if (result?.reason === 'VENCIDAS') setIsCreditBlockedOpen(true);
        if (result?.reason === 'LIMITE') setIsCreditLimitOpen(true);
        return;
      }
    }

    try {
      const saleCartSnapshot = cart.map((item) => ({ ...item }));
      const paymentMethodSnapshot = paymentMethod;
      const customerSnapshot = selectedCustomer;
      const totalSnapshot = cartTotal;
      const specialPriceItems = saleCartSnapshot.filter((item) => Number(item.specialUnitPrice ?? 0) > 0);
      const specialPriceJustification = specialPriceItems.length > 0
        ? specialPriceItems
            .map((item) => `${item.name}: ${formatCurrency(Number(item.unitPrice ?? 0))} - ${item.specialPriceNote?.trim() || 'Sin observación'}`)
            .join(' | ')
        : null;
      const pdfPayload = {
        saleId: '',
        createdAt: '',
        items: saleCartSnapshot.map((item) => ({
          name: item.name,
          presentation: getPresentationLabelFromCart(item),
          qty: Number(item.qty ?? 0),
          unitPrice: Number(item.unitPrice ?? 0),
          subtotal: Number(item.subtotal ?? 0),
        })),
        paymentMethod: paymentMethodSnapshot,
        customerName: customerSnapshot?.name ?? 'PUBLICO GENERAL',
        customerAddress: customerSnapshot?.address ?? '-',
        cashierName: currentUser.name,
        branchName: selectedBranch?.name ?? selectedBranchId ?? 'SUCURSAL',
      };

      showFeedback('loading', 'Procesando pago', 'Registrando venta...');
      const transaction = await purchasesService.createSale({
        branch_id: branchId,
        reference: null,
        notes: null,
        created_by: currentUser.id,
        nombre_cliente: customerSnapshot?.name || null,
        direccion_cliente: customerSnapshot?.address || null,
        cartItems: saleCartSnapshot.map((item) => ({
          product_id: item.productId,
          product_uom_id: item.productUomId ?? '',
          qty: item.qty,
          factor_used: item.factorUsed ?? 1,
          qty_base: item.qtyBase,
          unit_price: item.unitPrice,
          barcode_scanned: item.barcodeScanned ?? null,
        })),
      });

      logMaterialsAudit({
        branch_id: branchId,
        branch_name: selectedBranch?.name ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        action_type: 'VENTA',
        entity_type: 'venta',
        entity_id: String(transaction.id),
        description: `Venta registrada${customerSnapshot?.name ? ` para ${customerSnapshot.name}` : ''}${specialPriceItems.length > 0 ? ' con precio especial' : ''}`,
        justification: specialPriceJustification,
        new_data: {
          branch_id: branchId,
          payment_method: paymentMethodSnapshot,
          customer_id: customerSnapshot?.id ?? null,
          customer_name: customerSnapshot?.name ?? null,
          customer_address: customerSnapshot?.address ?? null,
          total_amount: totalSnapshot,
          special_price_items: specialPriceItems.map((item) => ({
            product_id: item.productId,
            product_name: item.name,
            qty: item.qty,
            unit_price: item.unitPrice,
            note: item.specialPriceNote ?? null,
          })),
          items: saleCartSnapshot.map((item) => ({
            product_id: item.productId,
            product_name: item.name,
            qty: item.qty,
            qty_base: item.qtyBase,
            factor_used: item.factorUsed,
            unit_price: item.unitPrice,
            product_uom_id: item.productUomId ?? null,
            special_unit_price: item.specialUnitPrice ?? null,
            special_price_note: item.specialPriceNote ?? null,
          })),
        },
      });

      if (paymentMethodSnapshot === 'CREDITO' && customerSnapshot) {
        await creditService.createCreditNote({
          branch_id: branchId,
          customer_id: customerSnapshot.id,
          total: totalSnapshot,
          credit_days_applied: customerSnapshot.default_credit_days,
          inventory_transaction_id: transaction.id,
        });
      }
      applyLocalSaleStock(saleCartSnapshot);
      showFeedback('success', 'Pago exitoso', `Venta registrada (${paymentMethodSnapshot}).`);
      setCart([]);
      setSelectedCustomer(null);
      setCreditCustomers([]);
      setCreditCheck(null);
      setPaymentMethod('EFECTIVO');

      window.setTimeout(() => {
        void generateSalePdf({
          ...pdfPayload,
          saleId: String(transaction.id),
          createdAt: transaction.created_at ?? new Date().toISOString(),
        }).catch((pdfError) => {
          console.error('Error generating sale PDF:', pdfError);
        });
      }, 0);
    } catch (err: any) {
      console.error('Error checking out:', err);
      showFeedback('error', 'Error al procesar', err.message ?? 'No se pudo completar la venta.');
    }
  };

  const addToCart = (
    product: PosProduct,
    customFactor?: number,
    customLabel?: string,
    stockOverride?: number,
    productUomId?: string,
    factorUsed?: number,
    saleType?: 'MAYOR' | 'MENOR'
  ) => {
    const productId = String(product.id);
    if (cart.find((i) => i.productId === productId)) return;
    const stockFromProduct = product.stocks.find((s) => s.branchId === branchId)?.qty;
    const branchStock = stockOverride ?? stockFromProduct;
    if (branchStock !== undefined && branchStock <= 0) {
      alert('⚠️ Sin stock en esta sucursal.');
      return;
    }
    const factorToBase = factorUsed ?? customFactor ?? 1;
    const saleTypeResolved = saleType ?? 'MENOR';
    const basePrice = saleTypeResolved === 'MAYOR'
      ? Number((product as any).wholesale_price ?? product.pricePerBaseUnit ?? 0)
      : Number((product as any).retail_price ?? (product as any).precio ?? product.pricePerBaseUnit ?? 0);
    const unitPrice = basePrice * factorToBase;
    const newItem: CartItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId,
      name: product.name,
      qty: 1,
      unitId: product.baseUnitId,
      unitPrice,
      qtyBase: 1 * factorToBase,
      subtotal: 1 * unitPrice,
      customFactor: customLabel ? factorToBase : undefined,
      customLabel,
      productUomId: productUomId ?? product.productUomId,
      factorUsed: factorToBase,
      saleType: saleTypeResolved,
      specialUnitPrice: null,
      specialPriceNote: null,
    };
    setCart((prev) => [...prev, newItem]);
  };

  const updateCartItem = (itemId: string, updates: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const product = branchProducts.find((p) => String(p.id) === item.productId)
          ?? (products ?? []).find((p) => p.id === item.productId);
        const newQty = updates.qty !== undefined ? updates.qty : item.qty;
        const newUnitId = updates.unitId !== undefined ? updates.unitId : item.unitId;
        const nextProductUomId = updates.productUomId ?? item.productUomId;
        const shouldResetSpecialPrice =
          updates.productUomId !== undefined ||
          updates.factorUsed !== undefined ||
          updates.unitId !== undefined;
        let factorUsed = updates.factorUsed ?? item.factorUsed ?? 1;
        if (updates.productUomId && saleUomsByProduct[item.productId]) {
          const match = saleUomsByProduct[item.productId].find((u) => String(u.id) === String(updates.productUomId));
          if (match) factorUsed = Number(match.factor_to_base);
        }
        const nextCustomLabel = updates.productUomId ? undefined : item.customLabel;
        const nextCustomFactor = updates.productUomId ? undefined : item.customFactor;
        const customFactor = nextCustomFactor && nextCustomLabel ? nextCustomFactor : undefined;
        const effectiveFactor = customFactor ?? factorUsed ?? 1;
        const qtyBase = newQty * effectiveFactor;
        const hasStock = Object.prototype.hasOwnProperty.call(branchStock, item.productId);
        const availableStock =
          product?.stocks?.find((s) => s.branchId === branchId)?.qty ?? (hasStock ? branchStock[item.productId] : undefined);

        if (availableStock !== undefined && qtyBase > availableStock) {
          alert('⚠️ Stock insuficiente.');
          return item;
        }

        const saleTypeResolved = item.saleType ?? 'MENOR';
        const standardUnitPrice = resolveStandardUnitPrice(
          item.productId,
          saleTypeResolved,
          effectiveFactor,
          Number(item.unitPrice ?? 0)
        );
        const nextSpecialUnitPrice =
          updates.specialUnitPrice !== undefined
            ? updates.specialUnitPrice
            : shouldResetSpecialPrice
              ? null
              : (item.specialUnitPrice ?? null);
        const nextSpecialPriceNote =
          updates.specialPriceNote !== undefined
            ? updates.specialPriceNote
            : shouldResetSpecialPrice
              ? null
              : (item.specialPriceNote ?? null);
        const unitPrice = Number(nextSpecialUnitPrice ?? standardUnitPrice);
        return {
          ...item,
          qty: newQty,
          unitId: newUnitId,
          productUomId: nextProductUomId,
          factorUsed: effectiveFactor,
          qtyBase,
          unitPrice,
          subtotal: newQty * unitPrice,
          customLabel: nextCustomLabel,
          customFactor: nextCustomFactor,
          specialUnitPrice: nextSpecialUnitPrice,
          specialPriceNote: nextSpecialPriceNote,
        };
      })
    );
  };

  const handleSaleUomChange = (itemId: string, nextUomId: string) => {
    console.log('Changing UOM for item', itemId, 'to', nextUomId);
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const saleUoms = saleUomsByProduct[item.productId] ?? [];
        const match = saleUoms.find((uom) => String(uom.id) === String(nextUomId));
        const factor = match ? Number(match.factor_to_base) : 1;
        const saleTypeResolved = item.saleType ?? 'MENOR';
        const unitPrice = resolveStandardUnitPrice(
          item.productId,
          saleTypeResolved,
          factor,
          Number(item.unitPrice ?? 0)
        );
        const qtyBase = item.qty * factor;
        const hasStock = Object.prototype.hasOwnProperty.call(branchStock, item.productId);
        const availableStock =
          product?.stocks?.find((s) => s.branchId === branchId)?.qty ?? (hasStock ? branchStock[item.productId] : undefined);
        if (availableStock !== undefined && qtyBase > availableStock) {
          alert('⚠️ Stock insuficiente.');
          return item;
        }
        return {
          ...item,
          productUomId: nextUomId,
          factorUsed: factor,
          qtyBase,
          unitPrice,
          subtotal: item.qty * unitPrice,
          saleType: 'MENOR',
          customLabel: undefined,
          customFactor: undefined,
          specialUnitPrice: null,
          specialPriceNote: null,
        };
      })
    );
  };

  const openPaymentForVencidas = () => {
    if (!creditCheck) return;
    const rows = creditCheck.vencidas.reduce<Record<string, number>>((acc, note) => {
      acc[note.id] = 0;
      return acc;
    }, {});
    setNoteRows(rows);
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayments = async () => {
    if (!creditCheck) return;
    const entries = Object.entries(noteRows).filter(([, amount]) => amount > 0);
    if (entries.length === 0) return;

    for (const [noteId, amount] of entries) {
      const note = creditCheck.vencidas.find((n) => n.id === noteId);
      if (!note) continue;
      const safeAmount = Math.min(amount, Number(note.balance));
      if (safeAmount <= 0) continue;
      await creditService.createPayment({
        note_id: noteId,
        amount: safeAmount,
        method: paymentMethodChoice,
        notes: paymentNotes || null,
      });
    }

    setIsPaymentModalOpen(false);
    setPaymentNotes('');
    setPaymentMethodChoice('EFECTIVO');
    const result = await runCreditCheck();
    if (result?.allowedCredit) {
      setIsCreditBlockedOpen(false);
      setPaymentMethod('CREDITO');
    }
  };

  const getSaleUoms = (productId: string) => saleUomsByProduct[productId] ?? [];

  const getBaseSaleUom = (productId: string) => {
    const saleUoms = getSaleUoms(productId);
    const baseUom = saleUoms.find((uom) => Number(uom.factor_to_base) === 1);
    return baseUom ?? defaultSaleUomByProduct[productId] ?? null;
  };

  const handleAddFromCatalog = (product: CatalogProduct) => {
    const pricePerBaseUnit = Number((product as any).retail_price ?? (product as any).precio ?? 0);
    if (pricePerBaseUnit <= 0) {
      alert('⚠️ No hay precio configurado para este producto.');
      return;
    }
    const defaultSaleUom = defaultSaleUomByProduct[String(product.id)];
    if (!defaultSaleUom) {
      setSaleUomObservation('');
      setSaleUomObservationError(null);
      catalogService
        .listProductUoms(String(product.id))
        .then((uoms) => {
          const saleUoms = uoms.filter((uom) => uom.purpose === 'SALE' || uom.purpose === 'BOTH');
          if (saleUoms.length > 0) {
            setSaleUomOptions(saleUoms);
            return;
          }
          // Fallback operativo: si no hay UOM de venta, permite usar UOM de compra.
          const purchaseUoms = uoms.filter((uom) => uom.purpose === 'PURCHASE');
          setSaleUomOptions(purchaseUoms);
        })
        .catch(() => setSaleUomOptions([]));
      setPendingCatalogProduct(product);
      setPendingPrice(pricePerBaseUnit);
      setIsSaleUomSelectOpen(true);
      return;
    }
    const hasStock = Object.prototype.hasOwnProperty.call(branchStock, product.id);
    const stockValue = hasStock ? branchStock[product.id] : undefined;
    ensureSaleUoms(String(product.id));
    setPendingCatalogProduct(product);
    setPendingPrice(pricePerBaseUnit);
    setPendingStockValue(stockValue);
    setIsSaleTypeOpen(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)]">
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="bg-white p-4 rounded-xl border-2 border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="flex-1">
            <label className="text-[10px] font-black text-gray-400 block mb-1 uppercase tracking-widest">Identificar Cliente (Opcional)</label>
            <CustomerSearchSelect
              customers={creditCustomers}
              selectedCustomer={selectedCustomer}
              onSelect={(customer) => {
                setSelectedCustomer((customer as CreditCustomer | null) ?? null);
                setCreditCheck(null);
                if (!customer) {
                  setPaymentMethod('EFECTIVO');
                  setCreditCustomers([]);
                }
              }}
              onSearch={handleCustomerSearch}
              isLoading={isCustomerSearchLoading}
            />
          </div>
          <button
            onClick={() => {
              setSalesHistoryPage(1);
              setIsSalesHistoryOpen(true);
            }}
            className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-200"
          >
            Ver ventas
          </button>
          {creditCheck && selectedCustomer && (
            <div className="px-4 border-l border-slate-100 text-right animate-in fade-in">
              <p className="text-[9px] font-black text-slate-400 uppercase">Límite Disponible</p>
              <p className={`text-xl font-black ${creditCheck.disponible >= cartTotal ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(creditCheck.disponible)}
              </p>
            </div>
          )}
        </div>

        <input
          type="text"
          placeholder="Buscar por nombre, SKU o barcode..."
          className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-orange-500 outline-none text-lg shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const term = searchTerm.trim().toLowerCase();
            if (!term) return;
            const match = activeBranchProducts.find((p) =>
              (p.barcode ?? '').toLowerCase() === term ||
              (p.sku ?? '').toLowerCase() === term ||
              p.name.toLowerCase() === term
            );
            if (match) {
              handleAddFromCatalog(match);
              setSearchTerm('');
            }
          }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto pr-2">
          {visibleBranchProducts.map((product) => {
              const stockQty = branchStock[product.id] ?? 0;
              return (
                <button
                  key={product.id}
                  onClick={() => handleAddFromCatalog(product)}
                  className={`bg-white p-4 rounded-2xl border-2 border-transparent hover:border-orange-500 hover:shadow-lg transition-all text-left flex flex-col justify-between ${stockQty <= 0 ? 'opacity-50' : ''
                    }`}
                >
                  <div>
                    <h3 className="font-bold text-slate-800">{product.name}</h3>
                    <p className="text-xs text-gray-400 font-mono">{product.sku || product.barcode || '—'}</p>
                  </div>
                  <div className="mt-4 flex justify-between items-end">
                    <span className="text-xl font-black text-slate-900">Stock {formatNumber(Number(stockQty))}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                      Base: {product.base_uom_id}
                    </span>
                  </div>
                </button>
              );
            })}
          {!isCatalogLoading && visibleBranchProducts.length === 0 && (
            <div className="col-span-full text-center text-slate-400 text-sm py-10">
              No hay productos para mostrar.
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-5 bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <h2 className="font-black text-xs uppercase tracking-widest">Carrito de Venta</h2>
          <button onClick={() => setCart([])} className="text-[9px] bg-red-500/20 px-2 py-1 rounded text-red-200 uppercase font-black">
            Vaciar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map((item) => (
            <div key={item.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative group">
              <button
                onClick={() => setCart(cart.filter((i) => i.id !== item.id))}
                className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center shadow-lg"
              >
                ×
              </button>
              <p className="font-bold text-sm text-slate-800 mb-2">{item.name}</p>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {item.customLabel && (
                  <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
                    {item.customLabel}
                  </p>
                )}
                {item.specialUnitPrice !== null && item.specialUnitPrice !== undefined && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-700">
                    <BadgeDollarSign className="w-3 h-3" />
                    Precio especial
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={item.qty}
                  onChange={(e) => updateCartItem(item.id, { qty: Number(e.target.value) })}
                  className="w-20 p-2 border-2 border-slate-200 rounded-lg text-center font-black"
                />
                {(() => {
                  const product = (products ?? []).find((p) => p.id === item.productId);
                  const baseUnitId = product?.baseUnitId ?? item.unitId;
                  const baseUom = uomsById[String(baseUnitId)];
                  const baseSymbol = baseUom?.code ?? baseUom?.name ?? baseUnitId;
                  const saleUoms = saleUomsByProduct[item.productId] ?? [];
                  if (item.customLabel) {
                    return (
                      <div className="flex-1 p-2 border-2 border-slate-200 rounded-lg text-xs font-bold bg-white flex items-center">
                        {item.customLabel}
                      </div>
                    );
                  }
                  if (item.saleType === 'MAYOR') {
                    return (
                      <div className="flex-1 p-2 border-2 border-slate-200 rounded-lg text-xs font-bold bg-white flex items-center">
                        {baseSymbol}
                      </div>
                    );
                  }
                  if (saleUoms.length > 0) {
                    return (
                      <select
                        value={item.productUomId ?? ''}
                        onChange={(e) => handleSaleUomChange(item.id, e.target.value)}
                        onFocus={() => ensureSaleUoms(item.productId)}
                        className="flex-1 p-2 border-2 border-slate-200 rounded-lg text-xs font-bold"
                      >
                        <option value="">Seleccionar</option>
                        {saleUoms.map((uom) => (
                          <option key={uom.id} value={String(uom.id)}>
                            {uom.uom?.code ?? uom.uom?.name ?? 'UOM'} ({uom.factor_to_base})
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <select
                      value={item.unitId}
                      onChange={(e) => updateCartItem(item.id, { unitId: e.target.value })}
                      className="flex-1 p-2 border-2 border-slate-200 rounded-lg text-xs font-bold"
                    >
                      <option value={baseUnitId}>{baseSymbol}</option>
                      {conversions
                        .filter((c) => c.productId === item.productId)
                        .map((c) => (
                          <option key={c.id} value={c.fromUnitId}>
                            {UNITS.find((u) => u.id === c.fromUnitId)?.symbol}
                          </option>
                        ))}
                    </select>
                  );
                })()}
                <span className="font-black text-slate-900 ml-auto flex items-center">{formatCurrency(item.subtotal)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] font-bold text-slate-500">
                  Unitario: <span className="text-slate-800">{formatCurrency(Number(item.unitPrice ?? 0))}</span>
                  {item.specialPriceNote && (
                    <span className="ml-2 text-amber-700">• {item.specialPriceNote}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openSpecialPriceModal(item)}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200"
                  >
                    <BadgeDollarSign className="w-3.5 h-3.5" />
                    Precio especial
                  </button>
                  {item.specialUnitPrice !== null && item.specialUnitPrice !== undefined && (
                    <button
                      onClick={() => clearSpecialPrice(item.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 hover:bg-amber-100"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restablecer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-slate-900 text-white border-t border-slate-800">
          <div className="grid grid-cols-2 gap-2 mb-6">
            {(['EFECTIVO', 'CREDITO'] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleSelectPaymentMethod(m)}
                className={`py-3 text-[10px] font-black rounded-xl border-2 transition-all ${paymentMethod === m
                  ? 'bg-orange-500 border-orange-400 text-white shadow-lg'
                  : 'bg-slate-800 border-slate-700 text-slate-500'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total a Pagar</p>
              <p className="text-4xl font-black text-orange-400 tracking-tighter">{formatCurrency(cartTotal)}</p>
            </div>
          </div>

          <button
            disabled={cart.length === 0}
            onClick={handleCheckout}
            className={`w-full py-5 rounded-2xl font-black text-xl shadow-2xl transition-all ${cart.length > 0 ? 'bg-orange-500 active:scale-95' : 'bg-slate-800 text-slate-600'
              }`}
          >
            ✅ FINALIZAR VENTA
          </button>
        </div>
      </div>

      {isCreditBlockedOpen && creditCheck && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Crédito bloqueado</h3>
                <p className="text-slate-400 text-xs">Notas vencidas detectadas</p>
              </div>
              <button onClick={() => setIsCreditBlockedOpen(false)} className="text-2xl text-slate-300">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <table className="w-full text-left border border-slate-200 rounded-2xl overflow-hidden">
                <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="p-3">Folio</th>
                    <th className="p-3">Emisión</th>
                    <th className="p-3">Vence</th>
                    <th className="p-3 text-right">Saldo</th>
                    <th className="p-3 text-right">Días atraso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {creditCheck.vencidas.map((note) => (
                    <tr key={note.id}>
                      <td className="p-3 text-xs font-bold text-slate-700">{note.folio}</td>
                      <td className="p-3 text-xs text-slate-500">{note.issue_date}</td>
                      <td className="p-3 text-xs text-slate-500">{note.due_date}</td>
                      <td className="p-3 text-xs font-black text-red-600 text-right">{formatCurrency(Number(note.balance))}</td>
                      <td className="p-3 text-xs font-black text-red-600 text-right">{note.days_overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col md:flex-row gap-2 justify-end">
                {creditCheck.allowCash && (
                  <button
                    onClick={() => {
                      setPaymentMethod('EFECTIVO');
                      setIsCreditBlockedOpen(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase"
                  >
                    Vender contado
                  </button>
                )}
                <button
                  onClick={openPaymentForVencidas}
                  className="px-4 py-2 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase"
                >
                  Cobrar/Abonar ahora
                </button>
                {creditCheck.policy === 'BLOQUEO_PARCIAL' && (
                  <button
                    onClick={openPaymentForVencidas}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase"
                  >
                    Liquidar vencidas y continuar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreditLimitOpen && creditCheck && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Crédito insuficiente</h3>
                <p className="text-slate-400 text-xs">La venta excede el límite disponible</p>
              </div>
              <button onClick={() => setIsCreditLimitOpen(false)} className="text-2xl text-slate-300">&times;</button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Límite</span>
                <span className="font-black">{formatCurrency(creditCheck.limite)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Saldo actual</span>
                <span className="font-black text-red-600">{formatCurrency(creditCheck.saldo_total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Disponible</span>
                <span className="font-black text-green-600">{formatCurrency(creditCheck.disponible)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3">
                <span className="text-slate-500">Venta</span>
                <span className="font-black">{formatCurrency(cartTotal)}</span>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setPaymentMethod('EFECTIVO');
                    setIsCreditLimitOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase"
                >
                  Vender contado
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPaymentModalOpen && creditCheck && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Abonar vencidas</h3>
                <p className="text-slate-400 text-xs">Debe liquidar para continuar a crédito</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-2xl text-slate-300">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={paymentMethodChoice}
                  onChange={(e) => setPaymentMethodChoice(e.target.value as CreditPaymentMethod)}
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="YAPE">Yape</option>
                  <option value="PLIN">Plin</option>
                  <option value="OTRO">Otro</option>
                </select>
                <input
                  placeholder="Notas del abono"
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="p-3">Folio</th>
                      <th className="p-3 text-right">Saldo</th>
                      <th className="p-3 text-right">Abono</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {creditCheck.vencidas.map((note) => (
                      <tr key={note.id}>
                        <td className="p-3 text-xs font-bold text-slate-700">{note.folio}</td>
                        <td className="p-3 text-right text-xs font-black text-red-600">{formatCurrency(Number(note.balance))}</td>
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min={0}
                            className="w-24 p-2 bg-white border border-slate-200 rounded-xl text-xs text-right"
                            value={noteRows[note.id] ?? 0}
                            onChange={(e) => setNoteRows((prev) => ({ ...prev, [note.id]: Number(e.target.value) }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmitPayments}
                  className="px-4 py-2 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase"
                >
                  Registrar abonos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSaleUomSelectOpen && pendingCatalogProduct && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Unidad de venta</h3>
                <p className="text-slate-400 text-xs">{pendingCatalogProduct.name}</p>
              </div>
              <button
                onClick={() => {
                  setIsSaleUomSelectOpen(false);
                  setPendingCatalogProduct(null);
                  setSaleUomObservation('');
                  setSaleUomObservationError(null);
                }}
                className="text-2xl text-slate-300"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-3">
              {saleUomOptions.length === 0 && (
                <div className="text-sm text-slate-500">No hay UOMs de venta configuradas.</div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Observación *</label>
                <textarea
                  rows={3}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  placeholder="Explique por qué se actualizará la unidad de venta"
                  value={saleUomObservation}
                  onChange={(e) => {
                    setSaleUomObservation(e.target.value);
                    if (saleUomObservationError) setSaleUomObservationError(null);
                  }}
                />
                {saleUomObservationError && (
                  <p className="text-xs font-bold text-red-600">{saleUomObservationError}</p>
                )}
              </div>
              {saleUomOptions.map((uom) => (
                <button
                  key={uom.id}
                  onClick={async () => {
                    if (!pendingCatalogProduct) return;
                    const justification = saleUomObservation.trim();
                    if (!justification) {
                      setSaleUomObservationError('La observación es obligatoria para actualizar la unidad de venta.');
                      return;
                    }
                    try {
                      const updated = await catalogService.setDefaultSaleUom(
                        String(pendingCatalogProduct.id),
                        uom.id
                      );
                      logMaterialsAudit({
                        branch_id: branchId,
                        branch_name: selectedBranch?.name ?? null,
                        user_id: currentUser.id,
                        user_name: currentUser.name,
                        action_type: 'ACTUALIZAR',
                        entity_type: 'producto',
                        entity_id: String(pendingCatalogProduct.id),
                        description: `Unidad de venta actualizada: ${pendingCatalogProduct.name}`,
                        justification,
                        new_data: {
                          product_uom_id: uom.id,
                          uom_name: uom.uom?.name ?? null,
                          uom_code: uom.uom?.code ?? null,
                          notes: justification,
                        },
                      });
                      setDefaultSaleUomByProduct((prev) => ({
                        ...prev,
                        [String(updated.product_id)]: updated,
                      }));
                      setIsSaleUomSelectOpen(false);
                      setSaleUomObservation('');
                      setSaleUomObservationError(null);
                      const product = pendingCatalogProduct;
                      setPendingCatalogProduct(null);
                      handleAddFromCatalog(product);
                    } catch (err) {
                      alert('No se pudo guardar la unidad de venta.');
                    }
                  }}
                  className="w-full p-4 rounded-2xl border border-slate-200 text-left hover:border-orange-500 hover:bg-orange-50/30 transition-all"
                >
                  <p className="text-sm font-black text-slate-900">
                    {uom.uom?.name ?? 'UOM'} {uom.uom?.code ? `(${uom.uom?.code})` : ''}
                  </p>
                  <p className="text-[10px] text-slate-500">Factor a base: {uom.factor_to_base}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isSaleTypeOpen && pendingCatalogProduct && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Tipo de venta</h3>
                <p className="text-slate-400 text-xs">{pendingCatalogProduct.name}</p>
              </div>
              <button
                onClick={() => {
                  setIsSaleTypeOpen(false);
                  setPendingCatalogProduct(null);
                  setPendingPrice(0);
                  setPendingStockValue(undefined);
                }}
                className="text-2xl text-slate-300"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-3">
              <button
                onClick={() => {
                  setIsSaleTypeOpen(false);
                  setIsUnitSelectOpen(true);
                }}
                className="w-full p-4 rounded-2xl border border-slate-200 text-left hover:border-orange-500 hover:bg-orange-50/30 transition-all"
              >
                <p className="text-sm font-black text-slate-900">Venta por menor</p>
                <p className="text-[10px] text-slate-500">Selecciona medida base o equivalencia (bolsa, caja, etc.).</p>
              </button>
              <button
                onClick={() => {
                  const baseUom = getBaseSaleUom(String(pendingCatalogProduct.id));
                  if (!baseUom) {
                    showFeedback('alert', 'Unidad base faltante', 'Configure la unidad base de venta.');
                    return;
                  }
                  const mapped: PosProduct = {
                    id: String(pendingCatalogProduct.id),
                    sku: pendingCatalogProduct.sku ?? '',
                    barcode: pendingCatalogProduct.barcode ?? '',
                    name: pendingCatalogProduct.name,
                    category: 'CATALOGO',
                    baseUnitId: pendingCatalogProduct.base_uom_id,
                    allowsDecimals: pendingCatalogProduct.is_divisible,
                    minStock: 0,
                    maxStock: 0,
                    stocks: pendingStockValue !== undefined ? [{ branchId: branchId, qty: pendingStockValue ?? 0 }] : [],
                    costPerBaseUnit: 0,
                    pricePerBaseUnit: Number((pendingCatalogProduct as any).wholesale_price ?? pendingPrice),
                    productUomId: baseUom.id,
                  };
                  addToCart(
                    mapped,
                    undefined,
                    undefined,
                    pendingStockValue,
                    baseUom.id,
                    Number(baseUom.factor_to_base ?? 1),
                    'MAYOR'
                  );
                  setIsSaleTypeOpen(false);
                  setPendingCatalogProduct(null);
                  setPendingPrice(0);
                  setPendingStockValue(undefined);
                }}
                className="w-full p-4 rounded-2xl border border-slate-200 text-left hover:border-orange-500 hover:bg-orange-50/30 transition-all"
              >
                <p className="text-sm font-black text-slate-900">Venta por mayor</p>
                <p className="text-[10px] text-slate-500">Usa la unidad base del producto.</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {isUnitSelectOpen && pendingCatalogProduct && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Seleccionar unidad</h3>
                <p className="text-slate-400 text-xs">{pendingCatalogProduct.name}</p>
              </div>
              <button
                onClick={() => {
                  setIsUnitSelectOpen(false);
                  setPendingCatalogProduct(null);
                }}
                className="text-2xl text-slate-300"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-3">
              {(() => {
                const productId = String(pendingCatalogProduct.id);
                const saleUoms = getSaleUoms(productId);
                const baseUom = getBaseSaleUom(productId);
                const withBase = baseUom && !saleUoms.find((u) => String(u.id) === String(baseUom.id))
                  ? [baseUom, ...saleUoms]
                  : saleUoms;
                return withBase.map((uom) => {
                  const label = uom.uom?.code ?? uom.uom?.name ?? 'UOM';
                  return (
                    <button
                      key={uom.id}
                      onClick={() => {
                        const hasStock = Object.prototype.hasOwnProperty.call(branchStock, pendingCatalogProduct.id);
                        const stockValue = pendingStockValue ?? (hasStock ? branchStock[pendingCatalogProduct.id] : undefined);
                  const mapped: PosProduct = {
                    id: String(pendingCatalogProduct.id),
                    sku: pendingCatalogProduct.sku ?? '',
                    barcode: pendingCatalogProduct.barcode ?? '',
                    name: pendingCatalogProduct.name,
                          category: 'CATALOGO',
                          baseUnitId: pendingCatalogProduct.base_uom_id,
                          allowsDecimals: pendingCatalogProduct.is_divisible,
                          minStock: 0,
                          maxStock: 0,
                    stocks: hasStock ? [{ branchId: branchId, qty: stockValue ?? 0 }] : [],
                    costPerBaseUnit: 0,
                    pricePerBaseUnit: Number((pendingCatalogProduct as any).retail_price ?? (pendingCatalogProduct as any).precio ?? pendingPrice),
                    productUomId: uom.id,
                  };
                        addToCart(
                          mapped,
                          undefined,
                          undefined,
                          stockValue,
                          uom.id,
                          Number(uom.factor_to_base ?? 1),
                          'MENOR'
                        );
                        setIsUnitSelectOpen(false);
                        setPendingCatalogProduct(null);
                        setPendingPrice(0);
                        setPendingStockValue(undefined);
                      }}
                      className="w-full p-4 rounded-2xl border border-slate-200 text-left hover:border-orange-500 hover:bg-orange-50/30 transition-all"
                    >
                      <p className="text-sm font-black text-slate-900">{label}</p>
                      <p className="text-[10px] text-slate-500">Factor a base: {uom.factor_to_base}</p>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      <FeedbackModal
        isOpen={feedbackOpen}
        type={feedbackType}
        title={feedbackTitle}
        description={feedbackDescription}
        onClose={closeFeedback}
      />

      {specialPriceModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-6 py-5 text-white flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Precio especial</h3>
                <p className="text-slate-400 text-xs mt-1">{specialPriceModal.itemName}</p>
              </div>
              <button onClick={closeSpecialPriceModal} className="text-2xl text-slate-300">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
                Precio actual: {formatCurrency(Number(specialPriceModal.currentPrice ?? 0))}
              </div>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nuevo precio unitario</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={specialPriceValue}
                  onChange={(e) => {
                    setSpecialPriceValue(e.target.value);
                    setSpecialPriceError(null);
                  }}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Observación obligatoria</span>
                <textarea
                  rows={3}
                  value={specialPriceNote}
                  onChange={(e) => {
                    setSpecialPriceNote(e.target.value);
                    setSpecialPriceError(null);
                  }}
                  placeholder="Explique por qué está aplicando un precio especial."
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </label>
              {specialPriceError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                  {specialPriceError}
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={closeSpecialPriceModal}
                  className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSpecialPrice}
                  className="px-4 py-3 rounded-xl bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-orange-600"
                >
                  Guardar precio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSaleDetailOpen && saleDetail && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[75vh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Detalle de venta</h3>
                <p className="text-slate-400 text-xs">
                  {saleDetail.nombre_cliente || '—'} · {formatLocalDateTime(saleDetail.created_at)}
                </p>
              </div>
              <button
                onClick={() => setIsSaleDetailOpen(false)}
                className="text-2xl text-slate-300"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    <tr>
                      <th className="p-3">Producto</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">UOM</th>
                      <th className="p-3 text-right">Cantidad</th>
                      <th className="p-3 text-right">Precio</th>
                      <th className="p-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isSaleDetailLoading && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">Cargando detalle...</td>
                      </tr>
                    )}
                    {!isSaleDetailLoading && saleDetailItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">No hay items registrados.</td>
                      </tr>
                    )}
                    {!isSaleDetailLoading && saleDetailItems.map((item) => {
                      const subtotal = Number(item.qty) * Number(item.unit_price);
                      const uomCode = item.uom_code ? item.uom_code : 'BASE';
                      const uomLabel = item.custom_label
                        ? `${item.custom_label} (${item.factor_used} ${uomCode})`
                        : item.uom_name || 'UOM';
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-3 text-xs font-bold text-slate-700">{item.product_name || '—'}</td>
                          <td className="p-3 text-xs font-mono text-slate-500">{item.product_sku || '—'}</td>
                          <td className="p-3 text-xs text-slate-600">{uomLabel}</td>
                          <td className="p-3 text-xs font-bold text-slate-600 text-right">{formatNumber(Number(item.qty))}</td>
                          <td className="p-3 text-xs font-bold text-slate-600 text-right">{formatCurrency(Number(item.unit_price))}</td>
                          <td className="p-3 text-xs font-black text-slate-900 text-right">{formatCurrency(subtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSalesHistoryOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[70vh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Historial de Ventas</h3>
                <p className="text-slate-400 text-xs">Sucursal {selectedBranchId || '—'}</p>
              </div>
              <button
                onClick={() => setIsSalesHistoryOpen(false)}
                className="text-2xl text-slate-300"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Desde</span>
                  <input
                    type="date"
                    value={salesHistoryDateFrom}
                    onChange={(e) => {
                      setSalesHistoryDateFrom(e.target.value);
                      setSalesHistoryPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hasta</span>
                  <input
                    type="date"
                    value={salesHistoryDateTo}
                    onChange={(e) => {
                      setSalesHistoryDateTo(e.target.value);
                      setSalesHistoryPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">N° venta</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ej: 125"
                    value={salesHistorySaleNumber}
                    onChange={(e) => {
                      setSalesHistorySaleNumber(e.target.value.replace(/\D/g, ''));
                      setSalesHistoryPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSalesHistoryDateFrom('');
                      setSalesHistoryDateTo('');
                      setSalesHistorySaleNumber('');
                      setSalesHistoryPage(1);
                    }}
                    className="w-full md:w-auto px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-200"
                  >
                    Limpiar filtro
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    <tr>
                      <th className="p-4 text-center">N° Venta</th>
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Cliente</th>
                      <th className="p-4 text-center">Nª de Productos</th>
                      <th className="p-4 text-right">Total</th>
                      <th className="p-4 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isSalesHistoryLoading && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">Cargando ventas...</td>
                      </tr>
                    )}
                    {!isSalesHistoryLoading && salesHistory.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">No hay ventas registradas.</td>
                      </tr>
                    )}
                    {!isSalesHistoryLoading && salesHistory.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="p-4 text-center text-xs font-black text-slate-700">#{sale.id}</td>
                        <td className="p-4 text-xs font-bold text-slate-700">{formatLocalDateTime(sale.created_at)}</td>
                        <td className="p-4 text-xs font-bold text-slate-700">{sale.nombre_cliente || 'Público General'}</td>
                        <td className="p-4 text-center text-xs font-bold text-slate-600">{sale.items_count}</td>
                        <td className="p-4 text-right text-sm font-black text-slate-900">{formatCurrency(sale.total_amount)}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleDownloadSalePdf(sale)}
                              className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                              title="Exportar PDF"
                            >
                              <FileDown className="w-4 h-4 mx-auto" />
                            </button>
                            <button
                              onClick={() => openSaleDetail(sale)}
                              className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4 mx-auto" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs font-bold text-slate-500">
                  Mostrando {salesHistory.length} de {salesHistoryTotal} ventas
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSalesHistoryPage((prev) => Math.max(1, prev - 1))}
                    disabled={salesHistoryPage === 1 || isSalesHistoryLoading}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-[11px] font-black text-slate-700">
                    {salesHistoryPage} / {salesHistoryTotalPages}
                  </span>
                  <button
                    onClick={() => setSalesHistoryPage((prev) => Math.min(salesHistoryTotalPages, prev + 1))}
                    disabled={salesHistoryPage === salesHistoryTotalPages || isSalesHistoryLoading}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POSScreen;

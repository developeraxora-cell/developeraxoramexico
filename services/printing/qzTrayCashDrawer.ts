type QzConfig = unknown;

interface QzTrayApi {
  websocket: {
    isActive: () => boolean;
    connect: () => Promise<void>;
  };
  printers: {
    find: (query: string) => Promise<string>;
  };
  configs: {
    create: (printer: string, options?: Record<string, unknown>) => QzConfig;
  };
  print: (config: QzConfig, data: Array<Record<string, unknown>>) => Promise<void>;
}

declare global {
  interface Window {
    qz?: QzTrayApi;
    __qzTrayLoadingPromise?: Promise<QzTrayApi>;
  }
}

const DEFAULT_PRINTER_NAME = 'M804';
const CASH_DRAWER_COMMAND = '\x1B\x70\x00\x19\xFA';
const QZ_SCRIPT_URLS = ['/qz-tray.js', 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js'];

const getPrinterName = () => {
  const localPrinter = window.localStorage.getItem('vinos.cashDrawerPrinterName');
  return (localPrinter || import.meta.env.VITE_VINOS_CASH_DRAWER_PRINTER_NAME || DEFAULT_PRINTER_NAME).trim();
};

const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existingScript) {
    if (window.qz) resolve();
    existingScript.addEventListener('load', () => resolve(), { once: true });
    existingScript.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
  document.head.appendChild(script);
});

const loadQzTray = async () => {
  if (window.qz) return window.qz;
  if (window.__qzTrayLoadingPromise) return window.__qzTrayLoadingPromise;

  window.__qzTrayLoadingPromise = (async () => {
    for (const src of QZ_SCRIPT_URLS) {
      try {
        await loadScript(src);
        if (window.qz) return window.qz;
      } catch {
        // Try the next source. The app keeps working even if QZ is not available.
      }
    }

    throw new Error('QZ Tray no está disponible. Instala QZ Tray o agrega qz-tray.js en public/qz-tray.js.');
  })();

  return window.__qzTrayLoadingPromise;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string) =>
  Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ]);

export const openVinosCashDrawer = async () => {
  const qz = await loadQzTray();
  const printerName = getPrinterName();

  if (!qz.websocket.isActive()) {
    await withTimeout(qz.websocket.connect(), 3500, 'No se pudo conectar con QZ Tray. Verifica que esté abierto en Windows.');
  }

  const printer = await withTimeout(
    qz.printers.find(printerName),
    3500,
    `No se encontró la impresora "${printerName}".`,
  );
  const config = qz.configs.create(printer, { encoding: 'CP437' });

  await withTimeout(
    qz.print(config, [{ type: 'raw', format: 'command', data: CASH_DRAWER_COMMAND }]),
    3500,
    'No se pudo enviar el pulso de apertura al cajón.',
  );
};

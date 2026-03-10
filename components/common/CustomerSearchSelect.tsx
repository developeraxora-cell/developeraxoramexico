import React, { useEffect, useMemo, useState } from 'react';

interface SearchableCustomer {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}

interface CustomerSearchSelectProps {
  customers: SearchableCustomer[];
  selectedCustomer: SearchableCustomer | null;
  onSelect: (customer: SearchableCustomer | null) => void;
  onSearch: (query: string) => void | Promise<void>;
  isLoading?: boolean;
  minQueryLength?: number;
  placeholder?: string;
  publicLabel?: string;
}

const CustomerSearchSelect: React.FC<CustomerSearchSelectProps> = ({
  customers,
  selectedCustomer,
  onSelect,
  onSearch,
  isLoading = false,
  minQueryLength = 3,
  placeholder = 'Buscar cliente por nombre, telefono o direccion...',
  publicLabel = 'Público General (Mostrador)',
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedCustomer?.name ?? publicLabel);
  }, [selectedCustomer, publicLabel]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCustomers = useMemo(() => customers, [customers]);

  useEffect(() => {
    if (!isOpen) return;

    if (!normalizedQuery || normalizedQuery === publicLabel.toLowerCase() || normalizedQuery.length < minQueryLength) {
      void onSearch('');
      return;
    }

    const timer = window.setTimeout(() => {
      void onSearch(query.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isOpen, minQueryLength, normalizedQuery, onSearch, publicLabel, query]);

  const handleSelect = (customer: SearchableCustomer | null) => {
    onSelect(customer);
    setQuery(customer?.name ?? publicLabel);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        className="w-full bg-gray-50 border-none outline-none font-bold text-slate-700 p-2 rounded-lg"
        onFocus={() => {
          setIsOpen(true);
          if (!selectedCustomer) {
            setQuery('');
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setIsOpen(false);
            setQuery(selectedCustomer?.name ?? publicLabel);
          }, 150);
        }}
      />

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(null)}
            className={`w-full px-4 py-3 text-left border-b border-slate-100 transition-colors ${
              !selectedCustomer ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50 text-slate-700'
            }`}
          >
            <p className="text-sm font-black">{publicLabel}</p>
            <p className="text-[11px] font-bold text-slate-400">Venta sin cliente de crédito</p>
          </button>

          <div className="max-h-72 overflow-y-auto">
            {normalizedQuery.length > 0 && normalizedQuery.length < minQueryLength && (
              <div className="px-4 py-4 text-sm font-bold text-slate-400">
                Escriba al menos {minQueryLength} letras para buscar.
              </div>
            )}

            {normalizedQuery.length >= minQueryLength && isLoading && (
              <div className="px-4 py-4 text-sm font-bold text-slate-400">
                Buscando clientes...
              </div>
            )}

            {normalizedQuery.length >= minQueryLength && !isLoading && filteredCustomers.length === 0 && (
              <div className="px-4 py-4 text-sm font-bold text-slate-400">
                No se encontraron clientes.
              </div>
            )}

            {filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(customer)}
                className={`w-full px-4 py-3 text-left border-b border-slate-100 transition-colors ${
                  selectedCustomer?.id === customer.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <p className="text-sm font-black uppercase">{customer.name}</p>
                <p className={`text-[11px] font-bold ${selectedCustomer?.id === customer.id ? 'text-white/70' : 'text-slate-400'}`}>
                  {[customer.phone, customer.address].filter(Boolean).join(' | ') || 'Sin datos adicionales'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerSearchSelect;

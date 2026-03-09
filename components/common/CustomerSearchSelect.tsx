import React, { useEffect, useMemo, useState } from 'react';

interface SearchableCustomer {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}

interface CustomerSearchSelectProps {
  customers: SearchableCustomer[];
  selectedId: string;
  onSelect: (customerId: string) => void;
  placeholder?: string;
  publicLabel?: string;
}

const CustomerSearchSelect: React.FC<CustomerSearchSelectProps> = ({
  customers,
  selectedId,
  onSelect,
  placeholder = 'Buscar cliente por nombre, telefono o direccion...',
  publicLabel = 'Público General (Mostrador)',
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedId) ?? null,
    [customers, selectedId]
  );

  useEffect(() => {
    setQuery(selectedCustomer?.name ?? publicLabel);
  }, [selectedCustomer, publicLabel]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCustomers = useMemo(() => {
    if (!normalizedQuery || normalizedQuery === publicLabel.toLowerCase()) {
      return customers.slice(0, 8);
    }
    return customers
      .filter((customer) => {
        const name = customer.name.toLowerCase();
        const phone = (customer.phone ?? '').toLowerCase();
        const address = (customer.address ?? '').toLowerCase();
        return (
          name.includes(normalizedQuery) ||
          phone.includes(normalizedQuery) ||
          address.includes(normalizedQuery)
        );
      })
      .slice(0, 8);
  }, [customers, normalizedQuery, publicLabel]);

  const handleSelect = (customer: SearchableCustomer | null) => {
    onSelect(customer?.id ?? '');
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
          if (!selectedId) {
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
              !selectedId ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50 text-slate-700'
            }`}
          >
            <p className="text-sm font-black">{publicLabel}</p>
            <p className="text-[11px] font-bold text-slate-400">Venta sin cliente de crédito</p>
          </button>

          <div className="max-h-72 overflow-y-auto">
            {filteredCustomers.length === 0 && (
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
                  selectedId === customer.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <p className="text-sm font-black uppercase">{customer.name}</p>
                <p className={`text-[11px] font-bold ${selectedId === customer.id ? 'text-white/70' : 'text-slate-400'}`}>
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

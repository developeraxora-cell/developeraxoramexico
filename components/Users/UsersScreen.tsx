
import React, { useState } from 'react';
import { User, Role, Branch } from '../../types';

interface UsersScreenProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  branches: Branch[];
}

const UsersScreen: React.FC<UsersScreenProps> = ({ users, setUsers, branches }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    role: Role.CAJERO,
    branchId: ''
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: User = {
      id: `u-${Date.now()}`,
      name: formData.name,
      username: formData.username,
      role: formData.role,
      branchId: formData.role === Role.ADMIN ? undefined : formData.branchId,
      active: true
    };
    setUsers([...users, newUser]);
    setIsModalOpen(false);
    setFormData({ name: '', username: '', role: Role.CAJERO, branchId: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Gestión de Personal</h2>
          <p className="text-xs text-gray-400 font-medium">Asigne roles y sucursales a sus colaboradores.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg"
        >
          + Agregar Usuario
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rol</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sucursal Asignada</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-bold text-slate-800">{u.name}</td>
                <td className="p-4 font-mono text-slate-500 text-sm">{u.username}</td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    u.role === Role.ADMIN ? 'bg-purple-100 text-purple-700' : 
                    u.role === Role.ALMACEN ? 'bg-orange-100 text-orange-700' : 
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="p-4">
                  {u.role === Role.ADMIN ? (
                    <span className="text-xs font-bold text-gray-400 italic">Acceso Global</span>
                  ) : (
                    <span className="text-xs font-bold text-slate-700">
                      🏢 {branches.find(b => b.id === u.branchId)?.name || 'Sin asignar'}
                    </span>
                  )}
                </td>
                <td className="p-4 text-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full inline-block mr-2"></span>
                  <span className="text-xs font-bold text-gray-500 uppercase">Activo</span>
                </td>
                <td className="p-4 text-center">
                  <button className="text-slate-300 hover:text-red-500 p-2 transition-colors">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Nuevo Usuario</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre Completo</label>
                <input 
                  type="text" required
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-semibold transition-all"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">ID de Acceso (Username)</label>
                <input 
                  type="text" required
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none font-mono transition-all"
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Rol de Sistema</label>
                  <select 
                    className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none transition-all text-sm"
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as Role})}
                  >
                    <option value={Role.CAJERO}>Cajero</option>
                    <option value={Role.ALMACEN}>Almacenista</option>
                    <option value={Role.ADMIN}>Administrador</option>
                  </select>
                </div>
                {formData.role !== Role.ADMIN && (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Sucursal</label>
                    <select 
                      required
                      className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-xl outline-none transition-all text-sm"
                      value={formData.branchId}
                      onChange={e => setFormData({...formData, branchId: e.target.value})}
                    >
                      <option value="">Seleccione...</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-4 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-gray-500 font-bold hover:bg-gray-100 rounded-2xl transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-orange-500 text-white font-black rounded-2xl shadow-lg shadow-orange-500/20 transition-all">Guardar Usuario</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersScreen;

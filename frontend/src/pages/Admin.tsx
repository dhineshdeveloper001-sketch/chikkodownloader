import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Users, Download, Activity, Trash2, AlertTriangle, Search, PowerOff } from 'lucide-react';
import clsx from 'clsx';
import { API_BASE } from '../config';

const Admin = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview');
  
  const [stats, setStats] = useState<any>({ totalUsers: 0, totalDownloads: 0, todaysDownloads: 0, successfulDownloads: 0, failedDownloads: 0, topPlatforms: [], recentDownloads: [] });
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        const res = await axios.get(`${API_BASE}/api/admin/dashboard`, { withCredentials: true });
        if (res.data.success) {
           setStats(res.data.data);
        }
      } else if (activeTab === 'users') {
        const res = await axios.get(`${API_BASE}/api/admin/users`, { withCredentials: true });
        if (res.data.success) {
           setUsers(res.data.users);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/admin/users?search=${encodeURIComponent(searchQuery)}`, { withCredentials: true });
      if (res.data.success) {
        setUsers(res.data.users);
      }
    } catch (err: any) {
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (id: string, currentStatus: boolean) => {
    if (!window.confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this user?`)) return;
    try {
      await axios.put(`${API_BASE}/api/admin/user/${id}/deactivate`, {}, { withCredentials: true });
      toast.success('User status updated');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update user');
    }
  };

  const tabs = [
    { id: 'overview', label: 'Dashboard', icon: Activity },
    { id: 'users', label: 'Manage Users', icon: Users }
  ] as const;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-2xl shadow-sm border border-red-200 dark:border-red-500/30">
          <AlertTriangle size={28} />
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">System Administration</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Manage users and monitor global activity securely.</p>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm w-full md:w-max overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={clsx(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap",
              activeTab === tab.id 
                ? "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800">
        {loading && activeTab === 'overview' ? (
          <div className="h-64 flex items-center justify-center text-slate-500">Loading data...</div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20">
                    <div className="text-indigo-600 dark:text-indigo-400 mb-2"><Users size={24} /></div>
                    <div className="text-3xl font-black text-slate-800 dark:text-white mb-1">{stats.totalUsers}</div>
                    <div className="text-sm font-bold text-indigo-600/80 dark:text-indigo-400/80 uppercase tracking-wider">Total Users</div>
                  </div>
                  <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                    <div className="text-emerald-600 dark:text-emerald-400 mb-2"><Download size={24} /></div>
                    <div className="text-3xl font-black text-slate-800 dark:text-white mb-1">{stats.totalDownloads}</div>
                    <div className="text-sm font-bold text-emerald-600/80 dark:text-emerald-400/80 uppercase tracking-wider">Total Downloads</div>
                  </div>
                  <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                    <div className="text-amber-600 dark:text-amber-400 mb-2"><Activity size={24} /></div>
                    <div className="text-3xl font-black text-slate-800 dark:text-white mb-1">{stats.todaysDownloads}</div>
                    <div className="text-sm font-bold text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider">Today's Downloads</div>
                  </div>
                  <div className="p-6 rounded-2xl bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20">
                    <div className="text-green-600 dark:text-green-400 mb-2"><Download size={24} /></div>
                    <div className="text-3xl font-black text-slate-800 dark:text-white mb-1">{stats.successfulDownloads}</div>
                    <div className="text-sm font-bold text-green-600/80 dark:text-green-400/80 uppercase tracking-wider">Success / Failed: {stats.failedDownloads}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                     <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">Top Platforms</h3>
                     <div className="space-y-3">
                       {stats.topPlatforms.map((p: any) => (
                         <div key={p.platform} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                           <span className="font-bold text-slate-700 dark:text-slate-300 capitalize">{p.platform}</span>
                           <span className="font-semibold text-indigo-600 dark:text-indigo-400">{p.count} Downloads</span>
                         </div>
                       ))}
                       {stats.topPlatforms.length === 0 && <p className="text-slate-500">No data available.</p>}
                     </div>
                  </div>
                  <div>
                     <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">Recent Downloads</h3>
                     <div className="space-y-3">
                       {stats.recentDownloads.map((d: any) => (
                         <div key={d.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                           <div className="flex flex-col max-w-[200px] sm:max-w-xs">
                             <span className="font-bold text-slate-700 dark:text-slate-300 truncate">{d.title || d.platform}</span>
                             <span className="text-xs text-slate-500">{d.username} • {new Date(d.time).toLocaleString()}</span>
                           </div>
                           <span className={clsx("text-xs font-bold px-2 py-1 rounded-md uppercase", d.status === 'completed' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{d.status}</span>
                         </div>
                       ))}
                       {stats.recentDownloads.length === 0 && <p className="text-slate-500">No data available.</p>}
                     </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-6">
                <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-md">
                   <input 
                     type="text" 
                     className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white px-4 py-3 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none"
                     placeholder="Search username..."
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                   />
                   <button type="submit" className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 transition">
                     <Search size={20} />
                   </button>
                </form>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm uppercase tracking-wider">
                        <th className="pb-4 font-bold">Username</th>
                        <th className="pb-4 font-bold">Role</th>
                        <th className="pb-4 font-bold">Status</th>
                        <th className="pb-4 font-bold">Downloads</th>
                        <th className="pb-4 font-bold">Joined</th>
                        <th className="pb-4 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {users.map(u => (
                        <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-4">
                            <div className="font-bold text-slate-800 dark:text-white">{u.username}</div>
                          </td>
                          <td className="py-4">
                            <span className={clsx("px-2.5 py-1 rounded-md text-xs font-bold uppercase", u.role === 'ADMIN' ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-4">
                            <span className={clsx("px-2.5 py-1 rounded-md text-xs font-bold uppercase", u.isActive ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600")}>
                              {u.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-4 font-semibold text-slate-600 dark:text-slate-300">{u._count.downloads}</td>
                          <td className="py-4 text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td className="py-4 text-right">
                            <button onClick={() => toggleUserStatus(u.id, u.isActive)} className="p-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg transition-colors" title={u.isActive ? "Deactivate User" : "Activate User"}>
                              <PowerOff size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {users.length === 0 && !loading && (
                    <div className="text-center py-8 text-slate-500">No users found.</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;

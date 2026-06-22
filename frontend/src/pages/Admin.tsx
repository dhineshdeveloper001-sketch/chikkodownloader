import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Users, Download, Activity, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

const Admin = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'downloads' | 'audits'>('overview');
  
  const [stats, setStats] = useState({ totalUsers: 0, totalDownloads: 0, totalStorage: '0', systemStatus: 'loading' });
  const [users, setUsers] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (activeTab === 'overview') {
        const res = await axios.get('http://localhost:5000/api/admin/overview', { headers });
        setStats(res.data);
      } else if (activeTab === 'users') {
        const res = await axios.get('http://localhost:5000/api/admin/users', { headers });
        setUsers(res.data.users);
      } else if (activeTab === 'downloads') {
        const res = await axios.get('http://localhost:5000/api/admin/downloads', { headers });
        setDownloads(res.data.downloads);
      } else if (activeTab === 'audits') {
        const res = await axios.get('http://localhost:5000/api/admin/audits', { headers });
        setAudits(res.data.logs);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id: string) => {
    if (!window.confirm('Are you sure? This will delete the user and all their downloads.')) return;
    try {
      await axios.delete(`http://localhost:5000/api/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('User deleted');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const deleteDownload = async (id: string) => {
    if (!window.confirm('Are you sure? This will delete the download log and the physical file.')) return;
    try {
      await axios.delete(`http://localhost:5000/api/admin/downloads/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Download deleted');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete download');
    }
  };

  const deleteAudit = async (id: string) => {
    try {
      await axios.delete(`http://localhost:5000/api/admin/audits/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Audit log deleted');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete audit log');
    }
  };

  const clearAudits = async () => {
    if (!window.confirm('Are you sure you want to clear ALL audit logs?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/admin/audits`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('All audit logs cleared');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to clear audit logs');
    }
  };

  const formatBytes = (bytes: string | number) => {
    const b = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (b === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'downloads', label: 'Global Downloads', icon: Download },
    { id: 'audits', label: 'Audit Logs', icon: AlertTriangle }
  ] as const;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-2xl shadow-sm border border-red-200 dark:border-red-500/30">
          <AlertTriangle size={28} />
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">System Administration</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Manage users, monitor global activity, and review security logs.</p>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm w-full md:w-max overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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
        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-500">Loading data...</div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  <div className="text-3xl font-black text-slate-800 dark:text-white mb-1">{formatBytes(stats.totalStorage)}</div>
                  <div className="text-sm font-bold text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider">Storage Used</div>
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm uppercase tracking-wider">
                      <th className="pb-4 font-bold">User</th>
                      <th className="pb-4 font-bold">Role</th>
                      <th className="pb-4 font-bold">Downloads</th>
                      <th className="pb-4 font-bold">Joined</th>
                      <th className="pb-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {users.map(u => (
                      <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-4">
                          <div className="font-bold text-slate-800 dark:text-white">{u.name}</div>
                          <div className="text-slate-500">{u.email}</div>
                        </td>
                        <td className="py-4">
                          <span className={clsx("px-2.5 py-1 rounded-md text-xs font-bold uppercase", u.role === 'admin' ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-4 font-semibold text-slate-600 dark:text-slate-300">{u._count.downloads}</td>
                        <td className="py-4 text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="py-4 text-right">
                          <button onClick={() => deleteUser(u.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'downloads' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm uppercase tracking-wider">
                      <th className="pb-4 font-bold">File</th>
                      <th className="pb-4 font-bold">User</th>
                      <th className="pb-4 font-bold">Size</th>
                      <th className="pb-4 font-bold">Date</th>
                      <th className="pb-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {downloads.map(d => (
                      <tr key={d.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-4 pr-4">
                          <div className="font-bold text-slate-800 dark:text-white line-clamp-1" title={d.file_name}>{d.file_name}</div>
                          <div className="text-xs text-slate-500 truncate max-w-xs" title={d.original_url}>{d.original_url}</div>
                        </td>
                        <td className="py-4 text-slate-600 dark:text-slate-300">{d.user?.email || 'Deleted User'}</td>
                        <td className="py-4 font-semibold text-slate-600 dark:text-slate-300">{formatBytes(d.file_size)}</td>
                        <td className="py-4 text-slate-500">{new Date(d.download_date).toLocaleString()}</td>
                        <td className="py-4 text-right">
                          <button onClick={() => deleteDownload(d.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'audits' && (
              <div className="space-y-4">
                <div className="flex justify-end mb-4">
                  <button onClick={clearAudits} className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors text-sm">
                    <Trash2 size={16} />
                    Clear All Logs
                  </button>
                </div>
                <div className="space-y-2">
                  {audits.map(log => (
                    <div key={log.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400 rounded text-xs font-black uppercase tracking-wider">{log.action}</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{log.user?.email || 'System'}</span>
                        </div>
                        <span className="text-sm text-slate-500">{log.details}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</span>
                        <button onClick={() => deleteAudit(log.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {audits.length === 0 && (
                    <div className="text-center py-8 text-slate-500 font-medium">No audit logs found.</div>
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

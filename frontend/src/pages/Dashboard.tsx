import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DownloadCloud, HardDrive, FileType, Calendar, Loader2, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

const formatBytes = (bytes: number | string, decimals = 2) => {
  const numBytes = Number(bytes);
  if (!numBytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  return `${parseFloat((numBytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const Dashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/stats/dashboard`, { withCredentials: true });
        if (res.data.success) {
          setStats(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [user]);

  if (loading) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-32">
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
        <p className="text-slate-500 font-medium text-lg animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  if (!stats) return <div className="text-center mt-12 text-red-500 font-bold">Failed to load statistics.</div>;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tight">Dashboard</h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 mt-3 font-medium">Overview of your download activity and storage usage.</p>
        </div>
        <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-5 py-3 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm font-bold">
          <Activity size={20} className="animate-pulse" /> System Online
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-3xl border border-white/40 dark:border-slate-700/50 shadow-xl shadow-indigo-500/5 flex flex-col items-start hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110">
            <DownloadCloud size={100} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-6 shadow-inner relative z-10">
            <DownloadCloud size={28} />
          </div>
          <div className="text-5xl font-black text-slate-800 dark:text-white mb-2 relative z-10">{stats.totalDownloads}</div>
          <div className="text-sm font-bold text-slate-500 uppercase tracking-widest relative z-10">Total Downloads</div>
        </div>

        <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-3xl border border-white/40 dark:border-slate-700/50 shadow-xl shadow-green-500/5 flex flex-col items-start hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110">
            <Calendar size={100} className="text-green-600 dark:text-green-400" />
          </div>
          <div className="w-14 h-14 bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center mb-6 shadow-inner relative z-10">
            <Calendar size={28} />
          </div>
          <div className="text-5xl font-black text-slate-800 dark:text-white mb-2 relative z-10">{stats.downloadsToday}</div>
          <div className="text-sm font-bold text-slate-500 uppercase tracking-widest relative z-10">Downloaded Today</div>
        </div>

        <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-3xl border border-white/40 dark:border-slate-700/50 shadow-xl shadow-orange-500/5 flex flex-col items-start hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110">
            <HardDrive size={100} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div className="w-14 h-14 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center mb-6 shadow-inner relative z-10">
            <HardDrive size={28} />
          </div>
          <div className="text-5xl font-black text-slate-800 dark:text-white mb-2 relative z-10">{formatBytes(stats.storageUsed).split(' ')[0]} <span className="text-2xl text-slate-500">{formatBytes(stats.storageUsed).split(' ')[1]}</span></div>
          <div className="text-sm font-bold text-slate-500 uppercase tracking-widest relative z-10">Storage Used</div>
        </div>
      </div>

      <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-[2.5rem] p-8 md:p-12 border border-white/40 dark:border-slate-700/50 shadow-2xl">
        <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-8 flex items-center gap-3">
          <FileType className="text-indigo-500" /> Platform Distribution
        </h3>
        
        {Object.keys(stats.fileTypes).length === 0 ? (
          <div className="text-slate-500 text-center py-16 font-medium text-lg bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
            No files downloaded yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Object.entries(stats.fileTypes).map(([platform, count]) => (
              <div key={platform} className="flex items-center gap-5 p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm text-indigo-600 dark:text-indigo-400">
                  <FileType size={28} />
                </div>
                <div>
                  <div className="text-xl font-black text-slate-800 dark:text-white capitalize leading-none mb-1">{platform}</div>
                  <div className="text-sm font-bold text-slate-500">{String(count)} files</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

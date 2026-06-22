import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, File, Download, Calendar, HardDrive, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';
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

const History = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const { token } = useAuth();

  const fetchHistory = async (cursor?: string) => {
    try {
      const url = cursor 
        ? `${API_BASE}/api/stats/history?limit=20&cursor=${cursor}`
        : `${API_BASE}/api/stats/history?limit=20`;
        
      const res = await axios.get(url);
      
      if (cursor) {
        setHistory(prev => [...prev, ...res.data.history]);
      } else {
        setHistory(res.data.history);
      }
      setNextCursor(res.data.nextCursor);
    } catch (err) {
      console.error('Failed to fetch history');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleLoadMore = () => {
    if (nextCursor) {
      setLoadingMore(true);
      fetchHistory(nextCursor);
    }
  };

  const filteredHistory = history.filter(item => 
    (item.filename || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.url || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tight">Download History</h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 mt-3 font-medium">Browse and search your past downloads securely.</p>
        </div>
        
        <div className="relative w-full md:w-80 group">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-10 group-hover:opacity-30 transition-opacity duration-500"></div>
          <div className="relative flex items-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 rounded-2xl shadow-xl shadow-indigo-500/5">
            <Search size={20} className="text-indigo-400 dark:text-indigo-500 ml-4" />
            <input 
              type="text" 
              className="w-full bg-transparent border-none text-slate-800 dark:text-white px-4 py-4 rounded-2xl focus:ring-0 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <Loader2 className="animate-spin mx-auto text-indigo-500 mb-4" size={48} />
          <p className="text-slate-500 font-medium text-lg animate-pulse">Loading history...</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl rounded-[2.5rem] p-16 text-center border border-white/20 dark:border-slate-700/50 shadow-2xl">
          <File size={64} className="mx-auto mb-6 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
          <h3 className="text-2xl font-bold text-slate-800 dark:text-white">No downloads found</h3>
          <p className="text-slate-500 mt-2 font-medium">You haven't downloaded any files yet, or no files match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHistory.map((item) => (
            <div key={item.id} className="group relative bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-slate-700/50 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 p-3 rounded-2xl">
                  <File size={24} />
                </div>
                <span className={clsx(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                  item.status === 'completed' ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" : 
                  item.status === 'error' ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" : 
                  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                )}>
                  {item.status}
                </span>
              </div>

              <div className="flex-1">
                <h4 className="text-lg font-black text-slate-800 dark:text-white line-clamp-2 leading-tight mb-4" title={item.filename}>
                  {item.filename}
                </h4>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center text-sm font-medium text-slate-500 dark:text-slate-400 gap-2">
                    <Calendar size={16} />
                    {new Date(item.date).toLocaleDateString()}
                  </div>
                  <div className="flex items-center text-sm font-medium text-slate-500 dark:text-slate-400 gap-2">
                    <HardDrive size={16} />
                    {formatBytes(item.size)} • {item.type.split('/')[0]}
                  </div>
                </div>
              </div>

              {item.status === 'completed' ? (
                <a 
                  href={`${API_BASE}/api/media/serve/${item.id}?token=${token}`} 
                  download 
                  target="_blank"
                  rel="noreferrer"
                  className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-3.5 rounded-2xl font-bold text-sm hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <Download size={18} /> Open File
                </a>
              ) : (
                <div className="w-full bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 py-3.5 rounded-2xl font-bold text-sm text-center flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200 dark:border-slate-700">
                  <Loader2 className="animate-spin" size={18} /> Processing
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {nextCursor && !searchQuery && (
        <div className="flex justify-center pt-8">
          <button 
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700 px-8 py-4 rounded-2xl font-bold text-slate-700 dark:text-white hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center gap-2 shadow-sm"
          >
            {loadingMore ? <Loader2 className="animate-spin" size={20} /> : 'Load More Downloads'}
          </button>
        </div>
      )}
    </div>
  );
};

export default History;

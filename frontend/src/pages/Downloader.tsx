import React, { useState } from 'react';
import axios from 'axios';
import { Search, Loader2, Download, PlayCircle, Clock, AlertCircle } from 'lucide-react';
import { API_BASE } from '../config';

const RESOLUTION_OPTIONS = [
  { label: "240p (Low)", value: "240p" },
  { label: "360p (SD)", value: "360p" },
  { label: "480p (SD)", value: "480p" },
  { label: "720p (HD)", value: "720p" },
  { label: "1080p (Full HD)", value: "1080p" },
  { label: "2K (QHD)", value: "2k" },
  { label: "4K (UHD)", value: "4k" }
];

const Downloader = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [resolution, setResolution] = useState('1080p');
  const [error, setError] = useState('');

  const fetchMetadata = async () => {
    if (!url) return;
    setLoading(true);
    setError('');
    setMetadata(null);
    try {
      const res = await axios.post(`${API_BASE}/api/media/metadata`, { 
        url,
        platform: 'youtube'
      }, { withCredentials: true });
      setMetadata(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to analyze video URL.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!metadata && !url) return;
    
    // Construct Direct Stream Download Query
    const queryParams = new URLSearchParams({
      url: metadata?.url || url,
      platform: 'youtube',
      title: metadata?.title || 'YouTube_Video',
      resolution: resolution
    });
    
    const fileUrl = `/api/media/download?${queryParams.toString()}`;
    
    // Programmatic Virtual Anchor Trigger (Zero RAM footprint)
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = ''; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown Duration';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const renderSkeleton = () => (
    <div className="bg-slate-800/60 backdrop-blur-xl rounded-[2rem] p-6 shadow-2xl border border-slate-700/50 animate-pulse mt-8 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-80 h-48 bg-slate-700/50 rounded-2xl"></div>
        <div className="flex-1 space-y-4 py-4">
          <div className="h-8 bg-slate-700/50 rounded-lg w-3/4"></div>
          <div className="h-5 bg-slate-700/50 rounded-lg w-1/3"></div>
          <div className="pt-6 flex gap-4">
            <div className="h-12 bg-slate-700/50 rounded-xl w-40"></div>
            <div className="h-12 bg-slate-700/50 rounded-xl w-48"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-12 space-y-10 min-h-[70vh]">
      
      {/* Header Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-4 bg-red-500/10 rounded-full mb-2">
          <PlayCircle className="w-12 h-12 text-red-500" />
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight">
          Chikko <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-rose-400">Downloader</span>
        </h2>
        <p className="text-lg text-slate-400 font-medium max-w-2xl mx-auto">
          Instantly stream and save YouTube videos and shorts in ultra-high quality, powered by Zero-Disk native extraction.
        </p>
      </div>

      {/* Input Deck */}
      <div className="relative group max-w-3xl mx-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-500 rounded-[2rem] blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
        <div className="relative flex flex-col md:flex-row gap-3 p-2 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-[2rem] shadow-2xl">
          <input 
            type="url" 
            className="flex-1 px-8 py-5 rounded-[1.5rem] bg-transparent text-white placeholder:text-slate-500 outline-none font-medium text-lg"
            placeholder="Paste YouTube Video or Shorts URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchMetadata()}
          />
          
          <button 
            className={`px-10 py-5 rounded-[1.5rem] font-bold text-lg text-white flex items-center justify-center gap-3 transition-all duration-300 ${
              loading || !url ? "bg-slate-800 cursor-not-allowed text-slate-500" : "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-500/30 hover:scale-[1.02]"
            }`}
            onClick={fetchMetadata} 
            disabled={loading || !url}
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : <Search size={24} />}
            {loading ? 'Analyzing...' : 'Fetch Video'}
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
            <AlertCircle size={20} className="shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && renderSkeleton()}

      {/* Metadata Showcase Card */}
      {metadata && !loading && (
        <div className="max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-slate-800/40 backdrop-blur-xl rounded-[2rem] p-6 shadow-2xl border border-slate-700/50 overflow-hidden relative">
            <div className="flex flex-col md:flex-row gap-8 relative z-10">
              
              {/* Thumbnail Container */}
              <div className="w-full md:w-80 shrink-0 relative rounded-2xl overflow-hidden group shadow-lg shadow-black/40 bg-slate-900">
                <img 
                  src={metadata.thumbnail} 
                  alt={metadata.title}
                  className="w-full h-full object-cover aspect-video group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent"></div>
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-bold text-white border border-white/10">
                  <Clock size={14} className="text-red-400" />
                  {formatDuration(metadata.duration)}
                </div>
              </div>

              {/* Video Details & Actions */}
              <div className="flex flex-col justify-center flex-1 py-2">
                <h3 className="text-2xl font-bold text-white leading-tight line-clamp-2 mb-6" title={metadata.title}>
                  {metadata.title || "YouTube Media Stream"}
                </h3>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 mt-auto">
                  {/* Resolution Dropdown */}
                  <div className="relative w-full sm:w-48 group">
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      className="w-full pl-5 pr-10 py-4 rounded-xl bg-slate-900/80 border border-slate-700 text-white outline-none font-bold text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-red-500/50 transition-all hover:bg-slate-800"
                    >
                      {RESOLUTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-slate-900 text-white font-medium py-2">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-slate-400 group-hover:text-red-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Native Download Trigger CTA */}
                  <button 
                    onClick={handleDownload}
                    className="w-full sm:flex-1 py-4 px-6 rounded-xl font-bold text-lg text-white flex items-center justify-center gap-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-xl shadow-red-600/20 hover:shadow-red-600/40 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
                    <Download size={22} className="relative z-10" /> 
                    <span className="relative z-10">Download Now</span>
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

export default Downloader;

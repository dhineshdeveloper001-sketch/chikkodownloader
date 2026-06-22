import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Search, Loader2, Download, Video, Music, PlayCircle, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { API_BASE } from '../config';

const formatBytes = (bytes: number | string, decimals = 2) => {
  const numBytes = Number(bytes);
  if (!numBytes) return 'Unknown Size';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  return `${parseFloat((numBytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// React.memo to prevent re-renders of all cards when progress changes
const FormatCard = React.memo(({ f, activeTab, prog, isDownloading, isDone, onDownload, downloadingId }: any) => {
  return (
    <div className="relative group bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-3xl p-5 border border-slate-200/50 dark:border-slate-700/50 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 overflow-hidden">
      {/* Progress Bar Background */}
      {(isDownloading || isDone) && (
        <div className="absolute inset-0 bg-indigo-50 dark:bg-indigo-900/20 z-0 transition-all duration-500 ease-out" style={{ width: `${prog?.percent || (isDone ? 100 : 0)}%` }}></div>
      )}
      
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-5">
          <div className="flex flex-col">
            <span className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
              {activeTab === 'video' ? f.resolution : f.bitrate}
            </span>
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
              {f.ext} {f.fps ? `• ${f.fps} FPS` : ''}
            </span>
          </div>
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
            {formatBytes(f.size)}
          </div>
        </div>

        <button 
          onClick={() => onDownload(f.formatId, activeTab)}
          disabled={isDownloading || isDone || (downloadingId !== null && downloadingId !== f.formatId)}
          className={clsx(
            "w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
            isDone ? "bg-green-500 text-white shadow-lg shadow-green-500/30" :
            isDownloading ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30" :
            "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white shadow-lg disabled:opacity-50"
          )}
        >
          {isDone ? (
            <><CheckCircle size={18} /> Saved</>
          ) : isDownloading ? (
            <><Loader2 className="animate-spin" size={18} /> {prog?.percent || 0}%</>
          ) : (
            <><Download size={18} /> Download</>
          )}
        </button>
      </div>
    </div>
  );
});

const Downloader = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progresses, setProgresses] = useState<Record<string, any>>({});
  const { token } = useAuth();

  const fetchMetadata = async () => {
    if (!url) return;
    setLoading(true);
    setMetadata(null);
    try {
      const res = await axios.post(`${API_BASE}/api/media/metadata`, { url });
      setMetadata(res.data);
      if (res.data.formats && res.data.formats.video?.length === 0 && res.data.formats.audio?.length > 0) {
        setActiveTab('audio');
      } else {
        setActiveTab('video');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to fetch media information');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = useCallback(async (formatId: string | null, type: 'video' | 'audio') => {
    if (!metadata) return;
    
    const downloadKey = formatId || 'default';
    setDownloadingId(downloadKey);
    setProgresses(prev => ({ ...prev, [downloadKey]: { status: 'starting', percent: 0 } }));

    try {
      const res = await axios.post(`${API_BASE}/api/media/download`, {
        url: metadata.url,
        filename: metadata.filename,
        size: metadata.size,
        contentType: metadata.contentType,
        isYtDlp: metadata.isYtDlp,
        formatId,
        downloadType: type
      });
      
      const { id } = res.data;
      const eventSource = new EventSource(`${API_BASE}/api/media/progress/${id}?token=${token}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'completed') {
          setProgresses(prev => ({ ...prev, [downloadKey]: { ...data, percent: 100, status: 'completed' } }));
          setDownloadingId(null);
          eventSource.close();
          toast.success('Download completed!');

          // Trigger actual browser download
          const fileUrl = `${API_BASE}/api/media/serve/${id}?token=${token}`;
          const a = document.createElement('a');
          a.href = fileUrl;
          a.download = ''; 
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else if (data.status === 'error' || data.status === 'not_found') {
          toast.error(data.status === 'not_found' ? 'Download session expired or not found.' : 'An error occurred during download.');
          setDownloadingId(null);
          eventSource.close();
        } else {
          const percent = data.percent !== undefined ? data.percent : (data.size ? Math.round((data.downloaded / data.size) * 100) : 0);
          setProgresses(prev => ({ ...prev, [downloadKey]: { ...data, percent } }));
        }
      };

      eventSource.onerror = (e) => {
        // Only show lost connection if we are still supposedly downloading and the connection dropped unexpectedly
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
          setDownloadingId(null);
          toast.error('Lost connection to download progress.');
        }
      };
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start download');
      setDownloadingId(null);
    }
  }, [metadata, token]);

  const renderSkeleton = () => (
    <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl border border-white/20 dark:border-slate-700/50 animate-pulse mt-8">
      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-72 h-48 bg-slate-200 dark:bg-slate-700 rounded-3xl"></div>
        <div className="flex-1 space-y-5 py-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg w-3/4"></div>
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/2"></div>
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/4 mt-6"></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-10">
      <div className="text-center md:text-left">
        <h2 className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tight">Download Media</h2>
        <p className="text-lg text-slate-500 dark:text-slate-400 mt-3 font-medium">Paste a direct URL to save videos and music offline in ultra-high quality.</p>
      </div>

      <div className="relative group max-w-4xl mx-auto md:mx-0">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2.5rem] blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
        <div className="relative flex flex-col md:flex-row gap-4 p-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 rounded-[2.5rem] shadow-2xl shadow-indigo-500/10">
          <input 
            type="url" 
            className="flex-1 px-8 py-5 rounded-[2rem] bg-transparent text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none font-medium text-lg"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchMetadata()}
          />
          <button 
            className={clsx(
              "px-10 py-5 rounded-[2rem] font-bold text-lg text-white flex items-center justify-center gap-3 transition-all",
              loading || !url ? "bg-slate-300 dark:bg-slate-800 cursor-not-allowed text-slate-500" : "bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 hover:scale-[1.02]"
            )}
            onClick={fetchMetadata} 
            disabled={loading || !url}
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : <Search size={24} />}
            {loading ? 'Analyzing...' : 'Fetch Media'}
          </button>
        </div>
      </div>

      {loading && renderSkeleton()}

      {metadata && !loading && (
        <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/50 dark:shadow-none border border-white/40 dark:border-slate-700/50 animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Media Info Panel */}
          <div className="flex flex-col md:flex-row gap-8 p-8 md:p-10 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/40 dark:bg-slate-900/40">
            {metadata.thumbnail ? (
              <img src={metadata.thumbnail} alt="Thumbnail" className="w-full md:w-80 h-48 object-cover rounded-3xl shadow-xl" />
            ) : (
              <div className="w-full md:w-80 h-48 bg-slate-200/50 dark:bg-slate-800/50 rounded-3xl flex items-center justify-center text-slate-400">
                <PlayCircle size={64} strokeWidth={1.5} opacity={0.5} />
              </div>
            )}
            <div className="flex flex-col justify-center flex-1">
              <h3 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white line-clamp-2 leading-tight" title={metadata.title || metadata.filename}>
                {metadata.title || metadata.filename}
              </h3>
              <div className="flex flex-wrap items-center gap-3 mt-6 text-sm font-bold">
                {metadata.duration && (
                  <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 px-4 py-2 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
                    {metadata.duration}
                  </span>
                )}
                {!metadata.isYtDlp && (
                  <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                    {formatBytes(metadata.size)}
                  </span>
                )}
                <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                  {metadata.contentType}
                </span>
              </div>
            </div>
          </div>

          <div className="p-8 md:p-10">
            {metadata.formats ? (
              <>
                <div className="flex p-1.5 bg-slate-200/50 dark:bg-slate-900/50 backdrop-blur rounded-2xl max-w-sm mb-8 mx-auto md:mx-0">
                  <button 
                    onClick={() => setActiveTab('video')}
                    className={clsx(
                      "flex-1 py-3 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300",
                      activeTab === 'video' ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                  >
                    <Video size={18} /> Video
                  </button>
                  <button 
                    onClick={() => setActiveTab('audio')}
                    className={clsx(
                      "flex-1 py-3 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300",
                      activeTab === 'audio' ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                  >
                    <Music size={18} /> Audio
                  </button>
                </div>

                {/* Bento Format Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {metadata.formats[activeTab]?.map((f: any) => (
                    <FormatCard 
                      key={f.formatId}
                      f={f}
                      activeTab={activeTab}
                      prog={progresses[f.formatId]}
                      isDownloading={downloadingId === f.formatId}
                      isDone={progresses[f.formatId]?.status === 'completed'}
                      downloadingId={downloadingId}
                      onDownload={handleDownload}
                    />
                  ))}
                </div>
                {(!metadata.formats[activeTab] || metadata.formats[activeTab].length === 0) && (
                  <div className="text-center py-16 text-slate-500 font-medium">
                    No {activeTab} formats available.
                  </div>
                )}
              </>
            ) : (
              /* Simple File Download UI */
              <div className="flex flex-col md:flex-row items-center justify-between p-8 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-3xl border border-indigo-100 dark:border-indigo-500/20">
                <div className="text-center md:text-left mb-6 md:mb-0">
                  <h4 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Direct File Download</h4>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">Securely download this file directly to your device.</p>
                </div>
                <div className="w-full md:w-auto">
                  <button 
                    onClick={() => handleDownload(null, 'video')}
                    disabled={downloadingId !== null}
                    className={clsx(
                      "w-full md:w-auto px-10 py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-3 transition-all shadow-xl",
                      progresses['default']?.status === 'completed' ? "bg-green-500 hover:bg-green-600 shadow-green-500/30" : 
                      downloadingId === 'default' ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 hover:scale-105 shadow-indigo-600/30"
                    )}
                  >
                    {progresses['default']?.status === 'completed' ? (
                      <><CheckCircle size={24} /> Completed</>
                    ) : downloadingId === 'default' ? (
                      <><Loader2 className="animate-spin" size={24} /> {progresses['default']?.percent || 0}%</>
                    ) : (
                      <><Download size={24} /> Download File</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Downloader;

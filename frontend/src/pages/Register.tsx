import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { API_BASE } from '../config';
import { Link, useNavigate } from 'react-router-dom';
import { DownloadCloud, Mail, Lock, User, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

const Register = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/register`, { name, email, password });
      login(res.data.token, res.data.user);
      navigate('/');
      toast.success('Registration successful! Welcome to Chikko Downloader.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-indigo-900 to-slate-900 flex items-center justify-center p-6 relative overflow-hidden font-sans">
      
      {/* Decorative Blur Orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-40 animate-pulse"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-40 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-md relative z-10 my-8">
        <div className="text-center mb-10">
          <div className="inline-flex bg-white/10 p-4 rounded-3xl backdrop-blur-md border border-white/20 shadow-2xl mb-6">
            <DownloadCloud className="text-white" size={48} strokeWidth={1.5} />
          </div>
          <h2 className="text-4xl font-extrabold text-white tracking-tight mb-2">Create Account</h2>
          <p className="text-indigo-200/80 font-medium text-lg">Sign up to securely save your media offline.</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-[2.5rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-indigo-100 ml-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-indigo-300" />
                </div>
                <input 
                  type="text" 
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 text-white rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all placeholder:text-indigo-300/50 font-medium"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-indigo-100 ml-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-indigo-300" />
                </div>
                <input 
                  type="email" 
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 text-white rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all placeholder:text-indigo-300/50 font-medium"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-indigo-100 ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-indigo-300" />
                </div>
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/10 text-white rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all placeholder:text-indigo-300/50 font-medium"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-indigo-300 hover:text-white transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-white text-indigo-900 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-50 focus:ring-4 focus:ring-white/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed mt-4"
            >
              {loading ? <Loader2 className="animate-spin" size={24} /> : (
                <>
                  Sign Up Free
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-indigo-200 font-medium">
            Already have an account? <Link to="/login" className="text-white font-bold hover:underline underline-offset-4">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;

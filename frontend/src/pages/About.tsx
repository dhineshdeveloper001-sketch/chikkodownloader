import React from 'react';
import { Mail, User, Code, Server, ShieldCheck, Zap } from 'lucide-react';

const About = () => {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-12 min-h-[70vh]">
      <div className="text-center space-y-4 mb-16">
        <div className="inline-flex items-center justify-center p-4 bg-indigo-500/10 rounded-full mb-2 shadow-inner">
          <Code className="w-12 h-12 text-indigo-500" />
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight">
          About <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-400">Developer</span>
        </h2>
        <p className="text-lg text-slate-400 font-medium max-w-2xl mx-auto">
          Built with precision, powered by zero-disk architecture, and secured with enterprise-grade protection.
        </p>
      </div>

      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row gap-10 items-center md:items-start">
          
          <div className="w-32 h-32 md:w-40 md:h-40 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-1 shadow-xl shadow-indigo-500/20 transform hover:scale-105 transition-transform duration-300">
            <div className="w-full h-full bg-slate-900 rounded-[1.4rem] flex items-center justify-center">
              <User className="w-16 h-16 text-indigo-400" strokeWidth={1.5} />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left space-y-6">
            <div>
              <h3 className="text-3xl font-black text-white mb-2">Dhineshkumar J</h3>
              <p className="text-xl text-indigo-400 font-bold tracking-wide">BE Computer Science Engineering</p>
            </div>

            <div className="flex flex-col gap-3">
              <a href="mailto:dhineshdeveloper001@gmail.com" className="inline-flex items-center justify-center md:justify-start gap-3 text-slate-300 hover:text-white transition-colors group">
                <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors border border-slate-700/50">
                  <Mail size={18} />
                </div>
                <span className="font-medium text-lg">dhineshdeveloper001@gmail.com</span>
              </a>
            </div>
            

          </div>
        </div>
      </div>
    </div>
  );
};

export default About;

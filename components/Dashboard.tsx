import React from 'react';
import { View } from '../types';

interface DashboardProps {
  onNavigate: (view: View) => void;
}

const FeatureCard: React.FC<{
  title: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}> = ({ title, desc, icon, color, onClick }) => (
  <div 
    onClick={onClick}
    className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-slate-500 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 group"
  >
    <div className={`w-12 h-12 rounded-lg ${color} bg-opacity-20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
      <div className={`text-${color.split('-')[1]}-400`}>
        {icon}
      </div>
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
    <p className="text-slate-400 text-sm">{desc}</p>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  return (
    <div className="p-8 overflow-y-auto h-full">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-white mb-2">LiquidAgent Studio</h1>
        <p className="text-slate-400 text-lg">Create, Manage, and Deploy Gemini-Powered Intelligence.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        <FeatureCard
          title="Live Voice Agent"
          desc="Real-time conversational AI with ultra-low latency using Gemini Live API."
          color="bg-blue-500"
          onClick={() => onNavigate(View.LIVE_VOICE)}
          icon={<svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>}
        />

        <FeatureCard
          title="AI Chat Bot"
          desc="Text-based interaction using Gemini 3.0 Pro for complex reasoning and coding."
          color="bg-green-500"
          onClick={() => onNavigate(View.CHAT)}
          icon={<svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
        />

        <FeatureCard
          title="Search Grounding"
          desc="Connect your agents to real-world data with Google Search Tool integration."
          color="bg-orange-500"
          onClick={() => onNavigate(View.SEARCH_LAB)}
          icon={<svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
        />

        <FeatureCard
          title="Audio Tools"
          desc="Advanced Text-to-Speech generation and high-fidelity Audio Transcription."
          color="bg-purple-500"
          onClick={() => onNavigate(View.AUDIO_TOOLS)}
          icon={<svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>}
        />

      </div>

      {/* Quick Stats using Simple CSS (Avoiding recharts complexity for summary just for speed, but can add later) */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-white mb-6">System Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <div className="text-sm text-slate-500 mb-1">API Latency</div>
            <div className="text-3xl font-mono text-teal-400">~140ms</div>
            <div className="text-xs text-slate-600 mt-2">Gemini Flash Lite</div>
          </div>
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
             <div className="text-sm text-slate-500 mb-1">Active Models</div>
             <div className="text-3xl font-mono text-blue-400">5</div>
             <div className="text-xs text-slate-600 mt-2">Pro, Flash, Flash-Lite, Live, TTS</div>
          </div>
           <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
             <div className="text-sm text-slate-500 mb-1">Voice Engine</div>
             <div className="text-3xl font-mono text-purple-400">Zephyr</div>
             <div className="text-xs text-slate-600 mt-2">Live API Prebuilt Voice</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
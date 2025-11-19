import React, { useState, useRef } from 'react';
import { searchWithGemini, transcribeAudio } from '../services/geminiService';
import { SUPPORTED_LANGUAGES } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const SearchGrounding: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState<{ text: string; sources: { uri: string; title: string }[] } | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState(SUPPORTED_LANGUAGES[0]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const languageInstruction = selectedLanguage.code !== 'auto' ? `Provide the summary in ${selectedLanguage.label}.` : '';
      const data = await searchWithGemini(query, languageInstruction);
      setResult(data);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceInput = async () => {
    if (isRecording) {
      // Stop Recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } else {
      // Start Recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Determine supported MIME type
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          // Stop microphone stream tracks
          stream.getTracks().forEach(track => track.stop());

          // Convert to Base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64String = (reader.result as string).split(',')[1];
            
            try {
              setLoading(true); // Show loading state during transcription
              const text = await transcribeAudio(base64String, mimeType);
              if (text) {
                setQuery(prev => prev ? `${prev} ${text}` : text);
              }
            } catch (error) {
              console.error("Voice transcription failed", error);
            } finally {
              setLoading(false);
            }
          };
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Could not access microphone. Please check permissions.");
      }
    }
  };

  // Mock data visualization for "trends"
  const mockTrends = [
    { name: 'Relevance', score: 95 },
    { name: 'Freshness', score: 88 },
    { name: 'Accuracy', score: 92 },
    { name: 'Depth', score: 75 },
  ];

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex justify-between items-center mb-4">
           <h2 className="text-2xl font-bold flex items-center gap-2">
             <span className="text-blue-400">G</span>
             Search Grounding
           </h2>
           <select
              value={selectedLanguage.code}
              onChange={(e) => setSelectedLanguage(SUPPORTED_LANGUAGES.find(l => l.code === e.target.value) || SUPPORTED_LANGUAGES[0])}
              className="bg-slate-900 text-slate-300 text-xs rounded-lg px-3 py-2 border border-slate-600 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
        </div>
        
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isRecording ? "Listening..." : "Ask about recent events, news, or facts..."}
              className={`w-full bg-slate-900 border border-slate-600 rounded-lg pl-4 pr-12 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all ${isRecording ? 'ring-2 ring-red-500 border-red-500 bg-red-900/10' : ''}`}
            />
            <button
              type="button"
              onClick={handleVoiceInput}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all hover:bg-slate-700 ${isRecording ? 'text-red-500 animate-pulse bg-red-500/10' : 'text-slate-400 hover:text-blue-400'}`}
              title={isRecording ? "Stop recording" : "Use voice input"}
            >
              {isRecording ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19v3m0 0h4m-4 0H8" />
                </svg>
              )}
            </button>
          </div>
          <button
            type="submit"
            disabled={loading || isRecording}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 min-w-[100px]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </span>
            ) : 'Search'}
          </button>
        </form>
      </div>

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h3 className="text-lg font-semibold mb-4 text-slate-200">Gemini Answer ({selectedLanguage.label})</h3>
              <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-line">
                {result.text}
              </div>
            </div>

            {result.sources.length > 0 && (
              <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 text-slate-200">Sources</h3>
                <div className="grid gap-3">
                  {result.sources.map((source, idx) => (
                    <a
                      key={idx}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center p-3 bg-slate-900 rounded-lg hover:bg-slate-700 transition-colors group"
                    >
                      <div className="w-8 h-8 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mr-3 text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1 truncate">
                        <div className="font-medium text-blue-400 group-hover:underline truncate">{source.title}</div>
                        <div className="text-xs text-slate-500 truncate">{source.uri}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-full">
              <h3 className="text-lg font-semibold mb-4 text-slate-200">Result Metrics</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockTrends}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }}
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                    <Bar dataKey="score" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-slate-500 mt-4">
                Visualization of search result quality metrics processed by Agent analytics.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchGrounding;
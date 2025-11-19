import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ModelType, ChatMessage, GEMINI_VOICES, SUPPORTED_LANGUAGES } from '../types';
import { decodeAudioData, convertPCMToAudioBuffer, encodeAudioData } from '../services/geminiService';

const LiveVoice: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [volume, setVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  // Configuration State
  const [selectedVoice, setSelectedVoice] = useState(GEMINI_VOICES[4].name); // Default Zephyr
  const [selectedLanguage, setSelectedLanguage] = useState(SUPPORTED_LANGUAGES[0]); // Default English

  // Transcript State
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [realtimeText, setRealtimeText] = useState<{ role: 'user' | 'model', text: string } | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Transcription buffers
  const currentInputBuffer = useRef<string>('');
  const currentOutputBuffer = useRef<string>('');
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of transcript
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript, realtimeText]);

  // Initialize Audio Contexts
  const initAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (!inputContextRef.current) {
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    
    // Resume context if suspended (browser autoplay policy)
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  const createBlob = (data: Float32Array) => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encodeAudioData(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const connect = async () => {
    setErrorMessage('');
    setStatus('connecting');
    setPermissionDenied(false);
    setTranscript([]); // Clear transcript on new connection
    currentInputBuffer.current = '';
    currentOutputBuffer.current = '';
    
    try {
      await initAudio();
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      // Request Microphone Permission specifically
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (permError) {
        console.error("Microphone permission denied:", permError);
        setPermissionDenied(true);
        throw new Error("Microphone permission denied");
      }
      
      const sessionPromise = ai.live.connect({
        model: ModelType.LIVE,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are a helpful, witty, and knowledgeable AI assistant within the LiquidAgent Studio. Keep responses concise. ${selectedLanguage.instruction}`,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
          },
        },
        callbacks: {
          onopen: () => {
            setStatus('connected');
            setIsConnected(true);

            // Setup Input Stream
            if (inputContextRef.current && streamRef.current) {
              const source = inputContextRef.current.createMediaStreamSource(streamRef.current);
              const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Calculate volume for visualizer
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                setVolume(Math.sqrt(sum / inputData.length));

                const pcmBlob = createBlob(inputData);
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };

              source.connect(processor);
              processor.connect(inputContextRef.current.destination);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;

            // Handle Transcription
            if (serverContent?.inputTranscription) {
              const text = serverContent.inputTranscription.text;
              if (text) {
                 currentInputBuffer.current += text;
                 setRealtimeText({ role: 'user', text: currentInputBuffer.current });
              }
            }
            
            if (serverContent?.outputTranscription) {
              const text = serverContent.outputTranscription.text;
              if (text) {
                currentOutputBuffer.current += text;
                setRealtimeText({ role: 'model', text: currentOutputBuffer.current });
              }
            }

            if (serverContent?.turnComplete) {
              // Commit user transcript if exists
              if (currentInputBuffer.current.trim()) {
                setTranscript(prev => [...prev, {
                  id: Date.now().toString() + '-user',
                  role: 'user',
                  text: currentInputBuffer.current.trim(),
                  timestamp: Date.now()
                }]);
                currentInputBuffer.current = '';
              }
              
              // Commit model transcript if exists
              if (currentOutputBuffer.current.trim()) {
                 setTranscript(prev => [...prev, {
                  id: Date.now().toString() + '-model',
                  role: 'model',
                  text: currentOutputBuffer.current.trim(),
                  timestamp: Date.now()
                }]);
                currentOutputBuffer.current = '';
              }
              
              setRealtimeText(null);
            }

            // Handle Audio
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await convertPCMToAudioBuffer(
                decodeAudioData(base64Audio),
                ctx,
                24000,
                1
              );

              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(source => source.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              currentOutputBuffer.current = ''; // Clear interrupted output
              setRealtimeText(null);
            }
          },
          onclose: () => {
            setStatus('disconnected');
            setIsConnected(false);
          },
          onerror: (e) => {
            console.error("Live API Error", e);
            setErrorMessage("Connection error. Check console for details.");
            setStatus('error');
            setIsConnected(false);
          }
        }
      });

      sessionRef.current = sessionPromise;

    } catch (error: any) {
      console.error("Connection failed", error);
      setStatus('error');
      if (error.message.includes('Microphone') || error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setErrorMessage("Microphone access was denied. Please allow microphone permissions in your browser settings and reload the page.");
        setPermissionDenied(true);
      } else {
        setErrorMessage("Failed to connect. Please try again.");
      }
      setIsConnected(false);
    }
  };

  const disconnect = async () => {
    if (sessionRef.current) {
        const session = await sessionRef.current;
        session.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setStatus('disconnected');
    setIsConnected(false);
    setVolume(0);
    setErrorMessage('');
    setPermissionDenied(false);
    setRealtimeText(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Action Handlers
  const handleDownload = () => {
    if (transcript.length === 0) return;
    const textContent = transcript
      .map(t => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.role.toUpperCase()}: ${t.text}`)
      .join('\n\n');
    
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live-transcript-${new Date().toISOString().slice(0, 19)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    if (transcript.length === 0) return;
    const jsonContent = JSON.stringify(transcript, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live-session-${new Date().toISOString().slice(0, 19)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row bg-slate-950 overflow-hidden">
      
      {/* Left Panel: Visualizer & Controls */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800">
        
        {/* Background Pulse Effect */}
        <div className={`absolute w-96 h-96 rounded-full blur-3xl transition-all duration-300 ease-out z-0
          ${status === 'connected' ? 'bg-blue-500/20 scale-125' : 'bg-slate-800/10 scale-75'}
        `} style={{ transform: `scale(${1 + volume * 5})` }} />

        {/* Voice Configuration (Only when disconnected) */}
        {!isConnected && (
          <div className="absolute top-4 left-0 right-0 px-8 flex flex-wrap justify-center gap-4 z-20">
            <div className="bg-slate-800/80 backdrop-blur rounded-lg p-1 border border-slate-700 flex items-center gap-2">
              <span className="text-xs text-slate-400 ml-2 uppercase font-bold">Voice</span>
              <select 
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="bg-slate-900 text-white text-sm rounded p-1.5 border-none outline-none focus:ring-2 focus:ring-blue-500"
              >
                {GEMINI_VOICES.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.gender})</option>
                ))}
              </select>
            </div>
            <div className="bg-slate-800/80 backdrop-blur rounded-lg p-1 border border-slate-700 flex items-center gap-2">
              <span className="text-xs text-slate-400 ml-2 uppercase font-bold">Language</span>
              <select 
                value={selectedLanguage.code}
                onChange={(e) => setSelectedLanguage(SUPPORTED_LANGUAGES.find(l => l.code === e.target.value) || SUPPORTED_LANGUAGES[0])}
                className="bg-slate-900 text-white text-sm rounded p-1.5 border-none outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SUPPORTED_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="z-10 text-center space-y-8 relative mt-10">
          <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
            Gemini Live
          </h2>
          
          <div className="relative group flex justify-center">
            <div className={`w-48 h-48 rounded-full flex items-center justify-center border-4 transition-all duration-500 bg-slate-900
              ${status === 'connected' ? 'border-blue-400 shadow-[0_0_50px_rgba(96,165,250,0.5)]' : 
                status === 'connecting' ? 'border-yellow-400 animate-pulse' : 
                (status === 'error' || permissionDenied) ? 'border-red-500' : 'border-slate-600'}
            `}>
              {status === 'connected' ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-blue-400 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ) : (status === 'error' || permissionDenied) ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                </svg>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center space-y-2 min-h-[80px]">
            <div className="text-slate-300 font-medium text-lg">
              {status === 'disconnected' && !permissionDenied && `Ready to connect (${selectedVoice} - ${selectedLanguage.label})`}
              {status === 'connecting' && "Establishing connection..."}
              {status === 'connected' && "Listening..."}
              {status === 'error' && !permissionDenied && "Connection failed"}
              {permissionDenied && "Permission Denied"}
            </div>
            {errorMessage && (
               <div className={`text-sm max-w-md p-3 rounded-lg border ${permissionDenied ? 'bg-red-900/50 border-red-500 text-red-200 font-semibold' : 'bg-red-900/20 border-red-500/30 text-red-400'}`}>
                 {errorMessage}
               </div>
            )}
          </div>

          <button
            onClick={isConnected ? disconnect : connect}
            disabled={permissionDenied || status === 'connecting'}
            className={`px-8 py-3 rounded-full font-bold text-white transition-all duration-300 shadow-lg transform 
              ${isConnected 
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30 hover:scale-105' 
                : permissionDenied 
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed shadow-none' 
                  : status === 'connecting'
                    ? 'bg-blue-400 cursor-wait shadow-blue-500/20'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30 hover:scale-105'}
            `}
          >
            {isConnected ? 'End Session' : permissionDenied ? 'Permission Denied' : status === 'connecting' ? 'Connecting...' : 'Start Conversation'}
          </button>
        </div>
      </div>

      {/* Right Panel: Live Transcript */}
      <div className="flex-1 flex flex-col bg-slate-900 h-full border-l border-slate-800 min-w-[350px]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm">
          <h3 className="font-bold text-slate-200 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Live Transcript
          </h3>
          <div className="flex gap-2">
             <button 
              onClick={handleSave}
              disabled={transcript.length === 0}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors disabled:opacity-50"
              title="Save as JSON"
            >
              Save JSON
            </button>
            <button 
              onClick={handleDownload}
              disabled={transcript.length === 0}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-lg transition-colors disabled:opacity-50"
              title="Download as Text"
            >
              Download
            </button>
          </div>
        </div>
        
        <div 
          ref={transcriptContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
        >
          {transcript.length === 0 && !realtimeText && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 opacity-60">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <p className="text-sm">Transcript will appear here...</p>
            </div>
          )}

          {transcript.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
              }`}>
                <div className="text-[10px] opacity-50 mb-1">{msg.role === 'user' ? 'You' : 'Gemini'} • {new Date(msg.timestamp).toLocaleTimeString()}</div>
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
              </div>
            </div>
          ))}

          {realtimeText && (
             <div className={`flex ${realtimeText.role === 'user' ? 'justify-end' : 'justify-start'} animate-pulse opacity-80`}>
               <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                 realtimeText.role === 'user' 
                   ? 'bg-blue-600/70 text-white rounded-br-none' 
                   : 'bg-slate-800/70 text-slate-200 border border-slate-700 rounded-bl-none'
               }`}>
                 <div className="text-[10px] opacity-50 mb-1">{realtimeText.role === 'user' ? 'You' : 'Gemini'} • Live...</div>
                 <div className="whitespace-pre-wrap leading-relaxed">{realtimeText.text}</div>
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveVoice;
import React, { useState, useRef } from 'react';
import { generateSpeech, transcribeAudio } from '../services/geminiService';
import { GEMINI_VOICES } from '../types';

// Helper to create a WAV file header and Blob from raw PCM data
const createWavBlob = (samples: Int16Array, sampleRate: number = 24000) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF identifier
  writeString(0, 'RIFF');
  // file length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(8, 'WAVE');
  // format chunk identifier
  writeString(12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count (mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(36, 'data');
  // data chunk length
  view.setUint32(40, samples.length * 2, true);

  // write the PCM samples
  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset + i * 2, samples[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
};

const AudioTools: React.FC = () => {
  // TTS State
  const [ttsText, setTtsText] = useState('');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(GEMINI_VOICES[2].name); // Default Kore
  const [audioDownloadUrl, setAudioDownloadUrl] = useState<string | null>(null);
  const [volume, setVolume] = useState(1.0);
  
  const activeGainNode = useRef<GainNode | null>(null);

  // Transcription State
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // -- TTS Handler --
  const handleGenerateSpeech = async () => {
    if (!ttsText) return;
    setTtsLoading(true);
    setAudioDownloadUrl(null); // Reset previous download
    try {
      const base64Audio = await generateSpeech(ttsText, selectedVoice);
      if (base64Audio) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        
        // Create Int16Array for both playback and WAV creation
        const dataInt16 = new Int16Array(bytes.buffer);
        
        // 1. Prepare for Playback
        const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
        
        // Create Gain Node for Volume Control
        const gainNode = audioContext.createGain();
        gainNode.gain.value = volume;
        activeGainNode.current = gainNode;

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        
        // Connect: Source -> Gain -> Destination
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        source.start();

        // 2. Prepare for Download (WAV)
        const wavBlob = createWavBlob(dataInt16, 24000);
        const url = URL.createObjectURL(wavBlob);
        setAudioDownloadUrl(url);
      }
    } catch (error) {
      console.error("TTS Error", error);
    } finally {
      setTtsLoading(false);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (activeGainNode.current) {
      activeGainNode.current.gain.value = newVolume;
    }
  };

  // -- Transcription Handlers --
  
  // File Upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = (e.target?.result as string).split(',')[1];
        const result = await transcribeAudio(base64String, file.type);
        setTranscriptionResult(result || "No transcription generated.");
        setIsTranscribing(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Transcription Error", error);
      setTranscriptionResult("Error processing audio file.");
      setIsTranscribing(false);
    }
  };

  // Microphone Recording
  const handleMicRecord = async () => {
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
        
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          stream.getTracks().forEach(track => track.stop());

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64String = (reader.result as string).split(',')[1];
            try {
              setIsTranscribing(true);
              const text = await transcribeAudio(base64String, mimeType);
              setTranscriptionResult(text || "No speech detected.");
            } catch (error) {
              console.error("Voice transcription failed", error);
              setTranscriptionResult("Error transcribing microphone input.");
            } finally {
              setIsTranscribing(false);
            }
          };
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone Error:", err);
        alert("Could not access microphone.");
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 h-full overflow-y-auto">
      
      {/* Text to Speech Section */}
      <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-purple-500/20 rounded-lg text-purple-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Text to Speech</h2>
            <p className="text-sm text-slate-400">Gemini Prebuilt Voices</p>
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select Voice</label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {GEMINI_VOICES.map((voice) => (
              <button
                key={voice.name}
                onClick={() => setSelectedVoice(voice.name)}
                className={`p-2 rounded-lg text-sm font-medium border transition-all ${
                  selectedVoice === voice.name 
                    ? 'bg-purple-600 border-purple-500 text-white shadow-lg' 
                    : 'bg-slate-900 border-slate-600 text-slate-300 hover:border-purple-400'
                }`}
              >
                {voice.name}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
            <label className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap">Volume</label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              value={volume}
              onChange={handleVolumeChange}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <span className="text-xs font-mono text-slate-400 w-8 text-right">{Math.round(volume * 100)}%</span>
          </div>
          
          <p className="text-xs text-slate-500 mt-2">
            {GEMINI_VOICES.find(v => v.name === selectedVoice)?.gender}, {GEMINI_VOICES.find(v => v.name === selectedVoice)?.style}
          </p>
        </div>

        <textarea
          value={ttsText}
          onChange={(e) => setTtsText(e.target.value)}
          placeholder="Enter text to generate speech..."
          className="flex-1 w-full bg-slate-900 border border-slate-600 rounded-xl p-4 text-slate-200 resize-none focus:ring-2 focus:ring-purple-500 outline-none mb-6"
        />
        
        <div className="flex gap-3">
          <button
            onClick={handleGenerateSpeech}
            disabled={ttsLoading || !ttsText}
            className="flex-1 py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl text-white font-bold shadow-lg transition-transform transform active:scale-95 flex items-center justify-center gap-2"
          >
            {ttsLoading ? (
               <>
                 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                 Generating...
               </>
            ) : (
               'Generate & Play Speech'
            )}
          </button>

          {audioDownloadUrl && (
            <a
              href={audioDownloadUrl}
              download={`gemini-speech-${Date.now()}.wav`}
              className="px-6 py-4 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-xl text-white font-bold shadow-lg transition-all flex items-center justify-center hover:scale-105"
              title="Download Audio"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Audio Transcription Section */}
      <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-teal-500/20 rounded-lg text-teal-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" /></svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Audio Transcription</h2>
            <p className="text-sm text-slate-400">Upload file or Dictate (User Voice)</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* File Upload */}
          <div className="relative group">
             <button className="w-full h-32 bg-slate-900 rounded-xl border-2 border-dashed border-slate-600 hover:border-teal-500 flex flex-col items-center justify-center transition-colors">
                <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <span className="text-sm text-slate-300">Upload File</span>
             </button>
             <input 
                type="file" 
                ref={fileInputRef}
                accept="audio/*"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
          </div>

          {/* Mic Recording */}
          <button 
            onClick={handleMicRecord}
            className={`w-full h-32 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
              isRecording 
                ? 'bg-red-900/20 border-red-500 animate-pulse' 
                : 'bg-slate-900 border-slate-600 hover:border-red-500 hover:bg-red-900/10'
            }`}
          >
            {isRecording ? (
               <>
                 <div className="w-8 h-8 bg-red-500 rounded flex items-center justify-center mb-2">
                   <div className="w-3 h-3 bg-white"></div>
                 </div>
                 <span className="text-sm text-red-400 font-bold">Stop Recording</span>
               </>
            ) : (
               <>
                 <svg className="w-8 h-8 text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18v3m0 0h-3m3 0h3" /></svg>
                 <span className="text-sm text-slate-300">Record Voice</span>
               </>
            )}
          </button>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex-1 min-h-[200px] overflow-y-auto">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Transcription Output</label>
          {isTranscribing ? (
             <div className="flex items-center gap-2 text-teal-400">
                <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}/>
                <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}/>
                <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}/>
                <span className="ml-2 text-sm">Processing Audio...</span>
             </div>
          ) : (
             <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
               {transcriptionResult || "Upload a file or use the microphone to transcribe audio."}
             </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioTools;
export enum View {
  DASHBOARD = 'DASHBOARD',
  AGENT_BUILDER = 'AGENT_BUILDER',
  CHAT = 'CHAT',
  LIVE_VOICE = 'LIVE_VOICE',
  SEARCH_LAB = 'SEARCH_LAB',
  AUDIO_TOOLS = 'AUDIO_TOOLS'
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  systemInstruction: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  sources?: { uri: string; title: string }[];
}

export interface DashboardMetric {
  name: string;
  value: number;
  trend: number; // Percentage
}

export enum ModelType {
  PRO = 'gemini-3-pro-preview',
  FLASH_LITE = 'gemini-flash-lite-latest',
  FLASH = 'gemini-2.5-flash', // Used for Search/Transcription
  LIVE = 'gemini-2.5-flash-native-audio-preview-09-2025',
  TTS = 'gemini-2.5-flash-preview-tts'
}

export const GEMINI_VOICES = [
  { name: 'Puck', gender: 'Male', style: 'Deep & Resonant' },
  { name: 'Charon', gender: 'Male', style: 'Firm & Authoritative' },
  { name: 'Kore', gender: 'Female', style: 'Calm & Soothing' },
  { name: 'Fenrir', gender: 'Male', style: 'Gruff & Energetic' },
  { name: 'Zephyr', gender: 'Female', style: 'Bright & Spirited' }
];

export const SUPPORTED_LANGUAGES = [
  { label: 'English', code: 'en', instruction: 'Please speak in English.' },
  { label: 'Bahasa Malaysia', code: 'ms', instruction: 'Sila bercakap dalam Bahasa Melayu (Bahasa Malaysia).' },
  { label: 'Chinese (Mandarin)', code: 'zh', instruction: 'Please speak in Mandarin Chinese (中文).' },
  { label: 'Auto / User Language', code: 'auto', instruction: 'Please reply in the same language as the user.' }
];
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { ModelType } from "../types";

const apiKey = process.env.API_KEY || '';

export const getGenAI = () => new GoogleGenAI({ apiKey });

// --- Chat & Text Generation ---

export const sendChatMessage = async (
  model: string,
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  systemInstruction?: string
) => {
  const ai = getGenAI();
  const chat = ai.chats.create({
    model: model,
    history: history,
    config: {
      systemInstruction: systemInstruction,
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};

// --- Search Grounding ---

export const searchWithGemini = async (query: string, languageInstruction: string = '') => {
  const ai = getGenAI();
  
  // Append language instruction if provided
  const finalQuery = languageInstruction ? `${query}. (${languageInstruction})` : query;

  // Using gemini-2.5-flash for search as requested
  const response = await ai.models.generateContent({
    model: ModelType.FLASH,
    contents: finalQuery,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text;
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  const sources = groundingChunks
    .filter((chunk: any) => chunk.web)
    .map((chunk: any) => ({
      uri: chunk.web.uri,
      title: chunk.web.title,
    }));

  return { text, sources };
};

// --- Text-to-Speech (TTS) ---

export const generateSpeech = async (text: string, voiceName: string = 'Kore') => {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: ModelType.TTS,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio;
};

// --- Audio Transcription ---

export const transcribeAudio = async (base64Audio: string, mimeType: string) => {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: ModelType.FLASH, // 2.5 Flash for transcription
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio,
          },
        },
        {
          text: "Transcribe this audio accurately. Return ONLY the transcription text, nothing else.",
        },
      ],
    },
  });

  return response.text;
};

// --- Helper for Audio Encoding/Decoding (For Live API use) ---

export function decodeAudioData(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encodeAudioData(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function convertPCMToAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
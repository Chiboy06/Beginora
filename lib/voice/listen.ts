// Listening inside Beginora, like a voice chat: no pop-up, words appear while
// you speak, on-device recognition first (local first), and a pause after
// "and..." keeps listening instead of sending half a sentence. Falls back to
// the system speech pop-up where in-app recognition is not available.

import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionOptions } from "expo-speech-recognition";
import { startVoiceRecognition, type VoiceResult } from "../native/voice-input";
import { soundsUnfinished } from "./hands-free";

// Longest silence before the recognizer decides you finished (Android hint).
const END_SILENCE_MS = 1500;
// How many times a trailing "and..." can extend one turn.
const MAX_CONTINUATIONS = 3;

let listening = false;

export interface ListenHandlers {
  // Everything heard so far, updated while you speak.
  onPartial?: (text: string) => void;
  // Microphone level, roughly 0 (quiet) to 1 (loud), for the listening orb.
  onLevel?: (level: number) => void;
}

function inAppAvailable(): boolean {
  try {
    return Platform.OS === "android" && ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    // Older build without the native module.
    return false;
  }
}

// One recognition pass. Resolves with the final words, or why there are none.
function onePass(options: ExpoSpeechRecognitionOptions, prefix: string, h: ListenHandlers): Promise<{ text: string; error?: string }> {
  return new Promise((resolve) => {
    let finalText = "";
    let interim = "";
    const subs = [
      ExpoSpeechRecognitionModule.addListener("result", (e) => {
        const said = e.results[0]?.transcript?.trim() ?? "";
        if (e.isFinal) {
          finalText = [finalText, said].filter(Boolean).join(" ");
          interim = "";
        } else {
          interim = said;
        }
        h.onPartial?.([prefix, finalText, interim].filter(Boolean).join(" "));
      }),
      ExpoSpeechRecognitionModule.addListener("volumechange", (e) => {
        h.onLevel?.(Math.max(0, Math.min(1, e.value / 10)));
      }),
      ExpoSpeechRecognitionModule.addListener("error", (e) => {
        done({ text: [finalText, interim].filter(Boolean).join(" "), error: e.error });
      }),
      ExpoSpeechRecognitionModule.addListener("end", () => {
        done({ text: [finalText, interim].filter(Boolean).join(" ") });
      }),
    ];
    let settled = false;
    function done(r: { text: string; error?: string }) {
      if (settled) return;
      settled = true;
      subs.forEach((s) => s.remove());
      h.onLevel?.(0);
      resolve(r);
    }
    ExpoSpeechRecognitionModule.start(options);
  });
}

export async function listen(h: ListenHandlers = {}): Promise<VoiceResult> {
  if (!inAppAvailable()) return startVoiceRecognition();

  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!permission.granted) return { status: "denied", error: "Microphone permission was not granted." };

  const base: ExpoSpeechRecognitionOptions = {
    lang: Intl.DateTimeFormat().resolvedOptions().locale || "en-US",
    interimResults: true,
    continuous: false,
    addsPunctuation: true,
    volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
    androidIntentOptions: {
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: END_SILENCE_MS,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: END_SILENCE_MS,
    },
  };
  // Local first: on-device recognition when the phone has it.
  let onDevice = false;
  try {
    onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    onDevice = false;
  }

  listening = true;
  let heard = "";
  try {
    for (let pass = 0; pass <= MAX_CONTINUATIONS && listening; pass += 1) {
      let r = await onePass({ ...base, requiresOnDeviceRecognition: onDevice }, heard, h);
      // No offline language pack for this language: use the phone's normal recognizer.
      if (onDevice && (r.error === "language-not-supported" || r.error === "service-not-allowed")) {
        onDevice = false;
        r = await onePass({ ...base, requiresOnDeviceRecognition: false }, heard, h);
      }
      heard = [heard, r.text].filter(Boolean).join(" ").trim();
      if (r.error && r.error !== "no-speech" && r.error !== "speech-timeout") {
        if (r.error === "aborted") return heard ? { status: "success", text: heard } : { status: "cancelled" };
        if (r.error === "not-allowed") return { status: "denied", error: "Microphone permission was not granted." };
        if (!heard) return { status: "failed", error: r.error === "network" ? "Speech needs the internet on this phone, or an offline language pack." : "I couldn't hear that." };
        break;
      }
      // Trailing off ("and...", "by 6..."): keep listening and add to it.
      if (!heard || !soundsUnfinished(heard)) break;
    }
  } finally {
    listening = false;
  }
  return heard ? { status: "success", text: heard.slice(0, 2000) } : { status: "cancelled" };
}

// Stop listening now (tap to cancel, or leaving the screen).
export function stopListening(): void {
  listening = false;
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Not listening, or no native module: nothing to stop.
  }
}

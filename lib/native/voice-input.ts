import { NativeModules, Platform } from "react-native";

export type VoiceResult =
  | { status: "success"; text: string }
  | { status: "cancelled" }
  | { status: "denied"; error: string }
  | { status: "unavailable"; error: string }
  | { status: "failed"; error: string };

interface NativeVoiceResult {
  status?: string;
  text?: string;
  error?: string;
}

interface SystemActionsVoiceModule {
  startVoiceRecognition(): Promise<NativeVoiceResult>;
}

/**
 * Uses the app-owned Android Activity, which requests microphone permission
 * and launches the system speech recognizer. The provider may process speech
 * online according to the user's Android settings; no transcript is sent
 * automatically by Beginora.
 */
export async function startVoiceRecognition(): Promise<VoiceResult> {
  if (Platform.OS !== "android") {
    return { status: "unavailable", error: "Voice input is available on Android only in this build." };
  }

  const nativeModule = NativeModules.SystemActionsModule as SystemActionsVoiceModule | undefined;
  if (!nativeModule?.startVoiceRecognition) {
    return { status: "unavailable", error: "Voice input is not available in this app build." };
  }

  try {
    const result = await nativeModule.startVoiceRecognition();
    if (result.status === "success" && typeof result.text === "string" && result.text.trim()) {
      return { status: "success", text: result.text.trim().slice(0, 1000) };
    }
    if (result.status === "denied") {
      return { status: "denied", error: result.error ?? "Microphone permission was not granted." };
    }
    if (result.status === "unavailable") {
      return { status: "unavailable", error: result.error ?? "Speech recognition is not available on this device." };
    }
    if (result.status === "cancelled") return { status: "cancelled" };
    return { status: "failed", error: result.error ?? "No transcript was returned." };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Voice input failed." };
  }
}

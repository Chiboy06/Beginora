// Voice input — launches Android's built-in speech recognition intent.
// Uses ACTION_RECOGNIZE_SPEECH via expo-speech-recognition (or Linking fallback).
// RECORD_AUDIO permission is already declared in app.json.
// Returns the transcribed text string, or null if cancelled/failed.

import { Platform } from "react-native";
import * as ExpoAV from "expo-av";

export interface VoiceResult {
  ok: boolean;
  text?: string;
  error?: string;
}

// Request microphone permission before attempting to record.
async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const { status } = await ExpoAV.Audio.requestPermissionsAsync();
  return status === "granted";
}

// On Android we use the native SpeechRecognizer via a NativeModule bridge.
// The BeginoraVoiceActivity (already in native/android) handles the intent
// and returns the result via a deep link: beginora://chat?voice_text=...
// This function just checks permission and signals readiness — the actual
// launch is done by the VoiceButton component via Linking.openURL.
export async function checkVoiceAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  return ensureMicPermission();
}

export async function requestMicPermission(): Promise<VoiceResult> {
  if (Platform.OS !== "android") {
    return { ok: false, error: "Voice input is only available on Android in this build." };
  }
  const granted = await ensureMicPermission();
  if (!granted) {
    return { ok: false, error: "Microphone permission is needed for voice input. You can still type your task." };
  }
  return { ok: true };
}

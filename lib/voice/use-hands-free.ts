// Hands-free conversation: greet, listen, send, read the reply aloud, listen
// again. Spoken "yes"/"no" answers a pending action; "stop" or cancelling the
// listening prompt ends it. Uses the Android speech recognizer and the phone's
// text-to-speech voice.

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { startVoiceRecognition } from "../native/voice-input";
import { useChatStore } from "../store/chat-store";
import { prefs } from "../store/prefs";
import { greeting, interpretVoice, shouldStopForAppState, toSpeech } from "./hands-free";

// The outcome stored on a confirmed action's message, if any.
function toolResultMessage(raw: string | undefined): string | null {
  try {
    const parsed = JSON.parse(raw ?? "") as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : null;
  } catch {
    return null;
  }
}

export function useHandsFree() {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  // True between sending a message and speaking the reply to it.
  const awaitingReplyRef = useRef(false);
  const listenRef = useRef<() => void>(() => {});
  // The recognizer is its own screen; while it is open the app reports "background".
  const recognizerOpenRef = useRef(false);
  const router = useRouter();
  const isGenerating = useChatStore((s) => s.isGenerating);
  const messages = useChatStore((s) => s.messages);
  const pendingConfirmation = useChatStore((s) => s.pendingConfirmation);

  const stop = useCallback(() => {
    activeRef.current = false;
    awaitingReplyRef.current = false;
    setActive(false);
    void Speech.stop();
  }, []);

  const speakThenListen = useCallback((text: string) => {
    const next = () => listenRef.current();
    Speech.speak(text, { onDone: next, onError: next });
  }, []);

  listenRef.current = () => {
    void (async () => {
      if (!activeRef.current) return;
      recognizerOpenRef.current = true;
      let result: Awaited<ReturnType<typeof startVoiceRecognition>>;
      try {
        result = await startVoiceRecognition();
      } finally {
        recognizerOpenRef.current = false;
      }
      if (!activeRef.current) return;
      // Backing out of the listening prompt (or an error) ends hands-free mode.
      if (result.status !== "success") {
        stop();
        return;
      }
      const chat = useChatStore.getState();
      const pending = chat.pendingConfirmation;
      const intent = interpretVoice(result.text, pending !== null);
      if (intent.kind === "stop") {
        stop();
        Speech.speak("Okay. Talk soon.");
        return;
      }
      if (intent.kind === "open") {
        if (intent.route === "back") {
          if (router.canGoBack()) router.back();
        } else {
          router.push(intent.route as never);
        }
        speakThenListen(intent.route === "back" ? "Okay." : `Opening ${intent.label}.`);
        return;
      }
      if (intent.kind === "confirm" && pending) {
        await chat.resolveConfirmation(intent.approved);
        const updated = useChatStore.getState().messages.find((m) => m.id === pending.messageId);
        const outcome = intent.approved ? toolResultMessage(updated?.toolResult) ?? "Done." : "Okay, I won't do that.";
        speakThenListen(toSpeech(outcome));
        return;
      }
      awaitingReplyRef.current = true;
      void chat.sendMessage(intent.kind === "message" ? intent.text : result.text);
    })();
  };

  // When the reply to what was said is complete, read it aloud, then listen again.
  useEffect(() => {
    if (!activeRef.current || !awaitingReplyRef.current || isGenerating) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    awaitingReplyRef.current = false;
    const ask = pendingConfirmation?.messageId === last.id ? " Should I go ahead? Say yes or no." : "";
    speakThenListen(toSpeech(last.content) + ask);
  }, [isGenerating, messages, pendingConfirmation, speakThenListen]);

  const start = useCallback(() => {
    if (!useChatStore.getState().modelLoaded) {
      Speech.speak("Please download a model in Settings, then we can talk.");
      return;
    }
    activeRef.current = true;
    setActive(true);
    speakThenListen(greeting(prefs.userName, new Date().getHours()));
  }, [speakThenListen]);

  // Never keep listening or talking once the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (shouldStopForAppState(state, recognizerOpenRef.current)) stop();
    });
    return () => {
      sub.remove();
      activeRef.current = false;
      void Speech.stop();
    };
  }, [stop]);

  return { active, start, stop };
}

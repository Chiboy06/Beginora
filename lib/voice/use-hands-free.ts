// Hands-free conversation, like a voice chat: listen inside the app (words
// appear as you speak), send, read the reply aloud sentence by sentence while
// it is still being written, then listen again. Spoken "yes"/"no" answers a
// pending action; "stop" ends it; a tap while Beginora talks interrupts it.

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useChatStore } from "../store/chat-store";
import { prefs } from "../store/prefs";
import { interpretVoice, nextSentences, shouldStopForAppState, toSpeech } from "./hands-free";
import { listen, stopListening } from "./listen";

// The outcome stored on a confirmed action's message, if any.
function toolResultMessage(raw: string | undefined): string | null {
  try {
    const parsed = JSON.parse(raw ?? "") as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : null;
  } catch {
    return null;
  }
}

// Markdown-free text without the 320-character cut, for speaking as it streams.
const speakable = (text: string) => toSpeech(text, 100_000);

// Greet once per app session; after that, just say it is listening.
let greetedThisSession = false;

export function useHandsFree() {
  const [active, setActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  // What has been heard so far in this turn, shown on screen while you speak.
  const [heard, setHeard] = useState("");
  const [level, setLevel] = useState(0);
  const activeRef = useRef(false);
  // True between sending a message and the end of its reply.
  const awaitingReplyRef = useRef(false);
  // Sentences queued to the voice and not yet finished.
  const queuedRef = useRef(0);
  // Nothing more will be added to what is being spoken; listen when the queue ends.
  const turnCompleteRef = useRef(true);
  // How much of the streamed reply has been spoken, and the text of it.
  const spokenUpToRef = useRef(0);
  const spokenTextRef = useRef("");
  const listenRef = useRef<() => void>(() => {});
  // The system speech pop-up (older phones) reports the app as "background".
  const recognizerOpenRef = useRef(false);
  const router = useRouter();
  const isGenerating = useChatStore((s) => s.isGenerating);
  const messages = useChatStore((s) => s.messages);
  const streamingText = useChatStore((s) => s.streamingText);
  const pendingConfirmation = useChatStore((s) => s.pendingConfirmation);

  const stop = useCallback(() => {
    activeRef.current = false;
    awaitingReplyRef.current = false;
    queuedRef.current = 0;
    setActive(false);
    setSpeaking(false);
    setListening(false);
    setHeard("");
    stopListening();
    void Speech.stop();
  }, []);

  const afterSpeech = useCallback(() => {
    queuedRef.current = Math.max(0, queuedRef.current - 1);
    if (queuedRef.current === 0 && turnCompleteRef.current) {
      setSpeaking(false);
      listenRef.current();
    }
  }, []);

  const say = useCallback((text: string) => {
    if (!text.trim()) return;
    queuedRef.current += 1;
    setSpeaking(true);
    // onStopped: an interruption; interrupt() starts listening itself.
    Speech.speak(text, { onDone: afterSpeech, onError: afterSpeech, onStopped: () => {} });
  }, [afterSpeech]);

  const speakThenListen = useCallback((text: string) => {
    turnCompleteRef.current = true;
    if (text.trim()) say(text);
    else listenRef.current();
  }, [say]);

  // Tap while Beginora is talking: stop talking and listen straight away.
  const interrupt = useCallback(() => {
    queuedRef.current = 0;
    awaitingReplyRef.current = false;
    turnCompleteRef.current = true;
    void Speech.stop();
    setSpeaking(false);
    listenRef.current();
  }, []);

  listenRef.current = () => {
    void (async () => {
      if (!activeRef.current) return;
      setHeard("");
      setListening(true);
      recognizerOpenRef.current = true;
      let result: Awaited<ReturnType<typeof listen>>;
      try {
        result = await listen({ onPartial: setHeard, onLevel: setLevel });
      } finally {
        recognizerOpenRef.current = false;
        setListening(false);
      }
      if (!activeRef.current) return;
      if (result.status === "cancelled") {
        // Silence: end gently instead of waiting forever.
        stop();
        Speech.speak("I'll stop listening for now. Tap to talk again.");
        return;
      }
      if (result.status !== "success") {
        stop();
        Speech.speak(result.status === "denied" ? "I need the microphone to hear you." : "Sorry, I couldn't hear that. Tap to try again.");
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
      turnCompleteRef.current = false;
      spokenUpToRef.current = 0;
      spokenTextRef.current = "";
      void chat.sendMessage(intent.kind === "message" ? intent.text : result.text);
    })();
  };

  // While the reply is being written, speak each sentence as soon as it is complete.
  useEffect(() => {
    if (!activeRef.current || !awaitingReplyRef.current || !isGenerating || !streamingText) return;
    const text = speakable(streamingText);
    const { sentences, upTo } = nextSentences(text, spokenUpToRef.current);
    if (sentences.length === 0) return;
    spokenUpToRef.current = upTo;
    spokenTextRef.current = text.slice(0, upTo);
    sentences.forEach(say);
  }, [streamingText, isGenerating, say]);

  // When the reply is complete, speak what is left, then listen again.
  useEffect(() => {
    if (!activeRef.current || !awaitingReplyRef.current || isGenerating) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    awaitingReplyRef.current = false;
    const ask = pendingConfirmation?.messageId === last.id ? " Should I go ahead? Say yes or no." : "";
    const full = speakable(last.content);
    let rest: string;
    if (spokenUpToRef.current === 0) rest = toSpeech(last.content);
    // The final reply can be tidied after streaming; only speak a true continuation.
    else rest = full.startsWith(spokenTextRef.current) ? full.slice(spokenTextRef.current.length).trim() : "";
    turnCompleteRef.current = true;
    if (rest || ask) say(`${rest}${ask}`.trim());
    else if (queuedRef.current === 0) {
      setSpeaking(false);
      listenRef.current();
    }
  }, [isGenerating, messages, pendingConfirmation, say]);

  const start = useCallback(() => {
    activeRef.current = true;
    setActive(true);
    const name = prefs.userName;
    speakThenListen(greetedThisSession ? "I'm listening." : `Hi${name ? `, ${name}` : ""}.`);
    greetedThisSession = true;
  }, [speakThenListen]);

  // Never keep listening or talking once the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (shouldStopForAppState(state, recognizerOpenRef.current)) stop();
    });
    return () => {
      sub.remove();
      activeRef.current = false;
      stopListening();
      void Speech.stop();
    };
  }, [stop]);

  // Tap while listening: stop listening and send what was heard.
  const finish = useCallback(() => stopListening(), []);

  return { active, speaking, listening, heard, level, start, stop, interrupt, finish };
}

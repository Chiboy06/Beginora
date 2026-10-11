import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Linking,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { useChatStore } from "../lib/store/chat-store";
import { ChatBubble, StreamingBubble } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import type { ChatInputHandle } from "../components/ChatInput";
import { FlameIndicator } from "../components/FlameIndicator";
import { NoticeBanner } from "../components/NoticeBanner";
import { colors, spacing, typography, radii } from "../lib/theme";
import type { Message } from "../lib/orchestrator/types";

const StreamingFooter = React.memo(function StreamingFooter({
  isGenerating,
  streamingText,
}: {
  isGenerating: boolean;
  streamingText: string;
}) {
  if (!isGenerating) return null;
  if (!streamingText) return <FlameIndicator />;
  return <StreamingBubble text={streamingText} />;
});

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  return height;
}

export default function ChatScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const flatListRef = useRef<FlatList<Message>>(null);
  const lastScrollRef = useRef(0);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const keyboardHeight = useKeyboardHeight();
  const handledUrlRef = useRef<string | null>(null);

  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const streamingText = useChatStore((s) => s.streamingText);
  const modelLoaded = useChatStore((s) => s.modelLoaded);
  const error = useChatStore((s) => s.error);
  const notice = useChatStore((s) => s.notice);
  const dismissNotice = useChatStore((s) => s.dismissNotice);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopGenerating = useChatStore((s) => s.stopGenerating);
  const conversationTitle = useChatStore((s) => s.conversationTitle);
  const clearConversation = useChatStore((s) => s.clearConversation);
  const pendingConfirmation = useChatStore((s) => s.pendingConfirmation);
  const resolveConfirmation = useChatStore((s) => s.resolveConfirmation);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: conversationTitle || "Beginora",
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.push("/history")}
          style={styles.headerBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Conversation history"
        >
          <Text style={styles.headerBtnText}>&#9776;</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={clearConversation}
            style={styles.headerBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="New conversation"
          >
            <Text style={styles.headerBtnText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={styles.headerBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Text style={styles.headerBtnText}>&#9881;</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, router, conversationTitle, clearConversation]);

  const handleDeepLink = (url: string) => {
    if (!url || url === handledUrlRef.current) return;
    handledUrlRef.current = url;
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "chat" || parsed.pathname === "/chat") {
        const voiceText = parsed.searchParams.get("voice_text");
        const focus = parsed.searchParams.get("focus");
        if (voiceText) {
          const prefill = voiceText.slice(0, 1000);
          setTimeout(() => {
            chatInputRef.current?.setText(prefill);
            chatInputRef.current?.focus();
          }, 300);
        } else if (focus) {
          setTimeout(() => chatInputRef.current?.focus(), 300);
        }
      }
    } catch {}
  };

  useEffect(() => {
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
  }, [modelLoaded]);

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [modelLoaded]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  useEffect(() => {
    if (isGenerating && streamingText) {
      const now = Date.now();
      if (now - lastScrollRef.current > 500) {
        lastScrollRef.current = now;
        flatListRef.current?.scrollToEnd({ animated: false });
      }
    }
  }, [isGenerating, streamingText]);

  useEffect(() => {
    if (keyboardHeight > 0 && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [keyboardHeight, messages.length]);

  const chatContent = (
    <>
      {!modelLoaded && (
        <TouchableOpacity
          style={styles.banner}
          onPress={() => router.push("/models")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="No model loaded. Tap to download one."
        >
          <Text style={styles.bannerText}>
            No model yet — tap to download one
          </Text>
        </TouchableOpacity>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <NoticeBanner message={notice} onDismiss={dismissNotice} />

      <FlatList
        ref={flatListRef}
        data={messages}
        extraData={pendingConfirmation?.messageId}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const awaiting = pendingConfirmation?.messageId === item.id;
          return (
            <ChatBubble
              message={item}
              awaitingConfirmation={awaiting}
              onResolve={awaiting ? resolveConfirmation : undefined}
            />
          );
        }}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>🌱</Text>
            </View>
            <Text style={styles.emptyTitle}>Beginora</Text>
            <Text style={styles.emptySubtitle}>
              What’s one thing you’d like to get started on?
            </Text>
            <View style={styles.promptChips}>
              {[
                "I need to start my report",
                "Help me break down a big task",
                "I keep putting off something",
              ].map((prompt) => (
                <TouchableOpacity
                  key={prompt}
                  style={styles.chip}
                  onPress={() => {
                    chatInputRef.current?.setText(prompt);
                    chatInputRef.current?.focus();
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={styles.chipText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.taskCta}
              onPress={() => router.push("/task/new")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Start an offline task and find its first step"
            >
              <Text style={styles.taskCtaText}>Start with one small step</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calendarCta}
              onPress={() => router.push("/calendar")}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Prepare for the next calendar event"
            >
              <Text style={styles.calendarCtaText}>Prepare for my next event (optional)</Text>
            </TouchableOpacity>
          </View>
        }
        ListFooterComponent={
          <StreamingFooter isGenerating={isGenerating} streamingText={streamingText} />
        }
      />

      <ChatInput
        ref={chatInputRef}
        onSend={sendMessage}
        onStop={stopGenerating}
        isGenerating={isGenerating}
        disabled={!modelLoaded}
      />
    </>
  );

  if (Platform.OS === "android") {
    return (
      <View style={[styles.container, { paddingBottom: keyboardHeight }]}>
        {chatContent}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={90}
    >
      {chatContent}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  banner: {
    backgroundColor: colors.accentSoft,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  bannerText: {
    color: colors.accent,
    fontWeight: "600",
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: colors.errorBg,
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "500",
  },
  list: {
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: spacing.xl,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoEmoji: {
    fontSize: 36,
  },
  emptyTitle: {
    color: colors.textPrimary,
    ...typography.heading,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 28,
  },
  promptChips: {
    gap: 10,
    width: "100%",
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  taskCta: {
    width: "100%",
    marginTop: spacing.md,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  taskCtaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  calendarCta: { width: "100%", paddingVertical: 13, alignItems: "center" },
  calendarCtaText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  headerBtnText: {
    fontSize: 18,
    color: colors.accent,
    fontWeight: "600",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
});

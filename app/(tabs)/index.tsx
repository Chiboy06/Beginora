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
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useChatStore } from "../../lib/store/chat-store";
import { ChatBubble, StreamingBubble } from "../../components/ChatBubble";
import { ChatInput } from "../../components/ChatInput";
import type { ChatInputHandle } from "../../components/ChatInput";
import { FlameIndicator } from "../../components/FlameIndicator";
import { NoticeBanner } from "../../components/NoticeBanner";
import { GlassScreen } from "../../components/GlassSurface";
import { colors, spacing, typography, radii, shadow } from "../../lib/theme";
import type { Message } from "../../lib/orchestrator/types";

const PROMPT_CHIPS = [
  "I need to start my report",
  "Help me break down a big task",
  "I keep putting off something",
];

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
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

function EmptyState({
  onChipPress,
  onTaskPress,
  onCalendarPress,
  onEmailPress,
}: {
  onChipPress: (text: string) => void;
  onTaskPress: () => void;
  onCalendarPress: () => void;
  onEmailPress: () => void;
}) {
  return (
    <View style={es.root}>
      {/* Hero */}
      <View style={es.hero}>
        <View style={es.iconWrap}>
          <Text style={es.icon}>🌱</Text>
        </View>
        <Text style={es.title}>Beginora</Text>
        <Text style={es.subtitle}>
          What&apos;s one thing you&apos;d like to get started on?
        </Text>
      </View>

      {/* Suggestion chips */}
      <View style={es.section}>
        <Text style={es.sectionLabel}>SUGGESTIONS</Text>
        <View style={es.chipGroup}>
          {PROMPT_CHIPS.map((chip) => (
            <Pressable
              key={chip}
              style={({ pressed }) => [es.chip, pressed && es.chipPressed]}
              onPress={() => onChipPress(chip)}
              accessibilityRole="button"
            >
              <Text style={es.chipText}>{chip}</Text>
              <Text style={es.chipArrow}>›</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Quick actions */}
      <View style={es.section}>
        <Text style={es.sectionLabel}>QUICK ACTIONS</Text>
        <View style={es.actionGroup}>
          <Pressable
            style={({ pressed }) => [es.actionRow, pressed && es.actionPressed]}
            onPress={onTaskPress}
            accessibilityRole="button"
            accessibilityLabel="Start with one small step"
          >
            <View style={[es.actionIcon, { backgroundColor: colors.accentMuted }]}>
              <Text style={es.actionIconText}>✦</Text>
            </View>
            <View style={es.actionContent}>
              <Text style={es.actionTitle}>Start with one small step</Text>
              <Text style={es.actionSub}>Break any task into a first action</Text>
            </View>
            <Text style={es.actionChevron}>›</Text>
          </Pressable>
          <View style={es.separator} />
          <Pressable
            style={({ pressed }) => [es.actionRow, pressed && es.actionPressed]}
            onPress={onCalendarPress}
            accessibilityRole="button"
            accessibilityLabel="Review appointments"
          >
            <View style={[es.actionIcon, { backgroundColor: "#EEF2FF" }]}>
              <Text style={es.actionIconText}>📅</Text>
            </View>
            <View style={es.actionContent}>
              <Text style={es.actionTitle}>Review appointments</Text>
              <Text style={es.actionSub}>Prepare for what&apos;s coming up</Text>
            </View>
            <Text style={es.actionChevron}>›</Text>
          </Pressable>
          <View style={es.separator} />
          <Pressable
            style={({ pressed }) => [es.actionRow, pressed && es.actionPressed]}
            onPress={onEmailPress}
            accessibilityRole="button"
            accessibilityLabel="Draft an email"
          >
            <View style={[es.actionIcon, { backgroundColor: "#FFF0E8" }]}>
              <Text style={es.actionIconText}>✉️</Text>
            </View>
            <View style={es.actionContent}>
              <Text style={es.actionTitle}>Draft an email</Text>
              <Text style={es.actionSub}>Open an editable draft in your mail app</Text>
            </View>
            <Text style={es.actionChevron}>›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const { voice_text: voiceTextParam, focus: focusParam } = useLocalSearchParams<{
    voice_text?: string;
    focus?: string;
  }>();
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
  const modelLoading = useChatStore((s) => s.modelLoading);
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
      title: conversationTitle || "Today",
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.push("/history")}
          style={styles.headerBtn}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Conversation history"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerBtnText}>≡</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={clearConversation}
            style={styles.headerBtn}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="New conversation"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerBtnText}>⊕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={styles.headerBtn}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerBtnText}>⚙</Text>
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
          setTimeout(() => {
            chatInputRef.current?.setText(voiceText.slice(0, 1000));
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
    if (typeof voiceTextParam === "string" && voiceTextParam) {
      const timer = setTimeout(() => {
        chatInputRef.current?.setText(voiceTextParam.slice(0, 1000));
        chatInputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
    if (typeof focusParam === "string" && focusParam) {
      const timer = setTimeout(() => chatInputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [voiceTextParam, focusParam]);

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
          disabled={modelLoading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={modelLoading ? "Preparing the on-device model" : "No model loaded. Tap to download one."}
        >
          <Text style={styles.bannerText}>
            {modelLoading ? "Preparing your on-device model…" : "No AI model yet — tap to download one"}
          </Text>
        </TouchableOpacity>
      )}

      {!!error && (
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
          <EmptyState
            onChipPress={(text) => {
              chatInputRef.current?.setText(text);
              chatInputRef.current?.focus();
            }}
            onTaskPress={() => router.push("/task/new")}
            onCalendarPress={() => router.push("/calendar")}
            onEmailPress={() => router.push("/email")}
          />
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
      <GlassScreen>
        <View style={[styles.container, { paddingBottom: keyboardHeight }]}>
          {chatContent}
        </View>
      </GlassScreen>
    );
  }

  return (
    <GlassScreen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={90}
      >
        {chatContent}
      </KeyboardAvoidingView>
    </GlassScreen>
  );
}

// ── Empty state styles ────────────────────────────────────────────────────────
const es = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: "center",
    marginBottom: spacing.xxxl,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  icon: { fontSize: 38 },
  title: {
    ...typography.title1,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.callout,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  section: { marginBottom: spacing.xxl },
  sectionLabel: {
    ...typography.footnote,
    color: colors.textMuted,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  chipGroup: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: "hidden",
    ...shadow.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  chipPressed: { backgroundColor: colors.surfaceHover },
  chipText: {
    flex: 1,
    ...typography.callout,
    color: colors.textPrimary,
  },
  chipArrow: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: "300",
  },
  actionGroup: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: "hidden",
    ...shadow.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    minHeight: 60,
    gap: spacing.md,
  },
  actionPressed: { backgroundColor: colors.surfaceHover },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actionIconText: { fontSize: 18 },
  actionContent: { flex: 1 },
  actionTitle: {
    ...typography.callout,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  actionSub: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionChevron: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: "300",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: 52 + spacing.lg,
  },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  banner: {
    backgroundColor: colors.accentMuted,
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  bannerText: {
    ...typography.footnote,
    color: colors.accent,
    fontWeight: "600",
  },
  errorBanner: {
    backgroundColor: colors.errorBg,
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  errorText: {
    ...typography.footnote,
    color: colors.error,
    fontWeight: "500",
  },
  list: { paddingVertical: spacing.sm, flexGrow: 1 },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnText: {
    fontSize: 20,
    color: colors.accent,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
});

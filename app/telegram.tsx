// Settings > Telegram: connect to the shared Beginora bot in one tap. No bot
// token or chat ID to type; "Use my own bot" stays in Settings for people who
// prefer it.

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, ScrollView, Switch, Text, View } from "react-native";
import { Button, Card, SectionTitle, kit } from "../components/Kit";
import { GlassScreen } from "../components/GlassSurface";
import { prefs } from "../lib/store/prefs";
import { relayStatus, relayUnlink, relayUrl, relaySend, startRelayLink } from "../lib/telegram/relay-client";
import { startTelegramBot, stopTelegramBot } from "../lib/telegram/telegram-runner";
import { colors, spacing } from "../lib/theme";

export default function TelegramScreen() {
  const available = relayUrl() !== null;
  const [linked, setLinked] = useState(prefs.telegramRelayLinked);
  const [name, setName] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [twoWay, setTwoWay] = useState(prefs.telegramTwoWay);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const polls = useRef(0);

  const check = useCallback(async () => {
    try {
      const s = await relayStatus();
      setLinked(s.linked);
      setName(s.name);
      if (s.linked) {
        setWaiting(false);
        if (prefs.telegramTwoWay) void startTelegramBot();
      }
      return s.linked;
    } catch {
      setLinked(false);
      return false;
    }
  }, []);

  // On open, refresh the link status; state changes only when the answer arrives.
  useEffect(() => {
    if (!available || !prefs.telegramRelayLinked) return;
    relayStatus()
      .then((s) => {
        setLinked(s.linked);
        setName(s.name);
      })
      .catch(() => setLinked(false));
  }, [available]);

  // After tapping Start in Telegram, the user comes back: check right away,
  // then every 3 seconds for up to two minutes.
  useEffect(() => {
    if (!waiting) return;
    polls.current = 0;
    const timer = setInterval(async () => {
      polls.current += 1;
      if ((await check()) || polls.current > 40) {
        clearInterval(timer);
        setWaiting(false);
      }
    }, 3000);
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [waiting, check]);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const link = await startRelayLink();
      setWaiting(true);
      await Linking.openURL(link);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not start connecting." });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    stopTelegramBot();
    await relayUnlink().catch(() => {});
    setLinked(false);
    setName("");
    setBusy(false);
    setMessage({ ok: true, text: "Disconnected. Messages waiting on the relay were deleted." });
  };

  const test = async () => {
    setBusy(true);
    try {
      await relaySend("Hello from Beginora. This chat is connected.");
      setMessage({ ok: true, text: "Sent. Check Telegram." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Not sent." });
      setLinked(prefs.telegramRelayLinked);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]}>
        <Text style={kit.sub}>
          Get reminders and task summaries in Telegram, and reply to Beginora from there. Useful on a basic data plan: Telegram works on slow connections.
        </Text>

        {!available ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={kit.body}>The shared Beginora bot is not set up in this build.</Text>
            <Text style={kit.muted}>You can still use your own bot: Settings &gt; Telegram &gt; Use my own bot. The developer guide for the shared bot is docs/TELEGRAM_RELAY_GUIDE.md.</Text>
          </Card>
        ) : linked ? (
          <Card style={{ gap: spacing.md }}>
            <Text style={[kit.body, { color: colors.success, fontWeight: "700" }]}>Connected{name ? ` as ${name}` : ""}.</Text>
            <View style={kit.switchRow}>
              <Text style={kit.switchLabel}>Answer my Telegram messages (/next, /add, /stuck, /done)</Text>
              <Switch
                value={twoWay}
                onValueChange={(v) => {
                  setTwoWay(v);
                  prefs.telegramTwoWay = v;
                  if (v) void startTelegramBot(); else stopTelegramBot();
                }}
                trackColor={{ true: colors.accent, false: colors.border }}
                accessibilityLabel="Answer my Telegram messages"
              />
            </View>
            <Button label="Send a test message" kind="secondary" onPress={test} disabled={busy} />
            <Button label="Disconnect" kind="danger" onPress={disconnect} disabled={busy} />
          </Card>
        ) : (
          <Card style={{ gap: spacing.md }}>
            <Text style={kit.body}>1. Tap Connect. Telegram opens the Beginora bot.</Text>
            <Text style={kit.body}>2. Tap Start in Telegram.</Text>
            <Text style={kit.body}>3. Come back here. It connects by itself.</Text>
            <Button label={waiting ? "Waiting for Telegram…" : "Connect"} icon="paper-plane" onPress={connect} disabled={busy || waiting} />
            {waiting && <ActivityIndicator color={colors.accent} />}
            {waiting && <Button label="I tapped Start, check now" kind="quiet" onPress={() => void check()} />}
          </Card>
        )}

        {message && <Text style={{ color: message.ok ? colors.success : colors.error }} accessibilityLiveRegion="polite">{message.text}</Text>}

        <SectionTitle>Privacy</SectionTitle>
        <Text style={kit.muted}>
          Telegram and the Beginora relay can read these messages; Telegram bot chats are not end-to-end encrypted. The relay keeps your messages only until this phone collects them, and never longer than 24 hours. Send /stop in Telegram to disconnect at any time.
        </Text>
      </ScrollView>
    </GlassScreen>
  );
}

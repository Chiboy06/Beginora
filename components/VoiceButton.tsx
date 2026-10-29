import { useState } from "react";
import { Alert, Platform, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listen, stopListening } from "../lib/voice/listen";
import { colors } from "../lib/theme";

interface VoiceButtonProps {
  disabled?: boolean;
  size?: number;
  onTranscript?: (text: string) => void;
  // The words heard so far, while you are still speaking.
  onPartial?: (text: string) => void;
}

export function VoiceButton({ disabled = false, size = 24, onTranscript, onPartial }: VoiceButtonProps) {
  const [listening, setListening] = useState(false);

  const handlePress = async () => {
    if (Platform.OS !== "android" || disabled) return;
    // Tap again while listening: stop and keep what was heard.
    if (listening) {
      stopListening();
      return;
    }
    setListening(true);
    try {
      const result = await listen({ onPartial });
      if (result.status === "success") {
        onTranscript?.(result.text);
      } else if (result.status !== "cancelled") {
        Alert.alert("Voice input", result.error);
      }
    } finally {
      setListening(false);
    }
  };

  if (Platform.OS !== "android") return null;

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[styles.btn, listening && styles.btnActive]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={listening ? "Listening. Tap to stop" : "Voice input"}
      accessibilityState={{ disabled, busy: listening }}
    >
      <Ionicons
        name={listening ? "mic" : "mic-outline"}
        size={size}
        color={listening ? colors.accent : colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  btnActive: {
    backgroundColor: colors.accentMuted,
  },
});

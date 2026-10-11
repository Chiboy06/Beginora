import { useState } from "react";
import { Alert, Platform, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { startVoiceRecognition } from "../lib/native/voice-input";
import { colors } from "../lib/theme";

interface VoiceButtonProps {
  disabled?: boolean;
  size?: number;
  onTranscript?: (text: string) => void;
}

export function VoiceButton({ disabled = false, size = 24, onTranscript }: VoiceButtonProps) {
  const [listening, setListening] = useState(false);

  const handlePress = async () => {
    if (disabled || listening || Platform.OS !== "android") return;
    setListening(true);
    try {
      const result = await startVoiceRecognition();
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
      disabled={disabled || listening}
      style={[styles.btn, listening && styles.btnActive]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={listening ? "Listening…" : "Voice input"}
      accessibilityState={{ disabled: disabled || listening, busy: listening }}
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

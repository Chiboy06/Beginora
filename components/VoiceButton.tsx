import { useState } from "react";
import { TouchableOpacity, StyleSheet, Alert, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { requestMicPermission } from "../lib/native/voice-input";
import { colors } from "../lib/theme";

interface VoiceButtonProps {
  disabled?: boolean;
  size?: number;
}

export function VoiceButton({ disabled = false, size = 24 }: VoiceButtonProps) {
  const [listening, setListening] = useState(false);

  const handlePress = async () => {
    if (disabled || listening) return;
    if (Platform.OS !== "android") {
      Alert.alert("Voice input", "Voice input is available on Android only in this build.");
      return;
    }
    const result = await requestMicPermission();
    if (!result.ok) {
      Alert.alert("Microphone", result.error ?? "Permission needed.");
      return;
    }
    setListening(true);
    try {
      // Launch BeginoraVoiceActivity — it fires ACTION_RECOGNIZE_SPEECH and
      // returns the result via beginora://chat?voice_text=<transcription>
      await Linking.openURL("beginora://voice");
    } catch {
      Alert.alert("Voice input", "Could not open voice input. You can still type your task.");
    } finally {
      setListening(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[styles.btn, listening && styles.btnActive]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={listening ? "Listening…" : "Voice input"}
      accessibilityState={{ disabled }}
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

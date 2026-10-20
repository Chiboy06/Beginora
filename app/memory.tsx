import { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { getAllMemories, deleteMemory } from "../lib/storage/database";
import type { Memory } from "../lib/storage/database";
import { colors, spacing, radii, typography } from "../lib/theme";

// What Beginora remembers about the user, so a wrong "fact" can be removed.
export default function MemoryScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);

  const load = useCallback(() => {
    getAllMemories().then(setMemories).catch(() => setMemories([]));
  }, []);
  useFocusEffect(load);

  const remove = async (id: string) => {
    await deleteMemory(id);
    load();
  };

  const removeAll = () =>
    Alert.alert("Delete all memories?", "Beginora will forget everything it learned about you. Your chats and tasks stay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete all",
        style: "destructive",
        onPress: async () => {
          for (const m of memories) await deleteMemory(m.id);
          load();
        },
      },
    ]);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={memories}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={
        <Text style={styles.desc}>
          Facts Beginora picked up from your chats. They stay on this phone. Delete anything that is wrong.
        </Text>
      }
      ListEmptyComponent={<Text style={styles.empty}>Nothing remembered yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.text}>{item.content}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Delete memory: ${item.content}`}
            onPress={() => remove(item.id)}
            style={styles.delete}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
      ListFooterComponent={
        memories.length > 1 ? (
          <TouchableOpacity accessibilityRole="button" onPress={removeAll} style={styles.deleteAll}>
            <Text style={styles.deleteText}>Delete all</Text>
          </TouchableOpacity>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  desc: { ...typography.subheadline, color: colors.textSecondary, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.textMuted, textAlign: "center", marginTop: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  text: { ...typography.body, color: colors.textPrimary, flex: 1 },
  delete: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  deleteAll: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  deleteText: { ...typography.body, color: colors.error, fontWeight: "600" },
});

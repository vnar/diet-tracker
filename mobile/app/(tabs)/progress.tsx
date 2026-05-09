import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useDashboard } from "@/src/data/DashboardContext";
import { useScreenView } from "@/src/analytics/useScreenView";

export default function ProgressScreen() {
  useScreenView("progress");
  const { entries } = useDashboard();
  const withPhoto = entries.filter((e) => e.photoUrl && e.photoUrl.length > 0);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Progress</Text>
      <Text style={styles.body}>
        Progress photos and AI compare live on the web dashboard for now. You have{" "}
        <Text style={styles.em}>{withPhoto.length}</Text> day(s) with a photo in your synced log.
      </Text>
      {withPhoto.length > 0 ? (
        <View style={styles.card}>
          {withPhoto
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10)
            .map((e) => (
              <Text key={e.id} style={styles.line}>
                {e.date} · photo on file
              </Text>
            ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20 },
  h1: { fontSize: 24, fontWeight: "700", color: "#f1f5f9", marginBottom: 12 },
  body: { color: "#94a3b8", fontSize: 15, lineHeight: 22 },
  em: { color: "#e2e8f0", fontWeight: "600" },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  line: { color: "#cbd5e1", fontSize: 13, marginBottom: 6 },
});

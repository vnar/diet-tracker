import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useDashboard } from "@/src/data/DashboardContext";
import { useScreenView } from "@/src/analytics/useScreenView";

export default function TrendsScreen() {
  useScreenView("trends");
  const { entries, settings } = useDashboard();

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const weights = entries.map((e) => e.morningWeight);
    const first = weights[0];
    const last = weights[weights.length - 1];
    const delta = last - first;
    const avgCal =
      entries.filter((e) => e.calories != null).length > 0
        ? entries.reduce((s, e) => s + (e.calories ?? 0), 0) /
          entries.filter((e) => e.calories != null).length
        : null;
    return { count: entries.length, first, last, delta, avgCal };
  }, [entries]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Trends</Text>
      {!stats ? (
        <Text style={styles.muted}>No entries yet. Pull to refresh on Today after sign-in.</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weight ({settings?.unit ?? "kg"})</Text>
          <Text style={styles.line}>Entries: {stats.count}</Text>
          <Text style={styles.line}>
            First logged: {stats.first} → Latest: {stats.last}
          </Text>
          <Text style={styles.line}>
            Change: {stats.delta >= 0 ? "+" : ""}
            {stats.delta.toFixed(1)}
          </Text>
          {stats.avgCal != null ? (
            <Text style={styles.line}>Avg calories (days with data): {Math.round(stats.avgCal)}</Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20 },
  h1: { fontSize: 24, fontWeight: "700", color: "#f1f5f9", marginBottom: 12 },
  muted: { color: "#94a3b8", fontSize: 15 },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#e2e8f0", marginBottom: 10 },
  line: { color: "#cbd5e1", fontSize: 14, marginBottom: 6 },
});

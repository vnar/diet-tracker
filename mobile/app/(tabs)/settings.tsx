import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth/AuthContext";
import { useDashboard } from "@/src/data/DashboardContext";
import { useScreenView } from "@/src/analytics/useScreenView";
import { getAppEnv } from "@/src/config/env";

export default function SettingsScreen() {
  useScreenView("settings");
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { refresh, loading } = useDashboard();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in</Text>
        <Text style={styles.value}>{user?.email ?? user?.id ?? "—"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Environment</Text>
        <Text style={styles.value}>{getAppEnv()}</Text>
      </View>

      <Pressable style={styles.button} onPress={() => void refresh()} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Refreshing…" : "Refresh data"}</Text>
      </Pressable>

      <Pressable
        style={[styles.button, styles.buttonDanger]}
        onPress={() => {
          void signOut();
          router.replace("/login");
        }}
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: "700", color: "#f1f5f9", marginBottom: 20 },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
  },
  label: { color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { color: "#f1f5f9", fontSize: 16, marginTop: 6 },
  button: {
    backgroundColor: "#334155",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDanger: { backgroundColor: "#7f1d1d", marginTop: 16 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

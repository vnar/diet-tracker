import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useScreenView } from "@/src/analytics/useScreenView";

export default function MealsScreen() {
  useScreenView("meals");
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Meals</Text>
      <Text style={styles.body}>
        Meal logging and library match the web app. This tab is reserved for a native meals flow; use the web app for
        full natural-language and photo meal entry until the mobile experience ships.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20 },
  h1: { fontSize: 24, fontWeight: "700", color: "#f1f5f9", marginBottom: 12 },
  body: { color: "#94a3b8", fontSize: 15, lineHeight: 22 },
});

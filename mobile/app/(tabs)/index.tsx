import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useDashboard } from "@/src/data/DashboardContext";
import { useAuth } from "@/src/auth/AuthContext";
import { useScreenView } from "@/src/analytics/useScreenView";
import { getEntryForDate, getTodayKey } from "@/src/lib/entries";
import { buildTodayEntryBase } from "@/src/lib/buildTodayEntry";
import { uploadDayPhotoFromUri } from "@/src/api/photoUpload";
import { isAwsBackendEnabled } from "@/src/config/env";

export default function TodayScreen() {
  useScreenView("today");
  const { entries, settings, loading, error, refresh, saveEntry } = useDashboard();
  const { getAccessToken, status } = useAuth();
  const today = getTodayKey();
  const entry = getEntryForDate(entries, today);
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function pickAndUploadPhoto() {
    setPhotoError(null);
    if (status !== "authenticated" || !isAwsBackendEnabled()) {
      setPhotoError("Sign in to upload photos.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setPhotoError("Session expired. Sign in again.");
      return;
    }

    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPhotoError("Photo library access is needed to attach a picture.");
        return;
      }
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: Platform.OS !== "web",
      ...(Platform.OS !== "web" ? { aspect: [3, 4] as [number, number], quality: 0.85 } : { quality: 0.92 }),
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    const webFile = Platform.OS === "web" ? asset.file : undefined;
    const uri = asset.uri;
    if (!webFile && !uri) return;

    const mime =
      (webFile?.type && webFile.type.length > 0 ? webFile.type : null) ??
      asset.mimeType ??
      "image/jpeg";
    const ext =
      mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/heic" ? "heic" : "jpg";
    if (ext === "heic") {
      setPhotoError("Please choose a JPEG or PNG (HEIC isn’t supported for upload).");
      return;
    }
    const fileName = asset.fileName ?? webFile?.name ?? `progress-${today}.${ext}`;

    const base = buildTodayEntryBase(today, entry, entries, settings);
    if ("error" in base) {
      setPhotoError(base.error);
      return;
    }

    setUploading(true);
    try {
      const up = await uploadDayPhotoFromUri(
        token,
        webFile ? null : uri,
        today,
        {
          fileName,
          contentType: mime,
          extension: ext,
        },
        webFile ?? null,
      );
      if (!up.ok) {
        setPhotoError(up.error);
        return;
      }
      const saved = await saveEntry({ ...base.entry, photoUrl: up.photoUrl });
      if (!saved.ok) {
        setPhotoError(saved.error);
        return;
      }
    } finally {
      setUploading(false);
    }
  }

  function confirmRemovePhoto() {
    if (!entry?.photoUrl) return;
    const base = buildTodayEntryBase(today, entry, entries, settings);
    if ("error" in base) {
      setPhotoError(base.error);
      return;
    }
    Alert.alert("Remove photo", "Clear today’s photo from your log?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setPhotoError(null);
          void (async () => {
            const r = await saveEntry({ ...base.entry, photoUrl: null });
            if (!r.ok) setPhotoError(r.error);
          })();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
    >
      <Text style={styles.h1}>Today</Text>
      <Text style={styles.muted}>{today}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {photoError ? <Text style={styles.error}>{photoError}</Text> : null}

      {loading && entries.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#10b981" />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Progress photo</Text>
        {entry?.photoUrl ? (
          <>
            <Image source={{ uri: entry.photoUrl }} style={styles.photo} resizeMode="cover" />
            <View style={styles.photoActions}>
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => void pickAndUploadPhoto()}
                disabled={uploading}
              >
                <Text style={styles.btnSecondaryText}>{uploading ? "Working…" : "Replace photo"}</Text>
              </Pressable>
              <Pressable style={styles.btnDanger} onPress={confirmRemovePhoto} disabled={uploading}>
                <Text style={styles.btnDangerText}>Remove</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.muted}>
              Attach a picture to today&apos;s log (same as Past days on the web). Uses your AWS photo storage.
            </Text>
            <Pressable
              style={[styles.btn, styles.btnPrimary, uploading && styles.btnDisabled]}
              onPress={() => void pickAndUploadPhoto()}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Add photo for today</Text>
              )}
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today&apos;s log</Text>
        {entry ? (
          <>
            <Row label="Weight (morning)" value={`${entry.morningWeight}${settings?.unit === "lbs" ? " lb" : " kg"}`} />
            {entry.calories != null ? <Row label="Calories" value={`${entry.calories} kcal`} /> : null}
            {entry.protein != null ? <Row label="Protein" value={`${entry.protein} g`} /> : null}
            {entry.steps != null ? <Row label="Steps" value={`${entry.steps}`} /> : null}
            {entry.sleep != null ? <Row label="Sleep" value={`${entry.sleep} h`} /> : null}
          </>
        ) : (
          <Text style={styles.muted}>No entry for today yet. Log on the web or pull to refresh after syncing.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent days ({recent.length})</Text>
        {recent.length === 0 ? (
          <Text style={styles.muted}>No entries loaded.</Text>
        ) : (
          recent.map((e) => (
            <Text key={e.id} style={styles.rowLine}>
              {e.date} · {e.morningWeight}
              {settings?.unit === "lbs" ? " lb" : " kg"}
              {e.calories != null ? ` · ${e.calories} kcal` : ""}
              {e.photoUrl ? " · 📷" : ""}
            </Text>
          ))
        )}
      </View>

      {settings ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Goals</Text>
          <Row label="Goal weight" value={`${settings.goalWeight} ${settings.unit}`} />
          <Row label="Start weight" value={`${settings.startWeight} ${settings.unit}`} />
          <Row label="Target date" value={settings.targetDate} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: "700", color: "#f1f5f9" },
  muted: { color: "#94a3b8", marginTop: 6, fontSize: 14, lineHeight: 20 },
  error: { color: "#fca5a5", marginTop: 12, fontSize: 14 },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#e2e8f0", marginBottom: 12 },
  photo: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    marginBottom: 12,
  },
  photoActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  rowLabel: { color: "#94a3b8", fontSize: 14 },
  rowValue: { color: "#f1f5f9", fontSize: 14, fontWeight: "500" },
  rowLine: { color: "#cbd5e1", fontSize: 13, marginBottom: 6 },
  btn: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: "#10b981" },
  btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  btnSecondary: { backgroundColor: "#334155", flex: 1, minWidth: 120 },
  btnSecondaryText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600" },
  btnDanger: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#7f1d1d", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  btnDangerText: { color: "#fca5a5", fontSize: 14, fontWeight: "600" },
  btnDisabled: { opacity: 0.6 },
});

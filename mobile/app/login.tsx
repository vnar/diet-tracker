import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth/AuthContext";
import { trackMobile } from "@/src/analytics/bridge";

type ScreenMode = "signin" | "forgot" | "reset";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, requestPasswordReset, completePasswordReset, status } = useAuth();
  const [mode, setMode] = useState<ScreenMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function goToSignIn() {
    setMode("signin");
    setError(null);
    setInfo(null);
    setCode("");
    setNewPassword("");
  }

  async function onSignIn() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await signIn(email, password);
      if (result.ok) {
        router.replace("/(tabs)");
      } else {
        setError(result.error);
        trackMobile("mobile_error", { where: "login", message: result.error });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRequestReset() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo("If an account exists for that email, we sent a reset code. Check your inbox.");
      setMode("reset");
      setCode("");
      setNewPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function onCompleteReset() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await completePasswordReset({ email, code, newPassword });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo("Password updated. Sign in with your new password.");
      setMode("signin");
      setPassword("");
      setCode("");
      setNewPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function onResendReset() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo("If an account exists for that email, we sent another reset code.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "authenticated") {
    router.replace("/(tabs)");
    return null;
  }

  const canSubmitSignIn = email.trim().length > 0 && password.length >= 8;
  const canSubmitForgot = email.trim().length > 0;
  const canSubmitReset =
    email.trim().length > 0 && code.trim().length > 0 && newPassword.length >= 8;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>Ojas Health</Text>
      <Text style={styles.subtitle}>
        {mode === "signin"
          ? "Sign in with the same account as the web app."
          : mode === "forgot"
            ? "Enter your email. If an account exists, you will get a reset code."
            : "Enter the code from your email and choose a new password."}
      </Text>

      {mode !== "signin" ? (
        <Pressable onPress={goToSignIn} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back to sign in</Text>
        </Pressable>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#64748b"
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
      />

      {mode === "signin" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            onPress={() => {
              setMode("forgot");
              setError(null);
              setInfo(null);
              setCode("");
              setNewPassword("");
            }}
            style={styles.forgotWrap}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        </>
      ) : null}

      {mode === "reset" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Reset code from email"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            value={code}
            onChangeText={setCode}
          />
          <TextInput
            style={styles.input}
            placeholder="New password (min 8 characters)"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      {mode === "signin" ? (
        <Pressable
          style={[styles.button, (busy || !canSubmitSignIn) && styles.buttonDisabled]}
          onPress={() => void onSignIn()}
          disabled={busy || !canSubmitSignIn}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>
      ) : null}

      {mode === "forgot" ? (
        <Pressable
          style={[styles.button, (busy || !canSubmitForgot) && styles.buttonDisabled]}
          onPress={() => void onRequestReset()}
          disabled={busy || !canSubmitForgot}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Email reset code</Text>
          )}
        </Pressable>
      ) : null}

      {mode === "reset" ? (
        <>
          <Pressable
            style={[styles.button, (busy || !canSubmitReset) && styles.buttonDisabled]}
            onPress={() => void onCompleteReset()}
            disabled={busy || !canSubmitReset}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Set new password</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            onPress={() => void onResendReset()}
            disabled={busy || !email.trim()}
          >
            <Text style={styles.secondaryButtonText}>Resend reset code</Text>
          </Pressable>
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0f172a",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#f1f5f9",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#94a3b8",
    marginBottom: 16,
  },
  backLink: {
    marginBottom: 16,
  },
  backLinkText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#34d399",
  },
  forgotWrap: {
    alignSelf: "flex-start",
    marginBottom: 8,
    marginTop: -4,
  },
  forgotText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#34d399",
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#f1f5f9",
    marginBottom: 12,
    backgroundColor: "#1e293b",
  },
  error: {
    color: "#fca5a5",
    marginBottom: 12,
    fontSize: 14,
  },
  info: {
    color: "#6ee7b7",
    marginBottom: 12,
    fontSize: 14,
  },
  button: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#475569",
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
  },
});

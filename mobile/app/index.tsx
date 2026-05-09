import { Redirect } from "expo-router";
import { useAuth } from "@/src/auth/AuthContext";

export default function Index() {
  const { status } = useAuth();
  if (status === "loading") {
    return null;
  }
  if (status === "unauthenticated") {
    return <Redirect href="/login" />;
  }
  return <Redirect href="/(tabs)" />;
}

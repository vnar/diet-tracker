"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { SubscriptionSnapshot } from "@/lib/billing/types";

export type SubscriptionContextValue = {
  subscription: SubscriptionSnapshot | null;
  setSubscription: Dispatch<SetStateAction<SubscriptionSnapshot | null>>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const value = useMemo(
    () => ({
      subscription,
      setSubscription,
    }),
    [subscription],
  );
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscriptionSnapshot(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    return {
      subscription: null,
      setSubscription: () => {},
    };
  }
  return ctx;
}

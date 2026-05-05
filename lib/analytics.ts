"use client";

type EventProps = Record<string, unknown>;

type QueuedEvent = {
  event: string;
  props?: EventProps;
};

let queue: QueuedEvent[] = [];
let isFlushing = false;
let initialized = false;
let testApiKeyOverride: string | undefined;
let testHostOverride: string | undefined;
let testAdapterOverride:
  | {
      init: (apiKey: string, config: Record<string, unknown>) => void;
      capture: (event: string, props?: EventProps) => void;
    }
  | undefined;

function env(name: string): string | undefined {
  if (name === "NEXT_PUBLIC_POSTHOG_KEY" && testApiKeyOverride !== undefined) {
    return testApiKeyOverride;
  }
  if (name === "NEXT_PUBLIC_POSTHOG_HOST" && testHostOverride !== undefined) {
    return testHostOverride;
  }
  return (process.env as Record<string, string | undefined>)[name];
}

async function initPosthog() {
  if (initialized) return true;
  const apiKey = env("NEXT_PUBLIC_POSTHOG_KEY");
  if (!apiKey) return false;
  const host = env("NEXT_PUBLIC_POSTHOG_HOST") || "https://us.i.posthog.com";
  if (testAdapterOverride) {
    testAdapterOverride.init(apiKey, {
      api_host: host,
      capture_pageview: false,
      capture_pageleave: false,
    });
    initialized = true;
    return true;
  }
  const posthogModule = await import("posthog-js");
  posthogModule.default.init(apiKey, {
    api_host: host,
    capture_pageview: false,
    capture_pageleave: false,
  });
  initialized = true;
  return true;
}

export function track(event: string, props?: EventProps): void {
  if (!env("NEXT_PUBLIC_POSTHOG_KEY")) return;
  queue.push({ event, props });
  void flushAnalyticsQueue();
}

export async function flushAnalyticsQueue(): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const ready = await initPosthog();
    if (!ready) return;
    if (queue.length === 0) return;
    const posthog =
      testAdapterOverride ??
      (await import("posthog-js")).default;
    const pending = [...queue];
    queue = [];
    for (const entry of pending) {
      posthog.capture(entry.event, entry.props);
    }
  } finally {
    isFlushing = false;
  }
}

export function __analyticsTestOnlyReset() {
  queue = [];
  isFlushing = false;
  initialized = false;
  testApiKeyOverride = undefined;
  testHostOverride = undefined;
  testAdapterOverride = undefined;
}

export function __analyticsTestOnlySetConfig(config: { apiKey?: string; host?: string }) {
  testApiKeyOverride = config.apiKey;
  testHostOverride = config.host;
}

export function __analyticsTestOnlySetAdapter(adapter: {
  init: (apiKey: string, config: Record<string, unknown>) => void;
  capture: (event: string, props?: EventProps) => void;
}) {
  testAdapterOverride = adapter;
}

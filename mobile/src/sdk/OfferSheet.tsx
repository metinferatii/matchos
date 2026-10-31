import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { expiry } from "./protocol";
import { Shirt } from "./visuals";
import type { Copy } from "./i18n";
import type { ClubTheme, Offer } from "./types";
export function OfferSheet({
  offer,
  theme,
  t,
  online,
  onBuy,
  onClose,
  dark,
  rtl,
}: {
  offer: Offer;
  theme: ClubTheme;
  t: Copy;
  online: boolean;
  onBuy: () => Promise<void>;
  onClose: () => void;
  dark: boolean;
  rtl: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );
  const slide = useRef(new Animated.Value(350)).current;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const animation = Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: true,
      damping: 25,
      stiffness: 190,
    });
    animation.start();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      animation.stop();
      clearInterval(timer);
    };
  }, [slide]);
  const remaining = Math.max(
    0,
    Math.ceil((expiry(offer.expiresAt) - now) / 1000),
  );
  const fg = dark ? "#f3f4e9" : "#15221c",
    muted = dark ? "#a0aba4" : "#626f66";
  async function purchase() {
    if (status === "busy" || status === "done" || !online || !remaining) return;
    setStatus("busy");
    try {
      await onBuy();
      if (mounted.current) setStatus("done");
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    } catch {
      if (mounted.current) setStatus("error");
    }
  }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t.hide}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              backgroundColor: dark ? "#18251e" : "#f8f9f2",
              transform: [{ translateY: slide }],
              direction: rtl ? "rtl" : "ltr",
            },
          ]}
        >
          <View style={s.handle} />
          <View style={s.row}>
            <Text
              style={[
                s.eyebrow,
                {
                  color: theme.primary,
                  backgroundColor: theme.secondary,
                  padding: 7,
                  borderRadius: 5,
                },
              ]}
            >
              {t.limited.toUpperCase()}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel={t.hide}
              hitSlop={12}
            >
              <Text style={{ fontSize: 25, color: muted }}>×</Text>
            </Pressable>
          </View>
          {status === "done" ? (
            <View style={{ paddingVertical: 28, gap: 12 }}>
              <View style={[s.check, { backgroundColor: theme.primary }]}>
                <Text style={{ color: theme.secondary, fontSize: 32 }}>✓</Text>
              </View>
              <Text style={[s.title, { color: fg }]}>{t.bought}</Text>
              <Text style={{ color: muted }}>{t.confirmed}</Text>
            </View>
          ) : (
            <>
              <Text style={[s.title, { color: fg, marginTop: 22 }]}>
                {t.offer}
              </Text>
              <View style={[s.row, { marginVertical: 14, gap: 18 }]}>
                <View
                  style={{
                    backgroundColor: dark ? "#22372a" : "#e7eddf",
                    borderRadius: 16,
                    padding: 8,
                  }}
                >
                  <Shirt
                    primary={theme.primary}
                    secondary={theme.secondary}
                    player={offer.player}
                  />
                </View>
                <View style={{ flex: 1, gap: 7 }}>
                  <Text style={{ color: fg, fontSize: 20, fontWeight: "800" }}>
                    {offer.player}
                  </Text>
                  <Text style={{ color: muted, fontSize: 13 }}>
                    {offer.title}
                  </Text>
                  <Text style={{ color: fg, fontSize: 28, fontWeight: "800" }}>
                    €{offer.priceEur.toFixed(2)}
                  </Text>
                  <Text style={{ color: muted, fontSize: 12 }}>
                    {offer.discountPct}% {t.discount}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  s.row,
                  {
                    paddingVertical: 16,
                    borderTopWidth: 1,
                    borderColor: dark ? "#314236" : "#dbe2d6",
                  },
                ]}
              >
                <Text style={{ color: muted }}>{t.ends}</Text>
                <Text
                  accessibilityLiveRegion="none"
                  style={{
                    color: fg,
                    fontSize: 20,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {String(Math.floor(remaining / 60)).padStart(2, "0")}:
                  {String(remaining % 60).padStart(2, "0")}
                </Text>
              </View>
              {status === "error" && (
                <Text
                  accessibilityRole="alert"
                  style={{ color: "#d67464", marginBottom: 10 }}
                >
                  {t.failed}
                </Text>
              )}
            </>
          )}
          <Pressable
            disabled={
              status === "busy" ||
              (status !== "done" && (!online || !remaining))
            }
            onPress={status === "done" ? onClose : purchase}
            style={({ pressed }) => [
              s.button,
              {
                backgroundColor: theme.primary,
                opacity: pressed || status === "busy" ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: theme.secondary,
                fontSize: 15,
                fontWeight: "800",
              }}
            >
              {status === "done"
                ? t.close
                : !remaining
                  ? t.expired
                  : !online
                    ? t.offline
                    : status === "busy"
                      ? "…"
                      : `${t.buy}  →`}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#08100b99",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 42,
  },
  handle: {
    height: 4,
    width: 32,
    borderRadius: 3,
    backgroundColor: "#6a766b",
    alignSelf: "center",
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 29, fontWeight: "900", letterSpacing: -1 },
  button: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});

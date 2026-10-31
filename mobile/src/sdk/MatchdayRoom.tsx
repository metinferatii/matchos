import React, { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { copy, teams } from "./i18n";
import { OfferSheet } from "./OfferSheet";
import { expiry } from "./protocol";
import { Crest, Flag, Pulse } from "./visuals";
import { useMatchSocket } from "./useMatchSocket";
import type { FeedItem, Language, MatchdayRoomProps } from "./types";
const FeedRow = memo(function FeedRow({
  item,
  primary,
  fg,
  muted,
  surface,
  rtl,
  label,
}: {
  item: FeedItem;
  primary: string;
  fg: string;
  muted: string;
  surface: string;
  rtl: boolean;
  label: string;
}) {
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(appear, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [appear]);
  return (
    <Animated.View
      style={[
        s.feedRow,
        {
          flexDirection: "row",
          opacity: appear,
          transform: [
            {
              translateY: appear.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[s.minute, { backgroundColor: surface }]}>
        <Text
          style={{
            color: item.kind === "system" ? primary : muted,
            fontSize: 12,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {item.minute}′
        </Text>
      </View>
      <View style={{ flex: 1, gap: 7 }}>
        <Text
          style={[
            s.eyebrow,
            {
              color: item.kind === "commentary" ? muted : primary,
              textAlign: rtl ? "right" : "left",
            },
          ]}
        >
          {label}
        </Text>
        <Text
          style={{
            color: fg,
            fontSize: item.kind === "system" ? 17 : 14,
            lineHeight: 22,
            fontWeight: item.kind === "system" ? "700" : "400",
            writingDirection: rtl ? "rtl" : "ltr",
            textAlign: rtl ? "right" : "left",
          }}
        >
          {item.text}
        </Text>
        {item.kind === "answer" && (
          <View
            style={{
              height: 2,
              width: 30,
              backgroundColor: primary,
              marginTop: 3,
            }}
          />
        )}
      </View>
    </Animated.View>
  );
});
export function MatchdayRoom({
  matchId,
  lang: initialLang,
  serverUrl,
  clubTheme: theme,
  onPurchase,
}: MatchdayRoomProps) {
  const host = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [lang, setLang] = useState(initialLang);
  useEffect(() => setLang(initialLang), [initialLang]);
  const { state, connection, userId, goal, send } = useMatchSocket(
    serverUrl,
    matchId,
    lang,
  );
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [offerVisible, setOfferVisible] = useState(true);
  const dark = useColorScheme() !== "light",
    rtl = lang === "ar",
    t = copy[lang];
  const bg = dark ? "#101b15" : "#f6f7f0",
    fg = dark ? "#f3f4e9" : "#17251d",
    muted = dark ? "#8f9f93" : "#66736a",
    surface = dark ? "#1b2a20" : "#e9eee3",
    line = dark ? "#28392d" : "#dde4d6";
  const accent = dark ? theme.primary : theme.secondary;
  const online = connection === "live";
  const scale = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!goal) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const animation = Animated.parallel([
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.16, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(flash, {
          toValue: 0.25,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [goal, scale, flash]);
  useEffect(() => {
    setOfferVisible(true);
  }, [state.offer?.id]);
  useEffect(() => {
    setPick(null);
    setDismissed(null);
    setQuestion("");
    setNotice("");
  }, [matchId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const total = state.predictions.reduce((sum, p) => sum + p.votes, 0);
  function ask() {
    const text = question.trim();
    if (!text) return;
    if (send({ type: "ask", text })) {
      setQuestion("");
      setNotice(t.sent);
    } else setNotice(t.offline);
  }
  const activeOffer =
    state.offer && expiry(state.offer.expiresAt) > Date.now()
      ? state.offer
      : null;
  return (
    <View
      ref={host}
      style={{ flex: 1 }}
      onLayout={() =>
        host.current?.measureInWindow((_x, y) => setKeyboardOffset(y))
      }
    >
      <KeyboardAvoidingView
        style={[
          s.root,
          { backgroundColor: bg, direction: rtl ? "rtl" : "ltr" },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? keyboardOffset : 0}
      >
        <View style={[s.roomHeader, { borderColor: line }]}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              flex: 1,
              marginRight: 10,
            }}
          >
            <Crest theme={theme} size={22} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[s.eyebrow, { color: muted }]}>
                {t.matchday.toUpperCase()}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: 10, color: muted, marginTop: 7 }}
              >
                {theme.name}
              </Text>
            </View>
          </View>
          <View style={[s.languages, { backgroundColor: surface }]}>
            {(["en", "sq", "es", "ar"] as Language[]).map((l) => (
              <Pressable
                key={l}
                accessibilityRole="button"
                accessibilityLabel={`Language ${l.toUpperCase()}`}
                accessibilityState={{ selected: lang === l }}
                onPress={() => {
                  setLang(l);
                  setNotice("");
                }}
                style={[
                  s.language,
                  lang === l && { backgroundColor: theme.primary },
                ]}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    color: lang === l ? theme.secondary : muted,
                  }}
                >
                  {l.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={[s.scoreboard, { borderColor: line }]}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.primary, opacity: flash },
            ]}
          />
          <Text style={[s.eyebrow, { color: muted, textAlign: "center" }]}>
            {t.final}
          </Text>
          <View style={s.scoreRow}>
            <View style={s.team}>
              <Flag team="arg" />
              <Text style={{ color: fg, fontSize: 13, fontWeight: "600" }}>
                {teams[lang][0]}
              </Text>
            </View>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Animated.Text
                accessibilityLiveRegion="polite"
                style={[
                  s.score,
                  {
                    color: fg,
                    writingDirection: "ltr",
                    transform: [{ scale }],
                  },
                ]}
              >
                {state.score.home}
                <Text style={{ color: muted, fontSize: 26 }}> : </Text>
                {state.score.away}
              </Animated.Text>
              <View
                style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
              >
                {online && <Pulse />}
                <Text
                  style={{
                    color: online ? "#ed8a7b" : muted,
                    fontSize: 10,
                    fontWeight: "800",
                    letterSpacing: 0.8,
                  }}
                >
                  {online
                    ? `${t.live}  ${state.minute}′`
                    : state.minute
                      ? `${state.minute}′`
                      : t.waiting}
                </Text>
              </View>
            </View>
            <View style={s.team}>
              <Flag team="fra" />
              <Text style={{ color: fg, fontSize: 13, fontWeight: "600" }}>
                {teams[lang][1]}
              </Text>
            </View>
          </View>
        </View>
        {!online && (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: surface,
              paddingVertical: 9,
              paddingHorizontal: 20,
            }}
          >
            <Text style={{ color: muted, fontSize: 12 }}>
              {connection === "reconnecting"
                ? t.reconnect
                : connection === "syncing"
                  ? t.syncing
                  : t.connecting}
            </Text>
          </View>
        )}
        <FlatList<FeedItem>
          data={state.feed.filter((i) => i.lang === lang)}
          keyExtractor={(item) => `${lang}-${item.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 18 }}
          ListHeaderComponent={
            <View>
              <View style={[s.prediction, { borderColor: line }]}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: fg,
                      fontSize: 16,
                      fontWeight: "700",
                      letterSpacing: -0.4,
                    }}
                  >
                    {t.next}
                  </Text>
                  <Text style={{ color: accent, fontSize: 13 }}>↗</Text>
                </View>
                <Text style={{ color: muted, fontSize: 11, marginTop: 5 }}>
                  {t.vote}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 15 }}>
                  {state.predictions.map((p) => {
                    const selected = pick === p.player,
                      pct = total ? Math.round((p.votes / total) * 100) : 0;
                    return (
                      <Pressable
                        key={p.player}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: !online }}
                        accessibilityLabel={`${p.player}, ${pct}%`}
                        disabled={!online}
                        onPress={() => {
                          if (send({ type: "vote", player: p.player })) {
                            setPick(p.player);
                            void Haptics.selectionAsync().catch(() => {});
                          }
                        }}
                        style={({ pressed }) => [
                          s.chip,
                          {
                            backgroundColor: selected ? theme.primary : surface,
                            borderColor: selected ? theme.primary : line,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            color: selected ? theme.secondary : fg,
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          {p.player.split(" ").slice(-1).join(" ")}
                        </Text>
                        <Text
                          style={{
                            color: selected ? theme.secondary : muted,
                            fontSize: 17,
                            fontWeight: "700",
                            marginTop: 7,
                          }}
                        >
                          {pct}%
                        </Text>
                        <View
                          style={{
                            height: 3,
                            backgroundColor: line,
                            borderRadius: 3,
                            marginTop: 9,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              height: 3,
                              width: `${pct}%`,
                              backgroundColor: selected
                                ? theme.secondary
                                : theme.primary,
                            }}
                          />
                        </View>
                        {selected && (
                          <Text
                            style={{
                              color: theme.secondary,
                              fontSize: 8,
                              marginTop: 5,
                            }}
                          >
                            {t.picked} ✓
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                {!state.predictions.length && (
                  <Text style={{ color: muted, fontSize: 12, marginTop: 12 }}>
                    {t.waiting}
                  </Text>
                )}
              </View>
              {activeOffer && (
                <Pressable
                  onPress={() => {
                    setOfferVisible(true);
                    setDismissed(null);
                  }}
                  style={[
                    s.offerStrip,
                    { backgroundColor: surface, borderColor: line },
                  ]}
                >
                  <Text
                    style={{ color: accent, fontSize: 12, fontWeight: "700" }}
                  >
                    {t.limited} · {activeOffer.discountPct}% {t.discount}
                  </Text>
                  <Text style={{ color: fg }}>↗</Text>
                </Pressable>
              )}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 22,
                  paddingBottom: 6,
                }}
              >
                <Text
                  style={{
                    color: fg,
                    fontSize: 21,
                    fontWeight: "700",
                    letterSpacing: -0.6,
                  }}
                >
                  {t.feed}
                </Text>
                <Text style={[s.eyebrow, { color: muted }]}>
                  {lang.toUpperCase()} / LIVE
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <FeedRow
              item={item}
              primary={accent}
              fg={fg}
              muted={muted}
              surface={surface}
              rtl={rtl}
              label={t[item.kind]}
            />
          )}
          ListEmptyComponent={
            <View style={{ paddingVertical: 25, gap: 10 }}>
              {connection !== "live" ? (
                [90, 65, 80].map((width, i) => (
                  <View
                    key={i}
                    style={{
                      height: 12,
                      borderRadius: 3,
                      width: `${width}%`,
                      backgroundColor: surface,
                    }}
                  />
                ))
              ) : (
                <Text style={{ color: muted, lineHeight: 22 }}>{t.empty}</Text>
              )}
            </View>
          }
          ListFooterComponent={
            <Text
              style={{ color: muted, fontSize: 9, marginTop: 22, opacity: 0.7 }}
            >
              Data: StatsBomb Open Data
            </Text>
          }
        />
        <View style={[s.composer, { borderColor: line, backgroundColor: bg }]}>
          {notice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: muted, fontSize: 11, paddingBottom: 8 }}
            >
              {notice}
            </Text>
          ) : null}
          <Text style={[s.eyebrow, { color: muted, marginBottom: 8 }]}>
            {t.ask.toUpperCase()}
          </Text>
          <View
            style={[
              s.inputRow,
              { backgroundColor: surface, borderColor: line },
            ]}
          >
            <TextInput
              accessibilityLabel={t.ask}
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={ask}
              maxLength={500}
              returnKeyType="send"
              placeholder={t.placeholder}
              placeholderTextColor={muted}
              style={{
                flex: 1,
                color: fg,
                fontSize: 13,
                padding: 12,
                writingDirection: rtl ? "rtl" : "ltr",
                textAlign: rtl ? "right" : "left",
              }}
            />
            <Pressable
              accessibilityLabel={t.send}
              disabled={!online || !question.trim()}
              onPress={ask}
              style={({ pressed }) => ({
                width: 34,
                height: 34,
                margin: 5,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.primary,
                opacity: !online || !question.trim() ? 0.35 : pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: theme.secondary, fontSize: 22 }}>↑</Text>
            </Pressable>
          </View>
          <Text
            style={{
              textAlign: "center",
              color: muted,
              fontSize: 8,
              letterSpacing: 1.5,
              marginTop: 11,
            }}
          >
            {t.powered}
          </Text>
        </View>
        {activeOffer && offerVisible && dismissed !== activeOffer.id && (
          <OfferSheet
            key={activeOffer.id}
            offer={activeOffer}
            theme={theme}
            t={t}
            online={online}
            dark={dark}
            rtl={rtl}
            onClose={() => {
              setDismissed(activeOffer.id);
              setOfferVisible(false);
            }}
            onBuy={async () => {
              if (!send({ type: "buy", offerId: activeOffer.id }))
                throw new Error("Disconnected");
              await onPurchase?.({ matchId, userId, offer: activeOffer });
            }}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1 },
  roomHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  eyebrow: { fontSize: 9, fontWeight: "700", letterSpacing: 1.3 },
  languages: { flexDirection: "row", padding: 3, borderRadius: 8, gap: 2 },
  language: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },
  scoreboard: {
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomWidth: 1,
    overflow: "hidden",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    marginTop: 17,
  },
  team: { alignItems: "center", gap: 9, width: 92 },
  score: {
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: -2,
    fontVariant: ["tabular-nums"],
  },
  prediction: { paddingVertical: 20, borderBottomWidth: 1 },
  chip: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 84,
  },
  feedRow: { gap: 12, paddingVertical: 17 },
  minute: {
    width: 37,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },
  offerStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 13,
    marginTop: 18,
    borderRadius: 10,
    borderWidth: 1,
  },
  composer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
});

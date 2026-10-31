import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { MatchdayRoom } from "./src/sdk";
import { Crest, Flag, Pulse } from "./src/sdk/visuals";
const theme = { primary: "#c1d991", secondary: "#14251b", name: "FK Demo" };
const serverUrl =
  process.env.EXPO_PUBLIC_WS_URL || "ws://localhost:8787/matches/wc22-final";
export default function App() {
  const [tab, setTab] = useState<"home" | "matchday">("home");
  // The shell follows the OS. Switch the simulator appearance to preview both modes.
  const dark = useColorScheme() !== "light";
  const accent = dark ? theme.primary : theme.secondary;
  const bg = dark ? "#101b15" : "#f6f7f0",
    fg = dark ? "#f3f4e9" : "#17251d",
    muted = dark ? "#8f9f93" : "#66736a",
    line = dark ? "#28392d" : "#dde4d6";
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: bg }}
        edges={["top", "left", "right", "bottom"]}
      >
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <View style={[s.app, { backgroundColor: bg }]}>
          <View style={[s.header, { borderColor: line }]}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 11 }}
            >
              <Crest theme={theme} size={31} />
              <View>
                <Text
                  style={{
                    color: fg,
                    fontSize: 18,
                    fontWeight: "800",
                    letterSpacing: -0.7,
                  }}
                >
                  FK DEMO<Text style={{ color: theme.primary }}> /</Text>
                </Text>
                <Text
                  style={{
                    color: muted,
                    fontSize: 8,
                    letterSpacing: 2,
                    marginTop: 4,
                  }}
                >
                  ONE CLUB. EVERY VOICE.
                </Text>
              </View>
            </View>
            <View
              style={{
                borderColor: line,
                borderWidth: 1,
                borderRadius: 20,
                width: 34,
                height: 34,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: fg, fontSize: 10, fontWeight: "700" }}>
                FK
              </Text>
            </View>
          </View>
          <View style={{ flex: 1, display: tab === "home" ? "flex" : "none" }}>
            <ScrollView
              contentContainerStyle={{ padding: 22, paddingBottom: 30 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  gap: 7,
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <View
                  style={{
                    width: 17,
                    height: 1,
                    backgroundColor: theme.primary,
                  }}
                />
                <Text
                  style={{ color: muted, fontSize: 10, letterSpacing: 1.6 }}
                >
                  THE CLUB, IN YOUR POCKET
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 47,
                  lineHeight: 49,
                  fontWeight: "800",
                  letterSpacing: -2,
                  color: fg,
                  marginTop: 19,
                }}
              >
                This is where{"\n"}we belong.
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 22,
                  color: muted,
                  marginTop: 16,
                  maxWidth: 285,
                }}
              >
                Every minute. Every voice. Your matchday starts here.
              </Text>
              <Pressable
                onPress={() => setTab("matchday")}
                style={({ pressed }) => ({
                  backgroundColor: theme.secondary,
                  borderColor: "#385140",
                  borderWidth: 1,
                  borderRadius: 18,
                  padding: 22,
                  marginTop: 30,
                  overflow: "hidden",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <Pulse color={theme.primary} />
                    <Text
                      style={{
                        color: theme.primary,
                        fontSize: 9,
                        letterSpacing: 1.4,
                        fontWeight: "800",
                      }}
                    >
                      THE MATCHDAY ROOM
                    </Text>
                  </View>
                  <Text style={{ color: "#a2b3a6", fontSize: 10 }}>
                    2022 / REPLAY
                  </Text>
                </View>
                <View
                  style={{
                    marginVertical: 26,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Flag team="arg" />
                  <Text
                    style={{
                      color: "#f3f4e9",
                      fontSize: 23,
                      fontWeight: "700",
                      letterSpacing: -1,
                    }}
                  >
                    Argentina
                  </Text>
                  <Text style={{ color: "#8f9f93", fontSize: 12 }}>vs</Text>
                  <Flag team="fra" />
                </View>
                <Text style={{ color: "#a2b3a6", fontSize: 12 }}>
                  World Cup Final · Lusail Stadium
                </Text>
                <View
                  style={{
                    height: 1,
                    backgroundColor: "#354939",
                    marginVertical: 20,
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: theme.primary,
                      fontWeight: "700",
                      fontSize: 14,
                    }}
                  >
                    Enter the live room
                  </Text>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: theme.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: theme.secondary, fontSize: 19 }}>
                      ↗
                    </Text>
                  </View>
                </View>
              </Pressable>
              <View
                style={{
                  marginTop: 30,
                  flexDirection: "row",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: fg,
                    fontSize: 21,
                    fontWeight: "700",
                    letterSpacing: -0.7,
                  }}
                >
                  Closer to the club.
                </Text>
                <Text style={{ color: muted, fontSize: 9 }}>FK / 01</Text>
              </View>
              <View
                style={{
                  marginTop: 16,
                  borderTopWidth: 1,
                  borderColor: line,
                  paddingTop: 18,
                  gap: 9,
                }}
              >
                <Text
                  style={{
                    color: accent,
                    fontSize: 9,
                    fontWeight: "800",
                    letterSpacing: 1.5,
                  }}
                >
                  YOUR LANGUAGE. YOUR MATCH.
                </Text>
                <Text style={{ color: muted, fontSize: 13, lineHeight: 21 }}>
                  Live commentary, fan predictions, and moments worth wearing.
                  All in one room.
                </Text>
              </View>
            </ScrollView>
          </View>
          <View
            style={{ flex: 1, display: tab === "matchday" ? "flex" : "none" }}
          >
            {tab === "matchday" && (
              <MatchdayRoom
                matchId="wc22-final"
                lang="sq"
                serverUrl={serverUrl}
                clubTheme={theme}
                onPurchase={async (order) => {
                  console.info("Matchday purchase request", order.offer.id);
                }}
              />
            )}
          </View>
          <View style={[s.tabs, { borderColor: line }]}>
            {(["home", "matchday"] as const).map((item) => (
              <Pressable
                key={item}
                onPress={() => setTab(item)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === item }}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 12,
                  gap: 5,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View
                  style={{
                    width: 18,
                    height: 15,
                    borderWidth: 1.5,
                    borderColor: tab === item ? accent : muted,
                    borderRadius: item === "home" ? 3 : 7,
                  }}
                >
                  {item === "matchday" && (
                    <View
                      style={{
                        width: 1,
                        height: 12,
                        alignSelf: "center",
                        backgroundColor: tab === item ? accent : muted,
                      }}
                    />
                  )}
                </View>
                <Text
                  style={{
                    color: tab === item ? accent : muted,
                    fontSize: 10,
                    fontWeight: "600",
                  }}
                >
                  {item === "home" ? "Club home" : "Matchday"}
                </Text>
                {tab === item && (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      width: 24,
                      height: 2,
                      backgroundColor: theme.primary,
                    }}
                  />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  app: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center" },
  header: {
    height: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    borderBottomWidth: 1,
  },
  tabs: { flexDirection: "row", borderTopWidth: 1 },
});

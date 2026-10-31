import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import type { ClubTheme } from "./types";
export function Crest({
  theme,
  size = 38,
}: {
  theme: ClubTheme;
  size?: number;
}) {
  if (theme.logo)
    return (
      <Image
        source={
          typeof theme.logo === "string" ? { uri: theme.logo } : theme.logo
        }
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel={theme.name}
      />
    );
  return (
    <View
      style={{
        width: size,
        height: size * 1.12,
        backgroundColor: theme.primary,
        borderRadius: size * 0.18,
        borderBottomLeftRadius: size * 0.45,
        borderBottomRightRadius: size * 0.45,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: theme.secondary,
      }}
    >
      <Text
        style={{
          color: theme.secondary,
          fontWeight: "900",
          fontSize: size * 0.29,
          letterSpacing: -1,
        }}
      >
        FK
      </Text>
      <View
        style={{
          width: size * 0.4,
          height: 2,
          backgroundColor: theme.secondary,
          marginTop: 3,
        }}
      />
    </View>
  );
}
export function Flag({ team }: { team: "arg" | "fra" }) {
  return (
    <View
      accessibilityLabel={team === "arg" ? "Argentina" : "France"}
      style={[v.flag, { flexDirection: team === "fra" ? "row" : "column" }]}
    >
      {(team === "arg"
        ? ["#80bad6", "#f4f3e9", "#80bad6"]
        : ["#263c80", "#f4f3e9", "#ce4d53"]
      ).map((color, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: color }} />
      ))}
      {team === "arg" && (
        <View
          style={{
            position: "absolute",
            left: 13,
            top: 9,
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: "#c6a354",
          }}
        />
      )}
    </View>
  );
}
export function Pulse({ color = "#f17669" }: { color?: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 950,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 950,
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}
export function Shirt({
  primary,
  secondary,
  player,
}: {
  primary: string;
  secondary: string;
  player: string;
}) {
  return (
    <View
      style={{
        width: 112,
        height: 120,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 15,
          left: 5,
          width: 102,
          height: 36,
          backgroundColor: primary,
          transform: [{ rotate: "-8deg" }],
          borderRadius: 5,
        }}
      />
      <View
        style={{
          width: 66,
          height: 96,
          backgroundColor: primary,
          borderRadius: 7,
          alignItems: "center",
          paddingTop: 14,
          borderWidth: 1,
          borderColor: secondary,
        }}
      >
        <View
          style={{
            position: "absolute",
            top: -1,
            width: 23,
            height: 10,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            backgroundColor: secondary,
          }}
        />
        <Text
          numberOfLines={1}
          style={{
            color: secondary,
            fontSize: 8,
            fontWeight: "800",
            textTransform: "uppercase",
          }}
        >
          {player.split(" ").slice(-1)}
        </Text>
        <Text
          style={{
            color: secondary,
            fontSize: 38,
            fontWeight: "900",
            letterSpacing: -3,
          }}
        >
          {player.includes("Mbapp")
            ? "10"
            : player.includes("María")
              ? "11"
              : "10"}
        </Text>
      </View>
    </View>
  );
}
const v = StyleSheet.create({
  flag: { width: 32, height: 23, borderRadius: 4, overflow: "hidden" },
});

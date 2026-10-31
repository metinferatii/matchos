# Matchday OS · React Native SDK

```tsx
import { MatchdayRoom } from "./src/sdk";
const clubTheme = { primary: "#c1d991", secondary: "#14251b", name: "FK Demo" };
<MatchdayRoom matchId="wc22-final" lang="sq" serverUrl={WS_URL} clubTheme={clubTheme} onPurchase={checkout} />
```

Place it in a `flex: 1` parent inside the host app's safe area. The component owns its socket, persistent fan identity, score, feed, predictions, questions, language switcher, and offer sheet. The host owns navigation and actual checkout.

- Languages: English, Albanian, Spanish, and locally scoped Arabic RTL.
- Theme: primary/secondary colors, club name, optional logo URI or image source; follows OS light/dark appearance.
- Transport: query metadata, exponential reconnect, authoritative snapshot replacement, no offline replay of purchases.
- Expo SDK 55 peers: React 19.2, React Native 0.83, `expo-haptics`, and `@react-native-async-storage/async-storage`. Animations use native `Animated`.

`checkout` receives `{ matchId, userId, offer }` after the buy message is sent. A purchase confirmation is a request confirmation; the wire contract has no payment acknowledgement.

See [wire shapes and configuration](../../BACKEND.md) and [running the demo](../../README.md).

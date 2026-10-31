import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  applyMessage,
  initialState,
  parseMessage,
  socketUrl,
} from "./protocol";
import type { ClientMessage, Language, MatchState } from "./types";
export type Connection = "connecting" | "syncing" | "live" | "reconnecting";
let identity: Promise<string> | undefined;
function getIdentity() {
  return (identity ??= (async () => {
    const key = "@matchday/user";
    let saved = await AsyncStorage.getItem(key);
    if (!saved) {
      saved = `fan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      await AsyncStorage.setItem(key, saved);
    }
    return saved;
  })().catch(
    () =>
      `fan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  ));
}
export function useMatchSocket(
  serverUrl: string,
  matchId: string,
  lang: Language,
) {
  const [state, setState] = useState<MatchState>(initialState);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [userId, setUserId] = useState("");
  const [goal, setGoal] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const ready = useRef(false);
  const current = useRef(initialState);
  useEffect(() => {
    let disposed = false,
      attempt = 0,
      retry: ReturnType<typeof setTimeout> | undefined,
      timeout: ReturnType<typeof setTimeout> | undefined;
    let active: WebSocket | null = null;
    let seenSnapshot = false;
    ready.current = false;
    current.current = initialState;
    setState(initialState);
    setConnection("connecting");
    function connect(id: string) {
      if (disposed) return;
      clearTimeout(retry);
      clearTimeout(timeout);
      if (active) {
        active.onclose = null;
        active.close();
      }
      ready.current = false;
      setConnection(attempt || seenSnapshot ? "reconnecting" : "connecting");
      let ws: WebSocket;
      try {
        ws = new WebSocket(socketUrl(serverUrl, matchId, id, lang));
      } catch {
        schedule(id);
        return;
      }
      active = ws;
      socket.current = ws;
      timeout = setTimeout(() => ws.close(), 10000);
      ws.onopen = () => {
        if (!disposed && active === ws) setConnection("syncing");
      };
      ws.onmessage = (event) => {
        if (disposed || active !== ws) return;
        const msg = parseMessage(String(event.data));
        if (!msg) return;
        if (msg.type !== "state" && !ready.current) return;
        if (msg.type === "feed" && msg.item.lang !== lang) return;
        const before = current.current;
        const next = applyMessage(before, msg);
        if (msg.type === "state") {
          clearTimeout(timeout);
          ready.current = true;
          seenSnapshot = true;
          attempt = 0;
          setConnection("live");
        }
        if (
          msg.type === "score" &&
          (next.score.home > before.score.home ||
            next.score.away > before.score.away)
        )
          setGoal((n) => n + 1);
        current.current = next;
        setState(next);
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (disposed || active !== ws) return;
        ready.current = false;
        clearTimeout(timeout);
        schedule(id);
      };
    }
    function schedule(id: string) {
      if (disposed) return;
      setConnection("reconnecting");
      const delay =
        Math.min(4000, 500 * 2 ** Math.min(attempt++, 8)) + Math.random() * 200;
      retry = setTimeout(() => connect(id), delay);
    }
    let id = "";
    getIdentity().then((value) => {
      if (!disposed) {
        id = value;
        setUserId(value);
        connect(value);
      }
    });
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active" && id) connect(id);
    });
    return () => {
      disposed = true;
      ready.current = false;
      clearTimeout(retry);
      clearTimeout(timeout);
      sub.remove();
      if (active) {
        active.onclose = null;
        active.close();
      }
      socket.current = null;
    };
  }, [serverUrl, matchId, lang]);
  const send = useCallback((msg: ClientMessage) => {
    if (!ready.current || socket.current?.readyState !== WebSocket.OPEN)
      return false;
    try {
      socket.current.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }, []);
  return { state, connection, userId, goal, send };
}

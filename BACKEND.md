# SDK configuration and backend handoff

## Props

| Prop         | Meaning                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| `matchId`    | Match room identifier                                                          |
| `lang`       | Initial language, also follows subsequent prop changes: `en`, `sq`, `es`, `ar` |
| `serverUrl`  | Complete `ws://` or `wss://` endpoint; optional `{matchId}` path placeholder   |
| `clubTheme`  | `primary`, `secondary`, `name`, optional `logo` URI or native image source     |
| `onPurchase` | Sync or async callback receiving `{ matchId, userId, offer }`                  |

The host should provide a contrasting primary and secondary pair; the primary is the action fill, secondary is its label. OS appearance drives light/dark surfaces. An omitted logo receives a small club shield fallback. Arabic applies local RTL styles without globally changing the host app's layout or requiring a restart.

## Wire contract

The URL receives `matchId`, `userId`, and `lang` query parameters. Existing query parameters survive. User identity is generated once and persisted using AsyncStorage. No extra client handshake messages are sent. If your actor uses another URL format, supply its complete endpoint or adjust only `socketUrl` in `protocol.ts`.

State snapshot shape (the brief does not specify nested score/prediction shapes):

```ts
{
  type: 'state',
  score: { home: 1, away: 0 },
  minute: 35,
  feed: [{ id: 'event-id', minute: 35, lang: 'sq', kind: 'commentary', text: '…' }],
  offer: null,
  predictions: [{ player: 'Lionel Messi', votes: 42 }]
}
```

Other messages follow the supplied contract exactly. Live vote totals use a new `state` snapshot because the contract defines no prediction update event. Each `state` replaces all match data, including removing old feed entries and offers. Incremental events are ignored until that connection receives its snapshot. Duplicate feed IDs are replaced; the feed is capped at 200 entries. Agent traffic and malformed frames are ignored.

Reconnect uses exponential delays of roughly 0.5, 1, 2, then 4 seconds with jitter, a 10-second snapshot timeout, and immediate resynchronization when the app returns to the foreground. Existing match content stays visible during an outage. Language changes close the old socket and request a fresh snapshot. Intentional cleanup never schedules a reconnect. Votes, questions, and purchases are disabled while disconnected; they are not queued or replayed.

Offer expiry supports epoch milliseconds, epoch seconds, or an ISO timestamp. `priceEur` is the final offered price. Buying sends exactly `{ type: 'buy', offerId }` and invokes the host callback. A confirmation means the request was sent and the host callback resolved; the supplied wire contract has no payment acknowledgement. Implement actual checkout and transaction idempotency in the host/backend. A rejected callback shows a retry state. Displayed votes are server-authoritative; only the user's selection is stored locally for the mounted component.

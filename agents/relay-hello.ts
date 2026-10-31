// Step 3 smoke test: two agents exchange one message over Agent Relay.
//   1. start the local server:  ./agents/start-relay.sh
//   2. run:                     bun agents/relay-hello.ts
// commentator posts to #match -> translator hears it, replies in-thread
// -> commentator hears the reply -> exit 0. Exits 1 on timeout/error.
import { connectAgent, joinChannel, baseUrl } from './relay';

const TIMEOUT_MS = 10_000;
const t0 = performance.now();
const ms = (t: number) => `${(t - t0).toFixed(0)}ms`;

const timer = setTimeout(() => {
  console.error(`FAIL: no round trip within ${TIMEOUT_MS}ms`);
  process.exit(1);
}, TIMEOUT_MS);

try {
  const health = await fetch(new URL('/health', baseUrl())).catch(() => null);
  if (!health?.ok) throw new Error(`relay server not reachable at ${baseUrl()} — run ./agents/start-relay.sh`);

  // One AgentRelay per agent, so each listener only sees that agent's deliveries.
  const commentator = await connectAgent('commentator');
  const translator = await connectAgent('translator');
  await joinChannel(commentator.agent, '#match');
  await joinChannel(translator.agent, '#match');
  console.log(`[${ms(performance.now())}] connected as @${commentator.agent.handle} and @${translator.agent.handle}`);

  const runId = Math.random().toString(36).slice(2, 8); // ignore stale messages from earlier runs
  let sentAt = 0;
  let replySentAt = 0;

  // translator: hear #match posts from others, reply in thread.
  translator.relay.addListener('message.created', async ({ message, envelope }) => {
    if (envelope.channel?.name !== 'match') return;
    if (envelope.from?.name === translator.agent.name) return; // ignore own posts
    if (!message.text.includes(runId)) return;
    const hop1 = performance.now() - sentAt;
    console.log(`[${ms(performance.now())}] translator <- @${envelope.from?.name} in #${envelope.channel?.name}: "${message.text}" (hop ${hop1.toFixed(1)}ms)`);
    replySentAt = performance.now();
    await translator.agent.reply({ messageId: message.messageId, text: `[ES] ¡GOL de Saka! (${runId})` });
  });

  // commentator: hear thread replies to its post.
  const done = new Promise<void>((resolve) => {
    commentator.relay.addListener('thread.reply', ({ message, envelope }) => {
      if (envelope.from?.name === commentator.agent.name) return;
      if (!message.text.includes(runId)) return;
      const now = performance.now();
      console.log(`[${ms(now)}] commentator <- @${envelope.from?.name} (thread ${envelope.parent}): "${message.text}" (hop ${(now - replySentAt).toFixed(1)}ms, round trip ${(now - sentAt).toFixed(1)}ms)`);
      resolve();
    });
  });

  sentAt = performance.now();
  const sent = await commentator.agent.sendMessage({ to: '#match', text: `GOAL! Saka 23' (${runId})` });
  console.log(`[${ms(performance.now())}] commentator -> #match id=${sent.messageId} (send ack ${(performance.now() - sentAt).toFixed(1)}ms)`);

  await done;
  clearTimeout(timer);
  console.log('OK');
  process.exit(0); // AgentRelay keeps WebSockets open; exit explicitly.
} catch (err) {
  console.error('FAIL:', err);
  process.exit(1);
}

// Shared Agent Relay bootstrap for Matchday OS agents.
//
//   const { relay, agent } = await connectAgent('commentator');
//
// - Reads RELAY_BASE_URL / RELAY_WORKSPACE_KEY / RELAY_TOKEN_<NAME> from agents/.env
//   (process.env wins). Creates a workspace on the local server if no key is set.
// - One AgentRelay instance PER agent: its listener then only sees events delivered
//   to that agent (no self-echo, DMs addressed to it only). See RELAY_NOTES.md.
// - Agent names are create-only on the server, so the token from the first
//   register() is saved to .env and later runs use workspace.reconnect().
import { AgentRelay, type RelayAgentClient } from '@agent-relay/sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENV_PATH = join(import.meta.dir, '.env');

function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function setEnvVar(key: string, value: string) {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split('\n').filter(Boolean) : [];
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(ENV_PATH, lines.join('\n') + '\n', { mode: 0o600 });
  process.env[key] = value;
}

function env(key: string): string | undefined {
  return process.env[key] || readEnvFile()[key] || undefined;
}

const tokenKey = (name: string) => `RELAY_TOKEN_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

export const baseUrl = () => env('RELAY_BASE_URL') ?? 'http://127.0.0.1:8787';

let workspaceKeyPromise: Promise<string> | undefined;

/** Workspace key from env/.env, or create one on the (local) server and save it. */
export function ensureWorkspaceKey(): Promise<string> {
  workspaceKeyPromise ??= (async () => {
    const existing = env('RELAY_WORKSPACE_KEY');
    if (existing) return existing;
    const ws = await AgentRelay.createWorkspace({ name: env('RELAY_WORKSPACE_NAME') ?? 'matchday', baseUrl: baseUrl() });
    if (!ws.workspaceKey) throw new Error('relay server returned no workspace key');
    setEnvVar('RELAY_BASE_URL', baseUrl());
    setEnvVar('RELAY_WORKSPACE_KEY', ws.workspaceKey);
    // Tokens from an older workspace are useless now.
    const vars = readEnvFile();
    for (const k of Object.keys(vars)) if (k.startsWith('RELAY_TOKEN_')) setEnvVar(k, '');
    return ws.workspaceKey;
  })();
  return workspaceKeyPromise;
}

export interface ConnectedAgent {
  relay: AgentRelay;
  agent: RelayAgentClient;
}

/** Register (first run) or reconnect (later runs) one agent with its own AgentRelay. */
export async function connectAgent(name: string): Promise<ConnectedAgent> {
  const workspaceKey = await ensureWorkspaceKey();
  const relay = new AgentRelay({ workspaceKey, baseUrl: baseUrl() });
  const saved = env(tokenKey(name));
  if (saved) {
    try {
      return { relay, agent: await relay.workspace.reconnect({ apiToken: saved }) };
    } catch (err) {
      console.warn(`[relay] reconnect ${name} failed (${(err as Error).message}); registering fresh`);
    }
  }
  const agent = await relay.workspace.register({ name, type: 'agent' });
  if (agent.token) setEnvVar(tokenKey(name), agent.token);
  return { relay, agent };
}

/** Create the channel if needed (ignores "already exists"), then join it. */
export async function joinChannel(agent: RelayAgentClient, channel: string) {
  const name = channel.replace(/^#/, '');
  await agent.channels.create({ name }).catch(() => {});
  await agent.channels.join(name);
}

// Note: AgentRelay has no disconnect()/close(); its WebSockets keep the process
// alive, so short-lived scripts must end with process.exit().

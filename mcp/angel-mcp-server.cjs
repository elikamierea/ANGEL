#!/usr/bin/env node
// ANGEL mindmap MCP server (Phase 4a, read-only).
//
// A zero-dependency MCP server over stdio (newline-delimited JSON-RPC 2.0). It is
// spawned per CLI run by the MCP *client* (Claude Code), which ANGEL points here
// via --mcp-config. The server has no link back to the live ANGEL process: it
// just reads the project's saved angel.json (path from ANGEL_PROJECT_ROOT) and
// answers read queries, so a sub-agent can reason about the user's mindmap.
//
// Launched under Electron's bundled Node (ELECTRON_RUN_AS_NODE=1) so the packaged
// app needs no external `node`. Mutation / live-state tools are Phase 4b.

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const SERVER_INFO = { name: 'angel-mindmap', version: '0.1.0' };
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

// When ANGEL is running, it passes a localhost bridge URL + token so we proxy
// tools to the LIVE graph (read + write) in the renderer. Without them we fall
// back to the read-only disk tools below (degraded mode).
const BRIDGE_URL = String(process.env.ANGEL_BRIDGE_URL || '').trim();
const BRIDGE_TOKEN = String(process.env.ANGEL_BRIDGE_TOKEN || '').trim();
const BRIDGE_MODE = Boolean(BRIDGE_URL && BRIDGE_TOKEN);
// NOTE: this server no longer reports which agent it belongs to. The bridge token
// is per-run and bound to the agentId on the ANGEL side, so the bridge resolves the
// caller's agent authoritatively from the token (a run can't spoof another agent).

// Tools the bridge runs WITHOUT a relay timeout (project builds take minutes);
// mirror that here by disabling the HTTP timeout for them. Must stay in sync
// with BRIDGE_NO_TIMEOUT_TOOLS in electron-main.cjs.
const NO_TIMEOUT_TOOLS = new Set(['compile_project', 'run_project']);
// Slightly above the bridge's own 60s renderer-relay timeout, so the bridge's
// (more precise) error normally wins and this only catches a hung bridge.
const BRIDGE_TIMEOUT_MS = 65000;

// Minimal JSON HTTP client to ANGEL's private localhost bridge (bearer auth).
// timeoutMs = 0 disables the timeout (long-running build tools).
function bridgeRequest(method, routePath, body, timeoutMs = BRIDGE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(routePath, BRIDGE_URL); } catch (e) { return reject(e); }
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`bridge ${method} ${routePath} -> HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error(`bridge bad JSON: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    if (timeoutMs > 0) {
      // Idle-socket timeout ≈ total here (the bridge sends nothing until done).
      // Guards against a hung bridge (e.g. renderer reloaded mid-call), which
      // would otherwise hang this CLI tool call forever.
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`bridge ${method} ${routePath} timed out after ${timeoutMs}ms`));
      });
    }
    if (payload) req.write(payload);
    req.end();
  });
}

function projectRoot() {
  return String(process.env.ANGEL_PROJECT_ROOT || '').trim();
}

// Load and shape the saved graph. Throws a friendly Error when the file is
// missing/unreadable so tools/call can report it as an isError result.
function readGraph() {
  const root = projectRoot();
  if (!root) throw new Error('ANGEL_PROJECT_ROOT is not set.');
  const file = path.join(root, 'angel.json');
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (_) {
    throw new Error(`No angel.json found at ${file}. Open/save the project first.`);
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    throw new Error(`angel.json is not valid JSON: ${e.message}`);
  }
  const graph = (doc && doc.graph) || {};
  return {
    projectName: doc?.project?.name || 'untitled',
    layers: Array.isArray(doc?.project?.template?.layers) ? doc.project.template.layers.map(String) : [],
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    containmentRelations: Array.isArray(graph.containmentRelations) ? graph.containmentRelations : [],
    mirrorRelations: Array.isArray(graph.mirrorRelations) ? graph.mirrorRelations : [],
  };
}

// Project one node's per-layer content into a compact, faithful shape. The node
// model carries layerContent[layerId] = { synopsis, detail, status, ... }
// (see gui/modules/graph/graph-domain.js ensureNodeLayerFields).
function projectNode(node, layers) {
  const perLayer = {};
  const lc = (node && node.layerContent && typeof node.layerContent === 'object') ? node.layerContent : {};
  for (const layerId of layers) {
    const item = lc[layerId] || {};
    perLayer[layerId] = {
      synopsis: String(item.synopsis || item.summary || ''),
      detail: String(item.detail || ''),
      status: String(item.status || node?.status || 'active'),
    };
  }
  return {
    id: String(node?.id || ''),
    name: String(node?.name || ''),
    x: Number(node?.x) || 0,
    y: Number(node?.y) || 0,
    parentId: node?.parentId ? String(node.parentId) : null,
    perLayer,
  };
}

function toolGetMindmap() {
  const g = readGraph();
  return {
    project: g.projectName,
    layers: g.layers,
    nodeCount: g.nodes.length,
    edgeCount: g.edges.length,
    nodes: g.nodes.map((n) => projectNode(n, g.layers)),
    edges: g.edges.map((e) => ({ from: String(e?.from || ''), to: String(e?.to || ''), kind: String(e?.kind || '') })),
    containmentRelations: g.containmentRelations,
    mirrorRelations: g.mirrorRelations,
  };
}

function toolGetNode(args) {
  const g = readGraph();
  const id = String(args?.id || '').trim();
  const name = String(args?.name || '').trim();
  if (!id && !name) throw new Error('get_node requires "id" or "name".');
  const node = g.nodes.find((n) => (id && String(n?.id) === id) || (name && String(n?.name) === name));
  if (!node) throw new Error(`No node found matching ${id ? `id=${id}` : `name=${name}`}.`);
  // Return the full raw node plus the per-layer projection for convenience.
  return { node, projected: projectNode(node, g.layers) };
}

const TOOLS = [
  {
    name: 'get_mindmap',
    description: 'Read the ANGEL project mindmap (saved graph). Returns layers, all nodes with their per-layer name/synopsis/detail/status, edges, and containment/mirror relations. Use this to understand the project structure before doing work.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_node',
    description: 'Read full detail for a single mindmap node, by id or name.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node id.' },
        name: { type: 'string', description: 'Node name (used if id is omitted).' },
      },
      additionalProperties: false,
    },
  },
];

function callTool(name, args) {
  if (name === 'get_mindmap') return toolGetMindmap();
  if (name === 'get_node') return toolGetNode(args);
  throw new Error(`Unknown tool: ${name}`);
}

// --- JSON-RPC plumbing -----------------------------------------------------

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      // Echo the client's protocol version when present for max compatibility.
      const protocolVersion = String(params?.protocolVersion || DEFAULT_PROTOCOL_VERSION);
      reply(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
      return;
    }
    case 'notifications/initialized':
    case 'initialized':
      return; // notification, no response
    case 'ping':
      if (!isNotification) reply(id, {});
      return;
    case 'tools/list': {
      if (BRIDGE_MODE) {
        try {
          const r = await bridgeRequest('GET', '/tools');
          reply(id, { tools: Array.isArray(r?.tools) ? r.tools : [] });
          return;
        } catch (_) {
          // Bridge down -> degrade to the disk read tools rather than no tools.
        }
      }
      reply(id, { tools: TOOLS });
      return;
    }
    case 'tools/call': {
      const toolName = String(params?.name || '');
      if (BRIDGE_MODE) {
        try {
          const timeoutMs = NO_TIMEOUT_TOOLS.has(toolName) ? 0 : BRIDGE_TIMEOUT_MS;
          const r = await bridgeRequest('POST', '/invoke', { tool: toolName, args: params?.arguments || {} }, timeoutMs);
          const ok = Boolean(r) && r.ok !== false && !r.error;
          const out = ok ? (r.result !== undefined ? r.result : r) : (r.error || r);
          reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: !ok });
        } catch (e) {
          reply(id, { content: [{ type: 'text', text: `bridge call failed: ${String(e?.message || e)}` }], isError: true });
        }
        return;
      }
      try {
        const result = callTool(toolName, params?.arguments || {});
        reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false });
      } catch (e) {
        // Tool-level failure is reported as an isError result (not a protocol error)
        // so the model sees the message and can recover.
        reply(id, { content: [{ type: 'text', text: String(e?.message || e) }], isError: true });
      }
      return;
    }
    // Advertise nothing for these, but answer gracefully if probed.
    case 'resources/list':
      if (!isNotification) reply(id, { resources: [] });
      return;
    case 'prompts/list':
      if (!isNotification) reply(id, { prompts: [] });
      return;
    default:
      if (!isNotification) replyError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).replace(/\r$/, '');
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    // handle is async (bridge calls); responses correlate by id, so out-of-order
    // completion is fine. Never crash on a bad message.
    Promise.resolve().then(() => handle(msg)).catch(() => {});
  }
});
process.stdin.on('end', () => process.exit(0));

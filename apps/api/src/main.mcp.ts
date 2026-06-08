import 'reflect-metadata';
import { runMcpStdio } from './mcp/transport/mcp-stdio.entry';

/**
 * Local stdio MCP server entrypoint (M3, US4) — `node dist/main.mcp.js` (or `pnpm mcp:stdio`). The
 * SAME image as `api`/`worker`, started differently (Principle VII). Auth is the `RYTASK_PAT` env.
 */
void runMcpStdio();

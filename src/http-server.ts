#!/usr/bin/env node

/**
 * MCP MySQL HTTP Server with Streamable HTTP Transport
 * 
 * This provides remote HTTP access to the MySQL MCP server.
 * It shares the same tool implementation as the stdio version
 * but uses StreamableHTTPServerTransport instead of StdioServerTransport.
 * 
 * Usage:
 *   HTTP_PORT=3000 HTTP_HOST=localhost node dist/http-server.js
 * 
 * Environment Variables:
 *   HTTP_PORT - Port to listen on (default: 3000)
 *   HTTP_HOST - Host to bind to (default: 0.0.0.0)
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME - Database connection
 *   MCP_PERMISSIONS - Comma-separated permissions
 *   MCP_CATEGORIES - Comma-separated categories
 */

import express, { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import { MySQLMCP } from "./index.js";
import { getEnabledTools } from "./tools/toolRegistry.js";
import { validateToolArguments } from "./tools/toolArgumentValidation.js";

// Load tool definitions from manifest
import * as fs from "fs";
import * as path from "path";

const manifestPath = path.resolve(__dirname, "../manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

// Convert manifest tools to MCP Tool format
const TOOLS: Tool[] = manifest.tools.map((tool: any) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.input_schema,
}));

// Configuration
const permissions = process.env.MCP_PERMISSIONS || process.env.MCP_CONFIG || "";
const categories = process.env.MCP_CATEGORIES || "";
const PORT = parseInt(process.env.HTTP_PORT || "3000", 10);
const HOST = process.env.HTTP_HOST || "0.0.0.0";

// Initialize MySQL MCP (shared across sessions)
const mysqlMCP = new MySQLMCP(permissions, categories);

// Create Express app
const app = express();
app.use(express.json({ limit: "10mb" }));

// CORS middleware
app.use((req: Request, res: Response, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, mcp-session-id, Authorization"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Session management
const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; server: Server; createdAt: Date }
>();

// Clean up old sessions (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [sessionId, session] of sessions.entries()) {
    if (session.createdAt < oneHourAgo) {
      console.error(`Cleaning up old session: ${sessionId}`);
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "mysql-mcp-server",
    transport: "streamable-http",
    version: "1.41.0",
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size,
  });
});

// Info endpoint
app.get("/info", (req: Request, res: Response) => {
  const accessProfile = mysqlMCP.getAccessProfile();
  res.json({
    name: "mysql-mcp-server",
    version: "1.41.0",
    transport: "streamable-http",
    permissions: accessProfile.permissions,
    categories: accessProfile.categories,
    filteringMode: accessProfile.filteringMode,
    endpoints: {
      health: "/health",
      info: "/info",
      mcp: "/mcp",
    },
  });
});

// Tool execution helper - maps tool names to MySQL MCP methods
async function executeToolCall(name: string, args: any): Promise<any> {
  // Import the tool execution handler
  const { executeToolByName } = await import("./tool-executor.js");
  return await executeToolByName(name, args, mysqlMCP);
}

// Create MCP server for a session
function createMCPServer(): Server {
  const server = new Server(
    {
      name: "mysql-mcp-server",
      version: "1.41.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const enabledTools = getEnabledTools(mysqlMCP, TOOLS);
    console.error(
      `Tools available: ${enabledTools.length} of ${TOOLS.length} total`
    );
    return { tools: enabledTools };
  });

  // Tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;

    const validation = validateToolArguments(name, args);
    if (!validation.valid) {
      return {
        content: [
          {
            type: "text",
            text: `Validation Error: ${validation.errors?.join(", ") || "Invalid arguments"}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await executeToolCall(name, args);
      return formatToolResult(result);
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// Format tool result for MCP response
function formatToolResult(result: any): any {
  if (result.status === "error") {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${"error" in result ? result.error : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }

  let responseData: any;
  if ("data" in result) {
    responseData = result.data;
  } else if ("transactionId" in result) {
    responseData = { transactionId: result.transactionId };
    if ("message" in result && result.message) {
      responseData.message = result.message;
    }
    if ("activeTransactions" in result) {
      responseData.activeTransactions = result.activeTransactions;
    }
  } else if ("message" in result) {
    responseData = { message: result.message };
  } else {
    responseData = result;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(responseData, null, 2),
      },
    ],
  };
}

// MCP endpoint handler
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let session: {
      transport: StreamableHTTPServerTransport;
      server: Server;
      createdAt: Date;
    };

    if (sessionId && sessions.has(sessionId)) {
      session = sessions.get(sessionId)!;
      console.error(`Reusing session: ${sessionId}`);
    } else {
      const newSessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      const server = createMCPServer();
      await server.connect(transport);

      session = {
        transport,
        server,
        createdAt: new Date(),
      };

      sessions.set(newSessionId, session);
      console.error(`New session created: ${newSessionId}`);
    }

    await session.transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

// Start the HTTP server
async function main() {
  const accessProfile = mysqlMCP.getAccessProfile();
  console.error(`\nMySQL MCP HTTP Server starting...`);
  console.error(`Permissions: ${accessProfile.permissions}`);
  if (accessProfile.categories) {
    console.error(`Categories: ${accessProfile.categories}`);
  }
  console.error(`Filtering mode: ${accessProfile.filteringMode}\n`);

  app.listen(PORT, HOST, () => {
    console.error(`✓ MySQL MCP HTTP Server is running!`);
    console.error(`  Health: http://${HOST}:${PORT}/health`);
    console.error(`  Info:   http://${HOST}:${PORT}/info`);
    console.error(`  MCP:    http://${HOST}:${PORT}/mcp`);
    console.error(`\nPress Ctrl+C to stop the server\n`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

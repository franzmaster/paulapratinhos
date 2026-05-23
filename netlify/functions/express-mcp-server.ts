import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { setupMCPServer } from "../mcp-server/index.js";
import express, { type Request, type Response } from "express";
import serverless from "serverless-http";
import type { Context } from "@netlify/functions";

/**
 * Creates a JSON-RPC 2.0 error response
 */
const createJsonRpcError = (
  code: number,
  message: string,
  id: number | null = null
): Record<string, unknown> => ({
  jsonrpc: "2.0",
  error: {
    code,
    message,
  },
  id,
});

/**
 * Sends a method not allowed error response
 */
const sendMethodNotAllowed = (res: Response, method: string): void => {
  console.log(`Received ${method} MCP request`);
  res.status(405).json(
    createJsonRpcError(-32000, "Method not allowed.")
  );
};

/**
 * Creates and configures the Express application for MCP server
 */
const createMCPExpressApp = (): express.Application => {
  const app = express();
  app.use(express.json());

  /**
   * POST /mcp - Handle MCP protocol requests
   * Creates a new transport and server instance for each request
   * to ensure complete isolation and prevent request ID collisions
   * with concurrent clients.
   */
  app.post("/mcp", async (req: Request, res: Response) => {
    console.log("Received POST MCP request", { body: req.body });

    try {
      const server = setupMCPServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res);

      res.on("close", () => {
        console.log("Request closed");
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);

      if (!res.headersSent) {
        res.status(500).json(
          createJsonRpcError(-32603, "Internal server error")
        );
      }
    }
  });

  /**
   * GET /mcp - Not supported for stateless server
   * GET requests are used for SSE connections which are stateful,
   * so we return a method not allowed error.
   */
  app.get("/mcp", (_req: Request, res: Response) => {
    sendMethodNotAllowed(res, "GET");
  });

  /**
   * DELETE /mcp - Not supported
   */
  app.delete("/mcp", (_req: Request, res: Response) => {
    sendMethodNotAllowed(res, "DELETE");
  });

  return app;
};

// Create and export the serverless handler
const mcpApp = createMCPExpressApp();
export const handler = serverless(mcpApp);

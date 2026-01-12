import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const app = express();
const PORT = process.env.PORT || 10000;

const server = new Server(
  { name: "elitemmindset-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "next_best_step",
      description:
        "Returns one concrete, time-boxed next action when a user feels stuck.",
      inputSchema: {
        type: "object",
        properties: {
          context: { type: "string" },
        },
        required: ["context"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "next_best_step") {
    return {
      content: [
        {
          type: "text",
          text: "Take one 10-minute action that directly reduces uncertainty.",
        },
      ],
    };
  }
  throw new Error("Unknown tool");
});

app.get("/health", (_, res) => res.send("ok"));

app.get("/mcp", async (req, res) => {
  const transport = new SSEServerTransport("/mcp", res);
  await server.connect(transport);
});

app.listen(PORT, () => {
  console.log(`EliteMindset MCP server running on port ${PORT}`);
});

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "elitemindset-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register the next_best_step tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "next_best_step",
        description: "Use when a user feels stuck, overwhelmed, or unsure what to do next. Returns one concrete, time-boxed action they can take immediately to regain momentum.",
        inputSchema: {
          type: "object",
          properties: {
            goal: {
              type: "string",
              description: "What the user is trying to achieve",
            },
            blocker: {
              type: "string",
              description: "What feels stuck or unclear right now",
            },
            time_available: {
              type: "number",
              description: "How many minutes the user can spend right now (e.g. 10, 30, 60)",
            },
          },
          required: ["goal", "blocker"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "next_best_step") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { goal, blocker, time_available } = request.params.arguments;

  if (!goal || !blocker) {
    throw new Error("Missing required fields: goal, blocker");
  }

  const time = Number(time_available ?? 15);
  let action;

  if (!Number.isFinite(time) || time <= 10) {
    action = `Spend 10 minutes writing down the smallest action that would move you past "${blocker}". Do not optimize—just write.`;
  } else if (time <= 30) {
    action = `Spend ${Math.round(time)} minutes creating a rough outline or draft related to "${goal}". Stop when time is up.`;
  } else {
    action = `Use ${Math.round(time)} minutes to actively work on one concrete piece of "${goal}"—prototype, test, or write something that exists outside your head.`;
  }

  return {
    content: [
      {
        type: "text",
        text: action,
      },
    ],
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("EliteMindset MCP server running on stdio");
}

runServer().catch(console.error);

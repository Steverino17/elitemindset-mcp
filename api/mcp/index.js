export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const msg = req.body || {};
  const { jsonrpc, id, method, params } = msg;

  // Basic JSON-RPC validation
  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    });
  }

  // 1) Tool discovery
  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "next_best_step",
            description:
              "Use when a user feels stuck, overwhelmed, or unsure what to do next. Returns one concrete, time-boxed action they can take immediately to regain momentum.",
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
                  description:
                    "How many minutes the user can spend right now (e.g. 10, 30, 60)",
                },
              },
              required: ["goal", "blocker"],
              additionalProperties: false,
            },
          },
        ],
      },
    });
  }

  // 2) Tool execution
  if (method === "tools/call") {
    const safeParams = params || {};
    const name = safeParams.name;
    const args = safeParams.arguments || {};

    if (name !== "next_best_step") {
      return res.status(400).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${String(name)}` },
      });
    }

    const goal = String(args.goal ?? "").trim();
    const blocker = String(args.blocker ?? "").trim();
    const time = Number(args.time_available ?? 15);

    if (!goal || !blocker) {
      return res.status(400).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Missing required fields: goal, blocker" },
      });
    }

    let action;
    if (!Number.isFinite(time) || time <= 10) {
      action = `Spend 10 minutes writing down the smallest action that would move you past "${blocker}". Do not optimize—just write.`;
    } else if (time <= 30) {
      action = `Spend ${Math.round(time)} minutes creating a rough outline or draft related to "${goal}". Stop when time is up.`;
    } else {
      action = `Use ${Math.round(time)} minutes to actively work on one concrete piece of "${goal}"—prototype, test, or write something that exists outside your head.`;
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: action }],
      },
    });
  }

  // Unknown method (JSON-RPC style)
  return res.status(400).json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  });
}

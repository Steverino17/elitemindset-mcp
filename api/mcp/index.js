export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const msg = req.body || {};
  const id = msg.id ?? null;

  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    res.status(400).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid Request" }
    });
    return;
  }

  // Tool list
  if (msg.method === "tools/list") {
    res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "next_best_step",
            description:
              "Given a goal (and optional blocker), returns one clear next step.",
            inputSchema: {
              type: "object",
              properties: {
                goal: { type: "string" },
                blocker: { type: "string" }
              },
              required: ["goal"]
            }
          }
        ]
      }
    });
    return;
  }

  // Tool execution
  if (msg.method === "tools/call") {
    const { name, arguments: args } = msg.params || {};
    if (name !== "next_best_step") {
      res.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Tool not found" }
      });
      return;
    }

    const goal = args?.goal || "";
    const blocker = args?.blocker || "";

    const step = blocker
      ? `Write down the smallest action you can take in 10 minutes to move past: "${blocker}".`
      : `Define the first concrete action you can complete in 10 minutes toward: "${goal}".`;

    res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: step }]
      }
    });
    return;
  }

  res.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found" }
  });
}

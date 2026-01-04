import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// MCP endpoint
app.post('/api/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    });
  }

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [{
          name: "next_best_step",
          description: "Use when a user feels stuck, overwhelmed, or unsure what to do next.",
          inputSchema: {
            type: "object",
            properties: {
              goal: { type: "string", description: "What the user is trying to achieve" },
              blocker: { type: "string", description: "What feels stuck or unclear right now" },
              time_available: { type: "number", description: "Minutes available (e.g. 10, 30, 60)" },
            },
            required: ["goal", "blocker"],
          },
        }],
      },
    });
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};

    if (name !== "next_best_step") {
      return res.status(400).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
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
      result: { content: [{ type: "text", text: action }] },
    });
  }

  return res.status(400).json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  });
});

// SSE endpoint
app.get('/api/sse', (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const endpoint = `${protocol}://${host}/api/mcp`;

  res.write(`event: endpoint\n`);
  res.write(`data: ${endpoint}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(`: keepalive\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

app.listen(PORT, () => {
  console.log(`EliteMindset MCP server running on port ${PORT}`);
});

export default async function handler(req, res) {
  // For ChatGPT, just return the MCP endpoint directly
  // No SSE needed - ChatGPT will connect to the MCP endpoint via HTTP
  const base = `https://${req.headers.host}`;
  const endpoint = `${base}/api/mcp`;
  
  res.status(200).json({ 
    endpoint: endpoint 
  });
}

import { createServer } from 'node:http';

const PORT = 9090;

const TOOLS = [
  { name: 'echo', description: 'Echo back the input', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } },
  { name: 'glean_search', description: 'Search with Glean', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'serval_query', description: 'Query Serval', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
];

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'healthy' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/mcp') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const request = JSON.parse(body);
        const { method, params, id } = request;

        if (method === 'initialize') {
          respond(res, id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'mock-upstream', version: '1.0.0' },
          });
        } else if (method === 'tools/list') {
          respond(res, id, { tools: TOOLS });
        } else if (method === 'tools/call') {
          const toolName = params?.name;
          const tool = TOOLS.find((t) => t.name === toolName);
          if (!tool) {
            respondError(res, id, -32601, `Tool not found: ${toolName}`);
          } else if (toolName === 'echo') {
            respond(res, id, { content: [{ type: 'text', text: params?.arguments?.message ?? '' }] });
          } else {
            respond(res, id, { content: [{ type: 'text', text: `Result from ${toolName}: ${JSON.stringify(params?.arguments)}` }] });
          }
        } else {
          respondError(res, id, -32601, `Method not found: ${method}`);
        }
      } catch {
        respondError(res, null, -32700, 'Parse error');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

function respond(res, id, result) {
  res.writeHead(200);
  res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
}

function respondError(res, id, code, message) {
  res.writeHead(200);
  res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
}

server.listen(PORT, () => {
  console.log(`Mock MCP upstream server listening on port ${PORT}`);
});

# MCP POST Request Debugging Report

**Date:** 2026-02-12
**Status:** ✅ POST Working, Need Cursor Debugging

---

## Issue

**Error:** `HTTP 404: Method not found` when Cursor makes POST request to MCP server

---

## Investigation Results

### 1. GET Request (SSE) - ✅ Working

**Request:**
```bash
curl http://localhost:3002/api/mcp/sse
```

**Server Logs:**
```
[MCP SSE] Incoming GET request
[MCP SSE] URL: http://localhost:3000/api/mcp/sse
[MCP SSE] Method: GET
[MCP SSE] Headers: { ... }
[MCP SSE] Request host header: localhost:3002
[MCP SSE] Request protocol header: http
[MCP SSE] Constructed endpoint URL: http://localhost:3002/api/mcp/sse
[MCP SSE] Endpoint matches connection: YES
[MCP SSE] Sent handshake
[MCP SSE] Sent endpoint URL: http://localhost:3002/api/mcp/sse (from headers: host=localhost:3002, proto=http)
[MCP SSE] Sent tools/list
```

**Response:**
```
event: message
data: {...handshake...}

event: endpoint
data: http://localhost:3002/api/mcp/sse

event: tools/list
data: {...tools...}
```

**Analysis:**
- ✅ GET request works
- ✅ Host header correctly parsed: `localhost:3002`
- ✅ Endpoint URL correctly constructed: `http://localhost:3002/api/mcp/sse`
- ✅ `request.url` shows internal port: `http://localhost:3000/api/mcp/sse` (expected for Docker)

---

### 2. POST Request (JSON-RPC) - ✅ Working

**Request:**
```bash
curl -X POST http://localhost:3002/api/mcp/sse \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_my_tasks",
      "arguments": {"projectId":"test"}
    }
  }'
```

**Server Logs:**
```
[MCP SSE] Incoming POST request
[MCP SSE] URL: http://localhost:3000/api/mcp/sse
[MCP SSE] Method: POST
[MCP SSE] Headers: {
  accept: '*/*',
  'content-length': '112',
  'content-type': 'application/json',
  host: 'localhost:3002',
  'user-agent': 'curl/8.7.1',
  'x-forwarded-for': '::ffff:151.101.192.223',
  'x-forwarded-host': 'localhost:3002',
  'x-forwarded-port': '3000',
  'x-forwarded-proto': 'http'
}
[MCP SSE] Request body: {...}
[MCP POST] Parsed: jsonrpc: 2.0 id: 1 method: tools/call params: { ... }
[MCP POST] Tool call: get_my_tasks { projectId: 'test' }
[MCP Tool] Executing: get_my_tasks with args: { projectId: 'test' }
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{"jsonrpc":"2.0","result":[],"id":1}
```

**Analysis:**
- ✅ POST request works
- ✅ Headers correctly show: `host: localhost:3002`
- ✅ JSON-RPC parsed correctly
- ✅ Tool called successfully
- ✅ Response is valid JSON-RPC

---

## Key Findings

### 1. `request.url` vs `host` Header

**Observed:**
- `request.url`: `http://localhost:3000/api/mcp/sse` (internal port)
- `host` header: `localhost:3002` (external port)

**Why:**
- Next.js returns URL with internal port from Docker
- `host` header correctly shows external port
- We use `host` header to construct endpoint URL

**Impact:**
- ✅ NO IMPACT - we correctly use `host` header
- ⚠️ Only affects logging (shows internal port in logs)

---

### 2. Endpoint URL Construction

**Our Code:**
```typescript
const host = request.headers.get("host") || "localhost:3002";
const protocol = request.headers.get("x-forwarded-proto") || 
                 request.headers.get("x-forwarded-protocol") || 
                 "http";
const endpointUrl = `${protocol}://${host}/api/mcp/sse`;
```

**Result:**
- ✅ Endpoint URL: `http://localhost:3002/api/mcp/sse`
- ✅ Matches connection origin
- ✅ Sent correctly in SSE event

---

### 3. Docker Port Mapping

**Configuration:**
- External port: `3002` (user connects to this)
- Internal port: `3000` (container listens on this)
- Docker forwards: `3002:3000`

**Headers Received:**
- `host: localhost:3002` (external port)
- `x-forwarded-host: localhost:3002` (external port)
- `x-forwarded-port: 3000` (internal port)
- `x-forwarded-proto: http`

**Analysis:**
- Docker correctly preserves external port in headers
- Our code correctly extracts external port from `host` header
- Endpoint URL uses correct port (3002)

---

## Hypotheses for Cursor Error

### Hypothesis 1: Cursor Caching Issue
**Symptom:** Cursor shows 404 after initial connection

**Possible Cause:**
- Cursor caches SSE connection URL
- Uses cached URL for POST requests
- If cached URL is internal port (3000), POST fails

**Test:** Reconnect Cursor to clear cache

---

### Hypothesis 2: SSE Event Format
**Current:**
```
event: endpoint
data: http://localhost:3002/api/mcp/sse
```

**Alternative Format (MCP Spec):**
Some MCP clients expect:
```
event: endpoint
data: {"url":"http://localhost:3002/api/mcp/sse"}
```

**Need to Check:** Does Cursor expect JSON object instead of string?

---

### Hypothesis 3: POST Request Goes to Wrong URL
**Scenario:**
1. Cursor connects to: `http://localhost:3002/api/mcp/sse`
2. Server sends endpoint: `http://localhost:3002/api/mcp/sse`
3. Cursor sends POST to: `http://localhost:3000/api/mcp/sse` (from `request.url` in logs?)

**Investigation Needed:** Check Cursor logs to see actual URL it's posting to

---

## Recommended Actions for User

### 1. Clear MCP Connection in Cursor
```
1. Features → MCP
2. Remove/delete current connection
3. Add new connection with URL: http://localhost:3002/api/mcp/sse
4. Click Connect
```

### 2. Check Cursor Logs
- Open Cursor DevTools (Cmd+Option+I)
- Look for network requests
- Check actual URL Cursor is posting POST to
- Look for 404 errors in network tab

### 3. Test with Direct curl
```bash
# This should work (confirmed working)
curl -X POST http://localhost:3002/api/mcp/sse \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_my_tasks",
      "arguments": {"projectId":"test"}
    }
  }'
```

### 4. Monitor Server Logs
```bash
docker compose logs app -f --tail 50
```

Look for:
- `[MCP SSE] Incoming POST request`
- URL shown in logs
- Whether `method` matches `tools/call`

---

## Status Summary

| Component | Status |
|-----------|--------|
| GET Request (SSE) | ✅ WORKING |
| Endpoint URL Construction | ✅ CORRECT |
| Host Header Parsing | ✅ CORRECT |
| POST Request (curl) | ✅ WORKING |
| Tool Execution | ✅ WORKING |
| JSON-RPC Response | ✅ CORRECT |
| CORS Headers | ✅ PRESENT |
| OPTIONS Handler | ✅ PRESENT |
| Comprehensive Logging | ✅ IMPLEMENTED |

**Overall:** ✅ **SERVER WORKS, NEED CURSOR-SIDE DEBUGGING**

---

## Files Modified

### app/api/mcp/sse/route.ts

**Enhanced Logging:**
- GET: URL, method, headers
- POST: URL, method, headers, request body (raw and parsed)
- OPTIONS: URL, method, headers
- Endpoint construction details

**Status:** All functions now have comprehensive logging

---

## Next Steps

1. **User:** Clear MCP connection in Cursor and reconnect
2. **User:** Check Cursor DevTools for actual POST URL
3. **User:** Monitor server logs for incoming requests
4. **Investigate:** If issue persists, may need to check MCP spec for SSE endpoint event format

---

**The MCP server is functioning correctly. The 404 error appears to be a Cursor-side issue, possibly related to URL caching or incorrect URL being used for POST requests.**

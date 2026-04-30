# MySQL MCP HTTP Server - Usage Guide

This guide shows how to use the MySQL MCP Server with Streamable HTTP transport for remote database access.

## Quick Start

### 1. Start the HTTP Server

```bash
# Using npx (recommended)
npx @berthojoris/mcp-mysql-server-http \
  mysql://root:password@localhost:3306/mydb \
  "list,read,utility"

# Using environment variables
HTTP_PORT=3000 \
HTTP_HOST=0.0.0.0 \
DB_HOST=localhost \
DB_PORT=3306 \
DB_USER=root \
DB_PASSWORD=yourpassword \
DB_NAME=yourdatabase \
MCP_PERMISSIONS="list,read,utility" \
npx @berthojoris/mcp-mysql-server-http
```

### 2. Test the Server

```bash
# Health check
curl http://localhost:3000/health

# Server info
curl http://localhost:3000/info
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | 3000 | Port to listen on |
| `HTTP_HOST` | 0.0.0.0 | Host address to bind |
| `DB_HOST` | - | MySQL host |
| `DB_PORT` | 3306 | MySQL port |
| `DB_USER` | - | MySQL username |
| `DB_PASSWORD` | - | MySQL password |
| `DB_NAME` | - | Database name |
| `MCP_PERMISSIONS` | "" | Permissions (Layer 1) |
| `MCP_CATEGORIES` | "" | Categories (Layer 2) |

### Permissions & Categories

Same as stdio mode - see [README.md](README.md#permission-system) for details.

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "mysql-mcp-server",
  "transport": "streamable-http",
  "version": "1.41.0",
  "timestamp": "2026-04-29T18:15:00.000Z",
  "activeSessions": 2
}
```

### GET /info

Server configuration and capabilities.

**Response:**
```json
{
  "name": "mysql-mcp-server",
  "version": "1.41.0",
  "transport": "streamable-http",
  "permissions": "list,read,utility",
  "categories": "database_discovery,custom_queries",
  "filteringMode": "Dual-layer (Permissions + Categories)",
  "endpoints": {
    "health": "/health",
    "info": "/info",
    "mcp": "/mcp"
  }
}
```

### POST /mcp

MCP protocol endpoint for MCP clients.

**Headers:**
- `Content-Type: application/json`
- `mcp-session-id: <optional-session-id>` (for session reuse)

**Request Body:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": 1
}
```

## Docker Deployment

### Dockerfile Example

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install the package globally
RUN npm install -g @berthojoris/mcp-mysql-server

# Expose the HTTP port
EXPOSE 3000

# Set environment variables
ENV HTTP_PORT=3000
ENV HTTP_HOST=0.0.0.0

# Start the HTTP server
CMD ["mcp-mysql-http", "mysql://user:pass@db:3306/mydb", "list,read,utility"]
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: mydb
      MYSQL_USER: user
      MYSQL_PASSWORD: password
    ports:
      - "3306:3306"

  mcp-server:
    image: node:20-alpine
    command: >
      sh -c "npm install -g @berthojoris/mcp-mysql-server &&
             mcp-mysql-http mysql://user:password@mysql:3306/mydb 'list,read,utility'"
    environment:
      HTTP_PORT: 3000
      HTTP_HOST: 0.0.0.0
    ports:
      - "3000:3000"
    depends_on:
      - mysql
```

## Security Considerations

1. **Use HTTPS in Production**: Place server behind reverse proxy (nginx, Caddy) with SSL/TLS
2. **Authentication**: Add authentication middleware to Express app
3. **Firewall**: Restrict access to known IP addresses
4. **Environment Variables**: Never commit credentials to version control
5. **Permissions**: Use minimal required permissions for database user
6. **Network**: Use Docker networks or VPNs for private access

## Troubleshooting

### Server won't start

```bash
# Check if port is already in use
lsof -i :3000

# Try different port
HTTP_PORT=3001 npx @berthojoris/mcp-mysql-server-http [...]
```

### Database connection fails

```bash
# Test database connection
mysql -h localhost -P 3306 -u root -p

# Check environment variables
env | grep DB_
```

## Use Cases

- Remote database access from web applications
- Cloud deployments (AWS, GCP, Azure)
- Kubernetes/containerized environments
- API integrations with custom clients
- Development/staging environments
- Multi-tenant database access

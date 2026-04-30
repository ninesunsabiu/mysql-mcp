#!/usr/bin/env node

/**
 * MCP MySQL HTTP Server CLI
 * This script starts the MySQL MCP server with HTTP/Streamable HTTP transport
 * Usage: mcp-mysql-http [mysql_url] [permissions] [categories]
 */

const dotenv = require("dotenv");

dotenv.config();

// Get command line arguments
const args = process.argv.slice(2);
const mysqlUrl = args.shift();

let permissions;
let categories;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (permissions === undefined) {
    permissions = arg;
    continue;
  }
  if (categories === undefined) {
    categories = arg;
    continue;
  }
}

// Parse MySQL URL if provided
if (mysqlUrl) {
  try {
    const url = new URL(mysqlUrl);
    const database = url.pathname.replace(/^\//, "") || null;

    const auth =
      url.username && url.password
        ? { user: url.username, password: decodeURIComponent(url.password) }
        : { user: url.username || "root", password: url.password || "" };

    // Set environment variables
    process.env.DB_HOST = url.hostname;
    process.env.DB_PORT = url.port || 3306;
    process.env.DB_USER = auth.user;
    process.env.DB_PASSWORD = auth.password;
    if (database) {
      process.env.DB_NAME = database;
    }
  } catch (error) {
    console.error("Error parsing MySQL URL:", error.message);
    console.error(
      "Usage: mcp-mysql-http mysql://user:password@host:port/dbname [permissions] [categories]"
    );
    process.exit(1);
  }
}

// Set HTTP server configuration
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTP_HOST = process.env.HTTP_HOST || "0.0.0.0";

// Set permissions and categories
if (permissions) {
  process.env.MCP_PERMISSIONS = permissions;
}
if (categories) {
  process.env.MCP_CATEGORIES = categories;
}

console.error("=".repeat(60));
console.error("MySQL MCP HTTP Server");
console.error("=".repeat(60));

if (mysqlUrl) {
  const dbMessage = process.env.DB_NAME
    ? `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
    : `${process.env.DB_HOST}:${process.env.DB_PORT} (no specific database)`;
  console.error(`Database: ${dbMessage}`);
}

if (permissions) {
  console.error(`Permissions (Layer 1): ${permissions}`);
}
if (categories) {
  console.error(`Categories (Layer 2): ${categories}`);
}

console.error(`HTTP Host: ${HTTP_HOST}`);
console.error(`HTTP Port: ${HTTP_PORT}`);
console.error("=".repeat(60));
console.error("");

// Run the HTTP server
try {
  require("../dist/http-server.js");
} catch (error) {
  console.error("Error starting HTTP server:", error.message);
  console.error("");
  console.error("Make sure you have built the project:");
  console.error("  npm run build");
  process.exit(1);
}

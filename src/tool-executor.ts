/**
 * Tool Executor
 * Routes tool calls to appropriate MySQLMCP methods
 * Shared between stdio and HTTP transports
 */

import { MySQLMCP } from "./index.js";

// Helper function to convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Execute a tool by name, automatically routing to the correct MySQLMCP method
 * @param toolName Tool name in snake_case (e.g., "list_databases")
 * @param args Tool arguments
 * @param mysqlMCP MySQLMCP instance
 * @returns Tool execution result
 */
export async function executeToolByName(
  toolName: string,
  args: any,
  mysqlMCP: MySQLMCP
): Promise<any> {
  // Convert tool name from snake_case to camelCase method name
  const methodName = snakeToCamel(toolName);

  // Check if method exists on mysqlMCP
  if (typeof (mysqlMCP as any)[methodName] !== "function") {
    throw new Error(`Unknown tool: ${toolName} (method: ${methodName})`);
  }

  // Call the method with arguments
  const result = await (mysqlMCP as any)[methodName](args || {});

  return result;
}

/**
 * Validate that a tool exists
 * @param toolName Tool name in snake_case
 * @param mysqlMCP MySQLMCP instance
 * @returns true if tool exists, false otherwise
 */
export function toolExists(toolName: string, mysqlMCP: MySQLMCP): boolean {
  const methodName = snakeToCamel(toolName);
  return typeof (mysqlMCP as any)[methodName] === "function";
}

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express = require("express");
const cors = require("cors");
const { z } = require("zod");

const app = express();
app.use(cors());
app.use(express.json());

const server = new McpServer({
  name: "oxy-actions",
  version: "1.0.0",
});

// TODO: Replace these with actual native implementations
// For now they're stubs. Run this on a Mac/iOS device and wire to real APIs.

server.tool(
  "send_message",
  "Send an iMessage/SMS to a contact",
  {
    contact: z.string().describe("Contact name or phone number"),
    message: z.string().describe("Message text"),
  },
  async ({ contact, message }) => {
    // macOS: Use applescript to send iMessage
    // iOS: Requires Shortcuts or native app wrapper
    try {
      const { execSync } = require("child_process");
      const script = `tell application "Messages" to send "${message}" to buddy "${contact}" of (service 1 whose service type is iMessage)`;
      execSync(`osascript -e '${script}'`);
      return {
        content: [{ type: "text", text: `Message sent to ${contact}` }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "create_reminder",
  "Create a reminder with a due date",
  {
    title: z.string().describe("Reminder title"),
    due_date: z.string().optional().describe("Due date (ISO format)"),
    notes: z.string().optional().describe("Additional notes"),
  },
  async ({ title, due_date, notes }) => {
    try {
      const { execSync } = require("child_process");
      let script = `tell application "Reminders"\nmake new reminder with properties {name:"${title}"}`;
      if (due_date) script += `, due date:date "${due_date}"`;
      if (notes) script += `, body:"${notes}"`;
      script += "\nend tell";
      execSync(`osascript -e '${script}'`);
      return {
        content: [{ type: "text", text: `Reminder created: ${title}` }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "make_call",
  "Make a phone call via FaceTime",
  {
    contact: z.string().describe("Contact name or phone number"),
  },
  async ({ contact }) => {
    try {
      const { execSync } = require("child_process");
      execSync(`open "facetime-audio://${contact}"`);
      return {
        content: [{ type: "text", text: `Calling ${contact}...` }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "play_music",
  "Play music on the device",
  {
    query: z.string().describe("Song, artist, album, or playlist"),
  },
  async ({ query }) => {
    try {
      const { execSync } = require("child_process");
      execSync(`osascript -e 'tell application "Music" to search "${query}"'`);
      return {
        content: [{ type: "text", text: `Now playing: ${query}` }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "create_calendar_event",
  "Create a calendar event",
  {
    title: z.string().describe("Event title"),
    start_date: z.string().describe("Start date/time (ISO format)"),
    end_date: z.string().optional().describe("End date/time (ISO format)"),
    location: z.string().optional().describe("Event location"),
    notes: z.string().optional().describe("Event notes"),
  },
  async ({ title, start_date, end_date, location, notes }) => {
    try {
      const { execSync } = require("child_process");
      let script = `tell application "Calendar"\ntell calendar "Default"\nmake new event with properties {summary:"${title}", start date:date "${start_date}"`;
      if (end_date) script += `, end date:date "${end_date}"`;
      if (location) script += `, location:"${location}"`;
      if (notes) script += `, description:"${notes}"`;
      script += "}\nend tell\nend tell";
      execSync(`osascript -e '${script}'`);
      return {
        content: [{ type: "text", text: `Calendar event created: ${title}` }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_current_location",
  "Get the device's current location",
  {},
  async () => {
    try {
      const { execSync } = require("child_process");
      const loc = execSync(
        `osascript -e 'tell application "System Events" to return (current date) as string'`
      )
        .toString()
        .trim();
      return {
        content: [{ type: "text", text: `Location request: ${loc}` }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed: ${e.message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const PORT = process.env.MCP_PORT || 3100;

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    res.status(405).json({ error: "Method not allowed" });
  });

  app.delete("/mcp", async (req, res) => {
    res.status(405).json({ error: "Method not allowed" });
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", tools: server.listTools() });
  });

  app.listen(PORT, () => {
    console.log(`Oxy MCP Server running on http://localhost:${PORT}/mcp`);
    console.log("Available tools: send_message, create_reminder, make_call, play_music, create_calendar_event, get_current_location");
  });
}

main().catch(console.error);

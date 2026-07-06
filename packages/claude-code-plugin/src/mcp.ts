import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readOmittedContent } from "./omission";

const toolName = "read_omitted_content";

const server = new Server(
  { name: "magic-compact", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: toolName,
      description:
        "Read original tool input or output content omitted by Magic Compact.",
      inputSchema: {
        type: "object",
        properties: {
          contentId: {
            type: "string",
            description: "Omitted content ID.",
          },
        },
        required: ["contentId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async request => {
  if (request.params.name !== toolName) {
    throw new Error(`Tool ${request.params.name} not found.`);
  }

  const contentId = request.params.arguments?.["contentId"];
  if (typeof contentId !== "string") {
    throw new Error(`${toolName} requires a contentId string.`);
  }

  const content = await readOmittedContent(contentId);
  return {
    content: [
      {
        type: "text",
        text:
          content ?? `No omitted content found for Content ID: ${contentId}`,
      },
    ],
  };
});

await server.connect(new StdioServerTransport());

import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createMcpServer} from './mcp';
await createMcpServer().connect(new StdioServerTransport());

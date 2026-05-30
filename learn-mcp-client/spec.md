Learn MCP Client is a simple chat app that uses the Microsoft Learn MCP Server at https://learn.microsoft.com/api/mcp to find answers to user questions.

The app is composed of a single HTML page with a CSS file for styling, and a single JavaScript page. The page contains a chat interface in which the user can submit prompts to which responses are displayed in chat bubbles.

Calls are made to the MCP server using the streaming API in the same way a model or agent would do; even though there is no actual model.
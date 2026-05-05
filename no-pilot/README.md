# No-Pilot

A lightweight AI assistant app that provides a simplified emulation of Microsoft 365 Copilot for educational purposes.

## Overview

No-Pilot is a static web application that emulates the Microsoft 365 Copilot experience without requiring a Microsoft 365 subscription or hosted lab environment. It uses in-browser AI models and simulated organizational data to provide a "Copilot-like" user experience for learners.

## Features

### Pages

1. **New Chat** - General-purpose chat interface with intent detection
2. **Search** - Search across organizational documents and contacts
3. **Researcher Agent** - Research topics and generate reports
4. **Analyst Agent** - Analyze CSV data files
5. **Agent Builder** - Create custom agents for website searching

### Functionality

- **Email Search**: Query emails by sender or keyword
- **Calendar Integration**: View and search calendar events
- **Document Search**: Find and view organizational documents (Markdown and CSV)
- **AI-Powered Responses**: Uses Phi 3, Phi 2, or Wikipedia fallback
- **Speech Input**: Voice commands using Web Speech API
- **Custom Agents**: Create agents that search specific websites

### Organizational Data

The application includes simulated data for Fourth Coffee Company:

- **Emails**: Communications about a Microsoft sales opportunity
- **Contacts**: Company employees and their roles
- **Documents**: Contracts, financial projections, and service overviews
- **Calendar**: Meetings and events with dynamic dates

## Technical Details

### Architecture

- **Frontend**: Pure HTML, CSS, and JavaScript (no frameworks)
- **Hosting**: Static site suitable for GitHub Pages
- **AI Models**:
  - Primary: Phi 3 Mini (WebLLM)
  - Fallback: Phi 2 (wllama)
  - Final fallback: Wikipedia API
- **Speech**: Web Speech API with Vosk fallback

### File Structure

```
no-pilot/
├── index.html          # Main application page
├── styles.css          # Application styling
├── app.js              # Application logic and routing
├── data/               # Organizational data
│   ├── emails.json     # Email messages
│   ├── contacts.json   # Contact information
│   ├── documents.json  # Documents and files
│   └── calendar.json   # Calendar events
└── README.md           # This file
```

## Usage

### Opening the Application

Simply open `index.html` in a modern web browser. The application will:

1. Load organizational data
2. Initialize AI models (with progressive fallback)
3. Display the main interface

### Navigation

Use the left sidebar to navigate between pages:

- **New chat**: Start a conversation with the AI
- **Search**: Search for documents and people
- **Researcher**: Generate research reports
- **Analyst**: Analyze data files
- **New agent**: Create custom search agents

### Sample Queries

Try these queries in the New Chat page:

- "Show me emails from Anton"
- "What meetings do I have tomorrow?"
- "Find documents about Microsoft"
- "Tell me about Microsoft Corporation"

### Search Page

Enter keywords to search across:

- Documents (contracts, reports, etc.)
- People (employees and contacts)

Use the shortcut buttons for quick access to common searches.

### Researcher Agent

1. Click a prompt card or type a research topic
2. Choose "Comprehensive Report" or "Summary"
3. Receive AI-generated research

### Analyst Agent

1. Click "Analyze data"
2. Select a CSV document
3. View column summations and analysis

### Agent Builder

1. Enter instructions for your agent
2. Specify a website URL for searching
3. Click "Try it" to test the agent
4. Click "Create" to save it

## Development

### Model Integration

The application attempts to load models in this order:

1. **Phi 3 Mini** via WebLLM (requires WebGPU support)
2. **Phi 2** via wllama (fallback)
3. **Wikipedia API** (final fallback for research queries)

### Customization

To customize the organizational data:

1. Edit JSON files in the `data/` folder
2. Maintain the same structure for compatibility
3. Update keywords for better search results

### Speech Support

Speech recognition is enabled by default using:

- Web Speech API (primary)
- Vosk with local models (fallback)

Click the microphone icon in any input field to use voice input.

## Browser Compatibility

Recommended browsers:

- Chrome/Edge (best WebGPU support)
- Firefox (limited WebGPU)
- Safari (basic functionality)

## Educational Purpose

This application is designed for learning about:

- AI assistant interactions
- Organizational data integration
- Intent detection and routing
- Multi-modal input (text and speech)
- Progressive enhancement with fallbacks

**Note**: This is a simulation and emulation. It does not connect to real Microsoft 365 services or data.

## Future Enhancements

Potential additions:

- Real WebLLM/wllama model integration
- Advanced document parsing
- More agent templates
- Conversation history persistence
- Multi-turn context awareness

## License

See the LICENSE file in the repository root.

## Credits

Created as part of the ai-apps educational repository for teaching AI concepts and Microsoft 365 Copilot functionality.

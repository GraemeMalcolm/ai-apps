// Learn MCP Client - minimal MCP Streamable HTTP client
// Connects to the Microsoft Learn MCP server and calls its tools directly.
// No language model is involved; raw tool results are rendered as chat messages.

const MCP_ENDPOINT = 'https://learn.microsoft.com/api/mcp';
const PROTOCOL_VERSION = '2025-06-18';

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusEl = document.getElementById('status');

let sessionId = null;
let nextId = 1;
let tools = [];
let initializing = null;

// Debug mode is on by default while CORS / payload-shape issues are being diagnosed.
// Disable by appending ?debug=0 to the URL.
const DEBUG = new URLSearchParams(location.search).get('debug') !== '0';

function debugBlock(label, data) {
    if (!DEBUG) return '';
    let text;
    try { text = typeof data === 'string' ? data : JSON.stringify(data, null, 2); }
    catch { text = String(data); }
    return `<details class="debug-block"><summary>${escapeHtml(label)}</summary><pre>${escapeHtml(text)}</pre></details>`;
}

function errorDetails(err) {
    const lines = [];
    lines.push(`name: ${err && err.name}`);
    lines.push(`message: ${err && err.message}`);
    if (err && err.stack) lines.push('stack:\n' + err.stack);
    return lines.join('\n');
}

function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Very small markdown -> HTML renderer for the snippets the Learn server returns.
function renderMarkdown(md) {
    let html = escapeHtml(md);
    // fenced code blocks
    html = html.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
    // inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // links [text](url)
    html = html.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // paragraphs / line breaks
    html = html.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    return html;
}

function addMessage(role, html, author) {
    const wrap = document.createElement('div');
    wrap.className = 'message ' + (role === 'user' ? 'user-message' : 'assistant-message');
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '🙂' : '📚';
    const content = document.createElement('div');
    content.className = 'message-content';
    if (author) {
        const a = document.createElement('p');
        a.className = 'message-author';
        a.textContent = author;
        content.appendChild(a);
    }
    const body = document.createElement('div');
    body.innerHTML = html;
    content.appendChild(body);
    wrap.appendChild(avatar);
    wrap.appendChild(content);
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return body;
}

// Parse a Server-Sent Events stream and yield the JSON payload of each `data:` event.
async function* readSseJson(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLines = rawEvent.split('\n')
                .filter(l => l.startsWith('data:'))
                .map(l => l.slice(5).trimStart());
            if (!dataLines.length) continue;
            const data = dataLines.join('\n');
            try { yield JSON.parse(data); } catch { /* ignore */ }
        }
    }
}

// Send a JSON-RPC request and return the first matching response message.
async function mcpRequest(method, params, { isNotification = false } = {}) {
    const id = isNotification ? undefined : nextId++;
    const body = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) };
    if (!isNotification) body.id = id;

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL_VERSION,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const res = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    // Capture session id if the server issued one.
    const sid = res.headers.get('Mcp-Session-Id') || res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;

    if (isNotification) {
        // Notifications expect 202 Accepted with no body content of interest.
        if (!res.ok && res.status !== 202) {
            throw new Error(`Notification ${method} failed: ${res.status}`);
        }
        return null;
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${method} failed: ${res.status} ${res.statusText} ${text}`);
    }

    const ct = (res.headers.get('Content-Type') || '').toLowerCase();
    if (ct.includes('text/event-stream')) {
        for await (const msg of readSseJson(res)) {
            if (msg.id === id) {
                if (msg.error) throw new Error(`${method} error: ${msg.error.message}`);
                return msg.result;
            }
        }
        throw new Error(`${method}: stream ended without a response`);
    } else {
        const msg = await res.json();
        if (msg.error) throw new Error(`${method} error: ${msg.error.message}`);
        return msg.result;
    }
}

async function ensureInitialized() {
    if (tools.length) return;
    if (initializing) return initializing;
    initializing = (async () => {
        setStatus('Connecting…', 'working');
        await mcpRequest('initialize', {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'learn-mcp-client', version: '0.1.0' },
        });
        await mcpRequest('notifications/initialized', undefined, { isNotification: true });
        const listed = await mcpRequest('tools/list', {});
        tools = listed.tools || [];
        setStatus(`Connected · ${tools.length} tool${tools.length === 1 ? '' : 's'}`, 'connected');
    })();
    try {
        await initializing;
    } finally {
        initializing = null;
    }
}

function pickSearchTool() {
    if (!tools.length) return null;
    // Prefer the Learn docs search tool; otherwise first tool with a query/question arg.
    const named = tools.find(t => /search/i.test(t.name));
    if (named) return named;
    return tools[0];
}

function buildArguments(tool, query) {
    const schema = tool.inputSchema || {};
    const props = schema.properties || {};
    const args = {};
    const candidates = ['query', 'question', 'q', 'search', 'searchQuery', 'text', 'prompt'];
    const key = candidates.find(k => k in props) || Object.keys(props)[0];
    if (key) args[key] = query;
    return args;
}

function extractItems(result) {
    const items = [];
    const parts = (result && result.content) || [];
    for (const part of parts) {
        if (part.type === 'text' && typeof part.text === 'string') {
            const trimmed = part.text.trim();
            let parsed = null;
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try { parsed = JSON.parse(trimmed); } catch { /* not JSON */ }
            }
            if (Array.isArray(parsed)) items.push(...parsed);
            else if (parsed && typeof parsed === 'object') items.push(parsed);
            else items.push({ content: part.text });
        }
    }
    return items;
}

// Take the first non-empty paragraph from a markdown/plain-text blob.
// Skips headings, front-matter, and very short fragments.
function firstParagraph(text) {
    if (!text) return '';
    let s = String(text).replace(/\r\n/g, '\n').trim();
    // Strip YAML front-matter (--- ... ---) often present in Learn doc chunks.
    if (s.startsWith('---')) {
        const end = s.indexOf('\n---', 3);
        if (end !== -1) s = s.slice(end + 4).trim();
    }
    const blocks = s.split(/\n\s*\n/);
    for (const raw of blocks) {
        const b = raw.trim();
        if (!b) continue;
        if (b.startsWith('#')) continue;             // markdown heading
        if (b.startsWith('```')) continue;           // code fence
        if (b.startsWith('|')) continue;             // table row
        if (b.startsWith('>')) continue;             // blockquote
        if (b.length < 40 && !/[.!?]/.test(b)) continue; // probably a label
        return b.replace(/\n+/g, ' ');
    }
    return blocks[0] ? blocks[0].replace(/\n+/g, ' ') : '';
}

function renderFirstResult(result) {
    const debug = debugBlock('Raw MCP result', result);

    if (result && result.isError) {
        return `<p><strong>Tool returned an error.</strong></p>${debug}`;
    }

    const items = extractItems(result);
    if (!items.length) {
        return `<p><em>No results returned.</em></p>${debug}`;
    }

    const item = items[0];
    const title = item.title || item.name || item.heading || '';
    const url = item.contentUrl || item.url || item.uri || item.link || '';
    const rawContent = item.content || item.snippet || item.text || item.description
        || item.body || item.summary || '';
    const para = firstParagraph(rawContent);

    if (!title && !url && !rawContent) {
        return `<p><em>The first result had no recognisable fields.</em></p>` +
               debugBlock('First item (unknown shape)', item) + debug;
    }

    let html = '<div class="result-item">';
    html += '<div class="result-title">';
    const shownTitle = title || url || 'Result';
    html += url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shownTitle)}</a>`
        : escapeHtml(shownTitle);
    html += '</div>';
    if (para) {
        html += `<div class="result-snippet">${renderMarkdown(para)}</div>`;
    } else if (rawContent) {
        html += `<div class="result-snippet"><em>(could not extract a clean paragraph)</em></div>`;
    }
    if (url) {
        html += `<p class="read-more"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Read the full article →</a></p>`;
    }
    html += '</div>';
    html += debug;
    return html;
}

async function handleSend() {
    const q = userInput.value.trim();
    if (!q) return;
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    addMessage('user', `<p>${escapeHtml(q)}</p>`, 'You');

    const thinking = addMessage('assistant', '<p class="typing">Searching Microsoft Learn</p>', 'Learn MCP');

    try {
        await ensureInitialized();
        const tool = pickSearchTool();
        if (!tool) throw new Error('No tools available on the MCP server.');

        const args = buildArguments(tool, q);
        thinking.innerHTML =
            `<div class="tool-trace">→ tools/call ${tool.name}(${JSON.stringify(args)})</div>` +
            '<p class="typing">Waiting for response</p>';

        setStatus('Calling tool…', 'working');
        const result = await mcpRequest('tools/call', { name: tool.name, arguments: args });
        setStatus(`Connected · ${tools.length} tool${tools.length === 1 ? '' : 's'}`, 'connected');

        const rendered = renderFirstResult(result);
        thinking.innerHTML =
            `<div class="tool-trace">✓ ${tool.name}(${JSON.stringify(args)})</div>` +
            rendered;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (err) {
        console.error(err);
        setStatus('Error', 'error');
        const hint = (err && /Failed to fetch|NetworkError|TypeError/i.test(err.message || ''))
            ? '<p>This usually means the browser blocked the request (CORS) or the network call failed before a response was received. Open DevTools → Network to see the blocked request.</p>'
            : '';
        thinking.innerHTML =
            `<p><strong>Error:</strong> ${escapeHtml(err.message || String(err))}</p>` +
            hint +
            debugBlock('Error details', errorDetails(err));
    } finally {
        sendBtn.disabled = false;
        userInput.focus();
    }
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        userInput.value = btn.dataset.q;
        handleSend();
    });
});

// Kick off the MCP handshake eagerly so the status indicator reflects readiness.
ensureInitialized().catch(err => {
    console.error(err);
    setStatus('Connection failed', 'error');
    const hint = (err && /Failed to fetch|NetworkError|TypeError/i.test(err.message || ''))
        ? '<p>The browser likely blocked the request via CORS, or the network call failed. Open DevTools → Network to inspect the failed request to <code>' + escapeHtml(MCP_ENDPOINT) + '</code>.</p>'
        : '';
    addMessage('assistant',
        `<p><strong>Could not connect to the MCP server.</strong></p>` +
        `<p>${escapeHtml(err.message || String(err))}</p>` +
        hint +
        debugBlock('Error details', errorDetails(err)),
        'Learn MCP');
});

// Surface uncaught errors in the chat too — useful on GitHub Pages where DevTools may not be open.
window.addEventListener('error', (e) => {
    addMessage('assistant',
        `<p><strong>Uncaught error:</strong> ${escapeHtml(e.message || 'unknown')}</p>` +
        debugBlock('Source', `${e.filename}:${e.lineno}:${e.colno}`),
        'Learn MCP');
});
window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    addMessage('assistant',
        `<p><strong>Unhandled rejection:</strong> ${escapeHtml((reason && reason.message) || String(reason))}</p>` +
        debugBlock('Error details', errorDetails(reason || {})),
        'Learn MCP');
});

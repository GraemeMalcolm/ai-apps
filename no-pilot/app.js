// No-Pilot Application
// A simplified Microsoft 365 Copilot emulation for educational purposes

// Import models
import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/+esm";
import { Wllama } from 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/index.js';

// Global state
const state = {
    currentPage: 'newChat',
    currentModel: null,
    modelEngine: null,
    engine: null, // WebLLM engine
    wllama: null, // Wllama engine
    organizationalData: {
        emails: [],
        contacts: [],
        documents: [],
        calendar: []
    },
    customAgents: [],
    speechRecognition: null,
    speechSynthesis: window.speechSynthesis,
    isListening: false,
    chatHistory: [],
    attachedDocuments: [],
    prohibitedWords: [], // Content moderation
    // Researcher state
    researcherPrompt: null,
    researcherAwaitingSelection: false,
    // Streaming control
    isGenerating: false,
    stopRequested: false,
    streamingComplete: false, // Flag to indicate streaming loop has finished
    currentStream: null,
    currentAbortController: null,
    // Typewriter animation
    typingState: null
};

// Initialize the application
async function init() {
    console.log('Initializing No-Pilot...');
    console.log('App Version: 2025-05-05-v82 - Fixed CPU warning display in Researcher using innerHTML and <br>');

    // Load organizational data
    await loadOrganizationalData();

    // Load prohibited words for content moderation
    await loadProhibitedWords();

    // Initialize models
    await initializeModels();

    // Set up event listeners
    setupEventListeners();

    // Show the app
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Load initial page
    navigateToPage('newChat');

    // Update model menu
    updateModelMenu();

    // Set focus to input box
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.focus();
    }
}

// Load organizational data from JSON files
async function loadOrganizationalData() {
    try {
        updateLoadingStatus('Loading organizational data...');

        const [emails, contacts, documents, calendar] = await Promise.all([
            fetch('data/emails.json', { cache: 'no-store' }).then(r => r.json()),
            fetch('data/contacts.json', { cache: 'no-store' }).then(r => r.json()),
            fetch('data/documents.json', { cache: 'no-store' }).then(r => r.json()),
            fetch('data/calendar.json', { cache: 'no-store' }).then(r => r.json())
        ]);

        // Process dates (relative to today)
        const today = new Date();

        emails.forEach(email => {
            const emailDate = new Date(today);
            emailDate.setDate(emailDate.getDate() + email.date);
            email.dateObj = emailDate;
            email.dateString = formatDate(emailDate);
        });

        calendar.forEach(event => {
            const eventDate = new Date(today);
            eventDate.setDate(eventDate.getDate() + event.date);
            event.dateObj = eventDate;
            event.dateString = formatDate(eventDate);
        });

        state.organizationalData = { emails, contacts, documents, calendar };
        console.log('Organizational data loaded', state.organizationalData);
    } catch (error) {
        console.error('Error loading organizational data:', error);
    }
}

// Content moderation functions
function reverseWord(text) {
    return text.split('').reverse().join('');
}

function shiftWord(text, amount) {
    return text
        .split('')
        .map(char => String.fromCharCode(char.charCodeAt(0) + amount))
        .join('');
}

async function loadProhibitedWords() {
    try {
        updateLoadingStatus('Loading content filters...');
        const response = await fetch('moderation/mod.txt', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to load prohibited words');

        const encodedWordsText = await response.text();
        state.prohibitedWords = encodedWordsText
            .split(/\r?\n/)
            .map(word => word.trim())
            .filter(word => word.length > 0)
            .map(word => shiftWord(reverseWord(word.toLowerCase()), 1));

        console.log('Loaded prohibited words:', state.prohibitedWords.length);
    } catch (error) {
        console.error('Error loading prohibited words:', error);
        // Don't throw - allow app to continue without moderation
    }
}

function containsProhibitedWords(text) {
    // Convert to lowercase for case-insensitive matching
    const lowerText = text.toLowerCase();

    // Create word boundaries regex pattern for whole word matching
    for (const word of state.prohibitedWords) {
        // Use word boundary to match whole words only
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(lowerText)) {
            console.log(`Content moderation: blocked word "${word}" detected`);
            return true;
        }
    }

    return false;
}

// Initialize AI models
async function initializeModels() {
    updateLoadingStatus('Initializing AI models...');

    // Try Phi 3 with WebLLM (GPU mode)
    try {
        updateLoadingStatus('Loading Phi 3 Mini model (GPU)...');
        await initializeWebLLM();
        state.currentModel = 'phi3';
        state.modelEngine = 'webllm';
        console.log('Phi 3 model initialized successfully');
        return;
    } catch (error) {
        console.warn('Phi 3 (WebLLM) failed:', error);
    }

    // Try Phi 2 with Wllama (CPU mode)
    try {
        updateLoadingStatus('Loading Phi 2 model (CPU fallback)...');
        await initializeWllama();
        state.currentModel = 'phi2';
        state.modelEngine = 'cpu';
        console.log('Phi 2 model initialized successfully');
        return;
    } catch (error) {
        console.warn('Phi 2 (Wllama) failed:', error);
    }

    // Fall back to Wikipedia mode
    console.log('Both models failed, using Wikipedia fallback mode');
    state.currentModel = 'wikipedia';
    state.modelEngine = 'wikipedia';
}

// Initialize WebLLM (Phi-3)
async function initializeWebLLM() {
    console.log('Initializing WebLLM...');

    if (!webllm || !webllm.CreateMLCEngine || !webllm.prebuiltAppConfig) {
        throw new Error('WebLLM not properly loaded');
    }

    const targetModelId = 'Phi-3-mini-4k-instruct-q4f16_1-MLC';
    const models = webllm.prebuiltAppConfig.model_list;
    const targetModel = models.find(m => m.model_id === targetModelId);

    if (!targetModel) {
        throw new Error('Phi-3 model not found in WebLLM');
    }

    updateLoadingStatus('Downloading Phi 3 model (first time may take a few minutes)...');

    state.engine = await webllm.CreateMLCEngine(
        targetModelId,
        {
            initProgressCallback: (progress) => {
                const percentage = Math.round(progress.progress * 100);
                updateLoadingStatus(`Loading Phi 3 Mini: ${percentage}%`);
            }
        }
    );

    console.log('WebLLM engine created successfully');
}

// Initialize Wllama (Phi-2)
async function initializeWllama() {
    console.log('Initializing Wllama...');

    const CONFIG_PATHS = {
        'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/single-thread/wllama.wasm',
        'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/multi-thread/wllama.wasm',
    };

    // Try multithreaded first if cross-origin isolated, fall back to single-threaded
    const useMultiThread = window.crossOriginIsolated === true;
    const availableThreads = navigator.hardwareConcurrency || 4; // Fallback to 4 if not available
    const preferredThreads = useMultiThread ? Math.max(1, availableThreads - 2) : 1;
    console.log(`Cross-origin isolated: ${window.crossOriginIsolated}, available threads: ${availableThreads}, attempting ${preferredThreads} thread(s)`);

    updateLoadingStatus('Downloading Phi 2 model (first time may take a few minutes)...');

    const modelConfig = {
        n_ctx: 384,
        n_threads: preferredThreads,
        progressCallback: ({ loaded, total }) => {
            const percentage = Math.round((loaded / total) * 100);
            updateLoadingStatus(`Loading Phi 2: ${percentage}%`);
        }
    };

    try {
        state.wllama = new Wllama(CONFIG_PATHS);

        await state.wllama.loadModelFromHF(
            'Felladrin/gguf-sharded-phi-2-orange-v2',
            'phi-2-orange-v2.Q5_K_M.shard-00001-of-00025.gguf',
            modelConfig
        );

        console.log(`Wllama initialized successfully with ${preferredThreads} thread(s)`);

        // Warm the cache with system instruction
        await warmWllamaCache();
    } catch (multiErr) {
        if (preferredThreads > 1) {
            console.warn(`Multi-threaded init failed (${multiErr.message}), falling back to single thread`);
            // Retry with single thread
            modelConfig.n_threads = 1;
            state.wllama = new Wllama(CONFIG_PATHS);
            await state.wllama.loadModelFromHF(
                'Felladrin/gguf-sharded-phi-2-orange-v2',
                'phi-2-orange-v2.Q5_K_M.shard-00001-of-00025.gguf',
                modelConfig
            );
            console.log('Wllama initialized successfully with 1 thread (fallback)');

            // Warm the cache with system instruction
            await warmWllamaCache();
        } else {
            throw multiErr;
        }
    }
}

// Warm Wllama cache for faster first response
async function warmWllamaCache() {
    if (!state.wllama) return;

    try {
        const systemInstruction = '<|im_start|>system\n' +
            'You are a helpful AI assistant for a Microsoft 365 Copilot simulation.\n' +
            '<|im_end|>';

        console.log('Warming cache with system instruction...');
        updateLoadingStatus('Optimizing model...');

        await state.wllama.createCompletion(systemInstruction, {
            nPredict: 1,
            sampling: {
                temp: 0.0
            }
        });

        console.log('Cache warmed successfully');
    } catch (error) {
        console.log('Cache warming failed (non-critical):', error.message);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const page = e.currentTarget.getAttribute('data-page');
            navigateToPage(page);
        });
    });

    // Toggle navigation
    document.getElementById('toggleNav').addEventListener('click', () => {
        document.getElementById('navPane').classList.toggle('collapsed');
    });

    // Menu button
    document.getElementById('menuBtn').addEventListener('click', () => {
        const menu = document.getElementById('contextMenu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    // Restart button
    document.getElementById('restartBtn').addEventListener('click', () => {
        // Check if we're on the Researcher page
        if (state.currentPage === 'researcher') {
            // Reset Researcher page
            navigateToPage('researcher');
        } else {
            // Clear chat history
            state.chatHistory = [];
            clearChatInterface();
            // Show welcome screen
            navigateToPage('newChat');
        }
    });

    // Model selection
    document.querySelectorAll('.menu-item[data-model]').forEach(item => {
        item.addEventListener('click', async (e) => {
            const model = e.currentTarget.getAttribute('data-model');
            await switchModel(model);
            document.getElementById('contextMenu').style.display = 'none';
        });
    });

    // Input submission
    document.getElementById('submitBtn').addEventListener('click', handleSubmit);
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    // Voice input
    document.getElementById('voiceBtn').addEventListener('click', toggleVoiceInput);

    // Stop button
    document.getElementById('stopBtn').addEventListener('click', stopGeneration);

    // Attach button
    document.getElementById('attachBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAttachmentMenu();
    });

    // Modal close
    document.querySelector('.modal-close').addEventListener('click', () => {
        document.getElementById('modal').classList.remove('active');
    });

    // Suggestion buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.suggestion-btn[data-menu]');
        if (btn) {
            handleSuggestionMenu(btn, e);
        }
    });

    // Click outside menu to close
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('contextMenu');
        const menuBtn = document.getElementById('menuBtn');
        const dropdown = document.getElementById('suggestionDropdown');
        const attachMenu = document.getElementById('attachmentMenu');
        const attachBtn = document.getElementById('attachBtn');

        if (!menu.contains(e.target) && !menuBtn.contains(e.target)) {
            menu.style.display = 'none';
        }

        if (dropdown && !dropdown.contains(e.target) && !e.target.closest('.suggestion-btn[data-menu]')) {
            dropdown.style.display = 'none';
        }

        if (attachMenu && !attachMenu.contains(e.target) && !attachBtn.contains(e.target)) {
            attachMenu.style.display = 'none';
        }
    });
}

// Handle suggestion menu dropdowns
function handleSuggestionMenu(button, event) {
    const menuType = button.getAttribute('data-menu');
    const dropdown = document.getElementById('suggestionDropdown');

    if (!dropdown) return;

    let menuItems = [];

    if (menuType === 'emails') {
        menuItems = [
            "What's in my inbox?",
            "Find emails about ...",
            "What emails have I received from ..."
        ];
    } else if (menuType === 'files') {
        menuItems = [
            "Find documents about ...",
            "Show my recent files"
        ];
    } else if (menuType === 'people') {
        menuItems = [
            "Who is ...?",
            "Find emails from ..."
        ];
    } else if (menuType === 'suggested') {
        menuItems = [
            "What's on my calendar?",
            "Summarize my recent emails"
        ];
    }

    if (menuItems.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    // Build dropdown HTML
    dropdown.innerHTML = menuItems.map(item =>
        `<button class="dropdown-item" data-prompt="${item}">${item}</button>`
    ).join('');

    // Position dropdown below button
    const rect = button.getBoundingClientRect();
    dropdown.style.position = 'absolute';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom}px`;
    dropdown.style.display = 'block';

    // Add click handlers for dropdown items
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const prompt = e.target.getAttribute('data-prompt');
            const userInput = document.getElementById('userInput');
            userInput.value = prompt;
            userInput.focus();
            dropdown.style.display = 'none';
        });
    });
}

// Toggle attachment menu
function toggleAttachmentMenu() {
    const menu = document.getElementById('attachmentMenu');
    const attachBtn = document.getElementById('attachBtn');
    if (!menu || !attachBtn) return;

    if (menu.style.display === 'block') {
        menu.style.display = 'none';
        return;
    }

    // Build menu with "+ Add work content" option
    menu.innerHTML = `
        <button class="attachment-menu-item" data-action="add-work">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1z"></path>
            </svg>
            Add work content
        </button>
    `;

    // Position menu above the attach button
    const rect = attachBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = `${rect.left}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    menu.style.display = 'block';

    // Add click handler
    menu.querySelector('[data-action="add-work"]').addEventListener('click', (e) => {
        e.stopPropagation();
        showDocumentPicker();
    });
}

// Show document picker submenu
function showDocumentPicker() {
    const menu = document.getElementById('attachmentMenu');
    if (!menu) return;

    const documents = state.organizationalData.documents;

    // Build submenu with document list
    let html = '<div style="padding: 8px 16px; font-weight: 600; font-size: 12px; color: #666;">Select a document:</div>';
    documents.forEach(doc => {
        const iconPath = doc.type === 'csv'
            ? 'M3 3h10v2H3V3zm0 4h10v2H3V7zm0 4h10v2H3v-2z' // Table icon
            : 'M4 2h8l4 4v10H4V2zm8 4V3H5v12h10V6h-3z'; // Document icon

        html += `
            <button class="attachment-menu-item" data-doc-id="${doc.id}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="${iconPath}"></path>
                </svg>
                ${doc.name}
            </button>
        `;
    });

    menu.innerHTML = html;

    // Add click handlers
    menu.querySelectorAll('[data-doc-id]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = e.currentTarget.getAttribute('data-doc-id');
            attachDocument(docId);
            menu.style.display = 'none';
        });
    });
}

// Attach a document
function attachDocument(docId) {
    const doc = state.organizationalData.documents.find(d => d.id === docId);
    if (!doc) return;

    // Check if already attached
    if (state.attachedDocuments.some(d => d.id === docId)) {
        return;
    }

    state.attachedDocuments.push(doc);
    updateAttachmentsDisplay();
}

// Update attachments display
function updateAttachmentsDisplay() {
    const container = document.getElementById('attachmentsContainer');
    if (!container) return;

    if (state.attachedDocuments.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';

    container.innerHTML = state.attachedDocuments.map(doc => {
        const iconPath = doc.type === 'csv'
            ? 'M3 3h10v2H3V3zm0 4h10v2H3V7zm0 4h10v2H3v-2z' // Table icon
            : 'M4 2h8l4 4v10H4V2zm8 4V3H5v12h10V6h-3z'; // Document icon

        return `
            <div class="attachment-chip">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="${iconPath}"></path>
                </svg>
                ${doc.name}
                <span class="attachment-remove" data-doc-id="${doc.id}">×</span>
            </div>
        `;
    }).join('');

    // Add remove handlers
    container.querySelectorAll('.attachment-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const docId = e.target.getAttribute('data-doc-id');
            removeAttachment(docId);
        });
    });
}

// Remove an attachment
function removeAttachment(docId) {
    state.attachedDocuments = state.attachedDocuments.filter(d => d.id !== docId);
    updateAttachmentsDisplay();
}

// Navigate to a page
function navigateToPage(pageName) {
    state.currentPage = pageName;

    // Update navigation active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === pageName) {
            item.classList.add('active');
        }
    });

    // Load page content
    const pageContent = document.getElementById('pageContent');
    const inputArea = document.getElementById('inputArea');

    switch (pageName) {
        case 'newChat':
            document.getElementById('pageTitle').textContent = 'New chat';
            pageContent.innerHTML = renderNewChatPage();
            inputArea.style.display = 'block';
            // Animate welcome message
            setTimeout(() => animateWelcomeMessage(), 100);
            break;
        case 'search':
            document.getElementById('pageTitle').textContent = 'Search';
            pageContent.innerHTML = renderSearchPage();
            inputArea.style.display = 'none';
            setupSearchListeners();
            break;
        case 'researcher':
            document.getElementById('pageTitle').textContent = 'Researcher';
            // Reset researcher state
            state.researcherPrompt = null;
            state.researcherAwaitingSelection = false;
            pageContent.innerHTML = renderResearcherPage();
            inputArea.style.display = 'none';
            setupResearcherListeners();
            break;
        case 'analyst':
            document.getElementById('pageTitle').textContent = 'Analyst';
            pageContent.innerHTML = renderAnalystPage();
            inputArea.style.display = 'block';
            setupAnalystListeners();
            break;
        case 'newAgent':
            document.getElementById('pageTitle').textContent = 'Agent Builder';
            pageContent.innerHTML = renderNewAgentPage();
            inputArea.style.display = 'none';
            setupAgentBuilderListeners();
            break;
    }
}

// Render pages
function renderNewChatPage() {
    return `
        <div class="chat-container">
            <div class="welcome-screen">
                <h1 id="welcomeMessage"></h1>
            </div>
            <div class="chat-messages" id="chatMessages"></div>
        </div>
    `;
}

function renderSearchPage() {
    return `
        <div class="search-page">
            <h1>Find content across your organization</h1>
            <div class="search-box">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l4.15 4.15a.75.75 0 0 1-1.06 1.06l-4.15-4.15A5.5 5.5 0 1 1 8.5 3zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path>
                </svg>
                <input type="text" id="searchInput" placeholder="Search for a file, person, or content from your organization" />
            </div>
            <div class="search-shortcuts">
                <button class="shortcut-btn" data-person="Anton">
                    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23ff8c42'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-size='14' font-family='Arial' font-weight='bold'%3EA%3C/text%3E%3C/svg%3E" width="32" height="32" />
                    <span>Anton</span>
                </button>
                <button class="shortcut-btn" data-person="Matt">
                    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%234a9eff'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-size='14' font-family='Arial' font-weight='bold'%3EM%3C/text%3E%3C/svg%3E" width="32" height="32" />
                    <span>Matt</span>
                </button>
                <button class="shortcut-btn" data-search="files">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7zm4 18H7V4h5v5h5v11z"/>
                    </svg>
                    <span>Files</span>
                </button>
                <button class="shortcut-btn" data-search="email">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4.7l-8 5.334L4 8.7V6.3l8 5.334 8-5.334v2.4z"/>
                    </svg>
                    <span>Email</span>
                </button>
            </div>
            <div class="search-results" id="searchResults"></div>
        </div>
    `;
}

function renderResearcherPage() {
    return `
        <div class="researcher-container">
            <div class="researcher-welcome" id="researcherWelcome">
                <div class="agent-icon" style="background: linear-gradient(135deg, #4A9EFF, #7B61FF);">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="white">
                        <circle cx="20" cy="20" r="18"/>
                    </svg>
                </div>
                <h1>Researcher</h1>
                <p class="agent-description">Simulated agent, powered by Microsoft Phi</p>
                
                <div class="researcher-input-container">
                    <div class="input-container">
                        <input type="text" id="researcherInput" placeholder="What do you want to research today?" />
                        <button id="researcherVoiceBtn" class="voice-btn">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-5 8a1 1 0 1 1 2 0 3 3 0 0 0 6 0 1 1 0 1 1 2 0 5 5 0 0 1-4 4.9V17h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h2v-2.1A5 5 0 0 1 5 10z"></path>
                            </svg>
                        </button>
                        <button id="researcherStopTop" class="stop-btn" style="display: none;">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <rect x="6" y="6" width="8" height="8"></rect>
                            </svg>
                        </button>
                        <button id="researcherSubmitTop" class="submit-btn">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 3l7 7-1.5 1.5L11 7v10H9V7L4.5 11.5 3 10l7-7z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <h2 class="research-ideas-title">Research ideas</h2>
                <div class="research-ideas">
                    <div class="research-idea-card">
                        <div class="research-idea-icon">📊</div>
                        <div class="research-idea-title">Project update</div>
                        <div class="research-idea-desc">Executive status report on a project.</div>
                    </div>
                    <div class="research-idea-card">
                        <div class="research-idea-icon">📰</div>
                        <div class="research-idea-title">Topic report</div>
                        <div class="research-idea-desc">Information about a topic.</div>
                    </div>
                    <div class="research-idea-card">
                        <div class="research-idea-icon">👥</div>
                        <div class="research-idea-title">Customer brief</div>
                        <div class="research-idea-desc">Intelligence to help prepare for a customer engagement.</div>
                    </div>
                </div>
            </div>
            <div class="researcher-chat" id="researcherChat" style="display: none;">
                <div class="chat-messages" id="researcherMessages"></div>
                <div class="researcher-input-bottom">
                    <div class="input-container">
                        <input type="text" id="researcherInputBottom" placeholder="Message Researcher" />
                        <button class="voice-btn" id="researcherVoiceBottom">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-5 8a1 1 0 1 1 2 0 3 3 0 0 0 6 0 1 1 0 1 1 2 0 5 5 0 0 1-4 4.9V17h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h2v-2.1A5 5 0 0 1 5 10z"></path>
                            </svg>
                        </button>
                        <button id="researcherStopBottom" class="stop-btn" style="display: none;">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <rect x="6" y="6" width="8" height="8"></rect>
                            </svg>
                        </button>
                        <button id="researcherSubmitBottom" class="submit-btn">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 3l7 7-1.5 1.5L11 7v10H9V7L4.5 11.5 3 10l7-7z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAnalystPage() {
    return `
        <div class="chat-container">
            <div class="agent-page">
                <div class="agent-icon" style="background: linear-gradient(135deg, #C87EFF, #FF61D2);">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="white">
                        <path d="M5 5h8v20H5V5zm10 12h8v8h-8v-8zm10-6h8v14h-8V11z"/>
                    </svg>
                </div>
                <h1>Analyst</h1>
                <p class="agent-description">Simulated agent, powered by Microsoft Phi</p>
                
                <div class="prompt-cards">
                    <div class="prompt-card" data-action="analyzeData">
                        <div class="prompt-card-icon">📈</div>
                        <div class="prompt-card-title">Analyze data</div>
                        <div class="prompt-card-message">What are the trends you see in the uploaded files? Which...</div>
                    </div>
                    <div class="prompt-card" data-action="getInsights">
                        <div class="prompt-card-icon">☑️</div>
                        <div class="prompt-card-title">Get insights</div>
                        <div class="prompt-card-message">What are some quick insights about the data from the...</div>
                    </div>
                    <div class="prompt-card" data-action="visualize">
                        <div class="prompt-card-icon">📊</div>
                        <div class="prompt-card-title">Visualize</div>
                        <div class="prompt-card-message">Create a table with the volume of planets, add a column to...</div>
                    </div>
                </div>
            </div>
            <div class="chat-messages" id="chatMessages"></div>
        </div>
    `;
}

function renderNewAgentPage() {
    return `
        <div class="agent-builder">
            <div class="agent-builder-header">
                <h1>Build an agent <span style="color: #4A9EFF;">to save you time</span></h1>
                <p class="agent-builder-subtitle">Simulated agent, powered by Microsoft Phi</p>
            </div>
            
            <div class="agent-builder-content">
                <div class="agent-builder-form">
                    <div class="form-section">
                        <label>Instructions</label>
                        <textarea id="agentInstructions" placeholder="Describe what this agent should do, define its tone, and outline any rules or guidelines it must follow"></textarea>
                    </div>
                    
                    <div class="form-section">
                        <label>Knowledge</label>
                        <p style="font-size: 12px; color: #666; margin-bottom: 12px;">Choose the sources your agent will use to generate responses</p>
                        <div class="knowledge-sources">
                            <button class="knowledge-btn">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z"/>
                                </svg>
                                Files
                            </button>
                            <button class="knowledge-btn">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                                </svg>
                                Email
                            </button>
                            <button class="knowledge-btn">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                    <circle cx="10" cy="10" r="8"/>
                                </svg>
                                Web
                            </button>
                        </div>
                        <div class="knowledge-input">
                            <input type="text" id="agentWebsite" placeholder="Enter a URL or name or drop files here" />
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <label>Suggested prompts</label>
                        <table class="prompts-table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><input type="text" class="prompt-title" placeholder="Enter a title" /></td>
                                    <td><input type="text" class="prompt-message" placeholder="Enter a message" /></td>
                                </tr>
                                <tr>
                                    <td><input type="text" class="prompt-title" placeholder="Enter a title" /></td>
                                    <td><input type="text" class="prompt-message" placeholder="Enter a message" /></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="agent-preview">
                    <div class="preview-agent-info">
                        <div class="preview-agent-icon">
                            <svg width="40" height="40" viewBox="0 0 40 40" fill="white">
                                <path d="M20 10v10h10v10H20V20H10V10h10z"/>
                            </svg>
                        </div>
                        <div class="preview-agent-name">New Agent</div>
                        <div class="preview-agent-description">Searches public websites to find current information and summarize results for users.</div>
                    </div>
                    
                    <div class="preview-prompts">
                        <div class="prompt-card">
                            <div class="prompt-card-title">Find Recent News</div>
                            <div class="prompt-card-message">Search the web for the latest headlines on a topic.</div>
                        </div>
                        <div class="prompt-card">
                            <div class="prompt-card-title">Get contact details</div>
                            <div class="prompt-card-message">Get contact details</div>
                        </div>
                    </div>
                    
                    <div class="builder-actions">
                        <button class="btn btn-secondary" id="tryAgentBtn">Try it</button>
                        <button class="btn btn-primary" id="createAgentBtn">Create</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Handle user input submission
async function handleSubmit() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();

    if (!message) return;

    // Clear input
    input.value = '';

    // Content moderation: check for prohibited words
    if (containsProhibitedWords(message)) {
        // Add user message to chat
        addMessageToChat('user', message);

        // Add moderation response
        addMessageToChat('assistant', "I'm sorry. Content safety rules prevent me from helping you with that.");

        // Focus back on input
        input.focus();
        return;
    }

    // Add user message to chat
    addMessageToChat('user', message);

    // Check if there are attached documents
    if (state.attachedDocuments.length > 0) {
        await handleAttachedDocumentQuery(message);
        return;
    }

    // Determine intent and process
    const intent = detectIntent(message);

    if (intent.type === 'email') {
        await handleEmailQuery(message, intent);
    } else if (intent.type === 'contact') {
        await handleContactQuery(message, intent);
    } else if (intent.type === 'calendar') {
        await handleCalendarQuery(message, intent);
    } else if (intent.type === 'document') {
        await handleDocumentQuery(message, intent);
    } else {
        // General query - send to model
        await handleGeneralQuery(message);
    }
}

// Handle queries with attached documents
async function handleAttachedDocumentQuery(message) {
    // Show thinking indicator
    const thinkingIndicator = addThinkingIndicator();

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove thinking indicator
    if (thinkingIndicator) {
        thinkingIndicator.remove();
    }

    // Get summaries of all attached documents
    const summaries = state.attachedDocuments.map(doc => {
        return `**${doc.name}:**\n\n${doc.summary}`;
    }).join('\n\n---\n\n');

    // Create response
    const response = `Based on the attached document(s), here's what I found:\n\n${summaries}`;

    // Display the response
    const messageDiv = createMessageElement('assistant', '');
    const contentEl = messageDiv.querySelector('.message-content');
    contentEl.innerHTML = formatMessageContent(response);
    scrollToBottom();

    // Clear attachments after response
    state.attachedDocuments = [];
    updateAttachmentsDisplay();
}

// Detect user intent
function detectIntent(message) {
    const lower = message.toLowerCase();

    // Contact intent - "Who is X?"
    const whoIsMatch = lower.match(/who\s+is\s+([\w\s]+)[?]?/);
    if (whoIsMatch) {
        const person = whoIsMatch[1].trim();
        console.log('Contact intent detected. Query:', message, 'Person:', person);
        return { type: 'contact', person };
    }

    // Email intent
    if (lower.includes('email') || lower.includes('emails') || lower.includes('inbox') || lower.includes('message') || lower.includes('messages') || lower.includes('sent') || lower.includes('send')) {
        // Try multiple patterns to extract person name
        let person = null;
        const fromMatch = lower.match(/from\s+(\w+)/);
        const sentByMatch = lower.match(/(\w+)\s+send/);
        const didSendMatch = lower.match(/did\s+(\w+)\s+send/);

        person = fromMatch ? fromMatch[1] :
            didSendMatch ? didSendMatch[1] :
                sentByMatch ? sentByMatch[1] : null;

        // Extract topic after "about"
        let topic = null;
        const aboutMatch = lower.match(/about\s+([\w\s]+)/);
        if (aboutMatch) {
            topic = aboutMatch[1].trim();
        }

        console.log('Email intent detected. Query:', message, 'Person:', person, 'Topic:', topic);
        return { type: 'email', person, topic };
    }

    // Calendar intent
    if (lower.includes('meeting') || lower.includes('meetings') || lower.includes('calendar') || lower.includes('schedule') || lower.includes('schedules')) {
        return { type: 'calendar' };
    }

    // Document intent
    if (lower.includes('document') || lower.includes('documents') || lower.includes('file') || lower.includes('files') || lower.includes('contract') || lower.includes('contracts') || lower.includes('spreadsheet') || lower.includes('spreadsheets')) {
        return { type: 'document' };
    }

    return { type: 'general' };
}

// Handle contact queries
async function handleContactQuery(message, intent) {
    let contacts = state.organizationalData.contacts;

    // Show thinking indicator
    const thinkingIndicator = addThinkingIndicator();

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove thinking indicator
    if (thinkingIndicator) {
        thinkingIndicator.remove();
    }

    // Filter by person name
    if (intent.person) {
        contacts = contacts.filter(c =>
            c.name.toLowerCase().includes(intent.person.toLowerCase())
        );
        console.log(`Filtered contacts for person "${intent.person}": ${contacts.length} results`);
    }

    // If no contacts found, send to AI model instead
    if (contacts.length === 0) {
        console.log('No contacts found, sending to AI model');
        await handleGeneralQuery(message);
        return;
    }

    // Generate summary as HTML table
    let summary = `<table class="data-table">`;
    summary += `<tr><td><strong>I found ${contacts.length} contact(s):</strong></td></tr>`;
    summary += `<tr class="spacer-row"><td>&nbsp;</td></tr>`;
    contacts.forEach(contact => {
        summary += `<tr><td>👤 <strong>${contact.name}</strong></td></tr>`;
        summary += `<tr><td>Role: ${contact.role}</td></tr>`;
        summary += `<tr><td>Department: ${contact.department}</td></tr>`;
        summary += `<tr><td>Email: ${contact.email}</td></tr>`;
        summary += `<tr><td>Phone: ${contact.phone}</td></tr>`;
        summary += `<tr class="spacer-row"><td>&nbsp;</td></tr>`;
    });
    summary += `</table>`;

    console.log('Contact summary generated. Length:', summary.length);

    // Create message element and display HTML directly
    const messageDiv = createMessageElement('assistant', '');
    const contentEl = messageDiv.querySelector('.message-content');
    contentEl.innerHTML = summary;
    scrollToBottom();
}

// Handle email queries
async function handleEmailQuery(message, intent) {
    let emails = state.organizationalData.emails;

    // Show thinking indicator
    const thinkingIndicator = addThinkingIndicator();

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Remove thinking indicator
    if (thinkingIndicator) {
        thinkingIndicator.remove();
    }

    // Filter by person if specified
    if (intent.person) {
        emails = emails.filter(e =>
            e.fromName.toLowerCase().includes(intent.person.toLowerCase())
        );
        console.log(`Filtered emails for person "${intent.person}": ${emails.length} results`);
    }

    // Filter by topic if specified
    if (intent.topic) {
        emails = emails.filter(e => {
            const topicLower = intent.topic.toLowerCase();
            const subjectMatch = e.subject.toLowerCase().includes(topicLower);
            const contentMatch = e.content.toLowerCase().includes(topicLower);
            const keywordMatch = e.keywords && e.keywords.some(k => k.toLowerCase().includes(topicLower));
            return subjectMatch || contentMatch || keywordMatch;
        });
        console.log(`Filtered emails for topic "${intent.topic}": ${emails.length} results`);
    }

    // Generate summary as HTML table
    let summary = `<table class="data-table">`;
    summary += `<tr><td><strong>I found ${emails.length} email(s):</strong></td></tr>`;
    summary += `<tr class="spacer-row"><td>&nbsp;</td></tr>`;
    emails.forEach(email => {
        summary += `<tr><td>✉️ <strong>From ${email.fromName}</strong> (${email.dateString})</td></tr>`;
        summary += `<tr><td>Subject: ${email.subject}</td></tr>`;
        summary += `<tr><td><a href="#email-${email.id}" class="data-link">View Email</a></td></tr>`;
        summary += `<tr class="spacer-row"><td>&nbsp;</td></tr>`;
    });
    summary += `</table>`;

    console.log('Email summary generated. Length:', summary.length);

    // Create message element and display HTML directly (no typing animation for tables)
    const messageDiv = createMessageElement('assistant', '');
    const contentEl = messageDiv.querySelector('.message-content');
    contentEl.innerHTML = summary;
    scrollToBottom();

    // Add click listeners for email links
    setTimeout(() => {
        document.querySelectorAll('a[href^="#email-"]').forEach(link => {
            link.classList.add('data-link');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const emailId = e.target.getAttribute('href').replace('#email-', '');
                showEmailModal(emailId);
            });
        });
    }, 100);
}

// Handle calendar queries
async function handleCalendarQuery(message) {
    const events = state.organizationalData.calendar;

    // Show thinking indicator
    const thinkingIndicator = addThinkingIndicator();

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Remove thinking indicator
    if (thinkingIndicator) {
        thinkingIndicator.remove();
    }

    let summary = `<table class="data-table">`;
    summary += `<tr><td><strong>Here are your calendar events:</strong></td></tr>`;
    summary += `<tr class="spacer-row"><td>&nbsp;</td></tr>`;
    events.forEach(event => {
        summary += `<tr><td>📅 <strong>${event.title}</strong> (${event.dateString})</td></tr>`;
        summary += `<tr><td>Time: ${event.startTime} - ${event.endTime}</td></tr>`;
        summary += `<tr><td>Attendees: ${event.attendees.join(', ')}</td></tr>`;
        summary += `<tr><td><a href="#event-${event.id}" class="data-link">View Details</a></td></tr>`;
        summary += `<tr class="spacer-row"><td>&nbsp;</td></tr>`;
    });
    summary += `</table>`;

    // Create message element and display HTML directly (no typing animation for tables)
    const messageDiv = createMessageElement('assistant', '');
    const contentEl = messageDiv.querySelector('.message-content');
    contentEl.innerHTML = summary;
    scrollToBottom();

    // Add click listeners
    setTimeout(() => {
        document.querySelectorAll('a[href^="#event-"]').forEach(link => {
            link.classList.add('data-link');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const eventId = e.target.getAttribute('href').replace('#event-', '');
                showEventModal(eventId);
            });
        });
    }, 100);
}

// Handle document queries
async function handleDocumentQuery(message) {
    const lower = message.toLowerCase();
    let documents = state.organizationalData.documents;

    // Show thinking indicator
    const thinkingIndicator = addThinkingIndicator();

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Remove thinking indicator
    if (thinkingIndicator) {
        thinkingIndicator.remove();
    }

    // Check if user wants all recent files
    const showAllFiles = lower.includes('recent files') ||
        lower.includes('my files') ||
        lower.includes('show my recent') ||
        lower.includes('all files') ||
        lower.includes('my documents') ||
        lower.includes('all documents') ||
        lower.includes('show me documents') ||
        lower.includes('show me files') ||
        lower.includes('list documents') ||
        lower.includes('list files');

    // Filter by keywords only if not showing all files
    if (!showAllFiles) {
        const filteredDocuments = documents.filter(doc => {
            return doc.keywords.some(keyword => lower.includes(keyword.toLowerCase()));
        });

        // If we found matching documents, use them; otherwise show all documents
        if (filteredDocuments.length > 0) {
            documents = filteredDocuments;
        }
        // If no matches found and not explicitly asking for all, show all documents as default
    }

    let summary = `<table class="data-table">`;
    summary += `<tr><td><strong>I found ${documents.length} document(s):</strong></td></tr>`;
    summary += `<tr class="spacer-row"><td>&nbsp;</td></tr>`;
    documents.forEach(doc => {
        const icon = doc.type === 'csv' ? '<span style="color: #217346; font-weight: bold;">&#9618;</span>' : '📄';
        summary += `<tr><td>${icon} <strong>${doc.name}</strong></td></tr>`;
        summary += `<tr><td><a href="#doc-${doc.id}" class="data-link">View Document</a></td></tr>`;
        summary += `<tr class="spacer-row"><td>&nbsp;</td></tr>`;
    });
    summary += `</table>`;

    // Create message element and display HTML directly (no typing animation for tables)
    const messageDiv = createMessageElement('assistant', '');
    const contentEl = messageDiv.querySelector('.message-content');
    contentEl.innerHTML = summary;
    scrollToBottom();

    // Add click listeners
    setTimeout(() => {
        document.querySelectorAll('a[href^="#doc-"]').forEach(link => {
            link.classList.add('data-link');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const docId = e.target.getAttribute('href').replace('#doc-', '');
                showDocumentModal(docId);
            });
        });
    }, 100);
}

// Handle general queries with AI model
async function handleGeneralQuery(message) {
    // Show thinking indicator
    const thinkingIndicator = addThinkingIndicator();

    state.isGenerating = true;
    state.stopRequested = false;
    state.streamingComplete = false;
    updateUIForGeneration(true);

    try {
        if (state.currentModel === 'wikipedia') {
            await handleWikipediaQuery(message, thinkingIndicator);
            // Let it fall through to finally block
        } else if (state.currentModel === 'phi3' && state.engine) {
            // Use WebLLM (Phi-3) with streaming
            await generateWithWebLLM(message, thinkingIndicator);
        } else if (state.currentModel === 'phi2' && state.wllama) {
            // Use Wllama (Phi-2) with streaming
            await generateWithWllama(message, thinkingIndicator);
        } else {
            // No model available
            if (thinkingIndicator) {
                thinkingIndicator.remove();
            }

            addMessageToChat('assistant', 'No AI model is currently available. Please try switching to Wikipedia mode from the menu or refresh the page to retry loading a model.');
        }
    } catch (error) {
        console.error('Error handling query:', error);
        if (thinkingIndicator) {
            thinkingIndicator.remove();
        }
        addMessageToChat('assistant', 'I encountered an error processing your request. Please try again.');
    } finally {
        // Wait for typewriter animation to complete before resetting UI
        if (state.typingState && state.typingState.isTyping) {
            await waitForTypingComplete();
        }

        state.isGenerating = false;
        state.stopRequested = false;
        state.currentStream = null;
        state.currentAbortController = null;
        updateUIForGeneration(false);

        // Focus back to input after response
        const userInput = document.getElementById('userInput');
        if (userInput && !userInput.disabled) {
            userInput.focus();
        }
    }
}

// Stop ongoing generation
function stopGeneration() {
    console.log('Stopping generation...');
    state.stopRequested = true;
    state.isGenerating = false;
    state.streamingComplete = true; // Mark streaming as stopped

    // Stop typewriter animation
    if (state.typingState) {
        state.typingState.isTyping = false;
    }

    // Abort Wllama generation
    if (state.currentAbortController) {
        state.currentAbortController.abort();
        state.currentAbortController = null;
    }

    // Note: WebLLM streaming stops via stopRequested flag in the loop

    updateUIForGeneration(false);
}

// Update UI based on generation state
function updateUIForGeneration(isGenerating) {
    const submitBtn = document.getElementById('submitBtn');
    const stopBtn = document.getElementById('stopBtn');
    const userInput = document.getElementById('userInput');

    if (isGenerating) {
        submitBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        userInput.disabled = true;
    } else {
        submitBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        userInput.disabled = false;

        // Focus the input field for the next prompt
        if (userInput) {
            userInput.focus();
        }
    }
}

// Generate response with WebLLM (Phi-3) using streaming
async function generateWithWebLLM(message, thinkingIndicator) {
    try {
        // Build messages with recent history (last 6 items)
        const recentHistory = state.chatHistory.slice(-6);
        recentHistory.push({
            role: 'user',
            content: message
        });

        const messages = [
            { role: 'system', content: 'You are a helpful AI assistant.' },
            ...recentHistory
        ];

        const completion = await state.engine.chat.completions.create({
            messages: messages,
            temperature: 0.7,
            max_tokens: 500,
            stream: true
        });

        state.currentStream = completion;
        state.streamingComplete = false; // Streaming started

        let fullResponse = '';
        let hasStartedOutput = false;
        const bufferSize = 30; // Start typing after 30 characters
        let messageEl = null;
        let contentEl = null;

        for await (const chunk of completion) {
            if (state.stopRequested) {
                console.log('Generation stopped by user');
                break;
            }

            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
                fullResponse += delta;

                // Start output once we have enough content buffered
                if (!hasStartedOutput && fullResponse.length >= bufferSize) {
                    // Remove thinking indicator
                    if (thinkingIndicator) {
                        thinkingIndicator.remove();
                    }

                    // Create message container
                    messageEl = createMessageElement('assistant');
                    contentEl = messageEl.querySelector('.message-content');

                    // Start typing animation
                    startTypingAnimation(contentEl, fullResponse);
                    hasStartedOutput = true;
                } else if (hasStartedOutput && contentEl) {
                    // Update the content for ongoing typing animation
                    updateTypingContent(fullResponse);
                }
            }
        }

        // Mark streaming as complete
        state.streamingComplete = true;

        // Remove incomplete sentences from the end
        fullResponse = removeIncompleteSentences(fullResponse);

        // Update final content with trimmed response
        if (state.typingState && fullResponse) {
            updateTypingContent(fullResponse);
        }

        // Ensure typing completes
        if (state.typingState) {
            await waitForTypingComplete();
        }

        // Add to conversation history
        state.chatHistory.push({ role: 'user', content: message });
        state.chatHistory.push({ role: 'assistant', content: fullResponse });

        return fullResponse;
    } catch (error) {
        console.error('WebLLM generation error:', error);
        throw error;
    }
}

// Generate response with Wllama (Phi-2) using streaming
async function generateWithWllama(message, thinkingIndicator) {
    try {
        // Format prompt as ChatML with system message
        let chatMLPrompt = '<|im_start|>system\nYou are a helpful AI assistant.<|im_end|>\n\n';

        // Add truncated previous prompt and response if available
        if (state.chatHistory.length >= 2) {
            const prevUser = state.chatHistory[state.chatHistory.length - 2];
            const prevAssistant = state.chatHistory[state.chatHistory.length - 1];

            if (prevUser.role === 'user' && prevAssistant.role === 'assistant') {
                const prevUserSentence = extractFirstSentence(prevUser.content);
                const prevAssistantSentence = extractFirstSentence(prevAssistant.content);

                chatMLPrompt += '<|im_start|>user\n';
                chatMLPrompt += prevUserSentence + '\n';
                chatMLPrompt += '<|im_end|>\n\n';
                chatMLPrompt += '<|im_start|>assistant\n';
                chatMLPrompt += prevAssistantSentence + '\n';
                chatMLPrompt += '<|im_end|>\n\n';
            }
        }

        // Add current user message
        chatMLPrompt += '<|im_start|>user\n';
        chatMLPrompt += message;
        chatMLPrompt += '\n<|im_end|>\n\n';
        chatMLPrompt += '<|im_start|>assistant\n';

        console.log('Sending prompt to wllama (length:', chatMLPrompt.length, 'chars)');

        let fullResponse = '';
        let hasStartedOutput = false;
        const bufferSize = 30; // Start typing after 30 characters
        let messageEl = null;
        let contentEl = null;

        // Create AbortController for this generation
        const controller = new AbortController();
        state.currentAbortController = controller;
        state.streamingComplete = false; // Streaming started

        try {
            const completion = await state.wllama.createCompletion(chatMLPrompt, {
                nPredict: 300,
                sampling: {
                    temp: 0.2,
                    top_p: 0.9,
                    penalty_repeat: 1.1
                },
                stopTokens: ['<|im_end|>', '<|im_start|>'],
                abortSignal: controller.signal,
                stream: true
            });

            state.currentStream = completion;

            for await (const chunk of completion) {
                if (state.stopRequested) {
                    console.log('Generation stopped by user');
                    break;
                }

                if (chunk.currentText) {
                    fullResponse = chunk.currentText;

                    // Start output once we have enough content buffered
                    if (!hasStartedOutput && fullResponse.length >= bufferSize) {
                        // Remove thinking indicator
                        if (thinkingIndicator) {
                            thinkingIndicator.remove();
                        }

                        // Create message container
                        messageEl = createMessageElement('assistant');
                        contentEl = messageEl.querySelector('.message-content');

                        // Start typing animation
                        startTypingAnimation(contentEl, fullResponse);
                        hasStartedOutput = true;
                    } else if (hasStartedOutput && contentEl) {
                        // Update the content for ongoing typing animation
                        updateTypingContent(fullResponse);
                    }
                }
            }

            // Clean up the response
            const cutoffs = ['<|im_end|>', '<|im_start|>', '\nUser:', '\nHuman:'];
            for (const cutoff of cutoffs) {
                const index = fullResponse.indexOf(cutoff);
                if (index > 0) {
                    fullResponse = fullResponse.substring(0, index);
                    break;
                }
            }

            // Remove incomplete sentences from the end
            fullResponse = removeIncompleteSentences(fullResponse);

            // Update final content with trimmed response
            if (state.typingState && fullResponse) {
                updateTypingContent(fullResponse);
            }

            // Mark streaming as complete
            state.streamingComplete = true;

            // Ensure typing completes
            if (state.typingState) {
                await waitForTypingComplete();
            }

            // Clear abort controller on successful completion
            state.currentAbortController = null;

            // Clear KV cache after successful generation
            console.log('Clearing KV cache after generation');
            await state.wllama.kvClear();
            console.log('KV cache cleared successfully');

            // Add to conversation history
            state.chatHistory.push({ role: 'user', content: message });
            state.chatHistory.push({ role: 'assistant', content: fullResponse });

            return fullResponse;
        } catch (error) {
            // Check if this was an abort (expected when user clicks stop)
            if (error.name === 'AbortError' || error.message?.includes('abort')) {
                console.log('Generation aborted by user');
                // Clear the partial/corrupted state
                await state.wllama.kvClear();
                console.log('KV cache cleared after abort');
            } else {
                console.log('Wllama generation error:', error.message || 'unknown error');
                // Clear cache on error too
                try {
                    await state.wllama.kvClear();
                } catch (e) {
                    console.log('Failed to clear cache after error:', e.message);
                }
            }
            state.currentAbortController = null;
            throw error;
        }
    } catch (error) {
        console.error('Wllama generation error:', error);
        throw error;
    }
}

// Handle Wikipedia fallback
async function handleWikipediaQuery(message, thinkingIndicator) {
    const keywords = extractKeywords(message);
    const searchQuery = keywords.join(' ');

    if (!searchQuery) {
        if (thinkingIndicator) {
            thinkingIndicator.remove();
        }
        const messageDiv = createMessageElement('assistant');
        const contentEl = messageDiv.querySelector('.message-content');
        state.streamingComplete = true; // Wikipedia content delivered all at once
        startTypingAnimation(contentEl, "I couldn't find information on that topic. Please try rephrasing your question.");
        await waitForTypingComplete();
        return;
    }

    try {
        // First, search Wikipedia to find a matching article
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&origin=*&srlimit=1`;
        const searchResponse = await fetch(searchUrl);

        if (!searchResponse.ok) {
            throw new Error('Wikipedia search request failed');
        }

        const searchData = await searchResponse.json();
        const results = searchData?.query?.search;

        if (!results || results.length === 0) {
            if (thinkingIndicator) {
                thinkingIndicator.remove();
            }
            const messageDiv = createMessageElement('assistant');
            const contentEl = messageDiv.querySelector('.message-content');
            state.streamingComplete = true; // Wikipedia content delivered all at once
            startTypingAnimation(contentEl, "I couldn't find information on that topic. Please try rephrasing your question.");
            await waitForTypingComplete();
            return;
        }

        // Get the summary for the first result
        const title = results[0].title;
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const summaryResponse = await fetch(summaryUrl);

        if (!summaryResponse.ok) {
            throw new Error('Wikipedia summary request failed');
        }

        const data = await summaryResponse.json();

        // Remove thinking indicator
        if (thinkingIndicator) {
            thinkingIndicator.remove();
        }

        if (data.extract) {
            // Create message element and start typing animation with source attribution
            const messageDiv = createMessageElement('assistant');
            const contentEl = messageDiv.querySelector('.message-content');
            const fullText = data.extract + '\n\n(Source: Wikipedia)';
            state.streamingComplete = true; // Wikipedia content delivered all at once
            startTypingAnimation(contentEl, fullText);
            await waitForTypingComplete();
        } else {
            const messageDiv = createMessageElement('assistant');
            const contentEl = messageDiv.querySelector('.message-content');
            state.streamingComplete = true; // Wikipedia content delivered all at once
            startTypingAnimation(contentEl, "I couldn't find information on that topic. Please try rephrasing your question.");
            await waitForTypingComplete();
        }
    } catch (error) {
        console.error('Wikipedia query error:', error);
        // Remove thinking indicator
        if (thinkingIndicator) {
            thinkingIndicator.remove();
        }
        const messageDiv = createMessageElement('assistant');
        const contentEl = messageDiv.querySelector('.message-content');
        state.streamingComplete = true; // Wikipedia content delivered all at once
        startTypingAnimation(contentEl, "I encountered an error searching for that information. Please try again.");
        await waitForTypingComplete();
    }
}

// Extract keywords from text
function extractKeywords(text) {
    const stopWords = ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'what', 'who', 'where', 'when', 'how', 'about', 'tell', 'me', 'you', 'can', 'could', 'would', 'should', 'research'];
    const words = text.toLowerCase().split(/\s+/);
    return words.filter(word => !stopWords.includes(word) && word.length > 2);
}

// Extract first sentence from text for conversation history
function extractFirstSentence(text) {
    if (!text) return '';

    // Find the first occurrence of sentence-ending punctuation
    const match = text.match(/^[^.!?:]*[.!?:]/);
    if (match) {
        return match[0].trim();
    }

    // If no sentence-ending punctuation, use first 30 characters
    return text.substring(0, 30).trim();
}

// Remove incomplete sentences from the end of text
function removeIncompleteSentences(text) {
    if (!text) return '';

    // Find the last occurrence of sentence-ending punctuation
    const lastPunctuationIndex = Math.max(
        text.lastIndexOf('.'),
        text.lastIndexOf('!'),
        text.lastIndexOf('?'),
        text.lastIndexOf(':')
    );

    // If we found sentence-ending punctuation, trim to that point
    if (lastPunctuationIndex > 0) {
        return text.substring(0, lastPunctuationIndex + 1).trim();
    }

    // If no sentence-ending punctuation found, return empty string
    return '';
}

// Typewriter animation functions
function startTypingAnimation(contentEl, initialText) {
    state.typingState = {
        contentEl: contentEl,
        fullText: initialText,
        currentIndex: 0,
        isTyping: true,
        typingSpeed: 5
    };

    continueTyping();
}

function updateTypingContent(newText) {
    if (state.typingState) {
        state.typingState.fullText = newText;
    }
}

async function continueTyping() {
    if (!state.typingState || !state.typingState.isTyping) return;

    const { contentEl, typingSpeed } = state.typingState;

    while (state.typingState.isTyping && !state.stopRequested) {
        // Use current fullText (which gets updated by streaming)
        const currentFullText = state.typingState.fullText;

        // Check if we've typed everything we currently have
        if (state.typingState.currentIndex >= currentFullText.length) {
            // If streaming is complete, we're done
            if (state.streamingComplete) {
                break; // No more content coming, finish up
            }
            // Still streaming, wait for more content
            await new Promise(resolve => setTimeout(resolve, 50));
            continue;
        }

        // Type the next character
        const partialText = currentFullText.substring(0, state.typingState.currentIndex + 1);
        contentEl.innerHTML = formatMessageContent(partialText);

        // Auto-scroll to bottom
        scrollToBottom();

        state.typingState.currentIndex++;
        await new Promise(resolve => setTimeout(resolve, typingSpeed));
    }

    // Ensure full text is displayed with formatting
    if (state.typingState && state.typingState.contentEl) {
        const finalHTML = formatMessageContent(state.typingState.fullText);
        state.typingState.contentEl.innerHTML = finalHTML;
    }

    // Mark typing as complete
    if (state.typingState) {
        state.typingState.isTyping = false;
    }
}

async function waitForTypingComplete() {
    while (state.typingState && state.typingState.isTyping) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

// Animate welcome message
async function animateWelcomeMessage() {
    const welcomeEl = document.getElementById('welcomeMessage');
    if (!welcomeEl) return;

    const message = "Hi, what can I help you with?";
    let currentIndex = 0;

    while (currentIndex < message.length) {
        welcomeEl.textContent = message.substring(0, currentIndex + 1);
        currentIndex++;
        await new Promise(resolve => setTimeout(resolve, 30));
    }
}

// Create message element and add to chat
function createMessageElement(role) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return null;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // Scroll to bottom
    scrollToBottom();

    return messageDiv;
}

// Add message to chat
function addMessageToChat(role, content) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMessageContent(content);

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // Scroll to bottom with smooth behavior
    scrollToBottom();
}

// Add thinking indicator
function addThinkingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return null;

    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'thinking-indicator';

    // Add CPU mode message if using CPU model
    const cpuMessage = state.modelEngine === 'cpu'
        ? '<p style="font-size: 0.85em; color: #666; margin-top: 8px; font-style: italic;">(Responses in CPU mode may be slow. Thanks for your patience!)</p>'
        : '';

    thinkingDiv.innerHTML = `
        <div class="thinking-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
        ${cpuMessage}
    `;
    chatMessages.appendChild(thinkingDiv);

    // Scroll to bottom
    scrollToBottom();

    return thinkingDiv;
}

// Scroll chat to bottom
function scrollToBottom() {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const pageContent = document.getElementById('pageContent');
            const chatMessages = document.getElementById('chatMessages');

            // Scroll the main page content (primary scroll container)
            if (pageContent) {
                pageContent.scrollTop = pageContent.scrollHeight;
            }

            // Also scroll the chat messages container if it has its own scroll
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        });
    });
}

// Format message content (basic markdown support)
function formatMessageContent(content) {
    // Links - process before bold to avoid conflicts
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Bold
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Keep actual newlines - they'll be preserved by white-space: pre-line CSS
    // DO NOT convert to <br> tags
    return content;
}

// Show email in modal
function showEmailModal(emailId) {
    const email = state.organizationalData.emails.find(e => e.id === emailId);
    if (!email) return;

    // Use email summary from data or generate a basic one
    const emailSummary = email.summary || `This email from ${email.fromName} is about ${email.subject}.`;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="app-modal outlook-modal">
            <div class="app-title-bar">
                <div class="title-bar-left">
                    <span class="title-icon">✉️</span>
                    <span class="title-text">${email.subject}</span>
                </div>
                <button class="title-close" onclick="document.getElementById('modal').classList.remove('active')">&times;</button>
            </div>
            <div class="app-toolbar">
                <div class="toolbar-actions">
                    <button class="toolbar-btn" title="Reply">↩️</button>
                    <button class="toolbar-btn" title="Forward">➡️</button>
                    <button class="toolbar-btn" title="Delete">🗑️</button>
                </div>
                <div class="toolbar-separator"></div>
                <div class="copilot-menu-container" style="position: relative;">
                    <button class="copilot-btn" onclick="toggleCopilotMenu('${email.id}', 'email')" title="No-Pilot Assistant">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" fill="url(#copilot-gradient)" />
                            <defs>
                                <linearGradient id="copilot-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style="stop-color:#4A9EFF;stop-opacity:1" />
                                    <stop offset="50%" style="stop-color:#7B61FF;stop-opacity:1" />
                                    <stop offset="100%" style="stop-color:#C87EFF;stop-opacity:1" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </button>
                    <div id="copilot-menu-${email.id}" class="copilot-menu" style="display: none;">
                        <button class="copilot-menu-item" data-summary="${escapeHtml(emailSummary)}" onclick='summarizeItem("${email.id}", "email", this.getAttribute("data-summary"))'>📝 Summarize this</button>
                    </div>
                </div>
            </div>
            <div id="summary-area-${email.id}" class="summary-area" style="display: none;"></div>
            <div class="email-header">
                <div class="email-meta">
                    <div class="meta-row"><strong>From:</strong> ${email.fromName} &lt;${email.from}&gt;</div>
                    <div class="meta-row"><strong>Date:</strong> ${email.dateString}</div>
                    <div class="meta-row"><strong>To:</strong> ${email.to.join(', ')}</div>
                </div>
            </div>
            <div class="email-body">${email.content.replace(/\n/g, '<br>')}</div>
        </div>
    `;

    document.getElementById('modal').classList.add('active');
}

// Show event in modal
function showEventModal(eventId) {
    const event = state.organizationalData.calendar.find(e => e.id === eventId);
    if (!event) return;

    // Generate event summary
    const eventSummary = `Meeting titled "${event.title}" scheduled for ${event.dateString} from ${event.startTime} to ${event.endTime} at ${event.location}.`;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="app-modal calendar-modal">
            <div class="app-title-bar">
                <div class="title-bar-left">
                    <span class="title-icon">📅</span>
                    <span class="title-text">${event.title}</span>
                </div>
                <button class="title-close" onclick="document.getElementById('modal').classList.remove('active')">&times;</button>
            </div>
            <div class="app-toolbar">
                <div class="toolbar-actions">
                    <button class="toolbar-btn" title="Accept">✓</button>
                    <button class="toolbar-btn" title="Tentative">?</button>
                    <button class="toolbar-btn" title="Decline">✗</button>
                </div>
                <div class="toolbar-separator"></div>
                <div class="copilot-menu-container" style="position: relative;">
                    <button class="copilot-btn" onclick="toggleCopilotMenu('${event.id}', 'event')" title="No-Pilot Assistant">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" fill="url(#copilot-gradient-event)" />
                            <defs>
                                <linearGradient id="copilot-gradient-event" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style="stop-color:#4A9EFF;stop-opacity:1" />
                                    <stop offset="50%" style="stop-color:#7B61FF;stop-opacity:1" />
                                    <stop offset="100%" style="stop-color:#C87EFF;stop-opacity:1" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </button>
                    <div id="copilot-menu-${event.id}" class="copilot-menu" style="display: none;">
                        <button class="copilot-menu-item" data-summary="${escapeHtml(eventSummary)}" onclick='summarizeItem("${event.id}", "event", this.getAttribute("data-summary"))'>📝 Summarize this</button>
                    </div>
                </div>
            </div>
            <div id="summary-area-${event.id}" class="summary-area" style="display: none;"></div>
            <div class="event-details">
                <div class="detail-row">
                    <span class="detail-icon">📅</span>
                    <div><strong>Date:</strong> ${event.dateString}</div>
                </div>
                <div class="detail-row">
                    <span class="detail-icon">🕐</span>
                    <div><strong>Time:</strong> ${event.startTime} - ${event.endTime}</div>
                </div>
                <div class="detail-row">
                    <span class="detail-icon">📍</span>
                    <div><strong>Location:</strong> ${event.location}</div>
                </div>
                <div class="detail-row">
                    <span class="detail-icon">👥</span>
                    <div><strong>Attendees:</strong> ${event.attendees.join(', ')}</div>
                </div>
            </div>
            <div class="event-description">
                <strong>Description:</strong>
                <p>${event.description}</p>
            </div>
        </div>
    `;

    document.getElementById('modal').classList.add('active');
}

// Show document in modal
function showDocumentModal(docId) {
    const doc = state.organizationalData.documents.find(d => d.id === docId);
    if (!doc) return;

    const modalBody = document.getElementById('modalBody');
    const docSummary = doc.summary || 'This document contains important information.';

    if (doc.type === 'csv') {
        // Render CSV as Excel-like spreadsheet
        const lines = doc.content.split('\n');
        const headers = lines[0].split(',');
        const rows = lines.slice(1).map(line => line.split(','));

        let tableHTML = '<table class="excel-table">';
        tableHTML += '<thead><tr>';
        headers.forEach(header => {
            tableHTML += `<th>${header}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';

        rows.forEach(row => {
            tableHTML += '<tr>';
            row.forEach(cell => {
                tableHTML += `<td>${cell}</td>`;
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';

        modalBody.innerHTML = `
            <div class="app-modal excel-modal">
                <div class="app-title-bar">
                    <div class="title-bar-left">
                        <span class="title-icon" style="color: #217346; font-weight: bold;">&#9618;</span>
                        <span class="title-text">${doc.name}</span>
                    </div>
                    <button class="title-close" onclick="document.getElementById('modal').classList.remove('active')">&times;</button>
                </div>
                <div class="app-toolbar">
                    <div class="toolbar-actions">
                        <button class="toolbar-btn" title="Save">💾</button>
                        <button class="toolbar-btn" title="Print">🖨️</button>
                        <button class="toolbar-btn" title="Share">📤</button>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="copilot-menu-container" style="position: relative;">
                        <button class="copilot-btn" onclick="toggleCopilotMenu('${doc.id}', 'document')" title="No-Pilot Assistant">
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" fill="url(#copilot-gradient-doc)" />
                                <defs>
                                    <linearGradient id="copilot-gradient-doc" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" style="stop-color:#4A9EFF;stop-opacity:1" />
                                        <stop offset="50%" style="stop-color:#7B61FF;stop-opacity:1" />
                                        <stop offset="100%" style="stop-color:#C87EFF;stop-opacity:1" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </button>
                        <div id="copilot-menu-${doc.id}" class="copilot-menu" style="display: none;">
                            <button class="copilot-menu-item" data-summary="${escapeHtml(docSummary)}" onclick='summarizeItem("${doc.id}", "document", this.getAttribute("data-summary"))'>📝 Summarize this</button>
                        </div>
                    </div>
                </div>
                <div id="summary-area-${doc.id}" class="summary-area" style="display: none;"></div>
                <div class="excel-content">
                    ${tableHTML}
                </div>
            </div>
        `;
    } else {
        // Render markdown as Word-like document
        modalBody.innerHTML = `
            <div class="app-modal word-modal">
                <div class="app-title-bar">
                    <div class="title-bar-left">
                        <span class="title-icon">📄</span>
                        <span class="title-text">${doc.name}</span>
                    </div>
                    <button class="title-close" onclick="document.getElementById('modal').classList.remove('active')">&times;</button>
                </div>
                <div class="app-toolbar">
                    <div class="toolbar-actions">
                        <button class="toolbar-btn" title="Save">💾</button>
                        <button class="toolbar-btn" title="Print">🖨️</button>
                        <button class="toolbar-btn" title="Share">📤</button>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="copilot-menu-container" style="position: relative;">
                        <button class="copilot-btn" onclick="toggleCopilotMenu('${doc.id}', 'document')" title="No-Pilot Assistant">
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" fill="url(#copilot-gradient-doc2)" />
                                <defs>
                                    <linearGradient id="copilot-gradient-doc2" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" style="stop-color:#4A9EFF;stop-opacity:1" />
                                        <stop offset="50%" style="stop-color:#7B61FF;stop-opacity:1" />
                                        <stop offset="100%" style="stop-color:#C87EFF;stop-opacity:1" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </button>
                        <div id="copilot-menu-${doc.id}" class="copilot-menu" style="display: none;">
                            <button class="copilot-menu-item" data-summary="${escapeHtml(docSummary)}" onclick='summarizeItem("${doc.id}", "document", this.getAttribute("data-summary"))'>📝 Summarize this</button>
                        </div>
                    </div>
                </div>
                <div id="summary-area-${doc.id}" class="summary-area" style="display: none;"></div>
                <div class="word-content">
                    ${formatMarkdown(doc.content)}
                </div>
            </div>
        `;
    }

    document.getElementById('modal').classList.add('active');
}

// Toggle Copilot menu in modals
window.toggleCopilotMenu = function (itemId, itemType) {
    const menu = document.getElementById(`copilot-menu-${itemId}`);
    if (!menu) return;

    // Close other open menus
    document.querySelectorAll('.copilot-menu').forEach(m => {
        if (m.id !== `copilot-menu-${itemId}`) {
            m.style.display = 'none';
        }
    });

    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

// Summarize item and display in chat area
window.summarizeItem = function (itemId, itemType, summary) {
    const summaryArea = document.getElementById(`summary-area-${itemId}`);
    if (!summaryArea) return;

    // Close menu
    const menu = document.getElementById(`copilot-menu-${itemId}`);
    if (menu) menu.style.display = 'none';

    // Show summary in chat-like area
    summaryArea.innerHTML = `
        <div class="copilot-summary">
            <div class="summary-header">
                <svg width="20" height="20" viewBox="0 0 20 20" style="margin-right: 8px;">
                    <circle cx="10" cy="10" r="8" fill="url(#summary-gradient)" />
                    <defs>
                        <linearGradient id="summary-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#4A9EFF;stop-opacity:1" />
                            <stop offset="50%" style="stop-color:#7B61FF;stop-opacity:1" />
                            <stop offset="100%" style="stop-color:#C87EFF;stop-opacity:1" />
                        </linearGradient>
                    </defs>
                </svg>
                <strong>No-Pilot Summary</strong>
            </div>
            <div class="summary-content">${summary}</div>
        </div>
    `;
    summaryArea.style.display = 'block';
};

// Helper to escape text for HTML attributes
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Basic markdown formatter
function formatMarkdown(content) {
    // Links - process first to avoid conflicts
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Headers
    content = content.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    content = content.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    content = content.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    // Bold
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Line breaks
    content = content.replace(/\n\n/g, '</p><p>');
    content = content.replace(/\n/g, '<br>');
    return '<p>' + content + '</p>';
}

// Search functionality
function setupSearchListeners() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        performSearch(e.target.value);
    });

    document.querySelectorAll('.shortcut-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const person = e.currentTarget.getAttribute('data-person');
            const searchType = e.currentTarget.getAttribute('data-search');

            if (person) {
                searchInput.value = `Person:'${person}' `;
                searchInput.focus();
                performSearch(searchInput.value);
            } else if (searchType === 'files') {
                searchInput.value = `source:'Documents' `;
                searchInput.focus();
                performSearch(searchInput.value);
            } else if (searchType === 'email') {
                searchInput.value = `source:'Email' `;
                searchInput.focus();
                performSearch(searchInput.value);
            }
        });
    });
}

// Perform search
function performSearch(query) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;

    if (!query || query.trim().length < 2) {
        searchResults.innerHTML = '';
        return;
    }

    // Parse query for filters
    let personFilter = null;
    let sourceFilter = null;
    let keywords = query;

    // Extract Person: filter
    const personMatch = query.match(/Person:'([^']+)'/i);
    if (personMatch) {
        personFilter = personMatch[1].toLowerCase();
        keywords = query.replace(/Person:'[^']+'/gi, '').trim();
    }

    // Extract source: filter
    const sourceMatch = query.match(/source:'([^']+)'/i);
    if (sourceMatch) {
        sourceFilter = sourceMatch[1].toLowerCase();
        keywords = keywords.replace(/source:'[^']+'/gi, '').trim();
    }

    const keywordLower = keywords.toLowerCase();
    const hasKeywords = keywordLower.length > 0;
    const results = {
        emails: [],
        documents: [],
        events: []
    };

    // Require at least keywords or personFilter to perform a search
    if (!hasKeywords && !personFilter) {
        searchResults.innerHTML = '<p style="text-align: center; color: #666;">Enter a search term or select a filter</p>';
        return;
    }

    // Search emails (if not filtered out by source)
    if (!sourceFilter || sourceFilter === 'email') {
        state.organizationalData.emails.forEach(email => {
            let matches = true;

            // Filter by person if specified
            if (personFilter) {
                if (!email.fromName || !email.fromName.toLowerCase().includes(personFilter)) {
                    matches = false;
                }
            }

            // Filter by keywords if specified
            if (matches && hasKeywords) {
                const subjectMatch = email.subject && email.subject.toLowerCase().includes(keywordLower);
                const contentMatch = email.content && email.content.toLowerCase().includes(keywordLower);
                const keywordMatch = email.keywords && email.keywords.some(k => k.toLowerCase().includes(keywordLower));
                if (!subjectMatch && !contentMatch && !keywordMatch) {
                    matches = false;
                }
            }

            if (matches) {
                results.emails.push(email);
            }
        });
    }

    // Search documents (if not filtered out by source)
    // Documents can only be searched by keywords (no person field)
    if ((!sourceFilter || sourceFilter === 'documents') && hasKeywords) {
        state.organizationalData.documents.forEach(doc => {
            const nameMatch = doc.name && doc.name.toLowerCase().includes(keywordLower);
            const keywordMatch = doc.keywords && doc.keywords.some(k => k.toLowerCase().includes(keywordLower));
            const contentMatch = doc.content && doc.content.toLowerCase().includes(keywordLower);

            if (nameMatch || keywordMatch || contentMatch) {
                results.documents.push(doc);
            }
        });
    }

    // Search calendar events (if not filtered by source)
    if (!sourceFilter) {
        state.organizationalData.calendar.forEach(event => {
            let matches = true;

            // Filter by person if specified (check attendees)
            if (personFilter) {
                const attendeeMatch = event.attendees && event.attendees.some(a => a.toLowerCase().includes(personFilter));
                if (!attendeeMatch) {
                    matches = false;
                }
            }

            // Filter by keywords if specified
            if (matches && hasKeywords) {
                const titleMatch = event.title && event.title.toLowerCase().includes(keywordLower);
                const locationMatch = event.location && event.location.toLowerCase().includes(keywordLower);
                const descMatch = event.description && event.description.toLowerCase().includes(keywordLower);
                if (!titleMatch && !locationMatch && !descMatch) {
                    matches = false;
                }
            }

            if (matches) {
                results.events.push(event);
            }
        });
    }

    // Render results
    let html = '';

    if (results.emails.length > 0) {
        html += '<div class="result-section"><h3>Emails</h3>';
        results.emails.forEach(email => {
            html += `
                <div class="result-item" onclick="showEmailModal('${email.id}')">
                    <div class="result-item-title">✉️ ${email.subject}</div>
                    <div class="result-item-meta">From: ${email.fromName} - ${email.dateString}</div>
                </div>
            `;
        });
        html += '</div>';
    }

    if (results.documents.length > 0) {
        html += '<div class="result-section"><h3>Documents</h3>';
        results.documents.forEach(doc => {
            const icon = doc.type === 'csv' ? '<span style="color: #217346; font-weight: bold;">&#9618;</span>' : '📄';
            html += `
                <div class="result-item" onclick="showDocumentModal('${doc.id}')">
                    <div class="result-item-title">${icon} ${doc.name}</div>
                    <div class="result-item-meta">Document - ${doc.type}</div>
                </div>
            `;
        });
        html += '</div>';
    }

    if (results.events.length > 0) {
        html += '<div class="result-section"><h3>Meetings</h3>';
        results.events.forEach(event => {
            html += `
                <div class="result-item" onclick="showEventModal('${event.id}')">
                    <div class="result-item-title">📅 ${event.title}</div>
                    <div class="result-item-meta">${event.time} - ${event.location || 'No location'}</div>
                </div>
            `;
        });
        html += '</div>';
    }

    if (html === '') {
        html = '<p style="text-align: center; color: #666;">No results found</p>';
    }

    searchResults.innerHTML = html;
}

// Show contact modal
window.showContactModal = function (contactId) {
    const contact = state.organizationalData.contacts.find(c => c.id === contactId);
    if (!contact) return;

    const contactSummary = `${contact.name} is a ${contact.role} in the ${contact.department} department.`;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="app-modal contact-modal">
            <div class="app-title-bar">
                <div class="title-bar-left">
                    <span class="title-icon">👤</span>
                    <span class="title-text">${contact.name}</span>
                </div>
                <button class="title-close" onclick="document.getElementById('modal').classList.remove('active')">&times;</button>
            </div>
            <div class="app-toolbar">
                <div class="toolbar-actions">
                    <button class="toolbar-btn" title="Email">✉️</button>
                    <button class="toolbar-btn" title="Call">📞</button>
                    <button class="toolbar-btn" title="Message">💬</button>
                </div>
                <div class="toolbar-separator"></div>
                <div class="copilot-menu-container" style="position: relative;">
                    <button class="copilot-btn" onclick="toggleCopilotMenu('${contact.id}', 'contact')" title="No-Pilot Assistant">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" fill="url(#copilot-gradient-contact)" />
                            <defs>
                                <linearGradient id="copilot-gradient-contact" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style="stop-color:#4A9EFF;stop-opacity:1" />
                                    <stop offset="50%" style="stop-color:#7B61FF;stop-opacity:1" />
                                    <stop offset="100%" style="stop-color:#C87EFF;stop-opacity:1" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </button>
                    <div id="copilot-menu-${contact.id}" class="copilot-menu" style="display: none;">
                        <button class="copilot-menu-item" data-summary="${escapeHtml(contactSummary)}" onclick='summarizeItem("${contact.id}", "contact", this.getAttribute("data-summary"))'>📝 Summarize this</button>
                    </div>
                </div>
            </div>
            <div id="summary-area-${contact.id}" class="summary-area" style="display: none;"></div>
            <div class="contact-card">
                <div class="contact-avatar">
                    <div class="avatar-circle">${contact.name.charAt(0)}</div>
                </div>
                <h2 class="contact-name">${contact.name}</h2>
                <div class="contact-title">${contact.role}</div>
                <div class="contact-details">
                    <div class="contact-detail-row">
                        <span class="detail-icon">🏢</span>
                        <div>
                            <div class="detail-label">Department</div>
                            <div class="detail-value">${contact.department}</div>
                        </div>
                    </div>
                    <div class="contact-detail-row">
                        <span class="detail-icon">✉️</span>
                        <div>
                            <div class="detail-label">Email</div>
                            <div class="detail-value">${contact.email}</div>
                        </div>
                    </div>
                    <div class="contact-detail-row">
                        <span class="detail-icon">📞</span>
                        <div>
                            <div class="detail-label">Phone</div>
                            <div class="detail-value">${contact.phone}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal').classList.add('active');
};

// Researcher page listeners
function setupResearcherListeners() {
    const researcherInput = document.getElementById('researcherInput');
    const researcherInputBottom = document.getElementById('researcherInputBottom');
    const researcherSubmitTop = document.getElementById('researcherSubmitTop');
    const researcherSubmitBottom = document.getElementById('researcherSubmitBottom');

    if (researcherInput) {
        researcherInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && researcherInput.value.trim()) {
                handleResearcherPrompt(researcherInput.value.trim());
                researcherInput.value = '';
            }
        });
    }

    if (researcherSubmitTop) {
        researcherSubmitTop.addEventListener('click', () => {
            if (researcherInput && researcherInput.value.trim()) {
                handleResearcherPrompt(researcherInput.value.trim());
                researcherInput.value = '';
            }
        });
    }

    if (researcherInputBottom) {
        researcherInputBottom.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && researcherInputBottom.value.trim()) {
                const input = researcherInputBottom.value.trim();
                if (state.researcherAwaitingSelection) {
                    handleResearcherSelection(input);
                } else {
                    // Start new research prompt
                    handleResearcherPrompt(input);
                }
                researcherInputBottom.value = '';
            }
        });
    }

    if (researcherSubmitBottom) {
        researcherSubmitBottom.addEventListener('click', () => {
            if (researcherInputBottom && researcherInputBottom.value.trim()) {
                const input = researcherInputBottom.value.trim();
                if (state.researcherAwaitingSelection) {
                    handleResearcherSelection(input);
                } else {
                    // Start new research prompt
                    handleResearcherPrompt(input);
                }
                researcherInputBottom.value = '';
            }
        });
    }
}

async function handleResearcherPrompt(prompt) {
    // Hide welcome screen, show chat (if not already shown)
    const welcomeScreen = document.getElementById('researcherWelcome');
    const chatScreen = document.getElementById('researcherChat');
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (chatScreen) chatScreen.style.display = 'flex';

    // Extract keywords
    const keywords = extractKeywords(prompt);
    const keywordsText = keywords.length > 0 ? keywords.join(', ') : 'that topic';

    // Store the prompt for later
    state.researcherPrompt = prompt;
    state.researcherAwaitingSelection = true;

    // Add message to chat
    const messagesDiv = document.getElementById('researcherMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-assistant';
    messageDiv.innerHTML = `
        <div class="message-content">
            <p>OK, you want me to research <strong>${keywordsText}</strong>. Choose a report style...</p>
            <div class="report-options">
                <button class="report-option-btn" onclick="selectResearcherReport(1)">1. Summary Report</button>
                <button class="report-option-btn" onclick="selectResearcherReport(2)">2. Detailed Report</button>
                <button class="report-option-btn" onclick="selectResearcherReport(3)">3. Cancel</button>
            </div>
        </div>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function handleResearcherSelection(input) {
    const inputLower = input.toLowerCase();
    let reportType = null;

    // Check for direct number
    if (input === '1') reportType = 1;
    else if (input === '2') reportType = 2;
    else if (input === '3') reportType = 3;
    // Check for text matches
    else if (inputLower === 'summary' || inputLower === 'summary report') reportType = 1;
    else if (inputLower === 'detailed' || inputLower === 'detailed report') reportType = 2;
    else if (inputLower === 'cancel') reportType = 3;

    if (reportType) {
        selectResearcherReport(reportType);
    }
}

window.selectResearcherReport = async function (reportType) {
    if (!state.researcherAwaitingSelection) return;

    // Handle cancel
    if (reportType === 3) {
        state.researcherAwaitingSelection = false;
        const messagesDiv = document.getElementById('researcherMessages');
        const userMessageDiv = document.createElement('div');
        userMessageDiv.className = 'message message-user';
        userMessageDiv.innerHTML = `
            <div class="message-content">
                Cancel
            </div>
        `;
        messagesDiv.appendChild(userMessageDiv);

        const responseDiv = document.createElement('div');
        responseDiv.className = 'message message-assistant';
        responseDiv.innerHTML = `
            <div class="message-content">
                <p>No problem. What else would you like me to research?</p>
            </div>
        `;
        messagesDiv.appendChild(responseDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // Focus back to input after cancel response
        const researcherInputBottom = document.getElementById('researcherInputBottom');
        if (researcherInputBottom && !researcherInputBottom.disabled) {
            researcherInputBottom.focus();
        }
        return;
    }

    state.researcherAwaitingSelection = false;
    const prompt = state.researcherPrompt;

    // Add user selection to chat
    const messagesDiv = document.getElementById('researcherMessages');
    const userMessageDiv = document.createElement('div');
    userMessageDiv.className = 'message message-user';
    userMessageDiv.innerHTML = `
        <div class="message-content">
            ${reportType === 1 ? 'Summary Report' : 'Detailed Report'}
        </div>
    `;
    messagesDiv.appendChild(userMessageDiv);

    // Start timer for changing thinking messages
    // Set interval based on model speed
    let thinkingInterval;
    if (state.currentModel === 'wikipedia') {
        thinkingInterval = 5000; // 5 seconds
    } else if (state.currentModel === 'phi3') {
        thinkingInterval = 15000; // 15 seconds
    } else if (state.currentModel === 'phi2') {
        thinkingInterval = 20000; // 20 seconds
    } else {
        thinkingInterval = 10000; // default 10 seconds
    }

    const cpuNote = state.currentModel === 'phi2' ? '<br>(Responses may be slow in CPU mode)' : '';
    const thinkingMessages = [
        'Researching' + cpuNote,
        'Analyzing information' + cpuNote,
        'Compiling report' + cpuNote,
        'Pulling everything together' + cpuNote
    ];

    // Show thinking indicator with animated dots and changing messages
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message message-assistant';
    thinkingDiv.id = 'researcherThinking';
    thinkingDiv.innerHTML = `
        <div class="message-content">
            <div class="thinking-indicator">
                <div class="thinking-dots">
                    <span id="researcherThinkingText">${thinkingMessages[0]}</span>
                    <span class="dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
            </div>
        </div>
    `;
    messagesDiv.appendChild(thinkingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Disable input and show stop button
    const researcherInputBottom = document.getElementById('researcherInputBottom');
    const researcherSubmitBottom = document.getElementById('researcherSubmitBottom');
    const researcherStopBottom = document.getElementById('researcherStopBottom');
    if (researcherInputBottom) researcherInputBottom.disabled = true;
    if (researcherSubmitBottom) researcherSubmitBottom.style.display = 'none';
    if (researcherStopBottom) researcherStopBottom.style.display = 'flex';

    let messageIndex = 0;
    const thinkingTimer = setInterval(() => {
        messageIndex++;
        if (messageIndex < thinkingMessages.length) {
            const textEl = document.getElementById('researcherThinkingText');
            if (textEl) {
                textEl.innerHTML = thinkingMessages[messageIndex];
            }
        }
    }, thinkingInterval);

    // Generate response based on model
    try {
        let response = '';

        if (state.currentModel === 'wikipedia') {
            // Wikipedia mode
            const keywords = extractKeywords(prompt);
            const searchQuery = keywords.join(' ');

            if (!searchQuery) {
                response = "I couldn't find information on that topic. Please try rephrasing your question.";
            } else {
                // Search Wikipedia
                const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&origin=*&srlimit=1`;
                const searchResponse = await fetch(searchUrl);
                const searchData = await searchResponse.json();
                const results = searchData?.query?.search;

                if (!results || results.length === 0) {
                    response = "I couldn't find information on that topic. Please try rephrasing your question.";
                } else {
                    const title = results[0].title;

                    if (reportType === 1) {
                        // Summary report: Use summary endpoint for first paragraph
                        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
                        const summaryResponse = await fetch(summaryUrl);
                        const data = await summaryResponse.json();

                        if (data.extract) {
                            const firstPara = data.extract.split('\n')[0];
                            response = firstPara + '\n\n(Source: Wikipedia)';
                        } else {
                            response = "I couldn't find information on that topic. Please try rephrasing your question.";
                        }
                    } else {
                        // Detailed report: Use extract endpoint for full content
                        const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=0&explaintext=1&titles=${encodeURIComponent(title)}`;
                        const contentResponse = await fetch(contentUrl);
                        const contentData = await contentResponse.json();
                        const pages = contentData?.query?.pages;

                        if (pages) {
                            const pageId = Object.keys(pages)[0];
                            const extract = pages[pageId]?.extract;
                            if (extract) {
                                // Limit to first 1000 characters to keep it manageable
                                const limitedExtract = extract.length > 1000 ? extract.substring(0, 1000) + '...' : extract;
                                response = limitedExtract + '\n\n(Source: Wikipedia)';
                            } else {
                                response = "I couldn't find information on that topic. Please try rephrasing your question.";
                            }
                        } else {
                            response = "I couldn't find information on that topic. Please try rephrasing your question.";
                        }
                    }
                }
            }
        } else {
            // Real model mode (Phi-3 or Phi-2)
            let modifiedPrompt = prompt;
            if (reportType === 1) {
                modifiedPrompt += '\nRespond with a single short overview paragraph.';
            } else {
                modifiedPrompt += '\nRespond with an Introduction section containing a single overview paragraph, and a Key Points section containing a bulleted list of no more than 5 key points.';
            }

            // Call model generation
            if (state.currentModel === 'phi3' && state.engine) {
                response = await generateResearchWithWebLLM(modifiedPrompt);
            } else if (state.currentModel === 'phi2' && state.wllama) {
                response = await generateResearchWithWllama(modifiedPrompt);
            } else {
                response = 'No AI model is currently available. Please try switching to Wikipedia mode from the menu.';
            }
        }

        // Remove thinking indicator
        clearInterval(thinkingTimer);
        const thinkingIndicator = document.getElementById('researcherThinking');
        if (thinkingIndicator) thinkingIndicator.remove();

        // Re-enable input and show submit button
        if (researcherInputBottom) researcherInputBottom.disabled = false;
        if (researcherSubmitBottom) researcherSubmitBottom.style.display = 'flex';
        if (researcherStopBottom) researcherStopBottom.style.display = 'none';

        // Create heading with keywords (title case)
        const keywords = extractKeywords(prompt);
        const keywordsText = keywords.length > 0
            ? keywords.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(', ')
            : 'Research';
        const reportTypeText = reportType === 1 ? 'Summary Report' : 'Detailed Report';
        const heading = `<h3>${keywordsText}: ${reportTypeText}</h3>`;

        // Add response to chat
        const responseDiv = document.createElement('div');
        responseDiv.className = 'message message-assistant';
        responseDiv.innerHTML = `
            <div class="message-content">
                ${heading}
                ${formatMessageContent(response)}
            </div>
        `;
        messagesDiv.appendChild(responseDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // Focus back to input after report display
        if (researcherInputBottom && !researcherInputBottom.disabled) {
            researcherInputBottom.focus();
        }

    } catch (error) {
        console.error('Research error:', error);
        clearInterval(thinkingTimer);
        const thinkingIndicator = document.getElementById('researcherThinking');
        if (thinkingIndicator) thinkingIndicator.remove();

        // Re-enable input and show submit button
        const researcherInputBottom = document.getElementById('researcherInputBottom');
        const researcherSubmitBottom = document.getElementById('researcherSubmitBottom');
        const researcherStopBottom = document.getElementById('researcherStopBottom');
        if (researcherInputBottom) researcherInputBottom.disabled = false;
        if (researcherSubmitBottom) researcherSubmitBottom.style.display = 'flex';
        if (researcherStopBottom) researcherStopBottom.style.display = 'none';

        const errorDiv = document.createElement('div');
        errorDiv.className = 'message message-assistant';
        errorDiv.innerHTML = `
            <div class="message-content">
                I encountered an error processing your request. Please try again.
            </div>
        `;
        messagesDiv.appendChild(errorDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // Focus back to input after error display
        if (researcherInputBottom && !researcherInputBottom.disabled) {
            researcherInputBottom.focus();
        }
    }
};

// Generate research with WebLLM (simplified, using stream and collecting)
async function generateResearchWithWebLLM(prompt) {
    const messages = [
        { role: 'system', content: 'You are a helpful research assistant.' },
        { role: 'user', content: prompt }
    ];

    const completion = await state.engine.chat.completions.create({
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
        stream: true
    });

    let response = '';
    for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
            response += delta;
        }
    }

    response = removeIncompleteSentences(response);
    return response;
}

// Generate research with Wllama (simplified, using stream and collecting)
async function generateResearchWithWllama(prompt) {
    let chatMLPrompt = '<|im_start|>system\nYou are a helpful research assistant.<|im_end|>\n\n';
    chatMLPrompt += '<|im_start|>user\n';
    chatMLPrompt += prompt;
    chatMLPrompt += '\n<|im_end|>\n\n';
    chatMLPrompt += '<|im_start|>assistant\n';

    const completion = await state.wllama.createCompletion(chatMLPrompt, {
        nPredict: 300,
        sampling: {
            temp: 0.2,
            top_p: 0.9,
            penalty_repeat: 1.1
        },
        stopTokens: ['<|im_end|>', '<|im_start|>'],
        stream: true
    });

    let response = '';
    for await (const chunk of completion) {
        if (chunk.currentText) {
            response = chunk.currentText;
        }
    }

    // Clean up response
    const cutoffs = ['<|im_end|>', '<|im_start|>', '\nUser:', '\nHuman:'];
    for (const cutoff of cutoffs) {
        const index = response.indexOf(cutoff);
        if (index > 0) {
            response = response.substring(0, index);
            break;
        }
    }

    response = removeIncompleteSentences(response);
    await state.wllama.kvClear();
    return response;
};

// Analyst page listeners
function setupAnalystListeners() {
    document.querySelectorAll('.prompt-card[data-action]').forEach(card => {
        card.addEventListener('click', (e) => {
            const action = e.currentTarget.getAttribute('data-action');
            handleAnalystAction(action);
        });
    });
}

function handleAnalystAction(action) {
    if (action === 'analyzeData') {
        // Show document selection
        const docs = state.organizationalData.documents.filter(d => d.type === 'csv');
        let message = 'Please select a document to analyze:\n\n';
        docs.forEach(doc => {
            message += `<a href="#" class="data-link" data-analyze="${doc.id}">${doc.name}</a>\n`;
        });
        addMessageToChat('assistant', message);

        // Add click listeners
        setTimeout(() => {
            document.querySelectorAll('[data-analyze]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const docId = e.target.getAttribute('data-analyze');
                    analyzeDocument(docId);
                });
            });
        }, 100);
    }
}

function analyzeDocument(docId) {
    const doc = state.organizationalData.documents.find(d => d.id === docId);
    if (!doc || doc.type !== 'csv') return;

    // Show thinking indicator
    const thinkingIndicator = addThinkingIndicator();

    // Simulate processing time
    setTimeout(() => {
        // Remove thinking indicator
        if (thinkingIndicator) {
            thinkingIndicator.remove();
        }

        // Parse CSV and sum columns
        const lines = doc.content.split('\n');
        const headers = lines[0].split(',');
        const rows = lines.slice(1, -1); // Exclude TOTAL row if exists

        const sums = {};
        headers.forEach((header, index) => {
            if (index === 0) return; // Skip first column (labels)

            let sum = 0;
            rows.forEach(row => {
                const cells = row.split(',');
                const value = parseFloat(cells[index]);
                if (!isNaN(value)) {
                    sum += value;
                }
            });

            sums[header] = sum;
        });

        // Format results
        let analysis = `Analysis of ${doc.name}:\n\n`;
        Object.entries(sums).forEach(([key, value]) => {
            analysis += `**${key}:** ${value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}\n`;
        });

        addMessageToChat('assistant', analysis);
    }, 800);
}

// Agent builder listeners
function setupAgentBuilderListeners() {
    document.getElementById('tryAgentBtn')?.addEventListener('click', () => {
        const website = document.getElementById('agentWebsite').value;
        if (!website) {
            alert('Please enter a website URL for the agent to search.');
            return;
        }

        // Show test interface
        document.getElementById('pageContent').innerHTML = renderAgentTestPage(website);
        setupAgentTestListeners(website);
    });

    document.getElementById('createAgentBtn')?.addEventListener('click', () => {
        const website = document.getElementById('agentWebsite').value;
        if (!website) {
            alert('Please enter a website URL for the agent to search.');
            return;
        }

        alert('Agent created successfully!');
        navigateToPage('newChat');
    });
}

function renderAgentTestPage(website) {
    return `
        <div class="chat-container">
            <div class="agent-page">
                <div class="agent-icon">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="white">
                        <path d="M20 10v10h10v10H20V20H10V10h10z"/>
                    </svg>
                </div>
                <h1>New Agent</h1>
                <p class="agent-description">Searches ${website} to find current information and summarize results for users.</p>
                
                <div class="prompt-cards">
                    <div class="prompt-card" data-search="recent news">
                        <div class="prompt-card-title">Find Recent News</div>
                        <div class="prompt-card-message">Search the web for the latest headlines on a topic.</div>
                    </div>
                    <div class="prompt-card" data-search="contact details">
                        <div class="prompt-card-title">Get contact details</div>
                        <div class="prompt-card-message">Get contact details</div>
                    </div>
                </div>
            </div>
            <div class="chat-messages" id="chatMessages"></div>
        </div>
    `;
}

function setupAgentTestListeners(website) {
    document.getElementById('inputArea').style.display = 'block';

    // Override submit handler for this agent
    const originalHandler = handleSubmit;
    window.handleSubmit = async function () {
        const input = document.getElementById('userInput');
        const message = input.value.trim();

        if (!message) return;

        input.value = '';
        addMessageToChat('user', message);

        // Show thinking indicator
        const thinkingIndicator = addThinkingIndicator();

        // Simulate search time
        await new Promise(resolve => setTimeout(resolve, 500));

        // Remove thinking indicator
        if (thinkingIndicator) {
            thinkingIndicator.remove();
        }

        // Extract keywords and create Bing search URL
        const keywords = extractKeywords(message);
        const searchQuery = keywords.join('+');
        const bingUrl = `https://www.bing.com/search?q=site%3A${website}+${searchQuery}`;

        const response = `I searched for '${keywords.join(' ')}' on ${website} - here are the results: [View Results](${bingUrl})`;
        addMessageToChat('assistant', response);
    };

    document.querySelectorAll('.prompt-card[data-search]').forEach(card => {
        card.addEventListener('click', (e) => {
            const searchTerm = e.currentTarget.getAttribute('data-search');
            document.getElementById('userInput').value = searchTerm;
            handleSubmit();
        });
    });
}

// Voice input
function toggleVoiceInput() {
    if (!state.speechRecognition) {
        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Speech recognition is not supported in your browser.');
            return;
        }

        state.speechRecognition = new SpeechRecognition();
        state.speechRecognition.continuous = false;
        state.speechRecognition.interimResults = false;

        state.speechRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('userInput').value = transcript;
            state.isListening = false;
        };

        state.speechRecognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            state.isListening = false;
        };

        state.speechRecognition.onend = () => {
            state.isListening = false;
        };
    }

    if (state.isListening) {
        state.speechRecognition.stop();
        state.isListening = false;
    } else {
        state.speechRecognition.start();
        state.isListening = true;
    }
}

// Switch model
async function switchModel(model) {
    const currentInput = document.getElementById('userInput')?.value || '';

    updateLoadingStatus(`Switching to ${model}...`);
    document.getElementById('loadingScreen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';

    // Clear Wllama cache if switching away from Wllama/CPU mode
    if (state.modelEngine === 'cpu' && state.wllama && model !== 'phi2') {
        try {
            console.log('Clearing Wllama cache before model switch...');
            await state.wllama.kvClear();
            console.log('Wllama cache cleared');
        } catch (error) {
            console.log('Failed to clear Wllama cache:', error.message);
        }
    }

    // Reset conversation history
    state.chatHistory = [];
    console.log('Conversation history cleared for model switch');

    try {
        if (model === 'phi3') {
            if (!state.engine) {
                await initializeWebLLM();
            }
            state.currentModel = 'phi3';
            state.modelEngine = 'webllm';
        } else if (model === 'phi2') {
            if (!state.wllama) {
                await initializeWllama();
            }
            state.currentModel = 'phi2';
            state.modelEngine = 'cpu';
        } else if (model === 'wikipedia') {
            state.currentModel = 'wikipedia';
            state.modelEngine = 'wikipedia';
        }

        updateLoadingStatus('Model ready!');
        await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
        console.error('Error switching model:', error);
        updateLoadingStatus('Error loading model, falling back to Wikipedia...');
        state.currentModel = 'wikipedia';
        state.modelEngine = 'wikipedia';
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Clear chat interface
    clearChatInterface();

    if (currentInput) {
        document.getElementById('userInput').value = currentInput;
    }

    // Update menu to show active model
    updateModelMenu();
}

// Clear the chat interface
function clearChatInterface() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
        console.log('Chat interface cleared');
    }
}

// Update model menu to show which models are available/active
function updateModelMenu() {
    const menuItems = document.querySelectorAll('.menu-item[data-model]');
    menuItems.forEach(item => {
        const model = item.getAttribute('data-model');
        item.classList.remove('active');

        // Disable unavailable models
        if (model === 'phi3' && !state.engine && state.currentModel !== 'phi3') {
            item.disabled = false; // Allow trying to load
            item.style.opacity = '0.6';
        } else if (model === 'phi2' && !state.wllama && state.currentModel !== 'phi2') {
            item.disabled = false; // Allow trying to load
            item.style.opacity = '0.6';
        } else {
            item.disabled = false;
            item.style.opacity = '1';
        }

        // Mark active model
        if (model === state.currentModel) {
            item.classList.add('active');
            item.style.fontWeight = 'bold';
        }
    });
}

// Utility functions
function updateLoadingStatus(status) {
    document.getElementById('loadingStatus').textContent = status;
}

function formatDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else if (date.toDateString() === tomorrow.toDateString()) {
        return 'Tomorrow';
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

// Make functions globally accessible for inline event handlers
window.showDocumentModal = showDocumentModal;
window.showEmailModal = showEmailModal;
window.showEventModal = showEventModal;

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

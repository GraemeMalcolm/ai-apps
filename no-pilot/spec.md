No-Pilot is a lightweight AI assistant app that provides a simplified emulation of Microsoft 365 Copilot for educational purposes. Learners can use No-Pilot to explore the basic functionality of Copilot using in-browser models and simulated data. The goal is to provide a "Copilot-like" user experience without the need for a Microsoft 365 subscription or hosted lab environment.

## Hosting

The app is hosted in this repo in a GitHub pages site. It is a static web app with no server-side dependencies. It is implemented as an HTML web page with CSS and JavaScript, and data files in JSOn format.

## User Interface

The user interface resembles the real Microsoft 365 Copilot Chat application, consisting of a collapsible navigation pane on the left and a main content pane on the right. The navigation pane includes the following pages:

- New chat
- Search

Agents (section heading / separator)

- Researcher
- Analyst
- New Agent

The color themes and icons are reminiscent of the real Copilot interface, but subtly changed to make it clear that this is an emulation - not the real thing!

## Context and data

The app is a hybrid between a working application and a simulation. It uses sample data to represent organizational data assets such as emails, documents, and contacts; but also uses real user input and models to generate responses.

For the purposes of the application, the user will take on the role of a product manager for the fictional Fourth Coffee Company; which provides coffee vending machines and catering services to large companies and institutions. The organizational data for the app is stored in JSON files, which are searched based on keyword entered by the user. Specifically, the JSON data incudes:

- Emails sent to the user from Anton (<anton@fourthcoffee.com>) and Matt (<matt@fourthcoffee.com>). The email should relate to a sales opportunity with Microsoft Corporation; who wants to install 5 "standard" coffee vending machines for its employees, and a "premium" espresso machine in its executive briefing center. Anton is the sales representative who is handling the lead, and Matt manages installation and fulfillment. The app user's role is to help research the opportunity and help Anton and Matt prepare for an upcoming customer meeting. The email JSOn file should include a document for each email, with fields for the email content, sender, and date (which should be dynamically) generated when the app first loads so that all emails have been sent within the last week with a logical timeline reflecting the initial sales enquiry to Anton, after which he sent an email to discuss the feasibility of fulfillment to the app user and Matt; and a follow-up email from Matt to both Anton and the app user requesting some background information about the customer (Microsoft). There are also some unrelated emails, including an email from Matt asking if the user is still free for lunch next week and a junk email trying to sell the user auto insurance.
- Contact and role details for employees (including Anton and Matt, as well as other unrelated functional users).
- Documents stored in the corporate SharePoint site, including a standard contract document (in Markdown format so it can be easily rendered by the app with basic formatting) for installation of a vending machine and ongoing monthly supply of coffee and maintenance; and a .csv formatted "workbook" that contains a 12-month projection for costs and revenue. Revenue is based on an initial supply and installation fee, and a monthly contract payment. The first month's costs should include the capital cost of the vending machines and an installation engineer. The ongoing costs reflect the cost of wholesale coffee and its delivery to the customer. Over a year, the capital cost of the vending machines must be recovered from the initial installation fee and monthly contract payments. The JSON file for the document includes the document contents (in markdown or CSV format) as well as metadata fields for file name and keywords that can be used to search (such as "Microsoft" and "contract" for the contract document, and "Microsoft", "cost", "revenue", and "projections" for the workbook - in the learning experience, the user will be prompted to search for documents related to "Microsoft").
- Calendar events for the previous and next week for the user, Anton, and Matt. The events include an "initial kickoff for Microsoft opportunity" meeting between Anton, Matt, and the user (referred to by the app as "You") that took place yesterday, and a scheduled "Microsoft opportunity follow-up" meeting with the user, Anton, and Matt for tomorrow (the meeting dates are dynamically generated at app startup time). There are various other unrelated meetings in all three calendars for common events like "Weekly team meeting", "lunch", and "Dentist".

## Models

The app uses a mixture of regular expression matching and standard string searching and logic, as well as a Phi 3 mini model running in WebLLM with a fallback to a Phi 2 model running in wllama, and a final failsafe fallback mode in which keyword searches are used to retrieve data from the Wikipedia API. The implementation for these models and Wikipedia usage are the same as that used in the /chat-playground app in this repo. As with other apps in this repo, the app initially tries WebGPU with the Phi 3 model. If that fails, it used Phi 2 in webllm, and if that fails it uses the wikipedia mode. An initial "loading" page should be displayed on startup as the model is downloaded. After startup, the user can switch between all available models using the "..." menu at the top right of the app. Models that failed to load are shown as disabled in this menu, and when the user switches models, the user interface is disabled until the model is loaded and ready.

In addition to the language models, the app supports speech input and voice responses using the Web Speech API; with a fallback to using Vosk with the model in the /speech-model folder of this repo. Again, the implementation should be based on the /speech-playground app.

## Functionality

The app supports the following functionality:

- Chat with a model in the "New chat" page, including the ability to submit any prompt to the currently active model. The user's input is checked for "intent" keywords such as "email", "calendar", "meeting", "document", etc. to determine if the prompt should be sent to the mode as-entered, or the organizational data sources should be searched to find emails, documents, or meetings. The app supports the ability for the user to:
  - Retrieve a summary of all emails received from a specific person (e.g. "Matt" or "Anton") in a specified timeframe.
  - Retrieve a summary of past and future events in the user's calendar in a specified timeframe.
  - Retrieve a summary of documents that match a give criteria (e.g. documents that mention "Microsoft")

    Each summarized email, meeting, or document contains a link to open the item in a modal window, in which the source item is displayed in an appropriate format (i.e. an email, meeting, a contact record, a word processed document, or a table of data)

    If no "intent" keywords are detected, the prompt is sent to the active model and its response is displayed. If the Wikipedia failsafe solution is being used, search keywords are extracted from the user input and  stop-words removed, and the resulting search query is sent to Wikipedia to retrieve a suitable response (using the same implementation as /chat-playground)

- Search corporate information on the "Search" page. The user can enter a search string, which is then pre-processed to remove stop words and used to search the organizational data JSON indexes for documents and people (contacts).

- Use the "Researcher" agent on the "Researcher" page to generate a report based on a research topic. For example, the user might ask the agent to "Tell me about Microsoft Corporation". The initially responds (in a chat interface) by asking the user if they want a "comprehensive report" or a "summary", and then depending on the selection the prompt is submitted to the active model with the additional instruction "\n(Respond with a short summary)" appended if the user selected the summary option. The model's response is then displayed in the chat interface. When using the Wikipedia failsafe, if the user selects the "Summary" option; only the first sentence of the Wikipedia search result is displayed.

- Use the "Analyst" agent to analyze a file by selecting a document from the organizational data. In this app, only csv files containing tables of data can be analyzed, the analysis should consist of summing the columns of figures and displaying the results in the form:
  - ColumnName: 000.00
  - ColumnName: 000.00
    etc.

- Create a custom agent on the "Create Agent" page. In this application, the only supported custom agent is one that searches a specified website using the Bing.com "site:" filter. For example, the user might add the URL "www.microsoft.com" to the agent definition, and the resulting agent would be a chat interface in which the user enters a prompt, search keywords are extracted, stop-words removed, and the remaining terms are used to construct s Bing URL like "<https://www.bing.com/search?q=site%3A+microsoft.com+corporate+address>". The agent than returns a response like "I searched for 'corporate address' - here are the results: [search_url_link]"

In all pages that require a prompt or search query, the user can provide voice input by clicking the microphone icon and speaking.

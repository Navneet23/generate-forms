# Task 06 — Chat Panel

## Status
`Done`

## Description

Build the chat panel UI where the form creator types prompts, views the conversation history, and triggers AI generations. The chat panel is the primary interaction surface of the tool.

**Components:**

**1. Conversation history**
- Displays prior creator prompts and AI responses in a scrollable list
- Creator messages: right-aligned or distinctly styled
- AI responses: show a confirmation that a new form was generated (e.g. "Form updated — see preview") rather than displaying the raw HTML
- Scrolls to the latest message automatically after each exchange

**2. Input area**
- Text input field for the creator's prompt
- Send button (also triggered by pressing Enter)
- Disabled while an AI generation is in progress
- "Regenerate" button appears after each AI response — re-sends the last prompt without requiring the creator to retype it

**3. Loading state**
- While awaiting AI response: show a typing indicator in the conversation and disable the input field
- "Cancel" option to abort the in-flight request (nice to have)

**Behaviour:**
- On send: collect the prompt text, pass to the AI prompt layer (Task 04), clear the input field, show loading state
- On AI response: append to conversation history, trigger preview pane update (Task 05), re-enable input
- On error: show error inline in the conversation history, re-enable input so creator can retry

**Conversation history persistence:**
- Conversation is maintained in client-side state for the duration of the session
- Refreshing the page clears the session — no persistence required for MVP

**Implementation notes:**
- The chat panel and preview pane sit side by side; ensure the panel does not collapse on smaller screens in a way that makes either unusable
- Keep the input area anchored to the bottom of the panel regardless of conversation length

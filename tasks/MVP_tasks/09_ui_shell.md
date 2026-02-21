# Task 09 — UI Shell

## Status
`Done`

## Description

Build the overall page layout and application shell that ties all UI components together. This includes the URL input bar at the top, the two-panel layout (preview pane + chat panel), and the publish toolbar at the bottom.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  [Google Form URL input]                    [Load Form]      │
├─────────────────────────────┬────────────────────────────────┤
│                             │                                │
│      PREVIEW PANE           │        CHAT PANEL              │
│      (Task 05)              │        (Task 06)               │
│                             │                                │
│  [Desktop] [Mobile]         │  [Type a prompt...]  [Send]    │
├─────────────────────────────┴────────────────────────────────┤
│  [Publish]    Shareable URL: yourapp.com/f/abc123   [Copy]   │
└──────────────────────────────────────────────────────────────┘
```

**URL input bar:**
- Text input for the Google Form URL
- "Load Form" button triggers the scraper (Task 01) and loads the baseline preview (Task 03)
- Shows a loading state while scraping is in progress
- Shows an inline error if the URL is invalid or the form is not publicly accessible
- Once loaded, the input is locked — creator must reload the page to start with a different form

**Publish toolbar:**
- Sits at the bottom of the page, always visible
- "Publish" button is disabled until at least one AI generation has been completed
- After publish: displays the shareable URL with a "Copy" button
- "Copy" writes the URL to the clipboard and shows a brief "Copied!" confirmation

**Responsive behaviour:**
- On desktop: two-panel side-by-side layout
- On smaller screens: preview pane stacks above chat panel
- The layout must not break at common mobile widths (375px, 390px) even though the tool is primarily designed for desktop use

**Implementation notes:**
- The shell manages top-level application state: current form URL, scrape status, latest generated HTML, publish status, and shareable URL
- State is passed down to child components (preview pane, chat panel, publish toolbar) as needed
- No authentication, no user accounts, no session persistence across page refreshes for MVP

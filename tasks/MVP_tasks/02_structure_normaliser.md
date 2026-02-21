# Task 02 — Form Structure Normaliser

## Status
`Done`

## Description

Transform the raw parsed output from the Form Scraper (Task 01) into a clean, readable JSON schema that the rest of the system — the AI prompt layer and the submission proxy — can consume without needing to know the internals of Google's data format.

**Inputs:**
- Raw `FB_PUBLIC_LOAD_DATA_` parsed JSON from Task 01

**Outputs:**
- Normalised form structure in a defined schema (see below)

**Target schema:**

```json
{
  "formId": "1FAIpQLSxxxxxxxx",
  "title": "Team Feedback Survey",
  "description": "Please fill this out by Friday.",
  "questions": [
    {
      "id": "q1",
      "entryId": "entry.1234567890",
      "text": "What is your name?",
      "type": "short_answer",
      "required": true,
      "options": []
    },
    {
      "id": "q2",
      "entryId": "entry.9876543210",
      "text": "Pick a colour",
      "type": "multiple_choice",
      "required": false,
      "options": ["Red", "Blue", "Green"]
    }
  ],
  "sections": []
}
```

**Type mapping from Google codes:**

| Google Code | Normalised Type |
|---|---|
| 0 | `short_answer` |
| 1 | `paragraph` |
| 2 | `multiple_choice` |
| 3 | `checkboxes` |
| 4 | `dropdown` |
| 5 | `linear_scale` |
| 9 | `date` |
| 10 | `time` |

**Implementation notes:**
- Unsupported question types (grids, file upload) should be excluded from the output with a warning logged — do not fail the whole scrape
- `entryId` values (e.g. `entry.1234567890`) are critical — they are used by the submission proxy (Task 07) to route responses back to Google Forms
- Keep the normalised schema stable even if the scraper implementation changes — the rest of the system depends on this contract

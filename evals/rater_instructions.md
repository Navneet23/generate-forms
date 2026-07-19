[Forms Canvas] HE Template - Competitive Evals
Last updated: Jun 8, 2026 | Initial template creation bug: (template)
General instructions
[mostly rating responder/preview view; but will also see the prompt]
In this task, you will be evaluating two interactive forms generated based on a user prompt, a Google Form and optionally a style guide. 
We will provide raters the following for each item to be evaluated: a prompt, the Google Form used to generate the new design of the form, optionally a style guide and a link to the generated canvas. The style guide is an image used to augment prompt. 

The rater should only be using the provided links to the generated canvases for rating purposes 
The evaluation is broken down into four distinct dimensions, stack-ranked by priority: Functionality & stability, groundedness, completeness & instruction following, and visual aesthetics & layout. Additionally, raters will be asked to check canvases for a set list of failure modes, selecting all modes that apply to each canvas.

Dimension 1: Functionality & stability
Does the generated form still work? Is it robust, or does it break under stress while responding?
Detailed functionality checklist (Forms equivalent)
Navigation has to work
Submit has to work
1A. Model A rating
No Issues: The form is bulletproof. All interactions work perfectly.
Minor Issue(s): Functional but slightly buggy.
Examples: The UI gives no visual feedback after the user selects a button, or the size of the form is disproportionately small relative to the screen
Major Issue(s): Core UI elements are broken or have severely impaired functionality
Examples: e.g. Next Button is not working, or form submission is not working.
Critical Failure: Unusable.
Examples: Form shows a blank white screen; app crashes/freezes immediately upon clicking anything.
N/A: No interactive elements present.
1B. Model B rating
No Issues: The form is bulletproof. All interactions work perfectly.
Minor Issue(s): Functional but slightly buggy.
Major Issue(s): Core UI elements are broken or have severely impaired functionality
Critical Failure: Unusable.
N/A: No interactive elements present.
1C.Comparison
Which model produced a more robust, working, grounded app?
Options: Model A is Much Better ... Model B is Much Better (1-7 Scale)
Dimension 2: Groundedness
Groundedness checklist
Question types should remain the same
Form title should remain the same
Question phrasing and answer options should remain the same
[Very minor]: Placeholder text changed or doesn’t match (e.g. Your name), or the placeholder text is not related to the question
Notices at bottom should be available and similar to original Form
These notices include “Never submit passwords through Google Forms”
The Google Forms logo
Required question validation: Questions that were marked as required in the original form, should also be required in the generated form.
Model Rating
Not grounded: At least one piece of important information in the response is incorrect or inconsistent. 
Reasonably grounded: Important information in the response is correct or consistent, based on the retrieved items. However, the response includes minor inconsistencies or errors that are not essential to answering the prompt.
Completely grounded: All information in the response is correct and consistent, based on the retrieved items.
[Do we want to a minor issues thing, just so users can note the placeholder thing]
Dimension 3: Completeness & Instruction following
Did the response follow the specific commands in the prompt (explicit and implicit)?
Instructions:
Focus strictly on whether the model built the correct thing based on the prompt and the style guide, if included. The style guide is an image that is shared by the form creator who is looking to redesign the form.  
Styling requests: Did it follow specific design instructions? (e.g., "Make the [background color] blue", “create a form with a similar layout”. “Use the colors of this brand image to create a new form”).
Negative constraints: Did it avoid things the user said not to do? (e.g., "Do not show [XXX]).

Forms specific callouts:
[Matching the style guide]



2A. Model A rating
No Issues: Followed all instructions perfectly.
Minor Issue(s): Missed small details (e.g., wrong shade of blue, generic title).
Major Issue(s): Missed key requirements [e.g. user asks the form to the question by question, i.e. different pages for each question, but it is returning a survey that has all the question on one page]
2B. Model B rating
No Issues: Followed all instructions perfectly.
Minor Issue(s): Missed small details.
Major Issue(s): Missed key requirements.
2C. Comparison
Which model better followed the provided instructions?
Options: Model A is Much Better ... Model B is Much Better (1-7 Scale)

Dimension 4: Visual aesthetics & layout
Does the Form look professional, readable, and well-designed?
Instructions: Evaluate the UI/UX quality.
Visual Legibility: Check that all data and text is visible 
Text legibility: Check that all text is of a readable size, and has sufficient color contrast. 
Container and text boundary control: Check if text is overflowing a container. Verify no text is clipped in a container, without indicating overflow.
[Layout Scaling] Does the visual look good on both desktop and mobile. And does it transition the same design, as screen size gets smaller.  
Typography: Check for text overlap. Are fonts cut off? Is the font size readable? Do headers overlap with body text?
Color & styling: Do colors clash? Is there sufficient contrast?
Assets: Are the header and background images (if generated) relevant to the form and prompt?
Style cohesion: Are the different elements of the generated form cohesive (font, color, layout)?

3A. Model A rating
No Issues: Professional design. Clean layout, no overlap, harmonious colors and cohesive style.
Minor Issue(s): Small visual flaws (e.g., inconsistent padding, icon slightly misaligned).
Major Issue(s): Visually broken.
Examples: Text legibility (overlapping text; Color (clashing colors)).
N/A: Cannot assess.
3B. Model B rating
No Issues: Professional design. Clean layout, no overlap, harmonious colors.
Minor Issue(s): Small visual flaws.
Major Issue(s): Visually broken.
N/A: Cannot assess.
3C. Comparison
Which model produced a better looking, more professional canvas?
Options: Model A is Much Better ... Model B is Much Better (1-7 Scale)

Failure Modes
For every output, raters should also check for the following failure modes. One output can have none or multiple failure modes:
General
Model Punt: The model response is a punt (e.g., you are not able to see a Form)
Dimension 1: Functionality & stability
Responding to the form
Submission of response: Submission of response does not work.
Navigation between questions: Navigation from one question to another (if required as part of generated form works)
Visual feedback on selecting answer options: There should be some visual feedback to responders when you select an answer option.
Dimension 2: Groundedness
Basic Display & Loading
Blank or Error Screen: The screen is completely blank white, just says "No Data," or shows a technical error message.
Stuck Loading: The screen is stuck on a spinning wheel or says "Loading...".  
Placeholder: either changes it from the default or doesn’t match the question
Question content
Question text matches the original form: The question text for all questions matches the original form.
Question type matches the original form: The question type for all questions matches the question type for all questions in the original form.
Required questions: The questions that were marked as required in original form, remain required.
Answer options: The answer options in the generated form match the original form.
Missing Information
Missing Requested Features: Things the user specifically asked for (like [XXX] or [XXX]) are completely missing.
Missing notices at the bottom of the form: The original form has some notices like “Never submit passwords”, which should be also available in the new form.
Missing Google Forms logo: The generated form should still have the Google Forms logo.
Dimension 3: Completeness / Instruction Following
Not Following Instructions
Wrong Output Format: The model built the wrong layout type entirely from what was mentioned in the form or style guide. (generating question by question layout instead of single page layout where all questions are in same page)
Over-Complicating: The model did way too much  
Ignored Specific Rules: The model failed to follow explicit instructions regarding structural details (e.g., Did not include colors themes from the image shared as style guide)
Dimension 4a: Visual Aesthetics
Visual Hierarchy & Scannability
Confusing Emphasis: Bold text, large fonts, or bright colors are used randomly, making the form look messy rather than actually highlighting important details.
Visual Clutter, Layout, & Efficiency
Hero images not related to form or prompt: Images added to form are not related to the form content or prompt or have unrelated text in it that is confusing.
Distracting Backgrounds: A background image or color actively hides the foreground content or makes the data placed on top of it hard to read.
Mismatched Style: If the user provided a reference style guide or asked for a specific design, the generated form completely fails to match that requested style.
Colors & Contrast
Hard to Read (Bad Contrast): The text colors and background colors blend together, making it difficult to read (e.g., yellow text on a white background).
Unprofessional Palette: The colors are overwhelmingly garish, clashing, or actively distracting from the text and not related to prompts given by the user..
Text Styling & Typography
Unreadable Fonts: The text uses fonts that are physically hard to read or look completely inappropriate for a professional form..
Inconsistent Styling: Text formatting changes randomly across the canvas (for example, using totally different fonts or text sizes for similar task cards or widgets).
Dimension 4b: Visual Legibility
Content Overflow & Clipping
Content Spilling Out: Text or images are spilling outside of their designated boxes or borders.
Cut-Off Content: Words or pictures are chopped off at the edges without a "..." or a way to zoom in. (Note: It is okay if there is a scrollbar that lets the user scroll to see the rest).
Overall Structure
Improper Scaling for narrow and wide screens:  The generated form does not work well for narrow screens with critical information in the form (title, questions, answer options not being legible)
Final overall comparison
Taking all four dimensions into account, which response is better?
Options: Model A is Much Better ... Model B is Much Better (1-7 Scale)
Instructions: You should select the response that would be more helpful to the user. This is mainly a function of how functional the app is and how well it followed instructions. In general: 
Dimension (1) functionality & stability should be the primary consideration
Dimension (2) of groundedness to the source data should be secondary.
Dimension (3) of completeness & instruction following should be tertiary.
Dimension (4) of aesthetics should be prioritized lowest. [I think we want this higher]
There may be scenarios where this is not necessarily the case. Use your best judgment. 
Explanation (Required):
Briefly explain your choice. Mention which "Dimension" was the deciding factor.
Example: "Model A is much better. Although Model B followed the design instructions well (Dimension 3), it failed the functionality test (Dimension 1) because the generated form, could not be filled out as it did not have a way to navigate between questions”














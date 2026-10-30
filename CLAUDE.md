# CLAUDE.md

## Tech Stack

- Plain HTML, CSS, and JavaScript only.
- No frameworks, no build step. Files are opened and served as written.

## Project Structure

The repository is nearly empty for now. As it grows, keep things simple:

- `index.html` at the top level is the entry page.
- `css/` for stylesheets, `js/` for scripts, `images/` for images (create these folders only when needed).

## Key Requirements

1. Every page must be responsive and work on desktop, tablet, and phone.
2. Users can toggle between a light and a dark theme. The default is the light theme.
3. Text must stay easy to read, with good contrast, in both the light and the dark theme.

## Feature Plan

A portal where beginners learning robotics try small web tools.

### Portal structure

- **Homepage** (`index.html`): header with the theme toggle, a short intro, and one card per tool.
- **Opening a tool:** click its card to open the tool's own page, `tools/<tool-name>.html`.
- **Getting back:** every tool page has a "Back to all tools" link at the top, and the site name in the header also links home.
- **Adding a new tool later:** create `tools/<tool-name>.html` (with its own CSS/JS files named after it), then add one card to the homepage. Reuse the shared files; don't copy them.

### Phases

- **Phase 1:** the portal plus its first tool, a robot arm picker simulator. Visitors move each joint with sliders and try to grab a block.
- **Phase 2:** add more tools, one at a time. (Details to be decided later.)
- **Phase 3:** polish, such as a way to find tools once there are many. (To be decided later.)

## Rules for Claude

- Explain technical terms in plain language.
- Ask before making big changes.
- Ask rather than guess when something is unclear.

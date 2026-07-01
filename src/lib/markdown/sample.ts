// Seeded into the editor on a first visit (empty storage) so the preview shows
// something immediately and advertises what the tool can render: headings,
// lists, a GFM table, a task list, a fenced code block, and a mermaid diagram.
// Fully editable and erasable — once the user clears it, we persist the empty
// document and never re-seed.
export const SAMPLE_MARKDOWN = `# Markdown Preview

Type **Markdown** on the left and watch it render live on the right.
Everything runs on your device — nothing is uploaded.

## Features

- GitHub-flavored Markdown
- ~~Strikethrough~~, autolinks like https://tanstack.com
- Task lists:
  - [x] Live preview
  - [ ] Your turn

## Table

| Tool          | Runs where   |
| ------------- | ------------ |
| Converter     | Your browser |
| Diff Viewer   | Your browser |
| Markdown      | Your browser |

## Code

\`\`\`ts
const greeting: string = "hello, palico";
console.log(greeting);
\`\`\`

## Diagram

\`\`\`mermaid
graph TD;
  A[Type Markdown] --> B{Live preview};
  B --> C[Rendered HTML];
  B --> D[Mermaid diagrams];
\`\`\`
`;

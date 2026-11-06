import { m } from "#/paraglide/messages.js";

// Seeded into the editor on a first visit (empty storage) so the preview shows
// something immediately and advertises what the tool can render: headings,
// lists, a GFM table, a task list, a fenced code block, and a mermaid diagram.
// Fully editable and erasable. Once the user clears it, we persist the empty
// document and never re-seed. A function, because the prose follows the active
// language; the code and the diagram keep their own syntax.
export const sampleMarkdown = (): string => `# ${m.markdown_sample_title()}

${m.markdown_sample_intro()}

## ${m.markdown_sample_features()}

- ${m.markdown_sample_gfm()}
- ${m.markdown_sample_strike()}
- ${m.markdown_sample_tasks()}
  - [x] ${m.markdown_sample_task_done()}
  - [ ] ${m.markdown_sample_task_todo()}

## ${m.markdown_sample_table()}

| ${m.markdown_sample_col_tool()} | ${m.markdown_sample_col_where()} |
| ------------- | ------------ |
| ${m.markdown_sample_row_converter()} | ${m.markdown_sample_where()} |
| ${m.markdown_sample_row_diff()} | ${m.markdown_sample_where()} |
| Markdown | ${m.markdown_sample_where()} |

## ${m.markdown_sample_code()}

\`\`\`ts
const greeting: string = "hello, palico";
console.log(greeting);
\`\`\`

## ${m.markdown_sample_diagram()}

\`\`\`mermaid
graph TD;
  A[${m.markdown_sample_node_type()}] --> B{${m.markdown_sample_node_live()}};
  B --> C[${m.markdown_sample_node_html()}];
  B --> D[${m.markdown_sample_node_mermaid()}];
\`\`\`
`;

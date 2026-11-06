# JSON, YAML and CSV converter

Status: shipped. `/json-converter` formats, validates and converts between JSON,
YAML and CSV. It runs on the device and works offline. It sits in the Developer
category next to Markdown preview and the diff viewer.

People arrive with a blob from an API response, a config file or a spreadsheet
export and want it in another shape. The page should answer "is this valid, and
what does it look like in the other format?" without a form to fill in.

## Flow

1. Two panes: input on the left, output on the right. Below 768px they stack and
   the output sits under the input.
2. **Input** is a text area. The whole input card is the drop target for
   `.json`, `.yaml`, `.yml`, `.csv`, `.tsv` and `.txt`, and an **Open file**
   button is the click and keyboard way in. The format is detected from the
   content (and the file extension for a loaded file, until the text is edited).
   A segmented control (Auto, JSON, YAML, CSV) overrides the guess, and a line
   under it says which format is being read and whether it was detected.
3. **Output** has a target segment (JSON, YAML, CSV) and, for JSON, an indent
   control (2 spaces, 4 spaces, tab, minified). Copy and Download buttons sit in
   the pane header. Until the person picks a target, it follows the source:
   JSON becomes YAML, YAML and CSV become JSON. Output past 200,000 characters
   is previewed (the page says so); Copy and Download always use all of it.
4. An invalid input replaces the output with the error and the line and column at
   fault, plus a **Go to line** button that selects the spot in the input. The
   input keeps its text, so the person can fix it in place. When the format was
   detected, the panel also says so, since a wrong guess is the likely cause.
5. A **Sort keys** toggle and a **Minify** action cover the two most common
   cleanups without a second page. Minify is a pressed-state button: it switches
   the target to minified JSON, and pressing it again goes back to 2 spaces.

## Rules the conversion follows

- JSON to CSV needs an array of flat objects. Nested values are flattened with a
  dotted path (`user.name`). Anything that cannot become a table (a top-level
  object, mixed shapes) gets a message that says why, not an empty result.
- CSV to JSON reads the first row as headers. A **Guess types** toggle (off by
  default, so every cell stays a string) turns numbers, `true`/`false` and `null`
  into values. Even with it on, a cell with leading zeros (`007`, a ZIP code) and
  an integer past 2^53 stay text, because those would lose something. Empty and
  repeated headers become `column_N` and `name_2`. A row with more cells than the
  header is an error with its line.
- The delimiter (comma, semicolon, tab) is detected and can be overridden.
- YAML output uses the safe schema only. Anchors and custom tags in YAML input
  are rejected with a message, not executed.
- Large numbers survive: integers past `Number.MAX_SAFE_INTEGER` are read as
  `bigint` and written back as the same digits (still a number, not a string),
  in JSON, YAML and CSV. `JSON.parse` would round them, so the JSON reader is
  our own (`json.ts`). It also gives exact line and column and plain-language
  reasons for the usual mistakes (single quotes, comments, trailing commas).
- A leading byte order mark is dropped. Text past 25 million characters is
  refused with `InputTooLargeError`.
- A top-level object that holds one list of objects gets a message naming that
  list. Two fields that flatten to one column (`a.b` and `a` > `b`) are refused.

## Where the work runs

Parsing and serialising run in a web worker (`src/workers/json-converter.worker.ts`)
so a 20 MB file does not freeze the page. Text under 200,000 characters skips the
worker and converts on the page, through a dynamic import so `yaml` stays out of
the page's own bundle. The worker is created per run and ends with it, so a stale
run is interrupted and costs nothing. Long text waits 250 ms for a pause in typing.
The business logic lives in `src/lib/json-converter/` (`convert.ts` is the whole
pipeline), not in the component.

Every failure is a tagged error on the Effect error channel: `ParseError` (with
line and column), `NotATableError` (JSON that cannot become CSV),
`InputTooLargeError` and, from the client, `ConverterWorkerError`. A tagged error
does not survive `postMessage`, so the worker sends it as plain data
(`protocol.ts`) and the client rebuilds it.

### Why the core cannot import messages

Vite's worker build has no Paraglide plugin, so a worker that imports `m` (even
through another module) fails `vite build` with an unresolved
`virtual:paraglide/...` import. Dev and tests do not catch it. The core therefore
never imports `m`: the page builds one template per error in the active language
(`texts.ts`, `{name}` holes left in), passes them in `ConvertOptions.texts`, and
the core fills them with `say` (`say.ts`). `say.ts` and everything the worker
imports must stay free of `#/paraglide`. YAML syntax errors carry the `yaml`
package's own English detail inside a translated sentence.

## Dependencies to decide

- YAML: `yaml` 2.9.0, already in the lockfile through other tools and now a direct
  dependency. It runs on the core schema only. In the build it is its own 10 KB
  chunk (2.3 KB gzip) on the page, and part of the worker. Anchors, aliases and any
  tag outside the plain YAML ones are refused, and a file with more than one
  document is refused.
- CSV: hand-written (`csv.ts`), no dependency.

## Mobile

44px targets below `sm`, inputs at 16px or larger so iOS does not zoom, and the
output pane folds away below 768px (a chevron in its header) so the keyboard does
not hide the input. The segmented control (`src/components/segmented-control.tsx`)
is the cron generator's pill pattern made reusable. Motion is limited to that pill
sliding, the chevron turning and the drag-over border, all transform, opacity or
colour, each with a reduced-motion version.

## Tests

All in `src/lib/json-converter/*.test.ts`:

- Round trips for each pair of formats (`convert.test.ts`).
- Quoted CSV cells with commas and newlines, delimiters, type guessing, ragged
  rows and unclosed quotes (`csv.test.ts`).
- Big integers, empty arrays, `null`, unicode and a BOM at the start of a file.
- Error line and column for malformed JSON, YAML and CSV, in English and
  Indonesian (`json.test.ts`, `yaml.test.ts`).
- Format detection and file extensions (`detect.test.ts`).

## Also needed

Done: the `json_converter` entry in `src/lib/tool-categories.ts` (with keywords),
the `tool_json_converter_*` and `jc_*` keys in both catalogs, the route, the
sitemap entry and a line in `CLAUDE.md`.

Not done: the page has not been checked in a browser yet, and the tool has no
mascot empty state (the output pane uses an icon).

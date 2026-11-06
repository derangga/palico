# Cron generator

`/cron-generator` builds a five-field cron expression, says in plain English what
it means, and lists the next times it runs. It runs on the device and works
offline. There is no cron dependency.

It is the first tool in the Developer category, next to Markdown preview and the
diff viewer. Cron is knowledge most people never need, so the page asks "how
often?" and shows the syntax as a result, not as a form to learn. The plain-English
line is the thing to steer by.

## Flow

1. The page opens on `0 9 * * 1-5` (weekdays at 9:00), so the sentence and the
   run list show something real before anyone types.
2. **Result.** A card at the top holds the plain-English sentence, the
   expression as five labelled cells (Minute, Hour, Day, Month, Weekday), a
   Copy button and an "Edit as text" button. The cells only display the
   expression. Nothing on the page edits it from there. An invalid expression
   replaces the sentence with the error and a red icon, and marks the cell of
   the field at fault. Copy shows only for a valid expression.
3. **Builder.** Below the result, a segmented control picks how often: Minutes,
   Hourly, Daily, Weekly or Monthly. Each mode shows only the controls it needs:
   minute chips, an "at which minute" chip, an hour select and a minute select,
   seven day toggles, a day-of-month select. The pill under the segments slides with a transform.
4. **Edit as text.** The button swaps the builder for one input in the same
   card, so the page never has two editors on screen. The input keeps what was
   typed, so `@daily` is not rewritten under the cursor. Enter or leaving the
   input settles it: a valid expression becomes the five fields written out
   (`@daily` becomes `0 0 * * *`) and an invalid one stays so the error has
   something to point at. The cell for the field the caret is in is ringed, and a
   line under the input gives that field's range. On touch devices a row of keys
   (`* , - /` and space) sits under the input, because those characters are slow
   to find on a phone keyboard. The row is hidden for a fine pointer. A
   "What do the symbols mean?" disclosure holds the syntax table.
5. **Templates.** A Templates button in the card header opens a bottom sheet
   below 768px and a popover above it. It lists eight schedules in four groups
   with the expression on the right. Picking one loads it and returns to the
   builder.
6. **Next runs.** The next eight runs, each with the time and a relative
   "in 3 hours". A toggle switches between the visitor's time zone and UTC.

## One expression, two views

The expression string is the only copy of the schedule. The builder and the text
input both read it and write it.

`src/lib/cron/builder.ts` does the translation. `builderFromSchedule` turns a
parsed schedule into the form model, and `expressionFromBuilder` writes the
model back. It accepts only the shapes the form can show:

- `*` or `*/N` for minutes, with every other field `*`.
- One minute and every other field `*` for hourly.
- One minute and one hour for daily, weekly (weekdays as values, ranges or
  names, with no step) and monthly (one day of the month).
- Month is always `*`.

Anything else, such as `0-30/5 9-17 * * *` or `0 9,17 * * *`, returns
undefined. The builder then shows a notice and no mode is selected. The text
editor still takes it, and so does the description and the run list.

The page keeps the model in its own state, next to the expression, and only
re-reads it when the expression changes from outside the builder (a template, or
typing). Without that, a weekly schedule with all seven days ticked would be
written as `*`, read back as daily, and the segment would jump under the
person's finger. Switching mode keeps the other fields, so Hourly at :30 becomes
Daily at 09:30 and not a reset.

`expressionFromBuilder` writes a run of three or more weekdays as a range
(`1-5`) and shorter runs as a list (`1,2`). Seven days become `*`.

While the text is not a valid expression there is no model, so going back to the
builder shows the same notice until the text is fixed or a mode is picked. The
page also remembers the last schedule the form could show and uses it as the
base for the next one, so a half-written field does not reset the chosen days or
day of the month.

## Mobile

The page was reworked for a 375px screen first:

- Every target is 44px tall below `sm`: segments, chips, inputs, the
  Templates button, the symbol keys, the symbol-help summary and the copy and
  edit buttons. The seven day toggles share one row, so they are 44px tall and
  about 39px wide on a 375px screen.
- Inputs are 16px or larger so iOS does not zoom on focus. The shared `Input`
  drops to 14px at `md`, so the expression input repeats its size at `md` too,
  or an iPad in portrait would zoom. The selects use `text-base` at every width.
- The day toggles are two-letter labels with the full name for screen readers.
  The only ticked day is disabled and a line says why, so a tap never does
  nothing without a reason.
- The time is two Base UI selects in a fieldset, hour (00 to 23) and minute
  (00 to 59), and the day of the month is a select too. A native `type="time"`
  or `<select>` opens a browser popup that CSS cannot style, so it clashed with
  the theme. The cost is that phones no longer get the OS time wheel, and the
  minute list has 60 items. Typing on an open list jumps to a match. A select
  always holds a whole value, so there is no draft state.
- The templates list is a bottom sheet, not a wrapping row of pills.
- The sentence is a live region only while it holds a valid sentence. An error
  changes on almost every keystroke, so it is not announced, and the input points
  at it with `aria-describedby`.

## What the parser accepts

`src/lib/cron/schedule.ts` reads the standard five fields:

- `*`, lists (`1,15`), ranges (`1-5`) and steps (`*/10`, `0-30/5`, `5/15`).
- Month names (`JAN`) and weekday names (`MON`), in any case.
- `7` as Sunday, folded into `0`.
- The macros `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`,
  `@midnight` and `@hourly`.

It rejects six and seven field expressions with a message that names the extra
fields, since those belong to Quartz and other schedulers that this tool does
not model. `@reboot` has no schedule, so it gets its own message.

Every failure is a `CronSyntaxError` on the Effect error channel. It carries the
field at fault when there is one.

When both day of month and day of week are restricted, a day matches if either
one does. That is how Vixie cron works and it surprises people, so the page says
so in the text editor's symbol help. If either of the two starts with `*`, both must match.

## How the next runs are found

`nextRun` (`src/lib/cron/next-runs.ts`) starts one minute after the given time and
moves forward by the largest unit that does not match: a month, then a day, then an
hour, then a minute. A yearly schedule takes a few dozen steps and not half a
million. It gives up after nine years, which covers the eight-year gap around a
skipped leap day (`0 0 29 2 *` after 2096). A schedule like `0 0 31 2 *` never
runs, and the page says so.

Local time uses the `Date` getters and UTC uses the `getUTC*` ones. A daylight
saving change can make a rebuilt local time land on or before the current one, so
every jump falls back to a plain step if it did not move forward. The search always
ends.

## Why the clock is read after hydration

The visitor's time zone and current time do not exist on the server. The page reads
the time with `useSyncExternalStore` (`src/hooks/use-minute-clock.ts`), whose
server snapshot is `undefined`. The server renders no run times and the browser
fills them in. Rendering them on the server would show the server's time zone and
fail hydration.

## Description wording

`describeSchedule` (`src/lib/cron/describe.ts`) covers the common shapes: every
minute, every N minutes, hourly, clock times, weekdays, days of the month with
ordinals, months, and a working-hours window. Up to six clock times are written
out (`At 08:30, 12:30 and 18:30`). Past that it falls back to a list of minutes and
hours. The tests in `describe.test.ts` hold the exact sentences.

## Tests

- `schedule.test.ts`: every accepted form, every field error, macros, weekday 7,
  and `splitFields`.
- `next-runs.test.ts`: rollover, leap days, either-day matching, a schedule that
  never runs. All use UTC, so the result does not depend on the machine.
- `describe.test.ts`: the sentence for each shape.
- `format.test.ts`: relative time wording.
- `field-labels.test.ts`: which field the text caret is in.
- `builder.test.ts`: every shape the form reads, the shapes it refuses, the
  expression it writes for each mode, and a round trip of both.

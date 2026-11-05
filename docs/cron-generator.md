# Cron generator

`/cron-generator` builds a five-field cron expression, says in plain English what
it means, and lists the next times it runs. It runs on the device and works
offline. There is no cron dependency.

It is the first tool in the Developer category, next to Markdown preview and the
diff viewer. Cron is knowledge most people never need, so the page leans on presets and on the plain-English line
more than on the syntax.

## Flow

1. The page opens on `0 9 * * 1-5` (weekdays at 9:00), so the description and the
   run list show something real before anyone types.
2. **Expression box.** The box holds the whole expression. `parseCron` reads it
   on every keystroke. A valid value shows its description. An invalid one shows
   the error, with a red icon, in place of the description. The box keeps what was
   typed (a `draft`), so typing `@daily` is not rewritten under the cursor. Enter
   or leaving the box settles it: a valid expression becomes the five fields
   written out (`@daily` becomes `0 0 * * *`), and an invalid one stays so the
   error has something to point at.
3. **Fields.** Five inputs (minute, hour, day of month, month, day of week) show
   the parts of the expression. Typing in one rewrites the box. Spaces are
   dropped, because a space would turn one field into two. The field named by the
   error is marked invalid.
4. **Presets.** A preset fills the five fields. The preset that matches the
   current expression is pressed.
5. **Next runs.** The next eight runs, each with the time and a relative
   "in 3 hours". A toggle switches between the visitor's time zone and UTC.
6. **Copy.** The copy button appears only for a valid expression.

A box that does not hold five fields leaves the field inputs as they were, so
the inputs do not empty while someone types the third field.

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
so under the field inputs. If either of the two starts with `*`, both must match.

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

- `schedule.test.ts`: every accepted form, every field error, macros, weekday 7.
- `next-runs.test.ts`: rollover, leap days, either-day matching, a schedule that
  never runs. All use UTC, so the result does not depend on the machine.
- `describe.test.ts`: the sentence for each shape.
- `format.test.ts`: relative time wording.

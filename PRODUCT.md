# Product

## Register

product

## Users

Everyday, mostly non-technical people who need to convert or resize an image
quickly and don't want to upload personal files to an unknown server. They
arrive with a single concrete job ("turn this HEIC into a JPG", "shrink this
photo for the form") and want it done in a few clicks, on their own device,
often without a reliable connection. They are privacy-conscious and wary of
the typical free converter site.

## Product Purpose

palico is an offline-first image toolkit that runs entirely in the browser
(web workers, no server round-trip). Today it offers an image **converter**
and an image **resizer**, framed as "Your Daily Offline Toolkit." Files never
leave the device. Success means a user completes their task faster than the
ad-laden alternatives, trusts that nothing was uploaded, and comes back the
next time they need a quick image fix.

## Brand Personality

A friendly, characterful daily companion, not a piece of enterprise software.
Three words: **friendly, trustworthy, playful**. The Catppuccin look (Latte by
day, Mocha by night), a single typographic voice (Nunito, leaning on weight and
scale for emphasis) and the mascot are part of the identity. The mascot is
Palico, a chibi cat adventurer with a hammer, who appears at rare moments such
as the home hero, the sidebar logo and the favicon. The personality is
approachable and fun without being childish, and confident without being cold.

## Anti-references

- **Ad-heavy converter sites** (online-convert.com and kin): banner ads,
  upload-to-server flows, popups, fake or disguised download buttons, dark
  patterns. palico is the trustworthy opposite.
- **Cold enterprise SaaS**: generic dashboard chrome, navy-and-gray, soulless
  density. palico has friendliness and personality.
- **Motion that gets in the way of the task**: animation on frequent actions,
  loops outside the home page, effects that delay a click or distract from the
  file in front of you. Playfulness is for rare moments, never for the work.

## Design Principles

- **Privacy is visible, not just claimed.** The offline, on-device guarantee is
  a first-class part of the interface, reinforced where it matters (not buried
  in fine print).
- **One job, few clicks.** Each tool gets the user from input to result with
  minimal decisions. Defaults are sensible; advanced options stay out of the
  way until wanted.
- **Delight in rare moments, calm in frequent ones.** The home hero, empty
  states and finished jobs can be playful. Navigation, buttons and inputs stay
  quick and quiet. Colour and motion are spent where people look rarely, not
  where they click hundreds of times.
- **Trustworthy by feel.** No dark patterns, no fake buttons, no ambiguity
  about what happens to a file. Status colours mean what they say (green is
  done, red is an error), so every interaction reinforces that this is safe.
- **The tool disappears into the task.** Standard affordances for standard
  actions; personality is reserved for moments.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: body text 4.5:1 or better (in Latte only Mauve, Red and
large Blue can carry text; other accents are fills, tints and icons), visible
keyboard focus states, full keyboard operability for file selection and all
controls, and a `prefers-reduced-motion` alternative for every animation.
Drag-and-drop must have a keyboard and click-accessible equivalent. See
`DESIGN.md` for the contrast table.

# JWT decoder

Status: shipped. `/jwt-decoder` splits a JSON Web Token into its header, payload
and signature, shows the claims in plain language, and optionally checks the
signature. It runs on the device and works offline. It sits in the Developer
category.

This is the strongest fit for the product promise. People paste real session
tokens into online decoders, and a token is a credential. Here it never leaves
the browser, and the page says so under the input.

## Flow

1. One text area labelled "Paste a token". Decoding happens as you type, with no
   button. A pasted `Authorization: Bearer ...` header, quotes around the token
   and line breaks inside it are removed first.
2. Under the text area the token is drawn again in three parts (header, payload,
   signature), each with its own tint. Hovering or tapping a part highlights the
   matching card, and hovering a card highlights its part. The text area stays
   plain, because colouring text inside a `<textarea>` needs an overlay that
   drifts on scroll, wrapping and IME input. The drawn copy is `aria-hidden`.
3. **Header** and **Payload** cards show pretty-printed JSON with a Copy button.
4. A **Claims** card reads the registered claims for people:
   - `exp`, `nbf` and `iat` as a date in the visitor's time zone and in UTC, to
     the second, with a relative note ("Expired 3 hours ago", "Expires in 12
     minutes").
   - `iss`, `sub`, `aud` and `jti` as plain rows. An `aud` list gets one line per
     item.
   - A status chip at the top: Valid window, Expired, Not yet valid, or No time
     limit when the token has neither `exp` nor `nbf`. An `exp` or `nbf` that is
     there but unreadable (a string, a number past the range of a date) gives
     "Time limit unreadable", never "No time limit".
5. **Verify signature** is a collapsed card. Its chip is always visible, so the
   state of the check is never hidden. For HS256, HS384 and HS512 the person
   enters the secret (with a "Base64 encoded" checkbox and a show/hide toggle).
   The checkbox accepts either Base64 alphabet, with or without padding.
   For RS, PS and ES at 256, 384 and 512 they paste a PEM public key, a JWK or a
   JWKS. The result is Signature verified or Signature not verified.
6. **Try an example** fills a token signed with the secret `palico-demo`. It is
   built and signed with Web Crypto when the button is pressed (`example.ts`), from
   readable JSON, so no token literal sits in the source and secret scanners have
   nothing to flag. Its `exp` is in 2100, so the example never opens expired. **Clear** forgets the
   token, the secret and the key.

## Decisions

- **Decode is not verify.** Without a key the chip says "Signature not checked".
  Green appears only for a signature that was checked and matched. The time
  window chip is never green (Valid window is the info colour, Expired and Not yet
  valid are warnings), because a token inside its window with a forged signature
  is still forged.
- **Verified does not mean valid.** The success message says it does not check the
  expiry or who issued the token.
- `alg: none` (in any capitalisation, since libraries were attacked with `nOnE`)
  is flagged with a warning and offers no key field. A token with no signature
  proves nothing.
- **The key field follows the algorithm.** An HS token only gets a secret field.
  An RS, PS or ES token only gets a public key field. The two never mix, so a
  public key cannot be used as an HMAC secret (the algorithm confusion attack),
  and `verifyToken` rejects the mix itself with an `InvalidKeyError` before any
  key is imported, so it does not depend on Web Crypto refusing the wrong key type.
- Verification uses Web Crypto (`crypto.subtle`), so there is no JWT library.
  EdDSA, ES256K and anything else is reported as unsupported, with the list of
  what is supported. A token with no `alg` says so.
- **Keys.** A PEM must be a `BEGIN PUBLIC KEY` (SPKI) block. A JWKS picks the key
  by the token's `kid`, or uses its only key when the token has no `kid`. A private
  key or a JWK with private fields is refused and the message says not to paste
  it. A PKCS#1 `BEGIN RSA PUBLIC KEY` and an X.509 certificate are refused with the
  `openssl` command that converts them, since parsing them would mean writing an
  ASN.1 reader. PEMs pasted with literal `\n` are fixed.
- **Time.** `exp` is the first moment the token must not be accepted, so
  `now >= exp` is expired (RFC 7519). `nbf` is the first moment it may be
  accepted. There is no clock leeway. A time claim that is not a number, or is out
  of the range of a `Date`, is shown as written with a note and does not fail the
  page. Relative text rounds toward zero, so it never promises more time.
- **The clock.** `useTokenClock` reports whole seconds, rounded down, within 90
  seconds of an `exp` or `nbf`, so "expired" appears the second it is true. Farther
  out it steps by 30 seconds, rounded up, so "in 12 minutes" is never more time than
  there is. It re-renders only when the value changes.
- The secret, the key and the token are never written to storage, the URL or the
  service-worker cache. They are React state, so a reload clears them. Switching
  language also clears them (the tool remounts, see `docs/i18n.md`). The secret
  input is a masked text field with `autoComplete="off"` and password manager
  opt-outs, not `type="password"`, which invites a "save password" prompt.
- Base64url decoding of the token handles missing padding, accepts trailing `=`,
  and rejects `+` and `/` with the position of the first bad character (an emoji
  counts as one character in the message).
- **Invalid UTF-8.** `TextDecoder` would turn a bad byte into U+FFFD and lose it.
  `utf8.ts` marks each bad byte with a private-use character (U+F780 to U+F7FF),
  and the display writes it as `\xHH` after the JSON has been parsed and printed.
  The same applies to `alg`, `kid` and JSON error text, so the marker never reaches
  a message. Copy gives the displayed text. A real character in that private-use
  range, or the JSON escape for it, would also show as `\xHH`; no real token uses
  them. A byte order mark at the start of the header or payload is dropped.
- Integers past 2^53 in a claim keep their digits, because the JSON reader is the
  converter's (`parseJson`, `stringifyJson`).
- A payload that is valid JSON but not an object (a list, a string) is shown in the
  payload card. The claims card says there are no claims. A header that is not an
  object is an error.
- Tokens past 100,000 characters are refused, so a huge paste cannot stall the
  page on each keystroke.

## Mobile

The cards grid names its mobile column (`grid-cols-1`, which is `minmax(0,1fr)`) and
both columns are `min-w-0`. Without that the implicit `auto` column grows to the
widest JSON line: an `overflow-auto` box scrolls its own content, but its content
still counts toward the min-content width of what surrounds it, so the long `iss`
line of the example made the cards wider than the screen. Targets are 44px below
`sm` and inputs are 16px.

## Where the work runs

On the page, no worker. A token is a few KB and `crypto.subtle.verify` is async
and native. The business logic is in `src/lib/jwt/`, not in the components:

```
token.ts       tidy, split, decode (decodeToken, readToken)
base64url.ts   utf8.ts   claims.ts   time.ts
algorithms.ts  the twelve supported algorithms and `none`
keys.ts        secret, PEM and JWK to a CryptoKey
verify.ts      verifyToken
```

`decodeToken` and `verifyToken` return Effects. Decoding is synchronous. A wrong
signature is a value (`not-verified`), not an error. `useJwtVerification` runs the
check in a fiber, interrupts it when the token or key changes, and reports
`checking` in between, so an old verdict never shows for a changed token. A
rejection from `crypto.subtle.verify` is left as a defect and shown as "The check
couldn't run in this browser".

The core imports `m` directly, since nothing here runs in a worker. It reuses the
converter's JSON reader, which takes the converter's `Texts` (`messageTemplates`).

## Errors

Tagged errors on the Effect error channel, in two groups.

- Replace the cards, because the token cannot be read: `MalformedTokenError` (wrong
  number of parts, a character outside Base64url, five parts named as an encrypted
  JWE), `InvalidJsonError` (header or payload, naming which) and
  `TokenTooLargeError`. The part at fault is underlined in the drawn token and
  named in the message.
- Show inside the Verify card, with the cards left in place: `UnsupportedAlgorithmError`
  and `InvalidKeyError`. The token still decodes, so only the check is unavailable.

## Tests

All in `src/lib/jwt/*.test.ts`:

- Every algorithm (HS, RS, PS and ES at 256, 384 and 512) signs with a generated or
  independently computed key and verifies, and a changed signature byte and a
  changed payload both give `not-verified`. A wrong-length signature does not
  throw. The jwt.io HS256 sample is rebuilt from its JSON, signed with Node's own HMAC,
  and its signature is compared with the one jwt.io publishes.
- `exp` and `nbf` boundaries, one millisecond either side, with a fixed `now`.
- Padding variants, a two-part token, `alg: none` in several capitalisations, a
  payload that is a JSON array, a bad byte in a claim, a big integer.
- Key formats: PEM, escaped newlines, JWK, JWKS with and without `kid`, private
  keys, PKCS#1, certificates, a key of the wrong type or curve, and the algorithm
  confusion case.
- `readToken` never throws on 3,500 random inputs.

## Also needed

Done: the `jwt_decoder` entry in `src/lib/tool-categories.ts` (with keywords), the
`tool_jwt_decoder_*` and `jwt_*` keys in both catalogs, the route, the sitemap
entry, and lines in `CLAUDE.md` and `DESIGN.md`.

Not done: the page has been rendered and driven in jsdom (paste, verify, clear,
error states) but not opened in a real browser. Things to check there: the masked
secret field (`-webkit-text-security` in Firefox), the drawn token's wrapping at
390px, and dark mode. The tool has no mascot empty state (it uses an icon).

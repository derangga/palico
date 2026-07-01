#!/usr/bin/env bash
# Hook: Enforce rtk prefix on all Bash commands
# rtk passes through unchanged if no filter exists, so it's always safe.
#
# Exceptions: shell builtins and commands that can't be prefixed

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Empty command — allow
[[ -z "$COMMAND" ]] && exit 0

# Already starts with rtk — allow
[[ "$COMMAND" =~ ^rtk[[:space:]] ]] && exit 0

# Shell builtins and unprefixable commands — allow
TRIMMED="${COMMAND#"${COMMAND%%[![:space:]]*}"}"
FIRST_WORD="${TRIMMED%% *}"
case "$FIRST_WORD" in
cd | export | source | . | set | unset | true | false | test | \[ | eval | exec | trap | return | exit | shift | wait | read | declare | local | readonly | typeset | let | pushd | popd | dirs | shopt | ulimit | umask | hash | type | builtin | command | enable | help | times | alias | unalias | bind | complete | compgen | compopt | fc | history | jobs | bg | fg | disown | kill | suspend | coproc | select | if | then | else | elif | fi | case | for | do | while | until | break | continue | function | mkdir | chmod | cp | mv | rm | touch | cat | wc | tee | printf | echo)
  exit 0
  ;;
esac

# Variable assignments (FOO=bar cmd) — allow
[[ "$COMMAND" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && exit 0

# Block with feedback
cat >&2 <<EOF
BLOCKED: Command must be prefixed with 'rtk'.

  Your command: $COMMAND
  Fix: rtk $COMMAND

rtk compresses output for 60-90% token savings. It passes through unchanged if no filter exists.
Even in chains: rtk git add && rtk git commit
EOF
exit 2

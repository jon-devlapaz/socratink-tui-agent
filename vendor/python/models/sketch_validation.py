r"""Legacy substantiveness heuristic for learner-authored sketch text.

This no longer gates source-less ``/api/extract`` route generation. The current
source-less launch-pad contract accepts any non-empty learner launch attempt;
empty sketches are rejected in ``main._resolve_extract_path`` before generation.

This module remains as a parity-locked helper for legacy/frontend callers that
need the older "substantive sketch" verdict. The frontend JS helper keeps this
exact behavior and verifies parity against
``tests/fixtures/sketch_validation_parity.json``.

A sketch is "substantive" when it carries enough learner-generated signal to
pass the legacy substantive-sketch threshold. The heuristic is deliberately
simple — token count + a small "don't know" pattern list — because:

  - It must run identically in two languages.
  - Older tests and compatibility surfaces still depend on the exact verdict.
  - It must not be silently reused as the source-less launch-pad gate.

When in doubt, this returns False. That verdict is not a graph-truth claim and
is not the current source-less route-generation contract.

JS PORT NOTE (REQUIRED for legacy parity):

The Python regex `[^\w\s]` matches Unicode by default — `\w` in Python
includes letters, digits, and underscore for ALL scripts (`café`, `光合`, etc.).
JavaScript's `\w` is ASCII-only by default. A literal port with `/[^\w\s]/g`
in JS will strip diacritics and split non-ASCII tokens mid-word, producing
different substantiveness verdicts for the same input.

Required JS implementation:

  text.replace(/[^\p{L}\p{N}_\s]/gu, ' ')   // ← /u flag is mandatory

The `_REPEATED_CHAR_RE` pattern also needs the `/u` flag in JS for the
same reason (`.` matches BMP code units only without it).

The parity fixture includes Spanish, French, and mixed-script entries
specifically to lock this behavior. If the JS port silently uses
ASCII `\w`, those entries will fail the parity test — that's the contract
working as intended.
"""
from __future__ import annotations

import re

# Minimum non-stopword token count to be considered substantive.
MIN_SUBSTANTIVE_TOKENS = 8

# Patterns the learner uses when they have nothing to say. Matched as
# normalized substring of the *whole* normalized sketch (stripped, lowercased,
# punctuation collapsed). Keep the list short and obvious; longer/cleverer
# detection is a different problem.
_DONT_KNOW_PATTERNS = (
    "idk",
    "i dont know",
    "i don't know",
    "no idea",
    "no clue",
    "dunno",
    "not sure",
)

# A small English stopword set — kept tiny on purpose so we don't ship an
# external dictionary and so JS parity stays trivial.
_STOPWORDS = frozenset(
    """
    a an the and or but if of for in on at to from by with as is are was were
    be been being do does did has have had this that these those it its
    """.split()
)

_PUNCT_RE = re.compile(r"[^\w\s]")
_WHITESPACE_RE = re.compile(r"\s+")
_REPEATED_CHAR_RE = re.compile(r"^(.)\1{4,}$")  # aaaaa, ?????, ......


def _normalize(text: str) -> str:
    """Lowercase, strip, collapse whitespace, drop punctuation."""
    text = text.strip().lower()
    text = _PUNCT_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text)
    return text.strip()


def _is_dont_know(normalized: str) -> bool:
    """The whole sketch is essentially a 'don't know' pattern."""
    if not normalized:
        return True
    if _REPEATED_CHAR_RE.match(normalized):
        return True
    for pattern in _DONT_KNOW_PATTERNS:
        if normalized == pattern:
            return True
        if normalized.startswith(pattern + " "):
            extra = normalized[len(pattern) + 1:].split()
            if len(extra) <= 3:
                return True
    return False


def _count_substantive_tokens(normalized: str) -> int:
    """Token count after dropping stopwords and very short tokens."""
    tokens = [t for t in normalized.split() if t and len(t) >= 2]
    return sum(1 for t in tokens if t not in _STOPWORDS)


def is_substantive_sketch(text: str) -> bool:
    """Return True if the sketch passes the legacy substantive-sketch threshold.

    See the module docstring for the current scope and why this must not be
    reused as the source-less launch-pad gate.
    """
    normalized = _normalize(text)
    if not normalized:
        return False
    if _is_dont_know(normalized):
        return False
    if _count_substantive_tokens(normalized) < MIN_SUBSTANTIVE_TOKENS:
        return False
    return True

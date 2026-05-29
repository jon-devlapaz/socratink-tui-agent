import re
from typing import Literal

HelpRequestReason = Literal[
    "explicit_unknown",
    "explicit_explain_request",
    "affective_confusion",
]


def infer_help_request_reason(message: str) -> HelpRequestReason | None:
    normalized = " ".join((message or "").strip().lower().split())
    if not normalized:
        return None

    explicit_unknown_markers = (
        "i don't know",
        "i dont know",
        "idk",
        "no idea",
        "not sure",
        "i'm not sure",
        "im not sure",
        "unsure",
    )
    explain_request_markers = (
        "please explain",
        "can you explain",
        "could you explain",
        "explain that",
        "explain this",
        "break that down",
        "break this down",
        "walk me through",
        "help me understand",
        "what does that mean",
    )
    affective_confusion_markers = (
        "this is confusing",
        "i'm confused",
        "im confused",
        "confusing",
        "lost here",
    )

    if any(marker in normalized for marker in explicit_unknown_markers):
        return "explicit_unknown"
    if any(marker in normalized for marker in explain_request_markers):
        return "explicit_explain_request"
    if any(marker in normalized for marker in affective_confusion_markers):
        return "affective_confusion"
    return None


def has_substantive_attempt(message: str) -> bool:
    normalized = " ".join((message or "").strip().lower().split())
    if not normalized:
        return False

    if "?" in normalized and not any(
        marker in normalized
        for marker in (
            "i think",
            "i guess",
            "maybe",
            "but",
            "it is",
            "it's",
            "they are",
            "this is",
        )
    ):
        return False

    if re.search(
        r"\b("
        r"because|if|when|then|by|so that|causes?|leads? to|creates?|"
        r"means?|happens?|opens?|closes?|flows?|travels?|moves?|rushes?|"
        r"depolariz|repolariz"
        r")\b",
        normalized,
    ):
        return True

    words = re.findall(r"[a-z']+", normalized)
    if len(words) < 6:
        return False

    filler_words = {
        "i",
        "im",
        "i'm",
        "not",
        "sure",
        "don't",
        "dont",
        "know",
        "can",
        "you",
        "please",
        "explain",
        "this",
        "that",
        "it",
        "me",
        "help",
        "understand",
        "maybe",
        "think",
        "kind",
        "of",
        "sort",
        "just",
    }
    content_words = [word for word in words if word not in filler_words]
    return len(content_words) >= 4 and any(
        word.endswith(("s", "ed", "ing")) for word in content_words
    )

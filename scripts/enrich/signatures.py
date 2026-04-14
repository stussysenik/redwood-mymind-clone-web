"""DSPy signatures for the BYOA enrichment pipeline.

TitleSignature and TitleQualitySignature were extracted unchanged from
scripts/nim_titles.py so existing CLI behavior is preserved. The description
signatures are new in the rewrite-titles-and-verify-descriptions change.
"""

import dspy


class TitleSignature(dspy.Signature):
    """
    You are a smart librarian labeling saved web items.
    Generate a crisp, descriptive title of EXACTLY 3-5 words.
    Rules:
    - Title case (capitalize main words)
    - No punctuation at the end
    - Do NOT start with an article (a, an, the)
    - Capture the specific subject, not just the category
    - If the item is a tweet/social post, summarize the key claim
    - Output ONLY the title — nothing else
    """
    url: str       = dspy.InputField(desc="Source URL of the saved item")
    content: str   = dspy.InputField(desc="Content snippet, AI summary, or caption (may be empty)")
    tags: str      = dspy.InputField(desc="Comma-separated tags as context (may be empty)")
    card_type: str = dspy.InputField(desc="Card type: article | image | note | social | video | book | product | website")
    title: str     = dspy.OutputField(desc="3-5 word title, title case, no trailing punctuation")


class TitleQualitySignature(dspy.Signature):
    """
    Score a proposed title for a saved web item on a 0.0–1.0 scale.
    Score 1.0: specific, 3-5 words, immediately tells you what the item is about.
    Score 0.5: somewhat specific but vague or slightly off-topic.
    Score 0.0: generic, wrong length, or reads like a category not a title.
    """
    proposed_title: str = dspy.InputField(desc="The proposed title to score")
    url: str            = dspy.InputField(desc="Source URL for context")
    content: str        = dspy.InputField(desc="Content snippet for context")
    score: float        = dspy.OutputField(desc="Float 0.0–1.0")
    critique: str       = dspy.OutputField(desc="One-sentence critique or confirmation")


class TagQualitySignature(dspy.Signature):
    """
    You are evaluating whether a tag on a saved web item is useful.
    A tag is USEFUL if:
    - It is specific enough to meaningfully distinguish this item from others
    - A user would realistically search for it to find THIS item
    - It adds information beyond what the card type already implies
    A tag is NOT USEFUL if:
    - It is too generic to narrow a search (e.g. 'visual', 'content', 'design')
    - It is vague sentiment or quality (e.g. 'dense', 'great', 'interesting')
    - It duplicates the card type (e.g. tag='article' on an article card)
    """
    tag: str        = dspy.InputField(desc="The tag to evaluate")
    card_title: str = dspy.InputField(desc="The card's title for context")
    card_type: str  = dspy.InputField(desc="The card type")
    is_useful: bool = dspy.OutputField(desc="True if the tag meaningfully helps find this item")
    reason: str     = dspy.OutputField(desc="One short phrase explaining the judgment")


class DescriptionSignature(dspy.Signature):
    """
    You are a neutral editorial assistant writing a short description for a
    saved web item. Produce 1-2 present-tense sentences, max 240 characters,
    describing what the source is about. Do not use quotes. Do not start with
    "This...". Do not editorialize. Be specific, not promotional.
    """
    url: str         = dspy.InputField(desc="Source URL")
    content: str     = dspy.InputField(desc="Raw scraped content or existing summary (may be empty)")
    title: str       = dspy.InputField(desc="Current or proposed title for context")
    card_type: str   = dspy.InputField(desc="Card type")
    description: str = dspy.OutputField(desc="1-2 neutral present-tense sentences, max 240 chars, no quotes")


class DescriptionQualitySignature(dspy.Signature):
    """
    Score an existing description for a saved web item on a 0.0-1.0 scale for
    source fidelity and specificity. Think step by step.
    Score 1.0: faithful to source, specific subject, 1-2 sentences, no fluff.
    Score 0.5: directionally correct but vague or padded.
    Score 0.0: hallucinated, off-topic, parrots the title, or reads like SEO filler.
    """
    proposed_description: str = dspy.InputField(desc="Description to score")
    url: str                  = dspy.InputField(desc="Source URL for context")
    content: str              = dspy.InputField(desc="Raw source content for comparison")
    title: str                = dspy.InputField(desc="Current title for context")
    score: float              = dspy.OutputField(desc="Float 0.0-1.0")
    critique: str             = dspy.OutputField(desc="One-sentence critique grounded in the source")

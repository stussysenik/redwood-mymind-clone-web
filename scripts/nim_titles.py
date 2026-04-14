#!/usr/bin/env python3
"""BYOA — DSPy + NVIDIA NIM title/description pipeline (legacy entrypoint).

This is now a thin shim over `scripts.enrich.cli`. Existing muscle memory
(`python scripts/nim_titles.py --dry-run --limit 20`) continues to work; the
real implementation lives in the `scripts/enrich/` package.
"""

import sys
from pathlib import Path

# Allow running as `python scripts/nim_titles.py …` without installing.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.enrich.cli import main  # noqa: E402

if __name__ == "__main__":
    main()

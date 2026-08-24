"""Greville Stage 5 overshadowing — the frozen v1.1-AB model, in Python.

Reconstructed from the frozen visualiser rather than from the original
sources; see ``model/PROVENANCE.md`` for exactly what that means and what it
does not establish.
"""

from .model import (
    FENCE_CASES,
    LOTS,
    Model,
    load,
)

__all__ = ["FENCE_CASES", "LOTS", "Model", "load"]

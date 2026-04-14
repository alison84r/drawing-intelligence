"""
Classifies extracted text tokens into engineering drawing categories.
Regex-first, heuristic fallback — fast, no ML needed for CAD content.
"""
import re

# ── Patterns ──────────────────────────────────────────────────────────────────

# Dimension: plain number, decimal, or with ø/∅ prefix  e.g. "103.05", "ø12", "3X"
_DIM = re.compile(
    r'^[øØ∅ø]?\d+\.?\d*$'       # ø12, 12, 12.5
    r'|^\d+[xX×]\d+$'            # 3X4, 2×5
    r'|^\d+X$'                   # 3X (count prefix)
    r'|^[Rr]\d+\.?\d*$'          # R3, r12.5 (radius)
    r'|^\d+°$'                   # 45° (angle)
    r'|^[Tt][Yy][Pp]$',          # TYP
    re.UNICODE,
)

# Tolerance: ±, +/-, leading sign, or trailing ± notation
_TOL = re.compile(
    r'^[±]\d+\.?\d*$'            # ±0.05
    r'|^[+\-]\d+\.?\d*$'         # +0.1, -0.05
    r'|^\d+\.?\d*[+\-]$'         # 0.1+
    r'|^\+\d+\.?\d*/\-\d+\.?\d*$',  # +0.1/-0.05
)

# GD&T symbols (Unicode block and common CAD symbols)
_GDT_CHARS = set('⌀⊕⊥∥□○△▽⌖⌗◎⊙⊡⌒⌓⌰⌱⌲⌳⌴⌵⌶⌷⌸⌹⌺⌻⌼')
_GDT_WORDS = {
    'crc', 'cyl', 'flat', 'str', 'perp', 'ang', 'par', 'pos',
    'conc', 'sym', 'run', 'tir',
}

# Grid references: single letter A-H or 1-12
_GRID = re.compile(r'^[A-Ha-h]$|^\d{1,2}$')

# Title block keywords
_TITLE_KEYWORDS = {
    'material', 'rev', 'revision', 'drawn', 'checked', 'approved',
    'scale', 'sheet', 'dwg', 'part', 'name', 'date', 'title',
    'description', 'weight', 'finish', 'hardness', 'treatment',
    'do', 'not', 'scale', 'drawing',
}

# Note indicators (longer text, spec language)
_NOTE_START = re.compile(
    r'^\d+\.',          # "1. REMOVE..."
    re.IGNORECASE,
)


# ── Public API ────────────────────────────────────────────────────────────────

def classify(text: str, font_size: float = 0, is_in_table: bool = False) -> tuple[str, float]:
    """
    Returns (category, confidence) for a text token.
    Category is one of: dimension, tolerance, gdt, table_cell, note,
                        titleblock, grid_ref, unknown
    """
    t = text.strip()
    if not t:
        return 'unknown', 0.0

    if is_in_table:
        return 'table_cell', 0.9

    # GD&T — any token containing GD&T chars
    if any(c in _GDT_CHARS for c in t):
        return 'gdt', 0.95
    if t.lower() in _GDT_WORDS:
        return 'gdt', 0.75

    # Tolerance
    if _TOL.match(t):
        return 'tolerance', 0.92

    # Dimension
    if _DIM.match(t):
        return 'dimension', 0.90

    # Grid reference (small font + pattern)
    if _GRID.match(t) and font_size <= 12:
        return 'grid_ref', 0.85

    # Notes — starts with number+dot or is a long sentence
    if _NOTE_START.match(t) or len(t.split()) >= 5:
        return 'note', 0.80

    # Title block — large font or known keywords
    words_lower = {w.lower() for w in t.split()}
    if words_lower & _TITLE_KEYWORDS or font_size >= 14:
        return 'titleblock', 0.70

    return 'unknown', 0.50

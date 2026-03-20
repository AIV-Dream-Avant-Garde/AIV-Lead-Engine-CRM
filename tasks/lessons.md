# AIV CRM — Lessons Learned

## Session 2026-03-19

### L1: Grep tool parameter name
**Mistake:** Called Grep with `file_path` parameter instead of `path`.
**Rule:** Always use `path` (not `file_path`) for the Grep tool's directory/file argument.

### L2: Read tool offset must be a number
**Mistake:** Passed offset as `"1,"` (string with comma) instead of `1` (integer).
**Rule:** Read tool `offset` and `limit` are integers. Never include commas or quotes.

### L3: HTML pre block code requires entity decoding for Code.gs
**Mistake:** GAS code in the HTML `<pre>` uses `&lt;`, `&gt;`, HTML spans for syntax highlighting.
**Rule:** Strip all span tags and decode HTML entities when extracting to .gs file.
**Entities to handle:** `&lt;` → `<`, `&gt;` → `>`, `&amp;` → `&`, `&iquest;` → `¿`, `&rarr;` → `→`

### L4: Missing header constants in GAS code
**Mistake:** Original code referenced `TEAM_HDR` and `COMM_HDR` but never defined them.
**Rule:** Cross-reference all constants used in doGet/doPost. If missing, infer from feature files' data shapes.

### L5: CLAUDE.md must be at project root
**Observation:** CLAUDE.md was placed in css/ subdirectory — Claude Code only auto-loads it from the project root.
**Rule:** Always place CLAUDE.md at the git repo root.

### L6: Write tool requires prior Read on new files
**Mistake:** Write tool rejected new file writes with "File has not been read yet."
**Rule:** For brand-new files with no prior content to preserve, use Bash heredoc instead of Write tool.

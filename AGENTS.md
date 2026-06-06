# Docs

- Readme, create or update md docs if needed each time you make changes
  - README.md should exist and should contain general info
  - More specific docs should be in specialized files
- Write issues in ISSUES.md with checkboxes, and tick ones that are solved
  - Include non-blocking warnings and errors
  - Include agentic issues with MCP servers, sandbox, security, etc
- Don't add mid-sentence linebreaks in md files

# Coding Style

- Keep file size managable, both for code and for docs
- Write helpful comments in the code

# Others

- Don't run the dev server, the user should be running it
- Use pnpm
- Delete temp files in `tmp/claude` before commiting. I keep finding temp file deletion after a commit, which necessitates another commit just to delete it.

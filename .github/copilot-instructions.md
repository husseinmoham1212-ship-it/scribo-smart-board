# Copilot Instructions

## Project context

This project was migrated from Lovable.com and is hosted on GitHub for deployment on Vercel.

## Core rules

- Preserve the existing project structure, Tailwind styling, and React component patterns.
- Do not add or reference Lovable-specific packages, CLI tools, or cloud dependencies.
- Use `process.env` or `import.meta.env` formats appropriate to the runtime for environment variables.
- Keep UI components, custom hooks, and utility functions self-contained.
- Do not introduce breaking changes to existing routes or state management.
- Keep optional writing settings in a collapsible toolbar, separate from always-available background swatches, so hiding settings expands the working canvas without changing tool state.

# Garmin Connect MCP Server - Project Instructions

## Project Overview

This is an MCP (Model Context Protocol) server that provides integration with Garmin Connect. It enables access to health metrics, activities, and training data from Garmin devices through standardized MCP tools.

**Tech Stack:**
- TypeScript/Node.js (v20+)
- MCP SDK (@modelcontextprotocol/sdk)
- garmin-connect client library
- Vitest for testing
- tsup for bundling

**Project Structure:**
- `src/` - Source code
- `src/tools/` - MCP tool implementations
- `src/types/` - TypeScript type definitions
- `dist/` - Built output
- `backlog/` - Task management using backlog.md CLI

## Common Commands

```bash
# Development
pnpm dev              # Watch mode with auto-rebuild
pnpm build            # Build for production
pnpm start            # Run the built server

# Quality Checks
pnpm typecheck        # Run TypeScript type checking
pnpm lint             # Lint code
pnpm lint:fix         # Auto-fix linting issues

# Testing
pnpm test             # Run tests in watch mode
pnpm test:run         # Run tests once
pnpm test:coverage    # Generate coverage report
```

**IMPORTANT:** Always use `pnpm`, never `npm` or `yarn`.

## Code Style Guidelines

- Use ES modules (import/export), not CommonJS
- Prefer functional programming patterns
- Use explicit types, avoid `any`
- Destructure imports when possible
- Use async/await over promises
- Follow existing naming conventions in the codebase

**Example:**
```typescript
// ✅ Good
import { GarminConnect } from 'garmin-connect';
export async function fetchData(): Promise<Data> { ... }

// ❌ Bad
const GarminConnect = require('garmin-connect');
export function fetchData(): any { ... }
```

## Testing Requirements

- New features require corresponding test files
- Use Vitest for unit tests
- Place tests in `__tests__` directories or as `*.test.ts` files
- Mock external dependencies (Garmin API calls)
- Always run `pnpm typecheck && pnpm test:run` before committing

## Task Management

This project uses **Backlog.md CLI** for task management. For all task-related operations, use the `backlog-md` skill:

```
/backlog-md
```

The skill provides comprehensive guidance on:
- Task creation, editing, and status management
- Task hierarchy and organization
- Acceptance criteria management
- Development workflows
- Best practices for working with tasks

**Quick Tips:**
- **NEVER** edit task markdown files directly - always use the `backlog` CLI
- **Update task status** when starting ("In Progress") and completing ("Done") work
- Use `--plain` flag for AI-friendly output when scripting

## Multi-Agent Workflows (MANDATORY)

This project uses specialized agents for different phases of work. These workflows are **MANDATORY** and must be followed exactly.

### Workflow 1: Task Implementation

When the user asks to **fix or implement** something:

**BEFORE STARTING:** Update task status to "In Progress" in backlog

1. **Analyze** - Use `@agent-analyst` (`.claude/agents/analyst.md`) to:
   - Decompose requirements into actionable tasks
   - Create detailed specifications
   - Define test cases and acceptance criteria

2. **Develop** - Use `@agent-developer` (`.claude/agents/developer.md`) to:
   - Implement the solution following specifications
   - Write unit tests
   - Ensure code follows style guidelines

3. **Review** - Use `@agent-reviewer` (`.claude/agents/reviewer.md`) to:
   - Review code quality and best practices
   - Check architectural patterns
   - Verify test coverage and documentation

4. **Commit** - Use `@agent-committer` (`.claude/agents/committer.md`) to:
   - Create proper conventional commits
   - Follow git best practices
   - Write meaningful commit messages

**AFTER COMPLETING:** Update task status to "Done" in backlog and archive

**Example:**
```
User: "Add support for weekly training volume aggregation"

Response:
→ Update task status to "In Progress" in backlog
→ @agent-analyst - Analyze requirements and create specifications
→ @agent-developer - Implement the feature based on specifications
→ @agent-reviewer - Review the implementation
→ @agent-committer - Create conventional commits
→ Update task status to "Done" and archive in backlog
```

**Critical Rules:**
- **NEVER** skip any step in this workflow
- Each agent must complete before moving to the next
- Do not implement directly - always use `@agent-developer`
- Do not commit directly - always use `@agent-committer`
- **ALWAYS** update task status: "In Progress" when starting, "Done" when finishing

### Workflow 2: Task Creation

When the user asks to **create a task**:

1. **Analyze** - Use `@agent-analyst` to:
   - Understand the full scope and context
   - Break down into atomic tasks
   - Define clear acceptance criteria
   - Identify dependencies and requirements

2. **Create in Backlog** - After analysis:
   - Use `/backlog-md` skill for task management guidance
   - Create tasks with proper structure, description, and acceptance criteria
   - Set appropriate priority and parent task

**Example:**
```
User: "Create a task for implementing heart rate zone analysis"

Response:
→ @agent-analyst - Analyze requirements and define specifications
→ Use /backlog-md skill to create task with specifications from analysis
```

**Critical Rules:**
- **ALWAYS** analyze before creating tasks
- Never create tasks without proper analysis
- Ensure acceptance criteria are testable and clear
- Tasks must be atomic (single PR scope)

### Available Agents

Agents are located in `.claude/agents/` directory:

- `@agent-analyst` - Requirements analysis, task decomposition, test specifications
- `@agent-developer` - TypeScript development for frontend and backend
- `@agent-reviewer` - Code review, best practices, architectural patterns
- `@agent-committer` - Git commit operations following conventional commits

## Project Management Rules

When acting as project manager:
- Only one developer agent works in parallel
- Always ask user confirmation before starting new tasks
- Use `/backlog-md` skill for all task management operations
- After development, delegate to reviewer agent
- Run full test suite before marking phase complete: `pnpm test:run && pnpm typecheck`

## Repository Etiquette

- Commit messages should be clear and descriptive
- Run tests and typecheck before pushing
- Keep PRs focused on single tasks
- Update tests when modifying existing code
- Don't commit node_modules, dist/, or .env files

## Important Notes

- Garmin Connect credentials must be configured via environment variables or MCP settings
- The server runs as a stdio MCP server, not HTTP
- Always handle Garmin API rate limits and errors gracefully
- Mock Garmin API responses in tests to avoid real API calls

---

**Tips for AI Agents:**
- Use `/backlog-md` skill for all task management operations
- Think from the perspective of future AI agents when creating tasks
- Ensure task descriptions contain sufficient context for independent work
- Ask clarifying questions when requirements are ambiguous

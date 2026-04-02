# Workflow

## 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

## 3. Self-Improvement Loop
- After ANY correction from the user: append the lesson to `~/.claude/tasks/lessons.md`
- Each lesson entry must state the project/repo it applies to so the shared user-level file stays scoped and reusable
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review `~/.claude/tasks/lessons.md` at session start and focus on entries relevant to the current project/repo

## 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff your behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

## 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

## 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## 7. Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Append lessons to `~/.claude/tasks/lessons.md` after corrections, and include the project/repo the lesson applies to

## 8. Working Directory Safety
- ALWAYS verify `pwd` before editing files, especially in worktrees
- If in a worktree, confirm you're editing the correct tree before making changes
- Never assume the current directory — check first

## 9. Communication Rules
- Draft Slack messages and PR comments — NEVER send/post without explicit approval
- When drafting replies, present the text for review first
- For complex tasks, interview me for requirements before starting (complementary to plan mode)

## 10. Machine & Tooling Constraints
- Do NOT use lint autofix (e.g., `eslint --fix`, `biome check --apply`) — causes OOM on this machine
- Run lint checks only in read-only/diagnostic mode
- **Worktrees:** always use existing local clones, never clone to `/tmp`

## 11. Code Style
- Consolidate imports: one import line per module with combined types
- Avoid multiple import statements from the same module

## 12. Commit Discipline
- Do NOT commit unless I explicitly ask you to
- Do NOT push unless I explicitly ask you to

## 13. Validate Feedback Before Acting
- When receiving code review comments, PR feedback, or any external suggestions: **evaluate correctness first** before implementing
- Feedback may be incorrect, outdated, already addressed, or not applicable to our goals/situation
- Cross-check suggestions against the actual code, project context, and prior discussions
- Present your assessment of the feedback to me before making changes — flag anything that seems wrong, redundant, or misaligned
- Do NOT blindly implement all review comments — exercise technical judgment

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

# Agentic UI Fix List

## Why this pass exists
The current assistant UI mixed two separate concerns:
- `Autonomy`: how much execution control the user delegates.
- `Mode`: how the user interacts with the assistant.

That made the interface incoherent. A manual user could still see `Agentic` beside normal chat modes, and agentic requests could feel like normal Q&A instead of a workflow system.

## Current fixes in progress
- Make autonomy the first decision.
- Gate `Agentic` mode behind `Ask` or `Agent` autonomy.
- Route agentic submits to workflow planning instead of plain chat.
- Keep streamed chat responses CORS-safe.
- Expand workflow intent mapping so invoice requests route to invoice workflows.
- Replace dead `Loading...` text with visible progress states.

## Remaining UI/UX fixes
1. Autonomy-first layout
   - Show `Manual`, `Ask`, and `Agent` with a one-line explanation each.
   - Manual should clearly communicate `conversation only`.
   - Ask should communicate `preview before actions`.
   - Agent should communicate `safe auto-run for read-only steps`.

2. Mode gating
   - `Text`, `Voice`, and `Video` remain valid under manual autonomy.
   - `Agentic` should be disabled with an explanation until the user selects `Ask` or `Agent`.
   - If the user moves from `Agentic` back to `Manual`, the UI should downgrade them to a non-agentic mode automatically.

3. Distinct submit behavior
   - Normal modes send chat messages.
   - Agentic mode creates a plan first.
   - The primary CTA should read `Create Plan` in agentic mode, not behave like generic send.

4. Better empty states and suggestions
   - Manual mode should show informational prompts.
   - Agentic mode should show executable task prompts such as `Check unpaid invoices` or `Generate monthly summary`.

5. Stronger plan visibility
   - The user should immediately see the generated plan, approval gates, and next possible actions.
   - Navigation and document-generation steps should be visually differentiated.

6. Better action semantics
   - Invoice prompts like `unpaid`, `open`, `pending`, and `outstanding` should map to invoice workflows instead of generic summaries.
   - Generic fallback plans should only be used when intent cannot be classified.

7. Workflow builder consistency
   - The workflow console should keep the node-based builder mental model consistent with the chat-side plan model.
   - Icons, action labels, and approval chips should match in both places.

8. Explain why an option is unavailable
   - Disabled options should always show a reason.
   - Avoid silent disabling where the user has to guess which state is blocking the action.

## UX principles used for this redesign
- Use templates and nodes, not blank text-only workflow creation.
- Make approval points explicit before critical actions.
- Keep execution state resumable and inspectable.
- Separate workflow design from workflow execution.
- Keep the user in control for high-impact steps.

## Research references
- n8n workflows and templates: https://docs.n8n.io/workflows/
- OpenAI Operator safety model and user confirmations: https://openai.com/index/introducing-operator/
- LangGraph interrupts for approval/resume workflows: https://docs.langchain.com/oss/python/langgraph/interrupts
- OpenAI Agent Builder visual workflow canvas: https://developers.openai.com/api/docs/guides/agent-builder
- OpenAI safety guidance for approvals and human review: https://developers.openai.com/api/docs/guides/agent-builder-safety

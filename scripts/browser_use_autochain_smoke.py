import asyncio
import json
from pathlib import Path

from pydantic import BaseModel, Field

from browser_use import Agent, Browser, ChatOllama


class EvoSmokeResult(BaseModel):
    login_success: bool = Field(description="True if the app login succeeded.")
    admin_dashboard_loaded: bool = Field(
        description="True if the admin dashboard was reached and recognized.",
    )
    documents_page_loaded: bool = Field(
        description="True if the Documents page was opened and recognized.",
    )
    workflows_page_loaded: bool = Field(
        description="True if the Workflows page was opened and recognized.",
    )
    final_url: str = Field(description="The last URL visited in the test.")
    summary: str = Field(description="Short summary of what happened.")
    issues: list[str] = Field(
        default_factory=list,
        description="Any problems encountered during the smoke test.",
    )


async def main() -> None:
    output_dir = Path("artifacts/browser-use")
    output_dir.mkdir(parents=True, exist_ok=True)

    browser = Browser(
        executable_path="/Users/dev/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
        headless=True,
        user_data_dir="/tmp/browser-use-autochain-headless-profile-gemma4",
        viewport={"width": 1440, "height": 1100},
    )

    llm = ChatOllama(
        model="qwen3:14b",
        host="http://127.0.0.1:11434",
    )

    task = """
You are running a read-only smoke test against the local AutoChain app.

Rules:
- Stay inside http://localhost:3000 only.
- Do not trigger destructive or mutating actions.
- Only log in, navigate, inspect, and report.
- If a page does not load or a control is missing, note it in issues and continue where possible.

Steps:
1. Open http://localhost:3000/login
2. Log in with:
   - email: admin@autochain.io
   - password: demo1234
3. Verify the admin dashboard loads.
4. Open the Documents page and verify it loads.
5. Open the Workflows page and verify it loads.
6. Finish with a JSON result matching the provided schema.
"""

    agent = Agent(
        task=task,
        llm=llm,
        browser=browser,
        output_model_schema=EvoSmokeResult,
        save_conversation_path=output_dir / "conversation",
        use_vision=False,
        max_actions_per_step=2,
        llm_timeout=180,
        enable_signal_handler=False,
    )

    try:
        history = await agent.run(max_steps=25)
        structured = history.structured_output
        payload = {
            "is_done": history.is_done(),
            "is_successful": history.is_successful(),
            "errors": history.errors(),
            "final_result": history.final_result(),
            "structured_output": structured.model_dump() if structured else None,
            "urls": history.urls(),
        }
        (output_dir / "result.json").write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )
        print(json.dumps(payload, indent=2))
    finally:
        await browser.stop()


if __name__ == "__main__":
    asyncio.run(main())

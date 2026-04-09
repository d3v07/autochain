import json
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = "http://localhost:3000"
OUTPUT_PATH = Path("artifacts/playwright-autochain-smoke.json")


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "base_url": BASE_URL,
        "login_success": False,
        "assistant_visible": False,
        "voice_mode_loaded": False,
        "visual_mode_loaded": False,
        "agentic_mode_loaded": False,
        "agentic_plan_created": False,
        "documents_page_loaded": False,
        "workflows_page_loaded": False,
        "final_url": "",
        "issues": [],
    }

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=30000)
            page.locator("#email").fill("admin@autochain.io")
            page.locator('input[type="password"]').fill("demo1234")
            page.get_by_role("button", name="Sign in").click()

            page.wait_for_url("**/admin/dashboard", timeout=30000)
            page.get_by_role("heading", name="Admin Dashboard").wait_for(
                state="visible",
                timeout=30000,
            )
            result["login_success"] = True

            page.get_by_text("eSupplyPro Assistant").wait_for(state="visible", timeout=30000)
            result["assistant_visible"] = True

            page.locator('[data-agent-id="assistant-mode-voice"]').click()
            page.get_by_role(
                "heading",
                name="Live transcript and spoken briefings",
            ).wait_for(state="visible", timeout=30000)
            result["voice_mode_loaded"] = True

            page.locator('[data-agent-id="assistant-mode-visual"]').click()
            page.get_by_role(
                "heading",
                name="Screenshot and dashboard-guided review",
            ).wait_for(state="visible", timeout=30000)
            result["visual_mode_loaded"] = True

            page.locator('[data-agent-id="assistant-autonomy-ask"]').click()
            page.locator('[data-agent-id="assistant-mode-agentic"]').click()
            page.get_by_role(
                "heading",
                name="Plan first, then execute inside eSupplyPro",
            ).wait_for(state="visible", timeout=30000)
            result["agentic_mode_loaded"] = True

            task_input = page.locator('textarea[placeholder*="Check monthly reports"]')
            task_input.fill("Check unpaid invoices")
            page.locator('[data-agent-id="assistant-plan-create"]').click()
            page.get_by_text("Current Plan").wait_for(state="visible", timeout=30000)
            result["agentic_plan_created"] = True

            page.locator('[data-agent-id="nav-documents"]').click()
            page.wait_for_url("**/documents", timeout=30000)
            page.get_by_role("heading", name="Document Studio").wait_for(
                state="visible",
                timeout=30000,
            )
            result["documents_page_loaded"] = True

            page.locator('[data-agent-id="nav-workflows"]').click()
            page.wait_for_url("**/workflows", timeout=30000)
            page.get_by_role("heading", name="Workflow Builder").wait_for(
                state="visible",
                timeout=30000,
            )
            result["workflows_page_loaded"] = True
            result["final_url"] = page.url

            browser.close()
    except PlaywrightTimeoutError as exc:
        result["issues"].append(f"Timeout: {exc}")
    except Exception as exc:  # pragma: no cover - smoke script
        result["issues"].append(f"Error: {exc}")

    OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

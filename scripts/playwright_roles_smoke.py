import json
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

BASE_URL = 'http://localhost:3000'
OUTPUT_PATH = Path('artifacts/playwright-roles-smoke.json')

ROLES = [
    {
        'label': 'admin',
        'email': 'admin@autochain.io',
        'password': 'demo1234',
        'landing': '**/admin/dashboard',
        'landing_heading': 'Admin Dashboard',
        'nav_checks': [
            {'href': '/admin/users', 'heading': 'Users', 'agent_id': 'nav-admin-users'},
            {'href': '/admin/sessions', 'heading': 'Sessions', 'agent_id': 'nav-admin-sessions'},
        ],
        'agentic_task': 'Review risky sessions and summarize findings',
    },
    {
        'label': 'vendor',
        'email': 'ops@northstarextrusions.com',
        'password': 'demo1234',
        'landing': '**/vendor/dashboard',
        'landing_heading': 'Vendor Dashboard',
        'nav_checks': [
            {'href': '/vendor/purchase-orders', 'heading': 'Vendor Purchase Orders', 'agent_id': 'nav-vendor-purchase-orders'},
            {'href': '/vendor/catalog', 'heading': 'Vendor Catalog', 'agent_id': 'nav-vendor-catalog'},
            {'href': '/vendor/invoices', 'heading': 'Vendor Invoices', 'agent_id': 'nav-vendor-invoices'},
        ],
        'agentic_task': 'Review constrained catalog and summarize next actions',
    },
    {
        'label': 'client',
        'email': 'orders@acmewindows.com',
        'password': 'demo1234',
        'landing': '**/dashboard',
        'landing_heading': 'Welcome, Acme Windows & Doors',
        'nav_checks': [
            {'href': '/orders', 'heading': 'Orders', 'agent_id': 'nav-orders', 'check_text': 'Orders'},
            {'href': '/products', 'heading': 'Product Catalog', 'agent_id': 'nav-products', 'check_text': 'Suggested for you'},
            {'href': '/invoices', 'heading': 'Invoices', 'agent_id': 'nav-invoices', 'check_text': 'Invoices'},
        ],
        'agentic_task': 'Check unpaid invoices',
    },
]


def log(message: str) -> None:
    print(message, flush=True)


def ensure_assistant_open(page):
    assistant_title = page.get_by_text('eSupplyPro Assistant')
    try:
        assistant_title.first.wait_for(state='visible', timeout=3000)
        return
    except PlaywrightTimeoutError:
        pass

    open_button = page.get_by_role('button', name='Open Assistant')
    if open_button.count():
        open_button.click()
        assistant_title.first.wait_for(state='visible', timeout=10000)
        return

    raise AssertionError('Assistant panel is not visible')


def run_role_flow(browser, role_config):
    role_result = {
        'login_success': False,
        'landing_loaded': False,
        'assistant_visible': False,
        'agentic_mode_loaded': False,
        'agentic_plan_created': False,
        'nav_checks': [],
        'issues': [],
    }

    context = browser.new_context()
    page = context.new_page()
    page.set_default_timeout(15000)

    try:
        log(f"[{role_config['label']}] open login")
        page.goto(f"{BASE_URL}/login", wait_until='domcontentloaded', timeout=20000)
        # Next.js dev mode can render the form before the client submit handler
        # is hydrated, which causes an immediate same-page form post in smoke runs.
        page.wait_for_timeout(2000)
        page.locator('#email').fill(role_config['email'])
        page.locator('input[type="password"]').fill(role_config['password'])
        page.get_by_role('button', name='Sign in').click()

        log(f"[{role_config['label']}] wait landing")
        page.wait_for_url(role_config['landing'], timeout=20000)
        page.get_by_role('heading', name=role_config['landing_heading']).wait_for(state='visible', timeout=20000)
        role_result['login_success'] = True
        role_result['landing_loaded'] = True

        log(f"[{role_config['label']}] assistant")
        ensure_assistant_open(page)
        role_result['assistant_visible'] = True

        log(f"[{role_config['label']}] agentic mode")
        page.locator('[data-agent-id="assistant-autonomy-ask"]').click()
        page.locator('[data-agent-id="assistant-mode-agentic"]').click()
        page.get_by_role('heading', name='Plan first, then execute inside eSupplyPro').wait_for(state='visible', timeout=20000)
        role_result['agentic_mode_loaded'] = True

        log(f"[{role_config['label']}] create plan")
        task_input = page.locator('textarea[placeholder*="Check monthly reports"]')
        task_input.fill(role_config['agentic_task'])
        page.locator('[data-agent-id="assistant-plan-create"]').click()
        page.get_by_text('Current Plan').wait_for(state='visible', timeout=20000)
        role_result['agentic_plan_created'] = True

        for nav in role_config['nav_checks']:
            log(f"[{role_config['label']}] nav {nav['href']}")
            page.locator(f'[data-agent-id="{nav["agent_id"]}"]').click()
            page.wait_for_url(f"**{nav['href']}", timeout=20000)
            page.get_by_text(nav.get('check_text', nav['heading']), exact=True).first.wait_for(
                state='visible',
                timeout=20000,
            )
            role_result['nav_checks'].append({'href': nav['href'], 'heading': nav['heading'], 'ok': True})
    except PlaywrightTimeoutError as exc:
        role_result['issues'].append(f'Timeout: {exc}')
    except Exception as exc:
        role_result['issues'].append(f'Error: {exc}')
    finally:
        role_result['final_url'] = page.url
        context.close()

    return role_result


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    results = {'base_url': BASE_URL, 'roles': {}}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for role in ROLES:
                results['roles'][role['label']] = run_role_flow(browser, role)
        finally:
            browser.close()

    OUTPUT_PATH.write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(json.dumps(results, indent=2), flush=True)


if __name__ == '__main__':
    main()

import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("http://localhost:3000")
        await page.wait_for_load_state("networkidle")

        # Fill the search input
        await page.fill("input[placeholder='Ingrese el expediente']", "455")

        # Click the Apply button
        await page.click("button:has-text('Aplicar')")

        # Wait for the network requests to finish
        await asyncio.sleep(5)

        await page.screenshot(path="screenshot_result.png")
        print("Screenshot saved to screenshot_result.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

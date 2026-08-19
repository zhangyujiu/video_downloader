from playwright.sync_api import sync_playwright
import time

url = "https://www.iesdouyin.com/share/video/7665530125647236386/"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        viewport={"width": 375, "height": 812},
        has_touch=True
    )
    page = context.new_page()
    
    print("Navigating to Douyin mobile share page...")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
    except Exception as e:
        print("Page navigation timeout/warning:", e)
        
    print("Waiting 5 seconds for page load...")
    time.sleep(5)
    
    # Save source and screenshot
    source = page.content()
    with open("douyin_playwright_source.html", "w", encoding="utf-8") as f:
        f.write(source)
    print("Saved page source to douyin_playwright_source.html.")
    
    page.screenshot(path="douyin_playwright_screenshot.png")
    print("Saved screenshot to douyin_playwright_screenshot.png.")
    
    # Let's inspect the DOM tags using Playwright selectors
    print("Video tags count:", page.locator("video").count())
    print("Title in DOM:", page.title())
    
    browser.close()

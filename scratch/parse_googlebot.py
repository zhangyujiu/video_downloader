with open("douyin_googlebot.html", "r", encoding="utf-8") as f:
    html = f.read()

import re

scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
print(f"Total script tags: {len(scripts)}")
for idx, s in enumerate(scripts):
    s_clean = s.strip()
    print(f"Script #{idx} length: {len(s_clean)}")
    # Print the first 1000 chars of script #0
    if idx == 0:
        print("Script #0 content:")
        print(s_clean[:2000])

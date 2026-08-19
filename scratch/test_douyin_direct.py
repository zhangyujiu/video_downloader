import requests
import re
import urllib.parse
import json

url = "https://www.iesdouyin.com/share/video/7665530125647236386/"
headers = {
    "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Referer": "https://www.douyin.com/"
}

print("Fetching page as Googlebot...")
r = requests.get(url, headers=headers, timeout=10)
html = r.text
print(f"Status Code: {r.status_code}")

with open("douyin_googlebot.html", "w", encoding="utf-8") as f:
    f.write(html)
print("Saved to douyin_googlebot.html.")

# Search for RENDER_DATA or other tags
patterns = ["RENDER_DATA", "aweme_detail", "play_addr", "_ROUTER_DATA", "video"]
for pat in patterns:
    matches = [m.start() for m in re.finditer(pat, html)]
    print(f"Pattern '{pat}': {len(matches)} matches")

if "RENDER_DATA" in html:
    idx = html.find("RENDER_DATA")
    tag_start = html.find(">", idx)
    tag_end = html.find("</script>", idx)
    content = html[tag_start+1:tag_end].strip()
    try:
        decoded = urllib.parse.unquote(content)
        data = json.loads(decoded)
        print("Parsed RENDER_DATA JSON successfully!")
        
        # Recursive search for video streams
        def find_xhs_video(obj):
            if isinstance(obj, dict):
                if "play_addr" in obj:
                    return obj["play_addr"]
                if "playAddr" in obj:
                    return obj["playAddr"]
                for k, v in obj.items():
                    res_val = find_xhs_video(v)
                    if res_val:
                        return res_val
            elif isinstance(obj, list):
                for item in obj:
                    res_val = find_xhs_video(item)
                    if res_val:
                        return res_val
            return None
            
        print("Found video block in RENDER_DATA:", str(find_xhs_video(data))[:300])
    except Exception as e:
        print("Failed to parse RENDER_DATA:", e)

# Also search for any video CDN links
cdn_patterns = ["zjcdn.com", "douyinvod.com", "amemv.com", "bytevideocdn.com"]
for cdn in cdn_patterns:
    matches = [m.start() for m in re.finditer(cdn, html)]
    if matches:
        print(f"CDN Pattern '{cdn}' found {len(matches)} times!")
        for m in matches[:2]:
            print("  Context:", html[max(0, m-80):min(len(html), m+150)])

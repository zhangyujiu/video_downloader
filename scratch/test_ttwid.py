import requests
import json

# 1. Get ttwid cookie by register
register_url = "https://ttwid.bytedance.com/ttwid/union/register/"
data = {
    "region": "cn",
    "aid": 1768,
    "needFid": "false",
    "service": "www.douyin.com",
    "migrate_info": {"ticket": "", "source": "node"}
}

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "text/plain" # ttwid endpoint expects text/plain or application/json
}

print("Registering ttwid...")
try:
    r = requests.post(register_url, data=json.dumps(data), headers=headers, timeout=10)
    print("Register Status Code:", r.status_code)
    print("Response headers:", r.headers)
    print("Response body:", r.text)
    
    # Extract ttwid from Set-Cookie header
    ttwid = r.cookies.get("ttwid")
    if not ttwid and "Set-Cookie" in r.headers:
        cookie_header = r.headers["Set-Cookie"]
        if "ttwid=" in cookie_header:
            ttwid = cookie_header.split("ttwid=")[1].split(";")[0]
            
    print("Extracted ttwid cookie:", ttwid)
    
    if ttwid:
        # 2. Try fetching the detail API using the ttwid cookie!
        detail_url = "https://www.douyin.com/aweme/v1/web/aweme/detail/?device_platform=webp&aid=6383&channel=channel_pc_web&aweme_id=7665530125647236386"
        api_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.douyin.com/video/7665530125647236386",
            "Cookie": f"ttwid={ttwid}"
        }
        print("\nFetching detail API with ttwid cookie...")
        api_res = requests.get(detail_url, headers=api_headers, timeout=10)
        print("API Status Code:", api_res.status_code)
        print("API Response length:", len(api_res.text))
        try:
            res_json = api_res.json()
            print("API successfully returned JSON!")
            print("Keys:", res_json.keys())
            if "aweme_detail" in res_json:
                print("Successfully extracted aweme_detail!")
                print("Desc:", res_json["aweme_detail"].get("desc"))
                print("Video play url:", res_json["aweme_detail"]["video"]["play_addr"]["url_list"][0])
        except Exception as json_err:
            print("Failed to parse API response as JSON:", json_err)
            print("API Text snippet:", api_res.text[:300])

except Exception as e:
    print("Error:", e)

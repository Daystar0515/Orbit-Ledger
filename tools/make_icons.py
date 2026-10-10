# Orbit 圖示：深空背景、中央的太陽、傾斜的軌道與行星。
# 用法：python3 tools/make_icons.py icons   （另外會產生 icon-1024.png，可複製到 docs/icon.png 給 README 用）
import sys, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

out = sys.argv[1]
S = 2048

def radial(size, stops, center=None, radius=None):
    """徑向漸層：stops = [(t, (r,g,b,a)), ...]，t 從 0（中心）到 1（radius）。"""
    cx, cy = center or (size / 2, size / 2)
    rad = radius or size / 2
    img = Image.new("RGBA", (size, size))
    px = img.load()
    # 先算一條 1D 色帶再查表，速度快
    lut = []
    for i in range(1025):
        t = i / 1024
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0) if t1 > t0 else 0
                lut.append(tuple(round(a + (b - a) * k) for a, b in zip(c0, c1)))
                break
        else:
            lut.append(stops[-1][1])
    for y in range(size):
        dy = (y - cy) ** 2
        for x in range(size):
            d = math.sqrt((x - cx) ** 2 + dy) / rad
            px[x, y] = lut[min(1024, int(d * 1024))]
    return img

def render(scale=1.0, size=S):
    # 背景：中央微亮的深藍紫，往外變成近黑
    bg = radial(size // 4, [(0, (34, 30, 74, 255)), (0.55, (16, 15, 38, 255)), (1.0, (6, 6, 14, 255))]).resize((size, size), Image.BICUBIC)
    img = bg.copy()
    c = size / 2
    u = size * scale  # 內容尺寸（maskable 版本會縮小）

    # 星星
    rnd = random.Random(11)
    stars = Image.new("RGBA", (size, size))
    sd = ImageDraw.Draw(stars)
    for _ in range(140):
        x, y = rnd.uniform(0, size), rnd.uniform(0, size)
        if math.hypot(x - c, y - c) < u * 0.16:
            continue
        r = rnd.choice([1.6, 2.2, 2.8, 3.6, 5.0]) * size / 2048
        a = rnd.randint(70, 230)
        sd.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
    img = Image.alpha_composite(img, stars.filter(ImageFilter.GaussianBlur(size / 2048 * 0.8)))

    # 軌道：傾斜的橢圓（像從斜上方看太陽系）
    TILT = -18
    RATIO = 0.56
    orbits = [0.20, 0.30, 0.41]
    def orbit_layer(rx_frac, width, alpha):
        L = Image.new("RGBA", (size, size))
        d = ImageDraw.Draw(L)
        rx, ry = u * rx_frac, u * rx_frac * RATIO
        d.ellipse([c - rx, c - ry, c + rx, c + ry], outline=(255, 255, 255, alpha), width=max(1, int(width)))
        return L.rotate(TILT, resample=Image.BICUBIC, center=(c, c))
    for i, rf in enumerate(orbits):
        img = Image.alpha_composite(img, orbit_layer(rf, size * 0.0042, 70 - i * 8))

    def on_orbit(rx_frac, deg):
        rx, ry = u * rx_frac, u * rx_frac * RATIO
        t = math.radians(deg)
        x, y = rx * math.cos(t), ry * math.sin(t)
        tr = math.radians(-TILT)  # PIL 的 rotate(-18) 在畫面上是順時針 18°
        return c + x * math.cos(tr) - y * math.sin(tr), c + x * math.sin(tr) + y * math.cos(tr)

    # 太陽：大片柔光 + 亮核
    glow = Image.new("RGBA", (size, size))
    gd = ImageDraw.Draw(glow)
    for rr, col in [(0.25, (255, 110, 60, 70)), (0.17, (255, 140, 70, 120)), (0.115, (255, 190, 110, 200))]:
        R = u * rr
        gd.ellipse([c - R, c - R, c + R, c + R], fill=col)
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(u * 0.05)))
    sun = radial(int(u * 0.2), [(0, (255, 248, 225, 255)), (0.55, (255, 196, 110, 255)), (0.92, (255, 128, 64, 255)), (1.0, (255, 128, 64, 0))])
    sun_full = Image.new("RGBA", (size, size))
    sun_full.paste(sun, (int(c - u * 0.1), int(c - u * 0.1)))
    img = Image.alpha_composite(img, sun_full)

    # 行星：有立體光影（左上亮、右下暗）
    def planet(cx_, cy_, r, base, light):
        L = Image.new("RGBA", (size, size))
        body = radial(int(r * 2), [(0, light + (255,)), (0.5, base + (255,)), (0.98, tuple(int(v * 0.45) for v in base) + (255,)), (1.0, (0, 0, 0, 0))],
                      center=(r * 0.7, r * 0.6), radius=r * 1.55)
        mask = Image.new("L", (int(r * 2), int(r * 2)))
        ImageDraw.Draw(mask).ellipse([0, 0, int(r * 2) - 1, int(r * 2) - 1], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(max(0.6, r * 0.02)))
        L.paste(body, (int(cx_ - r), int(cy_ - r)), mask)
        return L
    planets = [
        (orbits[0], 250, u * 0.040, (232, 70, 60), (255, 170, 150)),   # 紅：支出
        (orbits[1], 25, u * 0.058, (40, 170, 110), (170, 240, 200)),  # 綠：收入
        (orbits[2], 200, u * 0.034, (236, 120, 170), (255, 205, 225)), # 粉
    ]
    for rf, deg, r, base, light in planets:
        x, y = on_orbit(rf, deg)
        # 小小的光暈，讓行星從背景浮出來
        h = Image.new("RGBA", (size, size))
        ImageDraw.Draw(h).ellipse([x - r * 1.6, y - r * 1.6, x + r * 1.6, y + r * 1.6], fill=base + (60,))
        img = Image.alpha_composite(img, h.filter(ImageFilter.GaussianBlur(r * 0.6)))
        img = Image.alpha_composite(img, planet(x, y, r, base, light))
    return img.convert("RGB")

full = render(1.0)
full.resize((512, 512), Image.LANCZOS).save(f"{out}/icon-512.png", optimize=True)
full.resize((192, 192), Image.LANCZOS).save(f"{out}/icon-192.png", optimize=True)
full.resize((180, 180), Image.LANCZOS).save(f"{out}/apple-touch-icon.png", optimize=True)
full.resize((1024, 1024), Image.LANCZOS).save(f"{out}/icon-1024.png", optimize=True)
mask = render(0.8)  # maskable：內容縮小到安全區內
mask.resize((512, 512), Image.LANCZOS).save(f"{out}/icon-maskable-512.png", optimize=True)
print("ok")

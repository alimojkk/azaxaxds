# ⚡ نصب روی VibeNest در ۳ دقیقه

این فایل کوتاه‌ترین مسیر نصب را نشان می‌دهد؛ بدون خط فرمان، بدون Docker دستی —
فقط **Fork در گیت‌هاب** و **Deploy در VibeNest**.

---

## قدم ۱ — ریپازیتوری را Fork کنید

1. وارد صفحه ریپازیتوری پنل در گیت‌هاب شوید.
2. دکمه **Fork** را بزنید → یک کپی در حساب خودتان ساخته می‌شود.

> اگر فایل‌ها را به‌صورت ZIP دریافت کرده‌اید: یک ریپازیتوری جدید بسازید →
> **uploading an existing file** → همه فایل‌ها و پوشه‌ها را با همین ساختار آپلود کنید → **Commit changes**.

ساختار درست پروژه در گیت‌هاب:

```
.
├── docker-compose.yml     ← فایل دیپلوی VibeNest
├── Dockerfile
├── .env.example           ← APP_URL و ADMIN_PASSWORD را VibeNest خودش پر می‌کند
├── .dockerignore
├── .gitignore
├── Procfile
├── install.sh             ← فقط برای نصب روی VPS شخصی
├── package.json
├── package-lock.json
├── README.md
├── QUICKSTART.md
├── LICENSE
└── src/
    ├── server.js
    ├── lib/   (auth, activity, bootstrap, links, platform, store, sysstats, wsproxy, xray, xraydl)
    ├── routes/(api, auth, pages, sub)
    ├── views/ (dashboard, users, groups, settings, login, setup, sub pages, partials ...)
    └── public/css/style.css
```

---

## قدم ۲ — دیپلوی در VibeNest

1. وارد VibeNest شوید → **New Project → Deploy from GitHub repo**.
2. ریپازیتوری فورک‌شده را انتخاب کنید.
3. اگر از شما پرسید، این مقادیر را بگذارید:

| گزینه | مقدار |
|---|---|
| Build pack | `docker-compose` |
| Compose file | `/docker-compose.yml` |
| Internal port | `8080` |

4. **Deploy** را بزنید و حدود ۱ تا ۳ دقیقه صبر کنید.

VibeNest خودش:
- متغیرهای `APP_URL` و `ADMIN_PASSWORD` را از `.env.example` می‌سازد و پر می‌کند،
- ولوم دائمی `panel_data` را روی `/data` می‌سازد،
- و یک آدرس HTTPS مثل `https://your-panel.vibenest.net` به شما می‌دهد.

---

## قدم ۳ — ورود به پنل

1. آدرس HTTPS پروژه را باز کنید.
2. در VibeNest → **Project → Variables** مقدار `ADMIN_PASSWORD` را Reveal کنید.
3. با نام کاربری `admin` و همان رمز وارد شوید.

> اگر ترجیح می‌دهید خودتان حساب بسازید، مقدار `ADMIN_PASSWORD` را خالی بگذارید؛
> پنل در اولین اجرا صفحه **Setup** را نشان می‌دهد.

---

## قدم ۴ — ساخت اولین کاربر

1. منو → **کاربران → + کاربر جدید** (یا دکمه «کاربر سریع» در داشبورد).
2. نامی که وارد می‌کنید، دقیقاً همان ریمارک کانفیگ‌ها خواهد بود.
3. وارد صفحه کاربر شوید → **صفحه گرافیکی اشتراک** را باز کنید یا QR را اسکن کنید.
4. لینک ساب (`/sub/:token`) را می‌توانید مستقیماً در v2rayNG / Streisand / NekoBox وارد کنید.

---

## چک‌لیست سلامت دیپلوی

| بررسی | انتظار |
|---|---|
| `https://<دامنه>/health` | `{"ok":true, ...}` |
| صفحه ورود | بدون خطا باز می‌شود |
| داشبورد → وضعیت هسته Xray | «در حال اجرا» (چند ثانیه بعد از استارت) |
| لینک کانفیگ‌ها | دامنه = دامنه پروژه، پورت = `443`، `security=tls` |
| بعد از Redeploy | کاربران و تنظیمات سر جایشان هستند (ولوم `/data`) |

---

## اگر به مشکل خوردید

| مشکل | راه‌حل |
|---|---|
| بیلد fail شد | Build pack روی `docker-compose` و Compose file روی `/docker-compose.yml` باشد |
| صفحه باز نمی‌شود | Internal port باید `8080` باشد |
| رمز را نمی‌دانم | VibeNest → Variables → `ADMIN_PASSWORD` |
| داده‌ها پاک می‌شوند | ولوم `panel_data` روی مسیر `/data` باید حفظ شود |
| هسته Xray بالا نیامده | چند ثانیه صبر کنید (دانلود خودکار) و لاگ را در تنظیمات ببینید |

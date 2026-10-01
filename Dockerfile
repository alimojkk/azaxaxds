# =========================================================
#  پنل مدیریت کانفیگ — ایمیج آماده برای VibeNest
#  (Node.js + هسته Xray-core)
#
#  اصل طراحی: بیلد هرگز نباید fail شود.
#  اگر دانلود Xray در زمان بیلد به هر دلیلی (محدودیت شبکه بیلدر، قطعی موقت
#  گیت‌هاب، معماری غیرمعمول) انجام نشود، بیلد با موفقیت تمام می‌شود و خودِ
#  برنامه موقع استارت باینری را دانلود می‌کند. (src/lib/xraydl.js)
# =========================================================
FROM node:20-alpine

# ابزارهای پایه: curl/unzip برای دانلود هسته، tini برای مدیریت درست سیگنال‌ها
RUN apk add --no-cache curl unzip ca-certificates tini wget \
  && update-ca-certificates || true

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# ---- نصب وابستگی‌های Node (فقط production، بدون هیچ ماژول native) ----
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund --loglevel=error

# ---- تلاش برای جاسازی Xray-core داخل ایمیج (اختیاری و بدون ریسک) ----
ARG XRAY_VERSION=v26.9.9
ENV XRAY_VERSION=${XRAY_VERSION}
RUN set -eu; \
    mkdir -p /app/bin; \
    ARCH="$(uname -m)"; \
    case "$ARCH" in \
      x86_64)  XARCH=64 ;; \
      aarch64) XARCH=arm64-v8a ;; \
      armv7l)  XARCH=arm32-v7a ;; \
      *)       XARCH="" ;; \
    esac; \
    if [ -n "$XARCH" ]; then \
      ( curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 \
          -o /tmp/xray.zip \
          "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-${XARCH}.zip" \
        && unzip -o -q /tmp/xray.zip -d /app/bin xray \
        && chmod +x /app/bin/xray \
        && echo "Xray ${XRAY_VERSION} (${XARCH}) داخل ایمیج قرار گرفت." ) \
      || echo "هشدار: دانلود Xray در زمان بیلد انجام نشد — در زمان اجرا دانلود می‌شود."; \
      rm -f /tmp/xray.zip; \
    else \
      echo "معماری ${ARCH} در زمان بیلد پشتیبانی نشد — در زمان اجرا بررسی می‌شود."; \
    fi

# ---- کپی کد برنامه ----
COPY src ./src

# مسیر داده دائمی (روی VibeNest با یک volume به همین مسیر وصل می‌شود)
RUN mkdir -p /data && chmod 777 /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]

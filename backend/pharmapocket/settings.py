import ipaddress
import os
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name: str, *, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ImproperlyConfigured(f"{name} must be a boolean value")


def _log_level(name: str, *, default: str) -> str:
    value = os.environ.get(name, default).strip().upper()
    allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    if value not in allowed:
        raise ImproperlyConfigured(f"{name} must be one of: {', '.join(sorted(allowed))}")
    return value


def _throttle_rate(name: str, *, default: str) -> str | None:
    """Read a DRF throttle rate such as ``60/min``. Empty or ``off`` disables it."""
    value = os.environ.get(name, default).strip()
    if value.lower() in {"", "off", "none"}:
        return None

    count, sep, period = value.partition("/")
    if not sep or not count.isdigit() or not period:
        raise ImproperlyConfigured(f"{name} must look like '60/min' (or 'off' to disable)")
    # DRF only looks at the first letter of the period ("min" and "m" are the same).
    if period[0] not in {"s", "m", "h", "d"}:
        raise ImproperlyConfigured(f"{name} period must start with s, m, h or d")
    return value


def _ip_networks(name: str) -> list[str]:
    """Read a comma-separated list of IP addresses or CIDR ranges."""
    entries = [e.strip() for e in os.environ.get(name, "").split(",") if e.strip()]
    for entry in entries:
        try:
            ipaddress.ip_network(entry, strict=False)
        except ValueError as exc:
            raise ImproperlyConfigured(f"{name} contains an invalid IP or CIDR: {entry!r}") from exc
    return entries


def _cookie_samesite(name: str, *, default: str) -> str:
    value = os.environ.get(name, default).strip().lower()
    allowed = {"lax": "Lax", "strict": "Strict", "none": "None"}
    if value not in allowed:
        raise ImproperlyConfigured(f"{name} must be one of: Lax, Strict, None")
    return allowed[value]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY environment variable is required")

DEBUG = _env_bool("DJANGO_DEBUG", default=False)
BEHIND_PROXY = _env_bool("DJANGO_BEHIND_PROXY", default=False)

LOG_LEVEL = _log_level("DJANGO_LOG_LEVEL", default="DEBUG" if DEBUG else "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": "time={asctime} level={levelname} logger={name} message={message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "structured",
            "level": LOG_LEVEL,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    # Django installs its own non-propagating loggers before applying this
    # configuration. Override them explicitly so the env-driven level and the
    # same console format apply to framework and request logs as well.
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "django.server": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
    },
}

ALLOWED_HOSTS = [h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    "users.apps.UsersConfig",
    "allauth",
    "allauth.account",
    "allauth.headless",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "treebeard",
    "corsheaders",
    "rest_framework",
    "taggit",
    "modelcluster",
    "wagtail.contrib.forms",
    "wagtail.contrib.redirects",
    "wagtail.embeds",
    "wagtail.sites",
    "wagtail.users",
    "wagtail.snippets",
    "wagtail.documents",
    "wagtail.images",
    "wagtail.search",
    "wagtail.admin",
    "wagtail",
    "wagtail.api.v2",
    "content.apps.ContentConfig",
    "learning.apps.LearningConfig",
    "product.apps.ProductConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "wagtail.contrib.redirects.middleware.RedirectMiddleware",
]

ROOT_URLCONF = "pharmapocket.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "pharmapocket.wsgi.application"
ASGI_APPLICATION = "pharmapocket.asgi.application"

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required for the application to start")

DATABASES = {
    "default": dj_database_url.config(
        default=DATABASE_URL,
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr"
TIME_ZONE = "Europe/Paris"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
SITE_ID = int(os.environ.get("DJANGO_SITE_ID", "1"))

WAGTAIL_SITE_NAME = "PharmaPocket"

WAGTAILIMAGES_IMAGE_MODEL = "content.CustomImage"
WAGTAILIMAGES_RENDITION_MODEL = "content.CustomRendition"

# Upload limits enforced by the Wagtail admin and by content.views.AdminImageUploadView.
# SVG is deliberately absent: an unsanitised SVG can carry JavaScript.
WAGTAILIMAGES_EXTENSIONS = ["avif", "gif", "jpg", "jpeg", "png", "webp"]
WAGTAILIMAGES_MAX_UPLOAD_SIZE = int(
    os.environ.get("DJANGO_MAX_IMAGE_UPLOAD_SIZE", str(10 * 1024 * 1024))
)
if WAGTAILIMAGES_MAX_UPLOAD_SIZE <= 0:
    raise ImproperlyConfigured("DJANGO_MAX_IMAGE_UPLOAD_SIZE must be a positive number of bytes")

WAGTAILADMIN_BASE_URL = os.environ.get("WAGTAILADMIN_BASE_URL", "http://localhost:8000")

# Full-text search (content.search). The database backend indexes into
# wagtailsearch_indexentry (tsvector) and is kept up to date by Wagtail's signal
# handlers; existing rows need a one-off `manage.py update_index`.
# SEARCH_CONFIG is the Postgres text search configuration: "french" gives French
# stemming and stop words. Both configs are env-driven so an accent-insensitive
# configuration can be plugged in without a code change (see README, "Recherche").
# Changing either value requires a reindex.
WAGTAILSEARCH_BACKENDS = {
    "default": {
        "BACKEND": "wagtail.search.backends.database",
        "SEARCH_CONFIG": os.environ.get("DJANGO_SEARCH_CONFIG", "french"),
        # "simple" (no stemming) is what makes prefix matching usable for autocomplete.
        "AUTOCOMPLETE_SEARCH_CONFIG": os.environ.get("DJANGO_SEARCH_AUTOCOMPLETE_CONFIG", "simple"),
    }
}

DEFAULT_FROM_EMAIL = os.environ.get("DJANGO_DEFAULT_FROM_EMAIL", "no-reply@localhost")

if DEBUG:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
else:
    EMAIL_BACKEND = os.environ.get(
        "DJANGO_EMAIL_BACKEND",
        "django.core.mail.backends.smtp.EmailBackend",
    )
    EMAIL_HOST = os.environ.get("DJANGO_EMAIL_HOST", "")
    EMAIL_PORT = int(os.environ.get("DJANGO_EMAIL_PORT", "587"))
    EMAIL_HOST_USER = os.environ.get("DJANGO_EMAIL_HOST_USER", "")
    EMAIL_HOST_PASSWORD = os.environ.get("DJANGO_EMAIL_HOST_PASSWORD", "")
    EMAIL_USE_TLS = os.environ.get("DJANGO_EMAIL_USE_TLS", "1") == "1"
    EMAIL_USE_SSL = os.environ.get("DJANGO_EMAIL_USE_SSL", "0") == "1"
    SERVER_EMAIL = os.environ.get("DJANGO_SERVER_EMAIL", DEFAULT_FROM_EMAIL) 

# Rate limiting relies on the default cache. LocMemCache is per-process, so each
# gunicorn worker enforces its own budget: point DJANGO_CACHE_URL at a shared
# Redis in production to make the limits global.
CACHE_URL = os.environ.get("DJANGO_CACHE_URL", "").strip()
if CACHE_URL:
    if not CACHE_URL.startswith(("redis://", "rediss://", "unix://")):
        raise ImproperlyConfigured("DJANGO_CACHE_URL must be a redis://, rediss:// or unix:// URL")
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": CACHE_URL,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "pharmapocket-default",
        }
    }

# Number of reverse proxies in front of the app whose X-Forwarded-For entries we
# trust. Anything below that count in the header is client-supplied and must not
# be used to identify a caller. See pharmapocket.throttling.get_client_ip.
TRUSTED_PROXY_COUNT = int(
    os.environ.get("DJANGO_TRUSTED_PROXY_COUNT", "1" if BEHIND_PROXY else "0")
)
if TRUSTED_PROXY_COUNT < 0:
    raise ImproperlyConfigured("DJANGO_TRUSTED_PROXY_COUNT must be zero or positive")

# Internal clients that bypass throttling — typically the SSR frontend, whose
# requests all originate from a single address on behalf of many visitors.
THROTTLE_EXEMPT_IPS = _ip_networks("DJANGO_THROTTLE_EXEMPT_IPS")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "pharmapocket.throttling.AnonThrottle",
        "pharmapocket.throttling.UserThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": _throttle_rate("DJANGO_THROTTLE_RATE_ANON", default="60/min"),
        "user": _throttle_rate("DJANGO_THROTTLE_RATE_USER", default="300/min"),
        # Applied on top of the defaults for endpoints that verify a secret.
        "sensitive_burst": _throttle_rate("DJANGO_THROTTLE_RATE_SENSITIVE_BURST", default="5/min"),
        "sensitive_sustained": _throttle_rate(
            "DJANGO_THROTTLE_RATE_SENSITIVE_SUSTAINED", default="30/hour"
        ),
    },
}

AUTH_USER_MODEL = "users.User"

AUTHENTICATION_BACKENDS = (
    "users.auth_backends.PseudoAuthenticationBackend",
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
)

ACCOUNT_LOGIN_METHODS = {"email", "username"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "username*", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_EMAIL_VERIFICATION_SUPPORTS_RESEND = True
ACCOUNT_CHANGE_EMAIL = True

ACCOUNT_ADAPTER = "users.adapters.AccountAdapter"

# DRF throttling does not cover the allauth headless endpoints (/auth/…), which
# are plain Django views: allauth has its own limiter, configured explicitly here
# rather than left on its defaults. Rates are merged over allauth's defaults, and
# "key" buckets are scoped to the targeted email/account rather than to the IP.
ACCOUNT_RATE_LIMITS = {
    "login": "10/m/ip",
    # "key" is the submitted login: 5 failures per 5 minutes on a given account,
    # on top of a per-IP cap that covers attempts spread over many accounts.
    "login_failed": "5/m/ip,5/300s/key",
    "signup": "10/m/ip",
    "reset_password": "10/m/ip,3/m/key",
    "reset_password_from_key": "10/m/ip",
    "confirm_email": "1/180s/key",
    "change_password": "5/m/user",
    "manage_email": "10/m/user",
    "reauthenticate": "5/m/user",
}

HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": os.environ.get(
        "HEADLESS_URL_ACCOUNT_CONFIRM_EMAIL",
        "http://localhost:3000/account/verify-email/{key}",
    ),
    "account_reset_password_from_key": os.environ.get(
        "HEADLESS_URL_ACCOUNT_RESET_PASSWORD_FROM_KEY",
        "http://localhost:3000/account/password/reset/key/{key}",
    ),
    "account_signup": os.environ.get(
        "HEADLESS_URL_ACCOUNT_SIGNUP",
        "http://localhost:3000/account/signup",
    ),
}

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = (*default_headers, "x-csrftoken")

# Sans cela, le front (autre origine) ne peut pas lire l'en-tête d'un 429.
CORS_EXPOSE_HEADERS = ["Retry-After"]

CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

# Forwarded scheme and host headers are trustworthy only when every request
# reaches Django through a controlled reverse proxy that overwrites them.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if BEHIND_PROXY else None
USE_X_FORWARDED_HOST = BEHIND_PROXY

# HTTPS is the secure default outside local development. The API is designed to
# be consumed from a separate frontend origin, so production cookies use
# SameSite=None and must therefore also be marked Secure.
SECURE_SSL_REDIRECT = _env_bool("DJANGO_SECURE_SSL_REDIRECT", default=not DEBUG)
SESSION_COOKIE_SECURE = _env_bool("DJANGO_SESSION_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_SECURE = _env_bool("DJANGO_CSRF_COOKIE_SECURE", default=not DEBUG)
SESSION_COOKIE_SAMESITE = _cookie_samesite(
    "DJANGO_SESSION_COOKIE_SAMESITE",
    default="Lax" if DEBUG else "None",
)
CSRF_COOKIE_SAMESITE = _cookie_samesite(
    "DJANGO_CSRF_COOKIE_SAMESITE",
    default="Lax" if DEBUG else "None",
)
CSRF_COOKIE_DOMAIN = os.environ.get("DJANGO_CSRF_COOKIE_DOMAIN") or None

SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "0" if DEBUG else "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool(
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=not DEBUG,
)
SECURE_HSTS_PRELOAD = _env_bool("DJANGO_SECURE_HSTS_PRELOAD", default=not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

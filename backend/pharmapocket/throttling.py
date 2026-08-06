"""Rate limiting helpers shared by the DRF API and by allauth.

Both DRF and allauth resolve the client IP by reading the *leftmost* entry of
``X-Forwarded-For``, which is supplied by the client and can therefore be forged
to get a fresh bucket on every request. The helpers here resolve the IP from the
right-hand side instead, trusting only as many hops as we actually sit behind
(``settings.TRUSTED_PROXY_COUNT``).
"""

from __future__ import annotations

import ipaddress
from functools import lru_cache

from django.conf import settings
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def get_client_ip(request) -> str:
    """Return the client IP, trusting only our own reverse proxies.

    Every hop appends the address it received the request from, so the entry
    written by our outermost proxy is the ``TRUSTED_PROXY_COUNT``-th from the
    end. A header that is shorter than expected did not go through the proxy
    chain we configured, so the socket address is used instead of trusting it.
    """
    remote_addr = (request.META.get("REMOTE_ADDR") or "").strip()
    proxy_count = getattr(settings, "TRUSTED_PROXY_COUNT", 0)

    if proxy_count > 0:
        forwarded = [
            part.strip()
            for part in request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")
            if part.strip()
        ]
        if len(forwarded) >= proxy_count:
            candidate = forwarded[-proxy_count]
            if _is_ip(candidate):
                return candidate

    return remote_addr


@lru_cache(maxsize=None)
def _exempt_networks(raw: tuple[str, ...]) -> tuple:
    # Entries are validated when settings are loaded, so parsing cannot fail here.
    return tuple(ipaddress.ip_network(entry, strict=False) for entry in raw)


def is_exempt(request) -> bool:
    """Whether the caller is a trusted internal client (e.g. the SSR frontend).

    Server-side rendering funnels every visitor through a single IP, which would
    otherwise exhaust the anonymous budget for all of them at once.
    """
    raw = tuple(getattr(settings, "THROTTLE_EXEMPT_IPS", ()))
    if not raw:
        return False

    ip = get_client_ip(request)
    if not _is_ip(ip):
        return False

    address = ipaddress.ip_address(ip)
    return any(address in network for network in _exempt_networks(raw))


class _ProxyAwareThrottleMixin:
    def get_ident(self, request) -> str:
        return get_client_ip(request) or super().get_ident(request)

    def allow_request(self, request, view) -> bool:
        if is_exempt(request):
            return True
        return super().allow_request(request, view)


class AnonThrottle(_ProxyAwareThrottleMixin, AnonRateThrottle):
    """Per-IP budget for unauthenticated traffic (scope ``anon``)."""


class UserThrottle(_ProxyAwareThrottleMixin, UserRateThrottle):
    """Per-account budget, falling back to the IP when anonymous (scope ``user``)."""


class SensitiveBurstThrottle(_ProxyAwareThrottleMixin, UserRateThrottle):
    """Short-window budget for endpoints that check a password or a secret."""

    scope = "sensitive_burst"


class SensitiveSustainedThrottle(_ProxyAwareThrottleMixin, UserRateThrottle):
    """Long-window budget, so a slow brute-force cannot ride under the burst limit."""

    scope = "sensitive_sustained"

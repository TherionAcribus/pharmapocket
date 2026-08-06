from __future__ import annotations

from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import RequestFactory, TestCase, override_settings
from rest_framework.throttling import SimpleRateThrottle

from pharmapocket.throttling import get_client_ip, is_exempt


def throttle_rates(**rates: str):
    """Abaisse les quotas le temps d'un bloc ``with``.

    DRF fige ``THROTTLE_RATES`` sur la classe à l'import, donc ``override_settings``
    seul ne suffit pas à changer les quotas.
    """
    merged = {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], **rates}
    return patch.object(SimpleRateThrottle, "THROTTLE_RATES", merged)


class GetClientIpTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def _request(self, *, remote_addr="203.0.113.9", forwarded=None):
        extra = {"REMOTE_ADDR": remote_addr}
        if forwarded is not None:
            extra["HTTP_X_FORWARDED_FOR"] = forwarded
        return self.factory.get("/", **extra)

    @override_settings(TRUSTED_PROXY_COUNT=0)
    def test_without_proxy_the_socket_address_wins(self):
        self.assertEqual(get_client_ip(self._request(forwarded="1.2.3.4")), "203.0.113.9")

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_behind_one_proxy_the_last_forwarded_entry_is_used(self):
        self.assertEqual(get_client_ip(self._request(forwarded="198.51.100.7")), "198.51.100.7")

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_spoofed_prefix_is_ignored(self):
        """Un client qui préfixe l'en-tête ne doit pas pouvoir changer de compteur."""
        request = self._request(forwarded="1.2.3.4, 198.51.100.7")
        self.assertEqual(get_client_ip(request), "198.51.100.7")

    @override_settings(TRUSTED_PROXY_COUNT=2)
    def test_header_shorter_than_the_proxy_chain_is_not_trusted(self):
        self.assertEqual(get_client_ip(self._request(forwarded="1.2.3.4")), "203.0.113.9")

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_invalid_forwarded_value_falls_back_to_socket_address(self):
        self.assertEqual(get_client_ip(self._request(forwarded="not-an-ip")), "203.0.113.9")

    @override_settings(TRUSTED_PROXY_COUNT=0, THROTTLE_EXEMPT_IPS=["10.0.0.0/8"])
    def test_exempt_ranges_match_by_network(self):
        self.assertTrue(is_exempt(self._request(remote_addr="10.4.5.6")))
        self.assertFalse(is_exempt(self._request(remote_addr="203.0.113.9")))

    @override_settings(TRUSTED_PROXY_COUNT=0, THROTTLE_EXEMPT_IPS=[])
    def test_no_exemption_when_the_list_is_empty(self):
        self.assertFalse(is_exempt(self._request(remote_addr="10.4.5.6")))


@override_settings(TRUSTED_PROXY_COUNT=0, THROTTLE_EXEMPT_IPS=[])
class ThrottlingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user(
            username="throttled", email="throttled@example.com", password="s3cret-pw"
        )

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_anonymous_requests_are_throttled(self):
        with throttle_rates(anon="2/min"):
            self.assertEqual(self.client.get("/api/v1/auth/csrf/").status_code, 200)
            self.assertEqual(self.client.get("/api/v1/auth/csrf/").status_code, 200)
            self.assertEqual(self.client.get("/api/v1/auth/csrf/").status_code, 429)

    def test_authenticated_requests_use_their_own_budget(self):
        self.client.force_login(self.user)
        with throttle_rates(anon="1/min", user="3/min"):
            for _ in range(3):
                self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 200)
            self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 429)

    @override_settings(THROTTLE_EXEMPT_IPS=["127.0.0.0/8"])
    def test_exempt_clients_bypass_the_limit(self):
        with throttle_rates(anon="1/min"):
            for _ in range(3):
                self.assertEqual(self.client.get("/api/v1/auth/csrf/").status_code, 200)

    def test_account_delete_uses_the_sensitive_scope(self):
        self.client.force_login(self.user)
        with throttle_rates(anon="100/min", user="100/min", sensitive_burst="2/min"):
            for _ in range(2):
                self.assertEqual(self._delete_account("wrong").status_code, 400)
            self.assertEqual(self._delete_account("wrong").status_code, 429)

    def test_sustained_scope_catches_a_slow_brute_force(self):
        self.client.force_login(self.user)
        with throttle_rates(
            anon="100/min", user="100/min", sensitive_burst="100/min", sensitive_sustained="2/hour"
        ):
            for _ in range(2):
                self.assertEqual(self._delete_account("wrong").status_code, 400)
            self.assertEqual(self._delete_account("wrong").status_code, 429)

    def test_headless_login_is_rate_limited(self):
        """Les endpoints allauth ne passent pas par DRF : ils ont leur propre limiteur."""
        statuses = [self._failed_login().status_code for _ in range(12)]
        self.assertIn(429, statuses)
        self.assertEqual(statuses[0], 400)  # Le premier essai est traité, pas bloqué.

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_forged_forwarded_header_does_not_reset_the_allauth_bucket(self):
        statuses = [
            self._failed_login(forwarded=f"10.0.0.{i}, 198.51.100.7").status_code for i in range(12)
        ]
        self.assertIn(429, statuses)

    def _failed_login(self, *, forwarded: str | None = None):
        extra = {"HTTP_X_FORWARDED_FOR": forwarded} if forwarded else {}
        return self.client.post(
            "/auth/browser/v1/auth/login",
            {"username": self.user.username, "password": "definitely-wrong"},
            content_type="application/json",
            **extra,
        )

    def _delete_account(self, password: str):
        return self.client.post(
            "/api/v1/auth/account/delete/",
            {"password": password},
            content_type="application/json",
        )

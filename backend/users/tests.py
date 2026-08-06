from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from users.auth_backends import PseudoAuthenticationBackend


class PseudoAuthenticationBackendTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user(
            username="u1", email="u1@example.com", password="pw", pseudo="Zoe"
        )

    def setUp(self):
        self.backend = PseudoAuthenticationBackend()

    def test_authenticates_with_pseudo_case_insensitively(self):
        self.assertEqual(self.backend.authenticate(None, username="zoe", password="pw"), self.user)
        self.assertEqual(self.backend.authenticate(None, username=" Zoe ", password="pw"), self.user)

    def test_rejects_wrong_password(self):
        self.assertIsNone(self.backend.authenticate(None, username="Zoe", password="nope"))

    def test_rejects_unknown_pseudo(self):
        self.assertIsNone(self.backend.authenticate(None, username="inconnu", password="pw"))

    def test_rejects_inactive_user(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.addCleanup(lambda: get_user_model().objects.filter(pk=self.user.pk).update(is_active=True))
        self.assertIsNone(self.backend.authenticate(None, username="Zoe", password="pw"))

    def test_missing_credentials_return_none(self):
        self.assertIsNone(self.backend.authenticate(None, username="", password="pw"))
        self.assertIsNone(self.backend.authenticate(None, username="Zoe", password=None))

    def test_unknown_pseudo_still_hashes_password(self):
        """Protection contre l'énumération d'utilisateurs par mesure de timing."""
        User = get_user_model()
        with patch.object(User, "set_password") as set_password:
            self.backend.authenticate(None, username="inconnu", password="pw")
        set_password.assert_called_once_with("pw")

    def test_inactive_user_still_checks_password(self):
        """Un compte inactif ne doit pas répondre plus vite qu'un compte actif."""
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.addCleanup(lambda: get_user_model().objects.filter(pk=self.user.pk).update(is_active=True))
        with patch.object(
            get_user_model(), "check_password", return_value=False
        ) as check_password:
            self.assertIsNone(self.backend.authenticate(None, username="Zoe", password="pw"))
        check_password.assert_called_once_with("pw")

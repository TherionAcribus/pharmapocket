"""Permissions partagées par les vues de l'application ``content``."""

from rest_framework.permissions import BasePermission


class IsStaff(BasePermission):
    """Réserve une vue aux utilisateurs authentifiés membres du staff."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_staff

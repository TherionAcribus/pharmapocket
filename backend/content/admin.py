from django.contrib import admin

from .models import Deck, DeckCard, UserDeckProgress


class DeckCardInline(admin.TabularInline):
    model = DeckCard
    extra = 0
    fields = ("microarticle", "is_optional", "notes", "added_at")
    readonly_fields = ("added_at",)
    ordering = ("sort_order", "id")


@admin.register(Deck)
class DeckAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "type", "status", "user", "is_default", "sort_order", "updated_at")
    list_filter = ("type", "status", "is_default")
    search_fields = ("name",)
    inlines = (DeckCardInline,)


@admin.register(UserDeckProgress)
class UserDeckProgressAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "deck",
        "started_at",
        "last_seen_at",
        "cards_seen_count",
        "cards_done_count",
        "mode_last",
        "last_card",
    )
    list_filter = ("mode_last",)
    search_fields = ("user__email", "user__username", "deck__name")

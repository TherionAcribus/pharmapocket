from django.urls import path

from .views import ProgressImportView, ProgressListView, ProgressUpsertView

urlpatterns = [
    path("progress/", ProgressListView.as_view(), name="progress-list"),
    path("progress/import/", ProgressImportView.as_view(), name="progress-import"),
    path("progress/<int:lesson_id>/", ProgressUpsertView.as_view(), name="progress-upsert"),
]

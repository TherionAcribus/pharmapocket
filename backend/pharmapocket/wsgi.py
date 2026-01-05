import os
from pathlib import Path

from dotenv import load_dotenv
from django.core.wsgi import get_wsgi_application

project_root = Path(__file__).resolve().parent.parent
load_dotenv(project_root / ".env")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pharmapocket.settings")

application = get_wsgi_application()

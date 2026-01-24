#!/usr/bin/env python
"""
Pour Clever Cloud, le manage.py doit être à la racine.
Ce fichier est donc un wrapper pour le rendre accessible.
"""

import os
import sys
from pathlib import Path

def main():
    BASE_DIR = Path(__file__).resolve().parent
    # Ajoute ./backend au PYTHONPATH pour trouver "pharmapocket"
    sys.path.insert(0, str(BASE_DIR / "backend"))

    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE",
        os.getenv("DJANGO_SETTINGS_MODULE", "pharmapocket.settings"),
    )

    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)

if __name__ == "__main__":
    main()

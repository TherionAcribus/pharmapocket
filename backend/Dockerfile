FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# deps système minimales (ok pour psycopg / pillow si besoin on ajustera)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --upgrade pip && python -m pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["bash","-lc","python manage.py migrate && python manage.py collectstatic --noinput && gunicorn pharmapocket.wsgi:application --bind 0.0.0.0:8000"]

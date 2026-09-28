# Build context: repository root
FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY apps/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/api/app ./app
# model registry produced by services/ml/train.py (optional)
COPY services/ml/artifacts/registry.json /srv/services/ml/artifacts/registry.json
RUN useradd -r -u 10001 iris && chown -R iris /srv
USER iris
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

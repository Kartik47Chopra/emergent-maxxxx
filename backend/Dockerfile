FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++

# Copy requirements and install (excluding unavailable private packages)
COPY requirements_render.txt .
RUN pip install --no-cache-dir -r requirements_render.txt

# Copy application code
COPY . .

# Add mock package to Python path
ENV PYTHONPATH="/app/mock_pkgs:$PYTHONPATH"

# Expose port (Render sets PORT env var)
ENV PORT=8000
EXPOSE $PORT

# Run the server
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN chmod +x scripts/bootstrap-python.sh socratink-loop-server \
  && PYTHON_BOOTSTRAP=python3 ./scripts/bootstrap-python.sh

ENV PORT=8787
ENV PYTHON=/app/.venv/bin/python

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "loop-server.mjs"]

FROM mcr.microsoft.com/playwright:v1.54.1-jammy

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir fastembed

WORKDIR /workspace

COPY . /workspace

RUN cd /workspace/tools/site-ops && npm ci

CMD ["sleep", "infinity"]

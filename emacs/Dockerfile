FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends emacs-nox ca-certificates \
  && rm -rf /var/lib/apt/lists/*

CMD ["emacs", "--fg-daemon=toolkit"]

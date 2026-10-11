# Preflight — make targets. Services run in Docker Compose; fixers + Entire run on the host.
SHELL := /bin/bash
TARGET ?= ../acmesales-copilot
MODE ?= dev
PROXY_PORT ?= 8300
export PATH := $(HOME)/.local/bin:$(PATH)

.PHONY: setup up down logs dev-host target-host proxy-host api-host web-host run run-full demo test regress stop clean-ledger

setup:            ## install python deps for both repos + web deps
	uv sync
	cd $(TARGET) && uv sync
	cd apps/web && npm install --no-audit --no-fund

up:               ## start target, proxy, api, web in Docker
	docker compose up -d --build
	@echo "target :8100  proxy :8300  api :8200  web :3000"

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

# --- host mode (escape hatch when Docker is slow) ---
target-host:
	cd $(TARGET) && CRUSTDATA_BASE_URL=http://127.0.0.1:$(PROXY_PORT) uv run uvicorn app.main:app --host 127.0.0.1 --port 8100
proxy-host:
	uv run preflight proxy --port $(PROXY_PORT)
api-host:
	uv run preflight web --port 8200
web-host:
	cd apps/web && npm run dev
dev-host:         ## tmux session with target, proxy, api, web on the host
	tmux kill-session -t preflight 2>/dev/null || true
	tmux new-session -d -s preflight -n target 'make target-host'
	tmux new-window -t preflight -n proxy 'make proxy-host'
	tmux new-window -t preflight -n api 'make api-host'
	tmux new-window -t preflight -n web 'make web-host'
	@echo "tmux attach -t preflight"

run:              ## dev-mode assessment
	uv run preflight run $(TARGET) --mode $(MODE) $(if $(ATTACKS),--attacks $(ATTACKS),)
run-full:
	uv run preflight run $(TARGET) --mode full

demo: up          ## full demo from a fresh clone: services up, then the full loop
	uv run preflight init $(TARGET)
	uv run preflight run $(TARGET) --mode full

test:
	uv run pytest -q
	cd $(TARGET) && make test

regress:
	uv run preflight regress $(TARGET)

stop:
	uv run preflight stop

clean-ledger:
	rm -rf ledger/* && touch ledger/.gitkeep

regress-demo:     ## reintroduce the D1 weakness in the target with a plausible refactor commit, then run the regression suite
	./scripts/regress-demo.sh $(TARGET)
	uv run preflight regress $(TARGET) || true

video:            ## render the explainer with measured numbers from out/report.json
	python3 scripts/video-props.py
	cd apps/video && npx remotion render PreflightExplainer out/preflight-explainer.mp4 --browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

demo-reset:       ## reset the target to v0-unfixed and clear regressions + ledger before recording
	./scripts/demo-reset.sh $(TARGET)

demo-video:       ## record the dashboard with Playwright and render the captioned product demo
	cd apps/video && node scripts/record-dashboard.mjs && for f in public/clips/*.webm; do ffmpeg -y -loglevel error -i "$$f" -c:v libx264 -pix_fmt yuv420p -r 30 -crf 20 -movflags +faststart "$${f%.webm}.mp4" && rm "$$f"; done && npx remotion render PreflightProductDemo out/preflight-product-demo.mp4 --browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" && cp out/preflight-product-demo.mp4 ../../docs/videos/

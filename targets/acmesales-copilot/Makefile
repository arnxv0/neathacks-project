.PHONY: serve test seed-db reset
PORT ?= 8100
serve:
	uv run uvicorn app.main:app --host 0.0.0.0 --port $(PORT)
seed-db:
	uv run python -m app.seed_db
test:
	uv run pytest -q

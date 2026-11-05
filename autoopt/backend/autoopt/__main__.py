"""python -m autoopt [--host 127.0.0.1] [--port 8000]"""
import argparse

import uvicorn

from .app import create_app


def main():
    ap = argparse.ArgumentParser(description="AutoOpt optimization laboratory")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--db", default=None, help="SQLite file (default: backend/.data/autoopt.sqlite3)")
    args = ap.parse_args()
    uvicorn.run(create_app(args.db), host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()

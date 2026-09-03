# Running the app with Docker

Everything you need, in order. No Docker knowledge assumed.

---

## What this actually does

Four programs make up the app, and Docker runs all four for you:

| | what it is | where you see it |
|---|---|---|
| **web** | the app your recruiters use | http://localhost:3007 |
| **api** | the backend all data goes through | http://localhost:3004 |
| **admin** | the platform console | http://localhost:3010 |
| **worker** | runs slow jobs in the background | nowhere — no web page |

The database is **not** in Docker. It stays where it is, and the containers connect to it.

---

## Before anything else: start the engine

Docker needs a small background service called **Colima**. It does **not** start by itself after
you restart your Mac.

```bash
colima start
```

Takes about 30 seconds. Check it whenever something seems broken:

```bash
colima status
```

> **Want it to start automatically from now on?**
> `brew services start colima` — then you never think about this again.

---

## The four commands you need

```bash
pnpm docker:migrate     # 1. update the database   (run this first)
pnpm docker:up          # 2. start the app
pnpm docker:ps          # 3. check everything is running
pnpm docker:down        # 4. stop the app
```

That's it. In normal use you'll only ever type `docker:up` and `docker:down`.

### Why `docker:migrate` comes first

It applies any database changes. It runs once, prints what it did, and exits — it is not
something that stays running.

**Run it whenever you pull new code.** If nothing changed it just says
`No pending migrations to apply`, which is fine and means you're up to date.

---

## Checking it worked

```bash
pnpm docker:ps
```

You want to see four lines, all saying **Up**:

```
admin    Up 2 minutes
api      Up 2 minutes (healthy)
web      Up 2 minutes
worker   Up 2 minutes
```

Then open **http://localhost:3007** and sign in.

> `(healthy)` on the api line is a good sign — it means the api has reached the database.

---

## Seeing what's happening

```bash
pnpm docker:logs
```

Shows live output from all four. Press **Ctrl-C** to stop watching — this does **not** stop the
app, it just stops showing you the messages.

One service at a time:

```bash
docker compose --env-file .env.docker.local logs -f api
```

---

## After you change code

```bash
pnpm docker:up
```

It rebuilds whatever changed and restarts it. You do not need to stop it first.

If something feels stale, do a clean restart:

```bash
pnpm docker:down
pnpm docker:up
```

---

## When something is wrong

### "Cannot connect to the Docker daemon"

The engine isn't running.

```bash
colima start
```

### "port is already allocated"

Something outside Docker is already using 3007, 3004 or 3010 — usually a `pnpm dev` you left
running in another terminal. Close that terminal, then:

```bash
pnpm docker:up
```

To find what's holding a port:

```bash
lsof -nP -iTCP:3007 -sTCP:LISTEN
```

### A build fails with "ENOSPC" or "no space left"

Docker has filled its disk with old build files. Safe to clear:

```bash
docker builder prune -af
```

The next build will be slower — that's the only cost.

### The worker keeps restarting

Check what it's saying:

```bash
docker compose --env-file .env.docker.local logs worker --tail 30
```

If it mentions **permission denied for database**, the database user needs one grant:

```sql
GRANT CREATE ON DATABASE <your_database> TO <your_app_user>;
```

The worker's job queue creates its own tables, so it needs that. This applies on any server you
deploy to, not just here.

---

## Freeing up your Mac's memory

Docker holds about 8GB while it's running. When you're done for the day:

```bash
pnpm docker:down    # stop the app
colima stop         # stop the engine and release the memory
```

Next time, `colima start` then `pnpm docker:up`.

---

## Which database it uses

The file **`.env.docker.local`** decides. It is not committed to git — it lives only on your
machine — and right now it points at your **local** database, so nothing here can touch the shared
one.

To point at a different database, change `DATABASE_URL` and `DIRECT_URL` in that file, then
`pnpm docker:down && pnpm docker:up`.

> **One catch worth knowing.** `NEXT_PUBLIC_API_URL` in that file is baked into the app **when the
> image is built**, not when it starts. If you change it, you must rebuild — restarting is not
> enough. `pnpm docker:up` rebuilds, so just run that.

---

## Command reference

| Command | What it does |
|---|---|
| `colima start` | Start the Docker engine |
| `colima status` | Is the engine running? |
| `colima stop` | Stop the engine, free ~8GB of memory |
| `pnpm docker:migrate` | Apply database changes, then exit |
| `pnpm docker:up` | Build and start all four services |
| `pnpm docker:down` | Stop and remove them |
| `pnpm docker:ps` | Show what's running |
| `pnpm docker:logs` | Watch live output (Ctrl-C to stop watching) |
| `docker system df` | How much disk Docker is using |
| `docker builder prune -af` | Reclaim that disk space |

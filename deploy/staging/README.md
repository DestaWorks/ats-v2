# Staging, as it actually is

A record of how `13.140.40.247` really runs, written on 3 October 2026 after three upload faults
turned out to be configuration that existed nowhere but on the box. Rebuild staging without this and
all three come back.

**This describes reality, not the target.** The target is `deploy/docker-compose.remote.yml` plus
`deploy/rollout.sh`, which pull prebuilt images from GHCR. Neither is in use — see *Why deploys are
manual* below.

---

## The box is shared

`13.140.40.247` runs **two unrelated stacks on one Docker daemon and one nginx**: ours, and another
client's EMR (`emr-openfga`, `emr-postgres`, `emr-redis`, plus PM2-managed host processes under the
`deploy` user).

- Never run a bare `docker compose down`, `docker system prune`, or a daemon restart.
- nginx serves both: `sites-enabled/` holds `destaworks-*.conf` **and** `emr-*.conf`. Always
  `nginx -t` before `nginx -s reload` — a bad file takes the EMR down too.
- Never write backups into `sites-enabled/`. nginx globs that directory, so a `.bak` file becomes a
  duplicate `server` block and the whole config fails to load. Keep them in `/root/nginx-backups/`.
- A full image build uses every core. Check `uptime` first and build when the box is idle.

## What runs where

| Thing | Managed by | Published on |
|---|---|---|
| `api` | compose (`docker-compose.staging.yml`) | `127.0.0.1:4004` |
| `web` | compose | `127.0.0.1:4003` |
| `admin` | compose | `127.0.0.1:4005` |
| `worker` | compose | — |
| `redis` | compose | — (project network only) |
| **`postgres`** | **bare `docker run`** | `127.0.0.1:5432` |
| **`seaweedfs`** | **bare `docker run`** | `127.0.0.1:8333` |

The live compose file is at `/srv/destaworks/shared/docker-compose.local.yml`;
`docker-compose.staging.yml` here is a verbatim copy. Postgres and SeaweedFS are deliberately **not**
in it — they are stateful and predate it. Their exact commands are below, because that is the part
that was previously written down nowhere.

### SeaweedFS

```bash
docker run -d --name desta-ats-seaweedfs \
  --network destaworks-net --restart unless-stopped --memory 1g \
  -p 127.0.0.1:8333:8333 \
  -v destaworks_seaweedfs:/data \
  chrislusf/seaweedfs@sha256:4e61d15fd35994cb1e43e1e553dff106794841fd9a99ade2fc8c8bfce4d7872d \
  server -dir=/data -s3 -s3.config=/data/s3.json -ip=desta-ats-seaweedfs \
         -master.volumeSizeLimitMB=2048 -volume.max=50
```

Three flags here are load-bearing, and each one caused an outage by its absence:

- **`-volume.max=50`.** SeaweedFS allocates volumes **per bucket**, and the default ceiling is far
  too low. Staging ran out: the default collection had taken 7 of 13 slots, `resumes` the other 6,
  and `avatars` got **zero** — so every avatar upload failed with
  `failed to find writable volumes for collection:avatars`. Check headroom with
  `wget -qO- http://127.0.0.1:9333/dir/status` and watch `Free`.
- **`-p 127.0.0.1:8333:8333`.** Without it nothing outside the Docker network can reach the store,
  so nginx cannot proxy avatar images.
- **`-s3.config=/data/s3.json`.** Identities, including the anonymous read that makes avatars
  loadable. See `seaweedfs-identities.example.json`. The file must be readable inside the container
  (mode 644) and is read **only at startup** — editing it requires recreating the container.

### Postgres

Also a bare `docker run`, named `desta-ats-postgres`, on `127.0.0.1:5432`. **Do not recreate it
casually** — it holds the real data. Check its exact arguments with `docker inspect` before touching
anything.

## Why avatars need all of this

Resumes use short-lived **signed** URLs, so they work with no public exposure at all. Avatars are a
*public* bucket: `uploadPublic` stores the object and returns
`${S3_PUBLIC_URL_BASE}/${bucket}/${key}`, which the browser fetches directly with **no signature**.
That needs three things to line up, and all three were wrong at once:

1. the store reachable from the internet — the nginx route below
2. anonymous read on that bucket — the `anonymous` identity, scoped to `Read:avatars`
3. `S3_PUBLIC_URL_BASE` set to a **publicly resolvable** URL

It was set to `http://desta-ats-seaweedfs:8333`, a Docker-internal hostname. Uploads succeeded and
every avatar rendered as a broken image.

```
S3_PUBLIC_URL_BASE="https://13.140.40.247.nip.io/files"
```

**This is a deliberate trade-off, not a finished design.** Avatars are now readable by anyone with
the URL. Keys are `u/{userId}/avatar.jpg` and user ids appear in API responses, so treat them as
*unlisted*, not private. For production, serve avatars through signed URLs the way resumes already
are, and drop both the anonymous identity and the nginx route.

## nginx

`nginx/` holds verbatim copies of the three `destaworks-*.conf` files from
`/etc/nginx/sites-enabled/`. The EMR's own configs sit beside them on the host and are not copied
here — they are not ours.

| Host | Proxies to |
|---|---|
| `13.140.40.247.nip.io` | web on `4003`, plus `/files/avatars/` → SeaweedFS on `8333` |
| `api.13.140.40.247.nip.io` | api on `4004` |
| `admin.13.140.40.247.nip.io` | admin on `4005` |

The route is `/files/avatars/`, not `/files/`, on purpose: only the avatars bucket is reachable even
if the s3.json scoping were ever loosened. TLS is Certbot-managed against
`/etc/letsencrypt/live/13.140.40.247.nip.io/`, which is why the route is a path on the existing host
rather than a new subdomain — a new name would need its own certificate.

## Environment files

Per-service files under `/srv/destaworks/shared/`, referenced by `env_file:` and never committed:
`.env.api`, `.env.worker`, `.env.web`, `.env.admin`, and a `.env.dbhost.*` alongside each.

Variables worth knowing (names only — values live on the host):

| Variable | Note |
|---|---|
| `S3_ENDPOINT` | internal: `http://desta-ats-seaweedfs:8333` |
| `S3_PUBLIC_URL_BASE` | **must be publicly resolvable** — see above |
| `DB_POOL_MAX` | total pool budget for the API. Divided across cluster workers at fork time |
| `API_WORKERS` | unset or 1 on staging, deliberately: the box is shared and more workers take cores from the EMR |
| `NEXT_PUBLIC_API_URL` | baked at **build** time, not read at runtime — a wrong value means a rebuild |

Changing an `env_file` needs `up -d --force-recreate <service>`. A plain `docker restart` does
**not** re-read it, which is a quiet way to believe you have deployed a change you have not.

## Deploying

```bash
# 1. ship the committed source (the release dir has no .git)
git archive --format=tar <sha> | gzip | \
  ssh root@13.140.40.247 "mkdir -p /srv/destaworks/releases/<sha> && gunzip | tar -x -C /srv/destaworks/releases/<sha>"

# 2. build on the host — ~12 min, uses every core, so pick a quiet moment
cd /srv/destaworks/releases/<sha>
docker build --target api --build-arg NEXT_PUBLIC_API_URL=https://api.13.140.40.247.nip.io \
  -t desta-ats/api:<sha>-apex .
docker build --target worker -t desta-ats/worker:<sha> .

# 3. swap, one service at a time. The old images stay, so rollback is the same command
cd /srv/destaworks/shared
REF=<sha> docker compose -f docker-compose.local.yml up -d api worker
curl -s http://127.0.0.1:4004/health     # expect {"ok":true,...}
```

Build first, swap second: a failed build then leaves the running container untouched.

### Why deploys are manual

`.github/workflows/deploy.yml` already builds every image, publishes to GHCR, migrates and waits for
readiness. It has never been switched on:

- no repo secrets or variables are set (`DEPLOY_HOOK_URL`, `API_HEALTH_URL`,
  `NEXT_PUBLIC_API_URL`), so the workflow fails by design rather than deploying
- the GHCR packages are private and the host has no registry login, so it cannot pull
- the live compose references hand-built local tags, not GHCR ones

Wiring those three turns a 12-minute build on a shared box into a seconds-long pull, and is the
single highest-value fix to this setup. Until then, every deploy competes with the EMR for CPU.

### An api-only build is not cheap

The Dockerfile's `build` stage runs `pnpm app:build` and `pnpm admin:build` — both Next builds —
above the point where the `api` target takes its artefacts, and `COPY . .` sits above them. So any
source change rebuilds the Next apps even when only the API is being deployed. Splitting that stage
would turn a ~12 minute deploy into about one minute.

# Deploying ATS to a host

The pipeline is `.github/workflows/deploy.yml`: it builds five images, pushes them to ghcr,
applies migrations, then asks the host to roll out one revision and waits for `/health` to prove
it. The host's only job is to pull a tag and restart — it never builds, and it never decides which
revision it is on.

Staging and production differ by **environment only**: the same compose file, the same rollout
script, the same workflow, with different values. Two things are NOT the same and must not be
shared — see "What differs" below.

## One-time host setup

1. **Registry access** — a GitHub PAT with `read:packages`, as the `deploy` user:
   ```
   echo "$PAT" | docker login ghcr.io -u <github-user> --password-stdin
   ```

2. **Files** — copy onto the host:
   ```
   deploy/docker-compose.remote.yml -> /srv/destaworks/shared/docker-compose.remote.yml
   deploy/rollout.sh                -> /srv/destaworks/rollout.sh   (chmod +x)
   ```

3. **Env files** — `/srv/destaworks/shared/` needs `.env.api`, `.env.web`, `.env.admin`, readable
   only by `deploy` (`chmod 600`).

4. **A way for the workflow to reach the host.** Either a self-hosted GitHub runner on the box, or
   a webhook that runs `rollout.sh "$ref"`. **Prefer the runner**: a deploy webhook is an
   unauthenticated "run this on my server" endpoint, while a runner connects outbound and needs no
   inbound hole.

5. **GitHub environment** (`staging` or `production`):
   ```
   secrets: DEPLOY_HOOK_URL, DEPLOY_HOOK_WEB_URL, DIRECT_URL
   vars:    API_HEALTH_URL, WEB_HEALTH_URL, WEB_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SENTRY_DSN
   ```
   `API_HEALTH_URL` must be `/health` (readiness), never `/health/live` — liveness passes with an
   unreachable database, which is the exact failure a deploy gate exists to catch.

## Running beside an existing deployment

The compose file binds **4003/4004/4005**, not 3003/3004/3005, so it can run alongside a systemd
deployment that still owns the lower ports. Verify the containers on the high ports, then cut over
by changing one `proxy_pass` per nginx vhost and reloading. Rolling back is the same edit reversed;
nothing is deleted at any point.

Cutover, once containers are proven:

```
systemctl disable --now destaworks-api destaworks-web destaworks-admin destaworks-worker
# edit the three vhosts: 3003->4003, 3004->4004, 3005->4005
nginx -t && systemctl reload nginx
```

`disable --now` stops without removing, so re-enabling is one command.

## What differs between staging and production

Same mechanism, different values — and three things that are not merely values:

- **Secrets.** Separate `BETTER_AUTH_SECRET`, database credentials, OAuth clients. A staging
  compromise must not be a production compromise.
- **Outbound integrations.** Staging points SMTP at Ethereal (captured, never delivered) and
  should use separate Apollo/Hunter/RapidAPI keys, or staging burns production quota and can email
  real people.
- **The `web` image is environment-specific.** `NEXT_PUBLIC_API_URL` is baked in at build time, so
  the same SHA produces a different `web` image per environment. The tag must carry the
  environment or a production build overwrites staging's and points its browser bundle at the
  production API.

## Rollback

```
/srv/destaworks/rollout.sh <previous-sha>
```
The last healthy revision is in `/srv/destaworks/shared/CURRENT_REF`.

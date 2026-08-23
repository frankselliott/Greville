# Greville Shadow Visualiser v1.1-AB — Cloudflare deployment

Target: `https://greville.nrltipping.com`

## What this is

`public/index.html` is the frozen visualiser, byte-identical to the delivered
single-file build:

    SHA-256  cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f
    bytes    67,636

It is fully self-contained — model data, solar code, shadow engine and UI are
all inlined. It makes no network requests at runtime. Nothing here recomputes
or modifies the frozen v1.1-AB model.

## Prerequisites

1. Node.js 18+.
2. The `nrltipping.com` zone must sit on the **same Cloudflare account** as the
   API token you use.
3. An API token with, at minimum:
   - Account → Workers Scripts → **Edit**
   - Zone → Workers Routes → **Edit** (on nrltipping.com)
   - Zone → DNS → **Edit** (on nrltipping.com — needed so the custom domain
     can create its record)
   - Zone → Zone → **Read**

## Deploy

    cd nrltipping-greville
    export CLOUDFLARE_API_TOKEN='<token>'
    npx wrangler@latest deploy

First run takes a minute or two while Cloudflare provisions the DNS record and
the TLS certificate for `greville.nrltipping.com`.

## Verify

    curl -sSI https://greville.nrltipping.com | head -20
    curl -sS  https://greville.nrltipping.com | sha256sum
    # expect cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f

Then open it in a browser and confirm the QA readout: at the preset governing
instant the live panel must show Building A = 0.000 m² and the live loss within
0.001 m² of the frozen peak.

## If you would rather use a path on the apex domain

Replace the `[[routes]]` block in `wrangler.toml` with:

    [[routes]]
    pattern = "nrltipping.com/greville*"
    zone_name = "nrltipping.com"

Note that this puts the worker in front of part of the apex domain's traffic.
The subdomain form above is cleaner and does not touch the existing site.

## Access control — read this before deploying

`nrltipping.com` is a public domain. Once deployed, anyone with the URL can
open the visualiser. `_headers` sets `X-Robots-Tag: noindex, nofollow` and
`robots.txt` disallows everything, which keeps it out of search engines but is
**not** access control.

For material tied to a live Planning & Environment Court appeal, put Cloudflare
Access in front of it (Zero Trust → Access → Applications → Self-hosted, host
`greville.nrltipping.com`, policy = allow your email addresses only). That is a
dashboard action; it cannot be set from `wrangler.toml`.

## Rollback

    npx wrangler@latest delete greville-visualiser

This removes the worker and its custom domain. It does not touch anything else
on the zone.

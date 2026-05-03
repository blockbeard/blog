# WormLikeChain Blog - Complete Setup Reference

**Last Updated:** 2026-05-03

---

## Overview

Self-hosted blog at **blog.wormlikechain.com** using Quartz static site generator with automatic deployment via GitHub webhooks. Comments powered by self-hosted Isso. After each build, the blog's RSS feed is also pushed into the [literary-generators](https://github.com/blockbeard/literary-generators) GitHub repo so that site's "From the Blog" sidebar auto-updates. Part of the homelab infrastructure running on Prometheus (Raspberry Pi 5).

---

## Architecture

```
Obsidian (Athena) → blockbeard/blog (GitHub) → Webhook (Prometheus) → Quartz Build → Nginx → Cloudflare → Web
                                                          │                          ↓
                                                          ↓                   Isso Comments (8081)
                                            GitHub Contents API PUT
                                                          ↓
                                  blockbeard/literary-generators (_data/blog-feed.xml)
                                                          ↓
                                                   GitHub Action
                                                          ↓
                                       literary-generators rebuilds (GitHub Pages)
```

**Key Components:**

- **Athena (MacBook Pro M4 Max):** Content creation in Obsidian; canonical home of `quartz-config/` (in the blog repo)
- **GitHub `blockbeard/blog`:** Content + Quartz config; webhook trigger on push
- **GitHub `blockbeard/literary-generators`:** Companion static site; rebuilds when Pi PUTs a new RSS snapshot
- **Prometheus (Raspberry Pi 5):** Build server, web server, comment server, dispatcher to literary-generators
- **Cloudflare:** Tunnel for secure access (do not run runtime fetches against `blog.wormlikechain.com` from a workflow runner — Bot Fight Mode 403s GitHub Actions IPs)
- **Isso:** Self-hosted comment system

---

## Directory Structure

### Athena (Content Creation)

```
/Users/chriswilson/Documents/blog/
├── .obsidian/                    # Obsidian config (gitignored)
├── .git/                         # Git repository
├── drafts/                       # Work-in-progress posts (gitignored)
├── assets/                       # Working assets (gitignored)
├── posts/                        # Published posts
├── published_assets/             # Published: Images/files for posts
├── quartz-config/                # Quartz config under version control (NEW 2026-05-03)
│   ├── quartz.config.ts          # Site config (theme, plugins, ignorePatterns)
│   ├── quartz.layout.ts          # Sidebar/footer layout, Tools link, Explorer sort
│   └── components/Tools.tsx      # Custom "Tools" sidebar component
├── templates/                    # Obsidian templates (ignored by Quartz)
├── index.md                      # Homepage
├── .gitignore                    # What not to publish
├── robots.txt                    # Web crawler blocking
├── README.md                     # Not published (gitignored)
└── Setup and Troubleshooting.md  # Tracked in repo; not published (Quartz ignorePatterns)
```

### Prometheus (Build & Serve)

```
/home/chris/
├── blog/                         # Git clone of blog repo (content + quartz-config)
├── quartz-blog/                  # Quartz static site generator
│   ├── content -> ../blog/       # Symlink to blog repo
│   ├── quartz/                   # Quartz source (custom components copied in by update-blog.sh)
│   ├── public/                   # Built site (copied to nginx)
│   ├── quartz.config.ts          # Overwritten from blog/quartz-config each build
│   └── quartz.layout.ts          # Overwritten from blog/quartz-config each build
├── .tokens/
│   └── literary-generators-dispatch  # Fine-grained PAT (Contents:write on literary-generators)
├── webhook-server-blog.js        # Webhook listener (port 3005)
├── update-blog.sh                # Build, deploy, PUT RSS to literary-generators
└── update-blog.log               # Deploy history

/var/www/blog/                    # Nginx document root (served to web)
/opt/isso/                        # Isso comment system
/var/lib/isso/comments.db         # Comment database (SQLite)
```

---

## Services Overview

|Service|Port|Manager|Purpose|
|---|---|---|---|
|Foundry VTT|30000|PM2|Gaming platform|
|Dolmenwood webhook|3001|PM2|Dolmenwood site deployment|
|Monsterhunting webhook|3003|PM2|Monsterhunting site deployment|
|Blog webhook|3005|PM2|Blog deployment|
|Nginx|80|systemd|Web server|
|Isso|8081|systemd|Comment server|
|Cloudflared|N/A|systemd|Cloudflare tunnel|
|Homer|8080|PM2|Dashboard|

---

## Configuration Files

### GitHub Repository

**Repository:** `blockbeard/blog` (private) **Clone URL:** `git@github.com:blockbeard/blog.git`

**`.gitignore`:**

```gitignore
.obsidian/
.trash/
drafts/
assets/
*.pdf
README.md
private/
templates/
.DS_Store
/setup-admin
```

`Setup and Troubleshooting.md` is intentionally **not** gitignored — it's admin docs, not sensitive, and harmless if it slips out of a private repo. It's kept off the live site by Quartz's `ignorePatterns` only.

**`robots.txt`:**

```
User-agent: *
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /
```

---

### Quartz Configuration

**Source of truth:** `~/blog/quartz-config/` (in the GitHub repo). `update-blog.sh` copies these into `~/quartz-blog/` before each build, so layout/config edits go through git rather than SSH. Files in `~/quartz-blog/quartz.config.ts`, `~/quartz-blog/quartz.layout.ts`, and `~/quartz-blog/quartz/components/` should be considered build-time copies — edit them in `~/blog/quartz-config/` instead.

**Files:**

- `quartz-config/quartz.config.ts` — site config (theme, plugins, ignorePatterns)
- `quartz-config/quartz.layout.ts` — sidebar, footer, Explorer sort, Tools link
- `quartz-config/components/Tools.tsx` — custom "Tools" sidebar block linking to literary-generators

**Key settings in `quartz.config.ts`:**

```typescript
configuration: {
  pageTitle: "WormLikeChain",
  enableSPA: true,
  enablePopovers: true,
  baseUrl: "blog.wormlikechain.com",
  ignorePatterns: [
    "private", "templates", ".obsidian", "drafts", "assets",
    "README.md", "Setup and Troubleshooting.md", "published",
    "quartz-config",
  ],
  defaultDateType: "created",
}
```

**Editing the layout:** edit on Athena → commit → push. Webhook fires → `update-blog.sh` pulls → configs copied → Quartz rebuilds with new layout. No SSH needed for content/layout changes.

**Layout highlights:**

- Left sidebar `Explorer` is sorted by `dates.created` desc (newest first), not alphabetical.
- Left sidebar has a `Tools` block under the Explorer linking to `https://blockbeard.github.io/literary-generators/`.
- Footer keeps the stock GitHub + Discord links.

---

### Webhook Server

**File:** `/home/chris/webhook-server-blog.js`

```javascript
const http = require('http');
const { exec } = require('child_process');

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/webhook') {
        console.log('Blog webhook received, updating site...');
        
        exec('/home/chris/update-blog.sh', (error, stdout, stderr) => {
            if (error) {
                console.error('Error:', error);
                res.writeHead(500);
                res.end('Error updating site');
                return;
            }
            console.log('Blog updated successfully');
            console.log(stdout);
        });
        
        res.writeHead(200);
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(3005, () => {
    console.log('Blog webhook server listening on port 3005');
});
```

**PM2 Management:**

```bash
pm2 start /home/chris/webhook-server-blog.js --name blog-webhook
pm2 save
```

---

### Update Script

**File:** `/home/chris/update-blog.sh`

Three responsibilities:

1. Pull latest content + Quartz config from the blog repo.
2. Apply the version-controlled Quartz config (overwriting the runtime copies in `~/quartz-blog/`), then build and copy to nginx.
3. Push the freshly-generated `index.xml` into the literary-generators repo via the GitHub Contents API — but only when the content actually differs (compared via `git hash-object` against the remote blob SHA), so identical builds don't generate empty commits.

```bash
#!/bin/bash
cd /home/chris/blog
git pull origin main
cd /home/chris/quartz-blog

# Apply Quartz configs from the blog repo (so layout edits are version-controlled)
CONFIG_SRC=/home/chris/blog/quartz-config
if [[ -d "$CONFIG_SRC" ]]; then
  cp "$CONFIG_SRC/quartz.config.ts" /home/chris/quartz-blog/quartz.config.ts
  cp "$CONFIG_SRC/quartz.layout.ts" /home/chris/quartz-blog/quartz.layout.ts
  if [[ -d "$CONFIG_SRC/components" ]]; then
    cp -R "$CONFIG_SRC/components/." /home/chris/quartz-blog/quartz/components/
  fi
fi

rm -rf public .quartz-cache
npx quartz build
sudo cp -r public/* /var/www/blog/
echo "$(date): Blog updated" >> /home/chris/update-blog.log

TOKEN_FILE="$HOME/.tokens/literary-generators-dispatch"
FEED_SRC="/home/chris/quartz-blog/public/index.xml"
TARGET_REPO="blockbeard/literary-generators"
TARGET_PATH="_data/blog-feed.xml"

if [[ -r "$TOKEN_FILE" && -f "$FEED_SRC" ]]; then
  TOKEN="$(cat "$TOKEN_FILE")"
  API_URL="https://api.github.com/repos/$TARGET_REPO/contents/$TARGET_PATH"

  REMOTE_SHA="$(curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$API_URL" | jq -r '.sha // empty')"

  LOCAL_SHA="$(git hash-object "$FEED_SRC")"

  if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
    echo "$(date): literary-generators feed unchanged, skipping PUT" >> /home/chris/update-blog.log
  else
    CONTENT_B64="$(base64 -w0 "$FEED_SRC")"
    PAYLOAD="$(jq -n \
      --arg msg "chore: update blog feed snapshot" \
      --arg content "$CONTENT_B64" \
      --arg sha "$REMOTE_SHA" \
      '{message: $msg, content: $content} + (if $sha == "" then {} else {sha: $sha} end)')"

    HTTP_CODE="$(curl -sS -o /tmp/lg-put.json -w '%{http_code}' -X PUT \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$API_URL" \
      -d "$PAYLOAD")"
    echo "$(date): literary-generators feed PUT -> HTTP $HTTP_CODE" >> /home/chris/update-blog.log
  fi
fi
```

**Dependencies:** `jq`, GNU `base64` (both standard on Pi OS — `apt install jq` if missing).

**Permissions:** `chmod +x /home/chris/update-blog.sh`

---

### Nginx Configuration

**File:** `/etc/nginx/sites-available/blog`

```nginx
server {
    listen 80;
    server_name blog.wormlikechain.com;
    root /var/www/blog;
    index index.html;
    
    # Serve static files
    location / {
        try_files $uri $uri.html $uri/ =404;
    }
    
    # Webhook endpoint
    location /webhook {
        proxy_pass http://localhost:3005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Isso comments endpoint
    location /comments/ {
        proxy_pass http://localhost:8081/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Script-Name /comments;
    }
    
    # RSS feed
    location = /index.xml {
        types { application/rss+xml xml; }
        default_type application/rss+xml;
    }
    
    # Privacy headers
    add_header X-Robots-Tag "noindex, nofollow, nosnippet, noarchive" always;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

**Enable:** `sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/`

---

### Isso Configuration

**File:** `/opt/isso/isso.cfg`

```ini
[general]
dbpath = /var/lib/isso/comments.db
host = https://blog.wormlikechain.com
max-age = 15m
log-file = /var/log/isso/isso.log
notify = smtp

[moderation]
enabled = true
approve-if-email-previously-approved = true
purge-after = 30d

[server]
listen = http://localhost:8081
public-endpoint = https://blog.wormlikechain.com/comments

[smtp]
username = chris2097@gmail.com
password = <GMAIL_APP_PASSWORD>
host = smtp.gmail.com
port = 587
security = starttls
to = chris2097@gmail.com
from = "Blog Comments" <chris2097@gmail.com>
timeout = 10

[guard]
enabled = true
ratelimit = 2
direct-reply = 3
reply-to-self = false

[markup]
options = strikethrough, superscript, autolink
allowed-elements = 
allowed-attributes = 

[hash]
salt = <RANDOM_SALT>
algorithm = pbkdf2
```

**Systemd Service:** `/etc/systemd/system/isso.service`

```ini
[Unit]
Description=Isso Comment Server
After=network.target

[Service]
Type=simple
User=isso
Group=isso
WorkingDirectory=/opt/isso
ExecStart=/opt/isso/venv/bin/isso -c /opt/isso/isso.cfg run
Restart=always
RestartSec=10
MemoryMax=100M
MemoryHigh=80M
Nice=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/isso /var/log/isso

[Install]
WantedBy=multi-user.target
```

---

### Cloudflare Tunnel

**Dashboard:** Cloudflare Zero Trust → Networks → Tunnels

**Public Hostname:**

- Subdomain: `blog`
- Domain: `wormlikechain.com`
- Service: `HTTP` → `http://localhost:80`
- HTTP Host Header: `blog.wormlikechain.com`

---

### GitHub Webhook

**Repository Settings → Webhooks:**

- Payload URL: `https://blog.wormlikechain.com/webhook`
- Content type: `application/json`
- Secret: (none)
- SSL verification: Enabled
- Events: Just the push event
- Active: ✓

---

### Literary Generators Feed Sync

After each blog build, `update-blog.sh` pushes `~/quartz-blog/public/index.xml` (the just-generated RSS) into the **blockbeard/literary-generators** repo at `_data/blog-feed.xml` via the GitHub Contents API. A workflow in that repo then re-renders the "From the Blog" sidebar on https://blockbeard.github.io/literary-generators/ from the latest 5 items.

**Why this design:** Cloudflare in front of `blog.wormlikechain.com` 403s GitHub Actions runners (Bot Fight Mode), so a runtime fetch from inside a workflow doesn't work. Pushing the RSS data file in lets the workflow read locally — no network, no CORS, no rate limits.

**Components:**

- **Token (Pi):** `~/.tokens/literary-generators-dispatch` — fine-grained PAT scoped to `blockbeard/literary-generators` only, **Contents: Read and write** permission, `chmod 600`.
- **Pi pusher:** the tail block of `update-blog.sh` (see *Update Script* above) — computes the local blob SHA via `git hash-object`, compares to the remote SHA from a Contents API GET, only PUTs when they differ.
- **Receiver workflow:** `.github/workflows/update-blog-posts.yml` in `blockbeard/literary-generators`. Triggers on `push` touching `_data/blog-feed.xml` (or manual `workflow_dispatch`). Runs `node scripts/update-blog-posts.mjs` which reads the committed RSS, regenerates the post list inside `<!-- BLOG_POSTS:START -->` … `<!-- BLOG_POSTS:END -->` sentinels in `index.html`, commits if changed. GitHub Pages auto-deploys.
- **Sentinel block:** `index.html` in the literary-generators repo has the static post list wrapped in those two HTML comments — that's the only zone the script touches.

**Verifying:**

```bash
bash ~/update-blog.sh
tail -3 /home/chris/update-blog.log
```

Expect either:

- `feed PUT -> HTTP 200` (real change pushed; workflow run appears within ~30s at https://github.com/blockbeard/literary-generators/actions)
- `feed unchanged, skipping PUT` (no real change; nothing to do)

**If the literary-generators sidebar gets stale:**

1. Check `tail -20 /home/chris/update-blog.log` — is the script logging PUT 200s or skipping?
2. Check the latest run in https://github.com/blockbeard/literary-generators/actions — failure?
3. Verify the PAT: `curl -sI -H "Authorization: Bearer $(cat ~/.tokens/literary-generators-dispatch)" https://api.github.com/repos/blockbeard/literary-generators` → expect `200`. If `401`/`403`, mint a new fine-grained PAT with the right scope.

**Common issues:**

- `feed PUT -> HTTP 401`/`403`: PAT expired or wrong scope. Replace the file in `~/.tokens/`.
- `jq: command not found`: `sudo apt install jq`.
- Empty commits showing on the literary-generators repo: shouldn't happen with the SHA pre-check, but if it does the `paths:` filter on the workflow trigger means an empty commit doesn't fire the workflow — harmless cosmetic noise.

---

## Content Workflow

### Writing Posts

**On Athena:**

1. **Draft new post:**
    
    ```bash
    cd /Users/chriswilson/Documents/RPG/blog/drafts
    # Write in Obsidian or text editor
    ```
    
2. **Add frontmatter:**
    
    ```markdown
    ---
    title: My Post Title
    date: 2025-11-10
    tags:
      - homelab
      - tutorial
    description: Brief summary
    ---
    
    # Your content here
    ```
    
3. **Move to category when ready:**
    
    ```bash
    mv drafts/my-post.md musings/my-post.md
    ```
    
4. **Commit and push:**
    
    ```bash
    git add .
    git commit -m "New post: My Post Title"
    git push origin main
    ```
    
5. **Auto-deploy:** Webhook triggers, site rebuilds (~30 seconds)
    
6. **Verify:** Visit https://blog.wormlikechain.com
    

---

### Editing Posts

1. Edit file in category folder (musings/, reviews/, tutorials/)
2. Commit and push
3. Auto-deploys

---

### Post Frontmatter

**Required:**

```yaml
---
title: Post Title
date: 2026-05-03
---
```

**Standard:**

```yaml
---
title: Post Title
date: 2026-05-03
tags:
  - tag1
  - tag2
description: Short summary used in RSS <description> and OG metadata
---
```

**Notes on `date:`** — Quartz's `priority: ["frontmatter", "git", "filesystem"]` means whatever you put here wins over git history and filesystem mtime. **Always pin `date:` explicitly** for two reasons:

1. The Pi's `~/quartz-blog/content/` is a symlink into `~/blog/`, and Quartz's git-history lookup runs from `~/quartz-blog/` where the path isn't tracked. Without an explicit `date:`, you get warnings like *"isn't yet tracked by git, dates will be inaccurate"* and Quartz falls back to filesystem mtime.
2. Crucially: if you commit a previously-uncommitted post and Quartz has been using filesystem mtime, the next build with a new committed-at-today date would change the RSS `<pubDate>`, and aggressive RSS readers may re-notify subscribers. Pinning `date:` to the original publish date keeps the RSS stable.

**Drafts** — files in `drafts/` are skipped by Quartz (in `ignorePatterns`). Move out of drafts to publish; don't rely on `draft: true` frontmatter as a primary mechanism.

---

## Comment Management

### View Pending Comments

```bash
ssh prometheus
sudo -u isso sqlite3 /var/lib/isso/comments.db "SELECT id, author, text FROM comments WHERE mode=1;"
```

### Approve Comment

```bash
sudo -u isso sqlite3 /var/lib/isso/comments.db "UPDATE comments SET mode=2 WHERE id=1;"
```

### Delete Comment

```bash
# Soft delete (mark as deleted)
sudo -u isso sqlite3 /var/lib/isso/comments.db "UPDATE comments SET mode=4 WHERE id=1;"

# Hard delete (remove completely)
sudo -u isso sqlite3 /var/lib/isso/comments.db "DELETE FROM comments WHERE id=1;"
```

### View All Comments

```bash
sudo -u isso sqlite3 /var/lib/isso/comments.db
```

**Inside SQLite:**

```sql
.headers on
.mode column

SELECT id, datetime(created, 'unixepoch'), author, text, 
       CASE mode WHEN 1 THEN 'pending' WHEN 2 THEN 'approved' WHEN 4 THEN 'deleted' END as status
FROM comments;

.quit
```

### Helper Script

**Create:** `/home/chris/manage-comments.sh`

```bash
#!/bin/bash
DB="/var/lib/isso/comments.db"

echo "=== Comment Management ==="
echo "1. View pending"
echo "2. View all"
echo "3. Approve"
echo "4. Delete"
read -p "Choose: " choice

case $choice in
  1) sudo -u isso sqlite3 $DB "SELECT id, author, text FROM comments WHERE mode=1;" ;;
  2) sudo -u isso sqlite3 $DB "SELECT id, author, CASE mode WHEN 1 THEN 'pending' WHEN 2 THEN 'approved' WHEN 4 THEN 'deleted' END, text FROM comments;" ;;
  3) read -p "ID to approve: " id; sudo -u isso sqlite3 $DB "UPDATE comments SET mode=2 WHERE id=$id;" ;;
  4) read -p "ID to delete: " id; sudo -u isso sqlite3 $DB "UPDATE comments SET mode=4 WHERE id=$id;" ;;
esac
```

---

## Maintenance Tasks

### Check Services

```bash
ssh prometheus

# All services
pm2 status
sudo systemctl status nginx
sudo systemctl status isso
sudo systemctl status cloudflared

# Specific checks
curl http://localhost:8081/  # Isso running
curl http://localhost/  # Nginx serving
curl https://blog.wormlikechain.com/  # External access
```

### View Logs

```bash
# Webhook activity
pm2 logs blog-webhook

# Deploy history
tail -f /home/chris/update-blog.log

# Isso logs
sudo journalctl -u isso -f
tail -f /var/log/isso/isso.log

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Manual Deploy

```bash
ssh prometheus
/home/chris/update-blog.sh
```

### Force Rebuild

```bash
ssh prometheus
cd /home/chris/quartz-blog
rm -rf public
npx quartz build
sudo cp -r public/* /var/www/blog/
```

### Restart Services

```bash
# Webhook
pm2 restart blog-webhook

# Isso
sudo systemctl restart isso

# Nginx
sudo systemctl reload nginx

# All
pm2 restart all
sudo systemctl restart nginx isso
```

---

## Backup Information

### What to Backup

**Critical (already backed up in homelab system):**

- `/home/chris/blog/` - Content source (also in GitHub)
- `/var/lib/isso/comments.db` - All comments
- `/opt/isso/isso.cfg` - Isso configuration
- `/home/chris/webhook-server-blog.js` - Webhook server
- `/home/chris/update-blog.sh` - Deploy script
- `/etc/nginx/sites-available/blog` - Nginx config

**Not critical (can be regenerated):**

- `/home/chris/quartz-blog/public/` - Built site
- `/var/www/blog/` - Served site
- `/home/chris/update-blog.log` - Log history

### Backup Commands

```bash
# Comments database
sudo -u isso sqlite3 /var/lib/isso/comments.db ".backup /var/lib/isso/comments-backup.db"

# All blog configs
tar -czf blog-configs-backup.tar.gz \
  /home/chris/webhook-server-blog.js \
  /home/chris/update-blog.sh \
  /opt/isso/isso.cfg \
  /etc/nginx/sites-available/blog
```

---

## Troubleshooting

### Blog Not Updating After Push

**Check webhook received:**

```bash
pm2 logs blog-webhook --lines 50
```

**Check deploy log:**

```bash
tail -20 /home/chris/update-blog.log
```

**Test webhook manually:**

```bash
curl -X POST http://localhost:3005/webhook
```

**Check GitHub webhook deliveries:**

- Go to repo → Settings → Webhooks
- Check Recent Deliveries for errors

**Manual deploy:**

```bash
/home/chris/update-blog.sh
```

---

### Comments Not Loading

**Check Isso running:**

```bash
sudo systemctl status isso
curl "http://localhost:8081/?uri=/test"
# Should return JSON
```

**Check nginx proxy:**

```bash
curl "https://blog.wormlikechain.com/comments/?uri=/test"
# Should return JSON
```

**Check browser console (F12):**

- Look for JavaScript errors
- Check Network tab for failed requests

**Restart Isso:**

```bash
sudo systemctl restart isso
```

---

### Dark Mode Text Invisible

Comments use inline styles to fix dark mode. If broken:

```bash
nano /home/chris/quartz-blog/quartz/components/Comments.tsx
```

Check the `<style dangerouslySetInnerHTML>` section has proper dark mode overrides.

---

### Site Returns 404

**Check nginx:**

```bash
sudo nginx -t
sudo systemctl status nginx
ls -la /var/www/blog/
```

**Check Cloudflare tunnel:**

- Dashboard → Tunnels → Verify route exists

**Check files exist:**

```bash
ls /var/www/blog/index.html
```

---

### Build Fails

**Check error output:**

```bash
cd /home/chris/quartz-blog
npx quartz build
# Read error messages
```

**Common issues:**

- Syntax error in quartz.config.ts (missing quotes, commas)
- Invalid frontmatter in posts
- Missing dependencies: `npm install`

**Check Quartz version:**

```bash
npx quartz --version
```

---

### RSS Feed Issues

**Check feed exists:**

```bash
ls /var/www/blog/index.xml
curl https://blog.wormlikechain.com/index.xml
```

**Validate feed:** https://validator.w3.org/feed/

**Rebuild if missing:**

```bash
cd /home/chris/quartz-blog
npx quartz build
sudo cp -r public/* /var/www/blog/
```

---

### Webhook Port Conflict

**Check what's using port:**

```bash
sudo ss -tlnp | grep 3005
```

**Change port if needed:**

1. Edit `/home/chris/webhook-server-blog.js` (change 3005 to new port)
2. Edit `/etc/nginx/sites-available/blog` (update proxy_pass port)
3. `pm2 restart blog-webhook`
4. `sudo systemctl reload nginx`

---

## Performance & Resources

### Current Resource Usage

**Isso:**

- RAM: ~30-50 MB
- CPU: <1% (idle)
- Disk: <10 MB (database)

**Blog Webhook:**

- RAM: ~30 MB
- CPU: <1% (idle, spikes during deploy)

**Nginx:**

- RAM: ~20 MB
- CPU: <1%

**Total blog overhead:** ~100 MB RAM, negligible CPU

**Impact on Foundry:** None - plenty of headroom on Pi 5 (8GB RAM)

---

## URLs & Access

**Public:**

- Blog: https://blog.wormlikechain.com
- RSS Feed: https://blog.wormlikechain.com/index.xml
- Comments: https://blog.wormlikechain.com/comments/ (proxied)

**Internal (Prometheus):**

- Blog: http://localhost/ or http://prometheus.local/
- Webhook: http://localhost:3005/webhook
- Isso: http://localhost:8081/

**Management:**

- GitHub Repo: https://github.com/blockbeard/blog
- Cloudflare Dashboard: Cloudflare Zero Trust → Tunnels

---

## Quick Reference Commands

### Daily Operations

```bash
# Check everything
pm2 status
sudo systemctl status nginx isso

# View recent activity
pm2 logs blog-webhook --lines 20
tail -20 /home/chris/update-blog.log

# Manual deploy
/home/chris/update-blog.sh

# Approve pending comments
./manage-comments.sh
```

### Emergency Fixes

```bash
# Restart everything
pm2 restart blog-webhook
sudo systemctl restart isso nginx

# Force rebuild
cd /home/chris/quartz-blog
rm -rf public
npx quartz build
sudo cp -r public/* /var/www/blog/

# Check logs
sudo journalctl -u isso -n 50
sudo tail -50 /var/log/nginx/error.log
```

---

## Update History

**2026-05-03:** Quartz config under version control + Literary Generators feed sync

- Moved `quartz.config.ts` and `quartz.layout.ts` from `~/quartz-blog/` (Pi only) into `~/blog/quartz-config/` so layout edits go through git. `update-blog.sh` copies them into the Quartz install before each build.
- Added a `Tools` block to the left sidebar with a link to `https://blockbeard.github.io/literary-generators/`. Lives in `quartz-config/components/Tools.tsx`.
- Switched the Explorer sidebar from alphabetical to date-desc (newest first).
- Wired the blog-build → literary-generators feed sync: `update-blog.sh` PUTs the freshly-built `index.xml` into `blockbeard/literary-generators` at `_data/blog-feed.xml` via the GitHub Contents API. PAT lives at `~/.tokens/literary-generators-dispatch`. Companion workflow in literary-generators consumes the feed and re-renders the "From the Blog" sidebar. Skips PUTs (and avoids empty commits) when the local blob SHA matches the remote.
- Backfilled frontmatter (`title`, `date`, `tags`, `description`) on posts that were missing it. Pinned `date:` to original publish dates so the RSS `pubDate` doesn't shift and subscribers don't re-notify.
- Posts now live under a single `posts/` folder (replacing the earlier `reviews/`, `musings/`, `tutorials/` split).

**2025-11-10:** Initial blog setup complete

- Quartz v4.5.2 installed
- Isso comments configured (port 8081)
- Webhook auto-deploy working
- Dark mode comment styling fixed
- RSS feed functional

---

## Future Enhancements

**Potential additions:**

- [ ] Email newsletter (Buttondown integration)
- [ ] Analytics (self-hosted Plausible or GoatCounter)
- [ ] Search functionality improvements
- [ ] Custom theme refinements
- [ ] Comment moderation web UI
- [ ] Automated social media posting

---

## Contact & Support

**Primary:** Chris Wilson (chris2097@gmail.com)  
**GitHub:** blockbeard  
**Infrastructure:** Part of Atlas/Prometheus homelab setup

---

**Last verified working:** 2026-05-03  
**Next review:** When making significant changes
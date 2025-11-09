## Your Complete Setup (After Blog Added)
```
/home/chris/
├── dolmenwood/                      # Vault 1 repo
├── quartz/                          # Vault 1 Quartz
├── webhook-server.js                # Vault 1 webhook (port 3001)
├── update-dolmenwood.sh             # Vault 1 update script
├── update-dolmenwood.log            # Vault 1 logs
│
├── monsterhunting/                  # Vault 2 repo  
├── quartz-monsterhunting/           # Vault 2 Quartz
├── webhook-server-monsterhunting.js # Vault 2 webhook (port 3003)
├── update-monsterhunting.sh         # Vault 2 update script
├── update-monsterhunting.log        # Vault 2 logs
│
├── blog/                            # Blog repo (NEW)
├── quartz-blog/                     # Blog Quartz (NEW)
│   └── content -> ../blog           # Symlink (NEW)
├── webhook-server-blog.js           # Blog webhook (port 3005, NEW)
├── update-blog.sh                   # Blog update script (NEW)
└── update-blog.log                  # Blog logs (NEW)

/var/www/
├── dolmenwood/                      # Served by nginx
├── monsterhunting/                  # Served by nginx
└── blog/                            # Served by nginx (NEW)
```

**PM2 processes:**

- foundry (port 30000)
- dolmenwood-webhook (port 3001)
- monsterhunting-webhook (port 3003)
- blog-webhook (port 3005) ← NEW

**Nginx sites:**

- dolmenwood.wormlikechain.com → /var/www/dolmenwood
- monsterhunting.wormlikechain.com → /var/www/monsterhunting
- blog.wormlikechain.com → /var/www/blog ← NEW

---

## Writing Workflow (Identical to Your Other Sites)

1. **Write in Obsidian** on Athena
2. **Auto-commit** every 5 minutes (Obsidian Git plugin)
3. **Auto-push** to GitHub
4. **GitHub webhook** triggers Prometheus
5. **PM2 webhook server** receives request
6. **Update script runs:**
    - Git pull latest content
    - Quartz rebuilds site
    - Copy to /var/www/blog/
7. **Site live** in ~10-30 seconds

**Or manually:**
bash

```bash
# On Athena
cd ~/Documents/blog
git add .
git commit -m "New post"
git push
# Site updates automatically!
```

---

## Useful Commands

### Check Everything
bash

```bash
pm2 status
sudo systemctl status nginx
sudo systemctl status cloudflared
```
### View Logs
```
pm2 logs blog-webhook # Webhook activity tail -f ~/update-blog.log # Update history sudo tail -f /var/log/nginx/error.log # Nginx errors
```
### Manual Update
```
/home/chris/update-blog.sh
```
### Restart Services
```
pm2 restart blog-webhook 
sudo systemctl reload nginx
```
---
## Troubleshooting

### Webhook Not Firing
```
# Check PM2 
pm2 logs blog-webhook 

# Test webhook endpoint 
curl -X POST http://localhost:3005/webhook 
curl -X POST https://blog.wormlikechain.com/webhook 

# Check GitHub webhook deliveries (repo → Settings → Webhooks)
```
### Site Not Updating
```
# Check update log 
tail -20 ~/update-blog.log 

# Manual update 
./update-blog.sh 

# Check for errors 
cd ~/quartz-blog 
npx quartz build
```
### 404 Errors
```
# Verify files exist 
ls /var/www/blog/ 

# Check nginx 
sudo nginx -t 
sudo systemctl status nginx 

# Check Cloudflare tunnel route in dashboard
```
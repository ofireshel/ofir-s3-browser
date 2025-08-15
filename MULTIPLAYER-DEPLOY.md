# Multiplayer Poker Deployment Guide

## Option 1: Cloudflare Workers + Durable Objects (Recommended)

This solution uses Cloudflare Workers with Durable Objects to provide WebSocket support while keeping your frontend on Cloudflare Pages.

### Step 1: Deploy the Worker

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Deploy the Worker**:
   ```bash
   wrangler deploy --config wrangler-worker.toml
   ```

4. **Note your Worker URL** (will be something like `poker-multiplayer.YOUR_USERNAME.workers.dev`)

### Step 2: Update Frontend URLs

1. **Update lobby.html** - Replace `poker-multiplayer.ofir.workers.dev` with your actual worker URL
2. **Update poker.html** - Replace `poker-multiplayer.ofir.workers.dev` with your actual worker URL

### Step 3: Deploy Updated Frontend

```bash
npx --yes wrangler@latest pages deploy . --project-name lexiorbit --branch main --commit-dirty=true
```

### Cost:
- **Workers**: Free tier includes 100,000 requests/day
- **Durable Objects**: $0.15/million requests + $12.50/million GB-seconds
- Very affordable for moderate usage

---

## Option 2: Alternative Solutions

### A) External WebSocket Service
Use services like **Pusher**, **Ably**, or **Socket.io** hosted elsewhere:
- Easier setup
- Potentially higher costs
- External dependency

### B) Cloudflare Functions (Pages Functions)
Limited WebSocket support, but possible for simple real-time features:
- Uses existing Pages infrastructure
- More limited than full Workers
- Good for basic multiplayer

### C) Hybrid Approach
Keep bot vs bot on Pages, multiplayer on external service:
- Split functionality
- Lower costs for single-player
- More complex architecture

---

## Testing Your Deployment

1. **Check Worker Health**:
   Visit `https://YOUR_WORKER.workers.dev/` (should return 404, that's normal)

2. **Test WebSocket Connection**:
   - Open browser dev tools
   - Navigate to lobby
   - Check console for connection messages

3. **Test Full Flow**:
   - Two browser tabs/windows
   - Both join lobby
   - Challenge each other
   - Play a hand

---

## Troubleshooting

### Worker Not Responding
- Check wrangler deployment logs
- Verify Durable Objects are enabled in your Cloudflare account
- Check worker subdomain is correct in frontend

### WebSocket Connection Failed
- Verify CORS headers in worker
- Check browser dev tools for specific error messages
- Ensure worker URL uses `wss://` not `ws://`

### Durable Objects Errors
- Ensure your Cloudflare account has Workers Paid plan ($5/month minimum)
- Check Durable Objects are properly bound in wrangler.toml

---

## Next Steps

Once deployed, you'll have:
✅ Fully functional multiplayer poker
✅ Real-time lobby system
✅ WebSocket-based gameplay
✅ Scalable Cloudflare infrastructure
✅ Both single-player (bot) and multiplayer modes

The multiplayer system will work seamlessly alongside your existing bot-based poker game!

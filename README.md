# ofir-s3-browser

## Deploy to Cloudflare Pages (production)

Use the existing Pages project `lexiorbit`:

```bash
npx --yes wrangler@latest pages deploy . --project-name lexiorbit --branch main --commit-dirty=true
```

- Requires Node.js and npm.
- Uses the current working directory as the build output (`wrangler.toml` sets `pages_build_output_dir = "."`).

## Sync to GitHub (main branch)

Run these commands from the project root in PowerShell or a terminal:

```bash
# Optional: set your Git identity once per machine
git config user.name "Ofir"
git config user.email "ofir@example.com"

# Ensure the remote is set
git remote get-url origin 2>nul || git remote add origin https://github.com/ofireshel/ofir-s3-browser.git
git remote set-url origin https://github.com/ofireshel/ofir-s3-browser.git

# Stage and commit local changes
git add -A
git commit -m "Sync repository"

# Rebase on remote main if it exists; otherwise skip
git fetch origin || true
git rev-parse --verify origin/main >nul 2>&1 && git rebase origin/main || echo "No remote main yet"

# Push to GitHub (sets upstream on first push)
git push -u origin main
```

If authentication fails, set up credentials:

- Windows: ensure Git Credential Manager is enabled: `git config --global credential.helper manager-core` and sign in when prompted, or store a GitHub Personal Access Token in Windows Credential Manager.
- Alternatively, use GitHub CLI and run `gh auth login` once, then push again.

# ofir-s3-browser

## Deploy to Cloudflare Pages (production)

Use the existing Pages project `lexiorbit`:

```bash
npx --yes wrangler@latest pages deploy . --project-name lexiorbit --branch main --commit-dirty=true
```

- Requires Node.js and npm.
- Uses the current working directory as the build output (`wrangler.toml` sets `pages_build_output_dir = "."`).

## Sync to GitHub (main branch)

### PowerShell (Windows)

Run these commands from the project root:

```powershell
# Optional: set your Git identity (once per machine)
git config user.name "Ofir"
git config user.email "ofir@example.com"

# Ensure the remote is set to GitHub
git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) { git remote add origin https://github.com/ofireshel/ofir-s3-browser.git } else { git remote set-url origin https://github.com/ofireshel/ofir-s3-browser.git }

# Stage and commit local changes (ignore error if nothing to commit)
git add -A
git commit -m "Sync repository" 2>$null

# Rebase on remote main if it exists; otherwise skip
git fetch origin
git rev-parse --verify origin/main 2>$null
if ($LASTEXITCODE -eq 0) { git rebase origin/main } else { Write-Host "No remote main yet" }

# Push to GitHub (sets upstream on first push)
git push -u origin main
```

### Bash (macOS/Linux/Git Bash)

```bash
git config user.name "Ofir"
git config user.email "ofir@example.com"

git remote get-url origin >/dev/null 2>&1 || git remote add origin https://github.com/ofireshel/ofir-s3-browser.git
git remote set-url origin https://github.com/ofireshel/ofir-s3-browser.git

git add -A
git commit -m "Sync repository" || true

git fetch origin || true
git rev-parse --verify origin/main >/dev/null 2>&1 && git rebase origin/main || echo "No remote main yet"

git push -u origin main
```

If authentication fails, set up credentials:

- Windows: enable Git Credential Manager: `git config --global credential.helper manager-core` and sign in when prompted, or store a GitHub Personal Access Token in Windows Credential Manager.
- Or use GitHub CLI: `gh auth login` once, then push again.
# Ter Tracker — Complete Package

Everything for the live gold price tracker: the installable web app (PWA) and
the automated daily/alert email system. All files here go straight into the
root of your GitHub repo.

## Full file structure

```
your-repo/
├── index.html                       ← the tracker page itself
├── manifest.webmanifest             ← makes it installable (PWA)
├── service-worker.js                ← required for install + offline shell
├── icons/                           ← app icons, 8 sizes + 1 maskable
│   ├── icon-72.png ... icon-512.png
│   └── icon-maskable-512.png
├── scripts/
│   └── check-and-send.mjs           ← fetches price, sends emails via Gmail
├── data/
│   └── state.json                   ← remembers what's already been emailed
└── .github/
    └── workflows/
        └── gold-email.yml           ← tells GitHub when to run the script
```

Just drag this entire folder's contents into your repo (or upload via
GitHub's "Add file → Upload files", keeping the folder structure intact).
Hidden dot-folders like `.github` don't always show after unzipping — see
the note at the bottom if you don't see it.

---

## Part 1 — Installable Web App (PWA)

This is what makes the tracker installable from Chrome, with its own icon,
standalone window, and basic offline shell caching.

**How it works:**
- `manifest.webmanifest` tells Chrome the app's name, icon, and that it
  should open in its own window instead of a browser tab.
- `service-worker.js` is required by Chrome before it'll offer an install
  prompt — it also caches the page shell so reopening is instant (though
  live prices still need internet to update).
- `icons/` are used for the home screen, app switcher, and splash screen.

**To use it:** once deployed on GitHub Pages (which is HTTPS by default —
required for install), open the site in Chrome. You'll see an install icon
in the address bar, plus an in-page "Install Ter Tracker" button. On iOS
Safari, use Share → Add to Home Screen instead (Apple doesn't support the
install-prompt API).

**Refresh rate:** gold, Ter, and Tola prices all update every 15 seconds
while the app is open.

---

## Part 2 — Automated Emails (Daily + Price Alerts)

This runs independently of the website — it's a scheduled script that runs
on GitHub's servers (not your browser) and emails you and your friends.

**How it works, step by step:**
1. Every 30 minutes, GitHub reads `.github/workflows/gold-email.yml` and
   runs the job described there.
2. That job runs `scripts/check-and-send.mjs`, which fetches the current
   gold price and USD/BTN rate.
3. It checks `data/state.json` to decide: is it time for the daily digest?
   Has price moved ≥1% since the last alert?
4. If yes, it sends the email via your Gmail account.
5. It updates `data/state.json` and commits that change back to the repo.

### Setup steps

**1. Turn on 2-Step Verification** on your Google account:
https://myaccount.google.com/security

**2. Create a Gmail App Password:**
https://myaccount.google.com/apppasswords — name it "Ter Tracker", copy the
16-character code it gives you. This is separate from your real password and
can be revoked anytime without affecting your normal Google login.

**3. Add 3 GitHub repo secrets** (Settings → Secrets and variables → Actions
→ New repository secret):

| Secret name          | Value                                                |
|-----------------------|------------------------------------------------------|
| `GMAIL_USER`          | your Gmail address                                    |
| `GMAIL_APP_PASSWORD`  | the 16-character app password                         |
| `TO_EMAILS`           | comma-separated list — include your own email to get a copy too |

**4. Adjust send time:** open `scripts/check-and-send.mjs`, find
`DAILY_HOUR_UTC` near the top, and set it to your preferred hour in UTC.
Bhutan is UTC+6, so for a 9:00 AM Bhutan send time, use `DAILY_HOUR_UTC = 3`.

**5. Test it:**
- Go to the **Actions** tab in your repo
- Click **"Gold Price Email Check"** in the left sidebar
- Click **"Run workflow"** (may be under a small dropdown), confirm
- Click into the new run, expand the job, watch each step turn green
- Check your email (and spam folder, first time)

If a step fails, click it to expand the error log — it'll usually point to a
missing/misspelled secret or a bad email address in `TO_EMAILS`.

### Notes

- Gmail's free sending limit (~500/day) is nowhere near an issue for a few
  recipients, once daily plus occasional alerts.
- GitHub disables scheduled workflows after 60 days of repo inactivity —
  push any small commit occasionally to keep it alive.
- Edit `ALERT_PCT` in `check-and-send.mjs` to change the move-alert
  threshold (currently 1%).

---

## If `.github` doesn't appear after unzipping

Some unzip tools or file browsers hide dot-folders by default:
- **Mac Finder:** press `Cmd + Shift + .` to reveal hidden files
- **Windows Explorer:** View tab → check "Hidden items"
- **Easiest fix:** upload directly through GitHub's web UI (Add file →
  Upload files) and drag the whole extracted folder in — this handles dot-
  folders correctly.

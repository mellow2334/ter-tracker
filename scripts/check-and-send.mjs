// scripts/check-and-send.mjs
// Runs on a schedule via GitHub Actions.
// - Fetches gold spot price + USD/BTN fx rate
// - Sends a once-a-day digest email at a configured hour
// - Sends a move-alert email whenever price shifts >= ALERT_PCT since last alert
// - Persists small bits of state (last alert baseline, last daily-send date) to data/state.json

import { writeFileSync, readFileSync, existsSync } from 'fs';
import nodemailer from 'nodemailer';

const GRAMS_PER_OZ = 31.1034768;
const TER_GRAMS = 0.01;
const GRAMS_PER_TOLA = 11.6638;
const ALERT_PCT = 1.0;          // % move that triggers an alert email
const DAILY_HOUR_UTC = 3;       // hour (UTC) the daily digest should go out - adjust to taste

const GMAIL_USER = process.env.GMAIL_USER;            // your Gmail address, e.g. you@gmail.com
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD; // the 16-char app password
const TO_EMAILS = (process.env.TO_EMAILS || '')       // comma-separated: friends + yourself
  .split(',').map(s => s.trim()).filter(Boolean);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

const STATE_PATH = new URL('../data/state.json', import.meta.url);

function loadState() {
  if (existsSync(STATE_PATH)) {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  }
  return { lastDailySendDate: null, alertBaseline: null };
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function fetchGoldUsdPerOz() {
  // metals.dev free tier works well; swap in whatever feed the tracker page itself uses.
  // Using metals-api style endpoint here as a placeholder - see README for alternatives.
  const res = await fetch('https://api.gold-api.com/price/XAU');
  if (!res.ok) throw new Error('Gold price fetch failed: ' + res.status);
  const data = await res.json();
  return data.price; // USD per troy oz
}

async function fetchUsdToBtn() {
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error('FX fetch failed: ' + res.status);
  const data = await res.json();
  if (!data.rates || !data.rates.BTN) throw new Error('BTN rate missing from FX response');
  return data.rates.BTN;
}

function fmt(n, d = 2) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function buildSummaryHtml({ ozUsd, usdBtn, pctMove }) {
  const gramUsd = ozUsd / GRAMS_PER_OZ;
  const gramBtn = gramUsd * usdBtn;
  const terBtn = gramBtn * TER_GRAMS;
  const tolaBtn = gramBtn * GRAMS_PER_TOLA;
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const alertLine = pctMove != null
    ? `<p style="color:#b76b5e;font-weight:600;">⚡ Gold moved ${fmt(pctMove, 2)}% since the last checkpoint.</p>`
    : '';

  return `
  <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;background:#161410;color:#F2EEE6;border-radius:12px;">
    <h2 style="color:#E8C077;margin:0 0 4px;">Ter Tracker — Gold Update</h2>
    <p style="color:#8A8072;margin:0 0 16px;font-size:13px;">${date}</p>
    ${alertLine}
    <p style="font-size:22px;color:#E8C077;margin:0 0 12px;">$${fmt(ozUsd)} <span style="font-size:13px;color:#8A8072;">/ troy oz</span></p>
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#8A8072;">1 Ter (0.01g)</td><td style="text-align:right;">Nu. ${fmt(terBtn)}</td></tr>
      <tr><td style="padding:6px 0;color:#8A8072;">1 Gram</td><td style="text-align:right;">Nu. ${fmt(gramBtn)} ($${fmt(gramUsd)})</td></tr>
      <tr><td style="padding:6px 0;color:#8A8072;">1 Tola (11.66g)</td><td style="text-align:right;">Nu. ${fmt(tolaBtn)}</td></tr>
      <tr><td style="padding:6px 0;color:#8A8072;">USD/BTN</td><td style="text-align:right;">${fmt(usdBtn, 3)}</td></tr>
    </table>
    <p style="color:#8A8072;font-size:11px;margin-top:20px;">— Sent automatically from Ter Tracker</p>
  </div>`;
}

async function sendEmail(subject, html) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || TO_EMAILS.length === 0) {
    throw new Error('Missing GMAIL_USER, GMAIL_APP_PASSWORD, or TO_EMAILS env vars');
  }
  return transporter.sendMail({
    from: `Ter Tracker <${GMAIL_USER}>`,
    to: TO_EMAILS.join(','),
    subject,
    html,
  });
}

async function main() {
  const state = loadState();
  const ozUsd = await fetchGoldUsdPerOz();
  const usdBtn = await fetchUsdToBtn();

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // --- Daily digest: send once per UTC day, at/after the configured hour ---
  const dueForDaily = state.lastDailySendDate !== todayKey && now.getUTCHours() >= DAILY_HOUR_UTC;
  if (dueForDaily) {
    const html = buildSummaryHtml({ ozUsd, usdBtn, pctMove: null });
    await sendEmail("Today's Gold Price — Ter Tracker", html);
    state.lastDailySendDate = todayKey;
    console.log('Daily digest sent.');
  }

  // --- Move alert ---
  if (state.alertBaseline == null) {
    state.alertBaseline = ozUsd;
  } else {
    const pct = ((ozUsd - state.alertBaseline) / state.alertBaseline) * 100;
    if (Math.abs(pct) >= ALERT_PCT) {
      const html = buildSummaryHtml({ ozUsd, usdBtn, pctMove: pct });
      await sendEmail(`⚡ Gold Price Alert — ${fmt(pct, 2)}% move`, html);
      state.alertBaseline = ozUsd; // reset baseline after firing
      console.log('Alert email sent.');
    }
  }

  saveState(state);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

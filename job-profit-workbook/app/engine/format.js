import { roundMoney, toNumber } from "./money.js";

export function money(value) {
  const amount = roundMoney(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function signedMoney(value) {
  const amount = roundMoney(value);
  if (amount > 0) return `+${money(amount)}`;
  if (amount < 0) return `−${money(Math.abs(amount))}`;
  return money(0);
}

/** `rate` is 0.25 for 25%. */
export function percent(rate, digits = 1) {
  const n = toNumber(rate, 0) * 100;
  return `${n.toFixed(digits)}%`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

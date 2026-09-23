export interface SharesForAmount {
  amount_ngn: number;
  price_ngn: number;
  shares: number;
  cost_ngn: number;
  leftover_ngn: number;
  min_shares: number;
  min_cost_ngn: number;
  meets_minimum: boolean;
}

export interface CostForShares {
  shares: number;
  price_ngn: number;
  cost_ngn: number;
  min_shares: number;
  min_cost_ngn: number;
  meets_minimum: boolean;
}

function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
}

export function sharesForAmount(amountNgn: number, priceNgn: number, minShares: number): SharesForAmount {
  assertNonNegative(amountNgn, "amount_ngn");
  const shares = Math.floor(amountNgn / priceNgn);
  const cost = shares * priceNgn;
  return {
    amount_ngn: amountNgn,
    price_ngn: priceNgn,
    shares,
    cost_ngn: cost,
    leftover_ngn: Number((amountNgn - cost).toFixed(2)),
    min_shares: minShares,
    min_cost_ngn: minShares * priceNgn,
    meets_minimum: shares >= minShares,
  };
}

export function costForShares(shares: number, priceNgn: number, minShares: number): CostForShares {
  assertNonNegative(shares, "shares");
  if (!Number.isInteger(shares)) throw new Error("shares must be a whole number");
  return {
    shares,
    price_ngn: priceNgn,
    cost_ngn: shares * priceNgn,
    min_shares: minShares,
    min_cost_ngn: minShares * priceNgn,
    meets_minimum: shares >= minShares,
  };
}

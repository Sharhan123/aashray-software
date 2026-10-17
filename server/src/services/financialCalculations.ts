import { chargeStatus } from './billingRules.js';

export interface ChargeLedgerInput { amountPaise: number; paidPaise?: number; externalPaidPaise?: number; dueAt: Date }
export interface ResidentChargeInput extends ChargeLedgerInput { kind: 'RENT' | 'UTILITY' | 'OPENING_BALANCE' }
export function chargeBalance(charge: ChargeLedgerInput): number {
  return Math.max(0, charge.amountPaise - (charge.paidPaise ?? 0) - (charge.externalPaidPaise ?? 0));
}
export function chargeLedger(charge: ChargeLedgerInput, now = new Date()) {
  const paidPaise = charge.paidPaise ?? 0;
  const externalPaidPaise = charge.externalPaidPaise ?? 0;
  const balancePaise = chargeBalance(charge);
  return { amountPaise: charge.amountPaise, paidPaise, externalPaidPaise, balancePaise, status: balancePaise === 0 ? 'PAID' as const : chargeStatus(charge.amountPaise, paidPaise + externalPaidPaise, charge.dueAt, now) };
}

export function residentFinancialSummary(charges: ResidentChargeInput[], now = new Date()) {
  let outstandingPaise = 0; let overdueRentPaise = 0; let pendingUtilityPaise = 0; let rentBilledPaise = 0;
  for (const charge of charges) {
    const balance = chargeBalance(charge);
    outstandingPaise += balance;
    if ((charge.kind === 'RENT' || charge.kind === 'OPENING_BALANCE') && charge.dueAt < now) overdueRentPaise += balance;
    if (charge.kind === 'UTILITY') pendingUtilityPaise += balance;
    if (charge.kind === 'RENT') rentBilledPaise += charge.amountPaise;
  }
  return { outstandingPaise, overdueRentPaise, pendingUtilityPaise, rentBilledPaise };
}


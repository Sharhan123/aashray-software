export function migrationOpeningPosition(openingArrearsPaise: number, prepaidRentPaise: number) {
  if (![openingArrearsPaise, prepaidRentPaise].every((amount) => Number.isSafeInteger(amount) && amount >= 0)) throw new Error('Migration amounts must be non-negative whole-paise values.');
  const prepaidAppliedToArrearsPaise = Math.min(openingArrearsPaise, prepaidRentPaise);
  return { openingArrearsPaise, prepaidRentPaise, prepaidAppliedToArrearsPaise, openingBalancePaise: openingArrearsPaise - prepaidAppliedToArrearsPaise, creditRemainingPaise: prepaidRentPaise - prepaidAppliedToArrearsPaise };
}

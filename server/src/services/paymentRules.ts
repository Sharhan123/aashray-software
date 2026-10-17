export interface ChargeAllocationInput { amountPaise: number; remainingPaise: number }

export function validatePaymentAllocations(paymentAmountPaise: number, allocations: ChargeAllocationInput[]) {
  if (allocations.some((allocation) => !Number.isSafeInteger(allocation.amountPaise) || allocation.amountPaise <= 0)) throw new Error('Payment allocations must be positive whole-paise amounts.');
  if (allocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0) > paymentAmountPaise) throw new Error('Payment allocations cannot exceed the payment amount.');
  if (allocations.some((allocation) => allocation.amountPaise > allocation.remainingPaise)) throw new Error('Payment exceeds a selected charge balance.');
}

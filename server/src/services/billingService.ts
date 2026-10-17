import { Resident } from '../models/Resident.js';
import { Charge } from '../models/Charge.js';
import { ResidentMigration } from '../models/ResidentMigration.js';
import { Room } from '../models/Room.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { inTransaction } from './transactions.js';
import { dueDateForPeriod, periodEnd, periodStart } from './billingRules.js';

export interface BillingCandidate {
  residentId: string; residentRecordId: string; fullName: string; roomNumber: string; bedId: string;
  scheduleVersion: number | null; monthlyRentPaise: number; periodKey: string; dueAt: Date;
  existing: boolean; eligible: boolean; exclusionReason: string; proposedPaise: number;
}

export interface BillingEligibilityInput {
  admissionDate: Date; billingStartDate: Date; status: string; effectiveEndDate?: Date | null; expectedDepartureDate?: Date | null;
  rentSchedules: { version: number; monthlyRentPaise: number; dueDay: number; effectiveFrom: Date }[];
  allocations: { startDate: Date; endDate?: Date | null; roomNumber: string; bedId: string }[];
}
export function billingEligibility(resident: BillingEligibilityInput, periodKey: string) {
  const start = periodStart(periodKey); const end = periodEnd(periodKey);
  const schedule = [...resident.rentSchedules].filter((entry) => entry.effectiveFrom < end).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
  const allocation = [...resident.allocations].filter((entry) => entry.startDate < end && (!entry.endDate || entry.endDate >= start)).sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
  let exclusionReason = '';
  if (!schedule) exclusionReason = 'No approved rent schedule covers the period start.';
  else if (resident.billingStartDate >= end) exclusionReason = 'Billing has not started for this period.';
  else if (resident.admissionDate >= end) exclusionReason = 'Admission begins after this period.';
  else if (resident.status === 'INACTIVE' && !(resident.effectiveEndDate && resident.effectiveEndDate >= start)) exclusionReason = 'Inactive tenancy does not cover this period.';
  else if (resident.effectiveEndDate && resident.effectiveEndDate < start) exclusionReason = 'Tenancy ended before this period.';
  else if (resident.status === 'NOTICE' && resident.expectedDepartureDate && resident.expectedDepartureDate < start) exclusionReason = 'Notice period ended before this period.';
  else if (!allocation && resident.status !== 'INACTIVE') exclusionReason = 'No room allocation covers this period.';
  return { schedule, allocation, exclusionReason };
}

export async function previewMonthlyBilling(periodKey: string, propertyId?: string): Promise<{ candidates: BillingCandidate[]; summary: Record<string, number> }> {
  const roomIds = propertyId ? await Room.distinct('_id', { propertyId }) : null;
  const residents = await Resident.find(roomIds ? { allocations: { $elemMatch: { roomId: { $in: roomIds }, endDate: null } } } : {}).lean();
  const candidates: BillingCandidate[] = [];
  for (const resident of residents) {
    const eligibility = billingEligibility(resident, periodKey);
    const { schedule, allocation } = eligibility;
    const existing = await Charge.exists({ residentId: resident._id, kind: 'RENT', periodKey });
    const migration = await ResidentMigration.findOne({ residentId: resident._id }).lean();
    let exclusionReason = eligibility.exclusionReason;
    const paidOutside = migration?.periodKey === periodKey ? migration.currentPeriodSettledPaise : 0;
    if (!exclusionReason && paidOutside >= (schedule?.monthlyRentPaise ?? 0)) exclusionReason = 'Current period was settled outside the software during migration.';
    const eligible = !exclusionReason;
    const monthlyRentPaise = schedule?.monthlyRentPaise ?? 0;
    const dueAt = dueDateForPeriod(periodKey, schedule?.dueDay ?? 1);
    const prepaidApplied = migration ? Math.min(migration.creditRemainingPaise, Math.max(0, monthlyRentPaise - paidOutside)) : 0;
    candidates.push({ residentId: resident.residentId, residentRecordId: String(resident._id), fullName: resident.fullName, roomNumber: allocation?.roomNumber ?? '', bedId: allocation?.bedId ?? '', scheduleVersion: schedule?.version ?? null, monthlyRentPaise, periodKey, dueAt, existing: Boolean(existing), eligible, exclusionReason: existing ? 'A rent charge already exists for this resident and period.' : exclusionReason, proposedPaise: eligible && !existing ? Math.max(0, monthlyRentPaise - paidOutside - prepaidApplied) : 0 });
  }
  const eligibleCount = candidates.filter((c) => c.eligible).length;
  const newCharges = candidates.filter((c) => c.eligible && !c.existing && c.monthlyRentPaise > 0).length;
  const summary = { eligibleResidents: eligibleCount, newChargesToCreate: newCharges, existingChargesToSkip: candidates.filter((c) => c.existing).length, residentsExcluded: candidates.filter((c) => !c.eligible).length, totalAmountProposedPaise: candidates.reduce((sum, c) => sum + c.proposedPaise, 0) };
  return { candidates, summary };
}

export async function generateMonthlyBilling(periodKey: string, actorId: string, propertyId?: string) {
  const preview = await previewMonthlyBilling(periodKey, propertyId);
  let created = 0; let skipped = 0; let createdPaise = 0;
  for (const candidate of preview.candidates) {
    if (!candidate.eligible || candidate.existing || candidate.monthlyRentPaise <= 0) { skipped++; continue; }
    try {
      const amount = await inTransaction(async (session) => {
        const resident = await Resident.findById(candidate.residentRecordId).session(session);
        if (!resident) return 0;
        const current = await Charge.findOne({ residentId: resident._id, kind: 'RENT', periodKey }).session(session);
        if (current) return 0;
        const schedule = [...resident.rentSchedules].filter((entry) => entry.effectiveFrom < periodEnd(periodKey)).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
        if (!schedule || schedule.version !== candidate.scheduleVersion) return 0;
        const migration = await ResidentMigration.findOne({ residentId: resident._id }).session(session);
        const outsideCurrent = migration?.periodKey === periodKey ? Math.min(schedule.monthlyRentPaise, migration.currentPeriodSettledPaise) : 0;
        const creditApplied = migration ? Math.min(migration.creditRemainingPaise, schedule.monthlyRentPaise - outsideCurrent) : 0;
        const externalPaidPaise = outsideCurrent + creditApplied;
        if (migration && creditApplied > 0) { migration.creditRemainingPaise -= creditApplied; await migration.save({ session }); }
        const [charge] = await Charge.create([{ residentId: resident._id, kind: 'RENT', periodKey, description: `Rent for ${periodKey}`, amountPaise: schedule.monthlyRentPaise, paidPaise: 0, externalPaidPaise, issuedAt: new Date(), dueAt: dueDateForPeriod(periodKey, schedule.dueDay), scheduleVersion: schedule.version, idempotencyKey: `rent:${resident._id}:${periodKey}`, createdBy: actorId }], { session });
        await AuditEvent.create([{ actorId, action: 'MONTHLY_RENT_CHARGE_CREATED', entityType: 'Charge', entityId: String(charge!._id), details: { residentId: resident.residentId, periodKey, amountPaise: schedule.monthlyRentPaise, externalPaidPaise } }], { session });
        return charge!.amountPaise;
      });
      if (amount) { created++; createdPaise += amount; } else skipped++;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) skipped++;
      else throw error;
    }
  }
  return { periodKey, created, skipped, createdPaise, preview: preview.summary };
}


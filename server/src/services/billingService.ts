import { Resident } from '../models/Resident.js';
import { Charge } from '../models/Charge.js';
import { ResidentMigration } from '../models/ResidentMigration.js';
import { Room } from '../models/Room.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { inTransaction } from './transactions.js';
import { billingCycleStartDate, billingDayForDate, businessDateOrdinal, dueDateForPeriod, periodEnd } from './billingRules.js';

export interface BillingCandidate {
  residentId: string; residentRecordId: string; fullName: string; roomNumber: string; bedId: string;
  scheduleVersion: number | null; dueDay: number; monthlyRentPaise: number; periodKey: string; dueAt: Date;
  existing: boolean; eligible: boolean; exclusionReason: string; proposedPaise: number;
}

export interface BillingEligibilityInput {
  admissionDate: Date; billingStartDate: Date; status: string; effectiveEndDate?: Date | null; expectedDepartureDate?: Date | null;
  rentSchedules: { version: number; monthlyRentPaise: number; dueDay: number; effectiveFrom: Date }[];
  allocations: { startDate: Date; endDate?: Date | null; roomNumber: string; bedId: string }[];
}
export function billingEligibility(resident: BillingEligibilityInput, periodKey: string) {
  const end = periodEnd(periodKey);
  const cycleSchedules = [...resident.rentSchedules]
    .filter((entry) => entry.effectiveFrom < end)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  const schedule = cycleSchedules.find((entry) => businessDateOrdinal(entry.effectiveFrom) <= businessDateOrdinal(billingCycleStartDate(periodKey, entry.dueDay)));
  const cycleStart = schedule ? billingCycleStartDate(periodKey, schedule.dueDay) : end;
  const cycleStartOrdinal = businessDateOrdinal(cycleStart);
  const allocation = [...resident.allocations].filter((entry) => businessDateOrdinal(entry.startDate) <= cycleStartOrdinal && (!entry.endDate || businessDateOrdinal(entry.endDate) >= cycleStartOrdinal)).sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
  let exclusionReason = '';
  if (!schedule) exclusionReason = 'No approved rent schedule covers the period start.';
  else if (businessDateOrdinal(resident.billingStartDate) > cycleStartOrdinal) exclusionReason = 'Billing has not started for this cycle.';
  else if (businessDateOrdinal(resident.admissionDate) > cycleStartOrdinal) exclusionReason = 'Admission begins after this cycle starts.';
  else if (resident.status === 'INACTIVE' && !(resident.effectiveEndDate && businessDateOrdinal(resident.effectiveEndDate) >= cycleStartOrdinal)) exclusionReason = 'Inactive tenancy does not cover this cycle.';
  else if (resident.effectiveEndDate && businessDateOrdinal(resident.effectiveEndDate) < cycleStartOrdinal) exclusionReason = 'Tenancy ended before this cycle.';
  else if (resident.status === 'NOTICE' && resident.expectedDepartureDate && businessDateOrdinal(resident.expectedDepartureDate) < cycleStartOrdinal) exclusionReason = 'Notice period ended before this cycle.';
  else if (!allocation && resident.status !== 'INACTIVE') exclusionReason = 'No room allocation covers this period.';
  return { schedule, allocation, exclusionReason };
}

export async function previewMonthlyBilling(periodKey: string, propertyId?: string, propertyIds?: string[]): Promise<{ candidates: BillingCandidate[]; summary: Record<string, number> }> {
  const roomIds = propertyId ? await Room.distinct('_id', { propertyId }) : propertyIds ? await Room.distinct('_id', { propertyId: { $in: propertyIds } }) : null;
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
    const dueDay = schedule?.dueDay ?? billingDayForDate(resident.admissionDate);
    const dueAt = dueDateForPeriod(periodKey, dueDay);
    const prepaidApplied = migration ? Math.min(migration.creditRemainingPaise, Math.max(0, monthlyRentPaise - paidOutside)) : 0;
    candidates.push({ residentId: resident.residentId, residentRecordId: String(resident._id), fullName: resident.fullName, roomNumber: allocation?.roomNumber ?? '', bedId: allocation?.bedId ?? '', scheduleVersion: schedule?.version ?? null, dueDay, monthlyRentPaise, periodKey, dueAt, existing: Boolean(existing), eligible, exclusionReason: existing ? 'A rent charge already exists for this resident and period.' : exclusionReason, proposedPaise: eligible && !existing ? Math.max(0, monthlyRentPaise - paidOutside - prepaidApplied) : 0 });
  }
  const eligibleCount = candidates.filter((c) => c.eligible).length;
  const newCharges = candidates.filter((c) => c.eligible && !c.existing && c.monthlyRentPaise > 0).length;
  const summary = { eligibleResidents: eligibleCount, newChargesToCreate: newCharges, existingChargesToSkip: candidates.filter((c) => c.existing).length, residentsExcluded: candidates.filter((c) => !c.eligible).length, totalAmountProposedPaise: candidates.reduce((sum, c) => sum + c.proposedPaise, 0) };
  return { candidates, summary };
}

export async function generateMonthlyBilling(periodKey: string, actorId: string, propertyId?: string, propertyIds?: string[]) {
  const preview = await previewMonthlyBilling(periodKey, propertyId, propertyIds);
  let created = 0; let skipped = 0; let createdPaise = 0;
  for (const candidate of preview.candidates) {
    if (!candidate.eligible || candidate.existing || candidate.monthlyRentPaise <= 0) { skipped++; continue; }
    try {
      const amount = await inTransaction(async (session) => {
        const resident = await Resident.findById(candidate.residentRecordId).session(session);
        if (!resident) return 0;
        const current = await Charge.findOne({ residentId: resident._id, kind: 'RENT', periodKey }).session(session);
        if (current) return 0;
        const cycleStart = billingCycleStartDate(periodKey, candidate.dueDay);
        const schedule = [...resident.rentSchedules].filter((entry) => businessDateOrdinal(entry.effectiveFrom) <= businessDateOrdinal(cycleStart)).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
        if (!schedule || schedule.version !== candidate.scheduleVersion) return 0;
        const migration = await ResidentMigration.findOne({ residentId: resident._id }).session(session);
        const outsideCurrent = migration?.periodKey === periodKey ? Math.min(schedule.monthlyRentPaise, migration.currentPeriodSettledPaise) : 0;
        const creditApplied = migration ? Math.min(migration.creditRemainingPaise, schedule.monthlyRentPaise - outsideCurrent) : 0;
        const externalPaidPaise = outsideCurrent + creditApplied;
        if (migration && creditApplied > 0) { migration.creditRemainingPaise -= creditApplied; await migration.save({ session }); }
        // Use the schedule selected for this resident-cycle. Admission dates
        // can differ from a later rent schedule's anniversary day.
        const dueDay = schedule.dueDay;
        const [charge] = await Charge.create([{ residentId: resident._id, kind: 'RENT', periodKey, description: `Rent for ${periodKey}`, amountPaise: schedule.monthlyRentPaise, paidPaise: 0, externalPaidPaise, issuedAt: new Date(), dueAt: dueDateForPeriod(periodKey, dueDay), scheduleVersion: schedule.version, idempotencyKey: `rent:${resident._id}:${periodKey}`, createdBy: actorId }], { session });
        await AuditEvent.create([{ actorId, action: 'MONTHLY_RENT_CHARGE_CREATED', entityType: 'Charge', entityId: String(charge!._id), details: { residentId: resident.residentId, periodKey, amountPaise: schedule.monthlyRentPaise, externalPaidPaise, dueDay } }], { session });
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


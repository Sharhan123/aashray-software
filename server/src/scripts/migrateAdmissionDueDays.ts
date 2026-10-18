import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { Charge } from '../models/Charge.js';
import { Resident } from '../models/Resident.js';
import { billingDayForDate, billingStartDateForPeriod, dueDateForPeriod, periodKeyFor } from '../services/billingRules.js';

function laterPeriod(first: string, second: string) {
  return first >= second ? first : second;
}

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDatabase();
  const now = new Date();
  const currentPeriod = periodKeyFor(now);
  const residents = await Resident.find().select('_id residentId admissionDate billingStartDate createdAt rentSchedules').lean();
  const residentUpdates: Parameters<typeof Resident.bulkWrite>[0] = [];
  const chargeUpdates: Parameters<typeof Charge.bulkWrite>[0] = [];
  const residentPlans = new Map<string, { day: number; billingStartDate: Date }>();
  let invalidAdmissionDates = 0;
  let residentsWithNoSchedule = 0;

  for (const resident of residents) {
    if (!(resident.admissionDate instanceof Date) || Number.isNaN(resident.admissionDate.getTime())) {
      invalidAdmissionDates++;
      continue;
    }
    const admissionDay = billingDayForDate(resident.admissionDate);
    const creationPeriod = resident.createdAt ? periodKeyFor(resident.createdAt) : periodKeyFor(resident.billingStartDate);
    const billingPeriod = laterPeriod(periodKeyFor(resident.billingStartDate), creationPeriod);
    const billingStartDate = billingStartDateForPeriod(billingPeriod, admissionDay);
    residentPlans.set(String(resident._id), { day: admissionDay, billingStartDate });

    const currentScheduleIndex = resident.rentSchedules.length - 1;
    if (currentScheduleIndex < 0) residentsWithNoSchedule++;
    const currentSchedule = resident.rentSchedules[currentScheduleIndex];
    const updatedSchedules = resident.rentSchedules.map((schedule, index) => (
      index === currentScheduleIndex ? { ...schedule, dueDay: admissionDay } : schedule
    ));
    const schedulesChanged = Boolean(currentSchedule && currentSchedule.dueDay !== admissionDay);
    const startChanged = resident.billingStartDate.getTime() !== billingStartDate.getTime();
    if (startChanged || schedulesChanged) {
      residentUpdates.push({
        updateOne: {
          filter: { _id: resident._id },
          update: { $set: { billingStartDate, rentSchedules: updatedSchedules } },
        },
      });
    }
  }

  if (invalidAdmissionDates > 0) {
    throw new Error(`${invalidAdmissionDates} resident records have a missing or invalid admissionDate; no database changes were made.`);
  }

  const currentCharges = await Charge.find({ kind: 'RENT', periodKey: currentPeriod }).select('_id residentId dueAt').lean();
  for (const charge of currentCharges) {
    const plan = residentPlans.get(String(charge.residentId));
    if (!plan) continue;
    const dueAt = dueDateForPeriod(currentPeriod, plan.day);
    if (charge.dueAt.getTime() !== dueAt.getTime()) {
      chargeUpdates.push({ updateOne: { filter: { _id: charge._id }, update: { $set: { dueAt } } } });
    }
  }

  console.log(`Mode: ${apply ? 'APPLY' : 'PREVIEW'}; business month: ${currentPeriod}`);
  console.log(`Residents scanned: ${residents.length}`);
  console.log(`Resident billing dates/schedules to update: ${residentUpdates.length}`);
  console.log(`Current-month rent due dates to correct: ${chargeUpdates.length}`);
  console.log(`Residents without rent schedules: ${residentsWithNoSchedule}`);
  console.log('Prior-period charges and all payment amounts/allocations are left unchanged.');

  if (apply) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (residentUpdates.length) await Resident.bulkWrite(residentUpdates, { session });
        if (chargeUpdates.length) await Charge.bulkWrite(chargeUpdates, { session });
      });
    } finally {
      await session.endSession();
    }
    console.log('Migration committed.');
  } else {
    console.log('Preview only. Run with --apply to commit these changes.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Billing date migration failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

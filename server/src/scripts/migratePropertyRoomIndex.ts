import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';

async function migrate() {
  await connectDatabase();
  try {
    const collection = mongoose.connection.collection('rooms');
    const indexes = await collection.indexes();
    const oldIndex = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify({ propertyName: 1, roomNumber: 1 }));
    const newIndex = indexes.find((index) => index.name === 'unique_room_number_per_property');
    console.log(JSON.stringify({ oldIndex: oldIndex?.name ?? null, newIndex: newIndex?.name ?? null, apply: process.argv.includes('--apply') }, null, 2));
    if (!process.argv.includes('--apply')) {
      console.log('Dry run. Review unassigned rooms in the app, then run with --apply to create the property-scoped index and remove the legacy property-name index.');
      return;
    }
    await collection.createIndex({ propertyId: 1, roomNumber: 1 }, { unique: true, partialFilterExpression: { propertyId: { $type: 'objectId' } }, name: 'unique_room_number_per_property' });
    if (oldIndex?.name && oldIndex.name !== '_id_') await collection.dropIndex(oldIndex.name);
    console.log('Property-scoped room uniqueness index is active. No room or financial documents were modified.');
  } finally {
    await mongoose.disconnect();
  }
}

migrate().catch((error: unknown) => { console.error(error); process.exitCode = 1; });

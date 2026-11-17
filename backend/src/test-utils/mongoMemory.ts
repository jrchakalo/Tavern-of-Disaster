import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer | null = null;

export async function connectMongoMemory() {
  if (mongo) {
    return;
  }
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri, {
    dbName: 'test-db',
  });
}

export async function disconnectMongoMemory() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.connection.close();
  }
  if (mongo) {
    await mongo.stop();
    mongo = null;
  }
}

export async function clearMongoMemory() {
  if (mongoose.connection.readyState === 0) {
    return;
  }
  const collections = mongoose.connection.collections;
  const tasks = Object.values(collections).map((collection) => collection.deleteMany({}));
  await Promise.all(tasks);
}

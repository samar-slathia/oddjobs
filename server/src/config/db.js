const mongoose = require('mongoose');

let mongoMemoryServer = null;

const connectDB = async () => {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const connUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/oddjobs';

  try {
    const conn = await mongoose.connect(connUri, {
      serverSelectionTimeoutMS: 2000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (primaryErr) {
    if (process.env.NODE_ENV === 'test') {
      throw primaryErr;
    }

    console.warn(`Primary MongoDB connection (${connUri}) unavailable: ${primaryErr.message}`);
    console.log('Spinning up MongoMemoryServer fallback for local development...');

    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoMemoryServer = await MongoMemoryServer.create();
    const memoryUri = mongoMemoryServer.getUri();

    const conn = await mongoose.connect(memoryUri);
    console.log(`MongoDB Connected (Memory Server): ${conn.connection.host}`);
    return conn;
  }
};

const disconnectDB = async () => {
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
};

module.exports = { connectDB, disconnectDB };

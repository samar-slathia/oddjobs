const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function test() {
  try {
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    console.log('Uri:', uri);
    await mongoose.connect(uri);
    console.log('Connected successfully!');
    await mongoose.disconnect();
    await mongoServer.stop();
  } catch (err) {
    console.error('Error in test:', err);
  }
}

test();

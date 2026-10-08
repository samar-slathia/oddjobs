const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');

async function testUser() {
  try {
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    console.log('DB Connected!');

    const user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      role: 'customer',
    });

    console.log('User created:', user.email, 'Role:', user.role);

    const found = await User.findOne({ email: 'test@example.com' }).select('+password');
    const isMatch = await found.matchPassword('password123');
    console.log('Password match:', isMatch);

    await mongoose.disconnect();
    await mongoServer.stop();
  } catch (err) {
    console.error('Error in user test:', err);
  }
}

testUser();

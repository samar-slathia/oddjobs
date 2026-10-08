const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const { connectDB, disconnectDB } = require('../config/db');

const seedData = async () => {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
    console.error('ERROR: Database seeding is disabled in production environment.');
    console.error('Set ALLOW_SEED=true if you explicitly intend to seed production database.');
    process.exit(1);
  }

  try {
    await connectDB();
    console.log('Clearing existing database collections...');

    await User.deleteMany();
    await Service.deleteMany();
    await Booking.deleteMany();
    await Review.deleteMany();
    await Notification.deleteMany();

    console.log('Creating seed users...');

    // Password for all seed users: Password123!
    const admin = await User.create({
      name: 'System Admin',
      email: 'admin@oddjobs.com',
      password: 'Password123!',
      role: 'admin',
      phone: '+1 555-0100',
      location: 'Downtown HQ',
      bio: 'OddJobs Lead Administrator',
    });

    const provider1 = await User.create({
      name: 'Alex Rivera',
      email: 'alex.electric@oddjobs.com',
      password: 'Password123!',
      role: 'service_provider',
      phone: '+1 555-0199',
      location: 'Northside, City',
      bio: 'Licensed Master Electrician with 10+ years of residential & commercial experience.',
    });

    const provider2 = await User.create({
      name: 'Sarah Jenkins',
      email: 'sarah.clean@oddjobs.com',
      password: 'Password123!',
      role: 'service_provider',
      phone: '+1 555-0188',
      location: 'Westside, City',
      bio: 'Professional home & office cleaning service with eco-friendly supplies.',
    });

    const provider3 = await User.create({
      name: 'David Miller',
      email: 'david.plumb@oddjobs.com',
      password: 'Password123!',
      role: 'service_provider',
      phone: '+1 555-0177',
      location: 'Eastside, City',
      bio: '24/7 Emergency plumbing repairs, pipe fitting, and fixture installations.',
    });

    const customer1 = await User.create({
      name: 'John Doe',
      email: 'customer@oddjobs.com',
      password: 'Password123!',
      role: 'customer',
      phone: '+1 555-0111',
      location: 'Central Park Quarter',
      bio: 'Homeowner looking for reliable local help.',
    });

    const customer2 = await User.create({
      name: 'Emily Watson',
      email: 'emily@oddjobs.com',
      password: 'Password123!',
      role: 'customer',
      phone: '+1 555-0122',
      location: 'Southside Heights',
    });

    console.log('Creating seed services...');

    const service1 = await Service.create({
      title: 'Emergency Electrical Wiring & Circuit Fix',
      description: 'Complete electrical troubleshooting, circuit breaker replacement, outlet repairs, and ceiling fan installs.',
      category: 'Electrician',
      price: 85,
      priceType: 'hourly',
      location: 'Northside, City',
      provider: provider1._id,
    });

    const service2 = await Service.create({
      title: 'Full Home Deep Cleaning & Sanitization',
      description: 'Top-to-bottom deep house cleaning including kitchen appliances, bathroom scrubbing, floor polishing, and window washing.',
      category: 'Cleaner',
      price: 150,
      priceType: 'fixed',
      location: 'Westside, City',
      provider: provider2._id,
    });

    const service3 = await Service.create({
      title: 'Leaky Faucet & Pipe Repair Specialist',
      description: 'Expert plumbing repairs for clogged drains, leaking pipes, toilet replacements, and water heater servicing.',
      category: 'Plumber',
      price: 95,
      priceType: 'hourly',
      location: 'Eastside, City',
      provider: provider3._id,
    });

    const service4 = await Service.create({
      title: 'Custom Furniture Assembly & Carpentry',
      description: 'Assembly of IKEA/Wayfair furniture, custom shelving units, cabinet installations, and wood repairs.',
      category: 'Carpenter',
      price: 60,
      priceType: 'hourly',
      location: 'Northside, City',
      provider: provider1._id,
    });

    const service5 = await Service.create({
      title: 'Interior Room Painting & Wall Touch-ups',
      description: 'High-quality wall painting, drywall patch repair, trim painting with premium low-VOC paints.',
      category: 'Painter',
      price: 200,
      priceType: 'fixed',
      location: 'Westside, City',
      provider: provider2._id,
    });

    console.log('Creating sample bookings & reviews...');

    const booking1 = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: service1._id,
      status: 'completed',
      scheduledDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      address: '742 Evergreen Terrace, Apt 4B',
      notes: 'Main breaker keeps tripping when AC is on.',
      price: 85,
      statusHistory: [
        { status: 'pending', updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
        { status: 'accepted', updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
        { status: 'in_progress', updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        { status: 'completed', updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      ],
    });

    const review1 = await Review.create({
      booking: booking1._id,
      customer: customer1._id,
      provider: provider1._id,
      service: service1._id,
      rating: 5,
      comment: 'Alex arrived right on time, diagnosed the faulty breaker immediately, and fixed it within an hour. Highly recommended!',
    });

    // Update rating on service and provider
    await Service.findByIdAndUpdate(service1._id, { rating: 5, numReviews: 1 });
    await User.findByIdAndUpdate(provider1._id, { rating: 5, numReviews: 1 });

    const booking2 = await Booking.create({
      customer: customer1._id,
      provider: provider2._id,
      service: service2._id,
      status: 'pending',
      scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      address: '742 Evergreen Terrace, Apt 4B',
      notes: 'Please focus on kitchen deep clean.',
      price: 150,
      statusHistory: [{ status: 'pending', updatedAt: new Date() }],
    });

    await Notification.create({
      user: provider2._id,
      title: 'New Service Request',
      message: `You received a new request for "${service2.title}" from John Doe`,
      type: 'booking',
      link: '/provider/requests',
    });

    console.log('=============================================');
    console.log('Database Seeded Successfully!');
    console.log('Seed User Credentials:');
    console.log('---------------------------------------------');
    console.log('Customer:         customer@oddjobs.com / Password123!');
    console.log('Service Provider: alex.electric@oddjobs.com / Password123!');
    console.log('System Admin:     admin@oddjobs.com / Password123!');
    console.log('=============================================');

    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error(`Error Seeding Data: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
};

seedData();

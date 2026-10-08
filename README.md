# OddJobs - Local Services Marketplace

OddJobs is a production-style fullstack web application designed for discovering, booking, and managing local services (such as electricians, plumbers, cleaners, carpenters, appliance repair technicians, and tutors).

Built with **Node.js, Express, MongoDB/Mongoose, JWT Authentication (HttpOnly cookie), React, Vite, and Tailwind CSS**.

---

## 🌟 Key Features

### 👤 Customer
- **Account Registration & Login**: Role-based access with JWT authentication.
- **Service Discovery & Search**: Real-time multi-criteria filtering by title, category, location, price, rating, and sorting.
- **Service Request Booking**: Request services with date/time picker, address, and special notes.
- **Booking Tracking**: Live status workflow tracking (`pending` ➔ `accepted` ➔ `in_progress` ➔ `completed`).
- **Reviews & Ratings**: Submit ratings and detailed reviews upon service completion.

### 🛠️ Service Provider
- **Provider Dashboard**: Overview of pending requests, active jobs, completed jobs, and total earnings.
- **Service Listings Management**: Create, edit, publish, or deactivate service offerings with pricing options (fixed vs hourly).
- **Request Workflow Management**: Accept or reject pending customer requests, mark jobs in progress, and transition to completed.

### 🛡️ Admin
- **Platform Analytics**: Total users, providers, published services, booking volume, and gross platform revenue.
- **User Governance & Moderation**: Search users, toggle account active/disabled status, and update user roles.
- **Content Moderation**: Administrative oversight on service listings and bookings.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, React Router v6, Tailwind CSS v4, Axios, Lucide Icons.
- **Backend**: Node.js, Express.js.
- **Database**: MongoDB & Mongoose. *(Includes automatic `MongoMemoryServer` fallback for zero-config local development and automated testing)*.
- **Authentication**: JSON Web Token (JWT) with HttpOnly cookies, bcryptjs password hashing, and role-based access control (RBAC) middleware.
- **Security**: Helmet security headers, CORS protection, express-rate-limit, express-validator input sanitization.

---

## 📁 Project Structure

```
OddJobs/
├── .gitignore
├── README.md
├── server/
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   ├── scratch/
│   │   └── run_tests.js        # Automated integration test runner
│   └── src/
│       ├── index.js             # Server entry point
│       ├── app.js               # Express application configuration
│       ├── config/
│       │   └── db.js            # Mongoose connection & MongoMemoryServer fallback
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── serviceController.js
│       │   ├── bookingController.js
│       │   ├── reviewController.js
│       │   ├── adminController.js
│       │   └── notificationController.js
│       ├── middleware/
│       │   ├── auth.js          # JWT verify & RBAC authorize middleware
│       │   ├── errorHandler.js  # Centralized error handler
│       │   └── validate.js      # Input validation middleware
│       ├── models/
│       │   ├── User.js
│       │   ├── Service.js
│       │   ├── Booking.js
│       │   ├── Review.js
│       │   └── Notification.js
│       ├── routes/
│       │   ├── authRoutes.js
│       │   ├── serviceRoutes.js
│       │   ├── bookingRoutes.js
│       │   ├── reviewRoutes.js
│       │   ├── adminRoutes.js
│       │   └── notificationRoutes.js
│       └── utils/
│           ├── jwt.js           # JWT token issuer & cookie handler
│           └── seed.js          # Database seed script with demo users
└── client/
    ├── index.html
    ├── package.json
    ├── vite.config.js           # Vite config with Tailwind & proxy rules
    └── src/
        ├── main.jsx
        ├── App.jsx              # React Router & Protected Routes
        ├── context/
        │   └── AuthContext.jsx  # Global Authentication State
        ├── services/
        │   ├── api.js           # Axios instance with interceptors
        │   ├── authService.js
        │   ├── serviceService.js
        │   ├── bookingService.js
        │   ├── reviewService.js
        │   ├── adminService.js
        │   └── notificationService.js
        ├── components/
        │   ├── common/          # Navbar, Footer, Modal, Badge, RatingStars, ProtectedRoute
        │   ├── services/        # ServiceCard, ServiceFilter, ServiceFormModal
        │   ├── bookings/        # BookingCard, BookingModal
        │   └── reviews/         # ReviewCard, ReviewModal
        ├── pages/
        │   ├── HomePage.jsx
        │   ├── BrowseServicesPage.jsx
        │   ├── ServiceDetailPage.jsx
        │   ├── LoginPage.jsx
        │   ├── RegisterPage.jsx
        │   ├── customer/        # CustomerDashboard.jsx
        │   ├── provider/        # ProviderDashboard.jsx, ProviderRequestsPage.jsx, ProviderServicesPage.jsx
        │   └── admin/           # AdminDashboard.jsx
        └── utils/
            └── formatters.js
```

---

## 🔑 Environment Variables

The server uses environment variables defined in `server/.env`. A template is provided in `server/.env.example`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/oddjobs
JWT_SECRET=oddjobs_super_secret_jwt_key_2026_prod_grade_32_bytes_long!
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

> [!NOTE]
> For local development, if a local MongoDB daemon is not running on `MONGODB_URI`, the server automatically spins up an in-memory `MongoMemoryServer` so the application runs seamlessly out-of-the-box. This fallback is disabled in production to ensure data persistence.

---

## 🚀 Quick Start Instructions

### 1. Install Dependencies

Install backend dependencies:
```bash
cd server
npm install
```

Install frontend dependencies:
```bash
cd ../client
npm install
```

### 2. Seed Database with Demo Accounts

Populate the database with pre-configured demo users, service listings, bookings, and reviews:
```bash
cd server
npm run seed
```

#### Demo Credentials:
- **Customer**: `customer@oddjobs.com` / `Password123!`
- **Service Provider**: `alex.electric@oddjobs.com` / `Password123!`
- **System Admin**: `admin@oddjobs.com` / `Password123!`

*(The Login page also includes 1-click Demo Account buttons for fast testing).*

### 3. Start Backend Server

```bash
cd server
npm run dev
# Server running at http://localhost:5000
```

### 4. Start Frontend Client

```bash
cd client
npm run dev
# Client running at http://localhost:5173
```

---

## 🧪 Testing

The backend includes an automated integration test suite covering authentication, RBAC, service CRUD, search filtering, booking state machine transitions, and review aggregation.

Run the test suite:
```bash
cd server
npm test
```

---

## 🛡️ Security Architecture

1. **HttpOnly Cookie JWT Storage**: JWTs are transmitted via HttpOnly cookies with `SameSite: 'lax'` to protect against XSS token theft, with Bearer header fallback for API testing.
2. **Password Security**: Passwords are salted and hashed using `bcryptjs` with cost factor 10. Passwords are never returned in JSON responses (`select: false`).
3. **Role-Based Authorization (RBAC)**: Strict `protect` and `authorize('customer', 'service_provider', 'admin')` middleware enforces server-side permission checks.
4. **Rate Limiting & Security Headers**: Helmet protects against common web vulnerabilities, while `express-rate-limit` prevents brute-force login attempts.

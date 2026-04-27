# RAI Backend

This is the backend service for the **RAI Application**, built using **Node.js** and **Express.js**. It provides a robust REST API framework coupled with real-time WebSocket capabilities, data modeling with MongoDB, and integration with third-party services like AWS S3, Cloudinary, and Passport.js for authentication.

## 🚀 Tech Stack

- **Core Framework**: Node.js, Express.js
- **Database**: MongoDB (via Mongoose)
- **Real-time Communication**: Socket.io
- **Authentication**: Passport.js (Apple & Google SignIn), JSON Web Tokens (JWT), bcrypt
- **Storage/Media Processing**: Multer, Cloudinary, AWS S3
- **Validation**: Zod
- **Other Utils**: Nodemailer, Cron Jobs (`node-cron`, `node-schedule`)

---

## 📂 Project Structure & File Locations

All source code resides inside the `src/` directory. Here is how the functionality is logically separated:

```text
/src
 ├── server.js              # Application Entry Point & Express Setup
 ├── socket.js              # WebSocket Initialization and Event Handlers
 ├── /routes                # API Route Definitions (e.g., auth.routes.js, item.routes.js)
 ├── /controllers           # Request Handling & Orchestration
 ├── /services              # Core Business Logic and calculations
 ├── /models                # MongoDB / Mongoose Schemas & DB interactions
 ├── /middlewares           # Express Middlewares (e.g., authChecks, validation)
 ├── /utils                 # Reusable utility functions & Zod Validation Schemas
 └── /config                # Third-party configurations and environment setup
```

### Component Details

1. **`server.js`**: The main entry point where Express is instantiated, middlewares (like CORS, Helmet, Morgan) are injected, Base API Routes are defined, and the MongoDB connection is established.
2. **`routes/`**: Contains modular router files. It defines API endpoints (Paths, HTTP Methods) and maps them to their respective Controller functions, applying security Middlewares in the middle if needed.
3. **`controllers/`**: Extracts data from `req.body`, `req.params`, or `req.query`, and proxies the information to the Service layer. Once the Service layer completes execution, controllers format and dispatch the final HTTP responses back to the client.
4. **`services/`**: The brain of the API. Holds all business rules, algorithms, and orchestration. It interfaces with the `models/` directory for database transactions and keeps the controllers "skinny."
5. **`models/`**: Defines the data shape and relationships inside MongoDB utilizing Mongoose schemas.
6. **`middlewares/`**: Contains interceptor functions like `auth.middleware.js` to verify JWT tokens and inject `req.user` logic before standard controllers hit.
7. **`socket.js`**: Initializes the real-time server using `Socket.io`, managing socket connection events required for live features.

---

## 🔄 General Application Flow (Logic & Request Lifecycle)

The conventional flow of an incoming HTTP request within this application goes through the following funnel:

1. **Client Request**: A client calls an endpoint (e.g., `POST /auth/signin`).
2. **Server Router (`server.js` -> `routes/`)**: 
   - Express router intercepts the path prefix `/auth`, relaying it to `auth.routes.js`.
   - `auth.routes.js` matches the explicit path `/signin`.
3. **Middlewares (`middlewares/`)**:
   - For protected routes, structural middlewares run first (validating tokens or parsing multiparts via Multer).
4. **Controller (`controllers/`)**:
   - `SigninController` receives the request.
   - Initial layout payloads (like `req.body`) are mapped.
   - Optionally verified against Zod schemas (found in `utils/Validation.js`).
5. **Service Layer (`services/`)**:
   - Logic is handed off to `AuthService.signin(email, password)`.
   - The Service searches the Database via the **Model**.
   - Applies complex business implementations (e.g., matching bcrypt hashes).
6. **Database execution (`models/`)**: Mongoose translates object calls into Mongo query execution. 
7. **Response (`controllers/`)**: The service returns a valid success payload or throws a structured JSON Error back up to the controller, which parses it securely to the client using res.status().json().

---

## ⚙️ Running the Project

### Environment Variables
Ensure an `.env` file exists at the root of the project featuring keys for standard services (e.g., `PORT`, `MONGO_URI`, Cloudinary/S3 keys, JWT secrets).

### Available Scripts

**Start in Development (Watch Mode with Nodemon):**
```bash
npm run dev
```

**Start in Production:**
```bash
npm start
```

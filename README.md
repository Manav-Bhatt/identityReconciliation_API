# Bitespeed Backend Task: Identity Reconciliation

A production-ready Node.js microservice designed to handle identity reconciliation for e-commerce stores. This API links fragmented customer data (emails and phone numbers) across multiple orders, seamlessly consolidating them into a single unified customer profile.

---

## 🚀 Live Deployment

- **Base URL:** `https://identityreconciliationapi-production.up.railway.app`
- **Endpoint:** `POST /identify`->`identityreconciliationapi-production.up.railway.app/identify`
- **Health Check:** `GET /`

---

## 🛠️ Tech Stack

- **Runtime & Framework:** Node.js, Express  
- **Language:** TypeScript (Strict mode enabled)  
- **ORM:** Prisma  
- **Database:** PostgreSQL (Hosted on Neon)  
- **Deployment:** Railway  

---

## 🧠 Core Logic Flow & Architecture

The system treats customer identities as a **Tree** data structure. The oldest contact is the **Root Primary**, and any subsequent linked contacts are **Secondary** nodes pointing to that root.

When a `POST /identify` request is received, the system dynamically queries the database for any matching emails or phone numbers and handles the following four scenarios:

### 1. New Customer (Creation)
If no matches are found in the database, a new `Contact` row is created with `linkPrecedence` set to `"primary"`.

---

### 2. New Information (Extension)
If the incoming data matches an existing tree, but introduces a **new piece of information** (e.g., a known phone number but a brand new email):

- A new `Contact` row is created  
- `linkPrecedence` is set to `"secondary"`  
- It is linked to the oldest primary contact  

---

### 3. Status Quo (Retrieval)
If the incoming email and phone number already exist exactly as provided within the same tree:

- No database mutations occur  
- The existing consolidated profile is returned  

---

### 4. Account Consolidation (The Merge)
If an incoming request bridges two previously isolated primary accounts:

- Identify the **oldest primary contact** across all matched trees  
- Demote newer primary contacts to `"secondary"`  
- Update all secondary contacts of demoted primaries to point to the oldest root  

This ensures a **flattened and efficient query structure**.

---

## 💻 Local Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/Manav-Bhatt/identityReconciliation_API.git
cd identityReconciliation_API
```

### 2. Install dependencies
```bash
npm install
```
### 3. Environment Configuration

```bash

Create a .env file in the root directory:
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
```
### 4. Database Sync & Build
```bash
npx prisma db push
npx prisma generate
npm run build
```
### 5. Run the server
```bash
npm start
```

## 📡 API Documentation

POST /identify

Identifies and consolidates contact information based on a provided email and/or phone number.

Request Payload
```bash
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}
```
Successful Response (200 OK)
```bash
{
  "contact": {
    "primaryContatctId": 1,
    "emails": [
      "lorraine@hillvalley.edu",
      "mcfly@hillvalley.edu"
    ],
    "phoneNumbers": [
      "123456"
    ],
    "secondaryContactIds": [2, 3]
  }
}
```

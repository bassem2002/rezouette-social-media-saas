# Rezouette — Social Media Management SaaS 🚀

> Multi-platform social media management platform built with NestJS, Angular, Prisma and PostgreSQL.

**Rezouette** is a Full-Stack SaaS project designed to centralize social media account connections, content publishing, scheduling, publication monitoring and analytics from a single interface.

The platform currently supports the Meta ecosystem and provides extensible integrations for TikTok, LinkedIn and YouTube.

---

## 🎯 Project Objectives

Rezouette aims to simplify multi-platform social media management by providing a unified workspace to:

- Connect social media accounts through OAuth
- Publish content from a single interface
- Publish to multiple platforms
- Schedule future publications
- Manage images and videos
- Monitor publication status
- Track publication history
- Monitor account token status
- Visualize publishing activity and analytics
- Provide an extensible architecture for additional social networks

---

## 🌐 Social Media Integrations

| Platform | Main Capabilities | Validation Status |
| --- | --- | --- |
| **Facebook Pages** | OAuth, text/image publishing, history, scheduling | ✅ Operational |
| **Instagram Business** | OAuth, image/caption publishing, history, scheduling | ✅ Operational |
| **TikTok** | OAuth + PKCE, video publishing, token refresh, scheduling | 🚧 Implemented — real-world validation pending |
| **LinkedIn** | OAuth/OIDC, text/link/image publishing, token monitoring, scheduling | 🧪 Implemented and tested with mocks |
| **YouTube** | OAuth + PKCE, multi-channel support, resumable video upload, scheduling and processing reconciliation | 🧪 Implemented and tested with mocks |

> LinkedIn and YouTube publishing are disabled by default until real provider credentials and production validation are completed.

---

## 🚀 Main Features

### 🔗 Social Account Connections

Rezouette provides OAuth-based connections for supported social networks.

The platform manages:

- Account connection
- OAuth callbacks
- Connected account information
- Token status
- Reconnection requirements
- Multiple provider-specific authentication flows

---

### ✍️ Multi-Platform Publishing

Content can be prepared from one interface and sent to supported social platforms.

The backend isolates provider-specific implementations so that failures on one platform do not necessarily prevent the other selected platforms from being processed.

Supported content depends on the selected provider:

- Text
- Images
- Videos
- Links
- Platform-specific publication options

---

### 📅 Scheduled Publishing

Publications can be scheduled for later execution.

The scheduling lifecycle includes:

```text
SCHEDULED
    ↓
PROCESSING
    ↓
PUBLISHED / FAILED / CANCELLED
```

A background scheduler detects due publications and delegates them to the corresponding publishing workflow.

---

### 🗓️ Publication Calendar

The Angular frontend provides a calendar view for scheduled publications.

Users can:

- View upcoming posts
- Inspect publication details
- Follow scheduled content
- Cancel eligible scheduled publications

---

### 🖼️ Media Management

Rezouette supports local media uploads for social publications.

Supported media include:

- Images
- Videos

The backend validates uploaded media before storing and exposing them to publishing workflows.

YouTube publishing uses controlled local media access rather than downloading arbitrary remote URLs.

---

### 📚 Publication History

Every publication attempt can be persisted with its status.

Typical publication states include:

```text
PENDING
PUBLISHED
FAILED
```

The platform keeps provider-specific publication information and normalized error diagnostics.

---

### 🔄 Token Lifecycle Management

The platform monitors the lifecycle of connected social account tokens.

Possible states include:

```text
VALID
EXPIRING_SOON
EXPIRED
RECONNECT_REQUIRED
```

Token handling is adapted to the behavior of each provider.

---

### 📊 Analytics

Rezouette provides an analytics API and dashboard based on local publication history.

Available information includes:

- Publication KPIs
- Publications by platform
- Error distribution
- Daily publishing activity
- Scheduled publication status

> Current analytics are derived from Rezouette's own publication history. They are not real-time views, likes or comments retrieved from every social network.

---

### 🧾 Swagger / OpenAPI

The backend exposes interactive API documentation using Swagger / OpenAPI.

This makes it easier to:

- Explore available endpoints
- Inspect request DTOs
- Understand provider-specific APIs
- Test backend routes during development

---

## 🛠️ Tech Stack

### Backend

`NestJS 11`  
`TypeScript`  
`Prisma ORM`  
`PostgreSQL`  
`Swagger / OpenAPI`

### Authentication & Integrations

`OAuth 2.0`  
`PKCE S256`  
`OpenID Connect`  
`HMAC-SHA256`  
`JWKS / JOSE`

### Frontend

`Angular 21`  
`TypeScript`  
`RxJS`  
`Angular Signals`  
`TanStack Query`  
`Reactive Forms`  
`TailwindCSS`

### Testing & Development

`Jest`  
`ts-jest`  
`Git`  
`GitHub`

---

## 🏗️ Architecture

The Rezouette backend follows **Clean Architecture** principles.

The objective is to separate business logic from frameworks, databases and external social-media APIs.

```text
┌───────────────────────────────────────────────┐
│                 Angular 21                    │
│                  Frontend                     │
└───────────────────────┬───────────────────────┘
                        │
                        │ REST API
                        ▼
┌───────────────────────────────────────────────┐
│                  NestJS                       │
│                  Backend                      │
├───────────────────────────────────────────────┤
│                                               │
│   Presentation                               │
│   Controllers • DTOs • Swagger • Pipes       │
│                    │                          │
│                    ▼                          │
│   Application                                │
│   Use Cases • Services • Gateways            │
│                    │                          │
│                    ▼                          │
│   Domain                                     │
│   Entities • Repository Interfaces • Enums   │
│                    ▲                          │
│                    │                          │
│   Infrastructure                             │
│   Prisma • OAuth • Social APIs • Schedulers  │
│                                               │
└──────────────┬──────────────────────┬─────────┘
               │                      │
               ▼                      ▼
     ┌──────────────────┐    ┌──────────────────┐
     │   PostgreSQL     │    │ Social Providers │
     │     Prisma       │    │                  │
     └──────────────────┘    │ Facebook         │
                             │ Instagram        │
                             │ TikTok           │
                             │ LinkedIn         │
                             │ YouTube          │
                             └──────────────────┘
```

### Architecture Layers

#### Domain

Contains the core business concepts and does not depend on NestJS or external providers.

Examples:

- Users
- Social accounts
- Publications
- Scheduled publications
- Repository interfaces
- Business enums

#### Application

Contains application workflows and use cases.

Examples:

- Connect social account
- Publish content
- Schedule publications
- Retrieve token status
- Upload media
- Generate analytics
- Reconcile asynchronous publications

#### Infrastructure

Contains technical implementations.

Examples:

- Prisma repositories
- PostgreSQL persistence
- Meta Graph API
- TikTok API
- LinkedIn API
- YouTube API
- OAuth / PKCE
- Local media storage
- Background schedulers

#### Presentation

Contains the HTTP layer.

Examples:

- NestJS controllers
- DTO validation
- Swagger documentation
- Presenters
- HTTP-specific error handling

---

## 🔐 OAuth & Security Engineering

The project contains several security-oriented mechanisms depending on the social provider.

### OAuth State Protection

OAuth flows can use signed state values based on:

```text
HMAC-SHA256
```

with expiration and provider validation.

### PKCE

PKCE S256 is used in supported OAuth integrations.

The architecture supports:

```text
code_verifier
        ↓
SHA-256
        ↓
code_challenge
```

### One-Time OAuth Data

OAuth nonce and PKCE information are designed for one-time consumption with expiration.

### Controlled Media Access

The YouTube media pipeline only accepts media managed by the application.

This helps prevent arbitrary remote resource access in the publishing workflow.

---

## 📺 YouTube Integration

The YouTube integration includes substantial backend and Angular implementation.

Implemented components include:

- OAuth 2.0
- PKCE S256
- Multi-channel account support
- Token refresh workflow
- Resumable video uploads
- Chunk-based file reading
- Immediate publication workflow
- Scheduled publication workflow
- Processing reconciliation
- Publication history
- Angular integration

### Current YouTube Status

```text
Implementation:          ✅
Unit tests with mocks:   ✅
Real Google OAuth:       ❌ Not yet validated
Real video upload:       ❌ Not yet validated
Production validation:   ❌ Pending
```

YouTube publishing remains disabled by default until provider credentials and real validation are completed.

---

## 💼 LinkedIn Integration

The LinkedIn member-profile integration includes:

- OAuth 2.0
- OpenID Connect
- Signed OAuth state
- JWKS-based ID token verification
- Member account persistence
- Token lifecycle monitoring
- Text publications
- Link publications
- Single-image publications
- Scheduled text/image publications
- Publication history
- Error normalization
- Angular integration

### Current LinkedIn Status

```text
Implementation:             ✅
Unit tests with mocks:      ✅
Real LinkedIn OAuth:        ❌ Not yet validated
Real publication:           ❌ Not yet validated
Publishing enabled default: ❌ No
```

The publishing adapter is deliberately disabled by default until real API validation is completed.

---

## 🎵 TikTok Integration

The TikTok implementation includes:

- OAuth 2.0
- PKCE
- Video Direct Post workflow
- Refresh-token handling
- Token status
- Scheduled publications
- Publication status monitoring
- Angular integration

### Current TikTok Status

```text
Implementation:        ✅
Real-world validation: 🚧 Pending
```

Real validation requires appropriate TikTok credentials and application approval.

---

## 🔵 Meta Integration

The Meta integration currently covers:

### Facebook Pages

- OAuth connection
- Page discovery
- Text publication
- Image publication
- Scheduled publications
- Publication history

### Instagram Business

- Account discovery
- Media container creation
- Image publication
- Caption support
- Scheduled publications
- Publication history

These flows represent the currently validated external social-media integration of the project.

---

## 🧪 Testing & Validation

The backend currently contains:

```text
48 backend test suites
783 passing tests
0 failing tests
```

Backend tests currently focus on unit-level behavior and mocked external dependencies.

They cover areas such as:

- YouTube OAuth
- YouTube resumable uploads
- YouTube processing reconciliation
- LinkedIn OAuth/OIDC
- OAuth state validation
- PKCE
- Schedulers
- Media storage
- Publication orchestration
- Prisma repositories
- Error mapping
- Analytics

### Verified Commands

The documented validation includes successful execution of:

```text
Prisma client generation     ✅
Prisma migration status      ✅
NestJS backend build         ✅
Backend Jest tests           ✅
Angular production build     ✅
```

### Frontend Tests

The current Angular project does not yet include an automated frontend test harness.

The Angular production build validates TypeScript and templates, but automated behavioral frontend tests remain to be added.

---

## 🗄️ Database

Rezouette uses:

```text
PostgreSQL
    +
Prisma ORM
```

The project uses versioned Prisma migrations for database schema evolution.

The current documented project state contains:

```text
10 Prisma migrations
```

Main persisted concepts include:

- Users
- Connected social accounts
- Social publications
- Scheduled publications
- Provider-specific status
- Media-related information

---

## 🖥️ Frontend

The active frontend is built with **Angular 21**.

The application uses a feature-oriented structure combining:

```text
core/
shared/
layout/
features/
```

The frontend includes pages for:

- Dashboard
- Publication composer
- Connected accounts
- Publication calendar
- Publication history
- Analytics
- Settings

Angular Signals and TanStack Query are used for frontend state and server-state management.

---

## 📁 Public Repository Structure

The public portfolio repository is organized around the active backend and Angular frontend:

```text
rezouette-social-media-saas/
│
├── backend/
│   └── NestJS application
│
├── frontend/
│   └── Angular application
│
├── images/
│   └── Application screenshots
│
├── README.md
│
└── .gitignore
```

---

## 🖼️ Application Preview

Application screenshots will be added to this section.

<!-- Example:

### Dashboard

![Dashboard](images/dashboard.jpg)

### Publication Composer

![Publication Composer](images/publication.jpg)

### Connected Accounts

![Connected Accounts](images/accounts.jpg)

### Publication Calendar

![Calendar](images/calendar.jpg)

### Analytics

![Analytics](images/analytics.jpg)

-->

---

## 🎥 Demo

A complete demonstration of the platform will be added here.

<!--
▶️ [Watch the Rezouette Demo](YOUR_DEMO_LINK)
-->

---

## 👨‍💻 Project Context

Rezouette is a personal software engineering project focused on the design of a scalable Full-Stack SaaS architecture and the integration of external APIs.

The project allowed me to work on:

- Full-Stack application architecture
- Clean Architecture
- REST API development
- OAuth 2.0 flows
- PKCE authentication
- OpenID Connect
- Social network API integrations
- Background schedulers
- Asynchronous processing
- PostgreSQL data modeling
- Prisma migrations
- Media upload pipelines
- Error normalization
- API resilience
- Frontend / backend integration
- Automated backend testing

---

## ⚠️ Current Limitations

Rezouette is an actively developed engineering project and is not presented as a production-ready commercial SaaS.

Current limitations include:

- Application-level JWT authentication is not yet implemented
- A demonstration user identifier is currently used
- Multi-workspace / RBAC support is not yet implemented
- LinkedIn requires real provider validation
- YouTube requires real provider validation
- TikTok requires real-world API validation
- OAuth temporary stores currently rely on process memory
- Multi-instance deployment is not yet supported for those temporary stores
- Tokens are not yet encrypted at rest
- Angular automated tests are not yet configured

---

## 🗺️ Next Steps

Planned improvements include:

- Application authentication
- Multi-user support
- Role-based access control
- Real TikTok validation
- Real LinkedIn validation
- Real YouTube validation
- Token encryption at rest
- Distributed OAuth temporary storage
- Distributed scheduler locking
- Automated Angular tests
- Production deployment preparation

---

## 📌 Development Status

```text
Backend Architecture       ✅
Angular Frontend           ✅
PostgreSQL / Prisma        ✅
Facebook Integration       ✅
Instagram Integration      ✅
Scheduling                 ✅
Publication History        ✅
Local Analytics            ✅
Backend Automated Tests    ✅

TikTok Real Validation     🚧
LinkedIn Real Validation   🚧
YouTube Real Validation    🚧

Application Authentication ⏳
Production Deployment      ⏳
```

---

## 📬 Contact

**Bassem Wali**

- LinkedIn: [linkedin.com/in/bassem-wali](https://www.linkedin.com/in/bassem-wali)
- GitHub: [github.com/bassem2002](https://github.com/bassem2002)

---

## 📄 Disclaimer

This repository is a portfolio-oriented public version of the project.

External social-media integrations depend on third-party APIs, credentials, permissions and provider approval.

Features marked as mocked or pending validation should not be interpreted as production-validated integrations.

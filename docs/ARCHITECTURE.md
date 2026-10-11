# Beginora — Architecture Plan
**Offline Executive-Function Assistant**
Version: 1.0 | Priority: Scalability · Security · Accessibility

---

## 1. Product Context

| Attribute | Detail |
|---|---|
| Name | Beginora |
| Category | Offline executive-function assistant |
| Audience | People who struggle with task initiation, planning, and follow-through |
| Core Promise | Turn overwhelming tasks into one doable first action |
| Tone | Calm, respectful, practical, non-clinical |
| Platform | React Native (Expo) — iOS & Android |
| Connectivity | Offline-first; optional cloud sync |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Beginora Mobile App                  │
│                  (React Native / Expo)                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │     UI       │  │   Business   │  │    Data      │  │
│  │   Layer      │  │    Logic     │  │    Layer     │  │
│  │  (Screens /  │  │  (Services / │  │  (SQLite /   │  │
│  │  Components) │  │   Hooks)     │  │  MMKV)       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └─────────────────┴─────────────────┘          │
│                     Local AI Engine                     │
│              (on-device LLM / rule engine)              │
└─────────────────────────┬───────────────────────────────┘
                          │ Optional (authenticated)
                ┌─────────▼──────────┐
                │   Cloud Sync API   │
                │  (AWS / Supabase)  │
                │  - Encrypted sync  │
                │  - Auth (Cognito)  │
                └────────────────────┘
```

---

## 3. Tech Stack

### 3.1 Frontend / Mobile
| Concern | Choice | Rationale |
|---|---|---|
| Framework | React Native + Expo SDK 51+ | Cross-platform, native UI, OTA updates |
| Language | TypeScript (strict mode) | Type safety, maintainability |
| Navigation | Expo Router (file-based) | Industry standard, deep-link ready |
| State | Zustand + React Query | Lightweight, offline-friendly |
| UI Components | Custom design system (NativeWind / Tamagui) | Calm, accessible, brand-consistent |
| Local DB | Expo SQLite (via Drizzle ORM) | Relational, offline-first, encrypted |
| Fast KV Store | MMKV | Settings, session state |
| Animations | Reanimated 3 + Moti | Smooth, non-jarring transitions |
| Accessibility | React Native A11y + WCAG 2.1 AA | Core audience requirement |

### 3.2 On-Device AI
| Concern | Choice | Rationale |
|---|---|---|
| Task decomposition | llama.cpp (via react-native-llama) OR deterministic rule engine | Fully offline, no data leaves device |
| Fallback | Heuristic rule engine (JSON config) | Works on low-end devices |
| Model size | ≤ 500MB quantized (Q4) | Practical for mobile storage |

### 3.3 Optional Cloud Layer
| Concern | Choice | Rationale |
|---|---|---|
| Auth | AWS Cognito / Supabase Auth | MFA, OAuth2, PKCE |
| Sync API | AWS AppSync (GraphQL) or Supabase Realtime | Conflict-resolution, offline queue |
| Storage | AWS S3 (encrypted) | Backup of encrypted user data |
| Secrets | AWS Secrets Manager | No hardcoded credentials |

---

## 4. Project Structure

```
Beginora/
├── app/                        # Expo Router screens (file-based routing)
│   ├── (tabs)/
│   │   ├── index.tsx           # Home — Today's focus
│   │   ├── tasks.tsx           # Task list
│   │   └── settings.tsx        # User preferences
│   ├── task/
│   │   ├── [id].tsx            # Task detail / breakdown
│   │   └── new.tsx             # Add task
│   └── _layout.tsx
├── src/
│   ├── components/             # Reusable UI components
│   │   ├── TaskCard.tsx
│   │   ├── FirstActionPrompt.tsx
│   │   ├── ProgressRing.tsx
│   │   └── ui/                 # Design system primitives
│   ├── features/               # Feature-sliced modules
│   │   ├── tasks/
│   │   │   ├── taskStore.ts    # Zustand slice
│   │   │   ├── taskService.ts  # Business logic
│   │   │   └── taskQueries.ts  # DB queries (Drizzle)
│   │   ├── ai/
│   │   │   ├── decomposer.ts   # Task → first action logic
│   │   │   └── ruleEngine.ts   # Fallback heuristics
│   │   └── sync/
│   │       ├── syncQueue.ts    # Offline queue
│   │       └── syncService.ts  # Cloud sync (optional)
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema
│   │   ├── migrations/
│   │   └── client.ts           # Encrypted DB init
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities, constants
│   │   ├── crypto.ts           # Encryption helpers
│   │   └── analytics.ts        # Privacy-safe local analytics
│   └── types/                  # Shared TypeScript types
├── assets/
├── docs/
│   └── ARCHITECTURE.md         # This file
├── .env.example                # No secrets committed
├── app.config.ts               # Expo config (dynamic)
├── drizzle.config.ts
├── tsconfig.json
└── package.json
```

---

## 5. Data Architecture

### 5.1 Core Schema (SQLite via Drizzle)

```typescript
// src/db/schema.ts
export const tasks = sqliteTable('tasks', {
  id:          text('id').primaryKey(),          // UUID
  title:       text('title').notNull(),
  description: text('description'),
  firstAction: text('first_action'),             // AI-generated
  status:      text('status').default('pending'),// pending|active|done|snoozed
  priority:    integer('priority').default(0),
  dueAt:       integer('due_at'),                // Unix timestamp
  completedAt: integer('completed_at'),
  createdAt:   integer('created_at').notNull(),
  updatedAt:   integer('updated_at').notNull(),
  syncedAt:    integer('synced_at'),             // null = not synced
  isDeleted:   integer('is_deleted').default(0), // soft delete
});

export const taskSteps = sqliteTable('task_steps', {
  id:        text('id').primaryKey(),
  taskId:    text('task_id').references(() => tasks.id),
  step:      text('step').notNull(),
  order:     integer('order').notNull(),
  doneAt:    integer('done_at'),
});

export const userPrefs = sqliteTable('user_prefs', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),        // JSON-serialized
});
```

### 5.2 Encryption Strategy
- Database encrypted at rest using **SQLCipher** (via `expo-sqlite` encrypted mode)
- Encryption key derived from device biometric / PIN via **expo-secure-store**
- Cloud-synced data encrypted client-side (AES-256) before upload — server never sees plaintext
- No PII stored in logs or analytics

---

## 6. Core Feature: Task Decomposition Engine

```
User Input: "Write my thesis introduction"
         │
         ▼
┌─────────────────────┐
│  Complexity Scorer  │  → score 0–10
└────────┬────────────┘
         │ score > 3
         ▼
┌─────────────────────┐
│  AI Decomposer      │  → ["Open doc", "Write 1 sentence", ...]
│  (on-device LLM     │
│   or rule engine)   │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  First Action       │  → "Open your document right now."
│  Extractor          │
└─────────────────────┘
```

```typescript
// src/features/ai/decomposer.ts
export async function getFirstAction(taskTitle: string): Promise<string> {
  const complexity = scoreComplexity(taskTitle);
  if (complexity <= 2) return buildSimpleAction(taskTitle);
  return runDecomposer(taskTitle); // LLM or rule engine
}
```

---

## 7. State Management

```
┌─────────────────────────────────────┐
│           Zustand Store             │
│  taskStore  │  uiStore  │ syncStore │
└──────┬──────┴─────┬─────┴────┬──────┘
       │            │          │
       ▼            ▼          ▼
  SQLite DB    MMKV (UI    Sync Queue
  (persisted)   prefs)    (offline ops)
```

- All writes go through `taskService.ts` — never directly to DB from components
- Optimistic UI updates with rollback on failure
- Sync queue persists failed cloud operations for retry

---

## 8. Security Architecture

### 8.1 Threat Model
| Threat | Mitigation |
|---|---|
| Device theft / unauthorized access | DB encryption + biometric lock |
| Data exfiltration | Offline-first; cloud sync is opt-in |
| API abuse (cloud) | Cognito auth + rate limiting + WAF |
| Secrets in code | `.env` + Expo secrets + AWS Secrets Manager |
| Dependency vulnerabilities | `npm audit` in CI + Dependabot |
| Insecure data transmission | TLS 1.3 enforced; certificate pinning |
| Sensitive data in logs | No PII in logs; log level gated by env |

### 8.2 Auth Flow (Cloud Sync — Optional)
```
App → Cognito (PKCE OAuth2) → JWT (short-lived)
                            → Refresh token (secure storage)
JWT → AppSync / API Gateway → Lambda → DynamoDB (encrypted)
```

### 8.3 Permissions (Minimal)
- No camera, microphone, or contacts required
- Notifications: opt-in only
- No background location
- No third-party analytics SDKs by default

---

## 9. Scalability Strategy

### 9.1 On-Device
- SQLite handles millions of rows; indexed on `status`, `due_at`, `created_at`
- AI model loaded lazily; unloaded when app backgrounds
- Pagination on all list queries (cursor-based)

### 9.2 Cloud (if sync enabled)
- Serverless (Lambda + AppSync) — scales to zero, no idle cost
- DynamoDB on-demand billing — scales automatically
- S3 for encrypted backups — unlimited storage
- CloudFront CDN for static assets / OTA updates

### 9.3 Codebase Scalability
- Feature-sliced architecture — teams can own features independently
- Strict TypeScript — refactoring is safe at scale
- Drizzle migrations — schema changes are versioned and reversible
- Expo EAS Build + EAS Update — CI/CD with OTA hotfixes

---

## 10. Offline-First Sync Strategy

```
Local Write → SQLite (immediate)
           → Mark syncedAt = null
           → Add to SyncQueue

Background Sync (when online):
  SyncQueue → Encrypt payload → POST /sync
            → On success: update syncedAt
            → On conflict: Last-Write-Wins (or user prompt)
            → On failure: exponential backoff, persist queue
```

---

## 11. Accessibility (Core Requirement)

- WCAG 2.1 AA minimum
- All interactive elements have `accessibilityLabel` and `accessibilityHint`
- Minimum touch target: 44×44pt
- Dynamic font size support (`allowFontScaling`)
- High-contrast mode support
- Screen reader tested (VoiceOver / TalkBack)
- No time-pressured interactions
- Calm color palette — no red urgency signals

---

## 12. CI/CD Pipeline

```
Push → GitHub Actions
     → TypeScript check (tsc --noEmit)
     → ESLint + Prettier
     → Unit tests (Jest + Testing Library)
     → npm audit (security)
     → EAS Build (staging)
     → E2E tests (Maestro)
     → EAS Submit (production, manual gate)
```

---

## 13. Environment Configuration

```typescript
// app.config.ts — no secrets hardcoded
export default ({ config }) => ({
  ...config,
  extra: {
    apiUrl: process.env.API_URL,
    cognitoPoolId: process.env.COGNITO_POOL_ID,
    enableCloudSync: process.env.ENABLE_CLOUD_SYNC === 'true',
  },
});
```

```
# .env.example (committed — no real values)
API_URL=https://api.beginora.app
COGNITO_POOL_ID=
COGNITO_CLIENT_ID=
ENABLE_CLOUD_SYNC=false
```

---

## 14. Key Dependencies

```json
{
  "expo": "~51.0.0",
  "expo-router": "~3.5.0",
  "expo-sqlite": "~14.0.0",
  "expo-secure-store": "~13.0.0",
  "drizzle-orm": "^0.30.0",
  "zustand": "^4.5.0",
  "@tanstack/react-query": "^5.0.0",
  "react-native-reanimated": "~3.10.0",
  "nativewind": "^4.0.0",
  "react-native-mmkv": "^2.12.0",
  "aws-amplify": "^6.0.0"
}
```

---

## 15. Phased Delivery

| Phase | Scope | Target |
|---|---|---|
| MVP (v0.1) | Core task entry + first-action decomposition (rule engine) + local SQLite | Week 4 |
| v0.2 | On-device LLM integration + full offline UX | Week 8 |
| v0.3 | Optional cloud sync + Cognito auth | Week 12 |
| v1.0 | Accessibility audit + performance profiling + App Store submission | Week 16 |

---

## 16. Non-Negotiables

1. **App works 100% offline** — cloud is always optional
2. **No user data sent anywhere without explicit opt-in**
3. **Encryption at rest on all user data**
4. **No dark patterns** — no streaks, no guilt, no urgency pressure
5. **Accessible by default** — not an afterthought

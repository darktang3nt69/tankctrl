---
title: agents
type: note
permalink: tankctl/agents
---

# AGENTS.md

## Project

**TankCtl**

TankCtl is a self-hosted IoT controller for managing water tank devices built with:

* Python backend
* MQTT (Mosquitto broker)
* Arduino UNO R4 WiFi devices
* Device Shadow state model

The backend manages device state, commands, and telemetry while devices execute actions and report their status.

---

# Architecture Overview

TankCtl follows a **Layered Architecture**.

```
API → Services → Domain → Repository → Infrastructure
```

### Rules

* API must never talk directly to MQTT or the database
* Business logic belongs in the **service layer**
* Domain models must remain **pure and framework-agnostic**
* Infrastructure handles external systems (MQTT, DB, scheduler)

---

# Project Structure

```
tankctl/
│
├── api/
│   ├── routes/
│   └── schemas.py
│
├── domain/
│   ├── device.py
│   ├── device_shadow.py
│   └── command.py
│
├── services/
│   ├── device_service.py
│   ├── shadow_service.py
│   └── command_service.py
│
├── repository/
│   ├── device_repository.py
│   └── shadow_repository.py
│
├── infrastructure/
│   ├── mqtt/
│   │   ├── mqtt_client.py
│   │   └── mqtt_topics.py
│   │
│   ├── db/
│   │   └── database.py
│   │
│   └── scheduler/
│       └── scheduler.py
│
├── device/
│   └── shadow_reconciler.py
│
├── config/
│   └── settings.py
│
├── utils/
│   └── logger.py
│
├── main.py
└── AGENTS.md
```

---

# Key Concepts

## Device Shadow

Each device has a shadow state.

```
DeviceShadow
 ├─ desired
 ├─ reported
 └─ version
```

Example:

```json
{
  "device_id": "tank1",
  "version": 4,
  "desired": { "pump": "on" },
  "reported": { "pump": "off" }
}
```

The backend reconciles differences between `desired` and `reported`.

---

# MQTT Topics

```
tankctl/{device_id}/telemetry
tankctl/{device_id}/reported
tankctl/{device_id}/command
tankctl/{device_id}/status
```

### Example

```
tankctl/tank1/telemetry
tankctl/tank1/command
```

---

# Command Format

Commands must include a version.

```json
{
  "command": "set_pump",
  "value": "on",
  "version": 7
}
```

Devices must ignore commands with older versions.

---

# Scheduler

APScheduler runs periodic tasks:

```
shadow reconciliation
device heartbeat monitoring
retry failed commands
telemetry cleanup
```

Example reconciliation rule:

```
if desired != reported:
    publish command
```

---

# Coding Guidelines

### Python

* Use type hints
* Prefer dataclasses or pydantic models
* Avoid global state

### Architecture

Never allow:

```
API → MQTT
API → DB
```

Always follow:

```
API → Service → Repository / Infrastructure
```

---

# Logging

Use structured logging.

Example log event:

```
device_id=abc123 event=command_sent command=set_pump
```

---

# Device Firmware Expectations

Devices must:

Subscribe to:

```
tankctl/{device_id}/command
```

Publish to:

```
tankctl/{device_id}/telemetry
tankctl/{device_id}/reported
tankctl/{device_id}/status
```

Devices should implement idempotency using command version numbers.

---

# Design Patterns Used

* Publish–Subscribe
* Device Shadow
* Command Pattern
* Layered Architecture
* Repository Pattern
* Scheduler Pattern

---

# Development Workflow

1. Implement domain models
2. Implement services
3. Implement repositories
4. Implement infrastructure adapters
5. Implement API routes

Never skip layers.

---

# Goals

TankCtl should remain:

* Simple
* Self-hosted
* MQTT-first
* Device-centric
* Reliable even when devices disconnect

---

# Non-Goals

TankCtl is **not** intended to be:

* a full cloud IoT platform
* a distributed microservice system
* a vendor-locked system

It should remain a lightweight device controller.

---

# Specialized Agents

TankCtl has a **layered agent system** with planning, coordination, and domain expertise agents. They work together to enforce architecture, plan thoroughly, and implement reliably.

## Planning & Orchestration

### 0. planner (Research + Deep Analysis + Planning)

**When to use:** Complex features, multi-layer changes, uncertain implementations, anything touching multiple layers

**Responsibilities:**
- Research codebase structure and patterns
- Consult auto-generated documentation (ARCHITECTURE.md, COMMANDS.md, MQTT_TOPICS.md, DEVICES.md)
- Map dependencies and identify edge cases
- Create detailed implementation roadmaps with sequencing
- Recommend which specialized agents to invoke and in what order

**How it works:**
```
User: "Add water-level sensor with alerts"
    ↓
Planner: Researches codebase + docs
    ↓ Creates implementation plan with:
    - Layer analysis (firmware, MQTT, API, UI, DB)
    - Dependencies (what must be done first)
    - Risks identified (memory, query perf, alert storms)
    - Recommended agent sequence
    ↓
User: Reviews plan, then invokes orchestrator with plan
    ↓
Orchestrator: Coordinates specialized agents per plan
```

**Example:** `"/planner Add water-level sensor with real-time alerts when water drops below threshold"`

### 1. orchestrator (Multi-Agent Coordination)

**When to use:** Complex multi-step tasks, coordinating across layers, automatic agent sequencing

**Responsibilities:**
- Analyze task complexity and layers involved
- Route to appropriate specialized agents
- Sequence agents based on dependencies
- Integrate results and validate output
- Use planner for complex tasks before executing

**How it works:**
```
Task: Multi-layer feature
    ↓
Orchestrator: Can invoke planner first if complex
    ↓
Planner returns: Implementation plan + agent sequence
    ↓
Orchestrator: Invokes agents in recommended order
    ↓
Result: Implemented, cleaned up, documented
```

**Example:** `"/orchestrator Build a complete pump control feature (firmware, API, UI)"`

---

## Backend Agents

### 1. backend-core (FastAPI + SQLAlchemy + Repository)

**Triggers on:** `src/api/`, `src/repository/`, `src/infrastructure/db/`, `migrations/`

**Responsibilities:**
- REST API endpoint design with FastAPI
- Database schema design and migrations with SQLAlchemy
- Repository pattern implementation
- Service layer coordination
- Strict enforcement: `API → Service → Repository → DB`

**When active:** You're designing API endpoints, creating database models, or implementing repository methods.

**Example:** `"Design a new REST endpoint for device firmware updates"`

### 2. device-communication (MQTT + Device Shadow + Commands)

**Triggers on:** `src/infrastructure/mqtt/`, `src/domain/device_shadow.py`, `src/services/shadow_service.py`, `firmware/`

**Responsibilities:**
- MQTT topic design and pub/sub patterns
- Device shadow state reconciliation (desired vs reported)
- Command versioning and idempotency
- Device-backend protocol reliability
- Firmware communication patterns

**When active:** You're implementing device protocols, shadow reconciliation, or writing firmware code.

**Example:** `"Implement device shadow reconciliation for light scheduling"`

### 3. notifications-and-alerts (FCM + Alerts + Water Scheduling)

**Triggers on:** `Push notification service`, `alert_service.py`, `water_schedule_reminder_service.py`

**Responsibilities:**
- Firebase Cloud Messaging (FCM) token management
- Alert rule evaluation and thresholds
- Water schedule and recurring reminders
- User notification preferences and quiet hours
- Alert acknowledgment workflows

**When active:** You're implementing push notifications, alert rules, or reminder scheduling.

**Example:** `"Implement water-low alert thresholds and FCM delivery"`

### 4. esp32-firmware (Embedded C++ + Memory Efficiency + Robustness)

**Triggers on:** `firmware/`, `*.ino`, `embedded/`, `esp32/`

**Responsibilities:**
- ESP32 embedded firmware development in Arduino/C++
- Memory optimization (520 KB SRAM, 4 MB Flash constraints)
- Device stability and crash prevention (watchdog, error handling)
- WiFi/MQTT reliability with timeout and reconnection logic
- Power management and real-time constraints
- Health monitoring and diagnostics

**When active:** You're writing or optimizing ESP32 firmware, debugging device crashes, improving memory usage, or handling WiFi/MQTT reliability issues.

**Example:** `"Optimize the ESP32 firmware to prevent memory leaks and handle WiFi disconnects gracefully"`

## Frontend Team (Next.js Web App)

### 5. frontend-core (Next.js + App Router + Server/Client Components)

**Triggers on:** `tankctl-web/app/`, `tankctl-web/src/pages/`

**Responsibilities:**
- Next.js App Router architecture and file structure
- Server Component vs Client Component decision-making
- Dynamic routes with `[id]` and `[...slug]` patterns
- Middleware for authentication and routing
- Image optimization with `next/image`
- Font optimization and metadata management
- Responsive design patterns

**When active:** You're designing page layouts, routing structure, or determining Server/Client Component boundaries.

**Example:** `"Design the /devices/[id] detail page with nested tabs using Server Components"`

### 6. state-management (React Query + Zustand)

**Triggers on:** `tankctl-web/src/hooks/`, `tankctl-web/src/stores/`, `tankctl-web/lib/api/`

**Responsibilities:**
- React Query hooks for server-side data fetching and caching
- Zustand stores for client-side UI state (auth, sidebar, theme)
- Mutation patterns with optimistic updates
- Cache invalidation strategies
- Infinite queries for pagination
- Real-time cache synchronization
- Testing hooks and stores

**When active:** You're fetching data, managing state, handling caching, or implementing optimistic updates.

**Example:** `"Create a useDevices hook with React Query that filters by status and caches results"`

### 7. ui-components (shadcn/ui + Tailwind CSS + Accessibility)

**Triggers on:** `tankctl-web/src/components/`, `tankctl-web/styles/`

**Responsibilities:**
- shadcn/ui component composition and customization
- Tailwind CSS responsive design and dark mode
- WCAG accessibility compliance
- Component testing with React Testing Library
- Design system tokens and theming
- Touch-friendly mobile interfaces (48px minimum)
- Performance-optimized component patterns

**When active:** You're building reusable UI components, styling, or ensuring accessibility.

**Example:** `"Build a responsive device card component with hover states and touch support"`

### 8. real-time-features (Socket.io + WebSocket + Live Updates)

**Triggers on:** `tankctl-web/src/hooks/realtime/`, `tankctl-web/lib/socket-io/`

**Responsibilities:**
- Socket.io client setup and connection management
- Live telemetry streaming and chart updates
- WebSocket fallback to HTTP polling
- Connection reliability with exponential backoff
- Offline detection and sync on reconnect
- Real-time cache updates via React Query
- Connection status indicators

**When active:** You're implementing live data updates, streaming telemetry, or handling real-time events.

**Example:** `"Implement a live temperature chart that updates via Socket.io with fallback polling"`

### 9. api-integration (Axios + Authentication + Error Handling)

**Triggers on:** `tankctl-web/lib/api/`, `tankctl-web/src/lib/api-client.ts`

**Responsibilities:**
- Axios client configuration and interceptors
- Type-safe API endpoint organization
- Request/response transformation
- Authentication token management and refresh
- Error normalization and user-friendly messages
- API contract enforcement
- Mock APIs for testing

**When active:** You're integrating FastAPI endpoints, managing authentication, or handling errors.

**Example:** `"Design the API client layer for device endpoints with type-safe methods"`

### 10. web-deployment (Docker + nginx + Production)

**Triggers on:** `Dockerfile`, `nginx.conf`, `docker-compose.yml`, `.env`

**Responsibilities:**
- Multi-stage Docker builds for Next.js
- nginx reverse proxy configuration
- Environment variable management per environment
- Next.js production optimization
- SSL/TLS and security headers
- Logging, monitoring, and health checks
- Scaling and load balancing strategies

**When active:** You're containerizing the app, configuring deployment, or optimizing production.

**Example:** `"Configure Docker and nginx for production deployment with SSL"`

## Utilities & Documentation

### 11. code-cleanup (Dead Code Removal)

**Triggers on:** All file types (Python, TypeScript, Dart, Arduino)

**Responsibilities:**
- Unused import removal across language (Python, TypeScript)
- Orphaned function/component removal
- Dead code branches and unreachable code
- Duplicate logic consolidation
- Flutter code removal (deprecated framework)
- Safe preservation of public APIs and safety-critical code

**When active:** You're post-feature cleaning up dead code, removing unused imports, or refactoring.

**Example:** `"Remove unused Flutter files and clean up dead imports from the web app migration"`

### 12. docs-automation (Auto-Generated Documentation Sync)

**Triggers on:** Changes to `src/api/`, `firmware/`, `src/infrastructure/mqtt/`, `src/domain/`

**Responsibilities:**
- Auto-sync code changes to ARCHITECTURE.md, DEVICES.md, MQTT_TOPICS.md, COMMANDS.md
- Extract API endpoint schemas from Pydantic models
- Extract MQTT topics from PubSubClient subscribe/publish calls
- Extract device commands from Arduino callback functions
- Generate documentation tables and schemas automatically
- Flag orphaned code (documented but not in code) or missing docs (code but no docs)
- Validate cross-references and link integrity

**When active:** You've added new API endpoints, MQTT topics, device commands, or architecture changes and want docs auto-updated to match.

**Example:** `"Auto-generate COMMANDS.md entries for the new pump_control endpoint and MQTT topics"`

## Agent Coordination

These agents **automatically coordinate** through file patterns and shared architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                   Next.js Web App Frontend                   │
│  frontend-core → state-management → ui-components           │
│                      ↓                                        │
│          real-time-features (Socket.io)                     │
│                      ↓                                        │
│          api-integration (Axios to FastAPI)                 │
│                      ↓                                        │
│           web-deployment (Docker + nginx)                   │
└─────────────────────────────────────────────────────────────┘
                            ↓ (HTTP/WebSocket)
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI Backend                            │
│         backend-core (REST API Layer)                       │
│                      ↓                                        │
│            Services Layer (Business Logic)                  │
│      ├─→ device-communication (MQTT, shadow)               │
│      ├─→ notifications-and-alerts (FCM, alerts)            │
│      └─→ Repository & Infrastructure Layer                 │
└─────────────────────────────────────────────────────────────┘
                            ↓ (MQTT)
┌─────────────────────────────────────────────────────────────┐
│                  Device Hardware (ESP32)                     │
│        esp32-firmware (Arduino/C++, MQTT client)           │
└─────────────────────────────────────────────────────────────┘

Coordination: planner → orchestrator → specialized agents
Cleanup: code-cleanup (removes dead code post-feature)
Docs: docs-automation (keeps ARCHITECTURE.md, COMMANDS.md in sync)
```

### How Agents Work

1. **User-Invocable**: All agents are explicitly invocable via slash commands
   - **Planning**: Type `/planner` to research, analyze, and create implementation plans
   - **Orchestration**: Type `/orchestrator` to coordinate multi-layer implementation
   - **Backend**: `/backend-core`, `/device-communication`, `/esp32-firmware`, `/notifications-and-alerts`
   - **Frontend (Web)**: `/frontend-core`, `/state-management`, `/ui-components`, `/real-time-features`, `/api-integration`, `/web-deployment`
   - **Utilities**: `/code-cleanup`, `/docs-automation`

2. **Discovery via Descriptions**: Agent descriptions contain trigger phrases and domain keywords
   - Copilot matches your request to the best agent based on description keywords
   - Descriptions include "Use when:" patterns to guide invocation

3. **Cross-References**: Each agent has coordination notes
   - `backend-core` knows about device-communication and notifications-and-alerts
   - `device-communication` knows about esp32-firmware for device-side implementation
   - `esp32-firmware` knows about device-communication for protocol details
   - `flutter-foundation` knows about backend-core
   - **`docs-automation` coordinates with**: backend-core (API schemas), device-communication (MQTT topics), esp32-firmware (command formats)
   - They defer to each other for specialized concerns

### Best Practices for Using Agents

- **Explicit Invocation**: Type `/agent-name` to invoke a specific agent for your task
- **Match Your Task**: Choose the agent whose description best matches what you're doing
- **Leverage Specialization**: Each agent has deep domain expertise—use it!
- **Combine Agents**: For complex multi-layer work, start with one agent then invoke another

### Example Workflow

**Scenario: Add a new device water level alert**

1. Start with backend service design:
   - Type `/backend-core Design a new alert service method for water-low conditions`
   - Backend-core handles service layer architecture

2. Add FCM push notification delivery:
   - Type `/notifications-and-alerts Implement FCM delivery for water-low alert thresholds`
   - notifications-and-alerts handles notification logic

3. Update web app to display alerts:
   - Type `/frontend-core Design the alerts page with filtering and pagination`
   - frontend-core handles page layout

4. Add alert state management:
   - Type `/state-management Create a useAlerts hook with React Query for live updates`
   - state-management handles data fetching and caching

5. Build alert UI components:
   - Type `/ui-components Build an alert card component with severity indicators`
   - ui-components handles component design and styling

**Result**: Five coordinated layers, each handled by the right specialist agent.

---

**Scenario: Implement reliable device telemetry with WiFi resilience**

1. Define device protocol:
   - Type `/device-communication Design bidirectional telemetry protocol with acknowledged delivery`
   - device-communication handles MQTT topic design and versioning

2. Build robust firmware:
   - Type `/esp32-firmware Implement telemetry collection with WiFi reconnection and memory efficiency`
   - esp32-firmware handles embedded reliability, memory constraints, and watchdog safety

3. Create backend storage:
   - Type `/backend-core Design telemetry repository and aggregation queries`
   - backend-core handles API, database, and telemetry persistence

4. Build monitoring dashboard:
   - Type `/frontend-core Design the telemetry charts page with time-range filters`
   - frontend-core handles page layout and routing

5. Create real-time telemetry visualization:
   - Type `/real-time-features Implement live temperature chart with Socket.io and fallback polling`
   - real-time-features handles WebSocket and cache synchronization

**Result**: End-to-end telemetry pipeline with embedded robustness, reliable transport, and responsive web dashboard.

---

**Scenario: Add a pump control feature with automatic documentation**

1. Define device protocol:
   - Type `/device-communication Design pump command protocol with versioning for idempotency`
   - Result: Command format, MQTT topics defined

2. Build Arduino firmware:
   - Type `/esp32-firmware Implement pump control with safety checks and status reporting`
   - Result: Production Arduino sketch with relay logic

3. Create backend API:
   - Type `/backend-core Design pump control endpoint and device shadow updates`
   - Result: REST API endpoint with validation

4. Build web app control page:
   - Type `/frontend-core Design the pump control page with status display and toggle button`
   - Result: Next.js page with dynamic routing

5. Create pump control state management:
   - Type `/state-management Create a usePumpControl hook with React Query mutations`
   - Result: Type-safe hook with optimistic updates and error handling

6. Build pump control UI components:
   - Type `/ui-components Build pump toggle component with loading and error states`
   - Result: Accessible, responsive component with Tailwind styling

7. **Auto-sync documentation**:
   - Type `/docs-automation Update docs for the new pump control endpoints`
   - **Automatically generates**:
     - COMMANDS.md: Pump control endpoint + payload schema
     - MQTT_TOPICS.md: tankctl/{device_id}/pump_status topic
     - DEVICES.md: Arduino pump handler documentation
     - ARCHITECTURE.md: Pump control data flow diagram
     - Cross-references between all docs

**Result**: Complete feature with end-to-end implementation AND auto-generated, cross-linked documentation.

---

**Scenario: Planning-First Development (Recommended for Complex Features)**

**Goal:** Implement water-level sensor with low-water alerts efficiently

1. **Plan first:**
   ```
   /planner Add water-level sensor with real-time alerts when water drops below threshold
   ```
   - Returns: Detailed plan showing layers, dependencies, edge cases, risks
   - Identifies: Memory constraints (Arduino ADC), database performance (telemetry growth), alert storms
   - Recommends: Specific agent sequence + estimated time

2. **Execute per plan:**
   ```
   /orchestrator [Execute the water-level sensor plan from planner]
   ```
   - Orchestrator runs agents in recommended sequence:
     1. esp32-firmware: ADC reading + smoothing
     2. device-communication: Telemetry topic patterns
     3. backend-core: Alert service + API endpoints
     4. state-management: Alert state + React Query hooks
     5. ui-components: Alert components + sensor gauge
     6. frontend-core: Alert page with filters
     7. real-time-features: Live sensor updates
     8. code-cleanup: Remove test code
     9. docs-automation: Update all docs

3. **Result:**
   - ✅ Plan prevents mistakes before coding
   - ✅ Clear dependency sequencing (esp32 firmware first, then backend, then web UI)
   - ✅ All edge cases identified and mitigated
   - ✅ Estimated time accurate and tracked
   - ✅ Complete end-to-end feature

**When to use Planner:**
- Multi-layer features (touching firmware, API, UI, database)
- Uncertain about where to start (planner provides roadmap)
- Memory-constrained changes (planner identifies limits)
- Integration with existing systems (planner maps connection points)

**When to skip Planner:**
- Single-layer changes (e.g., new API endpoint only)
- Trivial additions (e.g., add a column to UI)
- Quick bug fixes

---

1. Create `.github/agents/your-agent.agent.md`
2. Include `applyTo` patterns for relevant files
3. Add cross-references to related agents
4. Document when to use (trigger phrases in `description`)

Example trigger phrases for discovery:
```
"Use when: doing X, implementing Y, debugging Z"
```

This helps Copilot decide which agent to activate.
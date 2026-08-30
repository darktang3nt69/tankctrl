# Copilot Instructions

When generating code for this repository:

Follow the architecture defined in:

- docs/ARCHITECTURE.md
- docs/DEVICES.md
- docs/MQTT_TOPICS.md
- docs/COMMANDS.md

Key rules:

- API must not directly access MQTT
- Services contain business logic
- Repository layer handles DB
- MQTT topics must follow tankctl/{device_id}/{channel}

Devices communicate using MQTT and follow DEVICE_PROTOCOL.md.

## Specialized Agents - Team-Based Organization

TankCtl uses a **team-based agent structure** for the Next.js web app and FastAPI backend.

### 🌐 Web App Team (Next.js, React, TypeScript)

1. **frontend-core** — Next.js pages, App Router, Server/Client Components
   - Use for: Page design, routing architecture, layout structure, performance
   - Command: `/frontend-core Design the /devices/[id] detail page with nested tabs`

2. **state-management** — React Query (server state) + Zustand (client state)
   - Use for: Data fetching patterns, caching, real-time subscriptions
   - Command: `/state-management Create a useDevices hook with React Query and filters`

3. **ui-components** — shadcn/ui + Tailwind CSS + accessibility
   - Use for: Component design, responsive layouts, WCAG compliance, design system
   - Command: `/ui-components Build a responsive device card component with hover states`

4. **real-time-features** — Socket.io, WebSocket, live telemetry
   - Use for: Live data streaming, connection reliability, cache synchronization
   - Command: `/real-time-features Implement live temperature chart with Socket.io`

5. **api-integration** — Axios client, FastAPI integration, authentication
   - Use for: API design, request/response handling, error strategies, types
   - Command: `/api-integration Design the API client layer for device endpoints`

6. **web-deployment** — Docker, nginx, environment management, production
   - Use for: Containerization, reverse proxy, environment config, monitoring
   - Command: `/web-deployment Configure Docker and nginx for production deployment`

### 🔌 Backend Team (FastAPI, Python)

7. **backend-core** — FastAPI + SQLAlchemy + Repository pattern
   - Use for: REST endpoint design, database models, repository implementations
   - Command: `/backend-core Design a new alert service endpoint`

8. **device-communication** — MQTT + Device Shadow + Commands
   - Use for: Device protocol, shadow reconciliation, firmware integration
   - Command: `/device-communication Implement device shadow reconciliation for pump control`

9. **notifications-and-alerts** — FCM + Alerts + Water Scheduling
   - Use for: FCM integration, alert rules, reminder scheduling
   - Command: `/notifications-and-alerts Implement water-low alert thresholds`

### 🛠️ Firmware Team (Arduino, C++)

10. **esp32-firmware** — ESP32, Arduino, MQTT client, hardware control
    - Use for: Firmware development, GPIO control, memory optimization, reliability
    - Command: `/esp32-firmware Optimize pump control relay logic for stability`

### 📋 Utilities & Coordination

11. **planner** — Research, analysis, deep planning before implementation
    - Use for: Complex multi-layer features, architecture decisions, roadmaps
    - Command: `/planner Plan water-level sensor feature end-to-end`

12. **orchestrator** — Multi-agent coordination, task sequencing
    - Use for: Multi-layer features requiring multiple agents
    - Command: `/orchestrator Build complete pump control feature (firmware, API, UI)`

13. **code-cleanup** — Dead code removal, refactoring, removing unused code
    - Use for: Post-feature cleanup, removing dead Flutter code, TypeScript/Python cleanup
    - Command: `/code-cleanup Remove unused Flutter files and clean up dead imports`

14. **docs-automation** — Auto-sync code changes to documentation
    - Use for: Keep ARCHITECTURE.md, MQTT_TOPICS.md, COMMANDS.md in sync
    - Command: `/docs-automation Update docs for the new pump control endpoints`

## How to Use Agents

- Type `/` in the chat to see available agents
- Select an agent and describe what you need
- Each agent has specialized knowledge for its domain
- Agents understand TankCtl architecture and coordinate across layers

**Example workflow:** When implementing a new device feature:
1. `/planner` → Research architecture, create implementation roadmap
2. `/backend-core` → Design FastAPI endpoint and database schema
3. `/device-communication` → Define MQTT topic and device protocol
4. `/esp32-firmware` → Implement hardware control in firmware
5. `/frontend-core` + `/state-management` → Build Next.js pages and API integration
6. `/ui-components` → Refine responsive design and accessibility
7. `/real-time-features` → Add live telemetry updates
8. `/web-deployment` → Prepare production Docker build
9. `/docs-automation` → Update all documentation
10. `/code-cleanup` → Remove any dead code from the migration

See `agents.md` for detailed patterns and architecture.

## graphify

For any question about this repo's architecture, structure, components, or how to add/modify/find
code, your first action should be `graphify query "<question>"` when `graphify-out/graph.json`
exists. Use `graphify path "<A>" "<B>"` for relationship questions and `graphify explain "<concept>"`
for focused-concept questions. These return a scoped subgraph, usually much smaller than the full
report or raw grep output.

Triggers: "how do I…", "where is…", "what does … do", "add/modify a <component>",
"explain the architecture", or anything that depends on how files or classes relate.

If `graphify-out/wiki/index.md` exists, use it for broad navigation. Read `graphify-out/GRAPH_REPORT.md`
only for broad architecture review or when query/path/explain do not surface enough context. Only read
source files when (a) modifying/debugging specific code, (b) the graph lacks the needed detail, or
(c) the graph is missing or stale.

Type `/graphify` in Copilot Chat to build or update the graph.

<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
<!-- caveman-end -->

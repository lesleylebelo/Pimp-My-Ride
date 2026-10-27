# PimpMyRide: system diagrams

**Module:** DSW02B1, University of Johannesburg. **Evidence cut-off:** 27 October 2026. **Repository baseline:** `lesley`, commit `0d7b95f`. These diagrams describe inspected implementation, not proof that every hosted integration works. Mermaid source must be rendered before Word/PDF submission. Relationships are application-enforced references, not SQL foreign keys.

## Figure D1. High-level system architecture

```mermaid
flowchart TB
    Customer[Customer]
    Workshop[Workshop]
    Admin[Administrator]
    Client[React Native and Expo client]
    Web[Expo Web bundle on Netlify hosting target]
    Auth[Firebase Authentication]
    API[Express API on existing Render hosting target]
    DB[(Cloud Firestore)]
    Storage[(Supabase Storage)]
    Foundry[Existing PimpPilot saved agent in Microsoft Foundry]
    Gemini[Explicit Gemini alternative provider]
    Customer --> Client
    Workshop --> Client
    Admin --> Client
    Web --> Client
    Client -->|Sign in and email verification| Auth
    Auth -->|ID token| Client
    Client -->|Bearer token and HTTPS requests| API
    API -->|Revocation-aware token verification| Auth
    API -->|Server SDK domain reads and transactions| DB
    Client -->|Own-profile reads under client rules| DB
    API -->|Privileged server storage adapter| Storage
    API -->|Selected Azure adapter only| Foundry
    API -->|Selected Gemini adapter only| Gemini
```

Azure and Gemini are alternative selections, not a fallback chain. Client rules additionally permit narrow published-post/bookmark operations; the current posts client primarily uses the authenticated API. The backend does not store uploads on Render disk. Netlify and Render are verified configuration targets; current deployed commit and end-to-end operation require separate confirmation. Sources: `backend/server.cjs`, `backend/services.cjs`, `backend/ai-provider-selection.cjs`, `src/shared/services/firebase.js`, `firestore.rules`, `render.yaml`, `.netlify/netlify.toml`.

## Figure D2. Actor and use-case model

Mermaid flowchart notation approximates a UML use-case diagram; actors and system responsibilities are explicit, but this is not a claim of native UML notation support.

```mermaid
flowchart LR
    C[Customer]
    W[Approved workshop]
    A[Administrator]
    subgraph System[PimpMyRide application use cases]
        Auth([Authenticate and maintain session])
        Garage([Manage own Garage])
        Discover([Discover workshops and showcases])
        Request([Create and manage service requests])
        Quote([Prepare and manage quotations])
        Compare([Compare and explicitly select quotation])
        Booking([Manage authorised bookings and simulated payments])
        Chat([Exchange authorised private messages])
        Posts([Publish own workshop showcases])
        AI([Review PimpPilot draft assistance when available])
        Studio([Prepare Studio concept when available])
        Review([Review workshop applications and documents])
        Manage([Manage permitted accounts and categories])
        Audit([Inspect audit activity and presence])
    end
    C --> Auth
    W --> Auth
    A --> Auth
    C --> Garage
    C --> Discover
    C --> Request
    C --> Compare
    C --> Booking
    W --> Booking
    C --> Chat
    W --> Chat
    W --> Quote
    W --> Posts
    C --> AI
    W --> AI
    C --> Studio
    A --> Review
    A --> Manage
    A --> Audit
```

Pending workshops use the Account/onboarding state rather than the approved marketplace navigator. Admin accounts cannot self-register. Sources: `src/navigation/AppNavigator.js`, `src/navigation/landingRoute.js`, the three role navigators, `backend/services.cjs` and `backend/marketplace.cjs`.

## Figure D3. Service Request → Quotation → Booking activity

```mermaid
flowchart TD
    Start([Customer owns an active vehicle]) --> Request[Submit validated open or direct service request]
    Request --> Eligible{Approved workshop may view request?}
    Eligible -->|No| Deny[Do not disclose request]
    Eligible -->|Yes| Quote[Submit itemised ZAR quotation for current terms version]
    Quote --> Inspect[Customer inspects available quotes and optional comparison]
    Inspect --> Select{Customer explicitly selects a current quotation?}
    Select -->|No| Inspect
    Select -->|Yes| Gate{Backend mock-payment capability enabled?}
    Gate -->|No| Block[Acceptance blocked with honest unavailable state]
    Gate -->|Yes| Verify[Transaction checks owner, offer expiry, revision and related entities]
    Verify --> Choice{Payment choice}
    Choice -->|Full or deposit simulation| Pending[Booking pending_payment and simulated attempt pending]
    Pending --> Outcome{Customer confirms simulated outcome}
    Outcome -->|Failure| Retry[Failed attempt; explicit retry required]
    Retry --> Pending
    Outcome -->|Success| Await[Booking pending_confirmation]
    Choice -->|Pay in store| Await
    Await --> Confirm[Selected workshop confirms future appointment]
    Confirm --> Service[Booking confirmed; service not_started]
    Service --> Complete[Workshop marks service completed]
```

Payment, appointment and service states are separate. Pay in store starts as due, not paid. Cancellation and payment-balance actions exist but are omitted here for legibility; they are documented in the API reference. One booking ID is derived from the service-request ID. Sources: `backend/marketplace.cjs`, `backend/booking-domain.cjs`, `backend/mock-payment-gate.cjs`.

## Figure D4. Authentication and API request sequence

```mermaid
sequenceDiagram
    actor U as User
    participant C as Expo client
    participant F as Firebase Auth
    participant P as Own Firestore profile
    participant E as Express middleware
    participant S as Domain service
    U->>C: Submit email and password
    C->>F: Sign in through isolated Auth instance
    F-->>C: Temporary authenticated user
    C->>P: Read own profile from server
    C->>C: Check verified email, profile, status and role
    C->>F: Adopt eligible user into main session
    U->>C: Perform marketplace action
    C->>F: Obtain ID token
    C->>E: HTTPS request with Bearer token
    E->>F: verifyIdToken(token, true)
    E->>S: Verified identity and validated request envelope
    S->>F: Read current Auth user as required
    S->>P: Read authoritative role and account state
    S->>S: Check ownership, lifecycle and input
    S-->>C: Data envelope or safe error
```

Registration differs: `/api/profile` permits an authenticated unverified registrant to complete onboarding, but only `owner` or `shop` roles. A verified main session is still required for marketplace access. Sources: `src/features/auth/services/accounts.js`, `src/shared/services/api.js`, `backend/app.cjs`, `backend/services.cjs`.

## Figure D5. PimpPilot request and response sequence

```mermaid
sequenceDiagram
    actor U as Customer or approved workshop
    participant UI as PimpPilot interface
    participant API as Express AI service
    participant DB as Firestore
    participant AD as Selected provider adapter
    participant AZ as Existing Foundry saved agent
    U->>UI: Explicitly request draft assistance or Studio plan
    UI->>API: Firebase-authenticated bounded input
    API->>DB: Check account, categories or owned vehicle
    API->>API: Validate input, enabled state and concurrency lease
    alt Azure selected and enabled
        API->>AD: Static mode guidance and separate untrusted input
        AD->>AZ: Agent-bound Responses with store false and tools disabled
        AZ-->>AD: Provider output or compatibility error
        AD-->>API: Parsed response or sanitised failure
        API->>API: Validate successful output and drafting grounding
        API->>DB: Recheck relevant access and facts on success
        API-->>UI: Validated suggestion or error
    else Disabled service
        API-->>UI: Unavailable; no successful output fabricated
    end
    UI-->>U: Review, refine, dismiss or explicitly apply
```

The successful Azure return path is implemented/mock-tested, not live-certified. Explicit Gemini selection uses its own adapter; an Azure failure does not invoke it. Draft assistance is text-only. Only Studio accepts inline validated JPEG input. Sources: `backend/ai-assist.cjs`, `backend/ai-studio.cjs`, `backend/ai-azure-provider.cjs`, `backend/ai-provider-selection.cjs`.

## Figure D6. Conceptual Firestore entity relationships

```mermaid
erDiagram
    USERS ||--o{ VEHICLES : owns
    USERS ||--o{ SERVICE_REQUESTS : creates
    VEHICLES ||--o{ SERVICE_REQUESTS : identifies
    SERVICE_CATEGORIES ||--o{ SERVICE_REQUESTS : classifies
    SERVICE_REQUESTS ||--o{ QUOTATIONS : receives
    USERS ||--o{ QUOTATIONS : workshop_issues
    SERVICE_REQUESTS ||--o| BOOKINGS : produces
    QUOTATIONS ||--o| BOOKINGS : accepted_terms
    BOOKINGS ||--o{ PAYMENT_ATTEMPTS : contains
    PAYMENT_ATTEMPTS ||--o| PAYMENT_RECEIPTS : success_records
    USERS ||--o{ POSTS : authors
    USERS ||--o{ SAVED_POSTS : contains
    POSTS ||--o{ SAVED_POSTS : bookmarked_by
    USERS ||--o{ DOCUMENTS : contains
    VEHICLES ||--o{ MARKETPLACE_PHOTOS : references
    SERVICE_REQUESTS ||--o{ CONVERSATIONS : contextualises
    CONVERSATIONS ||--o{ MESSAGES : contains
    USERS ||--o{ NOTIFICATIONS : receives
```

USERS combines customer, shop and admin profiles; a workshop is not a separate `workshops` collection. `PAYMENT_ATTEMPTS`, `SAVED_POSTS`, `DOCUMENTS` and `MESSAGES` are nested collection concepts. Auxiliary heads, upload ledgers and operation receipts are omitted from this conceptual diagram and listed in the database reference. Snapshot copies are intentional denormalisation. Sources: `backend/services.cjs`, `backend/marketplace.cjs`, `backend/posts.cjs`, `backend/messaging.cjs`, `backend/documents.cjs`, `backend/photos.cjs`.

## Figure D7. Private-media data flow

```mermaid
flowchart LR
    Device[User-selected local file] --> Validate[Client preparation and basic checks]
    Validate --> API[Authenticated upload API]
    API --> Access[Role, ownership, revision and byte validation]
    Access --> Ledger[(Firestore upload intent ledger)]
    Access --> Object[(Private Supabase object)]
    Object --> Reference[(Firestore metadata with bucket and path)]
    Viewer[Authorised viewer] --> Read[Authenticated view request]
    Read --> Check[Recheck relationship and image membership]
    Check --> Signed[Transient signed URL, normally 60 seconds]
    Signed --> Viewer
```

New signed URLs are not persisted as media identity. Legacy public-post references are compatibility paths, not a reason to make new buckets public. Sources: `backend/storage.cjs`, `backend/photos.cjs`, `backend/posts.cjs`, `backend/profile-photos.cjs`.

## Figure D8. Studio customer activity and trust boundary

```mermaid
flowchart TD
    Discover[Discover Studio launch] --> Landing[Studio landing]
    Landing --> Garage[Choose own active Garage vehicle]
    Existing[Existing Garage vehicle action] --> Workspace
    Garage --> Workspace[Interests, optional instructions and local photo]
    Workspace --> Analyse{Explicit analysis action}
    Analyse -->|Unavailable or invalid| Preserve[Keep local input and show retry]
    Preserve --> Workspace
    Analyse -->|Validated real response| Plan[AI proposal cards and assumptions]
    Plan --> Refine[Refine using last six turns]
    Refine --> Analyse
    Plan --> Select[Select proposed work]
    Select --> Preview[Review draft under description limit]
    Preview --> Confirm{Confirm transfer?}
    Confirm -->|No| Plan
    Confirm -->|Yes| Draft[Existing unsaved Service Request form]
    Draft --> Submit[Customer separately reviews and submits normal form]
```

The selected original photo is displayed without edits; AI image editing is unavailable. No automatic marketplace submission is hidden in analysis or transfer. Sources: `src/features/marketplace/screens/PimpPilotStudioScreen.js`, `src/features/marketplace/components/StudioUI.js`, `src/features/marketplace/services/pimpPilotStudio.js`, `src/features/marketplace/screens/OwnerMarketplaceScreens.js`.

## Diagram review and export checklist

Render each fenced block with a Mermaid-capable editor. Check actor labels, arrow direction, wrapping and grayscale legibility. Export diagrams as SVG or high-resolution PNG for Word, then assign captions using Word's caption feature. Preserve these text sources as Appendix B. Diagrams deliberately exclude credentials, project-specific endpoints, personal records and live signed URLs. No renderer package was installed and no rendered-image validation was performed during this documentation-only task.

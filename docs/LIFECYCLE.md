# AXIUS Lead Engine & CRM — End-to-End Lifecycle

How a record travels from a cold target to a delivered, paying client. The **Lead Engine** generates and warms demand; the **CRM** closes it and runs delivery on one immutable **Engagement ID** (= the lead id).

```mermaid
flowchart TD
    START(["Sign in · Admin 2-gate / Rep PIN"]) --> SRC

    subgraph LE["LEAD ENGINE"]
        direction TB
        subgraph ACQ["Acquire"]
            SRC{"Source"}
            SRC -->|"Scraper: country → city →<br/>neighborhood → category"| RAW["Raw leads"]
            SRC -->|"CSV import (auto field-map)"| RAW
            SRC -->|"Manual add"| RAW
            SRC -->|"Scheduled state campaigns"| RAW
            RAW --> ENR["AI owner-name enrichment<br/>+ lead scoring"]
            ENR --> NEW(["Lead · status: New"])
        end
        subgraph ENG["Engage"]
            CAD["Outreach cadence · Resend<br/>1st touch + 3 follow-ups"]
            CAD --> INB["Inbound reply · SMS/WhatsApp/Email<br/>→ speed-to-lead alert"]
            INB --> AIR["AI replies · Gemini<br/>(brand playbook, opt-out aware)"]
            AIR --> CALL["Call · Twilio VoIP<br/>record → Drive → Gemini transcript"]
        end
        NEW --> CAD
        CALL --> QUAL{"Qualified?"}
    end

    QUAL -->|"No"| LOST["Closed Lost / Do Not Call<br/>release closer + cancel commission + stop residuals"]
    QUAL -->|"Yes · discovery call<br/>(+ Google Meet transcript ingest)"| PIPE

    subgraph CRM["CRM"]
        direction TB
        PIPE["Pipeline · New → Contacted → Interested"]
        PIPE --> AUD["AI Audit from transcript<br/>→ archived to Drive + emailed"]
        AUD --> ROAD["AI quarterly roadmap · operator approves"]
        ROAD --> WON["Closed Won<br/>capture deal value + setter"]
        WON --> COMM["Commission · pending<br/>closer cut + setter per-close cut"]
        COMM --> EID[["Engagement auto-created<br/>Engagement ID = lead id"]]
        EID --> CP["Client close page · close.html"]
        CP --> SIGN["MSA e-sign · typed name + timestamp"]
        CP --> PAY["Stripe subscription Checkout"]
        PAY --> WH{"Stripe webhook: paid?"}
        SIGN --> GATE
        WH -->|"paid"| GATE
        GATE{"GATE A<br/>won + paid +<br/>roadmap-approved + MSA-signed"}
        GATE -->|"not yet"| CP
        GATE -->|"all 4 signals"| PROV["Provision · Discord workspace +<br/>Drive folder (ACWA template) +<br/>founding docs + Project Registry"]
        PROV --> DEL["Delivery sync · bot artifacts → client Drive"]
        DEL --> RES["Ongoing: monthly residuals + setter<br/>volume bonuses · commissions marked paid"]
    end

    OPS[/"Operate · Analytics · Admin (team, per-person comp plans,<br/>commission ledger, audit log) · Profile"/]
    SYNCL[/"Data · localStorage ⇄ syncNow ⇄ Apps Script ⇄ Google Sheets"/]
    KILL[/"Sales kill switch — pauses cadence + AI replies + scraping;<br/>never touches payouts or client delivery"/]
    KILL -.->|"gates"| CAD
    KILL -.->|"gates"| AIR
    KILL -.->|"gates"| SRC
```

## External systems by stage
| Stage | Systems |
|---|---|
| Acquire | Google Places API · Gemini (owner enrichment) |
| Engage | Resend (email cadence) · Twilio (calls/SMS/WhatsApp) · Gemini (AI replies, transcription) |
| Close | Google Drive (audit/MSA archive) · Stripe (subscription + webhook) |
| Provision | Discord bot (`bot.axius.tech`) · Google Drive · Project Registry (Google Sheet) |
| Throughout | Google Apps Script ⇄ Google Sheets (system of record) |

## Invariants the flow guarantees
- **One Engagement ID** (= the lead id) carries the record from Closed Won through delivery — no re-keying.
- **Gate A** needs all four signals (won + paid + roadmap-approved + MSA-signed); the close page loops until then, and provisioning only fires once.
- **Money is server-authoritative**: close-page amounts come from the tier, and the Stripe webhook (own token, re-fetched event) is the only trusted "paid" signal.
- **Closed Lost / DNC** always releases the closer, cancels the pending commission, and stops residuals — single-lead, pipeline, and bulk paths included.
- **The kill switch** pauses only outbound activity (scraping, cadence, AI replies); payouts and client delivery keep running.

## Plain-text sequence (fallback)
```
Sign in → Acquire (scrape / import / campaign → enrich → score → Lead:New)
  → Engage (cadence → inbound → AI reply → call/transcript) → Qualified?
     → No  → Closed Lost / DNC (release + cancel)
     → Yes → Pipeline → AI Audit → AI Roadmap → Closed Won (deal + setter)
            → Commission pending → Engagement created
            → Close page (MSA e-sign + Stripe pay → webhook paid)
            → GATE A (won+paid+roadmap+MSA)
               → Provision (Discord + Drive ACWA + Registry)
               → Delivery sync → ongoing residuals + bonuses + paid commissions
```

# DataVers Drawing QA Agent — IT Compliance & Security Report

**Product:** DataVers Drawing Intelligence (On-Premises)
**Module:** Engineering Drawing QA Agent
**Version:** 1.0 — Compliance Assessment Draft
**Classification:** CONFIDENTIAL — For Customer IT/Security Review

---

## PART 1 — CUSTOMER DISCOVERY QUESTIONNAIRE

> These questions must be answered by the customer's IT/Security team before deployment.
> Responses directly determine the deployment architecture and compliance posture.

---

### Section A — Data Classification & Sensitivity

| # | Question | Customer Response |
|---|----------|------------------|
| A1 | What classification levels apply to your engineering drawings? (e.g., Proprietary, Confidential, CUI, ITAR-controlled, EAR-controlled) | |
| A2 | Do any drawings contain defense or government contract data subject to DFARS 252.204-7012 or CMMC requirements? | |
| A3 | Are drawings subject to export control regulations (ITAR / EAR / EU Dual-Use)? Which jurisdictions? | |
| A4 | What is the data residency requirement — must data remain within a specific country, facility, or air-gapped network? | |
| A5 | Do you handle drawings from multiple customers/projects that must be logically isolated from each other? | |
| A6 | Are there retention and destruction schedules for drawing files? (e.g., delete after 90 days, 7-year archive) | |
| A7 | Who currently has access to drawing files? (roles, teams, third-party contractors) | |

---

### Section B — Current IT Infrastructure

| # | Question | Customer Response |
|---|----------|------------------|
| B1 | Describe your network topology: air-gapped, private intranet, hybrid, or internet-connected? | |
| B2 | What operating systems are in use on drawing workstations and servers? (Windows Server version, RHEL, Ubuntu LTS?) | |
| B3 | What is your existing identity provider? (Active Directory / LDAP / Azure AD / Okta / SAML 2.0 / None) | |
| B4 | Do you have an existing PKI / certificate authority for TLS within your intranet? | |
| B5 | What virtualization or container platform is available? (VMware, Hyper-V, Docker, Kubernetes, bare metal) | |
| B6 | What are the hardware specs of the server(s) designated for this deployment? (CPU cores, RAM, GPU availability, storage) | |
| B7 | Is there an existing file storage system the tool should integrate with? (NAS, SMB share, SharePoint on-prem, PDM/PLM system like SolidWorks PDM, PTC Windchill, Teamcenter?) | |
| B8 | Do you have a SIEM or log aggregation system? (Splunk, Elastic, QRadar, Windows Event Forwarding?) | |
| B9 | What is your existing backup and disaster recovery solution? | |
| B10 | Are there firewall or proxy rules that would block outbound internet access from the server? | |

---

### Section C — Current AI / OCR / ML Models in Use

| # | Question | Customer Response |
|---|----------|------------------|
| C1 | Are you currently using any OCR solution for drawings? (Tesseract, ABBYY FineReader, Adobe Acrobat, custom?) | |
| C2 | Do you use any local LLM or ML inference engine today? (Ollama, llama.cpp, LM Studio, vLLM, ONNX Runtime, TensorRT?) | |
| C3 | What LLM models are approved or preferred? (Llama 3, Mistral, Phi-3, Gemma, Qwen, or others?) | |
| C4 | Do you have GPU hardware available for ML inference? If yes, what GPU model and VRAM? | |
| C5 | Is there a policy against running cloud AI APIs (OpenAI, Anthropic, Google AI) for document processing? | |
| C6 | Have you evaluated or deployed any existing drawing QA automation? What were the gaps? | |
| C7 | Are there approved ML model registries or model signing requirements for models loaded on your servers? | |

---

### Section D — Compliance Frameworks & Certifications

| # | Question | Customer Response |
|---|----------|------------------|
| D1 | Which compliance frameworks apply to your organization? (ISO 27001, SOC 2 Type II, NIST 800-171, CMMC Level 2/3, IEC 62443, AS9100, IATF 16949?) | |
| D2 | Do you require the vendor (DataVers) to hold any certifications before deployment? | |
| D3 | Do you require a penetration test report or vulnerability assessment of the software? | |
| D4 | Is a Software Bill of Materials (SBOM) required for all deployed software components? | |
| D5 | Do you require source code escrow or a right-to-audit clause? | |
| D6 | What is your vulnerability disclosure and patch SLA requirement? (e.g., Critical: 24h, High: 7 days) | |
| D7 | Do you require data processing agreements (DPA) or BAA-style contractual controls with vendors? | |

---

### Section E — Access Control & Authentication

| # | Question | Customer Response |
|---|----------|------------------|
| E1 | Is multi-factor authentication (MFA) required for all internal tools? | |
| E2 | Should the Drawing QA Agent enforce role-based access control (RBAC)? What roles are needed? (Viewer, Reviewer, QA Engineer, Admin) | |
| E3 | Do you require audit logs of every user action — who opened which drawing, when, what QA checks were run? | |
| E4 | Is single sign-on (SSO) via SAML 2.0 or OIDC required? | |
| E5 | Should sessions auto-expire? What is the idle timeout policy? | |
| E6 | Is privileged access management (PAM) in place — are admin credentials vaulted? | |

---

### Section F — Network & Data-in-Transit Security

| # | Question | Customer Response |
|---|----------|------------------|
| F1 | Is TLS 1.2 minimum required for all internal service-to-service communication? | |
| F2 | Do you require mutual TLS (mTLS) for API calls between services? | |
| F3 | What cipher suites are approved by your security policy? | |
| F4 | Are there network segmentation requirements? (Should the QA agent be in a DMZ, isolated VLAN, or specific subnet?) | |
| F5 | Do you require a Web Application Firewall (WAF) in front of the tool? | |

---

### Section G — Data-at-Rest Security

| # | Question | Customer Response |
|---|----------|------------------|
| G1 | Is encryption-at-rest required for all drawing files and extracted data? What key length? (AES-256 minimum?) | |
| G2 | Who manages encryption keys — customer-managed keys (CMK) or vendor-managed? | |
| G3 | Is Hardware Security Module (HSM) integration required for key storage? | |
| G4 | Are temporary/intermediate files (SVG conversions, extraction caches) subject to the same encryption requirements? | |
| G5 | Must drawing files be purged from the system after QA review is complete? How quickly? | |

---

### Section H — Incident Response & Business Continuity

| # | Question | Customer Response |
|---|----------|------------------|
| H1 | What is your incident response plan for a data breach involving drawing files? | |
| H2 | What is your RTO (Recovery Time Objective) and RPO (Recovery Point Objective) for this tool? | |
| H3 | Is high availability / failover required? (Active-Active, Active-Passive?) | |
| H4 | Should the tool function in a fully offline/disconnected mode with no internet dependency? | |

---

## PART 2 — DATAVERS DRAWING QA AGENT: SECURITY ARCHITECTURE

> How DataVers addresses each concern — to be filled in and customized based on Part 1 responses.

---

### 2.1 Deployment Model

```
┌────────────────────────────────────────────────────────────┐
│                  CUSTOMER INTRANET / AIR-GAP               │
│                                                            │
│  ┌─────────────┐    ┌──────────────┐   ┌───────────────┐  │
│  │  Engineer   │───▶│  DataVers    │──▶│  Local LLM /  │  │
│  │  Workstation│    │  QA Agent    │   │  OCR Engine   │  │
│  └─────────────┘    │  (Docker /   │   │  (Ollama /    │  │
│                     │  bare metal) │   │  Tesseract /  │  │
│  ┌─────────────┐    └──────┬───────┘   │  PyMuPDF)     │  │
│  │  PDM / PLM  │           │           └───────────────┘  │
│  │  (Windchill,│◀──────────┘                              │
│  │   Teamcenter│    ┌──────────────┐                      │
│  └─────────────┘    │  Customer    │                      │
│                     │  Identity    │                      │
│                     │  Provider    │                      │
│                     │  (AD/LDAP)   │                      │
│                     └──────────────┘                      │
│                                                            │
│  ✗ ZERO outbound internet calls  ✗ No cloud AI APIs        │
└────────────────────────────────────────────────────────────┘
```

**Key principle:** DataVers Drawing QA Agent is designed as a **network-isolated, self-contained unit**. No drawing data, metadata, or inference results ever leave the customer's network boundary.

---

### 2.2 Data Security Controls

| Control | DataVers Implementation | Standard Mapped |
|---------|------------------------|-----------------|
| **No cloud transmission** | All PDF/SVG processing runs on-prem via PyMuPDF + pdftosvg.exe. Zero external API calls for document content. | NIST 800-171 §3.13.5, ITAR §120.33 |
| **Encryption at rest** | AES-256 encryption for all drawing files, extraction cache, and QA results database | ISO 27001 A.10.1 |
| **Encryption in transit** | TLS 1.3 enforced for all browser↔API and service↔service communication | NIST 800-52 Rev 2 |
| **Temporary file purge** | Configurable auto-deletion of intermediate SVG/extraction files (default: session-end or N minutes) | CMMC AC.3.018 |
| **Audit logging** | Immutable audit trail: who accessed which drawing, what QA checks ran, what findings were flagged, timestamps | SOC 2 CC6.1, ISO 27001 A.12.4 |
| **RBAC** | Role-based access: Viewer / QA Reviewer / QA Engineer / Admin. Configurable per project/drawing set. | NIST 800-171 §3.1.1 |
| **SSO Integration** | SAML 2.0 / OIDC connector — plugs into Active Directory, Okta, Azure AD on-prem | ISO 27001 A.9.4 |
| **No persistent secrets** | Service credentials stored in customer-managed vault (HashiCorp Vault, Windows DPAPI, or env-file with restricted permissions) | CIS Control 16 |

---

### 2.3 Local AI / OCR Stack (No Cloud Dependency)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| PDF → SVG conversion | `pdftosvg.exe` (PdfToSvg.NET, MIT licensed) | Vector extraction, runs fully local |
| Vector analysis | PyMuPDF (AGPL / commercial license) | Table detection, geometry analysis |
| Text extraction | pdfplumber (MIT) | Text layer, dimensions, tolerances |
| OCR fallback (scanned drawings) | Tesseract 5 (Apache 2.0) — **local, no cloud** | Rasterized drawing text recognition |
| QA reasoning (optional) | Ollama + Llama 3 / Mistral / Phi-3 — **runs on customer GPU/CPU** | Natural-language QA checks, anomaly description |
| Table structure | PyMuPDF vector line detection (no ML model) | BOM, title block, revision table parsing |

> **Customer action required:** Confirm approved local LLM model from Section C above. DataVers supports any GGUF-format model via Ollama or llama.cpp, or ONNX models via ONNX Runtime.

---

### 2.4 QA Agent Functional Security

The Drawing QA Agent performs the following checks — all computed locally:

| QA Check | Method | Data Sensitivity |
|----------|--------|-----------------|
| Title block completeness | pdfplumber text extraction | Drawing metadata only |
| Revision table validation | PyMuPDF table detection | Rev history only |
| BOM cross-reference | Vector + text extraction | Part numbers, quantities |
| Tolerance & dimension consistency | Text parsing + rule engine | Dimensional data |
| GD&T symbol recognition | SVG path pattern matching | Geometric tolerances |
| Missing views detection | Page geometry analysis | Layout only |
| Drawing standard compliance (ISO/ASME) | Rule-based checks | Standards metadata |
| Anomaly / defect flagging (LLM-assisted) | Local LLM — no cloud call | Drawing content (stays on-prem) |

---

### 2.5 Software Supply Chain Security

| Concern | DataVers Response |
|---------|------------------|
| **SBOM** | Full Software Bill of Materials provided (SPDX 2.3 format) listing all open-source dependencies with license and CVE status |
| **Dependency scanning** | npm audit + pip-audit run in CI/CD pipeline; results provided on request |
| **Container signing** | Docker images signed with Sigstore/Cosign; customer can verify before deployment |
| **No telemetry** | Zero analytics, crash reporting, or usage telemetry phoned home |
| **Air-gap installable** | Full offline installation bundle — no `npm install` or `pip install` from internet during deployment |
| **Patch cadence** | Security patches: Critical ≤48h, High ≤7 days, Medium ≤30 days |

---

### 2.6 Compliance Framework Mapping

| Framework | Relevant Controls | DataVers Coverage |
|-----------|------------------|------------------|
| **NIST 800-171** | 3.1 (Access), 3.4 (Config Mgmt), 3.13 (Comms Protection) | RBAC, TLS 1.3, no-cloud architecture |
| **CMMC Level 2** | AC.2.006, AU.2.042, IA.3.083, SC.3.177 | RBAC, audit logs, MFA-ready, encryption |
| **ITAR §120.33 (CUI)** | Technical data must not leave controlled environment | Fully on-prem, no cloud transmission |
| **ISO 27001:2022** | A.5 (Policies), A.8 (Asset), A.9 (Access), A.10 (Crypto), A.12 (Operations) | Encryption, RBAC, audit trail, secure delete |
| **SOC 2 Type II** | CC6 (Logical Access), CC7 (System Operations), CC9 (Risk Mitigation) | SSO, audit logging, incident response hooks |
| **GDPR / Data Privacy** | Art. 25 (Privacy by Design), Art. 32 (Security of Processing) | No cloud, encryption, data minimization |
| **AS9100 / IATF 16949** | Design record control, revision traceability | QA audit trail tied to drawing revision |

---

## PART 3 — OPEN QUESTIONS & GAPS

> Items requiring customer confirmation before final compliance posture can be established.

| # | Open Item | Priority |
|---|-----------|----------|
| OQ1 | ITAR/EAR applicability — if drawings are controlled, a formal technology control plan (TCP) may be required before any third-party software touches them | CRITICAL |
| OQ2 | GPU availability — local LLM QA reasoning requires ≥8GB VRAM for 7B models, or CPU-only fallback available (3–10× slower) | HIGH |
| OQ3 | PLM/PDM integration — does QA agent need write-back access to Windchill/Teamcenter, or read-only with QA results exported as PDF/CSV? | HIGH |
| OQ4 | Scanned drawing support — OCR (Tesseract) handles raster PDFs, but accuracy degrades for low-DPI scans. What is the expected % of scanned vs. native CAD drawings? | MEDIUM |
| OQ5 | Multi-tenant isolation — if multiple projects/customers share one server, row-level security and separate encryption keys per project are required | MEDIUM |
| OQ6 | Offline model distribution — what is the approved channel for receiving model updates? (USB, internal artifact repo, signed package?) | MEDIUM |

---

## PART 4 — NEXT STEPS

```
Phase 1 — Discovery (Week 1-2)
  □ Customer completes Part 1 questionnaire
  □ IT architecture review call with DataVers solutions engineer
  □ Identify applicable compliance frameworks (D1–D3)

Phase 2 — Architecture Design (Week 2-3)
  □ DataVers produces customer-specific deployment architecture diagram
  □ Confirm local LLM/OCR stack (Section C responses)
  □ Define RBAC roles and SSO integration plan
  □ Network topology and firewall rule specification

Phase 3 — Security Assessment (Week 3-4)
  □ DataVers delivers SBOM and dependency vulnerability report
  □ Pen test scope agreed (black-box or grey-box)
  □ Data classification and handling procedure documented

Phase 4 — Pilot Deployment (Week 4-6)
  □ Air-gap installation on customer test server
  □ Integration with customer IdP (AD/LDAP/SAML)
  □ QA agent validation on 10 sample drawings
  □ Audit log review with customer security team

Phase 5 — Compliance Sign-off (Week 6-8)
  □ Customer IT sign-off on deployment architecture
  □ DPA / data processing agreement executed
  □ IT compliance report finalized and signed
  □ Production go-live
```

---

*Document prepared by: DataVers Engineering*
*Last updated: 2026-04-18*
*Status: DRAFT — Pending customer questionnaire responses*

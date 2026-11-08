# IMDX 2027 — Backend & Operational Portal

Source: IMDX Product Requirements Document v1.4 (8 November 2026). This repository is being initialized as the **dynamic application** for secure customer accounts, CMS, booking approval, manual transfer billing, floorplan management, QR admission and reporting.

**STATUS: DEVELOPMENT ONLY / NOT DEPLOYED.** No customer registration, payment, or admission is currently live. Do not collect real personal information, issue invoices or admit attendees until the operational and security release checklist is completed.

## Fundamental rules

- NO Midtrans, payment gateway, embedded checkout, QRIS payment or webhook-based automatic settlement.
- Only FINANCE / authorized CMS staff may confirm actual bank transfers.
- Customer-selected booth positions are preferences, not holds or allocations.
- QR admission validates an opaque server-issued pass in the protected CMS, never on public GitHub Pages.
- Never commit credentials or approved bank details to this repository.

The existing [static marketing demo](https://github.com/saohdir/mining-expo-2027-demo) remains a **separate concept prototype**.

Implementation details, setup and feature readiness are tracked in `docs/IMPLEMENTATION_STATUS.md`.

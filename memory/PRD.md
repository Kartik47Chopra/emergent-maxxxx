# PRD — MAXX DOORS Production Tracker

## Original problem statement
"make me a website for this and host it and give me the link, make the best website possible" — attached: "MAXX DOORS – Basic Scope" PDF describing a door-manufacturing workflow: part number creation → core → skin → assembly → press → routing/QC → despatch, with office tracking. User confirmed: all screens wanted, 5 Android tablets on machines (Core, Skin, Assembly, Press, Routing), login with roles (office vs factory operators), branding: agent's choice.

## Architecture
- Frontend: React (CRA/craco), Tailwind, framer-motion, lenis, @phosphor-icons/react, @tanstack/react-query, sonner
- Backend: FastAPI + Motor (MongoDB), JWT auth (httpOnly cookies, bcrypt), role + station-based guards
- DB: MongoDB via MONGO_URL/DB_NAME; collections: users, jobs, doors, login_attempts
- Design: dark industrial "Deep Obsidian + Safety Amber", Chivo / IBM Plex Sans / IBM Plex Mono, blueprint grid, hazard stripes, kinetic masked-reveal login

## User personas
- Office staff: create jobs/part numbers, release to factory, track every door live, mark despatch
- Factory operators (5 tablets): tick off cutting lists, verify barcodes, photo at assembly, QC pass/fail at routing

## Core requirements (static)
1. Office creates jobs with door part-number data (floor, location, dims, fire rating, core/skin cutting lists)
2. Jobs released whole or staggered; operators only see released work
3. Core & Skin stations tick line items, batch complete, print Door ID stickers
4. Assembly: input Door ID, verify core+skin barcodes, upload photo, complete
5. Press: complete → label printed
6. Routing: verify dimensions, QC pass/fail with notes, final barcode, despatch note per floor
7. Office tracking: per-floor table or Door ID search with per-stage statuses + uploads

## Implemented (2026-08-16)
- JWT auth: office + 5 station operator accounts, brute-force lockout, refresh tokens
- Jobs API + door part-number entry (20 fields per door), draft → release flow
- Station queues with precondition enforcement (assembly needs core+skin, press needs assembly, etc.)
- Batch complete for core/skin/press; sticker/label modals with barcode + window.print()
- Assembly photo upload (base64) enforced before completion; photo viewable from office dashboard
- Routing QC pass/fail (notes required on fail), despatch marking, printable despatch note per floor
- Live office dashboard: stats bento, floor filters, Door ID search, per-stage status pills, 6s auto-refresh
- Seed job "Riverside Gate - Tower A" (12 doors, mixed stages matching the PDF example)
- Cinematic login (split-screen sparks hero, masked line reveal, marquee), dark control-room office UI, tablet-optimized station UIs (h-20+ touch targets)

## Verified
- Full chain via curl: login (all roles) → core/skin batch complete → wrong-station 403 → assembly photo enforcement → press → QC pass/fail (+notes required) → despatch → despatch note
- Screenshots: login, office dashboard (live data, despatch buttons), core station (tick + batch), assembly (door load + core/skin verify)

## Backlog
- P0: Real barcode scanning via device camera; real printer integration (currently browser print)
- P1: Batch definitions assigned by office (door type / dimension grouping), staggered batch release
- P2: Attachments on part numbers (shop drawings, data sheets), rework loop after QC fail, operator performance metrics, offline tolerance for tablets

## Next tasks
1. Camera-based barcode scanning at assembly/routing
2. Office-defined batches with assignment
3. File attachments per door (PDFs/drawings)
4. Multi-job floor views + filters per job

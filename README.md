# 3D Print Tracker

A desktop application for tracking 3D printing projects, parts, filament colours and inventory — built with Electron for Windows.

---

## Features

### Products & Parts
- Organise parts under products with category grouping
- Track status per part: **planning → queue → printing → done**
- Products automatically promoted through fixed sections: **Printing → Commenced → Ready to Build**
- Sub-parts with their own status and printed count
- Multi-colour filament tracking per part with colour swatches
- Inline quantity editing directly on the part row
- Shiny variant flag (✨) for alternate colour versions
- Designer, source (N3D Membership / Thangs / MakersWorld / Other) and description per product
- Expand / collapse all products per category section
- Category reordering in Settings reflects directly on the main screen
- Main screen search — filter by product name, category or part name

### 3MF File Management
- Upload pre-sliced .3MF files organised into per-product folders
- Mark files as **pre-sliced and ready to print** (green ✓ badge)
- Open product folder in Windows Explorer with one click
- Open .3MF files in Bambu Studio or Orca Slicer
- Bambu Studio version check — prompts if the slicer has been updated since last use
- Filter products by 3MF status

### N3D Melbourne API Integration
- Browse the full N3D Melbourne design catalogue inside the app
- Select all designs on the current page in one click
- Designs already in your tracker show an **in tracker** badge
- Import designs with filament colours, print times and thumbnails auto-filled
- Supports AMS, Split and MC print profiles
- Requires an active [N3D Melbourne membership](https://www.n3dmelbourne.com) and API key

### Inventory Tracking
- Dynamic storage locations — configure your own location names in Settings
- Log outgoing stock by configurable destinations (store, markets, website, etc.)
- **+ inv button** on every product card — opens a popup with qty picker and per-location storage split (can be toggled off in Settings)
- Inventory sections (storage split, outgoing log) are collapsible per card
- On Hand stat shown in the stats bar
- Archive completed products with restart-from-scratch option

### Colour View
- Groups all queued parts by filament colour
- See at a glance which colours to load for your next print run

### Mobile Companion
- Access and update inventory from your phone browser on the same WiFi network
- Large tap-friendly +/- buttons — no keyboard needed
- Collapsible **Log Outgoing** and **History** sections per card
- **Stocktake mode** — tap Stocktake in the header to switch into a location-filtered count view with +/- controls and search
- Real-time sync back to the desktop app
- Auto-retries if port 3000 is in use (tries up to 3010)

---

## Requirements

- Windows 10 or later
- [Node.js LTS](https://nodejs.org) — for building only

---

## Installation

### Option 1 — Download the installer
Download the latest `3D Print Tracker Setup 3.0.0.exe` from the [Releases](../../releases) page and run it.

### Option 2 — Build from source

```bash
# Clone the repository
git clone https://github.com/Hellrazor777/3d-print-tracker.git
cd 3d-print-tracker

# Install dependencies
npm install

# Dev mode — Vite dev server + Electron with hot reload
npm run dev

# Dev mode — browser only (no Electron)
npm run dev:web

# Build the Windows installer
npm run build
```

The installer will be at `dist/3D Print Tracker Setup 3.0.0.exe`.

---

## First-time Setup

1. **Set your 3MF folder** — click ⚙ Settings and choose a root folder for .3MF files. A subfolder is created automatically for each product.
2. **Set your slicer** — choose Bambu Studio or Orca Slicer in Settings. Set a custom path if installed in a non-default location.
3. **Configure storage locations** — go to Settings → Inventory to name your storage locations (e.g. Box, Shelf, Display).
4. **N3D API key** — if you have an N3D Melbourne membership, click **N3D browse** and enter your API key from [n3dmelbourne.com/dashboard/tools](https://www.n3dmelbourne.com/dashboard/tools?tab=api).

---

## Mobile Companion

1. Make sure your phone and PC are on the same WiFi network
2. Open the **Inventory** tab and click **show phone URL**
3. Type that URL into your phone's browser (e.g. `http://192.168.1.x:3000`)
4. Bookmark it to your home screen for quick access

**Accessing from outside your home network:** Install [Tailscale](https://tailscale.com) (free) on both your PC and phone. Once connected, your phone can reach the companion app from anywhere — no code changes or port forwarding needed.

---

## Data Location

Your data is stored locally on your PC:

| File | Location |
|------|----------|
| App data | `C:\Users\<Name>\AppData\Roaming\3d-print-tracker\data.json` |
| Settings | `C:\Users\<Name>\AppData\Roaming\3d-print-tracker\settings.json` |

Back up these files to preserve your data across reinstalls.

---

## Tech Stack

- [Electron](https://www.electronjs.org/) v29 — desktop app framework
- [React](https://react.dev/) 18 + [Vite](https://vitejs.dev/) v5 — UI framework and build tool
- [electron-builder](https://www.electron.build/) — Windows installer packaging
- Node.js `http` / `https` — local mobile server and N3D API proxy

---

## Changelog

### v3.0.0
- **React/Vite migration** — renderer rewritten in React 18 + Vite v5; modular component/view/modal structure
- **Delete part** — ✕ button removes immediately with no confirmation dialog
- **Duplicate product warning** — adding a product with a name already in the tracker shows a confirmation overlay
- **Mobile: built count popup** — tap the built count row to open a delta sheet; delta resets to 0 each open, total accumulates
- **Mobile: stocktake storage fix** — location counts now correctly read from `item.storage` matching the desktop format
- **Mobile: log outgoing qty fix** — +/- buttons now update all visible qty displays correctly
- **Mobile: remote access** — works outside home network via Tailscale (no code changes needed)
- **Product workflow** — split active products into three fixed sections: Printing, Commenced, Ready to Build
- **Main screen search** — filter products by name, category or part name from the filter bar
- **+ inv button** — quick-add to inventory from any product card with qty picker and storage split popup; toggle visibility in Settings
- **Inventory popup** — per-location +/- controls with auto-fill of last location when total qty changes
- **N3D browser** — Select All on page button; already-imported designs show an "in tracker" badge
- **Category reordering** — drag order in Settings with ↑/↓ buttons; updates main screen immediately
- **Expand/collapse all** — per-category section button to expand or collapse all product cards at once
- **Back to top button** — fixed button appears after scrolling down
- **On Hand stat** — added to the stats bar
- **4:3 product card images** — thumbnail aspect ratio updated
- **Bambu Studio version check** — detects slicer updates before opening files
- **Collapsible inventory card sections** — storage split and outgoing log toggleable per card
- **Mobile: collapsible History** — tap the History heading to collapse past outgoing entries
- **Mobile: collapsible Outgoing** — tap Log Outgoing to collapse/expand the send form
- **Mobile: Stocktake mode** — location-filtered count view with search and +/- per item
- **Mobile server auto-retry** — if port 3000 is taken, tries 3001–3010 automatically; phone URL always shows the right port
- **Status badges** — brighter, more vivid colours with solid borders for better readability
- N3D references updated from Patreon to N3D website membership

### v2.1.0
- Capitalised all toolbar buttons, tab labels and stat headings
- Renamed "rename" to "Manage" — now includes delete product option
- Theme toggle in Settings: Auto / Light / Dark with persistent preference
- Category manager in Settings — add, rename and delete categories globally
- Pre-sliced 3MF flag with green ✓ badge and dedicated filter
- Fixed N3D website link URL (/design/ not /designs/)
- Designer and source fields added to product details
- Custom app icon (3D printer)

### v2.0.0
- Category grouping with collapsible sections
- In-progress section floats to top of Products view
- Planning status added to the workflow
- Colour tab groups queued parts by filament colour
- Sub-parts with individual qty, count and status
- Product image / icon support with N3D auto-download
- N3D website link per product
- Mobile companion inventory app
- Inventory with box/shelf split and outgoing distribution log
- Archive with restart-from-scratch while keeping history
- Settings panel for 3MF folder and slicer paths

### v1.0.0
- Initial release

---

## License

MIT — free to use, modify and distribute.
